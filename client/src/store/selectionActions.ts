/**
 * Selection actions — ALL MIGRATED TO MobX (REFRESH task 26).
 *
 * The 651 lines this module used to hold split cleanly in two, along the
 * boundary the whole refresh is organised around:
 *
 *   the 9 SELECTION actions  → `stores/ui/SelectionUIStore`
 *     `setSelection`, `setSelectionMask`, `clearSelection`, `moveSelection`,
 *     `expandSelection`, `shrinkSelection`, `selectFloodFillAt`,
 *     `selectAllByColorAt`, `selectLasso`
 *
 *   the 2 PIXEL mutations    → `stores/domain/PixelStore`
 *     `moveSelectedPixels`, `deleteSelectionPixels`
 *
 * The split is not cosmetic. The first nine write a mask and nothing else —
 * no history entry, no save. The last two write pixel grids and are therefore
 * domain mutations that record inverse-patch commands.
 *
 * ── The mask travels DOWN, never sideways ─────────────────────────────────
 *
 * `moveSelectedPixels` and `deleteSelectionPixels` need `selection.mask`. They
 * do NOT read it off `SelectionUIStore` — `stores/domain/**` may not import
 * `stores/ui/**` (ESLint, task 05). The bridge delegate reads the mask on the
 * UI side and passes it as an ARGUMENT, which is the one-directional rule the
 * task spec calls "the rule that keeps the boundary one-directional".
 *
 * ── `moveSelectedPixels` still moves the mask afterwards ──────────────────
 *
 * The legacy implementation called `moveSelection(dx, dy)` intra-module at
 * `:577` and `:648` so the mask follows the pixels. That call survives the
 * split as an explicit two-step in the bridge delegate: `PixelStore` moves the
 * pixels, then `SelectionUIStore` moves the mask. Preserved deliberately —
 * without it the selection outline detaches from the art it describes.
 *
 * The bridge replaces every Zustand entry below with a delegate at install
 * time, so `Canvas.tsx` (owned by tasks 30-32) keeps its `useEditorStore()`
 * seam unchanged. There is exactly ONE implementation of each action.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to SelectionUIStore/PixelStore (REFRESH task 26) and is ` +
      "reached through the Zustand bridge. This store has no bridge " +
      "installed — construct an ApplicationStore and call installBridge(), " +
      "or use the test harness, which does it for you.",
  );
}

export function createSelectionActions() {
  return {
    /* ── SelectionUIStore (9) ─────────────────────────────────────────────── */
    setSelection: () => migrated("setSelection"),
    setSelectionMask: () => migrated("setSelectionMask"),
    clearSelection: () => migrated("clearSelection"),
    moveSelection: () => migrated("moveSelection"),
    expandSelection: () => migrated("expandSelection"),
    shrinkSelection: () => migrated("shrinkSelection"),
    selectFloodFillAt: () => migrated("selectFloodFillAt"),
    selectAllByColorAt: () => migrated("selectAllByColorAt"),
    selectLasso: () => migrated("selectLasso"),

    /* ── PixelStore (2) — domain mutations, inverse-patch recorded ────────── */
    deleteSelectionPixels: () => migrated("deleteSelectionPixels"),
    moveSelectedPixels: () => migrated("moveSelectedPixels"),
  };
}
