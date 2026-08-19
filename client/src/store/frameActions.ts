/**
 * Frame actions — ALL MIGRATED TO MobX (REFRESH task 25).
 *
 * The nine domain actions (`addFrame`, `deleteFrame`, `deleteSelectedFrame`,
 * `renameFrame`, `duplicateFrame`, `moveFrame`, `reorderFrame`,
 * `addFrameTag`, `removeFrameTag`) live on `stores/domain/FrameStore`, which
 * mutates `DomainStore.objects` directly.
 *
 * `selectFrame` moved to `stores/ui/TimelineUIStore` instead of to
 * `FrameStore`: it writes only the selection ids and `variantFrameIndices`,
 * it passes `trackHistory=false`, and it mutates no domain data — so it is UI
 * state, not a frame mutation. That split is why the two stores shipped in
 * one task.
 *
 * The bridge replaces every Zustand entry below with a delegate at install
 * time, so the consumers later tasks own (`Canvas.tsx`, `LightingCanvas.tsx`)
 * keep their `useEditorStore()` seam unchanged and reach the MobX
 * implementation. There is exactly ONE implementation of each action.
 *
 * The throwing stubs mirror task 16's lifecycle stubs and task 23's object
 * stubs: an unbridged store fails loudly rather than silently dropping an
 * edit.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to FrameStore/TimelineUIStore (REFRESH task 25) and is ` +
      "reached through the Zustand bridge. This store has no bridge " +
      "installed — construct an ApplicationStore and call installBridge(), " +
      "or call the store directly.",
  );
}

export function createFrameActions() {
  return {
    addFrame: (_name: string, _copyPrevious: boolean = false): void =>
      migrated("addFrame"),
    deleteFrame: (_id: string): void => migrated("deleteFrame"),
    deleteSelectedFrame: (): void => migrated("deleteSelectedFrame"),
    renameFrame: (_id: string, _name: string): void => migrated("renameFrame"),
    /** UI, not domain — now `TimelineUIStore.selectFrame`. */
    selectFrame: (_id: string, _syncVariants: boolean = true): void =>
      migrated("selectFrame"),
    duplicateFrame: (_id: string): void => migrated("duplicateFrame"),
    moveFrame: (_id: string, _direction: "left" | "right"): void =>
      migrated("moveFrame"),
    reorderFrame: (_frameId: string, _toIndex: number): void =>
      migrated("reorderFrame"),
    addFrameTag: (_frameId: string, _tag: string): void =>
      migrated("addFrameTag"),
    removeFrameTag: (_frameId: string, _tag: string): void =>
      migrated("removeFrameTag"),
  };
}
