import { Router, Request, Response } from "express";
import { readFile, cp } from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import * as crypto from "crypto";
import sharp from "sharp";
import {
  ensureDir,
  getProjectFilePath,
  loadConfig,
  safeWriteFile,
} from "../backup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_EXPORT_FOLDER = join(__dirname, "..", "..", "exports");
const CLIENT_LIB_DIR = join(__dirname, "..", "..", "..", "client", "lib");

/** Convert a project name to kebab-case for the export folder. */
function toKebabCase(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase boundaries
    .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanum to hyphens
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .toLowerCase();
}

/** Convert a project name to PascalCase for the class name. */
function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

// Compact format types (minimal for export - matches project JSON on disk)
type CompactPixelData = [number, number, number] | 0;

interface CompactLayer {
  id: string;
  name: string;
  pixels: CompactPixelData[][];
  visible: boolean;
  isVariant?: boolean;
  variantGroupId?: string; // on-disk field name (maps to variantLayerId in export)
  selectedVariantId?: string;
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  variantOffset?: { x: number; y: number };
}

interface CompactFrame {
  id: string;
  name: string;
  layers: CompactLayer[];
}

interface CompactVariantFrame {
  id: string;
  layers: CompactLayer[];
}

interface CompactVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactVariantFrame[];
  baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } };
}

interface CompactVariantLayerInput {
  id: string;
  name: string;
  variants: CompactVariant[];
}

interface CompactPixelObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactFrame[];
  origin?: { x: number; y: number };
}

interface CompactProject {
  version?: string;
  objects: CompactPixelObject[];
  variants?: CompactVariantLayerInput[];
}

// Exported JSON types
interface ExportedTextureInfo {
  width: number;
  height: number;
}

interface ExportedLayer {
  id: string;
  name: string;
  visible: boolean;
  colorTexture: string | null;
  normalTexture: string | null;
  isVariant?: boolean;
  variantLayerId?: string;
  selectedVariantId?: string;
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
}

interface ExportedFrame {
  id: string;
  name: string;
  layers: ExportedLayer[];
}

interface ExportedVariantLayer {
  colorTexture: string | null;
  normalTexture: string | null;
}

interface ExportedVariantFrame {
  id: string;
  layers: ExportedVariantLayer[];
}

interface ExportedVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedVariantFrame[];
  baseFrameOffsets: { [key: string]: { x: number; y: number } };
}

interface ExportedVariantLayerDef {
  id: string;
  name: string;
  variants: ExportedVariant[];
}

interface ExportedObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedFrame[];
  origin?: { x: number; y: number };
  maxCanvas?: {
    width: number;
    height: number;
    offset: { x: number; y: number };
  };
}

interface ExportedProject {
  version: string;
  projectName: string;
  objects: ExportedObject[];
  variantLayers: ExportedVariantLayerDef[];
  textures: { [path: string]: ExportedTextureInfo };
}

// Compact export format: string table + short keys + numeric string refs
type SI = number; // string table index
interface CompactExportedLayer {
  i: SI;
  n: SI;
  vis: boolean;
  c: SI | null;
  m: SI | null;
  iv?: true;
  vg?: SI;
  sv?: SI;
  vo?: { [key: string]: [number, number] };
}
interface CompactExportedFrame {
  i: SI;
  n: SI;
  l: CompactExportedLayer[];
}
interface CompactExportedObject {
  i: SI;
  n: SI;
  g: [number, number];
  f: CompactExportedFrame[];
  or?: [number, number]; // origin [x, y]
  mc?: [number, number, number, number]; // maxCanvas [width, height, offsetX, offsetY]
}
interface CompactExportedVariantLayer {
  c: SI | null;
  m: SI | null;
}
interface CompactExportedVariantFrame {
  i: SI;
  l: CompactExportedVariantLayer[];
}
interface CompactExportedVariant {
  i: SI;
  n: SI;
  g: [number, number];
  f: CompactExportedVariantFrame[];
  bo: { [key: string]: [number, number] };
}
interface CompactExportedVariantLayerDef {
  i: SI;
  n: SI;
  v: CompactExportedVariant[];
}
interface CompactExportedRoot {
  v: number;
  p: SI;
  s: string[];
  o: CompactExportedObject[];
  r: CompactExportedVariantLayerDef[];
  t: { [key: string]: [number, number] };
}

function collectStrings(proj: ExportedProject): {
  stringTable: string[];
  str2idx: Map<string, number>;
} {
  const stringTable: string[] = [];
  const str2idx = new Map<string, number>();
  function add(s: string): number {
    let idx = str2idx.get(s);
    if (idx === undefined) {
      idx = stringTable.length;
      str2idx.set(s, idx);
      stringTable.push(s);
    }
    return idx;
  }
  add(proj.version);
  add(proj.projectName);
  for (const obj of proj.objects) {
    add(obj.id);
    add(obj.name);
    for (const frame of obj.frames) {
      add(frame.id);
      add(frame.name);
      for (const layer of frame.layers) {
        add(layer.id);
        add(layer.name);
        if (layer.colorTexture != null) add(layer.colorTexture);
        if (layer.normalTexture != null) add(layer.normalTexture);
        if (layer.variantLayerId != null) add(layer.variantLayerId);
        if (layer.selectedVariantId != null) add(layer.selectedVariantId);
        if (layer.variantOffsets) {
          for (const k of Object.keys(layer.variantOffsets)) add(k);
        }
      }
    }
  }
  for (const vg of proj.variantLayers ?? []) {
    add(vg.id);
    add(vg.name);
    for (const v of vg.variants) {
      add(v.id);
      add(v.name);
      for (const vf of v.frames) {
        add(vf.id);
        for (const vl of vf.layers) {
          if (vl.colorTexture != null) add(vl.colorTexture);
          if (vl.normalTexture != null) add(vl.normalTexture);
        }
      }
      // baseFrameOffsets keys stay as "0", "1", "2" - not in string table
    }
  }
  for (const path of Object.keys(proj.textures)) {
    add(path);
  }
  return { stringTable, str2idx };
}

function toCompactExport(
  proj: ExportedProject,
  stringTable: string[],
  str2idx: Map<string, number>,
): CompactExportedRoot {
  const idx = (s: string) => str2idx.get(s) ?? 0;
  const t: { [key: string]: [number, number] } = {};
  for (const [path, info] of Object.entries(proj.textures)) {
    t[String(str2idx.get(path))] = [info.width, info.height];
  }
  return {
    v: idx(proj.version),
    p: idx(proj.projectName),
    s: stringTable,
    o: proj.objects.map((obj) => ({
      i: idx(obj.id),
      n: idx(obj.name),
      g: [obj.gridSize.width, obj.gridSize.height],
      ...(obj.origin
        ? { or: [obj.origin.x, obj.origin.y] as [number, number] }
        : {}),
      ...(obj.maxCanvas
        ? {
            mc: [
              obj.maxCanvas.width,
              obj.maxCanvas.height,
              obj.maxCanvas.offset.x,
              obj.maxCanvas.offset.y,
            ] as [number, number, number, number],
          }
        : {}),
      f: obj.frames.map((frame) => ({
        i: idx(frame.id),
        n: idx(frame.name),
        l: frame.layers.map((layer) => {
          if (layer.isVariant && layer.variantLayerId != null) {
            const vo: { [key: string]: [number, number] } = {};
            if (layer.variantOffsets) {
              for (const [k, val] of Object.entries(layer.variantOffsets)) {
                vo[String(str2idx.get(k))] = [val.x, val.y];
              }
            }
            return {
              i: idx(layer.id),
              n: idx(layer.name),
              vis: layer.visible,
              c: null,
              m: null,
              iv: true,
              vg: idx(layer.variantLayerId),
              sv:
                layer.selectedVariantId != null
                  ? idx(layer.selectedVariantId)
                  : undefined,
              ...(Object.keys(vo).length > 0 ? { vo } : {}),
            } as CompactExportedLayer;
          }
          return {
            i: idx(layer.id),
            n: idx(layer.name),
            vis: layer.visible,
            c: layer.colorTexture != null ? idx(layer.colorTexture) : null,
            m: layer.normalTexture != null ? idx(layer.normalTexture) : null,
          } as CompactExportedLayer;
        }),
      })),
    })),
    r: (proj.variantLayers ?? []).map((vg) => ({
      i: idx(vg.id),
      n: idx(vg.name),
      v: vg.variants.map((v) => ({
        i: idx(v.id),
        n: idx(v.name),
        g: [v.gridSize.width, v.gridSize.height],
        f: v.frames.map((vf) => ({
          i: idx(vf.id),
          l: vf.layers.map((vl) => ({
            c: vl.colorTexture != null ? idx(vl.colorTexture) : null,
            m: vl.normalTexture != null ? idx(vl.normalTexture) : null,
          })),
        })),
        bo: Object.fromEntries(
          Object.entries(v.baseFrameOffsets ?? {}).map(([k, val]) => [
            k,
            [val.x, val.y],
          ]),
        ),
      })),
    })),
    t,
  };
}

// Decode compact pixel to RGBA color (0,0,0,0 for empty)
function compactPixelToRgba(pixel: CompactPixelData): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (pixel === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const [colorHex] = pixel;
  if (colorHex === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (colorHex >>> 24) & 0xff,
    g: (colorHex >>> 16) & 0xff,
    b: (colorHex >>> 8) & 0xff,
    a: colorHex & 0xff,
  };
}

// Decode compact pixel to normal+height RGBA (R=x+128, G=y+128, B=z, A=height; 0,0,0,0 if empty)
function compactPixelToNormalHeight(pixel: CompactPixelData): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (pixel === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const [, normalPacked, height] = pixel;
  if (normalPacked === 0 && height === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const x = ((normalPacked >>> 16) & 0xff) - 128;
  const y = ((normalPacked >>> 8) & 0xff) - 128;
  const z = normalPacked & 0xff;
  return {
    r: Math.max(0, Math.min(255, x + 128)),
    g: Math.max(0, Math.min(255, y + 128)),
    b: z,
    a: Math.max(0, Math.min(255, height)),
  };
}

// Migrate legacy pixel (single number) to compact tuple
function normalizePixel(pixel: unknown): CompactPixelData {
  if (pixel === 0 || pixel === null || pixel === undefined) return 0;
  if (Array.isArray(pixel) && pixel.length >= 3)
    return pixel as CompactPixelData;
  if (typeof pixel === "number") return [pixel, 0, 1]; // legacy: color only
  return 0;
}

function bufferHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function renderLayerToColorBuffer(
  layer: CompactLayer,
  width: number,
  height: number,
): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  const pixels = layer.pixels;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const pixel = normalizePixel(row[x]);
      const rgba = compactPixelToRgba(pixel);
      const i = (y * width + x) * 4;
      buf[i] = rgba.r;
      buf[i + 1] = rgba.g;
      buf[i + 2] = rgba.b;
      buf[i + 3] = rgba.a;
    }
  }
  return buf;
}

function renderLayerToNormalHeightBuffer(
  layer: CompactLayer,
  width: number,
  height: number,
): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  const pixels = layer.pixels;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const pixel = normalizePixel(row[x]);
      const rgba = compactPixelToNormalHeight(pixel);
      const i = (y * width + x) * 4;
      buf[i] = rgba.r;
      buf[i + 1] = rgba.g;
      buf[i + 2] = rgba.b;
      buf[i + 3] = rgba.a;
    }
  }
  return buf;
}

async function writePng(
  buffer: Buffer,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  await sharp(buffer, { raw: { width, height, channels: 4 } })
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 100,
      effort: 10,
    })
    .toFile(outPath);
}

export const exportRouter = Router();

exportRouter.post("/project/export", async (req: Request, res: Response) => {
  try {
    const projectName =
      (req.query.name as string) || (await loadConfig()).currentProject;
    if (!projectName) {
      res.status(400).json({ error: "No project name" });
      return;
    }

    const projectPath = getProjectFilePath(projectName);
    if (!existsSync(projectPath)) {
      res.status(404).json({ error: "Project not found", projectName });
      return;
    }

    const exportBase = process.env.EXPORT_FOLDER || DEFAULT_EXPORT_FOLDER;
    const kebabName = toKebabCase(projectName);
    const pascalName = toPascalCase(projectName);
    const projectExportDir = join(exportBase, kebabName);
    const texturesSubdir = join(projectExportDir, "textures");
    await ensureDir(texturesSubdir);

    const raw = await readFile(projectPath, "utf-8");
    const project: CompactProject = JSON.parse(raw);

    const textures: { [path: string]: ExportedTextureInfo } = {};
    const colorWritten = new Set<string>();
    const normalWritten = new Set<string>();
    const allWritePromises: Promise<void>[] = [];

    function ensureColorTexture(
      buffer: Buffer,
      width: number,
      height: number,
    ): string | null {
      const hash = bufferHash(buffer);
      const path = `textures/${hash}.png`;
      if (!colorWritten.has(hash)) {
        colorWritten.add(hash);
        textures[path] = { width, height };
        allWritePromises.push(
          writePng(buffer, width, height, join(texturesSubdir, `${hash}.png`)),
        );
      }
      return path;
    }

    function ensureNormalTexture(
      buffer: Buffer,
      width: number,
      height: number,
    ): string | null {
      const hash = bufferHash(buffer);
      const path = `textures/${hash}_nrm.png`;
      if (!normalWritten.has(hash)) {
        normalWritten.add(hash);
        textures[path] = { width, height };
        allWritePromises.push(
          writePng(
            buffer,
            width,
            height,
            join(texturesSubdir, `${hash}_nrm.png`),
          ),
        );
      }
      return path;
    }

    const finalObjects: ExportedObject[] = project.objects.map((obj) => ({
      id: obj.id,
      name: obj.name,
      gridSize: obj.gridSize,
      ...(obj.origin ? { origin: obj.origin } : {}),
      frames: obj.frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        layers: frame.layers.map((layer) => {
          if (layer.isVariant && layer.variantGroupId != null) {
            return {
              id: layer.id,
              name: layer.name,
              visible: layer.visible,
              colorTexture: null,
              normalTexture: null,
              isVariant: true,
              variantLayerId: layer.variantGroupId,
              selectedVariantId: layer.selectedVariantId,
              variantOffsets:
                layer.variantOffsets ??
                (layer.variantOffset
                  ? { [layer.selectedVariantId ?? ""]: layer.variantOffset }
                  : undefined),
            } as ExportedLayer;
          }
          const w = obj.gridSize.width;
          const h = obj.gridSize.height;
          const colorBuf = renderLayerToColorBuffer(layer, w, h);
          const normalBuf = renderLayerToNormalHeightBuffer(layer, w, h);
          return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            colorTexture: ensureColorTexture(colorBuf, w, h),
            normalTexture: ensureNormalTexture(normalBuf, w, h),
          } as ExportedLayer;
        }),
      })),
    }));

    const finalVariantLayers: ExportedVariantLayerDef[] = (
      project.variants ?? []
    ).map((vg) => ({
      id: vg.id,
      name: vg.name,
      variants: vg.variants.map((v) => ({
        id: v.id,
        name: v.name,
        gridSize: v.gridSize,
        frames: v.frames.map((vf) => ({
          id: vf.id,
          layers: vf.layers.map((layer) => {
            const w = v.gridSize.width;
            const h = v.gridSize.height;
            const colorBuf = renderLayerToColorBuffer(layer, w, h);
            const normalBuf = renderLayerToNormalHeightBuffer(layer, w, h);
            return {
              colorTexture: ensureColorTexture(colorBuf, w, h),
              normalTexture: ensureNormalTexture(normalBuf, w, h),
            } as ExportedVariantLayer;
          }),
        })),
        baseFrameOffsets: Object.fromEntries(
          Object.entries(v.baseFrameOffsets ?? {}).map(([k, val]) => [k, val]),
        ),
      })),
    }));

    await Promise.all(allWritePromises);

    // ── Compute maxCanvas for each object ──────────────────────────────────
    // Analyzes all variant offsets to determine the total canvas size needed
    // to render any combination of variants without clipping.
    const vlDefMap = new Map<string, ExportedVariantLayerDef>();
    for (const vl of finalVariantLayers) {
      vlDefMap.set(vl.id, vl);
    }

    for (const obj of finalObjects) {
      let minX = 0;
      let minY = 0;
      let maxX = obj.gridSize.width;
      let maxY = obj.gridSize.height;

      for (let frameIdx = 0; frameIdx < obj.frames.length; frameIdx++) {
        const frame = obj.frames[frameIdx];
        for (const layer of frame.layers) {
          if (!layer.isVariant || !layer.variantLayerId) continue;

          const vlDef = vlDefMap.get(layer.variantLayerId);
          if (!vlDef) continue;

          // Consider ALL variants in this variant layer (any could be selected at runtime)
          for (const variant of vlDef.variants) {
            // Resolve the offset using the same priority as the runtime:
            //   1. Per-frame variantOffsets for this specific variant
            //   2. Variant's baseFrameOffsets for this frame index
            //   3. Variant's baseFrameOffsets for frame 0
            //   4. Default { x: 0, y: 0 }
            const offset = layer.variantOffsets?.[variant.id] ??
              variant.baseFrameOffsets[String(frameIdx)] ??
              variant.baseFrameOffsets["0"] ?? { x: 0, y: 0 };

            const vRight = offset.x + variant.gridSize.width;
            const vBottom = offset.y + variant.gridSize.height;

            minX = Math.min(minX, offset.x);
            minY = Math.min(minY, offset.y);
            maxX = Math.max(maxX, vRight);
            maxY = Math.max(maxY, vBottom);
          }
        }
      }

      // Only add maxCanvas if the bounds differ from the base gridSize
      const mcWidth = maxX - minX;
      const mcHeight = maxY - minY;
      const mcOffsetX = -minX;
      const mcOffsetY = -minY;

      if (
        mcWidth !== obj.gridSize.width ||
        mcHeight !== obj.gridSize.height ||
        mcOffsetX !== 0 ||
        mcOffsetY !== 0
      ) {
        obj.maxCanvas = {
          width: mcWidth,
          height: mcHeight,
          offset: { x: mcOffsetX, y: mcOffsetY },
        };
      }
    }

    const exportedProject: ExportedProject = {
      version: project.version ?? "1.0.0",
      projectName,
      objects: finalObjects,
      variantLayers: finalVariantLayers,
      textures,
    };

    const { stringTable, str2idx } = collectStrings(exportedProject);
    const compactRoot = toCompactExport(exportedProject, stringTable, str2idx);
    const framesJsonStr = JSON.stringify(compactRoot);

    const framesPath = join(projectExportDir, "frames.json");
    await safeWriteFile(framesPath, framesJsonStr);

    const framesGzPath = join(projectExportDir, "frames.json.gz");
    await pipeline(
      Readable.from([framesJsonStr]),
      createGzip({ level: 9 }),
      createWriteStream(framesGzPath),
    );

    // ── Copy lib/ to exports root ─────────────────────────────────────────
    const libDestDir = join(exportBase, "lib");
    if (existsSync(CLIENT_LIB_DIR)) {
      await cp(CLIENT_LIB_DIR, libDestDir, { recursive: true, force: true });
    }

    // ── Generate index.ts ──────────────────────────────────────────────────
    const className = `${pascalName}Pixels`;

    // Build variant layer lookup: id -> { layerName, variants: Map<variantId, variantName> }
    const vlLookup = new Map<
      string,
      { name: string; variants: Map<string, string> }
    >();
    for (const vl of finalVariantLayers) {
      const varMap = new Map<string, string>();
      for (const v of vl.variants) {
        varMap.set(v.id, v.name);
      }
      vlLookup.set(vl.id, { name: vl.name, variants: varMap });
    }

    // For each object, discover which variant layers it uses and which
    // specific variants appear (from selectedVariantId + variantOffsets keys)
    const perObjectVariants = new Map<string, Map<string, Set<string>>>();
    for (const obj of finalObjects) {
      // layerName -> Set<variantName>
      const objLayers = new Map<string, Set<string>>();

      for (const frame of obj.frames) {
        for (const layer of frame.layers) {
          if (!layer.isVariant || !layer.variantLayerId) continue;
          const vlInfo = vlLookup.get(layer.variantLayerId);
          if (!vlInfo) continue;

          if (!objLayers.has(vlInfo.name)) {
            objLayers.set(vlInfo.name, new Set());
          }
          const variantNames = objLayers.get(vlInfo.name)!;

          // Collect from selectedVariantId
          if (layer.selectedVariantId) {
            const vName = vlInfo.variants.get(layer.selectedVariantId);
            if (vName) variantNames.add(vName);
          }

          // Collect from variantOffsets keys (these are variant IDs)
          if (layer.variantOffsets) {
            for (const vid of Object.keys(layer.variantOffsets)) {
              const vName = vlInfo.variants.get(vid);
              if (vName) variantNames.add(vName);
            }
          }
        }
      }

      perObjectVariants.set(obj.name, objLayers);
    }

    // Build OBJECTS map: { name: id }
    const objectEntries = finalObjects
      .map((o) => `    ${JSON.stringify(o.name)}: ${JSON.stringify(o.id)}`)
      .join(",\n");

    // Build per-object OBJECT_VARIANTS: { objName: { layerName: { variantName: variantId } } }
    const objectVariantsEntries = finalObjects
      .map((obj) => {
        const objLayers = perObjectVariants.get(obj.name);
        if (!objLayers || objLayers.size === 0) {
          return `    ${JSON.stringify(obj.name)}: {}`;
        }
        const layerEntries = Array.from(objLayers.entries())
          .map(([layerName, variantNames]) => {
            const vlDef = finalVariantLayers.find(
              (vl) => vl.name === layerName,
            );
            if (!vlDef) return `      ${JSON.stringify(layerName)}: {}`;
            const varEntries = Array.from(variantNames)
              .map((vName) => {
                const v = vlDef.variants.find((v) => v.name === vName);
                return `        ${JSON.stringify(vName)}: ${JSON.stringify(v?.id ?? "")}`;
              })
              .join(",\n");
            return `      ${JSON.stringify(layerName)}: {\n${varEntries}\n      }`;
          })
          .join(",\n");
        return `    ${JSON.stringify(obj.name)}: {\n${layerEntries}\n    }`;
      })
      .join(",\n");

    // Build FRAMES map: { objectName: [frameNames] }
    const framesMapEntries = finalObjects
      .map((o) => {
        const frameNames = JSON.stringify(o.frames.map((f) => f.name));
        return `    ${JSON.stringify(o.name)}: ${frameNames}`;
      })
      .join(",\n");

    // Build VARIANT_FRAMES: { layerName: { variantName: frameCount } }
    const variantFramesEntries = finalVariantLayers
      .map((vl) => {
        const varEntries = vl.variants
          .map((v) => `    ${JSON.stringify(v.name)}: ${v.frames.length}`)
          .join(",\n");
        return `  ${JSON.stringify(vl.name)}: {\n${varEntries}\n  }`;
      })
      .join(",\n");

    const indexTs = `/**
 * Generated export types and constants for project: ${projectName}
 * Exported as: ${kebabName}/
 * Do not edit by hand.
 *
 * Usage:
 *   import { parsePixelProject, loadTextures } from '../lib/parse-pixel-project';
 *   import { ${className} } from './${kebabName}';
 *
 *   const project = parsePixelProject(framesJson);
 *   const textures = await loadTextures(project, './${kebabName}');
 *   const instance = ${className}.createInstance(project, "Basic Unit Walk Front");
 *   instance.selectVariantByName("Hair", "Yellow Walk Down"); // type-checked per object
 */

import { createObjectInstance } from '../lib/parse-pixel-project';
import type { ObjectInstance, ParsedProject } from '../lib/parse-pixel-project';

// ─── Data ─────────────────────────────────────────────────────────────────

const OBJECTS = {
${objectEntries}
} as const;

/** Per-object variant layers and their available variants. */
const OBJECT_VARIANTS = {
${objectVariantsEntries}
} as const;

const FRAMES = {
${framesMapEntries}
} as const;

/** Frame counts for each variant, organized by variant layer. */
const VARIANT_FRAMES = {
${variantFramesEntries}
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export type ObjectName = keyof typeof OBJECTS;
export type ObjectVariantLayers<O extends ObjectName> = typeof OBJECT_VARIANTS[O];
export type VariantLayerName<O extends ObjectName> = keyof ObjectVariantLayers<O>;
export type VariantName<O extends ObjectName, L extends VariantLayerName<O>> =
  keyof ObjectVariantLayers<O>[L];

export type VariantLayerNameGlobal = keyof typeof VARIANT_FRAMES;
export type VariantNameGlobal<L extends VariantLayerNameGlobal> = keyof typeof VARIANT_FRAMES[L];

/** Typed instance for a specific object — carries variant and frame type info. */
export type TypedInstance<O extends ObjectName> =
  ObjectInstance<typeof OBJECT_VARIANTS[O], typeof FRAMES[O]>;

// ─── ${className} ─────────────────────────────────────────────────────

/** Static helper class for the "${projectName}" pixel project. */
export class ${className} {
  private constructor() {}

  static readonly PROJECT_NAME = ${JSON.stringify(projectName)} as const;
  static readonly PROJECT_VERSION = ${JSON.stringify(exportedProject.version)} as const;
  static readonly OBJECTS = OBJECTS;
  static readonly OBJECT_VARIANTS = OBJECT_VARIANTS;
  static readonly FRAMES = FRAMES;
  static readonly VARIANT_FRAMES = VARIANT_FRAMES;

  /** Get the object id for a given object name. */
  static getObjectId(name: ObjectName): string {
    return OBJECTS[name];
  }

  /** Get the frame count for a specific variant. */
  static getVariantFrameCount<L extends VariantLayerNameGlobal>(
    layerName: L,
    variantName: VariantNameGlobal<L> & string,
  ): number {
    const layer = VARIANT_FRAMES[layerName] as Record<string, number> | undefined;
    return layer?.[variantName] ?? 0;
  }

  /**
   * Create a typed object instance by object name.
   * The returned instance's selectVariantByName is type-safe for this object's
   * available variant layers and variants. frameNames is also typed.
   */
  static createInstance<O extends ObjectName>(
    project: ParsedProject,
    objectName: O,
  ): TypedInstance<O> {
    const objectId = OBJECTS[objectName];
    return createObjectInstance(project, objectId) as TypedInstance<O>;
  }
}
`;

    const indexPath = join(projectExportDir, "index.ts");
    await safeWriteFile(indexPath, indexTs);

    res.json({ success: true, path: projectExportDir, kebabName });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Export failed",
    });
  }
});
