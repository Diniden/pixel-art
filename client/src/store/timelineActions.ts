/**
 * Timeline actions — ALL MIGRATED TO MobX (REFRESH task 25).
 *
 * All six live on `stores/domain/LayerStore`. They were never a distinct
 * concern: `addLayerToAllFrames`, `addLayerToFrameAtPosition`,
 * `deleteLayerFromFrame` and `reorderLayerInFrame` are layer operations with
 * a FRAME SCOPE rather than the current-frame scope `layerActions` used, and
 * `copyTimelineCell` / `pasteTimelineCell` are clipboard operations whose
 * buffer (`timelineCellClipboard`) lives on `SessionStore` alongside
 * `layerClipboard`.
 *
 * ⚠️ One divergence was ported FAITHFULLY rather than fixed:
 * `addLayerToAllFrames` generated a `layerId` up front, selected it, and then
 * gave each frame's new layer a SEPARATE `generateId()` — so the selected id
 * matches no layer in the project. Observed behaviour, preserved in
 * `LayerStore.addLayerToAllFrames`, not a transcription slip.
 *
 * The bridge replaces every entry below with a delegate at install time.
 * There is exactly ONE implementation of each action.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to LayerStore (REFRESH task 25) and is reached through ` +
      "the Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call LayerStore directly.",
  );
}

export function createTimelineActions() {
  return {
    addLayerToAllFrames: (_name: string): void =>
      migrated("addLayerToAllFrames"),
    addLayerToFrameAtPosition: (
      _frameId: string,
      _name: string,
      _position: number,
      _variantInfo?: {
        isVariant?: boolean;
        variantGroupId?: string;
        selectedVariantId?: string;
        variantOffsets?: { [variantId: string]: { x: number; y: number } };
        variantOffset?: { x: number; y: number };
      },
    ): string => migrated("addLayerToFrameAtPosition"),
    deleteLayerFromFrame: (_frameId: string, _layerId: string): void =>
      migrated("deleteLayerFromFrame"),
    reorderLayerInFrame: (
      _frameId: string,
      _layerId: string,
      _newIndex: number,
    ): void => migrated("reorderLayerInFrame"),
    copyTimelineCell: (_frameId: string, _layerId: string): void =>
      migrated("copyTimelineCell"),
    pasteTimelineCell: (_frameId: string, _targetLayerId: string): void =>
      migrated("pasteTimelineCell"),
  };
}
