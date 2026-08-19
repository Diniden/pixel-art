/**
 * Layer actions — ALL MIGRATED TO MobX (REFRESH task 25).
 *
 * The fourteen domain actions live on `stores/domain/LayerStore`, which also
 * absorbed `timelineActions.ts` and `layerClipboardActions.ts` — those three
 * modules were one concern split three ways.
 *
 * `selectLayer` moved to `stores/ui/TimelineUIStore` instead: it writes only
 * `selectedLayerId` and `layerSelectionCounter`, clears the pending colour
 * adjustment, and passes `trackHistory=false`. It is UI state.
 *
 * ⚠️ **The four `squash*` variants were ported ONE-FOR-ONE, not collapsed.**
 * They are near-identical and obviously collapsible, but task 08 measured
 * that they DISAGREE — the `Up` pair composites the lower layer over the
 * upper one, the `AcrossAllFrames` pair matches by array index rather than by
 * id, the per-frame skip guards are asymmetric, and none of the four consults
 * `visible`. Collapsing while porting would make any regression impossible to
 * attribute. The differences are documented on each method in `LayerStore`.
 *
 * The bridge replaces every entry below with a delegate at install time, so
 * the consumers later tasks own (`Canvas.tsx`, `LightingCanvas.tsx`,
 * `variantActions.ts`) keep their `useEditorStore()` seam and reach the MobX
 * implementation. There is exactly ONE implementation of each action.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to LayerStore/TimelineUIStore (REFRESH task 25) and is ` +
      "reached through the Zustand bridge. This store has no bridge " +
      "installed — construct an ApplicationStore and call installBridge(), " +
      "or call the store directly.",
  );
}

export function createLayerActions() {
  return {
    addLayer: (_name: string): void => migrated("addLayer"),
    duplicateLayer: (_id: string): void => migrated("duplicateLayer"),
    deleteLayer: (_id: string): void => migrated("deleteLayer"),
    renameLayer: (_id: string, _name: string): void => migrated("renameLayer"),
    toggleLayerVisibility: (_id: string): void =>
      migrated("toggleLayerVisibility"),
    toggleAllLayersVisibility: (_visible: boolean): void =>
      migrated("toggleAllLayersVisibility"),
    /** UI, not domain — now `TimelineUIStore.selectLayer`. */
    selectLayer: (_id: string): void => migrated("selectLayer"),
    moveLayer: (_fromIndex: number, _toIndex: number): void =>
      migrated("moveLayer"),
    moveLayerAcrossAllFrames: (
      _layerId: string,
      _direction: "up" | "down",
    ): void => migrated("moveLayerAcrossAllFrames"),
    deleteLayerAcrossAllFrames: (_layerId: string): void =>
      migrated("deleteLayerAcrossAllFrames"),
    // The four squash* variants — NOT collapsed. See the header.
    squashLayerDown: (_layerId: string): void => migrated("squashLayerDown"),
    squashLayerUp: (_layerId: string): void => migrated("squashLayerUp"),
    squashLayerDownAcrossAllFrames: (_layerId: string): void =>
      migrated("squashLayerDownAcrossAllFrames"),
    squashLayerUpAcrossAllFrames: (_layerId: string): void =>
      migrated("squashLayerUpAcrossAllFrames"),
    moveLayerPixels: (_dx: number, _dy: number): void =>
      migrated("moveLayerPixels"),
  };
}
