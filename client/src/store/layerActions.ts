import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import { createDefaultLayer, createEmptyPixelGrid, generateId } from "../types";
import { blendPixels } from "../utils/alphaBlend";

export function createLayerActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addLayer: (name: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => {
        const layerId = generateId();
        const newLayer = createDefaultLayer(
          layerId,
          name,
          obj.gridSize.width,
          obj.gridSize.height,
        );
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? { ...f, layers: [...f.layers, newLayer] }
                      : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerId,
          },
        };
      }, true);
    },

    duplicateLayer: (id: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const sourceLayer = frame.layers.find((l) => l.id === id);
      if (!sourceLayer) return;

      updateProjectAndSave((project) => {
        const newLayerId = generateId();
        const newLayer = {
          ...sourceLayer,
          id: newLayerId,
          name: `${sourceLayer.name} Copy`,
          pixels: sourceLayer.pixels.map((row) => [...row]),
        };

        // Find the index of the source layer and insert after it
        const sourceIndex = frame.layers.findIndex((l) => l.id === id);
        const newLayers = [...frame.layers];
        newLayers.splice(sourceIndex + 1, 0, newLayer);

        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id ? { ...f, layers: newLayers } : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: newLayerId,
          },
        };
      }, true);
    },

    deleteLayer: (id: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame || frame.layers.length <= 1) return;

      updateProjectAndSave((project) => {
        const newLayers = frame.layers.filter((l) => l.id !== id);
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id ? { ...f, layers: newLayers } : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: newLayers[0].id,
          },
        };
      }, true);
    },

    renameLayer: (id: string, name: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) =>
                            l.id === id ? { ...l, name } : l,
                          ),
                        }
                      : f,
                  ),
                }
              : o,
          ),
        }),
        true,
      );
    },

    toggleLayerVisibility: (id: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) =>
                            l.id === id ? { ...l, visible: !l.visible } : l,
                          ),
                        }
                      : f,
                  ),
                }
              : o,
          ),
        }),
        true,
      );
    },

    toggleAllLayersVisibility: (visible: boolean) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) => ({ ...l, visible })),
                        }
                      : f,
                  ),
                }
              : o,
          ),
        }),
        true,
      );
    },

    selectLayer: (id: string) => {
      // Clear color adjustment when switching layers
      set({ colorAdjustment: null });

      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            selectedLayerId: id,
            // Increment counter on every layer click (even re-selection) to allow
            // detecting layer clicks vs frame switches
            layerSelectionCounter:
              (project.uiState.layerSelectionCounter ?? 0) + 1,
          },
        }),
        false,
      ); // Don't track selection changes in history
    },

    moveLayer: (fromIndex: number, toIndex: number) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    if (f.id !== frame.id) return f;
                    const newLayers = [...f.layers];
                    const [removed] = newLayers.splice(fromIndex, 1);
                    newLayers.splice(toIndex, 0, removed);
                    return { ...f, layers: newLayers };
                  }),
                }
              : o,
          ),
        }),
        true,
      );
    },

    moveLayerAcrossAllFrames: (layerId: string, direction: "up" | "down") => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the layer's index in the current frame
      const currentLayerIndex = frame.layers.findIndex(
        (l) => l.id === layerId,
      );
      if (currentLayerIndex === -1) return;

      // Calculate target index
      const targetIndex =
        direction === "up" ? currentLayerIndex + 1 : currentLayerIndex - 1;

      // Check bounds - if can't move in current frame, can't move in any frame
      if (targetIndex < 0 || targetIndex >= frame.layers.length) return;

      // Move layer at the same index position in all frames
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only move if this frame has enough layers
                    if (f.layers.length <= currentLayerIndex) return f;

                    const newLayers = [...f.layers];
                    // Only move if target index is valid for this frame
                    if (targetIndex < 0 || targetIndex >= newLayers.length)
                      return f;

                    const [removed] = newLayers.splice(currentLayerIndex, 1);
                    newLayers.splice(targetIndex, 0, removed);
                    return { ...f, layers: newLayers };
                  }),
                }
              : o,
          ),
        }),
        true,
      );
    },

    deleteLayerAcrossAllFrames: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the layer's index in the current frame
      const currentLayerIndex = frame.layers.findIndex(
        (l) => l.id === layerId,
      );
      if (currentLayerIndex === -1) return;

      // Don't delete if it's the last layer
      if (frame.layers.length <= 1) return;

      // Delete layer at the same index position in all frames
      updateProjectAndSave((project) => {
        let newSelectedLayerId: string | null = null;

        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only delete if this frame has enough layers and has a layer at this index
                    if (
                      f.layers.length <= 1 ||
                      f.layers.length <= currentLayerIndex
                    )
                      return f;

                    const newLayers = f.layers.filter(
                      (_, index) => index !== currentLayerIndex,
                    );

                    // Set selected layer to the first remaining layer (or layer at same index if available)
                    if (f.id === frame.id && newLayers.length > 0) {
                      const targetIndex = Math.min(
                        currentLayerIndex,
                        newLayers.length - 1,
                      );
                      newSelectedLayerId = newLayers[targetIndex].id;
                    }

                    return { ...f, layers: newLayers };
                  }),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId:
              newSelectedLayerId || project.uiState.selectedLayerId,
          },
        };

        return updatedProject;
      }, true);
    },

    squashLayerDown: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
      if (layerIndex === -1 || layerIndex === 0) return; // Can't squash down if it's the bottom layer

      const currentLayer = frame.layers[layerIndex];
      const layerBelow = frame.layers[layerIndex - 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerBelow.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers
                            .map((l, idx) => {
                              if (idx === layerIndex - 1) {
                                // Blend current layer into layer below
                                const newPixels = createEmptyPixelGrid(
                                  width,
                                  height,
                                );
                                for (let y = 0; y < height; y++) {
                                  for (let x = 0; x < width; x++) {
                                    const belowPixel = l.pixels[y]?.[x] || 0;
                                    const currentPixel =
                                      f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                    // Blend current (src) onto below (dst)
                                    newPixels[y][x] = blendPixels(
                                      currentPixel,
                                      belowPixel,
                                    );
                                  }
                                }
                                return { ...l, pixels: newPixels };
                              }
                              return l;
                            })
                            .filter((_l, idx) => idx !== layerIndex), // Remove the current layer after squashing
                        }
                      : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerBelow.id,
          },
        };

        return updatedProject;
      }, true);
    },

    squashLayerUp: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
      if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return; // Can't squash up if it's the top layer

      const currentLayer = frame.layers[layerIndex];
      const layerAbove = frame.layers[layerIndex + 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerAbove.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers
                            .map((l, idx) => {
                              if (idx === layerIndex + 1) {
                                // Blend current layer into layer above
                                const newPixels = createEmptyPixelGrid(
                                  width,
                                  height,
                                );
                                for (let y = 0; y < height; y++) {
                                  for (let x = 0; x < width; x++) {
                                    const abovePixel = l.pixels[y]?.[x] || 0;
                                    const currentPixel =
                                      f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                    // Blend current (src) onto above (dst)
                                    newPixels[y][x] = blendPixels(
                                      currentPixel,
                                      abovePixel,
                                    );
                                  }
                                }
                                return { ...l, pixels: newPixels };
                              }
                              return l;
                            })
                            .filter((_l, idx) => idx !== layerIndex), // Remove the current layer after squashing
                        }
                      : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerAbove.id,
          },
        };

        return updatedProject;
      }, true);
    },

    squashLayerDownAcrossAllFrames: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
      if (layerIndex === -1 || layerIndex === 0) return; // Can't squash down if it's the bottom layer

      const currentLayer = frame.layers[layerIndex];
      const layerBelow = frame.layers[layerIndex - 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerBelow.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only squash if this frame has enough layers
                    if (f.layers.length <= layerIndex) return f;

                    const fCurrentLayer = f.layers[layerIndex];
                    const fLayerBelow = f.layers[layerIndex - 1];

                    // Skip if either layer is a variant
                    if (fCurrentLayer.isVariant || fLayerBelow.isVariant)
                      return f;

                    return {
                      ...f,
                      layers: f.layers
                        .map((l, idx) => {
                          if (idx === layerIndex - 1) {
                            // Blend current layer into layer below
                            const newPixels = createEmptyPixelGrid(
                              width,
                              height,
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                const belowPixel = l.pixels[y]?.[x] || 0;
                                const currentPixel =
                                  f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                // Blend current (src) onto below (dst)
                                newPixels[y][x] = blendPixels(
                                  currentPixel,
                                  belowPixel,
                                );
                              }
                            }
                            return { ...l, pixels: newPixels };
                          }
                          return l;
                        })
                        .filter((_l, idx) => idx !== layerIndex), // Remove the current layer after squashing
                    };
                  }),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerBelow.id,
          },
        };

        return updatedProject;
      }, true);
    },

    squashLayerUpAcrossAllFrames: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
      if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return; // Can't squash up if it's the top layer

      const currentLayer = frame.layers[layerIndex];
      const layerAbove = frame.layers[layerIndex + 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerAbove.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only squash if this frame has enough layers
                    if (f.layers.length <= layerIndex + 1) return f;

                    const fCurrentLayer = f.layers[layerIndex];
                    const fLayerAbove = f.layers[layerIndex + 1];

                    // Skip if either layer is a variant
                    if (fCurrentLayer.isVariant || fLayerAbove.isVariant)
                      return f;

                    return {
                      ...f,
                      layers: f.layers
                        .map((l, idx) => {
                          if (idx === layerIndex + 1) {
                            // Blend current layer into layer above
                            const newPixels = createEmptyPixelGrid(
                              width,
                              height,
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                const abovePixel = l.pixels[y]?.[x] || 0;
                                const currentPixel =
                                  f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                // Blend current (src) onto above (dst)
                                newPixels[y][x] = blendPixels(
                                  currentPixel,
                                  abovePixel,
                                );
                              }
                            }
                            return { ...l, pixels: newPixels };
                          }
                          return l;
                        })
                        .filter((_l, idx) => idx !== layerIndex), // Remove the current layer after squashing
                    };
                  }),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerAbove.id,
          },
        };

        return updatedProject;
      }, true);
    },

    moveLayerPixels: (dx: number, dy: number) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;
        const frameIndex =
          project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave(
          (proj) => ({
            ...proj,
            // Update variants at project level
            variants: proj.variants?.map((vg) => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: vg.variants.map((v) => {
                  if (v.id !== variantId) return v;
                  return {
                    ...v,
                    frames: v.frames.map((f, idx) => {
                      if (idx !== frameIndex % v.frames.length) return f;
                      return {
                        ...f,
                        layers: f.layers.map((l) => {
                          // Create new pixel grid shifted by dx, dy
                          const newPixels = createEmptyPixelGrid(width, height);
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const srcX = x - dx;
                              const srcY = y - dy;
                              if (
                                srcX >= 0 &&
                                srcX < width &&
                                srcY >= 0 &&
                                srcY < height
                              ) {
                                newPixels[y][x] = l.pixels[srcY][srcX];
                              }
                            }
                          }
                          return { ...l, pixels: newPixels };
                        }),
                      };
                    }),
                  };
                }),
              };
            }),
          }),
          true,
        );
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;
      const moveAll = project.uiState.moveAllLayers;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) => {
                            // If moveAll is false, only move the selected layer
                            if (!moveAll && l.id !== layer.id) return l;

                            // Create new pixel grid shifted by dx, dy
                            const newPixels = createEmptyPixelGrid(
                              width,
                              height,
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                const srcX = x - dx;
                                const srcY = y - dy;
                                if (
                                  srcX >= 0 &&
                                  srcX < width &&
                                  srcY >= 0 &&
                                  srcY < height
                                ) {
                                  newPixels[y][x] = l.pixels[srcY][srcX];
                                }
                              }
                            }
                            return { ...l, pixels: newPixels };
                          }),
                        }
                      : f,
                  ),
                }
              : o,
          ),
        }),
        true,
      );
    },
  };
}
