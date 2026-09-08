/**
 * Brush timeline-cell thumbnail painting (Brush Studio plan,
 * `docs/01-brush-studio`, task 18).
 *
 * The brush analogue of `./timelineCellThumbnail.ts`: the code that walks a
 * grid stays on the container side and reaches `ui/` only as a bound
 * `draw(ctx, size)` closure for the `ThumbnailCanvas` primitive (via
 * `TimelineCell`). No component ever holds a `BrushLayer`.
 *
 * ── One renderer, not two ─────────────────────────────────────────────────
 *
 * The cells are colourised by `renderBrushLayer` (task 06) — the SAME
 * `paintBrushLayer` core the brush canvas composites through — into a
 * `PixelBuffer`, and only the scaling below is local. So a thumbnail can
 * never disagree with the canvas about what a delta looks like: a change to
 * D5's mapping shows up in both or in neither. `renderBrushLayer` paints a
 * layer whether or not it is `visible` (HANDOFF W2/06) — a hidden layer's
 * cell still shows what it holds, as the pixel studio's layer rows do.
 *
 * ── Scaling ───────────────────────────────────────────────────────────────
 *
 * `Math.min` of the two ratios, so a non-square brush FITS the cell rather
 * than overflowing it. That is deliberately NOT what `renderLayerThumbnail`
 * does (single-axis divisor — see its header); the task asked for the
 * `renderFramePreview` behaviour here, and a brush is more often non-square
 * than a project is.
 *
 * ── The scratch buffer ────────────────────────────────────────────────────
 *
 * ONE module-level `PixelBuffer`, reallocated only when the document size
 * changes. Every `draw` is synchronous and single-threaded (the effect in
 * `ThumbnailCanvas` paints and returns), so no two closures ever hold the
 * buffer at once. It is scratch, never a cache: nothing reads it back after
 * `draw` returns, so a stale buffer cannot show a stale thumbnail.
 *
 * Pure apart from the canvas API: no store, no MobX, no API.
 */
import type { BrushLayer } from "../../types";
import {
  createBrushBuffer,
  renderBrushLayer,
  type PixelBuffer,
} from "../../ui/canvas/render/renderBrushFrame";

let scratch: PixelBuffer | null = null;

/** The shared scratch buffer, resized on demand. See the header. */
function scratchBuffer(width: number, height: number): PixelBuffer {
  const w = Math.max(0, Math.floor(width)) || 0;
  const h = Math.max(0, Math.floor(height)) || 0;
  if (scratch === null || scratch.width !== w || scratch.height !== h) {
    scratch = createBrushBuffer(w, h);
  }
  return scratch;
}

/**
 * Draw an RGBA `buffer` centred and scaled to fit a `thumbSize`² canvas.
 * Transparent cells are skipped; the rest are filled at their composited
 * alpha, so a mid-grey zero-delta cell reads as mid-grey, not as nothing.
 */
export function renderBrushBufferThumbnail(
  ctx: CanvasRenderingContext2D,
  thumbSize: number,
  buffer: PixelBuffer,
): void {
  const { width, height, data } = buffer;
  ctx.clearRect(0, 0, thumbSize, thumbSize);
  if (width === 0 || height === 0) return;

  // Fit BOTH axes — see the header.
  const scale = Math.min(thumbSize / width, thumbSize / height);
  const offsetX = (thumbSize - width * scale) / 2;
  const offsetY = (thumbSize - height * scale) / 2;
  const side = Math.ceil(scale) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue;
      ctx.fillStyle = `rgba(${data[i]}, ${data[i + 1]}, ${data[i + 2]}, ${a / 255})`;
      ctx.fillRect(
        Math.floor(offsetX + x * scale),
        Math.floor(offsetY + y * scale),
        side,
        side,
      );
    }
  }
}

/**
 * Paints one brush timeline cell: `layer`'s own cells, colourised exactly as
 * the canvas colourises them, fitted into the thumbnail.
 *
 * `width`/`height` are the DOCUMENT's extent, not the grid's — cells outside
 * it are never read (`renderBrushLayer`'s clipping rule). Returns a closure
 * suitable for `ThumbnailCanvas`'s `draw` prop; the caller supplies the
 * `revision` (`brushes.pixelVersion`, MASTER D8) that decides when it runs.
 */
export function makeBrushCellThumbnailDraw(
  layer: BrushLayer,
  width: number,
  height: number,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, thumbSize) => {
    const buffer = renderBrushLayer(
      scratchBuffer(width, height),
      layer,
      width,
      height,
    );
    renderBrushBufferThumbnail(ctx, thumbSize, buffer);
  };
}
