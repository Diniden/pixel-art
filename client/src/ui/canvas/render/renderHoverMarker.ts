/**
 * The hover marker — a faint outline of the cells the next edit would touch.
 *
 * ## What it is for
 *
 * On the iPad, an Apple Pencil reports its position while HOVERING, before the
 * tip touches the glass. That signal is bridged into the page by the companion
 * app (`usePencilHover`), and this module is what the user actually sees: the
 * footprint of the active tool, drawn where the pencil is pointing, so a
 * stroke can be aimed before it is committed. On desktop the same marker
 * follows the mouse.
 *
 * ## Why it does not reuse `renderBrushOverlay` wholesale
 *
 * It reuses `paintBrushCells` — the alpha-compositing fill loop is identical
 * and there is no reason for two of them. What it does NOT reuse is the
 * lighting studio's STYLE. `BRUSH_OVERLAY_STYLE` is a 22%-alpha fill with a
 * 55% outline, which is the right weight for "these cells are being painted
 * right now, on a normal-map surface". A hover marker is a different claim —
 * "an edit here would land on these cells" — and at that weight, over the
 * user's actual artwork, it reads as a committed stroke. Hence the fainter
 * pair in `canvasTokens`.
 *
 * ## The fill/outline split, inherited
 *
 * Same reason as `renderBrushOverlay`: `canvasStub` rasterises `fillRect`
 * exactly but only RECORDS `strokeRect`'s path work, so a single buffer
 * function covering both would hash the fill and silently lose the outline.
 * The fill goes through the shared buffer painter; the outline is stroked by
 * the caller through {@link strokeHoverOutline}.
 *
 * ## The outline is the PERIMETER, not per-cell boxes
 *
 * `strokeBrushOutlines` draws one rectangle per cell, which at brush size 12
 * is 100+ nested boxes — legible as "the brush", illegible as "where my
 * pencil is". This module strokes only the edges that face OUTSIDE the
 * footprint, so a round brush reads as one round outline. At brush size 1 the
 * two are identical, which is the common case on a tablet.
 *
 * Pure: no store, no MobX, no API, no DOM beyond the context the caller
 * passes to the one stroking function.
 */

import {
  HOVER_MARKER_FILL,
  HOVER_MARKER_STROKE,
} from "../../theme/canvasTokens";
import type { BrushCell, PixelBuffer } from "./renderBrushOverlay";
import { paintBrushCells } from "./renderBrushOverlay";

/** The marker's two colours. Fainter than `BRUSH_OVERLAY_STYLE` on purpose. */
export const HOVER_MARKER_STYLE = {
  /** Parsed RGBA, as the buffer painter needs it. Mirrors HOVER_MARKER_FILL. */
  fill: { r: 0, g: 217, b: 255, a: 0.1 },
  /** A CSS string, handed straight to `ctx.strokeStyle`. */
  stroke: HOVER_MARKER_STROKE,
  lineWidth: 1,
} as const;

/** The CSS form of the fill, for consumers that need the string. */
export const HOVER_MARKER_FILL_CSS = HOVER_MARKER_FILL;

/** One edge of the footprint's perimeter, in buffer pixel coordinates. */
export interface MarkerEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Paint the translucent hover cells into `buffer`, returning it.
 *
 * A thin wrapper over `paintBrushCells` with this module's fill. Kept as a
 * named export rather than leaving callers to remember which style to pass,
 * because passing the lighting studio's style here is exactly the mistake the
 * module header warns about.
 */
export function paintHoverCells(
  buffer: PixelBuffer,
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
): PixelBuffer {
  return paintBrushCells(buffer, cells, zoom, HOVER_MARKER_STYLE.fill);
}

/**
 * The footprint's outer perimeter, as line segments in buffer coordinates.
 *
 * An edge is on the perimeter when the neighbouring cell across it is NOT in
 * the footprint. The `+ 0.5` offset is the canonical half pixel that lands a
 * 1px stroke on pixel centres instead of straddling two — the same constant
 * `brushCellOutlines` uses, and for the same reason.
 */
export function markerPerimeter(
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
): MarkerEdge[] {
  const present = new Set(cells.map((c) => `${c.x},${c.y}`));
  const has = (x: number, y: number) => present.has(`${x},${y}`);

  const edges: MarkerEdge[] = [];
  for (const { x, y } of cells) {
    const left = x * zoom + 0.5;
    const top = y * zoom + 0.5;
    const right = left + zoom - 1;
    const bottom = top + zoom - 1;

    if (!has(x, y - 1)) edges.push({ x1: left, y1: top, x2: right, y2: top });
    if (!has(x, y + 1))
      edges.push({ x1: left, y1: bottom, x2: right, y2: bottom });
    if (!has(x - 1, y)) edges.push({ x1: left, y1: top, x2: left, y2: bottom });
    if (!has(x + 1, y))
      edges.push({ x1: right, y1: top, x2: right, y2: bottom });
  }
  return edges;
}

/**
 * Stroke the perimeter onto a real 2D context.
 *
 * Separated from `markerPerimeter` so the geometry stays unit-testable while
 * the drawing — which the canvas stub does not rasterise faithfully at
 * sub-pixel offsets — stays here.
 */
export function strokeHoverOutline(
  ctx: CanvasRenderingContext2D,
  cells: ReadonlyArray<BrushCell>,
  zoom: number,
): void {
  const edges = markerPerimeter(cells, zoom);
  if (edges.length === 0) return;

  ctx.strokeStyle = HOVER_MARKER_STYLE.stroke;
  ctx.lineWidth = HOVER_MARKER_STYLE.lineWidth;
  ctx.beginPath();
  for (const e of edges) {
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
  }
  ctx.stroke();
}
