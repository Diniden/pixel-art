/**
 * The main scene: every visible layer's pixels, plus the in-flight preview
 * pixels, painted into a buffer.
 *
 * Extracted from `Canvas.tsx:494-712` (the layer-painting half of concern #6).
 * The selection chrome and origin cross that followed it live in
 * `renderSelectionOverlay.ts` and `renderOriginCross.ts`.
 *
 * ## Two modes that are genuinely different, not two spellings of one
 *
 * `"normal"` paints every layer at full opacity, clipped to the canvas.
 *
 * `"variant-edit"` paints an EXPANDED view — the union of the object's bounds
 * and the variant's — and dims everything that is not being edited so the
 * editable variant stands out:
 *
 * | Layer | Normal | Variant-edit |
 * | ----- | ------ | ------------ |
 * | Regular | alpha × 1.0 | alpha × **0.5** |
 * | Variant, currently edited | alpha × 1.0 | alpha × 1.0 |
 * | Variant, other | alpha × 1.0 | alpha × **0.7** |
 *
 * They also clip differently: normal mode rejects a cell whose ORIGIN falls
 * outside the canvas; variant-edit rejects one whose WORLD position falls
 * outside the view bounds. Both preserved verbatim.
 *
 * Coordinates here are VIEW-space cells. In variant-edit mode `Canvas.tsx`
 * applied a `ctx.translate(-viewMinX * zoom, -viewMinY * zoom)`; this buffer
 * renderer folds that into `ox`/`oy` instead, since the test stub only supports
 * integer translation and folding it in is exact.
 *
 * Pure: no store, no MobX, no API.
 */

import { resolveVariantOffset } from "../model/variantOffset";
import type { Offset } from "../model/variantOffset";

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

export interface SceneSourceLayer {
  visible: boolean;
  pixels?: ReadonlyArray<ReadonlyArray<unknown>> | undefined;
}

export interface SceneLayer extends SceneSourceLayer {
  id?: string | undefined;
  isVariant?: boolean | undefined;
  variantGroupId?: string | undefined;
  selectedVariantId?: string | undefined;
  variantOffsets?: { [variantId: string]: Offset } | undefined;
  variantOffset?: Offset | undefined;
}

export interface SceneVariant {
  id: string;
  gridSize: { width: number; height: number };
  frames: ReadonlyArray<{ layers: ReadonlyArray<SceneSourceLayer> }>;
  baseFrameOffsets?: { [frameIndex: number]: Offset } | Offset[] | undefined;
}

export interface SceneVariantGroup {
  id: string;
  variants: ReadonlyArray<SceneVariant>;
}

/** Dimming applied to a regular layer while a variant is being edited. */
export const VARIANT_EDIT_REGULAR_DIM = 0.5;
/** Dimming applied to a NON-edited variant layer while a variant is being edited. */
export const VARIANT_EDIT_OTHER_DIM = 0.7;
/** Opacity of the in-flight preview (brush) pixels. */
export const PREVIEW_ALPHA = 0.6;

export interface RenderSceneOptions {
  mode: "normal" | "variant-edit";
  layers: ReadonlyArray<SceneLayer>;
  /** Editable grid size (variant's size in variant-edit mode). */
  gridWidth: number;
  gridHeight: number;
  /** The object's own grid size. */
  objWidth: number;
  objHeight: number;
  zoom: number;
  /** View origin in world cells; non-zero only in variant-edit mode. */
  viewMinX: number;
  viewMinY: number;
  /** View extent in world cells. Used by variant-edit clipping. */
  viewMaxX: number;
  viewMaxY: number;
  variants?: ReadonlyArray<SceneVariantGroup> | undefined;
  variantFrameIndices?: { [variantGroupId: string]: number } | undefined;
  /** Index of the base frame being rendered — level 3 of the offset fallback. */
  baseFrameIndex: number;
  /** Id of the layer being edited; drives the "is current" dimming decision. */
  currentLayerId?: string | undefined;
  getPixelColor: (cell: unknown) => RgbaPixel | null;
}

/** Write one cell, source-over, with an extra opacity multiplier. */
function paintCell(
  buffer: PixelBuffer,
  cellX: number,
  cellY: number,
  pixel: RgbaPixel,
  zoom: number,
  opacity: number,
): void {
  const { data, width, height } = buffer;
  const srcAlpha = (pixel.a / 255) * opacity;
  const startX = cellX * zoom;
  const startY = cellY * zoom;

  for (let dy = 0; dy < zoom; dy++) {
    const y = startY + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = 0; dx < zoom; dx++) {
      const x = startX + dx;
      if (x < 0 || x >= width) continue;
      const idx = (y * width + x) * 4;
      const dstAlpha = data[idx + 3] / 255;
      const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
      if (outAlpha > 0.01) {
        const inv = 1 / outAlpha;
        data[idx] = (pixel.r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 1] = (pixel.g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 2] = (pixel.b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 3] = outAlpha * 255;
      }
    }
  }
}

/**
 * Paint all visible layers into `buffer`.
 *
 * The buffer is not cleared — callers composite the scene over an already-painted
 * checkerboard background, exactly as `Canvas.tsx` drew the cached bg first.
 */
export function renderScene(
  buffer: PixelBuffer,
  opts: RenderSceneOptions,
): PixelBuffer {
  const {
    mode, layers, gridWidth, gridHeight, objWidth, objHeight, zoom,
    viewMinX, viewMinY, viewMaxX, viewMaxY,
    variants, variantFrameIndices, baseFrameIndex, currentLayerId, getPixelColor,
  } = opts;

  const editing = mode === "variant-edit";

  for (const l of layers) {
    if (!l.visible) continue;

    if (l.isVariant && l.variantGroupId) {
      const vg = variants?.find((g) => g.id === l.variantGroupId);
      const variant = vg?.variants.find((v) => v.id === l.selectedVariantId);
      const variantFrameIdx = variantFrameIndices?.[l.variantGroupId] ?? 0;
      const vFrame =
        variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];
      if (!variant || !vFrame) continue;

      const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);
      const isCurrentLayer = l.id != null && l.id === currentLayerId;
      const opacity = editing
        ? isCurrentLayer
          ? 1
          : VARIANT_EDIT_OTHER_DIM
        : 1;

      for (const vl of vFrame.layers) {
        if (!vl.visible) continue;
        for (let y = 0; y < variant.gridSize.height; y++) {
          const row = vl.pixels?.[y];
          if (!row) continue;
          for (let x = 0; x < variant.gridSize.width; x++) {
            const pixel = getPixelColor(row[x]);
            if (!pixel || pixel.a === 0) continue;

            const worldX = x + vOffset.x;
            const worldY = y + vOffset.y;

            if (editing) {
              // Variant-edit clips on WORLD position against the view bounds.
              if (
                worldX < viewMinX || worldX >= viewMaxX ||
                worldY < viewMinY || worldY >= viewMaxY
              ) {
                continue;
              }
            } else {
              // Normal mode clips on the cell ORIGIN against the canvas.
              const drawX = worldX * zoom;
              const drawY = worldY * zoom;
              if (
                drawX < 0 || drawX >= buffer.width ||
                drawY < 0 || drawY >= buffer.height
              ) {
                continue;
              }
            }

            paintCell(buffer, worldX - viewMinX, worldY - viewMinY, pixel, zoom, opacity);
          }
        }
      }
      continue;
    }

    // Regular layer. Note the bounds differ by mode: variant-edit walks the
    // OBJECT's dimensions, normal mode walks the editable grid. In normal mode
    // these coincide; in variant-edit the grid is the VARIANT's, so using it
    // would truncate the object. Verbatim from the original.
    const h = editing ? objHeight : gridHeight;
    const w = editing ? objWidth : gridWidth;
    const opacity = editing ? VARIANT_EDIT_REGULAR_DIM : 1;

    for (let y = 0; y < h; y++) {
      const row = l.pixels?.[y];
      if (!row) continue;
      for (let x = 0; x < w; x++) {
        const pixel = getPixelColor(row[x]);
        if (!pixel || pixel.a === 0) continue;
        paintCell(buffer, x - viewMinX, y - viewMinY, pixel, zoom, opacity);
      }
    }
  }

  return buffer;
}

export interface PreviewPixelsOptions {
  points: ReadonlyArray<{ x: number; y: number }>;
  color: RgbaPixel;
  gridWidth: number;
  gridHeight: number;
  zoom: number;
  /** Cell offset — the variant offset in variant-edit mode, else zero. */
  offsetX: number;
  offsetY: number;
  /** View origin in world cells. */
  viewMinX: number;
  viewMinY: number;
}

/**
 * Paint the in-flight brush preview.
 *
 * Points outside the editable grid are dropped BEFORE the offset is applied —
 * the bounds test is in grid space, the draw is in world space.
 */
export function paintPreviewPixels(
  buffer: PixelBuffer,
  opts: PreviewPixelsOptions,
): PixelBuffer {
  const {
    points, color, gridWidth, gridHeight, zoom,
    offsetX, offsetY, viewMinX, viewMinY,
  } = opts;

  for (const { x, y } of points) {
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
    paintCell(
      buffer,
      x + offsetX - viewMinX,
      y + offsetY - viewMinY,
      color,
      zoom,
      PREVIEW_ALPHA,
    );
  }

  return buffer;
}
