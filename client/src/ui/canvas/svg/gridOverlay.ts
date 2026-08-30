/**
 * The pixel grid, as SVG path data.
 *
 * ## Why the grid left the canvas
 *
 * Under the 1:1 canvas model (plan 05, decision D1) a canvas backing store is
 * `gridWidth × gridHeight` device pixels — one sprite pixel is one canvas
 * pixel — and all magnification is a CSS `scale(zoom * viewZoom)` on
 * `.canvas__layout`. `canvasBackground.ts`'s `strokeGrid` cannot survive that:
 * it places lines at `x * zoom + 0.5`, so at `zoom = 1` there is one line per
 * pixel column and the "grid" becomes a flat wash of `gridStroke` across the
 * whole canvas. It fails silently — no error, just a grey rectangle.
 *
 * SVG restores the intent. The element sits INSIDE `.canvas__layout` and so
 * inherits the same transform as the canvases, but a stroke marked
 * `vector-effect="non-scaling-stroke"` is exempted from that transform: a
 * `stroke-width` of 1 is 1 SCREEN pixel at every zoom, which is exactly the
 * hairline the canvas grid was trying to be.
 *
 * ## The coordinate model (shared with `chromeOverlay.ts`)
 *
 * The consumer (task 04) renders:
 *
 *     <svg viewBox="0 0 {cellWidth} {cellHeight}"
 *          width={cellWidth} height={cellHeight}>
 *
 * so **one SVG user unit = one grid cell**, matching the 1:1 canvases exactly.
 * Every coordinate this module emits is therefore in CELL space.
 *
 * ⚠️ The `+ 0.5` half-pixel offsets are DROPPED. They exist in
 * `gridLinePath` to centre a 1px canvas stroke on a device pixel
 * (`canvasBackground.ts:165-179`); with `non-scaling-stroke` the browser
 * already centres the screen-space hairline on the user-space line, and
 * keeping the offset would shift the whole grid half a cell.
 *
 * `shape-rendering="crispEdges"` is emitted on the grid — and only on the grid
 * — so the hairlines snap to device-pixel boundaries instead of antialiasing
 * into a 2px smear. The chrome overlays deliberately do NOT get it: they carry
 * diagonals (the lasso, reflection guides) which crispEdges would alias badly.
 *
 * ## The alpha rule
 *
 * Preserved verbatim from the measurement recorded at
 * `canvasBackground.ts:19-24`: **black at 8% in light mode, white at 5% in dark
 * mode**. That asymmetry is not a bug — it is what `Canvas.tsx:400-402`
 * actually did, and it is documented there specifically because the task-30
 * spec got it wrong. `BLACK_08` / `WHITE_05` come from `ui/theme/canvasTokens`.
 *
 * ## Purity
 *
 * Data out, not JSX: path strings plus attribute objects. No React, no store,
 * no MobX, no API, no DOM. Task 04 renders what this returns; keeping the
 * split means the geometry stays testable as pure functions, exactly like
 * every other module under `ui/canvas/`.
 */

import { BLACK_08, WHITE_05 } from "@/ui/theme/canvasTokens";
import { gridLinePath } from "@/ui/canvas/render/canvasBackground";

/** The 1:1 dimensions of the overlay, in grid cells. */
export interface GridOverlayGeometry {
  /** Grid cells across. One cell = one SVG user unit. */
  cellWidth: number;
  /** Grid cells down. */
  cellHeight: number;
}

/**
 * The stroke attributes of an SVG element, named as the SVG attributes they
 * become. Emitted as data so the consumer can spread them onto an element
 * without this module importing React.
 */
export interface SvgStrokeAttrs {
  stroke: string;
  "stroke-width": number;
  "vector-effect": "non-scaling-stroke";
  "stroke-dasharray"?: string;
  "stroke-dashoffset"?: number;
  "stroke-linecap"?: "butt" | "round" | "square";
  fill: "none";
  opacity?: number;
  "shape-rendering"?: "crispEdges" | "auto";
}

/** One `<path>`: its `d` plus the attributes it is stroked with. */
export interface SvgPathSpec {
  d: string;
  attrs: SvgStrokeAttrs;
}

/**
 * The grid, as a single `<path>`.
 *
 * All `cellWidth + 1` vertical and `cellHeight + 1` horizontal lines (both
 * outer edges included — see `canvasBackground.ts:163`) collapse into one `d`
 * string. One element rather than thousands matters: a 256×224 grid is 482
 * lines, and 482 DOM nodes on a transformed layer is a measurable compositing
 * cost where one node is free.
 *
 * `lightGridMode` selects the alpha rule: black 8% light, white 5% dark.
 */
export function gridOverlayPath(
  geom: GridOverlayGeometry,
  lightGridMode: boolean,
): SvgPathSpec {
  return {
    d: gridOverlayPathData(geom),
    attrs: gridOverlayAttrs(lightGridMode),
  };
}

/**
 * The `d` attribute for the grid lines, in cell units.
 *
 * Built on `gridLinePath` with **`zoom = 1`**, which is what makes one user
 * unit one cell. The `+ 0.5` that function bakes in is subtracted back out —
 * see the header. Calling with `zoom = 1` also means `canvasWidth`/
 * `canvasHeight` are the cell counts, so the spans are the full extent.
 */
export function gridOverlayPathData(geom: GridOverlayGeometry): string {
  const { cellWidth, cellHeight } = geom;

  const lines = gridLinePath({
    canvasWidth: cellWidth,
    canvasHeight: cellHeight,
    cellsX: cellWidth,
    cellsY: cellHeight,
    offsetX: 0,
    offsetY: 0,
    // ⚠️ zoom = 1: coordinates come out in CELL space; the viewBox does the
    // mapping to screen. Anything else here reintroduces the bug this task
    // exists to fix.
    zoom: 1,
  });

  // `gridLinePath` adds the canonical half pixel for a canvas stroke. SVG's
  // non-scaling-stroke centres the hairline itself, so it comes straight back
  // off; `HALF_PIXEL` is named rather than inlined so a reader can see this is
  // undoing a documented offset, not a fudge factor.
  //
  // The offset sits ONLY on the line's own axis — a vertical line is
  // `x1 = x2 = x*zoom + 0.5` with `y1 = 0, y2 = canvasHeight`, and those
  // spans are already exact. So it is removed per-axis, not per-endpoint.
  const HALF_PIXEL = 0.5;

  const parts: string[] = [];
  for (const line of lines) {
    const vertical = line.x1 === line.x2;
    const x1 = vertical ? line.x1 - HALF_PIXEL : line.x1;
    const x2 = vertical ? line.x2 - HALF_PIXEL : line.x2;
    const y1 = vertical ? line.y1 : line.y1 - HALF_PIXEL;
    const y2 = vertical ? line.y2 : line.y2 - HALF_PIXEL;
    parts.push(`M${x1} ${y1}L${x2} ${y2}`);
  }
  return parts.join("");
}

/**
 * The grid's stroke attributes.
 *
 * The colour is the measured alpha rule and nothing else: black 8% in light
 * mode (`BLACK_08`), white 5% in dark mode (`WHITE_05`). No new colour is
 * introduced here and none may be.
 */
export function gridOverlayAttrs(lightGridMode: boolean): SvgStrokeAttrs {
  return {
    stroke: lightGridMode ? BLACK_08 : WHITE_05,
    "stroke-width": 1,
    "vector-effect": "non-scaling-stroke",
    "shape-rendering": "crispEdges",
    fill: "none",
  };
}
