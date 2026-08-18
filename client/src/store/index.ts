import { create } from "zustand";
import { runInAction } from "mobx";
import { MAX_HISTORY } from "./storeTypes";
import type { EditorState } from "./storeTypes";
import type { Project } from "../types";
import { HistoryStore } from "../stores/history/HistoryStore";
import { createSnapshotCommand } from "../stores/history/commands";
import type { Command, SnapshotHost } from "../stores/history/commands";

// Re-export types so existing imports from "store" still work
export type { EditorState } from "./storeTypes";

// Import module creators
import { createHelpers } from "./helpers";
import { createProjectActions } from "./projectActions";
import { createObjectActions } from "./objectActions";
import { createFrameActions } from "./frameActions";
import { createLayerActions } from "./layerActions";
import { createLayerClipboardActions } from "./layerClipboardActions";
import { createTimelineActions } from "./timelineActions";
import { createDrawingActions } from "./drawingActions";
import { createToolActions } from "./toolActions";
import { createPaletteActions } from "./paletteActions";
import { createReferenceActions } from "./referenceActions";
import { createSelectionActions } from "./selectionActions";
import { createColorAdjustmentActions } from "./colorAdjustmentActions";
import { createVariantActions } from "./variantActions";
import { createLightingActions } from "./lightingActions";

/**
 * The undo/redo owner (REFRESH task 17). ONE instance, shared between the
 * Zustand actions below and the MobX tree: `ApplicationStore` adopts this
 * exact instance so `AutoSaveController`'s replay guard observes the same
 * `isReplaying` the undo path sets.
 *
 * Yes, this is a module-level singleton — deliberately, and only for the
 * bridge era: it is scoped to `useEditorStore`, itself a module singleton,
 * and both leave together when the Zustand store is retired (task 38). It is
 * NOT the pattern for MobX stores (see `ApplicationStore`'s header).
 *
 * `maxEntries: MAX_HISTORY` keeps the pinned 100-entry count cap alongside
 * the 64 MB byte budget — see the spec correction in `HistoryStore`'s header.
 */
export const editorHistory = new HistoryStore({ maxEntries: MAX_HISTORY });

export const useEditorStore = create<EditorState>((set, get) => {
  // Task 16: auto-save no longer lives here. The single commit path below
  // only WRITES the project; the bridge bumps `DomainStore.domainVersion` on
  // every `project` reference change and `AutoSaveController`'s reaction owns
  // the debounce/save. `saveStatus` is a Phase B mirror written by the bridge.
  //
  // Task 17: undo history no longer lives here either. `editorHistory` owns
  // the command stack; `EditorState.projectHistory`/`historyIndex` are Phase B
  // MIRRORS derived from it (see the glue below) so the 34 unmigrated
  // consumers and the task 08 harness keep reading the legacy fields.
  const history = editorHistory;

  /* ── the snapshot host: how commands reach the live project ────────────── */

  const snapshotHost: SnapshotHost = {
    current: () => get().project,
    restore: (project) => {
      // referenceImage never travels through history (task 17): commands are
      // captured with it stripped, and restore re-attaches the LIVE one.
      set({
        project: { ...project, referenceImage: get().project?.referenceImage },
      });
    },
  };

  history.setSnapshotProvider((label) => {
    const { project } = get();
    return project
      ? createSnapshotCommand({ label, project, host: snapshotHost })
      : null;
  });

  /* ── the Phase B history mirror (R6) ───────────────────────────────────── */
  //
  // `projectHistory`/`historyIndex` are written by exactly one writer — this
  // glue — synchronously after every history operation, so they stay correct
  // with or without the bridge installed (the task 08 suite runs without it).
  //
  // External writes still exist during the bridge era (`zustandProjectHost`'s
  // installProject/snapshotToHistory, the task 08 harness `load()`/`reset()`):
  // `reconcile()` detects them by reference before every history operation and
  // ADOPTS the raw snapshot array back into the HistoryStore, wrapping each
  // `Project` as a snapshot command. One field, one direction, one writer —
  // with a pull-based adoption seam instead of a second writer.

  let mirroredHistory: Project[] = [];
  let mirroredIndex = -1;

  const computeMirror = (): Pick<
    EditorState,
    "projectHistory" | "historyIndex"
  > => {
    return runInAction(() => {
      const list: Project[] = [];
      for (const command of history.entries) {
        // Every command in this task carries `before` (snapshot-only, R4).
        // Task 26 must revisit this mirror before shipping one that does not.
        const before = (command as Command & { before?: Project }).before;
        if (before) list.push(before);
      }
      mirroredHistory = list;
      mirroredIndex = history.index;
      return { projectHistory: list, historyIndex: history.index };
    });
  };

  const reconcile = () => {
    const { projectHistory, historyIndex } = get();
    if (projectHistory === mirroredHistory && historyIndex === mirroredIndex) {
      return;
    }
    runInAction(() => {
      history.replaceEntries(
        projectHistory.map((snapshot) =>
          createSnapshotCommand({
            label: "Edit",
            project: snapshot,
            host: snapshotHost,
            adopt: true,
          }),
        ),
        historyIndex,
      );
    });
    mirroredHistory = projectHistory;
    mirroredIndex = historyIndex;
  };

  /* ── the single commit path ────────────────────────────────────────────── */

  // Update project and save - with optional history tracking. The
  // `trackHistory=true` branch records a full `SnapshotCommand` of the
  // PRE-mutation state — the same serializer round-trip clone as before —
  // and commits project + mirror in ONE set, exactly like the legacy path.
  const updateProjectAndSave = (
    updater: (project: Project) => Project,
    trackHistory: boolean = false,
  ) => {
    const { project } = get();
    if (!project) return;

    const newProject = updater(project);

    if (trackHistory) {
      reconcile();
      runInAction(() => {
        history.record(
          createSnapshotCommand({
            label: "Edit",
            project,
            host: snapshotHost,
          }),
        );
      });
      set({ project: newProject, ...computeMirror() });
    } else {
      set({ project: newProject });
    }
  };

  // Save current project state to history without making changes — now the
  // history snapshot call (`HistoryStore.snapshot`), label-aware.
  const saveCurrentStateToHistory = (label: string = "Edit") => {
    if (!get().project) return;
    reconcile();
    runInAction(() => history.snapshot(label));
    set(computeMirror());
  };

  /* ── stroke batching, promoted to transactions (task 17) ───────────────── */
  //
  // Replaces the `_strokeActive` module closure. One drag = one transaction =
  // one entry; the pre-stroke snapshot is recorded INTO the transaction at
  // begin and committed (with anything else recorded during the drag) at end.
  const stroke = {
    begin: () => {
      reconcile();
      runInAction(() => {
        // beginTransaction auto-commits a dangling transaction first — the
        // pinned nested-beginStroke behaviour.
        history.beginTransaction("Draw");
        history.snapshot("Draw");
      });
      set(computeMirror());
    },
    end: () => {
      reconcile();
      runInAction(() => history.endTransaction());
      set(computeMirror());
    },
    isActive: () => history.inTransaction,
  };

  /* ── undo / redo delegates ─────────────────────────────────────────────── */

  const historyControl = {
    undo: () => {
      reconcile();
      runInAction(() => history.undo());
      set(computeMirror());
    },
    redo: () => {
      reconcile();
      runInAction(() => history.redo());
      set(computeMirror());
    },
  };

  // Create all action modules
  const helpers = createHelpers(get);
  const projectActions = createProjectActions(historyControl);
  const objectActions = createObjectActions(get, updateProjectAndSave);
  const frameActions = createFrameActions(get, updateProjectAndSave);
  const layerActions = createLayerActions(get, set, updateProjectAndSave);
  const layerClipboardActions = createLayerClipboardActions(
    get,
    set,
    updateProjectAndSave,
  );
  const timelineActions = createTimelineActions(
    get,
    set,
    updateProjectAndSave,
  );
  const drawingActions = createDrawingActions(get, set, updateProjectAndSave, stroke);
  const toolActions = createToolActions(get, set, updateProjectAndSave);
  const paletteActions = createPaletteActions(updateProjectAndSave);
  const referenceActions = createReferenceActions(
    get,
    set,
    updateProjectAndSave,
  );
  const selectionActions = createSelectionActions(
    get,
    set,
    updateProjectAndSave,
  );
  const colorAdjustmentActions = createColorAdjustmentActions(
    get,
    set,
    updateProjectAndSave,
  );
  const variantActions = createVariantActions(get, set, updateProjectAndSave);
  const lightingActions = createLightingActions(
    get,
    set,
    updateProjectAndSave,
  );

  return {
    // Initial state
    project: null,
    projectName: "project",
    projectList: [],
    isLoading: true,
    loadState: "idle",
    loadErrorMessage: null,
    saveStatus: "idle",
    projectHistory: [],
    historyIndex: -1,
    isDrawing: false,
    drawStartPoint: null,
    previewPixels: [],
    referenceOverlayOffset: { x: 0, y: 0 },
    frameTraceActive: false,
    frameTraceFrameIndex: null,
    frameOverlayOffset: { x: 0, y: 0 },
    frameReferenceObjectId: null,
    colorHistory: [],
    previousTool: null,
    selection: null,
    colorAdjustment: null,
    layerClipboard: null,
    timelineCellClipboard: null,

    // History action (delegates to the HistoryStore snapshot glue)
    saveCurrentStateToHistory: (label?: string) =>
      saveCurrentStateToHistory(label),

    // The single commit path, exposed as an action (task 14, defect 2) so the
    // AI interpolate flow commits with the capped history and the normal
    // save path instead of reimplementing both.
    updateProjectAndSave,

    // Spread all module actions
    ...helpers,
    ...projectActions,
    ...objectActions,
    ...frameActions,
    ...layerActions,
    ...layerClipboardActions,
    ...timelineActions,
    ...drawingActions,
    ...toolActions,
    ...paletteActions,
    ...referenceActions,
    ...selectionActions,
    ...colorAdjustmentActions,
    ...variantActions,
    ...lightingActions,
  };
});
