/**
 * The canvas chrome — brush outline, hover outline, lasso, marching ants,
 * origin cross and reflection guides — as SVG path data.
 *
 * ## Why these six left the canvas (plan 05, decision D5)
 *
 * Under the 1:1 canvas model every canvas backing store is `gridWidth ×
 * gridHeight` device pixels and all magnification is a CSS
 * `scale(zoom * viewZoom)` on `.canvas__layout`. Painters that draw cell
 * FILLS survive that untouched (D6, and they stay on canvas). These six do
 * not, and — this is the dangerous part — five of the six fail SILENTLY:
 *
 * | Painter | At `zoom = 1` |
 * | --- | --- |
 * | `strokeBrushOutlines` | `width: zoom - 1` → `strokeRect(x, y, 0, 0)` |
 * | `strokeHoverOutline` | every edge is zero-length; with `lineCap: butt` it renders NOTHING |
 * | `drawMarchingAnts` | a 1px inset is one whole cell; `width - 2` inverts below 3 cells |
 * | `drawLasso` | a 2px line with a `[3,3]` dash on a buffer where a cell is 1px |
 * | `drawOriginCross` | `ORIGIN_CROSS_SIZE = 12` is documented screen-constant; under CSS scale it becomes 12 × 50 |
 * | `drawReflectionLines` | `REFLECTION_DASH = 4` likewise; at zoom 20 a 4px dash is 80px |
 *
 * The last two are the clearest statement of the problem: their own comments
 * (`renderOriginCross.ts:45-50`, `renderReflectionLines.ts:67-72`) declare an
 * invariant — "the same visual size at every zoom level" — that CSS scaling
 * INVERTS. `vector-effect="non-scaling-stroke"` restores exactly that
 * invariant, natively and for free.
 *
 * ## The coordinate model
 *
 * Identical to `gridOverlay.ts`. The consumer (task 04) renders
 * `<svg viewBox="0 0 {cellWidth} {cellHeight}" width={cellWidth}
 * height={cellHeight}>` inside `.canvas__layout`, so **one SVG user unit =
 * one grid cell** and the element inherits the same transform as the
 * canvases. Everything here is emitted in CELL space.
 *
 * Every geometry function is imported UNMODIFIED from `ui/canvas/render/` and
 * called with **`zoom = 1`**. That is not an optimisation, it is the contract:
 * a `* zoom` surviving anywhere in this module reintroduces the bug the whole
 * plan exists to remove. `chromeOverlay.test.ts` pins it.
 *
 * ⚠️ The `+ 0.5` half-pixel offsets those functions bake in are DROPPED. They
 * centre a 1px CANVAS stroke on a device pixel; SVG's non-scaling-stroke does
 * that itself, and keeping them shifts every overlay half a cell.
 *
 * ## Stroke width and dash under non-scaling-stroke
 *
 * Both are interpreted in SCREEN units when `vector-effect` is
 * `non-scaling-stroke`. So `stroke-width: 2` really is 2 screen px at zoom 50,
 * and `REFLECTION_DASH = 4` and the marching ants' `[4,4]` keep their
 * documented meaning with no conversion at all. This is why the existing style
 * constants transfer verbatim and why no new width or dash is invented here.
 *
 * ## What non-scaling-stroke does NOT fix: screen-constant LENGTHS
 *
 * `vector-effect` exempts the stroke from the transform. It does not exempt
 * the geometry. The origin cross's 12px arms and its radius-3 circle are
 * lengths, not strokes, so they cannot be baked into cell-space path data and
 * stay screen-constant — at zoom 50 an arm of "12 user units" is 600 screen
 * px, which is the original bug wearing a different hat.
 *
 * So {@link originCrossOverlay} does NOT return a path string. It returns the
 * CENTRE in cell space plus the arm half-length and radius as SCREEN pixels,
 * and the consumer places them in a counter-scaled group:
 *
 *     <g transform={`translate(${cx} ${cy}) scale(${1 / combinedScale})`}>
 *
 * inside which one user unit is one screen pixel again and the constants can
 * be used verbatim. Returning the numbers rather than a string is what makes
 * that possible without this module knowing the scale — which it must not,
 * because the scale lives in a store.
 *
 * ## Purity
 *
 * Data out, not JSX: path strings and attribute objects. No React, no store,
 * no MobX, no API, no DOM. Task 04 renders it.
 */

import {
  brushCellOutlines,
  BRUSH_OVERLAY_STYLE,
  type BrushCell,
} from "@/ui/canvas/render/renderBrushOverlay";
import {
  markerPerimeter,
  HOVER_MARKER_STYLE,
} from "@/ui/canvas/render/renderHoverMarker";
import {
  lassoPath,
  marchingAntsRects,
  SELECTION_COLOR,
  type SelectionBounds,
} from "@/ui/canvas/render/renderSelectionOverlay";
import {
  originCrossGeometry,
  ORIGIN_CROSS_SIZE,
  ORIGIN_CROSS_RADIUS,
} from "@/ui/canvas/render/renderOriginCross";
import {
  reflectionSegments,
  REFLECTION_DASH,
  REFLECTION_DASH_PERIOD,
  type ReflectionLineInput,
} from "@/ui/canvas/render/renderReflectionLines";
import { ACCENT_VARIANT, WHITE } from "@/ui/theme/canvasTokens";
import type { SvgPathSpec, SvgStrokeAttrs } from "./gridOverlay";

export type { SvgPathSpec, SvgStrokeAttrs } from "./gridOverlay";

/**
 * Every geometry function under `ui/canvas/render/` is called with this.
 *
 * Named rather than inlined so the constraint is greppable: search for
 * `CELL_SPACE_ZOOM` and you find every call site that had to opt in, and any
 * future `* zoom` stands out as the anomaly it would be.
 */
const CELL_SPACE_ZOOM = 1;

/** The canonical half pixel baked into the canvas geometry functions. */
const HALF_PIXEL = 0.5;

/**
 * The one exception to {@link CELL_SPACE_ZOOM}, used only by
 * {@link hoverOutlineOverlay} — see its doc comment for why `markerPerimeter`
 * cannot be probed at 1. NOT a view zoom, and nothing derived from one: it is
 * a fixed normalisation constant divided straight back out.
 */
const PERIMETER_PROBE_ZOOM = 2;

/* ------------------------------------------------------------------ *
 * Brush outline
 * ------------------------------------------------------------------ */

/**
 * The brush footprint as one rectangle per cell — the lighting studio's
 * "these cells are being painted" chrome.
 *
 * `brushCellOutlines` returns `{x: cx + 0.5, y: cy + 0.5, width: zoom - 1,
 * height: zoom - 1}`. At `zoom = 1` that is a 0×0 rect at a half-cell offset,
 * which is the degenerate case the audit calls out. Undoing the half pixel
 * puts the corner back on the cell boundary, and the size becomes a full cell
 * — one user unit — because in cell space a cell IS one unit. The
 * `zoom - 1` shrink existed only to keep a 1px canvas stroke inside the cell;
 * non-scaling-stroke centres it on the boundary instead.
 */
export function brushOutlineOverlay(
  cells: ReadonlyArray<BrushCell>,
): SvgPathSpec {
  const rects = brushCellOutlines(cells, CELL_SPACE_ZOOM);

  const parts: string[] = [];
  for (const r of rects) {
    const x = r.x - HALF_PIXEL;
    const y = r.y - HALF_PIXEL;
    parts.push(`M${x} ${y}h1v1h-1Z`);
  }

  return {
    d: parts.join(""),
    attrs: {
      stroke: BRUSH_OVERLAY_STYLE.stroke,
      "stroke-width": BRUSH_OVERLAY_STYLE.lineWidth,
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Hover outline
 * ------------------------------------------------------------------ */

/**
 * The hover marker's outer PERIMETER — only the edges facing outside the
 * footprint, so a round brush reads as one round outline rather than 100+
 * nested boxes (`renderHoverMarker.ts` header).
 *
 * ⚠️ **This is the one overlay that cannot call its geometry function at
 * `zoom = 1`, and the reason is worth stating precisely.**
 *
 * `markerPerimeter` places each edge at `cell * zoom + 0.5` and spans it by
 * `zoom - 1`. At `zoom = 1` that span is ZERO, so all four edges of a cell
 * collapse onto the single point `(cell + 0.5, cell + 0.5)` — they become not
 * merely zero-length but mutually INDISTINGUISHABLE. That total collapse is
 * exactly the silent failure R3 names (on canvas, with `lineCap: "butt"`, it
 * renders nothing at all), and it means the zoom-1 output carries no
 * information about which edge is which and cannot be rescued after the fact.
 *
 * So the function is called at `PERIMETER_PROBE_ZOOM = 2` — the smallest scale
 * at which `zoom - 1 = 1` and an edge's direction survives — and the result is
 * divided straight back down. `markerPerimeter` is linear in `zoom` apart from
 * the constant half pixel and its one-stroke-width inset, both of which the
 * `norm` helper below undoes exactly (see its comment for why the arithmetic
 * is exact rather than approximate).
 *
 * This is a NORMALISATION, not a scale factor: nothing about the view's zoom
 * reaches it, and the zoom-independence test pins that. What it buys is that
 * the perimeter RULE — which edges face outside the footprint — stays owned by
 * `markerPerimeter` rather than being duplicated here, where it could drift.
 *
 * The style is deliberately the FAINTER `HOVER_MARKER_STYLE`, never
 * `BRUSH_OVERLAY_STYLE` — that substitution is the exact mistake
 * `renderHoverMarker.ts`'s header warns about.
 */
export function hoverOutlineOverlay(
  cells: ReadonlyArray<BrushCell>,
): SvgPathSpec {
  const edges = markerPerimeter(cells, PERIMETER_PROBE_ZOOM);

  /**
   * Undo the probe, in one step per coordinate.
   *
   * At probe scale a coordinate is `cell * 2 + 0.5` on a near edge and
   * `cell * 2 + 1.5` on a far one — the far edge being `zoom - 1 = 1` unit
   * along rather than the full `zoom = 2`, because `markerPerimeter` insets by
   * one stroke width. Stripping the half pixel leaves `cell * 2` or
   * `cell * 2 + 1`; dividing by the probe gives `cell` or `cell + 0.5`.
   *
   * So a near edge lands exactly on `cell` and a far edge lands HALF a cell
   * short of `cell + 1`. `ceil` fixes both at once: it is the identity on the
   * integer and lifts the half to the cell boundary the edge actually
   * represents. Exact, not approximate — the fraction can only ever be 0 or
   * 0.5, because both inputs are integer multiples of the probe plus the
   * constant half pixel.
   */
  const norm = (n: number) =>
    Math.ceil((n - HALF_PIXEL) / PERIMETER_PROBE_ZOOM);

  const parts: string[] = [];
  for (const e of edges) {
    parts.push(`M${norm(e.x1)} ${norm(e.y1)}L${norm(e.x2)} ${norm(e.y2)}`);
  }

  return {
    d: parts.join(""),
    attrs: {
      stroke: HOVER_MARKER_STYLE.stroke,
      "stroke-width": HOVER_MARKER_STYLE.lineWidth,
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Lasso
 * ------------------------------------------------------------------ */

/**
 * The lasso rubber band.
 *
 * `lassoPath`'s `+ 0.5` is NOT a stroke-centring offset and is therefore
 * KEPT: it puts each vertex at its cell's CENTRE rather than its top-left
 * corner, so the band tracks the cells the user actually crossed
 * (`renderSelectionOverlay.ts:226-236`). In cell space that is literally the
 * centre of the unit square, which is what we want.
 *
 * Fewer than two points strokes nothing, matching `drawLasso`'s own guard.
 */
export function lassoOverlay(
  points: ReadonlyArray<{ x: number; y: number }>,
  offsetX: number,
  offsetY: number,
): SvgPathSpec {
  const attrs: SvgStrokeAttrs = {
    stroke: SELECTION_COLOR,
    "stroke-width": 2,
    "stroke-dasharray": "3 3",
    "vector-effect": "non-scaling-stroke",
    fill: "none",
  };

  if (points.length <= 1) return { d: "", attrs };

  const path = lassoPath(points, CELL_SPACE_ZOOM, offsetX, offsetY);
  const head = path[0];
  if (!head) return { d: "", attrs };

  let d = `M${head.x} ${head.y}`;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (!p) continue;
    d += `L${p.x} ${p.y}`;
  }
  return { d, attrs };
}

/* ------------------------------------------------------------------ *
 * Marching ants
 * ------------------------------------------------------------------ */

/**
 * The marching-ants selection box: two nested dashed rectangles, the inner one
 * half a dash period out of phase with the outer, which is what reads as
 * motion even though nothing animates.
 *
 * ⚠️ The INNER rect is not inset here. `marchingAntsRects` insets it by 1
 * device pixel and shrinks it by 2 — correct on a scaled canvas, catastrophic
 * at 1:1 where 1 device pixel is one whole CELL and `width - 2` goes negative
 * for any selection under 3 cells (a negative `width` on `strokeRect` inverts
 * the rectangle). Under non-scaling-stroke the two strokes are already
 * screen-width, so they overlap on the same cell-space rectangle exactly as
 * they visually did before — the 1px inset was compensating for canvas
 * geometry that no longer exists.
 *
 * `marchingAntsRects` is still what computes the box: it is called with
 * `zoom = 1`, its `outer` is used verbatim, and its `inner` is deliberately
 * discarded for the reason above.
 */
export function marchingAntsOverlay(
  box: SelectionBounds,
  offsetX: number,
  offsetY: number,
  dragDx = 0,
  dragDy = 0,
): { outer: SvgPathSpec; inner: SvgPathSpec } {
  const { outer } = marchingAntsRects(
    box,
    CELL_SPACE_ZOOM,
    offsetX,
    offsetY,
    dragDx,
    dragDy,
  );

  const d = rectPath(outer);

  return {
    outer: {
      d,
      attrs: {
        stroke: SELECTION_COLOR,
        "stroke-width": 2,
        "stroke-dasharray": "4 4",
        "vector-effect": "non-scaling-stroke",
        fill: "none",
      },
    },
    inner: {
      d,
      attrs: {
        stroke: WHITE,
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
        // The constant `4` from `drawMarchingAnts` — half a dash period, the
        // phase difference that makes the ants read as marching.
        "stroke-dashoffset": 4,
        "vector-effect": "non-scaling-stroke",
        fill: "none",
      },
    },
  };
}

/** A closed rectangle as path data, in whatever units it arrives in. */
function rectPath(r: SelectionBounds): string {
  return `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`;
}

/* ------------------------------------------------------------------ *
 * Origin cross
 * ------------------------------------------------------------------ */

/**
 * The origin cross: two arms and a centre circle, all SCREEN-constant.
 *
 * This is the one overlay that cannot be a cell-space path — see the module
 * header. `centerX`/`centerY` are in CELL space (from `originCrossGeometry`
 * at `zoom = 1`, which makes them the origin coordinates themselves, half
 * pixels and all — those are deliberate and are not rounded). `armLength` and
 * `radius` are in SCREEN pixels, to be used inside a group counter-scaled by
 * `1 / combinedScale`.
 *
 * The arm path is emitted relative to that group's own origin — `M-12 0H12`
 * and `M0 -12V12` — so the consumer needs only the translate+scale wrapper
 * and no arithmetic of its own.
 */
export interface OriginCrossOverlay {
  /** Cross centre, in CELL space — place the group here. */
  centerX: number;
  centerY: number;
  /** Arm half-length, in SCREEN pixels. `ORIGIN_CROSS_SIZE`. */
  armLength: number;
  /** Centre dot radius, in SCREEN pixels. `ORIGIN_CROSS_RADIUS`. */
  radius: number;
  /** The two arms, relative to the counter-scaled group's origin. */
  arms: SvgPathSpec;
  /** The centre dot, as `<circle>` attributes relative to that same origin. */
  circle: {
    cx: number;
    cy: number;
    r: number;
    attrs: SvgStrokeAttrs;
  };
}

export function originCrossOverlay(
  origin: { x: number; y: number },
  color: string,
): OriginCrossOverlay {
  const g = originCrossGeometry(origin, CELL_SPACE_ZOOM);

  // Inside the counter-scaled group one unit is one screen pixel, so the arms
  // are the raw constants about a local origin of (0, 0).
  const arm = ORIGIN_CROSS_SIZE;

  const attrs: SvgStrokeAttrs = {
    stroke: color,
    "stroke-width": 2,
    "vector-effect": "non-scaling-stroke",
    fill: "none",
  };

  return {
    centerX: g.centerX,
    centerY: g.centerY,
    armLength: arm,
    radius: g.radius,
    arms: {
      d: `M${-arm} 0H${arm}M0 ${-arm}V${arm}`,
      attrs,
    },
    circle: {
      cx: 0,
      cy: 0,
      r: ORIGIN_CROSS_RADIUS,
      attrs,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Reflection guides
 * ------------------------------------------------------------------ */

/**
 * One reflection guide: the same segment stroked twice, purple then white half
 * a dash period out of step, so the white fills the purple's gaps and the pair
 * reads as one continuous crawling line (`renderReflectionLines.ts` header).
 */
export interface ReflectionGuideOverlay {
  /** The purple pass. */
  base: SvgPathSpec;
  /** The white pass, offset by half a dash period. */
  highlight: SvgPathSpec;
  /** True for the in-progress drag, which renders at half alpha. */
  draft: boolean;
}

/**
 * The reflection guides.
 *
 * `dashOffset` is a PARAMETER, not a ticker. `renderReflectionLines` drives
 * `lineDashOffset` from a ~12 fps `useDashTicker`; this module stays pure and
 * lets task 04 decide whether to keep driving it from React state or to hand
 * the animation to CSS (`@keyframes` on `stroke-dashoffset` would work and
 * would cost no JS at all — but that is task 04's call, and no animation is
 * built here).
 *
 * The sign convention is preserved from `drawReflectionLines`: the offset is
 * NEGATED so an increasing phase makes the dashes travel from the first
 * endpoint towards the second, and it is wrapped modulo
 * `REFLECTION_DASH_PERIOD` so an unbounded counter from any caller still
 * animates rather than drifting into float-precision territory.
 *
 * Draft segments carry `opacity: 0.5` — the SVG equivalent of the painter's
 * `globalAlpha = 0.5` — and are returned last so they paint on top.
 */
export function reflectionGuideOverlays(
  lines: readonly ReflectionLineInput[],
  draft: ReflectionLineInput | null,
  viewOriginX: number,
  viewOriginY: number,
  dashOffset: number,
): ReflectionGuideOverlay[] {
  const segments = reflectionSegments(
    lines,
    draft,
    CELL_SPACE_ZOOM,
    viewOriginX,
    viewOriginY,
  );

  const wrapped =
    ((dashOffset % REFLECTION_DASH_PERIOD) + REFLECTION_DASH_PERIOD) %
    REFLECTION_DASH_PERIOD;
  const dash = `${REFLECTION_DASH} ${REFLECTION_DASH}`;

  return segments.map((seg) => {
    const d = `M${seg.x1} ${seg.y1}L${seg.x2} ${seg.y2}`;
    const opacity = seg.draft ? 0.5 : 1;

    return {
      draft: seg.draft,
      base: {
        d,
        attrs: {
          stroke: ACCENT_VARIANT,
          "stroke-width": 2,
          "stroke-dasharray": dash,
          "stroke-dashoffset": -wrapped,
          "vector-effect": "non-scaling-stroke",
          fill: "none",
          opacity,
        },
      },
      highlight: {
        d,
        attrs: {
          stroke: WHITE,
          "stroke-width": 1,
          "stroke-dasharray": dash,
          "stroke-dashoffset": -wrapped + REFLECTION_DASH,
          "vector-effect": "non-scaling-stroke",
          fill: "none",
          opacity,
        },
      },
    };
  });
}
