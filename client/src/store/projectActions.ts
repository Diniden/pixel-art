/**
 * Project lifecycle — DELEGATED (REFRESH task 16).
 *
 * Every lifecycle action (`initProject`, `createNewProject`, `switchToProject`,
 * `renameCurrentProject`, `deleteCurrentProject`, `refreshProjectList`,
 * `restoreFromBackup`) now lives on `DomainStore` as a MobX flow, behind the
 * load-state machine that closes R5 — the old `initProject` catch here
 * installed `createDefaultProject()` on ANY failure, which auto-save then
 * wrote over the user's real file.
 *
 * The entries below are THROWING STUBS: `installBridge()` replaces them with
 * delegates into the `DomainStore` flows at app start (and restores the stubs
 * on dispose). They throw loudly — a store used without the bridge would
 * otherwise fail silently, which is exactly the failure mode W3's boundary
 * probe exists to prevent.
 *
 * ── undo / redo (REFRESH task 17) ──────────────────────────────────────────
 * Both delegate to the `HistoryStore` glue built in `store/index.ts` (the
 * cursor semantics — pre-mutation snapshots, deferred redo-tail truncation —
 * are pinned by task 08 and live in `HistoryStore` now). `redo` is NEW: the
 * legacy store kept the redo data reachable but never had the action.
 *
 * Neither schedules a save. For `undo`/`redo` this is DELIBERATE and
 * owner-accepted (2026-08-16): `HistoryStore.isReplaying` suppresses both the
 * bridge's `domainVersion` bump and `AutoSaveController`'s trigger for the
 * duration of the replay, so the NEXT real edit saves instead — a save
 * triggered by replay is indistinguishable from one triggered by an edit,
 * which made "did the undo persist?" untestable.
 */

const notWired =
  (name: string) =>
  (..._args: unknown[]): never => {
    throw new Error(
      `${name}: the project lifecycle lives on DomainStore (task 16) — ` +
        "installBridge(app) has not been called, so the delegate is missing.",
    );
  };

/** The undo/redo delegates the `store/index.ts` history glue provides. */
export interface HistoryControl {
  undo(): void;
  redo(): void;
}

export function createProjectActions(history: HistoryControl) {
  return {
    initProject: notWired("initProject") as () => Promise<void>,
    createNewProject: notWired("createNewProject") as (
      name: string,
    ) => Promise<boolean>,
    switchToProject: notWired("switchToProject") as (
      name: string,
    ) => Promise<boolean>,
    renameCurrentProject: notWired("renameCurrentProject") as (
      newName: string,
    ) => Promise<boolean>,
    deleteCurrentProject: notWired(
      "deleteCurrentProject",
    ) as () => Promise<boolean>,
    refreshProjectList: notWired("refreshProjectList") as () => Promise<void>,
    restoreFromBackup: notWired("restoreFromBackup") as (
      date: string,
      filename: string,
    ) => Promise<boolean>,

    undo: () => history.undo(),
    redo: () => history.redo(),
  };
}
