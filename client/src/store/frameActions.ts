import { type Frame, createDefaultFrame, generateId } from "../types";
import type { StoreGet, UpdateProjectAndSave } from "./storeTypes";

export function createFrameActions(
  get: StoreGet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addFrame: (name: string, copyPrevious: boolean = false) => {
      const obj = get().getCurrentObject();
      const currentFrame = get().getCurrentFrame();
      if (!obj) return;

      updateProjectAndSave((project) => {
        const frameId = generateId();
        let newFrame: Frame;

        if (copyPrevious && currentFrame) {
          // Copy from the current/previous frame
          newFrame = {
            id: frameId,
            name,
            layers: currentFrame.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map((row) => [...row]),
            })),
          };
        } else {
          // Create empty frame
          newFrame = createDefaultFrame(
            frameId,
            name,
            obj.gridSize.width,
            obj.gridSize.height,
          );
        }

        // Find the index of the currently selected frame and insert after it
        const currentFrameIndex = obj.frames.findIndex(
          (f) => f.id === project.uiState.selectedFrameId,
        );
        const insertIndex =
          currentFrameIndex >= 0 ? currentFrameIndex + 1 : obj.frames.length;

        return {
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            const newFrames = [...o.frames];
            newFrames.splice(insertIndex, 0, newFrame);
            return { ...o, frames: newFrames };
          }),
          uiState: {
            ...project.uiState,
            selectedFrameId: newFrame.id,
            selectedLayerId: newFrame.layers[0].id,
          },
        };
      }, true);
    },

    deleteFrame: (id: string) => {
      const obj = get().getCurrentObject();
      if (!obj || obj.frames.length <= 1) return;

      updateProjectAndSave((project) => {
        const frameIndex = obj.frames.findIndex((f) => f.id === id);
        const newFrames = obj.frames.filter((f) => f.id !== id);
        // Select the previous frame if possible, otherwise the first one
        const newSelectedIndex = Math.max(0, frameIndex - 1);
        const selectedFrame = newFrames[newSelectedIndex] || newFrames[0];
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id ? { ...o, frames: newFrames } : o,
          ),
          uiState: {
            ...project.uiState,
            selectedFrameId: selectedFrame.id,
            selectedLayerId: selectedFrame.layers[0]?.id ?? null,
          },
        };
      }, true);
    },

    deleteSelectedFrame: () => {
      const { project } = get();
      if (!project?.uiState.selectedFrameId) return;
      get().deleteFrame(project.uiState.selectedFrameId);
    },

    renameFrame: (id: string, name: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === id ? { ...f, name } : f,
                  ),
                }
              : o,
          ),
        }),
        true,
      );
    },

    selectFrame: (id: string, syncVariants: boolean = true) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj) return;

      const currentLayer = get().getCurrentLayer();
      const frame = obj.frames.find((f) => f.id === id);

      // Find the base frame index
      const baseFrameIndex = obj.frames.findIndex((f) => f.id === id);

      // If currently editing a variant, keep the same variant layer selected
      const isEditingVariant = currentLayer?.isVariant === true;
      let newLayerId = project?.uiState.selectedLayerId ?? null;

      if (isEditingVariant && currentLayer && frame) {
        // Find the variant layer in the new frame (same variant group)
        const variantLayer = frame.layers.find(
          (l) =>
            l.isVariant && l.variantGroupId === currentLayer.variantGroupId,
        );
        if (variantLayer) {
          newLayerId = variantLayer.id;
        }
      } else if (frame && currentLayer) {
        // Try to find a layer with the same name in the new frame
        const matchingLayer = frame.layers.find(
          (l) => l.name === currentLayer.name,
        );
        if (matchingLayer) {
          newLayerId = matchingLayer.id;
        } else if (frame.layers.length > 0) {
          newLayerId = frame.layers[0].id;
        }
      } else if (frame && frame.layers && frame.layers.length > 0) {
        newLayerId = frame.layers[0].id;
      }

      // Sync variant frame indices with base frame index (only if syncVariants is true)
      // We need to look at each variant layer in the target frame to determine the correct
      // frame count based on the layer's selectedVariantId, not just the first variant
      const newVariantFrameIndices: { [key: string]: number } = {};
      if (syncVariants && project?.variants && baseFrameIndex >= 0 && frame) {
        for (const vg of project.variants) {
          // Find the variant layer in the target frame for this variant group
          const variantLayer = frame.layers.find(
            (l) => l.isVariant && l.variantGroupId === vg.id,
          );

          // Get the selected variant's frame count (use the layer's selectedVariantId)
          let variantFrameCount = 1;
          if (variantLayer?.selectedVariantId) {
            const selectedVariant = vg.variants.find(
              (v) => v.id === variantLayer.selectedVariantId,
            );
            variantFrameCount = selectedVariant?.frames.length ?? 1;
          } else {
            // Fallback to first variant if no layer found
            variantFrameCount = vg.variants[0]?.frames.length ?? 1;
          }

          if (variantFrameCount > 0) {
            // Map base frame index to variant frame index (wrap if needed)
            const variantFrameIndex = baseFrameIndex % variantFrameCount;
            newVariantFrameIndices[vg.id] = variantFrameIndex;
          }
        }
      }

      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            selectedFrameId: id,
            selectedLayerId: newLayerId ?? project.uiState.selectedLayerId,
            variantFrameIndices: syncVariants
              ? {
                  ...project.uiState.variantFrameIndices,
                  ...newVariantFrameIndices,
                }
              : project.uiState.variantFrameIndices,
          },
        }),
        false,
      ); // Don't track selection changes in history
    },

    duplicateFrame: (id: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const sourceFrameIndex = obj.frames.findIndex((f) => f.id === id);
      if (sourceFrameIndex === -1) return;
      const sourceFrame = obj.frames[sourceFrameIndex];

      updateProjectAndSave((project) => {
        const newFrameId = generateId();
        const newFrame: Frame = {
          ...sourceFrame,
          id: newFrameId,
          name: `${sourceFrame.name} Copy`,
          layers: sourceFrame.layers.map((l) => ({
            ...l,
            id: generateId(),
            pixels: l.pixels.map((row) => [...row]),
          })),
          tags: sourceFrame.tags ? [...sourceFrame.tags] : undefined,
        };

        return {
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            const newFrames = [...o.frames];
            newFrames.splice(sourceFrameIndex + 1, 0, newFrame);
            return { ...o, frames: newFrames };
          }),
          uiState: {
            ...project.uiState,
            selectedFrameId: newFrame.id,
            selectedLayerId: newFrame.layers[0].id,
          },
        };
      }, true);
    },

    moveFrame: (id: string, direction: "left" | "right") => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frameIndex = obj.frames.findIndex((f) => f.id === id);
      if (frameIndex === -1) return;

      const newIndex = direction === "left" ? frameIndex - 1 : frameIndex + 1;
      if (newIndex < 0 || newIndex >= obj.frames.length) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            const newFrames = [...o.frames];
            const [removed] = newFrames.splice(frameIndex, 1);
            newFrames.splice(newIndex, 0, removed);
            return { ...o, frames: newFrames };
          }),
        }),
        true,
      );
    },

    reorderFrame: (frameId: string, toIndex: number) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const fromIndex = obj.frames.findIndex((f) => f.id === frameId);
      if (fromIndex === -1) return;
      if (toIndex < 0 || toIndex > obj.frames.length) return;
      if (toIndex === fromIndex) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            const newFrames = [...o.frames];
            const [removed] = newFrames.splice(fromIndex, 1);
            const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            newFrames.splice(insertIndex, 0, removed);
            return { ...o, frames: newFrames };
          }),
        }),
        true,
      );
    },

    addFrameTag: (frameId: string, tag: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f) => {
                if (f.id !== frameId) return f;
                const tags = f.tags ?? [];
                if (tags.includes(trimmed)) return f;
                return { ...f, tags: [...tags, trimmed] };
              }),
            };
          }),
        }),
        true,
      );
    },

    removeFrameTag: (frameId: string, tag: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f) => {
                if (f.id !== frameId) return f;
                const tags = (f.tags ?? []).filter((t) => t !== tag);
                return { ...f, tags: tags.length ? tags : undefined };
              }),
            };
          }),
        }),
        true,
      );
    },
  };
}
