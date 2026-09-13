/**
 * The reflection guides — animated dotted lines the reflection tool leaves
 * behind, marking the axes every drawn pixel is mirrored across.
 *
 * ## Why this file is split in two
 *
 * Same reason as `renderOriginCross.ts`: the guides are drawn with
 * `moveTo`/`lineTo`/`stroke`, and the test rasteriser (`src/test/canvasStub.ts`)
 * does NOT rasterise paths — it records them on `ctx.calls` and leaves the pixel
 * buffer untouched, so a golden hash would be meaningless.
 *
 * So the GEOMETRY is `reflectionSegments`, which is pure data and fully
 * unit-testable, and the STROKING is `drawReflectionLines`, asserted
 * structurally via `ctx.calls`.
 *
 * ## Why the guide is the dragged segment, not an infinite line
 *
 * The reflection *effect* is infinite — a cell is mirrored across the infinite
 * line through the two endpoints, no matter how short the user's drag was. The
 * *guide* is deliberately only the segment that was drawn (locked decision D8):
 * an edge-to-edge line across a zoomed-out canvas reads as chrome, and the
 * segment is what the user placed and what the panel lists.
 *
 * ## How this differs from the marching ants
 *
 * `renderSelectionOverlay.ts`'s `drawMarchingAnts` uses the same two-pass dash
 * trick — a thick coloured line and a thin white one offset by half a dash
 * period — but it is STATIC: `lineDashOffset` is the constant `4`, so the phase
 * difference reads as texture rather than motion. Here the offset is driven by
 * a `phase` the caller advances over time (`ui/hooks/useDashTicker.ts`), so the
 * dashes actually crawl.
 *
 * Colours are `ACCENT_VARIANT` (purple) rather than the selection's cyan, so a
 * reflection guide is never mistaken for a selection edge.
 *
 * Pure: no store, no MobX, no API.
 */

import { ACCENT_VARIANT, WHITE } from "@/ui/theme/canvasTokens";

/**
 * A reflection line in GRID space, as the painter needs it.
 *
 * Declared locally rather than imported from `ui/canvas/model/reflection.ts`:
 * that module owns the domain type (with its `id` and its geometry helpers) and
 * this painter needs only the four numbers. Keeping the input structural means
 * the painter can be tested and reasoned about without the model, and the
 * model's `ReflectionLine` satisfies it by construction.
 */
export interface ReflectionLineInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A line mapped into canvas (device) pixels, ready to stroke. */
export interface ReflectionSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** True for the in-progress drag, which strokes at half alpha. */
  draft: boolean;
}

/**
 * Dash length in SCREEN pixels. Deliberately not scaled by zoom — like
 * `ORIGIN_CROSS_SIZE`, the guide keeps the same visual texture at every zoom
 * level, which is what keeps it legible when zoomed far out.
 */
export const REFLECTION_DASH = 4;

/**
 * One full dash cycle (on + off). The animation phase wraps at this value:
 * advancing past it is visually identical to starting over, so the ticker
 * counts modulo this and the painter never sees an unbounded number.
 */
export const REFLECTION_DASH_PERIOD = REFLECTION_DASH * 2;

/** A segment with no length would stroke nothing (or a dot artefact). */
function isDegenerate(s: { x1: number; y1: number; x2: number; y2: number }) {
  return s.x1 === s.x2 && s.y1 === s.y2;
}

/**
 * Map reflection lines from grid space into canvas pixels.
 *
 * The overlay canvas is `canvasWidth × canvasHeight` device pixels carrying the
 * same pan/zoom CSS transform as the main surface, so a grid coordinate `g`
 * lands at `(g - viewOrigin) * zoom` — the identical mapping `renderOverlay`
 * uses in `CanvasContainer` (where `viewOrigin` is `viewMinX`/`viewMinY` while
 * editing a variant and `0` otherwise).
 *
 * Endpoints are NOT rounded. The reflection tool snaps to the integer CORNER
 * lattice, but presets may sit on half-integers for odd grid sizes, and at an
 * odd zoom a legitimate half-pixel position must survive — same reasoning as
 * `originCrossGeometry`.
 *
 * The draft is appended last so it strokes on top of the committed guides.
 * Degenerate (zero-length) lines are dropped here rather than in the stroke, so
 * the geometry test can prove it without a context.
 */
export function reflectionSegments(
  lines: readonly ReflectionLineInput[],
  draft: ReflectionLineInput | null,
  zoom: number,
  viewOriginX: number,
  viewOriginY: number,
): ReflectionSegment[] {
  const segments: ReflectionSegment[] = [];

  const map = (line: ReflectionLineInput, draftFlag: boolean) => {
    const seg: ReflectionSegment = {
      x1: (line.x1 - viewOriginX) * zoom,
      y1: (line.y1 - viewOriginY) * zoom,
      x2: (line.x2 - viewOriginX) * zoom,
      y2: (line.y2 - viewOriginY) * zoom,
      draft: draftFlag,
    };
    // Test degeneracy on the GRID coordinates, not the mapped ones: at zoom 0
    // every segment collapses, and a zero-length grid line is the real defect.
    if (isDegenerate(line)) return;
    segments.push(seg);
  };

  for (const line of lines) map(line, false);
  if (draft) map(draft, true);

  return segments;
}

/**
 * Stroke the reflection guides as animated dotted lines.
 *
 * Each segment is stroked TWICE: a 2px `ACCENT_VARIANT` line, then a 1px `WHITE`
 * line half a dash period out of step. That is the two-phase trick from
 * `drawMarchingAnts` — the white fills the purple's gaps, so the line reads as
 * continuous while the alternation reads as motion once `phase` advances.
 *
 * `lineDashOffset` is NEGATIVE `phase` so an increasing phase makes the dashes
 * travel from the first endpoint towards the second (a positive offset would
 * run them backwards). `phase` is taken modulo `REFLECTION_DASH_PERIOD` here as
 * well as in the ticker, so an unbounded counter from any caller still animates
 * correctly rather than drifting into float-precision territory.
 *
 * Draft segments stroke at `globalAlpha` 0.5 — visibly provisional while the
 * drag is in flight.
 *
 * Dash, offset, alpha and line width are all restored at the end: this overlay
 * is one canvas among several and must not leave state behind for whatever
 * paints next.
 */
export function drawReflectionLines(
  ctx: CanvasRenderingContext2D,
  segments: readonly ReflectionSegment[],
  phase: number,
): void {
  if (segments.length === 0) return;

  const wrapped =
    ((phase % REFLECTION_DASH_PERIOD) + REFLECTION_DASH_PERIOD) %
    REFLECTION_DASH_PERIOD;

  for (const seg of segments) {
    if (isDegenerate(seg)) continue;

    ctx.globalAlpha = seg.draft ? 0.5 : 1;

    ctx.strokeStyle = ACCENT_VARIANT;
    ctx.lineWidth = 2;
    ctx.setLineDash([REFLECTION_DASH, REFLECTION_DASH]);
    ctx.lineDashOffset = -wrapped;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();

    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1;
    ctx.setLineDash([REFLECTION_DASH, REFLECTION_DASH]);
    ctx.lineDashOffset = -wrapped + REFLECTION_DASH;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}
