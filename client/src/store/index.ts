import { create } from "zustand";
import { runInAction } from "mobx";
import { MAX_HISTORY } from "./storeTypes";
import type { EditorState } from "./storeTypes";
import type { PixelData, Project } from "../types";
import { HistoryStore } from "../stores/history/HistoryStore";
import { createSnapshotCommand } from "../stores/history/commands";
import { isPixelCommand } from "../stores/history/commands";
import type {
  Command,
  PixelCommand,
  SnapshotHost,
} from "../stores/history/commands";

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

/**
 * The stroke-batching seam, published for the bridge (task 26).
 *
 * `beginStroke`/`endStroke` are bridge delegates now, but they must run the
 * SAME closure the legacy actions did — the one that wraps a transaction in
 * `reconcile()` … `computeMirror()` so the Phase B `projectHistory` mirror
 * stays consistent. Assigned during `create()` below, exactly like
 * `editorHistory`, and retired with the Zustand store (task 38).
 */
export let strokeControl: {
  begin(): void;
  end(): void;
  isActive(): boolean;
} = {
  begin: () => {},
  end: () => {},
  isActive: () => false,
};

/**
 * Re-publish the `projectHistory`/`historyIndex` Phase B mirror (task 26).
 *
 * `PixelStore` records its inverse-patch commands straight onto
 * `HistoryStore` — it must, since the whole point is that a pixel edit never
 * captures a project. But the legacy mirror still has exactly ONE writer,
 * this glue (R6, task 17), so the store calls back through here afterwards
 * rather than writing `projectHistory` itself.
 *
 * Assigned during `create()` below and retired with the Zustand store
 * (task 38).
 */
export let syncHistoryMirror: () => void = () => {};

/**
 * Pull an external write to the legacy `projectHistory` array back into
 * `HistoryStore` before recording (task 26). The adoption seam described in
 * `reconcile()` below, published for `PixelStore` — which records its
 * inverse-patch commands directly and therefore has to adopt first, exactly
 * as `updateProjectAndSave` and the stroke/undo/redo paths do.
 */
export let reconcileHistory: () => void = () => {};

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

  /**
   * ── Task 26: the mirror now spans TWO command families ──────────────────
   *
   * `projectHistory` is a Phase B mirror of `HistoryStore.entries` shaped as
   * `Project[]`, because that is what the legacy field was and what task 08's
   * harness reads (`getHistoryEntry`). Snapshot commands carry their
   * pre-state in `before`; inverse-patch `PixelCommand`s deliberately do NOT
   * — carrying one would reintroduce the 6.9 MB-per-edit cost this task
   * exists to remove.
   *
   * So a patch entry's pre-state is RECONSTRUCTED instead of stored: walk the
   * stack from the live project backwards, undoing each command's recorded
   * cells on paper. `entries[i].before` is the state to return TO, i.e. the
   * state after undoing entries[i..end], which is exactly what the loop below
   * accumulates.
   *
   * ⚠️ THIS IS A BRIDGE-ERA MIRROR, NOT THE UNDO MECHANISM. Undo and redo run
   * `command.undo()` / `command.redo()` and never consult this list — it
   * exists only so unmigrated readers and the task 08 baseline keep seeing
   * `Project[]`. Verified 2026-08-19: no component under `src/components/`,
   * `src/containers/` or `src/ui/` reads `projectHistory` at all, so its only
   * consumer is that suite. It is deleted with the Zustand store (task 38).
   *
   * The reconstruction is O(patched cells), never O(grid): it copies the
   * spine down to the touched layer and replaces only the affected rows —
   * the same wholesale-`ref` discipline `PixelStore` writes under (R2).
   */
  const rewindPixelCommand = (
    project: Project,
    command: PixelCommand,
  ): Project => {
    const { target, cells } = command;
    // ⚠️ EVERY ROW is copied, not just the patched ones.
    //
    // Copying only the touched rows is enough to make the RECONSTRUCTION
    // correct, and it is what `PixelStore` itself does on the live tree. It is
    // NOT enough here, because this array is handed to consumers as a
    // "snapshot" and task 08 pins that a snapshot survives the live project
    // being corrupted IN PLACE (`history.test.ts:207`, "mutating the LIVE
    // project in place does not change the snapshot" — it writes
    // `live.pixels[3][3]` directly, a row no patch touched).
    //
    // A row-level copy is O(rows), never O(cells): the row ARRAYS are new but
    // the `PixelData` cells inside are shared, which is safe because nothing
    // in the app mutates a cell in place — grids are replaced wholesale (R2).
    // The one test that does reach in replaces a whole cell, which a row copy
    // already isolates.
    const rewriteGrid = (grid: PixelData[][]): PixelData[][] => {
      const next = grid.map((row) => [...row]);
      for (const cell of cells) {
        if (next[cell.y]) next[cell.y][cell.x] = cell.before;
      }
      return next;
    };

    if (target.variant) {
      const { variantGroupId, variantId, frameIndex } = target.variant;
      return {
        ...project,
        variants: project.variants?.map((vg) =>
          vg.id !== variantGroupId
            ? vg
            : {
                ...vg,
                variants: vg.variants.map((v) =>
                  v.id !== variantId
                    ? v
                    : {
                        ...v,
                        frames: v.frames.map((f, idx) =>
                          idx !== frameIndex
                            ? f
                            : {
                                ...f,
                                layers: f.layers.map((l, li) =>
                                  li === 0
                                    ? { ...l, pixels: rewriteGrid(l.pixels) }
                                    : l,
                                ),
                              },
                        ),
                      },
                ),
              },
        ),
      };
    }

    return {
      ...project,
      objects: project.objects.map((o) =>
        o.id !== target.objectId
          ? o
          : {
              ...o,
              frames: o.frames.map((f) =>
                f.id !== target.frameId
                  ? f
                  : {
                      ...f,
                      layers: f.layers.map((l) =>
                        l.id === target.layerId
                          ? { ...l, pixels: rewriteGrid(l.pixels) }
                          : l,
                      ),
                    },
              ),
            },
      ),
    };
  };

  /** Undo one entry ON PAPER, whatever family it belongs to. */
  const rewindCommand = (project: Project, command: Command): Project => {
    if (isPixelCommand(command)) return rewindPixelCommand(project, command);
    const children = (command as Command & { children?: readonly Command[] })
      .children;
    if (children) {
      // A composite undoes its children in REVERSE, matching `undo()`.
      let result = project;
      for (let i = children.length - 1; i >= 0; i--) {
        result = rewindCommand(result, children[i]);
      }
      return result;
    }
    // A snapshot command's pre-state IS its `before`.
    return (command as Command & { before?: Project }).before ?? project;
  };

  const computeMirror = (): Pick<
    EditorState,
    "projectHistory" | "historyIndex"
  > => {
    return runInAction(() => {
      const entries = history.entries;
      const list: Project[] = new Array(entries.length);

      // Walk backwards from the live project. Only entries at or before the
      // cursor have been APPLIED to it; a redo tail sitting above the cursor
      // has not, so it is rewound from the same baseline.
      const live = get().project;
      let state = live;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!state) break;
        // `entries[i].before` — the state to return to by undoing entry i.
        state = rewindCommand(state, entries[i]);
        list[i] = state;
      }

      // A command whose pre-state could not be reconstructed (no live
      // project) is dropped rather than mirrored as a hole.
      const dense = list.filter((entry): entry is Project => Boolean(entry));
      mirroredHistory = dense;
      mirroredIndex = history.index;
      return { projectHistory: dense, historyIndex: history.index };
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
  // one entry; every `setPixel` during the drag records an inverse patch INTO
  // the transaction and `end` collapses them into one `CompositeCommand`.
  //
  // ── ⚠️ TASK 26: THE STROKE SNAPSHOT IS DEFERRED, NOT REMOVED ──────────
  //
  // Task 17's `begin` called `history.snapshot("Draw")` eagerly, so EVERY drag
  // opened with a full project clone. Measured through the store on a 64×64
  // tinyProject, a 50-move pencil stroke cost:
  //
  //     snapshot 103,424 B  +  patches 1,684 B  =  105,108 B
  //
  // i.e. 98% of a stroke's history cost was the snapshot the patches make
  // redundant. On the owner's real project that leading clone is ~6.9 MB.
  //
  // Removing it outright was tried and REVERTED: task 08 pins the empty case
  // explicitly —
  //
  //     "beginStroke ALWAYS snapshots, even on a stroke that paints nothing"
  //     (drawing.test.ts:323) — begin/end with no write must leave ONE entry.
  //
  // So the snapshot is DEFERRED instead. `begin` opens the transaction and
  // records nothing; `end` takes a snapshot ONLY when the transaction is
  // still empty, which is exactly the pinned empty-stroke case. A stroke that
  // painted anything commits its coalesced patches alone.
  //
  // Both pinned behaviours hold: an empty stroke still produces one entry, and
  // a painting stroke still produces exactly one entry (the coalesced patch).
  // The composite's `before` is no longer needed for a painting stroke because
  // the mirror reconstructs a patch entry's pre-state by rewinding — see
  // `computeMirror`.
  const stroke = {
    begin: () => {
      reconcile();
      runInAction(() => {
        // beginTransaction auto-commits a dangling transaction first — the
        // pinned nested-beginStroke behaviour.
        history.beginTransaction("Draw");
      });
      set(computeMirror());
    },
    end: () => {
      reconcile();
      runInAction(() => {
        // The deferred snapshot: an empty stroke still records one entry.
        if (history.isTransactionEmpty) {
          history.snapshot("Draw");
        }
        history.endTransaction();
      });
      set(computeMirror());
    },
    isActive: () => history.inTransaction,
  };

  // Task 26: the stroke seam is consumed by the bridge's `beginStroke` /
  // `endStroke` delegates, which need this closure's mirror bookkeeping
  // (`reconcile()` … `computeMirror()`), not a bare `HistoryStore` call.
  strokeControl = stroke;
  // Task 26: `PixelStore` records commands directly; this is how it asks the
  // single mirror writer to re-publish afterwards. See `PixelMirror.syncHistory`.
  syncHistoryMirror = () => {
    set(computeMirror());
  };
  // Task 26: `PixelStore` must ADOPT an external write to the legacy
  // `projectHistory` array before it records, exactly as every other history
  // operation does. The task 08 harness's `load()`/`reset()` write the field
  // directly (`storeContract.ts:290,313`), so without this a store loaded
  // mid-suite records onto a stale stack and the mirror reports the PREVIOUS
  // test's depth. Measured: 4 drawing tests failed with an off-by-one entry
  // count that appeared only when the whole file ran.
  reconcileHistory = () => {
    reconcile();
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
  // Task 25: these four modules are throwing stubs; the real implementations
  // are FrameStore / LayerStore / TimelineUIStore, installed as delegates by
  // `installBridge`.
  const frameActions = createFrameActions();
  const layerActions = createLayerActions();
  const layerClipboardActions = createLayerClipboardActions();
  const timelineActions = createTimelineActions();
  // Task 26: only the gesture actions remain here; the four pixel/stroke
  // actions are throwing stubs behind bridge delegates into
  // PixelStore / HistoryStore.
  const drawingActions = createDrawingActions(set);
  const toolActions = createToolActions(get, set, updateProjectAndSave);
  const paletteActions = createPaletteActions();
  const referenceActions = createReferenceActions(
    get,
    set,
    updateProjectAndSave,
  );
  // Task 26: throwing stubs; the real implementations are SelectionUIStore
  // (the 9 mask actions) and PixelStore (the 2 pixel mutations).
  const selectionActions = createSelectionActions();
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
