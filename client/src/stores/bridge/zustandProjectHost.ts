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
import { useEditorStore } from "../../store";
import { compactToProject, projectToCompact } from "../../types";
import type { Project } from "../../types";
import type { ProjectHost } from "../domain/DomainStore";
import type { DomainMirror } from "../domain/DomainMutator";
import type { SelectionSink } from "../domain/ObjectStore";

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
