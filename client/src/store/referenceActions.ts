import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";

export function createReferenceActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    // Reference trace actions
    setReferenceOverlayOffset: (offset: { x: number; y: number }) => {
      set({ referenceOverlayOffset: offset });
    },

    moveReferenceOverlay: (dx: number, dy: number) => {
      const { referenceOverlayOffset } = get();
      set({
        referenceOverlayOffset: {
          x: referenceOverlayOffset.x + dx,
          y: referenceOverlayOffset.y + dy,
        },
      });
    },

    resetReferenceOverlay: () => {
      set({ referenceOverlayOffset: { x: 0, y: 0 } });
    },

    setReferenceImage: (
      referenceImage:
        | {
            imageBase64: string;
            selectionBox: {
              startX: number;
              startY: number;
              endX: number;
              endY: number;
            };
          }
        | undefined,
    ) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          referenceImage,
        }),
        false,
      ); // Don't track reference image changes in history
    },

    // Frame trace actions
    setFrameTraceActive: (active: boolean, frameIndex: number | null) => {
      // Trace modes should be mutually exclusive:
      // - Enabling frame trace exits the reference-trace tool (which is a tool-mode trace).
      const { project } = get();
      if (active && project?.uiState.selectedTool === "reference-trace") {
        updateProjectAndSave(
          (p) => ({
            ...p,
            uiState: { ...p.uiState, selectedTool: "pixel" },
          }),
          false,
        );
      }

      set({
        frameTraceActive: active,
        frameTraceFrameIndex: active ? frameIndex : null,
        frameOverlayOffset: active ? { x: 0, y: 0 } : { x: 0, y: 0 },
      });
    },

    moveFrameOverlay: (dx: number, dy: number) => {
      const { frameOverlayOffset } = get();
      set({
        frameOverlayOffset: {
          x: frameOverlayOffset.x + dx,
          y: frameOverlayOffset.y + dy,
        },
      });
    },

    resetFrameOverlay: () => {
      set({ frameOverlayOffset: { x: 0, y: 0 } });
    },

    // Frame reference object actions
    setFrameReferenceObjectId: (objectId: string | null) => {
      set({ frameReferenceObjectId: objectId });
    },

    getFrameReferenceObject: () => {
      const { project, frameReferenceObjectId } = get();
      if (!project) return null;

      // If a specific object is set for frame reference, use that
      if (frameReferenceObjectId) {
        return (
          project.objects.find((o) => o.id === frameReferenceObjectId) ?? null
        );
      }

      // Otherwise, fall back to the currently selected object
      const selectedObjectId = project.uiState.selectedObjectId;
      if (!selectedObjectId) return null;
      return project.objects.find((o) => o.id === selectedObjectId) ?? null;
    },
  };
}
