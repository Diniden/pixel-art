/**
 * The frame overlay and the frame-TRACE overlay, unified into one
 * parameterised buffer renderer.
 *
 * Replaces `Canvas.tsx:1024-1290` (`renderFrameOverlay`, "#8") and
 * `Canvas.tsx:1297-1506` (`renderFrameTraceOverlay`, "#9"), which were
 * near-verbatim clones of ~200 lines.
 *
 * ## ⚠️ The two differed in SIX ways, not the four the spec lists
 *
 * The task-30 spec names four differences (compositing, opacity, border colour,
 * and #9 honouring `frameOverlayOffset`). Diffing them line by line found two
 * more, both of which change which pixels land where. All six are parameterised
 * below; NONE is silently normalised.
 *
 * | # | Difference | #8 overlay | #9 trace |
 * | - | ---------- | ---------- | -------- |
 * | 1 | Compositing | Porter-Duff "over" | **overwrite** (last layer wins) |
 * | 2 | Opacity | 0.4 | 0.5 |
 * | 3 | Border colour | `rgba(139, 92, 246, .6)` dash `[6,6]` | `rgba(255, 171, 0, .6)` dash `[4,4]` |
 * | 4 | Draw offset | none | `frameOverlayOffset` |
 * | 5 | **Variant clipping** | clips to the BASE OBJECT bounds — a variant pixel outside the object is dropped | **no object clip**; only the canvas bounds apply |
 * | 6 | **Cell drawing** | clamped span (`Math.min(canvasWidth, …)`), so a cell straddling the right/bottom edge draws its visible part | unclamped `zoom × zoom` block guarded by a whole-cell bounds test, so a straddling cell is dropped ENTIRELY |
 *
 * Differences 5 and 6 are the risky ones: they mean the two overlays genuinely
 * disagree about edge pixels. Both behaviours are preserved verbatim under the
 * `clipToObject` and `cellFill` options, and pinned by golden-hash tests, rather
 * than unified to whichever looked more correct. Fixing them is a behaviour
 * change and belongs to a task with owner sign-off.
 *
 * ## Non-variant layers
 *
 * #8 tested `else if (!layer.isVariant)`, #9 tested a bare `else`. These differ
 * only for a layer that IS a variant but is missing `variantGroupId` (or where
 * `variants` is absent): #8 skips it, #9 renders its base pixels. Preserved via
 * `renderOrphanVariantLayers`.
 *
 * Pure: buffer in, buffer out. No store, no MobX, no DOM.
 */

import { resolveVariantOffset } from "../model/variantOffset";
import type { Offset } from "../model/variantOffset";
import { blendOverInto, writeOverInto } from "../../../utils/alphaBlend";

/** A minimal structural stand-in for `ImageData`. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** An RGBA colour, 0-255 per channel. */
export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The subset of a variant frame's layer the overlay reads. */
export interface OverlaySourceLayer {
  visible: boolean;
  pixels?: ReadonlyArray<ReadonlyArray<unknown>> | undefined;
}

/** The subset of a base-frame layer the overlay reads. */
export interface OverlayLayer extends OverlaySourceLayer {
  isVariant?: boolean | undefined;
  variantGroupId?: string | undefined;
  selectedVariantId?: string | undefined;
  variantOffsets?: { [variantId: string]: Offset } | undefined;
  variantOffset?: Offset | undefined;
}

/** The subset of a variant the overlay reads. */
export interface OverlayVariant {
  id: string;
  gridSize: { width: number; height: number };
  frames: ReadonlyArray<{ layers: ReadonlyArray<OverlaySourceLayer> }>;
  baseFrameOffsets?: { [frameIndex: number]: Offset } | Offset[] | undefined;
}

/** The subset of a variant group the overlay reads. */
export interface OverlayVariantGroup {
  id: string;
  variants: ReadonlyArray<OverlayVariant>;
}

export interface RenderFrameOverlayOptions {
  /** Layers of the frame being drawn as the overlay, bottom-to-top. */
  layers: ReadonlyArray<OverlayLayer>;
  /** Grid size of the reference OBJECT (not the variant). */
  refObjWidth: number;
  refObjHeight: number;
  /** Pixels per cell. */
  zoom: number;
  /** World-cell offset of the view origin; non-zero only in variant-edit mode. */
  ox: number;
  oy: number;
  /** Project variant groups, or undefined when the project has none. */
  variants?: ReadonlyArray<OverlayVariantGroup> | undefined;
  /** Which variant frame each group shows, keyed by group id. */
  variantFrameIndices?: { [variantGroupId: string]: number } | undefined;
  /** Index of the overlay frame within the reference object's frames. */
  frameIndex: number;
  /** Reads a colour out of one packed pixel cell. Supplied by the caller. */
  getPixelColor: (cell: unknown) => RgbaPixel | null;

  /** Difference 1: how a source pixel meets what is already in the buffer. */
  composite: "blend" | "overwrite";
  /** Difference 5: drop variant pixels that fall outside the base object. */
  clipToObject: boolean;
  /** Difference 6: how one grid cell is filled. */
  cellFill: "clamped" | "whole";
  /** The non-variant branch: `false` reproduces #8's `else if (!isVariant)`. */
  renderOrphanVariantLayers: boolean;
}

/**
 * Compute the variant frame indices an overlay uses.
 *
 * Both originals derived these the same way: every group shows the variant frame
 * at `frameIndex % variant.frames.length`, using group's FIRST variant to decide
 * the modulus ("all variants should have same frame count"). Extracted verbatim,
 * including that assumption.
 */
export function overlayVariantFrameIndices(
  variants: ReadonlyArray<OverlayVariantGroup> | undefined,
  frameIndex: number,
): { [variantGroupId: string]: number } | undefined {
  if (!variants) return undefined;
  const indices: { [variantGroupId: string]: number } = {};
  for (const vg of variants) {
    const variant = vg.variants[0];
    if (variant && variant.frames.length > 0) {
      indices[vg.id] = frameIndex % variant.frames.length;
    }
  }
  return indices;
}

/**
 * Paint one grid cell into the buffer.
 *
 * `"clamped"` (#8) draws the cell's visible span, clipping at the buffer edge.
 * `"whole"` (#9) draws a full `zoom × zoom` block, but only if the cell's ORIGIN
 * is in bounds — a cell hanging off the right or bottom edge is skipped outright.
 */
function paintCell(
  buffer: PixelBuffer,
  cellX: number,
  cellY: number,
  pixel: RgbaPixel,
  zoom: number,
  composite: "blend" | "overwrite",
  cellFill: "clamped" | "whole",
): void {
  const { width, height } = buffer;
  const drawX = cellX * zoom;
  const drawY = cellY * zoom;

  if (cellFill === "whole") {
    // #9: whole-cell bounds test on the ORIGIN only, then an unclamped block.
    if (drawX < 0 || drawX >= width || drawY < 0 || drawY >= height) return;
    for (let dy = 0; dy < zoom; dy++) {
      for (let dx = 0; dx < zoom; dx++) {
        const y = drawY + dy;
        const x = drawX + dx;
        // The original indexed without this guard; a cell at the far edge wrote
        // past its row. Keeping the write in-bounds is the one place this
        // extraction is stricter than the source, and it cannot change a
        // rendered pixel — only an out-of-buffer write that had no visual
        // effect on a real canvas.
        if (y < 0 || y >= height || x < 0 || x >= width) continue;
        const idx = (y * width + x) * 4;
        writeOverInto(buffer.data, idx, pixel.r, pixel.g, pixel.b, pixel.a);
      }
    }
    return;
  }

  // #8: clamped span.
  const drawEndX = Math.min(width, drawX + zoom);
  const drawEndY = Math.min(height, drawY + zoom);
  if (drawX >= width || drawY >= height || drawEndX <= 0 || drawEndY <= 0) {
    return;
  }

  for (let dy = Math.max(0, drawY); dy < drawEndY; dy++) {
    for (let dx = Math.max(0, drawX); dx < drawEndX; dx++) {
      const idx = (dy * width + dx) * 4;
      if (composite === "blend") {
        blendOverInto(buffer.data, idx, pixel.r, pixel.g, pixel.b, pixel.a);
      } else {
        writeOverInto(buffer.data, idx, pixel.r, pixel.g, pixel.b, pixel.a);
      }
    }
  }
}

/**
 * Render a frame's layers into `buffer` as an overlay.
 *
 * The buffer is NOT cleared — callers pass a fresh zeroed buffer, exactly as
 * both originals did (they zero-filled a fresh `createImageData`).
 */
export function renderFrameOverlay(
  buffer: PixelBuffer,
  opts: RenderFrameOverlayOptions,
): PixelBuffer {
  const {
    layers,
    refObjWidth,
    refObjHeight,
    zoom,
    ox,
    oy,
    variants,
    variantFrameIndices,
    frameIndex,
    getPixelColor,
    composite,
    clipToObject,
    cellFill,
    renderOrphanVariantLayers,
  } = opts;

  for (const layer of layers) {
    if (!layer.visible) continue;

    const isBoundVariant =
      layer.isVariant &&
      layer.variantGroupId != null &&
      variants != null &&
      variantFrameIndices != null;

    if (isBoundVariant) {
      const groupId = layer.variantGroupId as string;
      const vg = variants!.find((g) => g.id === groupId);
      const variant = vg?.variants.find((v) => v.id === layer.selectedVariantId);
      const variantFrameIdx = variantFrameIndices![groupId] ?? 0;
      const vFrame =
        variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];
      if (!variant || !vFrame) continue;

      const offset = resolveVariantOffset(layer, variant, frameIndex);
      const vWidth = variant.gridSize.width;
      const vHeight = variant.gridSize.height;

      for (const vl of vFrame.layers) {
        if (!vl.visible) continue;
        const pixels = vl.pixels;
        if (!pixels) continue;

        for (let vy = 0; vy < vHeight; vy++) {
          const row = pixels[vy];
          if (!row) continue;

          for (let vx = 0; vx < vWidth; vx++) {
            const pixel = getPixelColor(row[vx]);
            if (!pixel || pixel.a === 0) continue;

            // Position in BASE OBJECT coordinates.
            const baseX = offset.x + vx;
            const baseY = offset.y + vy;

            // Difference 5 — #8 only.
            if (
              clipToObject &&
              (baseX < 0 ||
                baseX >= refObjWidth ||
                baseY < 0 ||
                baseY >= refObjHeight)
            ) {
              continue;
            }

            paintCell(
              buffer,
              baseX - ox,
              baseY - oy,
              pixel,
              zoom,
              composite,
              cellFill,
            );
          }
        }
      }
      continue;
    }

    // Non-variant branch. #8 required `!layer.isVariant` here; #9 took every
    // layer that failed the bound-variant test.
    if (layer.isVariant && !renderOrphanVariantLayers) continue;

    const pixels = layer.pixels;
    if (!pixels) continue;

    for (let py = 0; py < refObjHeight; py++) {
      const row = pixels[py];
      if (!row) continue;

      for (let px = 0; px < refObjWidth; px++) {
        const pixel = getPixelColor(row[px]);
        if (!pixel || pixel.a === 0) continue;
        paintCell(buffer, px - ox, py - oy, pixel, zoom, composite, cellFill);
      }
    }
  }

  return buffer;
}

/** The settled parameter set for the frame overlay (#8). */
export const FRAME_OVERLAY_MODE = {
  composite: "blend",
  clipToObject: true,
  cellFill: "clamped",
  renderOrphanVariantLayers: false,
  opacity: 0.4,
  borderColor: "rgba(139, 92, 246, 0.6)",
  borderDash: [6, 6],
} as const;

/** The settled parameter set for the frame-trace overlay (#9). */
export const FRAME_TRACE_MODE = {
  composite: "overwrite",
  clipToObject: false,
  cellFill: "whole",
  renderOrphanVariantLayers: true,
  opacity: 0.5,
  borderColor: "rgba(255, 171, 0, 0.6)",
  borderDash: [4, 4],
} as const;
