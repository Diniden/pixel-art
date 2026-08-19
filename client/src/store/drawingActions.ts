import type { Point } from "../types";
import type { StoreSet } from "./storeTypes";

/**
 * Drawing actions — THE PIXEL WRITES ARE MIGRATED (REFRESH task 26).
 *
 * `setPixel` and `setPixels` moved to `stores/domain/PixelStore`, the sole
 * writer of pixel grids. `beginStroke`/`endStroke` moved to
 * `HistoryStore.beginTransaction`/`endTransaction`. All four are installed as
 * bridge delegates, so `Canvas.tsx` (owned by tasks 30-32) keeps its
 * `useEditorStore()` seam and reaches the MobX implementation unchanged —
 * there is exactly ONE implementation of each action.
 *
 * ── What stays, and why ───────────────────────────────────────────────────
 *
 * The five GESTURE actions below (`startDrawing`, `updateDrawing`,
 * `endDrawing`, `setPreviewPixels`, `clearPreviewPixels`) are NOT migrated
 * here. They write `isDrawing`, `drawStartPoint` and `previewPixels`, which
 * the spec assigns to a `CanvasInteractionStore` in the Canvas task, not to
 * `PixelStore`. They touch no pixel grid and record no history.
 *
 * ⚠️ Note for that task: `previewPixels` is rewritten on EVERY mousemove. When
 * it moves it must be `observableRef` with whole-array replacement — a deep
 * observable array there is a per-frame allocation storm on the hot path.
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
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to PixelStore/HistoryStore (REFRESH task 26) and is ` +
      "reached through the Zustand bridge. This store has no bridge " +
      "installed — construct an ApplicationStore and call installBridge(), " +
      "or use the test harness, which does it for you.",
  );
}

export function createDrawingActions(set: StoreSet) {
  return {
    /* ── migrated: PixelStore + HistoryStore transactions ─────────────────── */
    beginStroke: () => migrated("beginStroke"),
    endStroke: () => migrated("endStroke"),
    setPixel: () => migrated("setPixel"),
    setPixels: () => migrated("setPixels"),

    /* ── NOT migrated: gesture state (Canvas task) ────────────────────────── */

    startDrawing: (point: Point) => {
      // Clear color adjustment when starting to draw
      set({ isDrawing: true, drawStartPoint: point, colorAdjustment: null });
    },

    updateDrawing: (point: Point) => {
      set({ drawStartPoint: point });
    },

    endDrawing: () => {
      set({ isDrawing: false, drawStartPoint: null, previewPixels: [] });
    },

    setPreviewPixels: (pixels: Point[]) => {
      set({ previewPixels: pixels });
    },

    clearPreviewPixels: () => {
      set({ previewPixels: [] });
    },
  };
}
