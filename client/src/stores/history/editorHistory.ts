/**
 * The ONE undo/redo stack of the app (REFRESH task 38).
 *
 * Moved here from the retired legacy store module, unchanged in role: a
 * module-level singleton, deliberately. Every `ApplicationStore` adopts this
 * exact instance so `AutoSaveController`'s replay guard observes the same
 * `isReplaying` the undo path sets, and so an open stroke transaction
 * survives a store reset — task 08 pins that behaviour ("`_strokeActive` is
 * MODULE state, so it survives a store reset": the MobX equivalent of module
 * state that outlives a store reset is this shared instance's open
 * transaction).
 *
 * `maxEntries: MAX_HISTORY` keeps the pinned 100-entry count cap alongside
 * the 64 MB byte budget — see the spec correction in `HistoryStore`'s header.
 */
import { runInAction } from "mobx";
import { MAX_HISTORY } from "../../store/storeTypes";
import { HistoryStore } from "./HistoryStore";

export const editorHistory = new HistoryStore({ maxEntries: MAX_HISTORY });

/**
 * The stroke-batching seam (task 26, re-homed by task 38).
 *
 * One drag = one transaction = one history entry: every `setPixel` during the
 * drag records an inverse patch INTO the transaction and `end` collapses them
 * into one `CompositeCommand`.
 *
 * ── ⚠️ THE STROKE SNAPSHOT IS DEFERRED, NOT REMOVED (task 26) ─────────────
 *
 * An eager `snapshot("Draw")` on `begin` cost 103,424 B against 1,684 B of
 * patches on a measured 50-move stroke — 98% of a stroke's history cost was
 * a clone the patches make redundant. Removing it outright was tried and
 * REVERTED: task 08 pins the empty case explicitly — "beginStroke ALWAYS
 * snapshots, even on a stroke that paints nothing" (begin/end with no write
 * must leave ONE entry). So `begin` opens the transaction and records
 * nothing; `end` takes a snapshot ONLY when the transaction is still empty,
 * which is exactly the pinned empty-stroke case.
 */
export const strokeControl = {
  begin: (): void => {
    runInAction(() => {
      // `beginTransaction` auto-commits a dangling transaction first — the
      // pinned nested-beginStroke behaviour.
      editorHistory.beginTransaction("Draw");
    });
  },
  end: (): void => {
    runInAction(() => {
      // The deferred snapshot: an empty stroke still records one entry.
      if (editorHistory.isTransactionEmpty) {
        editorHistory.snapshot("Draw");
      }
      editorHistory.endTransaction();
    });
  },
  isActive: (): boolean => editorHistory.inTransaction,
};
