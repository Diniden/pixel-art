import {
  createDefaultProject,
  projectToCompact,
  compactToProject,
} from "../types";
import {
  loadProject,
  getConfig,
  listProjects,
  createProject as apiCreateProject,
  renameProject as apiRenameProject,
  switchProject as apiSwitchProject,
  deleteProject as apiDeleteProject,
} from "../services/api";
import { scheduleAutoSave, cancelPendingSave } from "../services/autoSave";
import type { StoreGet, StoreSet } from "./storeTypes";

export function createProjectActions(get: StoreGet, set: StoreSet) {
  return {
    initProject: async () => {
      set({ isLoading: true });
      try {
        // Load config to get current project name
        const config = await getConfig();
        const projectName = config.currentProject || "project";

        // Load the project list
        const projectList = await listProjects();

        // Load the project data
        const project = await loadProject(projectName);

        set({
          project,
          projectName,
          projectList,
          isLoading: false,
          projectHistory: [],
          historyIndex: -1,
        });
      } catch (error) {
        console.error("Failed to load project:", error);
        set({
          project: createDefaultProject(),
          projectName: "project",
          projectList: ["project"],
          isLoading: false,
          projectHistory: [],
          historyIndex: -1,
        });
      }
    },

    createNewProject: async (name: string) => {
      try {
        // Cancel any pending saves to the old project
        cancelPendingSave();

        // Create new project with default data
        const newProject = createDefaultProject();
        await apiCreateProject(name, newProject);

        // Refresh project list
        const projectList = await listProjects();

        set({
          project: newProject,
          projectName: name,
          projectList,
          projectHistory: [],
          historyIndex: -1,
        });

        return true;
      } catch (error) {
        console.error("Failed to create project:", error);
        return false;
      }
    },

    switchToProject: async (name: string) => {
      try {
        // Cancel any pending saves to the old project
        cancelPendingSave();

        set({ isLoading: true });

        // Switch project on server
        await apiSwitchProject(name);

        // Load the new project
        const project = await loadProject(name);

        set({
          project,
          projectName: name,
          isLoading: false,
          projectHistory: [],
          historyIndex: -1,
        });

        return true;
      } catch (error) {
        console.error("Failed to switch project:", error);
        set({ isLoading: false });
        return false;
      }
    },

    renameCurrentProject: async (newName: string) => {
      const { projectName } = get();
      try {
        await apiRenameProject(projectName, newName);

        // Refresh project list
        const projectList = await listProjects();

        set({
          projectName: newName,
          projectList,
        });

        return true;
      } catch (error) {
        console.error("Failed to rename project:", error);
        return false;
      }
    },

    deleteCurrentProject: async () => {
      const { projectName, projectList } = get();
      try {
        // Don't allow deleting the last project
        if (projectList.length <= 1) {
          console.error("Cannot delete the last project");
          return false;
        }

        // Cancel any pending saves
        cancelPendingSave();

        await apiDeleteProject(projectName);

        // Switch to another project
        const newProjectList = await listProjects();
        const newProjectName = newProjectList[0];
        const project = await loadProject(newProjectName);

        set({
          project,
          projectName: newProjectName,
          projectList: newProjectList,
          projectHistory: [],
          historyIndex: -1,
        });

        return true;
      } catch (error) {
        console.error("Failed to delete project:", error);
        return false;
      }
    },

    refreshProjectList: async () => {
      try {
        const projectList = await listProjects();
        set({ projectList });
      } catch (error) {
        console.error("Failed to refresh project list:", error);
      }
    },

    undo: () => {
      const { projectHistory, historyIndex, projectName } = get();
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
      scheduleAutoSave(clonedProject, projectName);
    },
  };
}
