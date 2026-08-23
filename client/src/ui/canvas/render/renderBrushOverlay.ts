/**
 * The lighting studio's brush hover overlay — the cyan cells under the cursor.
 *
 * Extracted from `LightingCanvas.tsx:315-340` (`renderBrushOverlay`), task 33.
 *
 * ## Why this one is split in two
 *
 * The original drew each paintable cell TWICE: a translucent `fillRect` and then
 * a 1px `strokeRect` inset by the canonical half pixel. `canvasStub` rasterises
 * `fillRect` exactly but only RECORDS `strokeRect`'s path work, so a single
 * buffer function covering both would hash the fill and silently lose the
 * outline (the failure mode `hashContext`'s blank-buffer throw exists to expose).
 *
 * So the fill is {@link paintBrushCells} — buffer in, buffer out, hashable — and
 * the outline is {@link brushCellOutlines}, which returns the rectangles as
 * DATA. The caller strokes them. This is the same split `canvasBackground` uses
 * for `paintCheckerboard` / `gridLinePath`, and for the same reason.
 *
 * ## The overlay does not decide WHICH cells
 *
 * `getPaintableBrushPixels` — brush shape, brush size, and the "only over an
 * existing colour" test — needs the layer's pixel grid, which may not cross into
 * `ui/` (R2). The caller resolves the cell list; this module places it.
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

/** A minimal structural stand-in for `ImageData`. */
import { ACCENT_PRIMARY_55 } from "../../theme/canvasTokens";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A grid cell, in cell coordinates. */
export interface BrushCell {
  x: number;
  y: number;
}

/**
 * The overlay's two colours, verbatim from `LightingCanvas.tsx:333,337`.
 *
 * `fill` is kept as the parsed RGBA the buffer painter needs; `stroke` stays a
 * CSS string because the caller hands it straight to `ctx.strokeStyle`.
 */
export const BRUSH_OVERLAY_STYLE = {
  fill: { r: 0, g: 217, b: 255, a: 0.22 },
  stroke: ACCENT_PRIMARY_55,
  lineWidth: 1,
} as const;

/**
 * Paint the translucent brush cells into `buffer`, returning it.
 *
 * The buffer is NOT cleared: the caller passes a fresh transparent buffer,
 * exactly as the original `clearRect`ed before drawing. Cells composite
 * source-over against whatever is already there, which for a fresh buffer means
 * premultiplying against transparent black — the same result `fillRect` with an
 * `rgba()` style gives on a cleared canvas.
 */
export function paintBrushCells(
  buffer: PixelBuffer,
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
  fill: {
    r: number;
    g: number;
    b: number;
    a: number;
  } = BRUSH_OVERLAY_STYLE.fill,
): PixelBuffer {
  const { data, width, height } = buffer;
  const sa = fill.a;
  if (sa <= 0) return buffer;

  for (const cell of cells) {
    const startX = cell.x * zoom;
    const startY = cell.y * zoom;

    for (let dy = 0; dy < zoom; dy++) {
      const y = startY + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = 0; dx < zoom; dx++) {
        const x = startX + dx;
        if (x < 0 || x >= width) continue;

        const idx = (y * width + x) * 4;
        const da = (data[idx + 3] ?? 0) / 255;
        const outA = sa + da * (1 - sa);
        if (outA <= 0) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
          continue;
        }
        data[idx] = Math.round(
          (fill.r * sa + (data[idx] ?? 0) * da * (1 - sa)) / outA,
        );
        data[idx + 1] = Math.round(
          (fill.g * sa + (data[idx + 1] ?? 0) * da * (1 - sa)) / outA,
        );
        data[idx + 2] = Math.round(
          (fill.b * sa + (data[idx + 2] ?? 0) * da * (1 - sa)) / outA,
        );
        data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  return buffer;
}

/** One outline rectangle, in buffer pixel coordinates. */
export interface BrushOutline {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The outline rectangles for `cells`, as data.
 *
 * The `+ 0.5` inset and the `zoom - 1` size are the original's, and they are the
 * canonical way to land a 1px stroke on pixel centres instead of straddling two.
 */
export function brushCellOutlines(
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
): BrushOutline[] {
  return cells.map((cell) => ({
    x: cell.x * zoom + 0.5,
    y: cell.y * zoom + 0.5,
    width: zoom - 1,
    height: zoom - 1,
  }));
}

/**
 * Stroke the outlines onto a real 2D context. Separated from
 * `brushCellOutlines` so the geometry stays unit-testable while the drawing,
 * which the stub does not rasterise faithfully at sub-pixel offsets, stays here.
 */
export function strokeBrushOutlines(
  ctx: CanvasRenderingContext2D,
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
): void {
  ctx.strokeStyle = BRUSH_OVERLAY_STYLE.stroke;
  ctx.lineWidth = BRUSH_OVERLAY_STYLE.lineWidth;
  for (const rect of brushCellOutlines(cells, zoom)) {
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
}
