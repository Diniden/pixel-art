/**
 * Selection chrome: the mask fill, the move-pixels drag preview, the lasso path
 * and the marching-ants selection box.
 *
 * Extracted from `Canvas.tsx:713-853`.
 *
 * ## What can and cannot be hash-tested
 *
 * - The **mask fill** and the **drag preview** are `fillRect` work → they
 *   rasterise through the test stub and ARE hash-tested.
 * - The **lasso outline** and the **marching ants** are dashed strokes → the
 *   stub records them on `ctx.calls` but rasterises nothing. Their geometry is
 *   therefore computed by pure functions (`lassoPath`, `marchingAntsRects`)
 *   which ARE unit-tested, while the stroking is asserted structurally.
 *
 * ## The 20,000-cell mask guard
 *
 * Both the mask fill and the drag preview bail when `mask.size > 20000`. That is
 * a deliberate performance guard from the original ("keeps things snappy on big
 * grids"), and it means a large selection renders NO fill — pinned, not fixed.
 *
 * Pure: no store, no MobX, no API.
 */

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

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Above this many selected cells, the fills are skipped entirely. */
export const MASK_FILL_LIMIT = 20000;

/** The cyan the selection chrome is drawn in. */
export const SELECTION_COLOR = "#00d9ff";

/** Mask fill tint, as premultiplied-free RGBA 0-255. `rgba(0, 217, 255, 0.14)`. */
export const MASK_FILL: RgbaPixel = { r: 0, g: 217, b: 255, a: Math.round(0.14 * 255) };

/** Shade drawn over the ORIGINAL area while dragging pixels. `rgba(0,0,0,0.12)`. */
export const DRAG_SHADE: RgbaPixel = { r: 0, g: 0, b: 0, a: Math.round(0.12 * 255) };

/**
 * Blend a flat colour over one cell of the buffer, source-over.
 *
 * The original drew these with `ctx.fillStyle = "rgba(...)"` + `fillRect`, which
 * is a source-over composite. Reproduced here so the buffer form matches what a
 * real canvas produces.
 */
function fillCell(
  buffer: PixelBuffer,
  cellX: number,
  cellY: number,
  zoom: number,
  color: RgbaPixel,
): void {
  const { data, width, height } = buffer;
  const srcAlpha = color.a / 255;
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
        data[idx] = (color.r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 1] = (color.g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 2] = (color.b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * inv;
        data[idx + 3] = outAlpha * 255;
      }
    }
  }
}

export interface MaskFillOptions {
  /** Flat indices of selected cells, `y * width + x`. */
  mask: ReadonlySet<number>;
  /** Width the mask indices are relative to. */
  maskWidth: number;
  zoom: number;
  /** Cell offset applied to every drawn cell (variant offset + drag delta). */
  offsetX: number;
  offsetY: number;
  color?: RgbaPixel;
}

/**
 * Paint the translucent fill over every selected cell.
 *
 * Returns `false` without touching the buffer when the mask exceeds
 * {@link MASK_FILL_LIMIT} — the caller can use that to assert the guard fired.
 */
export function paintMaskFill(
  buffer: PixelBuffer,
  opts: MaskFillOptions,
): boolean {
  const { mask, maskWidth, zoom, offsetX, offsetY } = opts;
  if (mask.size > MASK_FILL_LIMIT) return false;

  const color = opts.color ?? MASK_FILL;
  for (const idx of mask) {
    const x = idx % maskWidth;
    const y = Math.floor(idx / maskWidth);
    fillCell(buffer, x + offsetX, y + offsetY, zoom, color);
  }
  return true;
}

export interface DragPreviewOptions {
  mask: ReadonlySet<number>;
  maskWidth: number;
  zoom: number;
  /** Base cell offset (the variant offset), WITHOUT the drag delta. */
  offsetX: number;
  offsetY: number;
  /** The drag delta, in cells. */
  dragDx: number;
  dragDy: number;
  /** Editable grid bounds — moved cells outside these are dropped. */
  gridWidth: number;
  gridHeight: number;
  /** Reads the colour of a source cell at grid `(x, y)`, or `null` if empty. */
  readPixel: (x: number, y: number) => RgbaPixel | null;
}

/**
 * Non-destructive preview of a "move pixels" drag: shade the original area, then
 * draw the moved pixels on top.
 *
 * Returns `false` when the mask guard fires.
 */
export function paintDragPreview(
  buffer: PixelBuffer,
  opts: DragPreviewOptions,
): boolean {
  const {
    mask, maskWidth, zoom, offsetX, offsetY,
    dragDx, dragDy, gridWidth, gridHeight, readPixel,
  } = opts;
  if (mask.size > MASK_FILL_LIMIT) return false;

  // Pass 1 — shade the vacated area. Purely visual; the data is untouched.
  for (const idx of mask) {
    const x = idx % maskWidth;
    const y = Math.floor(idx / maskWidth);
    fillCell(buffer, x + offsetX, y + offsetY, zoom, DRAG_SHADE);
  }

  // Pass 2 — the moved pixels, drawn on top at full opacity.
  for (const idx of mask) {
    const x = idx % maskWidth;
    const y = Math.floor(idx / maskWidth);
    const destX = x + dragDx;
    const destY = y + dragDy;
    if (destX < 0 || destX >= gridWidth || destY < 0 || destY >= gridHeight) {
      continue;
    }
    const pixel = readPixel(x, y);
    if (!pixel || pixel.a === 0) continue;
    fillCell(buffer, destX + offsetX, destY + offsetY, zoom, pixel);
  }
  return true;
}

/** A point on the lasso outline, in canvas pixels. */
export interface CanvasPoint {
  x: number;
  y: number;
}

/**
 * The lasso outline's vertices, in canvas pixels.
 *
 * The `+ 0.5` puts each vertex at its cell's CENTRE rather than its top-left
 * corner, so the rubber band tracks the cells the user actually crossed.
 * Verbatim from the original.
 */
export function lassoPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  zoom: number,
  offsetX: number,
  offsetY: number,
): CanvasPoint[] {
  return points.map((p) => ({
    x: (p.x + 0.5 + offsetX) * zoom,
    y: (p.y + 0.5 + offsetY) * zoom,
  }));
}

/** Stroke the lasso rubber band. Not hashable — assert via `ctx.calls`. */
export function drawLasso(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  zoom: number,
  offsetX: number,
  offsetY: number,
): void {
  if (points.length <= 1) return;
  const path = lassoPath(points, zoom, offsetX, offsetY);

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The two nested rectangles that make up the marching-ants box. */
export interface MarchingAntsRects {
  /** Outer cyan rect. */
  outer: SelectionBounds;
  /** Inner white rect, inset by 1px, dash-offset to make the ants march. */
  inner: SelectionBounds;
}

/**
 * Geometry of the marching-ants selection box.
 *
 * Two dashed rectangles with the same 4px dash but the inner one offset by half
 * a dash period — that phase difference is what reads as motion even though
 * nothing animates.
 */
export function marchingAntsRects(
  box: SelectionBounds,
  zoom: number,
  offsetX: number,
  offsetY: number,
  dragDx = 0,
  dragDy = 0,
): MarchingAntsRects {
  const x = (box.x + offsetX + dragDx) * zoom;
  const y = (box.y + offsetY + dragDy) * zoom;
  const width = box.width * zoom;
  const height = box.height * zoom;

  return {
    outer: { x, y, width, height },
    inner: { x: x + 1, y: y + 1, width: width - 2, height: height - 2 },
  };
}

/**
 * Stroke the marching-ants selection box.
 *
 * `strokeRect` IS rasterised by the test stub, but as a filled outline rather
 * than a dashed one — the dash is ignored. So this is asserted via `ctx.calls`
 * like the other chrome.
 */
export function drawMarchingAnts(
  ctx: CanvasRenderingContext2D,
  box: SelectionBounds,
  zoom: number,
  offsetX: number,
  offsetY: number,
  dragDx = 0,
  dragDy = 0,
): void {
  const { outer, inner } = marchingAntsRects(box, zoom, offsetX, offsetY, dragDx, dragDy);

  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(outer.x, outer.y, outer.width, outer.height);
  ctx.setLineDash([]);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = 4;
  ctx.strokeRect(inner.x, inner.y, inner.width, inner.height);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}
