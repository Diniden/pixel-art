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
