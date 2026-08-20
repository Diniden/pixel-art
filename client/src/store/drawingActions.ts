import type { StoreSet } from "./storeTypes";

/**
 * Drawing actions — FULLY MIGRATED (REFRESH tasks 26 and 32).
 *
 * `setPixel` and `setPixels` moved to `stores/domain/PixelStore`, the sole
 * writer of pixel grids. `beginStroke`/`endStroke` moved to
 * `HistoryStore.beginTransaction`/`endTransaction` (task 26).
 *
 * The five GESTURE actions (`startDrawing`, `updateDrawing`, `endDrawing`,
 * `setPreviewPixels`, `clearPreviewPixels`) moved to
 * `stores/ui/CanvasInteractionStore` in task 32 — the task that finally owned
 * their one consumer. All nine are installed as bridge delegates, so any
 * remaining `useEditorStore()` seam reaches the MobX implementation unchanged
 * and there is exactly ONE implementation of each action.
 *
 * ── The three transient fields ────────────────────────────────────────────
 *
 * `isDrawing`, `drawStartPoint` and `previewPixels` are now owned by
 * `CanvasInteractionStore`. They are in NEITHER bridge phase list, because
 * they have no unmigrated consumer to mirror to — `CanvasContainer` reads
 * them straight off MobX. `previewPixels` is `observableRef` there, which the
 * old note below demanded: it is rewritten on EVERY mousemove, and a deeply
 * observable array on that path is a per-frame allocation storm.
 *
 * The legacy Zustand FIELDS still exist on `EditorState` (defaults in
 * `store/index.ts:502-504`) and are now inert: with the bridge installed no
 * writer touches them, and `storeContract.ts` asserts only their default
 * shape. They are deleted with the rest of the Zustand store (task 38).
 *
 * ── The stroke closure is gone ────────────────────────────────────────────
 *
 * `let _strokeActive = false` (the old `drawingActions.ts:10`) was promoted to
 * `HistoryStore`'s transaction primitive by task 17 and is now consumed
 * directly by `PixelStore`: a `setPixel` during a drag records an inverse
 * patch INTO the open transaction, and `endStroke` collapses the lot into one
 * `CompositeCommand`. One drag is exactly one undo entry — pinned by task 08.
 *
 * The edit-mask gate (`isEditMaskActiveFor`, the old `:11-24`) moved with the
 * writes, but INVERTED: it is no longer a cross-store read of
 * `selection`/`selectionBehavior` from inside a domain write. Those values are
 * now passed DOWN as arguments (`PixelWriteOptions`), which is what keeps
 * `stores/domain/**` free of any `stores/ui/**` import.
 *
 * ⚠️ `startDrawing`'s COUPLED WRITE lives at the bridge, not in
 * `CanvasInteractionStore`. The legacy action also cleared `colorAdjustment`,
 * which belongs to the colour slice; keeping that half at the delegate is
 * what stops a canvas store having to know about the palette. Task 08 pins
 * the coupling.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string, destination: string, task: string): never {
  throw new Error(
    `${name} moved to ${destination} (REFRESH ${task}) and is ` +
      "reached through the Zustand bridge. This store has no bridge " +
      "installed — construct an ApplicationStore and call installBridge(), " +
      "or use the test harness, which does it for you.",
  );
}

// `set` is retained in the signature so the call site in `store/index.ts` is
// untouched; nothing in this module writes state any more.
export function createDrawingActions(_set: StoreSet) {
  void _set;
  return {
    /* ── migrated task 26: PixelStore + HistoryStore transactions ─────────── */
    beginStroke: () =>
      migrated("beginStroke", "PixelStore/HistoryStore", "task 26"),
    endStroke: () =>
      migrated("endStroke", "PixelStore/HistoryStore", "task 26"),
    setPixel: () => migrated("setPixel", "PixelStore/HistoryStore", "task 26"),
    setPixels: () =>
      migrated("setPixels", "PixelStore/HistoryStore", "task 26"),

    /* ── migrated task 32: the gesture fields → CanvasInteractionStore ────── */
    startDrawing: () =>
      migrated("startDrawing", "CanvasInteractionStore", "task 32"),
    updateDrawing: () =>
      migrated("updateDrawing", "CanvasInteractionStore", "task 32"),
    endDrawing: () =>
      migrated("endDrawing", "CanvasInteractionStore", "task 32"),
    setPreviewPixels: () =>
      migrated("setPreviewPixels", "CanvasInteractionStore", "task 32"),
    clearPreviewPixels: () =>
      migrated("clearPreviewPixels", "CanvasInteractionStore", "task 32"),
  };
}
