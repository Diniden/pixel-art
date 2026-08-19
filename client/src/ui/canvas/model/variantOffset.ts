/**
 * The 4-level variant-offset fallback rule.
 *
 * This is domain logic that lived in a view file, copied verbatim five times
 * inside `Canvas.tsx` (lines 541, 663, 1113, 1390, 1915 before task 30) and
 * twice more under `utils/`. Every copy was a place the precedence could drift.
 *
 * The precedence, highest to lowest:
 *
 *   1. `layer.variantOffsets[selectedVariantId]` — the per-variant offset map,
 *      the current format.
 *   2. `layer.variantOffset` — the LEGACY single offset, kept for projects that
 *      predate the map.
 *   3. `variant.baseFrameOffsets[baseFrameIndex]` — the variant's own per-base-
 *      frame offset table.
 *   4. `{ x: 0, y: 0 }`.
 *
 * ⚠️ Each level is selected with `??`, so a level only falls through when it is
 * `null`/`undefined` — NOT when it is falsy. This matters: an offset of
 * `{x: 0, y: 0}` stored at level 1 wins over a non-zero level 3, and that is
 * OBSERVED behaviour pinned by task 08, not an accident to be tidied away.
 *
 * ⚠️ `selectedVariantId` is coerced with `?? ""` before the map lookup, exactly
 * as all five copies did. A layer with no selected variant therefore probes the
 * `""` key rather than skipping level 1. Preserved deliberately.
 *
 * Pure: no store, no MobX, no API. Takes plain data.
 */

/** A 2D integer offset in grid cells. */
export interface Offset {
  x: number;
  y: number;
}

/**
 * The subset of a `Layer` this rule reads. Structural so both the domain
 * `Layer` type and test fixtures satisfy it without `ui/` importing `types/`
 * domain models it does not need.
 */
export interface VariantOffsetLayer {
  variantOffsets?: { [variantId: string]: Offset } | undefined;
  variantOffset?: Offset | undefined;
  selectedVariantId?: string | undefined;
}

/** The subset of a `Variant` this rule reads. */
export interface VariantOffsetVariant {
  baseFrameOffsets?: { [frameIndex: number]: Offset } | Offset[] | undefined;
}

/** The zero offset returned by level 4. A fresh object per call — callers mutate. */
const ZERO: Offset = { x: 0, y: 0 };

/**
 * Resolve the offset a variant layer's pixels are drawn at.
 *
 * @param layer - the base-frame layer carrying the variant binding
 * @param variant - the selected variant
 * @param baseFrameIndex - index of the BASE frame being rendered, used for the
 *   level-3 `baseFrameOffsets` lookup. Callers pass the result of
 *   `frames.findIndex(...)`, which is `-1` when the frame is not found; a `-1`
 *   lookup misses and falls through to level 4, matching the previous copies.
 */
export function resolveVariantOffset(
  layer: VariantOffsetLayer,
  variant: VariantOffsetVariant,
  baseFrameIndex: number,
): Offset {
  return (
    layer.variantOffsets?.[layer.selectedVariantId ?? ""] ??
    layer.variantOffset ??
    (variant.baseFrameOffsets as { [k: number]: Offset } | undefined)?.[
      baseFrameIndex
    ] ?? { ...ZERO }
  );
}
