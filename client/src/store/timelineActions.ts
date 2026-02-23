import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type { Layer, PixelData } from "../types";
import { createDefaultLayer, generateId } from "../types";

export function createTimelineActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addLayerToAllFrames: (name: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave((project) => {
        const layerId = generateId();
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    const newLayer = createDefaultLayer(
                      generateId(),
                      name,
                      obj.gridSize.width,
                      obj.gridSize.height,
                    );
                    // Add to top of layer stack
                    return { ...f, layers: [...f.layers, newLayer] };
                  }),
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

    addLayerToFrameAtPosition: (
      frameId: string,
      name: string,
      position: number,
      variantInfo?: {
        isVariant?: boolean;
        variantGroupId?: string;
        selectedVariantId?: string;
        variantOffsets?: { [variantId: string]: { x: number; y: number } };
        variantOffset?: { x: number; y: number };
      },
    ) => {
      const obj = get().getCurrentObject();
      if (!obj) return "";

      const layerId = generateId();
      updateProjectAndSave((project) => {
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    if (f.id !== frameId) return f;
                    const newLayer: Layer = {
                      ...createDefaultLayer(
                        layerId,
                        name,
                        obj.gridSize.width,
                        obj.gridSize.height,
                      ),
                      // Add variant information if provided
                      ...(variantInfo?.isVariant
                        ? {
                            isVariant: true,
                            variantGroupId: variantInfo.variantGroupId,
                            selectedVariantId: variantInfo.selectedVariantId,
                            variantOffsets: variantInfo.variantOffsets,
                            variantOffset: variantInfo.variantOffset,
                          }
                        : {}),
                    };
                    // Insert at the specified position
                    const newLayers = [...f.layers];
                    newLayers.splice(position, 0, newLayer);
                    return { ...f, layers: newLayers };
                  }),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerId,
          },
        };
      }, true);
      return layerId;
    },

    deleteLayerFromFrame: (frameId: string, layerId: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find((f) => f.id === frameId);
      if (!frame || frame.layers.length <= 1) return;

      updateProjectAndSave((project) => {
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frameId
                      ? {
                          ...f,
                          layers: f.layers.filter((l) => l.id !== layerId),
                        }
                      : f,
                  ),
                }
              : o,
          ),
          uiState: {
            ...project.uiState,
            // If the deleted layer was selected, select another layer
            selectedLayerId:
              project.uiState.selectedLayerId === layerId
                ? (frame.layers.find((l) => l.id !== layerId)?.id ?? null)
                : project.uiState.selectedLayerId,
          },
        };
      }, true);
    },

    reorderLayerInFrame: (
      frameId: string,
      layerId: string,
      newIndex: number,
    ) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    if (f.id !== frameId) return f;

                    const currentIndex = f.layers.findIndex(
                      (l) => l.id === layerId,
                    );
                    if (currentIndex === -1 || currentIndex === newIndex)
                      return f;

                    const newLayers = [...f.layers];
                    const [removed] = newLayers.splice(currentIndex, 1);
                    newLayers.splice(newIndex, 0, removed);
                    return { ...f, layers: newLayers };
                  }),
                }
              : o,
          ),
        }),
        true,
      );
    },

    copyTimelineCell: (frameId: string, layerId: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find((f) => f.id === frameId);
      if (!frame) return;

      const layer = frame.layers.find((l) => l.id === layerId);
      if (!layer) return;

      // Deep copy the pixels
      const pixelsCopy: PixelData[][] = layer.pixels.map((row) =>
        row.map(
          (pd) =>
            ({
              color:
                pd.color === 0
                  ? 0
                  : {
                      r: pd.color.r,
                      g: pd.color.g,
                      b: pd.color.b,
                      a: pd.color.a,
                    },
              normal:
                pd.normal === 0
                  ? 0
                  : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
              height: pd.height,
            }) as PixelData,
        ),
      );

      set({
        timelineCellClipboard: {
          layerName: layer.name,
          pixels: pixelsCopy,
          // Preserve variant information if this is a variant layer
          isVariant: layer.isVariant,
          variantGroupId: layer.variantGroupId,
          selectedVariantId: layer.selectedVariantId,
          variantOffsets: layer.variantOffsets,
          variantOffset: layer.variantOffset,
        },
      });
    },

    pasteTimelineCell: (frameId: string, targetLayerId: string) => {
      const { timelineCellClipboard } = get();
      if (!timelineCellClipboard) return;

      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find((f) => f.id === frameId);
      if (!frame) return;

      const targetLayer = frame.layers.find((l) => l.id === targetLayerId);
      if (!targetLayer) return;

      // Deep copy clipboard pixels
      const newPixels: PixelData[][] = timelineCellClipboard.pixels.map((row) =>
        row.map(
          (pd) =>
            ({
              color:
                pd.color === 0
                  ? 0
                  : {
                      r: pd.color.r,
                      g: pd.color.g,
                      b: pd.color.b,
                      a: pd.color.a,
                    },
              normal:
                pd.normal === 0
                  ? 0
                  : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
              height: pd.height,
            }) as PixelData,
        ),
      );

      // Build updated layer with pixels and variant information if present
      let updatedLayer: Layer;

      // If clipboard contains variant information, preserve it
      if (timelineCellClipboard.isVariant) {
        updatedLayer = {
          ...targetLayer,
          pixels: newPixels,
          isVariant: true,
          variantGroupId: timelineCellClipboard.variantGroupId,
          selectedVariantId: timelineCellClipboard.selectedVariantId,
          variantOffsets: timelineCellClipboard.variantOffsets,
          variantOffset: timelineCellClipboard.variantOffset,
        };
      } else {
        // If clipboard doesn't have variant info, clear variant properties
        // (in case we're pasting a normal layer over a variant layer)
        const {
          isVariant,
          variantGroupId,
          selectedVariantId,
          variantOffsets,
          variantOffset,
          ...rest
        } = targetLayer;
        updatedLayer = {
          ...rest,
          pixels: newPixels,
        } as Layer;
      }

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frameId
                      ? {
                          ...f,
                          layers: f.layers.map((l) =>
                            l.id === targetLayerId ? updatedLayer : l,
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
  };
}
