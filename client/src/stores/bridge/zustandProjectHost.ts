/**
 * The Zustand-backed {@link ProjectHost} (REFRESH task 16). TEMPORARY —
 * bridge-era plumbing, deleted when the domain tree moves into MobX (tasks
 * 23+/38).
 *
 * `DomainStore` owns the load/save LIFECYCLE but the project TREE is still
 * Zustand state, read by 34 unmigrated consumers. This host is how the
 * lifecycle flows install/read that tree without `stores/domain/` importing
 * the Zustand store directly.
 *
 * `installProject` resets the undo history exactly as the old
 * `projectActions` did on init/create/switch/delete; `replaceProject` keeps
 * it (restore-from-backup is undoable); `snapshotToHistory` is the deep-clone
 * history push moved verbatim from `projectActions.ts:186-198`.
 */
import {
  reconcileHistory,
  syncHistoryMirror,
  useEditorStore,
} from "../../store";
import { compactToProject, projectToCompact } from "../../types";
import type { Color, Project } from "../../types";
import type { ProjectHost } from "../domain/DomainStore";
import type { DomainMirror } from "../domain/DomainMutator";
import type { SelectionSink } from "../domain/ObjectStore";
import type { PixelMirror } from "../domain/PixelStore";
import { MAX_COLOR_HISTORY } from "../../store/storeTypes";
import type { SelectionState } from "../../store/storeTypes";

export function createZustandProjectHost(): ProjectHost {
  return {
    getProject: () => useEditorStore.getState().project,

    installProject: (project: Project) => {
      useEditorStore.setState({
        project,
        projectHistory: [],
        historyIndex: -1,
      });
    },

    replaceProject: (project: Project) => {
      useEditorStore.setState({ project });
    },

    snapshotToHistory: () => {
      const { project, projectHistory, historyIndex } =
        useEditorStore.getState();
      if (!project) return;
      // Deep clone via the real serializer round-trip so the history entry is
      // completely independent (verbatim from projectActions.ts:186-198).
      const compactSnapshot = projectToCompact(project);
      const clonedSnapshot = compactToProject(compactSnapshot);
      const newHistory = [
        ...projectHistory.slice(0, historyIndex + 1),
        clonedSnapshot,
      ];
      useEditorStore.setState({
        projectHistory: newHistory,
        historyIndex: newHistory.length - 1,
      });
    },
  };
}

/**
 * The Phase B publisher (task 23). A committed MobX-native domain mutation
 * is pushed into Zustand BY REFERENCE — never cloned — so the 34 unmigrated
 * consumers re-render exactly as they did when Zustand owned the tree.
 *
 * `uiState` rides along inside `project` untouched: `DomainStore` rebuilt the
 * project from its own tree plus the hosted `uiState`, so this write cannot
 * change the UI slice.
 */
export function createZustandDomainMirror(): DomainMirror {
  return {
    publish: (project: Project) => {
      useEditorStore.setState({ project });
    },

    // Routed through the Zustand action, NOT through HistoryStore directly:
    // that action is the single writer of the `projectHistory`/`historyIndex`
    // Phase B mirror (task 17's glue, `store/index.ts`). See the note on
    // `DomainMirror.snapshot`.
    snapshot: (label: string) => {
      useEditorStore.getState().saveCurrentStateToHistory(label);
    },
  };
}

/**
 * Where `ObjectStore` writes the `uiState` selection ids during the bridge
 * era (task 23). `uiState` is still Zustand-owned, and a domain store may not
 * import a UI store, so the write arrives through this injected sink.
 *
 * Merges into the CURRENT project rather than the one the mutation saw, so it
 * composes correctly after `publish()` has already landed the new tree.
 */
export function createZustandSelectionSink(): SelectionSink {
  return {
    selectObjectTree: (ids) => {
      const { project } = useEditorStore.getState();
      if (!project) return;
      useEditorStore.setState({
        project: { ...project, uiState: { ...project.uiState, ...ids } },
      });
    },
  };
}

/**
 * How `TimelineUIStore` publishes a selection change during the bridge era
 * (task 25).
 *
 * The four selection ids and `variantFrameIndices` are still PHASE A —
 * `store/objectActions.ts` and `store/variantActions.ts` (both outside task
 * 25's `Touches`) still write them, so MobX cannot be their single writer yet
 * without violating R6. This sink is therefore the Zustand-ward half of that
 * arrangement: the store computes the new selection, writes it to Zustand, and
 * the bridge's Phase A `syncPhaseA` reads it straight back. One value, one
 * round trip, no divergence.
 *
 * `trackHistory` is FALSE for every selection write — pinned by task 08
 * ("selectLayer does NOT track history"), and the reason this goes through a
 * plain `setState` rather than `updateProjectAndSave(..., true)`.
 *
 * ⚠️ It merges into the CURRENT project, not the one the action saw, so it
 * composes correctly after a domain mutation has already published a new tree.
 */
export function createZustandTimelineContext(): {
  publishSelection(patch: {
    selectedFrameId?: string | null;
    selectedLayerId?: string | null;
    selectedObjectId?: string | null;
    variantFrameIndices?: { [variantGroupId: string]: number };
    layerSelectionCounter?: number;
  }): void;
  clearColorAdjustment(): void;
  publishAiServiceUrl(url: string): void;
  publishColorAndHistory(color: Color): void;
  publishSelectedColor(color: Color): void;
} {
  return {
    publishSelection: (patch) => {
      const { project } = useEditorStore.getState();
      if (!project) return;
      useEditorStore.setState({
        project: { ...project, uiState: { ...project.uiState, ...patch } },
      });
    },

    // Verbatim from `layerActions.ts:210` — `selectLayer` drops any pending
    // colour adjustment when the layer changes.
    clearColorAdjustment: () => {
      useEditorStore.setState({ colorAdjustment: null });
    },

    /**
     * `uiState.selectedColor` ALONE — W29h, for `adjustColor`'s coupled write.
     *
     * ⚠️ NOT a duplicate of `publishColorAndHistory` below, and the
     * difference is behavioural rather than cosmetic: that one also prepends
     * to `colorHistory`, because `toolActions.ts:111` (picking a colour) does.
     * `colorAdjustmentActions.ts` does NOT — it writes only
     * `uiState.selectedColor` — and dragging the adjustment slider fires this
     * on every frame, so reusing the wider sink would flood the
     * recent-colours trail with every intermediate value the drag passed
     * through.
     *
     * It writes the SOURCE for the same measured reason as every sink here:
     * `selectedColor` is one of the ~30 fields the bridge re-hydrates
     * wholesale from `project.uiState` on every Zustand change
     * (`zustandBridge.ts:334`), so a MobX-only write is reverted by the next
     * unrelated change.
     *
     * `trackHistory` is false — a plain `setState`, never
     * `updateProjectAndSave`. The legacy action folds this field into the
     * pixel commit whose `trackHistory` the caller chose; the pixels are
     * already recorded by `PixelStore`, and recording the colour again here
     * would double the entry.
     */
    publishSelectedColor: (color) => {
      const { project } = useEditorStore.getState();
      if (!project) return;
      useEditorStore.setState({
        project: {
          ...project,
          uiState: { ...project.uiState, selectedColor: color },
        },
      });
    },

    /**
     * W29d — the PERSISTING half of `setAiServiceUrl`.
     *
     * `SessionStore.setAiServiceUrl` only assigns the observable. The legacy
     * `store/toolActions.ts:514` did more: it ran `updateProjectAndSave`, so
     * the value landed in `project.uiState.aiServiceUrl` and SURVIVED A
     * RELOAD. That is the whole reason `HeaderContainer` could not simply
     * swap to the MobX setter — the value would set, look right, and quietly
     * vanish on the next load.
     *
     * ⚠️ THIS IS NOT A SECOND WRITER (R6). `aiServiceUrl` is a PHASE A field:
     * Zustand's `project.uiState` is the source of truth and `syncPhaseA`
     * mirrors it into `session.aiServiceUrl` on EVERY Zustand change. So the
     * MobX observable is not independently writable at all — assigning it
     * alone is overwritten by the very next sync. Writing the Phase A SOURCE
     * here is the only write that sticks, and the mirror then carries it back
     * into MobX, which is precisely the direction Phase A defines.
     *
     * `trackHistory` is false, matching the legacy action: an AI endpoint is
     * configuration, not an edit, and it must not consume an undo slot.
     */
    publishAiServiceUrl: (url) => {
      const { project } = useEditorStore.getState();
      if (!project) return;
      useEditorStore.setState({
        project: { ...project, uiState: { ...project.uiState, aiServiceUrl: url } },
      });
    },

    /**
     * W29d — the Zustand-sourced half of `setColorAndAddToHistory`.
     *
     * ⚠️ MEASURED: both fields it touches are Zustand-sourced during the
     * bridge era. `colorHistory` is a `PHASE_A_FIELDS` member mirrored at
     * `zustandBridge.ts:340`, and `selectedColor` is re-hydrated wholesale
     * from `project.uiState` at `:334` on EVERY Zustand change. Writing only
     * the MobX stores held for one tick and then reverted — the MobX
     * `selectedColor` went back to black after a single unrelated
     * `saveStatus` write. This writes the source so the value survives.
     *
     * The de-duplicate-and-cap rule is `toolActions.ts:111` verbatim: an
     * existing colour moves to the FRONT (it is not left in place), a new one
     * is prepended, and the list is trimmed to `MAX_COLOR_HISTORY`.
     * `SessionStore.addToColorHistory` carries the identical rule — the two
     * therefore agree by construction rather than by transcription luck.
     */
    publishColorAndHistory: (color) => {
      const state = useEditorStore.getState();
      const { project, colorHistory } = state;
      const existingIndex = colorHistory.findIndex(
        (c) =>
          c.r === color.r &&
          c.g === color.g &&
          c.b === color.b &&
          c.a === color.a,
      );
      const nextHistory =
        existingIndex !== -1
          ? [color, ...colorHistory.filter((_, i) => i !== existingIndex)]
          : [color, ...colorHistory].slice(0, MAX_COLOR_HISTORY);
      useEditorStore.setState({
        colorHistory: nextHistory,
        ...(project
          ? {
              project: {
                ...project,
                uiState: { ...project.uiState, selectedColor: color },
              },
            }
          : {}),
      });
    },
  };
}

/**
 * The Phase B publisher for a PIXEL mutation (task 26).
 *
 * Structurally the same one-line `setState` as {@link createZustandDomainMirror}'s
 * `publish`, and deliberately a SEPARATE factory: `PixelStore` needs no
 * `snapshot` member at all. It records inverse-patch commands directly onto
 * `HistoryStore` rather than routing through
 * `saveCurrentStateToHistory` — the whole point of the family conversion is
 * that a pixel edit never captures a project.
 *
 * ⚠️ BY REFERENCE, never cloned. The project carries 300k-cell grids.
 */
export function createZustandPixelMirror(): PixelMirror {
  return {
    publish: (project: Project) => {
      useEditorStore.setState({ project });
    },
    // Routed through the `store/index.ts` glue, NOT through HistoryStore
    // directly — that glue is the single writer of the
    // `projectHistory`/`historyIndex` Phase B mirror (R6, task 17). See
    // `PixelMirror.syncHistory`.
    syncHistory: () => {
      syncHistoryMirror();
    },
    reconcile: () => {
      reconcileHistory();
    },
    // Task 27: the FLIPS only. Routed through the same Zustand action
    // `createZustandDomainMirror` uses, because that action is the single
    // writer of the `projectHistory`/`historyIndex` Phase B mirror (R6, task
    // 17). See `PixelMirror.snapshot` for why the two flips are the one
    // exception to this store's no-snapshot rule.
    snapshot: (label: string) => {
      useEditorStore.getState().saveCurrentStateToHistory(label);
    },
  };
}

/**
 * How `SelectionUIStore` publishes the selection during the bridge era
 * (task 26).
 *
 * `EditorState.selection` is a TOP-LEVEL Zustand field (`storeTypes.ts:123`),
 * not part of `project.uiState`, and it is not persisted — so unlike the four
 * selection IDs it has no wire-format consequences and no second writer once
 * the legacy `selectionActions` become stubs.
 *
 * ⚠️ Assigns the `SelectionState` BY REFERENCE. Its `mask` is a raw
 * `Set<number>` that reaches 300,249 entries on a select-all over the owner's
 * real project; cloning it here would put a full mask copy on every selection
 * change.
 */
export function createZustandSelectionPublisher(): (
  selection: SelectionState | null,
) => void {
  return (selection) => {
    useEditorStore.setState({ selection });
  };
}
