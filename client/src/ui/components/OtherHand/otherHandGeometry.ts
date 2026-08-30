/**
 * otherHandGeometry — the pure maths behind the Other Hand widgets.
 *
 * Kept out of the component files so they export components only (the
 * fast-refresh rule) and so the maths is unit-testable without a DOM.
 *
 * `ui/` boundary: no imports at all.
 */

/** A widget's top-left corner as percentages of the stage. */
export interface OtherHandSurfacePosition {
  x: number;
  y: number;
}

/** How many widgets sit side by side before the default row wraps. */
export const ROW_CAPACITY = 4;

/**
 * Where an unarranged widget goes, as the CSS in `OtherHand.css` expresses
 * it: a row index, and a fraction of the row's span.
 *
 * The fraction is the widget's place between the row's two edges — 0 is
 * flush against the left inset, 1 flush against the right, and a lone widget
 * sits in the middle. The CSS turns the fraction into a `left` and a
 * matching `translateX(-fraction)`, which is what spreads N widgets evenly
 * between two fixed insets without knowing how wide a widget is.
 */
export function defaultWidgetSlot(
  index: number,
  count: number,
): { row: number; fraction: number } {
  const row = Math.floor(index / ROW_CAPACITY);
  const first = row * ROW_CAPACITY;
  const inRow = Math.min(ROW_CAPACITY, count - first);
  const at = index - first;
  return { row, fraction: inRow <= 1 ? 0.5 : at / (inRow - 1) };
}

/** Snap `value` to the step grid and clamp it to the range. */
export function snapToStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = Math.max(min, Math.min(max, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Fixed-decimal rounding so 0.1 steps do not accumulate float noise.
  const decimals = Number.isInteger(step) ? 0 : 4;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimals));
}

/**
 * The value a vertical track reports for a pointer at `clientY`. The bottom
 * of the track is `min`, the top is `max`.
 */
export function valueAtTrackY(
  clientY: number,
  trackTop: number,
  trackHeight: number,
  min: number,
  max: number,
  step: number,
): number {
  if (trackHeight <= 0) return min;
  const fraction = 1 - (clientY - trackTop) / trackHeight;
  return snapToStep(min + fraction * (max - min), min, max, step);
}
