/**
 * layerColors — the SHARED, store-free vocabulary for the layer-colour
 * swatch strip (REFRESH task 36, W27).
 *
 * ⚠️ Deliberately split from the SCAN. The scan itself walks every pixel of a
 * grid, so R2 keeps it in `containers/hooks/layerColorExtraction.ts`. But its
 * RESULT TYPE and the swatch key helper are pure data with no store and no
 * pixel iteration, and `LayerColors` (a `ui/` component) has to name both.
 *
 * Putting them here rather than in the hook is what keeps the boundary honest:
 * `ui/` may not import from `containers/`, and re-exporting the type through
 * the hook would have made the component reach across that line for a type it
 * is entitled to.
 */
import type { Color } from "../../types";

/** The result of a unique-colour scan over a layer (or over all frames). */
export interface LayerColorsData {
  /** Swatches, luminance-sorted. EMPTY when `exceeded` is true. */
  colors: Color[];
  /** True when the scan passed its display cap and bailed out early. */
  exceeded: boolean;
  /** How many distinct colours were seen before the scan stopped. */
  count: number;
}

/** Unique key for a colour — the swatch list's React key. */
export function colorKey(c: Color): string {
  return `${c.r}-${c.g}-${c.b}-${c.a}`;
}
