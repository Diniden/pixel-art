/**
 * Version 1 parser for exported pixel project data (frames.json).
 * Handles projects with version "1.x.x".
 * Supports both full and compact (string-table + short keys) wire formats.
 */

// ─── Full (expanded) format types ────────────────────────────────────────────

export interface ExportedTextureInfo {
  width: number;
  height: number;
}

export interface ExportedLayer {
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

export interface ExportedFrame {
  id: string;
  name: string;
  layers: ExportedLayer[];
}

export interface ExportedVariantLayer {
  colorTexture: string | null;
  normalTexture: string | null;
}

export interface ExportedVariantFrame {
  id: string;
  layers: ExportedVariantLayer[];
}

export interface ExportedVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedVariantFrame[];
  baseFrameOffsets: { [key: string]: { x: number; y: number } };
}

export interface ExportedVariantLayer {
  id: string;
  name: string;
  variants: ExportedVariant[];
}

export interface ExportedObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedFrame[];
  origin?: { x: number; y: number };
  /** Maximum canvas size needed to render all variant combinations without clipping. */
  maxCanvas?: {
    width: number;
    height: number;
    offset: { x: number; y: number };
  };
}

export interface ExportedProject {
  version: string;
  projectName: string;
  objects: ExportedObject[];
  variantLayers: ExportedVariantLayer[];
  textures: { [path: string]: ExportedTextureInfo };
}

// ─── Compact (wire) format types ─────────────────────────────────────────────

export interface CompactExportedRoot {
  v: number;
  p: number;
  s: string[];
  o: CompactExportedObject_[];
  r: CompactExportedVariantLayer_[];
  t: { [key: string]: [number, number] };
}

interface CompactExportedLayer_ {
  i: number;
  n: number;
  vis: boolean;
  c: number | null;
  m: number | null;
  iv?: true;
  vg?: number;
  sv?: number;
  vo?: { [key: string]: [number, number] };
}

interface CompactExportedFrame_ {
  i: number;
  n: number;
  l: CompactExportedLayer_[];
}

interface CompactExportedObject_ {
  i: number;
  n: number;
  g: [number, number];
  f: CompactExportedFrame_[];
  or?: [number, number]; // origin [x, y]
  mc?: [number, number, number, number]; // maxCanvas [width, height, offsetX, offsetY]
}

interface CompactExportedVariantLayer_ {
  c: number | null;
  m: number | null;
}

interface CompactExportedVariantFrame_ {
  i: number;
  l: CompactExportedVariantLayer_[];
}

interface CompactExportedVariant_ {
  i: number;
  n: number;
  g: [number, number];
  f: CompactExportedVariantFrame_[];
  bo: { [key: string]: [number, number] };
}

interface CompactExportedVariantLayer_ {
  i: number;
  n: number;
  v: CompactExportedVariant_[];
}

// ─── Detection & expansion ───────────────────────────────────────────────────

export function isCompactFormat(data: unknown): data is CompactExportedRoot {
  const d = data as Record<string, unknown>;
  return (
    data != null &&
    typeof data === "object" &&
    Array.isArray(d.s) &&
    Array.isArray(d.o)
  );
}

function expandCompactFormat(compact: CompactExportedRoot): ExportedProject {
  const s = compact.s;
  const get = (i: number): string =>
    typeof i === "number" && i >= 0 && i < s.length ? s[i] : "";

  return {
    version: get(compact.v),
    projectName: get(compact.p),
    objects: compact.o.map((obj) => ({
      id: get(obj.i),
      name: get(obj.n),
      gridSize: { width: obj.g[0], height: obj.g[1] },
      ...(obj.or ? { origin: { x: obj.or[0], y: obj.or[1] } } : {}),
      ...(obj.mc
        ? {
            maxCanvas: {
              width: obj.mc[0],
              height: obj.mc[1],
              offset: { x: obj.mc[2], y: obj.mc[3] },
            },
          }
        : {}),
      frames: obj.f.map((frame) => ({
        id: get(frame.i),
        name: get(frame.n),
        layers: frame.l.map((layer) => {
          if (layer.iv) {
            const vo: { [variantId: string]: { x: number; y: number } } = {};
            if (layer.vo) {
              for (const [ki, val] of Object.entries(layer.vo)) {
                const kid = parseInt(ki, 10);
                if (!Number.isNaN(kid)) vo[get(kid)] = { x: val[0], y: val[1] };
              }
            }
            return {
              id: get(layer.i),
              name: get(layer.n),
              visible: layer.vis,
              colorTexture: null,
              normalTexture: null,
              isVariant: true,
              variantLayerId:
                layer.vg !== undefined ? get(layer.vg) : undefined,
              selectedVariantId:
                layer.sv !== undefined ? get(layer.sv) : undefined,
              variantOffsets: Object.keys(vo).length > 0 ? vo : undefined,
            };
          }
          return {
            id: get(layer.i),
            name: get(layer.n),
            visible: layer.vis,
            colorTexture: layer.c != null ? get(layer.c) : null,
            normalTexture: layer.m != null ? get(layer.m) : null,
          };
        }),
      })),
    })),
    variantLayers: (compact.r ?? []).map((vg) => ({
      id: get(vg.i),
      name: get(vg.n),
      variants: vg.v.map((v) => ({
        id: get(v.i),
        name: get(v.n),
        gridSize: { width: v.g[0], height: v.g[1] },
        frames: v.f.map((vf) => ({
          id: get(vf.i),
          layers: vf.l.map((vl) => ({
            colorTexture: vl.c != null ? get(vl.c) : null,
            normalTexture: vl.m != null ? get(vl.m) : null,
          })),
        })),
        baseFrameOffsets: Object.fromEntries(
          Object.entries(v.bo ?? {}).map(([k, val]) => [
            k,
            { x: val[0], y: val[1] },
          ]),
        ),
      })),
    })),
    textures: Object.fromEntries(
      Object.entries(compact.t ?? {}).map(([ki, wh]) => {
        const idx = parseInt(ki, 10);
        return [
          Number.isNaN(idx) ? ki : get(idx),
          { width: wh[0], height: wh[1] },
        ];
      }),
    ),
  };
}

// ─── Public parse entry for v1 ───────────────────────────────────────────────

/**
 * Parse raw JSON (compact or full) into an ExportedProject.
 * This is the v1 parser: handles projects with version "1.x.x".
 */
export function parseV1(json: unknown): ExportedProject {
  if (isCompactFormat(json)) {
    return expandCompactFormat(json);
  }
  return json as ExportedProject;
}

/**
 * Extract the version string from raw JSON without fully parsing.
 */
export function detectVersionV1(json: unknown): string | null {
  if (isCompactFormat(json)) {
    const compact = json as CompactExportedRoot;
    const s = compact.s;
    if (
      typeof compact.v === "number" &&
      compact.v >= 0 &&
      compact.v < s.length
    ) {
      return s[compact.v];
    }
    return null;
  }
  const full = json as Record<string, unknown>;
  if (typeof full.version === "string") {
    return full.version;
  }
  return null;
}
