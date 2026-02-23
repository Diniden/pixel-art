import type {
  Tool,
  BitDepth,
  ShapeMode,
  Color,
  SelectionMode,
  SelectionBehavior,
} from "../types";
import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import { MAX_COLOR_HISTORY } from "./storeTypes";

export function createToolActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    setTool: (tool: Tool) => {
      const { project } = get();
      const currentTool = project?.uiState.selectedTool;

      // Trace modes should be mutually exclusive:
      // - Entering reference-trace tool turns off frame trace mode.
      if (tool === "reference-trace") {
        set({
          frameTraceActive: false,
          frameTraceFrameIndex: null,
          frameOverlayOffset: { x: 0, y: 0 },
        });
      }

      // When switching TO eyedropper, save the current tool
      if (
        tool === "eyedropper" &&
        currentTool &&
        currentTool !== "eyedropper"
      ) {
        set({ previousTool: currentTool });
      }
      // When switching away from eyedropper manually, clear previous tool
      else if (currentTool === "eyedropper" && tool !== "eyedropper") {
        set({ previousTool: null });
      }

      // Clear color adjustment when switching tools
      set({ colorAdjustment: null });

      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectedTool: tool },
        }),
        false,
      );
    },

    revertToPreviousTool: () => {
      const { previousTool, project } = get();
      if (previousTool && project?.uiState.selectedTool === "eyedropper") {
        set({ previousTool: null });
        updateProjectAndSave(
          (project) => ({
            ...project,
            uiState: { ...project.uiState, selectedTool: previousTool },
          }),
          false,
        );
      }
    },

    setColor: (color: Color) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectedColor: color },
        }),
        false,
      );
    },

    setColorAndAddToHistory: (color: Color) => {
      const { colorHistory } = get();

      // Check if color already exists in history
      const existingIndex = colorHistory.findIndex(
        (c) =>
          c.r === color.r &&
          c.g === color.g &&
          c.b === color.b &&
          c.a === color.a,
      );

      let newHistory: Color[];
      if (existingIndex !== -1) {
        // Move existing color to front
        newHistory = [
          color,
          ...colorHistory.filter((_, i) => i !== existingIndex),
        ];
      } else {
        // Add new color to front, limit to MAX_COLOR_HISTORY
        newHistory = [color, ...colorHistory].slice(0, MAX_COLOR_HISTORY);
      }

      set({ colorHistory: newHistory });
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectedColor: color },
        }),
        false,
      );
    },

    addToColorHistory: (color: Color) => {
      const { colorHistory } = get();

      // Check if color already exists in history
      const existingIndex = colorHistory.findIndex(
        (c) =>
          c.r === color.r &&
          c.g === color.g &&
          c.b === color.b &&
          c.a === color.a,
      );

      if (existingIndex !== -1) {
        // Move existing color to front
        const newHistory = [
          color,
          ...colorHistory.filter((_, i) => i !== existingIndex),
        ];
        set({ colorHistory: newHistory });
      } else {
        // Add new color to front, limit to MAX_COLOR_HISTORY
        const newHistory = [color, ...colorHistory].slice(0, MAX_COLOR_HISTORY);
        set({ colorHistory: newHistory });
      }
    },

    setBrushSize: (size: number) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, brushSize: size },
        }),
        false,
      );
    },

    setEraserShape: (shape: "circle" | "square") => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, eraserShape: shape },
        }),
        false,
      );
    },

    setPencilBrushShape: (shape: "circle" | "square") => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, pencilBrushShape: shape },
        }),
        false,
      );
    },

    setPencilBrushMax: (max: 8 | 16 | 32 | 64 | 128) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            pencilBrushMax: max,
            // Keep the current brush size valid under the new max
            brushSize: Math.min(project.uiState.brushSize, max),
          },
        }),
        false,
      );
    },

    setTraceNudgeAmount: (amount: 10 | 20 | 25 | 50 | 100) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, traceNudgeAmount: amount },
        }),
        false,
      );
    },

    setNormalBrushShape: (shape: "circle" | "square") => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, normalBrushShape: shape },
        }),
        false,
      );
    },

    setBitDepth: (depth: BitDepth) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, bitDepth: depth },
        }),
        false,
      );
    },

    setShapeMode: (mode: ShapeMode) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, shapeMode: mode },
        }),
        false,
      );
    },

    setBorderRadius: (radius: number) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, borderRadius: Math.max(0, radius) },
        }),
        false,
      );
    },

    setZoom: (zoom: number) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            zoom: Math.max(1, Math.min(50, zoom)),
          },
        }),
        false,
      );
    },

    setPanOffset: (offset: { x: number; y: number }) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, panOffset: offset },
        }),
        false,
      );
    },

    setMoveAllLayers: (moveAll: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, moveAllLayers: moveAll },
        }),
        false,
      );
    },

    setFrameReferencePanelPosition: (position: {
      topPercent: number;
      leftPercent: number;
    }) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            frameReferencePanelPosition: position,
          },
        }),
        false,
      );
    },

    setFrameReferencePanelMinimized: (minimized: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            frameReferencePanelMinimized: minimized,
          },
        }),
        false,
      );
    },

    setReferenceImagePanelPosition: (position: {
      topPercent: number;
      leftPercent: number;
    }) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            referenceImagePanelPosition: position,
          },
        }),
        false,
      );
    },

    setReferenceImagePanelMinimized: (minimized: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            referenceImagePanelMinimized: minimized,
          },
        }),
        false,
      );
    },

    setLightingPreviewPanelPosition: (position: {
      topPercent: number;
      leftPercent: number;
    }) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            lightingPreviewPanelPosition: position,
          },
        }),
        false,
      );
    },

    setLightingPreviewPanelMinimized: (minimized: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            lightingPreviewPanelMinimized: minimized,
          },
        }),
        false,
      );
    },

    setCanvasInfoHidden: (hidden: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, canvasInfoHidden: hidden },
        }),
        false,
      );
    },

    setObjectLibraryViewMode: (mode: "normal" | "small-rows" | "grid") => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, objectLibraryViewMode: mode },
        }),
        false,
      );
    },

    setTimelineThumbnailMode: (enabled: boolean) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, timelineThumbnailMode: enabled },
        }),
        false,
      );
    },

    toggleFocusMode: () => {
      const { project } = get();
      if (!project) return;

      const next = !(project.uiState.focusMode ?? false);
      updateProjectAndSave(
        (p) => ({
          ...p,
          uiState: { ...p.uiState, focusMode: next },
        }),
        false,
      );
    },

    toggleLightGridMode: () => {
      const { project } = get();
      if (!project) return;

      const next = !(project.uiState.lightGridMode ?? false);
      updateProjectAndSave(
        (p) => ({
          ...p,
          uiState: { ...p.uiState, lightGridMode: next },
        }),
        false,
      );
    },

    toggleFrameReferencePanelVisible: () => {
      const { project } = get();
      if (!project) return;

      const next = !(project.uiState.frameReferencePanelVisible ?? true);
      updateProjectAndSave(
        (p) => ({
          ...p,
          uiState: { ...p.uiState, frameReferencePanelVisible: next },
        }),
        false,
      );
    },

    setOriginColor: (color: Color) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, originColor: color },
        }),
        false,
      );
    },

    setGaussianFillParams: (params: {
      smoothing: number;
      radius: number;
      radiusMax?: number;
    }) => {
      const { project } = get();
      const prevMax = project?.uiState.gaussianFill?.radiusMax ?? 16;
      const radiusMax = params.radiusMax ?? prevMax;
      const smoothing = Math.max(0.1, Math.min(5.0, params.smoothing));
      const radius = Math.max(0.5, Math.min(radiusMax, params.radius));
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            gaussianFill: {
              smoothing,
              radius,
              radiusMax,
            },
          },
        }),
        false,
      );
    },

    setSelectionMode: (mode: SelectionMode) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectionMode: mode },
        }),
        false,
      );
    },

    setSelectionBehavior: (behavior: SelectionBehavior) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectionBehavior: behavior },
        }),
        false,
      );
    },

    setAiServiceUrl: (url: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, aiServiceUrl: url },
        }),
        false,
      );
    },
  };
}
