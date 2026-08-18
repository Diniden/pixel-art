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
 * `undo` is still genuinely Zustand-owned until the HistoryStore task (17).
 * It no longer schedules its own save: the `set({ project })` commit is
 * observed by the bridge, which bumps `DomainStore.domainVersion`, and the
 * `AutoSaveController` reaction owns the rest — so undo still results in
 * exactly one debounced save, as pinned by the task 08 suite.
 */
import { projectToCompact, compactToProject } from "../types";
import type { StoreGet, StoreSet } from "./storeTypes";

const notWired =
  (name: string) =>
  (..._args: unknown[]): never => {
    throw new Error(
      `${name}: the project lifecycle lives on DomainStore (task 16) — ` +
        "installBridge(app) has not been called, so the delegate is missing.",
    );
  };

export function createProjectActions(get: StoreGet, set: StoreSet) {
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

    undo: () => {
      const { projectHistory, historyIndex } = get();
      if (historyIndex < 0 || projectHistory.length === 0) return;

      const previousProject = projectHistory[historyIndex];
      // Deep clone when restoring to ensure complete independence
      const compactProject = projectToCompact(previousProject);
      const clonedProject = compactToProject(compactProject);
      const newIndex = historyIndex - 1;

      set({
        project: clonedProject,
        historyIndex: newIndex,
      });
      // The save: bridge bump → AutoSaveController (see the module header).
    },
  };
}
