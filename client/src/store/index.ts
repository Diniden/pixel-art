import { create } from "zustand";
import { projectToCompact, compactToProject } from "../types";
import {
  scheduleAutoSave,
  setOnSaveStatusChange,
} from "../services/autoSave";
import { MAX_HISTORY } from "./storeTypes";
import type { EditorState } from "./storeTypes";

// Re-export types so existing imports from "store" still work
export type {
  SaveStatus,
  ColorAdjustmentState,
  LayerClipboard,
  TimelineCellClipboard,
  EditorState,
} from "./storeTypes";

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

export const useEditorStore = create<EditorState>((set, get) => {
  // Set up save status callback
  setOnSaveStatusChange((status) => {
    set({ saveStatus: status });
    if (status === "saved") {
      setTimeout(() => {
        const currentStatus = get().saveStatus;
        if (currentStatus === "saved") {
          set({ saveStatus: "idle" });
        }
      }, 2000);
    }
  });

  // Update project and save - with optional history tracking
  const updateProjectAndSave = (
    updater: (project: import("../types").Project) => import("../types").Project,
    trackHistory: boolean = false,
  ) => {
    const { project, projectHistory, historyIndex, projectName } = get();
    if (!project) return;

    const newProject = updater(project);

    if (trackHistory) {
      // Deep clone the current project before saving to history
      // This ensures history entries are completely independent
      const compactProject = projectToCompact(project);
      const clonedProject = compactToProject(compactProject);

      // Add current project to history before making the change
      const newHistory = [
        ...projectHistory.slice(0, historyIndex + 1),
        clonedProject,
      ];
      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      set({
        project: newProject,
        projectHistory: newHistory,
        historyIndex: newHistory.length - 1,
      });
    } else {
      set({ project: newProject });
    }

    scheduleAutoSave(newProject, projectName);
  };

  // Save current project state to history without making changes
  const saveCurrentStateToHistory = () => {
    const { project, projectHistory, historyIndex } = get();
    if (!project) return;

    // Deep clone the current project before saving to history
    // This ensures history entries are completely independent
    const compactProject = projectToCompact(project);
    const clonedProject = compactToProject(compactProject);

    const newHistory = [
      ...projectHistory.slice(0, historyIndex + 1),
      clonedProject,
    ];
    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    set({
      projectHistory: newHistory,
      historyIndex: newHistory.length - 1,
    });
  };

  // Create all action modules
  const helpers = createHelpers(get);
  const projectActions = createProjectActions(get, set);
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
  const drawingActions = createDrawingActions(get, set, updateProjectAndSave);
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

    // History action (delegates to closure)
    saveCurrentStateToHistory: () => saveCurrentStateToHistory(),

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
