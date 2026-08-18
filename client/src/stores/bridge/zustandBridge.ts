/**
 * zustandBridge — TEMPORARY. Deleted by the final migration task (38), which
 * first confirms PHASE_A_FIELDS is empty.
 *
 * ── THE TWO FIELD LISTS BELOW ARE THE MIGRATION'S PROGRESS LEDGER (R6) ─────
 *
 * A field is mirrored in exactly ONE direction at a time and never has two
 * writers. The task that flips a field's ownership moves it from PHASE_A to
 * PHASE_B **in the same change**. `assertDisjointPhases()` fails in dev/test
 * the moment a field appears in both lists.
 *
 *   Phase A — MobX MIRRORS Zustand. Zustand is the source of truth; the only
 *             writer of the MobX copy is this bridge.
 *   Phase B — Zustand mirrors MobX for not-yet-migrated consumers. MobX is
 *             the source of truth; the only writer of the Zustand copy is
 *             this bridge. First flipped by task 16 (the DomainStore
 *             lifecycle slice + `saveStatus`).
 *
 * Every bridge write is wrapped in `runInAction`: `enforceActions: "always"`
 * makes an unwrapped write throw, and Zustand's `subscribe` callback runs
 * outside any action.
 *
 * Values are mirrored BY REFERENCE, never cloned — the clipboards contain
 * pixel grids, and `SessionStore` annotates them `observable.ref` so MobX
 * never proxies their contents.
 *
 * ── Task 16 additions ──────────────────────────────────────────────────────
 *
 *  1. The Phase B reaction: `loadState` (+ its `isLoading` computed and the
 *     `loadError` message), `projectName`, `projectList` and `saveStatus` are
 *     now MobX-owned and mirrored INTO Zustand for unmigrated consumers
 *     (`App`, `Header`, `ProjectSelectModal`, `BrowseBackupsModal`).
 *  2. The project-lifecycle DELEGATES: the Zustand actions (`initProject`,
 *     `switchToProject`, …) are replaced at install time with calls into the
 *     `DomainStore` flows, so unmigrated components keep their seam.
 *  3. The `domainVersion` bump: the subscribe callback watches the Zustand
 *     `project` REFERENCE and bumps `DomainStore.domainVersion` once per
 *     committed mutation — the auto-save reaction observes the counter, never
 *     the 300k-cell tree. Bumps are gated on `loadState === "loaded"` and
 *     `!saveSuspended`, so hydration installs and lifecycle flows never
 *     schedule a save of their own.
 *
 * ── Task 17 additions ──────────────────────────────────────────────────────
 *
 *  4. The bump is ALSO gated on `!history.isReplaying`: a project commit made
 *     by `undo()`/`redo()` replay must not bump `domainVersion` (the whole
 *     replay runs synchronously inside one MobX action, so the flag is still
 *     set when Zustand's subscribe fires). Together with the trigger guard in
 *     `AutoSaveController` this is the owner-accepted (2026-08-16) behaviour
 *     change: undo performs NO immediate save; the next real edit saves.
 *  5. `projectHistory`/`historyIndex` join Phase B: `HistoryStore` owns undo
 *     history, and the Zustand fields are mirrors. Unusually for Phase B the
 *     writer is NOT the reaction below but the history glue in
 *     `store/index.ts`, which mirrors synchronously after every history
 *     operation — the task 08 suite runs without the bridge installed and
 *     must still see the legacy fields move. External writes to the legacy
 *     fields (`zustandProjectHost`, the test harness) are ADOPTED back by the
 *     glue's `reconcile()` before the next history operation, preserving the
 *     one-field/one-direction/one-writer invariant (R6) via a pull seam.
 */
import { compareStructural, flowResult, reaction, runInAction } from "mobx";
import { useEditorStore } from "../../store";
import type { EditorState } from "../../store/storeTypes";
import type { ApplicationStore } from "../ApplicationStore";

/* ── Phase A: Zustand → MobX. Fields whose slice has NOT yet flipped. ────── */
export const PHASE_A_FIELDS = [
  "aiServiceUrl", //           project.uiState.aiServiceUrl  → session.aiServiceUrl
  "layerClipboard", //         EditorState.layerClipboard    → session.layerClipboard
  "timelineCellClipboard", //  EditorState.timelineCellClipboard → session.timelineCellClipboard
  "colorHistory", //           EditorState.colorHistory      → session.colorHistory
] as const;

/* ── Phase B: MobX → Zustand. Fields whose ownership HAS flipped. ────────── */
// Flipped by task 16 — the DomainStore lifecycle slice, plus `saveStatus`
// (now written only by `AutoSaveController` onto `SessionStore`).
// `loadState` mirrors as BOTH `loadState`/`loadErrorMessage` and the legacy
// `isLoading` boolean (a computed on `DomainStore`).
export const PHASE_B_FIELDS = [
  "loadState", //     domain.loadState    → EditorState.loadState (+ isLoading, loadErrorMessage)
  "projectName", //   domain.projectName  → EditorState.projectName
  "projectList", //   domain.projectList  → EditorState.projectList
  "saveStatus", //    session.saveStatus  → EditorState.saveStatus
  // Task 17 — mirrored by the history glue in store/index.ts, NOT by the
  // reaction below (see item 5 in the module header):
  "projectHistory", // history.entries    → EditorState.projectHistory (before-snapshots)
  "historyIndex", //   history.index      → EditorState.historyIndex
] as const;

/**
 * R6 dev-mode assertion: one field, one direction, one writer. Exported so
 * the store tests pin it too.
 */
export function assertDisjointPhases(
  phaseA: readonly string[] = PHASE_A_FIELDS,
  phaseB: readonly string[] = PHASE_B_FIELDS,
): void {
  const dual = phaseA.filter((field) => phaseB.includes(field));
  if (dual.length > 0) {
    throw new Error(
      `zustandBridge: field(s) mirrored in BOTH phases — two writers (R6): ${dual.join(", ")}. ` +
        "The task that flips a field's ownership must MOVE it between lists, not copy it.",
    );
  }
}

/**
 * Mirror every Phase A field from a Zustand snapshot into the MobX tree.
 * The single writer of these MobX fields during Phase A.
 */
function syncPhaseA(app: ApplicationStore, s: EditorState): void {
  runInAction(() => {
    app.session.aiServiceUrl = s.project?.uiState.aiServiceUrl ?? null;
    app.session.layerClipboard = s.layerClipboard;
    app.session.timelineCellClipboard = s.timelineCellClipboard;
    app.session.colorHistory = s.colorHistory;
  });
}

/** The Phase B snapshot Zustand receives. */
function phaseBSnapshot(app: ApplicationStore): Partial<EditorState> {
  return {
    loadState: app.domain.loadState,
    loadErrorMessage: app.domain.loadError?.message ?? null,
    isLoading: app.domain.isLoading,
    projectName: app.domain.projectName,
    projectList: app.domain.projectList.slice(),
    saveStatus: app.session.saveStatus,
  };
}

/**
 * Install the bridge. Call once, from `main.tsx`, right after constructing
 * the `ApplicationStore`. Returns a disposer.
 */
export function installBridge(app: ApplicationStore): () => void {
  if (!import.meta.env.PROD) {
    assertDisjointPhases();
  }

  // Zustand's `subscribe` fires only on CHANGES; adopt the current state
  // immediately so the MobX tree never starts stale.
  syncPhaseA(app, useEditorStore.getState());

  // The `domainVersion` bump — see item 3 in the module header.
  let lastProject = useEditorStore.getState().project;

  const disposeZ = useEditorStore.subscribe((s) => {
    syncPhaseA(app, s);
    if (s.project !== lastProject) {
      lastProject = s.project;
      runInAction(() => {
        if (
          s.project !== null &&
          app.domain.loadState === "loaded" &&
          !app.session.saveSuspended &&
          // Task 17: replay commits never count as edits (item 4, header).
          !app.history.isReplaying
        ) {
          app.domain.bumpDomainVersion();
        }
      });
    }
  });

  // Phase B: Zustand mirrors MobX for not-yet-migrated consumers. MobX's
  // `reaction` is already an action-safe context; the Zustand write is plain.
  const disposeB = reaction(
    () => phaseBSnapshot(app),
    (snap) => useEditorStore.setState(snap),
    { equals: compareStructural },
  );

  // The lifecycle DELEGATES — see item 2 in the module header. The previous
  // (throwing-stub) actions are captured and restored on dispose so tests can
  // wire and unwire repeatedly.
  const previousActions = {
    initProject: useEditorStore.getState().initProject,
    createNewProject: useEditorStore.getState().createNewProject,
    switchToProject: useEditorStore.getState().switchToProject,
    renameCurrentProject: useEditorStore.getState().renameCurrentProject,
    deleteCurrentProject: useEditorStore.getState().deleteCurrentProject,
    refreshProjectList: useEditorStore.getState().refreshProjectList,
    restoreFromBackup: useEditorStore.getState().restoreFromBackup,
  };
  useEditorStore.setState({
    initProject: () => flowResult(app.domain.initProject()),
    createNewProject: (name) => flowResult(app.domain.createProject(name)),
    switchToProject: (name) => flowResult(app.domain.switchProject(name)),
    renameCurrentProject: (newName) =>
      flowResult(app.domain.renameProject(newName)),
    deleteCurrentProject: () => flowResult(app.domain.deleteProject()),
    refreshProjectList: () => flowResult(app.domain.refreshProjectList()),
    restoreFromBackup: (date, filename) =>
      flowResult(app.domain.restoreFromBackup(date, filename)),
  });

  return () => {
    disposeZ();
    disposeB();
    useEditorStore.setState(previousActions);
  };
}
