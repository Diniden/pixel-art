/**
 * Pixel Project Parser — main entry point.
 *
 * Reads the version from frames.json and dispatches to the correct
 * version-specific parser module. Provides texture loading (HTMLImageElement)
 * and ObjectInstance creation for rendering.
 *
 * Usage:
 *   import { parsePixelProject, createObjectInstance, loadTextures } from './lib/parse-pixel-project';
 *   const project = parsePixelProject(framesJson);
 *   const textures = await loadTextures(project, './exports/MyProject');
 *   const instance = createObjectInstance(project, objectId);
 *   const layers = instance.getRenderLayers();
 */

// Re-export all public types from v1 (current format)
export type {
  ExportedProject,
  ExportedObject,
  ExportedFrame,
  ExportedLayer,
  ExportedVariant,
  ExportedVariantLayer,
  ExportedVariantFrame,
  ExportedVariantLayer as ExportedVariantGroup, // backward compat alias
  ExportedTextureInfo,
  CompactExportedRoot,
} from "./versions/v1";

import { parseV1, detectVersionV1, isCompactFormat } from "./versions/v1";

import type {
  ExportedProject,
  ExportedObject,
  ExportedVariantLayer,
} from "./versions/v1";

// ─── Version registry ────────────────────────────────────────────────────────

interface VersionParser {
  parse(json: unknown): ExportedProject;
  detectVersion(json: unknown): string | null;
}

const VERSION_PARSERS: { major: number; parser: VersionParser }[] = [
  { major: 1, parser: { parse: parseV1, detectVersion: detectVersionV1 } },
];

function getMajorVersion(versionStr: string): number {
  const parts = versionStr.split(".");
  const major = parseInt(parts[0], 10);
  return Number.isNaN(major) ? 1 : major;
}

function detectVersion(json: unknown): string {
  // Try compact format first (most common in exports)
  if (isCompactFormat(json)) {
    const v = detectVersionV1(json);
    if (v) return v;
  }
  // Try full format
  const full = json as Record<string, unknown>;
  if (typeof full.version === "string") return full.version;
  // Default
  return "1.0.0";
}

function getParser(version: string): VersionParser {
  const major = getMajorVersion(version);
  const entry = VERSION_PARSERS.find((e) => e.major === major);
  if (!entry) {
    throw new Error(
      `Unsupported pixel project format version: ${version}. ` +
        `Supported major versions: ${VERSION_PARSERS.map((e) => e.major).join(", ")}`,
    );
  }
  return entry.parser;
}

// ─── Parsed project ──────────────────────────────────────────────────────────

/** Parsed project: validated and ready for creating instances. */
export interface ParsedProject {
  /** The expanded project data. */
  data: ExportedProject;
  /** Version string from the project. */
  version: string;
  /** Look up objects by id. */
  objectById: Map<string, ExportedObject>;
  /** Look up variant layers by id. */
  variantLayerById: Map<string, ExportedVariantLayer>;
  /** Look up objects by name. */
  objectByName: Map<string, ExportedObject>;
  /** Look up variant layers by name. */
  variantLayerByName: Map<string, ExportedVariantLayer>;
  /** All unique texture paths referenced in the project. */
  texturePaths: string[];
}

/**
 * Parse exported project JSON (frames.json) into a ParsedProject.
 * Automatically detects the format version and uses the correct parser.
 * Accepts both full and compact wire formats.
 */
export function parsePixelProject(json: unknown): ParsedProject {
  const version = detectVersion(json);
  const parser = getParser(version);
  const data = parser.parse(json);

  const objectById = new Map<string, ExportedObject>();
  const objectByName = new Map<string, ExportedObject>();
  const variantLayerById = new Map<string, ExportedVariantLayer>();
  const variantLayerByName = new Map<string, ExportedVariantLayer>();

  for (const obj of data.objects) {
    objectById.set(obj.id, obj);
    objectByName.set(obj.name, obj);
  }
  for (const vl of data.variantLayers ?? []) {
    variantLayerById.set(vl.id, vl);
    variantLayerByName.set(vl.name, vl);
  }

  const texturePaths = Object.keys(data.textures ?? {});

  return {
    data,
    version,
    objectById,
    objectByName,
    variantLayerById,
    variantLayerByName,
    texturePaths,
  };
}

// ─── Render layer ────────────────────────────────────────────────────────────

/**
 * A single layer to draw, with full identification for asset management.
 * Layers are returned in bottom-to-top order by getRenderLayers().
 */
export interface RenderLayer {
  /** Color texture path (e.g. 'textures/abc123.png'), or null if empty. */
  colorTexture: string | null;
  /** Normal+height texture path, or null if empty. */
  normalTexture: string | null;
  /** X offset in pixels (relative to the object's origin). */
  x: number;
  /** Y offset in pixels. */
  y: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Whether this layer is visible. */
  visible: boolean;

  // ── Identification ──────────────────────────────────────────────────────

  /** Layer id from the project data. */
  layerId: string;
  /** Layer name from the project data. */
  layerName: string;
  /** True when this layer comes from a variant rather than the base object. */
  isVariant: boolean;
  /** Current object frame index that produced this layer. */
  objectFrameIndex: number;

  // ── Variant-specific (only present when isVariant === true) ─────────────

  /** The variant layer (group) id. */
  variantLayerId?: string;
  /** The variant layer (group) name. */
  variantLayerName?: string;
  /** The selected variant's id. */
  variantId?: string;
  /** The selected variant's name. */
  variantName?: string;
  /** The variant's own frame index (from its independent timeline). */
  variantFrameIndex?: number;
  /** Sub-layer index within the variant frame (0-based). */
  variantSubLayerIndex?: number;
}

// ─── Object instance ─────────────────────────────────────────────────────────

/**
 * Per-instance state for one object: current frame and variant selections.
 *
 * Each variant layer runs on its own independent timeline. Calling `nextFrame()`
 * advances the base object frame AND every active variant layer's playhead,
 * each wrapping at their own frame count.
 *
 * Generic parameters (all optional, defaulting to untyped):
 *  - TVariants: per-layer variant map, e.g. { Hair: { "Yellow Walk Down": "id" } }
 *  - TFrames: tuple of frame names for this object
 *
 * When created through a generated index.ts wrapper the generics are narrowed
 * so that selectVariantByName and frame helpers are fully type-checked.
 */
export interface ObjectInstance<
  TVariants extends Record<string, Record<string, string>> = Record<
    string,
    Record<string, string>
  >,
  TFrames extends readonly string[] = readonly string[],
> {
  /** The object id. */
  readonly objectId: string;
  /** The object name. */
  readonly objectName: string;

  // ── Base frame control ──────────────────────────────────────────────────

  /** Reset the base frame and all variant playheads to 0. */
  reset(): void;
  /** Set the current frame by index (0-based). Does not affect variant playheads. */
  setFrame(index: number): void;
  /**
   * Advance all timelines by one tick:
   *  - base object frame wraps at frameCount
   *  - each active variant layer's playhead wraps at its own frame count
   */
  nextFrame(): void;
  /** Current base frame index (0-based). */
  readonly frameIndex: number;
  /** Number of base frames. */
  readonly frameCount: number;
  /** Frame names for this object (typed when generics are supplied). */
  readonly frameNames: TFrames;
  /** Object grid size (width, height). */
  readonly gridSize: { width: number; height: number };
  /** Origin point (anchor) for this object, if set. Offset from top-left in pixels. */
  readonly origin: { x: number; y: number } | undefined;
  /**
   * Maximum canvas size needed to render all variant combinations without clipping.
   * The offset indicates how much to shift the base object's origin within the larger canvas
   * to account for variants that extend beyond the top-left of the base grid.
   */
  readonly maxCanvas:
    | { width: number; height: number; offset: { x: number; y: number } }
    | undefined;

  // ── Variant selection ───────────────────────────────────────────────────

  /** Set the selected variant for a variant layer by layer id + variant id. Resets that layer's playhead to 0. */
  selectVariant(layerId: string, variantId: string): void;
  /** Set the selected variant by layer name + variant name. Type-safe when generics are supplied. Resets that layer's playhead to 0. */
  selectVariantByName<L extends keyof TVariants & string>(
    layerName: L,
    variantName: keyof TVariants[L] & string,
  ): void;

  // ── Variant frame control (independent timelines) ───────────────────────

  /** Manually set a variant layer's playhead (by layer id). */
  setVariantFrame(layerId: string, frameIndex: number): void;
  /** Manually set a variant layer's playhead (by layer name). */
  setVariantFrameByName(layerName: string, frameIndex: number): void;
  /** Get the current playhead of a variant layer (by layer id). */
  getVariantFrameIndex(layerId: string): number;
  /** Get the current playhead of a variant layer (by layer name). */
  getVariantFrameIndexByName(layerName: string): number;
  /** Get the frame count of the currently selected variant in a layer (by layer id). Returns 0 if not found. */
  getVariantFrameCount(layerId: string): number;
  /** Get the frame count of the currently selected variant in a layer (by layer name). Returns 0 if not found. */
  getVariantFrameCountByName(layerName: string): number;

  // ── Rendering ───────────────────────────────────────────────────────────

  /**
   * Get layers to draw in order (bottom to top), with correct textures,
   * positions, and full identification metadata.
   */
  getRenderLayers(): RenderLayer[];
}

/**
 * Create an instance of an object for rendering.
 *
 * Each variant layer runs its own independent animation timeline.
 * Call `nextFrame()` to advance all timelines simultaneously.
 * Call `selectVariant`/`selectVariantByName` to switch variants.
 * Call `getRenderLayers()` to get the full layer stack with asset identifiers.
 */
export function createObjectInstance(
  project: ParsedProject,
  objectId: string,
): ObjectInstance {
  const maybeObj = project.objectById.get(objectId);
  if (!maybeObj) {
    throw new Error(`Pixel Project Parser: Object not found: ${objectId}`);
  }
  const obj = maybeObj;

  let frameIndex = 0;
  const selectedVariants: { [layerId: string]: string } = {};
  // Independent playhead per variant layer
  const variantPlayheads: { [layerId: string]: number } = {};

  // Initialize variant selections and playheads from layer defaults
  for (const frame of obj.frames) {
    for (const layer of frame.layers) {
      if (layer.isVariant && layer.variantLayerId && layer.selectedVariantId) {
        if (selectedVariants[layer.variantLayerId] === undefined) {
          selectedVariants[layer.variantLayerId] = layer.selectedVariantId;
          variantPlayheads[layer.variantLayerId] = 0;
        }
      }
    }
  }

  /** Resolve the currently-selected variant for a layer id. */
  function resolveVariant(layerId: string, fallbackSelectedId?: string) {
    const vl = project.variantLayerById.get(layerId);
    if (!vl) return null;
    const variantId = selectedVariants[layerId] ?? fallbackSelectedId;
    const variant = vl.variants.find((v) => v.id === variantId);
    return variant ?? null;
  }

  /** Advance every active variant layer's playhead by 1 (wrapping). */
  function advanceVariantPlayheads() {
    for (const layerId of Object.keys(variantPlayheads)) {
      const variant = resolveVariant(layerId);
      if (!variant || variant.frames.length === 0) continue;
      variantPlayheads[layerId] =
        (variantPlayheads[layerId] + 1) % variant.frames.length;
    }
  }

  function getRenderLayers(): RenderLayer[] {
    const frame = obj.frames[frameIndex];
    if (!frame) return [];

    const layers: RenderLayer[] = [];
    const { width: objW, height: objH } = obj.gridSize;

    for (const layer of frame.layers) {
      if (!layer.visible) continue;

      if (layer.isVariant && layer.variantLayerId) {
        const vl = project.variantLayerById.get(layer.variantLayerId);
        const variant = resolveVariant(
          layer.variantLayerId,
          layer.selectedVariantId,
        );
        if (!variant) continue;

        const variantId = variant.id;
        const offset = layer.variantOffsets?.[variantId] ??
          variant.baseFrameOffsets[String(frameIndex)] ??
          variant.baseFrameOffsets["0"] ?? { x: 0, y: 0 };

        const vFrameCount = variant.frames.length;
        if (vFrameCount === 0) continue;

        // Use the independent playhead for this variant layer
        const vFrameIdx =
          (variantPlayheads[layer.variantLayerId] ?? 0) % vFrameCount;
        const variantFrame = variant.frames[vFrameIdx];
        if (!variantFrame) continue;

        const { width: vW, height: vH } = variant.gridSize;
        for (let si = 0; si < variantFrame.layers.length; si++) {
          const vLayer = variantFrame.layers[si];
          layers.push({
            colorTexture: vLayer.colorTexture,
            normalTexture: vLayer.normalTexture,
            x: offset.x,
            y: offset.y,
            width: vW,
            height: vH,
            visible: true,
            // Identification
            layerId: layer.id,
            layerName: layer.name,
            isVariant: true,
            objectFrameIndex: frameIndex,
            variantLayerId: layer.variantLayerId,
            variantLayerName: vl?.name,
            variantId: variant.id,
            variantName: variant.name,
            variantFrameIndex: vFrameIdx,
            variantSubLayerIndex: si,
          });
        }
      } else {
        layers.push({
          colorTexture: layer.colorTexture,
          normalTexture: layer.normalTexture,
          x: 0,
          y: 0,
          width: objW,
          height: objH,
          visible: true,
          // Identification
          layerId: layer.id,
          layerName: layer.name,
          isVariant: false,
          objectFrameIndex: frameIndex,
        });
      }
    }

    return layers;
  }

  return {
    get objectId() {
      return obj.id;
    },
    get objectName() {
      return obj.name;
    },

    reset() {
      frameIndex = 0;
      for (const key of Object.keys(variantPlayheads)) {
        variantPlayheads[key] = 0;
      }
    },

    setFrame(index: number) {
      if (index >= 0 && index < obj.frames.length) {
        frameIndex = index;
      }
    },

    nextFrame() {
      frameIndex = (frameIndex + 1) % obj.frames.length;
      advanceVariantPlayheads();
    },

    selectVariant(layerId: string, variantId: string) {
      selectedVariants[layerId] = variantId;
      variantPlayheads[layerId] = 0;
    },

    selectVariantByName(layerName: string, variantName: string) {
      const vl = project.variantLayerByName.get(layerName);
      if (!vl) return;
      const variant = vl.variants.find((v) => v.name === variantName);
      if (!variant) return;
      selectedVariants[vl.id] = variant.id;
      variantPlayheads[vl.id] = 0;
    },

    setVariantFrame(layerId: string, index: number) {
      variantPlayheads[layerId] = index;
    },

    setVariantFrameByName(layerName: string, index: number) {
      const vl = project.variantLayerByName.get(layerName);
      if (!vl) return;
      variantPlayheads[vl.id] = index;
    },

    getVariantFrameIndex(layerId: string): number {
      return variantPlayheads[layerId] ?? 0;
    },

    getVariantFrameIndexByName(layerName: string): number {
      const vl = project.variantLayerByName.get(layerName);
      if (!vl) return 0;
      return variantPlayheads[vl.id] ?? 0;
    },

    getVariantFrameCount(layerId: string): number {
      const variant = resolveVariant(layerId);
      return variant?.frames.length ?? 0;
    },

    getVariantFrameCountByName(layerName: string): number {
      const vl = project.variantLayerByName.get(layerName);
      if (!vl) return 0;
      const variantId = selectedVariants[vl.id];
      const variant = vl.variants.find((v) => v.id === variantId);
      return variant?.frames.length ?? 0;
    },

    getRenderLayers,

    get frameIndex() {
      return frameIndex;
    },
    get gridSize() {
      return obj.gridSize;
    },
    get origin() {
      return obj.origin;
    },
    get maxCanvas() {
      return obj.maxCanvas;
    },
    get frameCount() {
      return obj.frames.length;
    },
    get frameNames() {
      return obj.frames.map((f) => f.name) as unknown as readonly string[];
    },
  };
}

// ─── Texture loading ─────────────────────────────────────────────────────────

/**
 * Fetch all textures referenced in the project and return them as HTMLImageElements.
 * @param project  Parsed project from parsePixelProject()
 * @param basePath URL base path to the project export folder (e.g. './exports/MyProject')
 * @returns Map from texture path (e.g. 'textures/abc123.png') to loaded HTMLImageElement
 */
export async function loadTextures(
  project: ParsedProject,
  basePath: string,
): Promise<Map<string, HTMLImageElement>> {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const result = new Map<string, HTMLImageElement>();

  await Promise.all(
    project.texturePaths.map((texPath) => {
      const url = `${base}/${texPath}`;
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          result.set(texPath, img);
          resolve();
        };
        img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
        img.src = url;
      });
    }),
  );

  return result;
}
