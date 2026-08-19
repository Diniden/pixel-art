/**
 * Variant actions — ALL TWENTY MIGRATED TO MobX (REFRESH task 28).
 *
 * This module was **1,412 lines and 20 actions** — the largest single file in
 * the Zustand store, and the last domain slice to move. What replaced it:
 *
 *   17 domain mutations  → `stores/domain/VariantStore`
 *                          (`makeVariant`, `addVariant`, `deleteVariant`,
 *                          `deleteVariantGroup`, `selectVariant`,
 *                          `renameVariant`, `renameVariantGroup`,
 *                          `resizeVariant`, `setVariantOffset`,
 *                          `duplicateVariantFrame`, `deleteVariantFrame`,
 *                          `addVariantFrameTag`, `removeVariantFrameTag`,
 *                          `addVariantFrame`, `moveVariantFrame`,
 *                          `reorderVariantFrame`,
 *                          `addVariantLayerFromExisting`,
 *                          `removeVariantLayer` — that is 18 names for 17
 *                          slots because the spec miscounted; see below)
 *    2 UI selections     → `stores/ui/TimelineUIStore`
 *                          (`selectVariantFrame`, `advanceVariantFrames`)
 *
 * ⚠️ SPEC CORRECTION (task 28). The spec routes `selectVariant` to
 * `TimelineUIStore` with the other two, on the grounds that all three "write
 * UI state". `selectVariant` does not: it rewrites `layer.selectedVariantId`
 * across every host layer of a group, which is domain data on
 * `project.objects`, and it writes no `uiState` field. It is therefore one of
 * the DOMAIN actions on `VariantStore` (making that store 18 actions, not
 * 17), and only two actions moved to the UI store. Putting it on a UI store
 * would have made `stores/ui/**` a writer of the objects tree.
 *
 * The bridge replaces every Zustand entry with a delegate at install time, so
 * the unmigrated consumers keep their `useEditorStore()` seam unchanged.
 *
 * ── The layering violation this task removed (MASTER.md §9.5) ─────────────
 *
 * Line 14 of the old file imported `getAnchorPadding` from
 * `../components/AnchorGrid/AnchorGrid` — **the store depending on a React
 * component.** The function now lives in `utils/variantHelpers.ts`, which
 * both layers may depend on, and `AnchorGrid.tsx` re-exports it so no
 * component-side importer changed. That import is why W20's gate reads *no
 * `src/stores` file imports from `components/`*.
 *
 * The throwing stubs mirror tasks 16/23/25/26/27: an unbridged store fails
 * loudly rather than silently dropping an edit.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type { AnchorPosition } from "../utils/variantHelpers";

function migrated(name: string, home: string): never {
  throw new Error(
    `${name} moved to ${home} (REFRESH task 28) and is reached through the ` +
      "Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call the store directly.",
  );
}

const variant = (name: string): never => migrated(name, "VariantStore");
const timeline = (name: string): never => migrated(name, "TimelineUIStore");

export function createVariantActions(
  _get: StoreGet,
  _set: StoreSet,
  _updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    /* ── the 18 domain mutations → VariantStore ──────────────────────────── */
    makeVariant: (_layerId: string): void => variant("makeVariant"),
    addVariant: (
      _variantGroupId: string,
      _copyFromVariantId?: string,
    ): void => variant("addVariant"),
    deleteVariant: (_variantGroupId: string, _variantId: string): void =>
      variant("deleteVariant"),
    deleteVariantGroup: (_variantGroupId: string): void =>
      variant("deleteVariantGroup"),
    selectVariant: (_layerId: string, _variantId: string): void =>
      variant("selectVariant"),
    renameVariant: (
      _variantGroupId: string,
      _variantId: string,
      _name: string,
    ): void => variant("renameVariant"),
    renameVariantGroup: (_variantGroupId: string, _name: string): void =>
      variant("renameVariantGroup"),
    resizeVariant: (
      _variantGroupId: string,
      _variantId: string,
      _width: number,
      _height: number,
      _anchor: AnchorPosition = "middle-center",
    ): void => variant("resizeVariant"),
    setVariantOffset: (
      _dx: number,
      _dy: number,
      _allFrames: boolean = false,
    ): void => variant("setVariantOffset"),
    duplicateVariantFrame: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
    ): void => variant("duplicateVariantFrame"),
    deleteVariantFrame: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
    ): void => variant("deleteVariantFrame"),
    addVariantFrameTag: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
      _tag: string,
    ): void => variant("addVariantFrameTag"),
    removeVariantFrameTag: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
      _tag: string,
    ): void => variant("removeVariantFrameTag"),
    addVariantFrame: (
      _variantGroupId: string,
      _variantId: string,
      _copyPrevious: boolean = true,
    ): void => variant("addVariantFrame"),
    moveVariantFrame: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
      _direction: "left" | "right",
    ): void => variant("moveVariantFrame"),
    reorderVariantFrame: (
      _variantGroupId: string,
      _variantId: string,
      _frameId: string,
      _toIndex: number,
    ): void => variant("reorderVariantFrame"),
    addVariantLayerFromExisting: (
      _variantGroupId: string,
      _selectedVariantId: string,
      _addToAllFrames: boolean,
    ): void => variant("addVariantLayerFromExisting"),
    removeVariantLayer: (_layerId: string): void =>
      variant("removeVariantLayer"),

    /* ── the 2 UI selections → TimelineUIStore ───────────────────────────── */
    selectVariantFrame: (
      _variantGroupId: string,
      _frameIndex: number,
    ): void => timeline("selectVariantFrame"),
    advanceVariantFrames: (_delta: number): void =>
      timeline("advanceVariantFrames"),
  };
}
