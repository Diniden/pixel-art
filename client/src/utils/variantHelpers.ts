/**
 * variantHelpers — the anchor/grid-resize math the variant and object stores
 * share (REFRESH task 28, MASTER.md §9.5).
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * `getAnchorPadding` and the `AnchorPosition` union used to live at the
 * bottom of `components/AnchorGrid/AnchorGrid.tsx`, and BOTH stores imported
 * them from there:
 *
 *     store/variantActions.ts:14        → components/AnchorGrid/AnchorGrid
 *     store/objectActions.ts:22         → components/AnchorGrid/AnchorGrid
 *     stores/domain/ObjectStore.ts:40   → components/AnchorGrid/AnchorGrid
 *
 * A store importing a React component module is the layering arrow backwards,
 * and it is the reason W20's gate reads *no `src/stores` file imports from
 * `components/`*. The function is pure — nine string cases and two divisions,
 * with no React, no CSS and no DOM — so it belongs in `utils/`, which both
 * the store layer and the component layer are allowed to depend on.
 *
 * `AnchorGrid.tsx` now re-exports both names so the ~10 component-side
 * importers keep their existing import path. The store side imports from
 * here.
 *
 * ── ⚠️ THE ROUNDING IS OBSERVED BEHAVIOUR, NOT DESIRED BEHAVIOUR ──────────
 *
 * `Math.floor(diff / 2)` biases an ODD split toward the right/bottom when
 * growing (+5 → left 2, right 3) and toward the LEFT/TOP when shrinking
 * (-5 → left -3, right -2, because `Math.floor(-2.5) === -3`). That
 * asymmetry is what the code does today and what every project on disk was
 * authored against; task 08 pinned all nine anchors × grow/shrink × even/odd
 * in `__tests__/variantHelpers.test.ts` precisely so this move could be
 * proven behaviour-preserving. Do not "fix" it — changing it silently
 * re-anchors every historical resize.
 */

/** The 3×3 anchor grid. Moved verbatim from `AnchorGrid.tsx`. */
export type AnchorPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * Padding to add on each side when a grid grows or shrinks by
 * `widthDiff`/`heightDiff`, holding `anchor` fixed.
 *
 * Transcribed CHARACTER-FOR-CHARACTER from `AnchorGrid.tsx`'s copy — same
 * branches, same `Math.floor`, same `diff - padding` complements. The
 * comments are the originals.
 */
export function getAnchorPadding(
  anchor: AnchorPosition,
  widthDiff: number,
  heightDiff: number,
): { left: number; top: number; right: number; bottom: number } {
  const anchorRow = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("middle")
      ? 1
      : 2;
  const anchorCol = anchor.includes("left")
    ? 0
    : anchor.includes("center")
      ? 1
      : 2;

  let leftPadding: number;
  let topPadding: number;

  // Horizontal padding based on anchor column
  if (anchorCol === 0) {
    // Anchored left - all padding goes to right
    leftPadding = 0;
  } else if (anchorCol === 2) {
    // Anchored right - all padding goes to left
    leftPadding = widthDiff;
  } else {
    // Anchored center - split padding, bias right/down for odd
    leftPadding = Math.floor(widthDiff / 2);
  }

  // Vertical padding based on anchor row
  if (anchorRow === 0) {
    // Anchored top - all padding goes to bottom
    topPadding = 0;
  } else if (anchorRow === 2) {
    // Anchored bottom - all padding goes to top
    topPadding = heightDiff;
  } else {
    // Anchored middle - split padding, bias right/down for odd
    topPadding = Math.floor(heightDiff / 2);
  }

  return {
    left: leftPadding,
    top: topPadding,
    right: widthDiff - leftPadding,
    bottom: heightDiff - topPadding,
  };
}
