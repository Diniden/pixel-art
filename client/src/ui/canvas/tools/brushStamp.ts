/**
 * The brush stamp — segment + brush shape + dedupe + bounds → pixel list.
 *
 * ## Why this module exists
 *
 * `Canvas.tsx` computed this same list in **eight** places: the mouse and touch
 * down/move handlers for the pixel and eraser tools, plus the reference-trace
 * and frame-trace stamping paths. Seven of the eight applied a bounds filter.
 * **One did not** — `handleTouchStart`'s eraser branch — and that divergence is
 * the drift recorded as R10 and answered by OPEN-QUESTIONS Q44.
 *
 * The owner's decision (2026-08-16) is to unify onto the MOUSE behaviour, i.e.
 * bounds filtering always. This module is that single implementation, so the
 * two input devices can no longer disagree: there is exactly one code path and
 * `stampSegment` does not take a "should I filter" option to get wrong.
 *
 * ## What the drift actually cost — measured, and narrower than it looks
 *
 * The unfiltered touch stamp did NOT corrupt memory. `PixelStore.setPixels`
 * independently drops any cell outside `[0,width) x [0,height)` before building
 * a patch (`PixelStore.ts:652`), and task 08 pins that as observed behaviour
 * ("FILTERS out-of-bounds entries rather than throwing"). So the out-of-bounds
 * cells were discarded one layer further down than on the mouse path.
 *
 * The divergence was therefore observable in two narrower ways, both real:
 *
 * 1. **Work proportional to garbage.** At the grid edge with a large brush, the
 *    touch path allocated and handed over cells that were then thrown away.
 * 2. **`editMask` selection behaviour.** `setPixels` applies the mask check
 *    AFTER the bounds check, so the two paths fed different candidate sets into
 *    it. Unifying removes the possibility of that disagreeing.
 *
 * Calling it a "latent out-of-bounds write" overstates the memory risk. It was
 * a real behavioural divergence between two input devices for the same gesture,
 * which is reason enough to close it.
 *
 * ## Purity
 *
 * No store, no MobX, no DOM. The brush-shape functions live in
 * `components/Canvas/drawingUtils.ts`, which sits OUTSIDE the `ui/` boundary, so
 * they are **injected** as a `BrushShapeFn` rather than imported — importing
 * downward from `ui/` into `components/` would invert the layering the ESLint
 * boundary rule enforces.
 */

/** A whole-cell grid coordinate. */
export interface StampPoint {
  x: number;
  y: number;
}

/** The editable grid's extent. Cells outside it are always dropped. */
export interface StampBounds {
  gridWidth: number;
  gridHeight: number;
}

/**
 * An RGBA colour, structurally. Declared here rather than imported so this
 * module keeps no dependency on the domain types.
 */
export interface StampColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A brush-shape generator — `getCirclePixels` / `getSquarePixels` from
 * `drawingUtils`. It returns entries carrying a colour, which this module
 * discards: the stamp's job is geometry, and the caller decides the colour
 * (the eraser passes the `0` sentinel, the pencil a `Color`).
 *
 * The `color` parameter is typed structurally rather than as `unknown` because
 * a function parameter is contravariant: `unknown` here would make the real
 * `getCirclePixels` (which wants a `Color`) unassignable to this type.
 */
export type BrushShapeFn = (
  center: StampPoint,
  size: number,
  color: StampColor,
) => ReadonlyArray<{ x: number; y: number }>;

/** A line rasteriser — `getLinePixels` from `drawingUtils`. */
export type LineFn = (
  start: StampPoint,
  end: StampPoint,
) => ReadonlyArray<StampPoint>;

/** Everything the stamp needs that it will not import for itself. */
export interface StampOptions extends StampBounds {
  /** Brush diameter in cells. `<= 1` means the single cell under the cursor. */
  brushSize: number;
  /** Shape generator for `brushSize > 1`. Ignored at size 1. */
  shape: BrushShapeFn;
  /**
   * Colour handed to `shape`. Only forwarded so the injected generators keep
   * their existing signature; the returned geometry never depends on it.
   *
   * ⚠️ The legacy eraser passed `currentColor` here, NOT the `0` sentinel, and
   * that is preserved deliberately — `getCirclePixels` uses the argument only
   * to populate a field this module drops, so it cannot affect the result, and
   * changing it would be an unnecessary behaviour risk in a refactor.
   */
  shapeColor: StampColor;
}

/** True when the cell lies inside the editable grid. */
export function inBounds(p: StampPoint, bounds: StampBounds): boolean {
  return (
    p.x >= 0 && p.x < bounds.gridWidth && p.y >= 0 && p.y < bounds.gridHeight
  );
}

/**
 * The cells one brush press covers, bounds-filtered.
 *
 * At `brushSize <= 1` this is the single cell under the cursor — and it is
 * bounds-checked too. The legacy size-1 paths skipped the check because
 * `getPixelCoords` had already rejected off-grid coordinates by returning
 * `null`, so the filter is a no-op in production and a safety net in tests.
 */
export function stampAt(
  center: StampPoint,
  options: StampOptions,
): StampPoint[] {
  const { brushSize, shape, shapeColor, gridWidth, gridHeight } = options;
  const bounds = { gridWidth, gridHeight };

  if (brushSize <= 1) {
    const single = { x: center.x, y: center.y };
    return inBounds(single, bounds) ? [single] : [];
  }

  const out: StampPoint[] = [];
  for (const p of shape(center, brushSize, shapeColor)) {
    if (inBounds(p, bounds)) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * The cells a drag segment covers: rasterise `prev → next`, stamp the brush at
 * every step, drop out-of-bounds cells, and de-duplicate.
 *
 * `prev` is `null` at the start of a stroke (and after the pointer has left the
 * drawable area), in which case only `next` is stamped — the legacy code did
 * exactly this to avoid "bridging" a long gap when the pointer re-enters.
 *
 * De-duplication matters for undo, not just for speed: `PixelStore.setPixels`
 * records one patch per cell and lets later writes win, so a duplicated cell
 * within a single batch would still resolve correctly — but the batch would
 * carry redundant entries, and the 50-pixel-stroke byte gate measures that.
 */
export function stampSegment(
  prev: StampPoint | null,
  next: StampPoint,
  line: LineFn,
  options: StampOptions,
): StampPoint[] {
  const moved = prev !== null && (prev.x !== next.x || prev.y !== next.y);
  const segment = moved ? line(prev, next) : [next];

  const seen = new Set<number>();
  const out: StampPoint[] = [];
  const { gridWidth } = options;

  for (const step of segment) {
    for (const p of stampAt(step, options)) {
      // Cells are already bounds-filtered, so `y * gridWidth + x` is a unique
      // non-negative key — cheaper than the legacy `${x},${y}` string.
      const key = p.y * gridWidth + p.x;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }

  return out;
}
