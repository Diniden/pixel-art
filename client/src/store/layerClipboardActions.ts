import type {
  StoreGet,
  StoreSet,
  UpdateProjectAndSave,
  LayerClipboard,
} from "./storeTypes";
import type { Layer, PixelData, Variant, VariantGroup, Frame } from "../types";
import { createEmptyPixelGrid, generateId } from "../types";

export function createLayerClipboardActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    copyLayerToClipboard: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layer = frame.layers.find((l) => l.id === layerId);
      if (!layer) return;

      if (layer.isVariant && layer.variantGroupId) {
        // Copy variant - deep copy the ENTIRE variant group with ALL variants
        const { project } = get();
        const variantGroup = project?.variants?.find(
          (vg) => vg.id === layer.variantGroupId,
        );
        if (!variantGroup) return;

        // Deep copy the entire variant group with all variants
        const copiedVariantGroup: VariantGroup = {
          id: generateId(),
          name: variantGroup.name,
          variants: variantGroup.variants.map((variant) => ({
            id: generateId(),
            name: variant.name,
            gridSize: { ...variant.gridSize },
            frames: variant.frames.map((f) => ({
              id: generateId(),
              layers: f.layers.map((l) => ({
                ...l,
                id: generateId(),
                pixels: l.pixels.map((row) =>
                  row.map((pd) => {
                    // Deep copy PixelData
                    return {
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
                    } as PixelData;
                  }),
                ),
              })),
            })),
            baseFrameOffsets: { ...variant.baseFrameOffsets },
          })),
        };

        set({
          layerClipboard: {
            type: "variant",
            variantGroup: copiedVariantGroup,
            variantId: copiedVariantGroup.variants[0].id,
          },
        });
      } else {
        // Copy regular layer - collect from all frames
        const layerName = layer.name;
        const layerFrames: LayerClipboard["layerFrames"] = [];

        // Store the frame index when copying (for current-frame-only paste)
        const sourceFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

        for (const f of obj.frames) {
          const matchingLayer = f.layers.find(
            (l) => l.name === layerName && !l.isVariant,
          );
          if (matchingLayer) {
            // Deep copy pixels - ensure we create new PixelData objects
            const copiedPixels: PixelData[][] = matchingLayer.pixels.map(
              (row) =>
                row.map((pd) => {
                  // Deep copy PixelData
                  return {
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
                  } as PixelData;
                }),
            );
            layerFrames.push({
              name: matchingLayer.name,
              pixels: copiedPixels,
              visible: matchingLayer.visible,
            });
          } else {
            // No matching layer in this frame, create empty placeholder
            layerFrames.push({
              name: layerName,
              pixels: createEmptyPixelGrid(
                obj.gridSize.width,
                obj.gridSize.height,
              ),
              visible: true,
            });
          }
        }

        set({
          layerClipboard: {
            type: "layer",
            layerFrames,
            sourceFrameIndex,
          },
        });
      }
    },

    pasteLayerFromClipboard: (currentFrameOnly: boolean = false) => {
      const { layerClipboard, project } = get();
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!layerClipboard || !obj || !frame || !project) return;

      // Get current frame index
      const currentFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

      if (layerClipboard.type === "variant" && layerClipboard.variantGroup) {
        // Paste variant - copy ALL variants from the variant group
        const sourceVariantGroup = layerClipboard.variantGroup;
        if (sourceVariantGroup.variants.length === 0) return;

        // Create new IDs for the pasted variant group
        const newVariantGroupId = generateId();

        // Deep copy all variants with new IDs
        const newVariants: Variant[] = sourceVariantGroup.variants.map(
          (sourceVariant) => ({
            id: generateId(),
            name: sourceVariant.name,
            gridSize: { ...sourceVariant.gridSize },
            frames: sourceVariant.frames.map((f) => ({
              id: generateId(),
              layers: f.layers.map((l) => ({
                ...l,
                id: generateId(),
                pixels: l.pixels.map((row) =>
                  row.map((pd) => {
                    // Deep copy PixelData
                    return {
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
                    } as PixelData;
                  }),
                ),
              })),
            })),
            baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
          }),
        );

        const newVariantGroup: VariantGroup = {
          id: newVariantGroupId,
          name: sourceVariantGroup.name,
          variants: newVariants,
        };

        // Use the first variant as the selected one
        const selectedVariantId = newVariants[0].id;

        // Get the default offset from the source variant's baseFrameOffsets for the selected variant
        const getOffsetsForFrame = (frameIndex: number) => {
          // Create variantOffsets with offset for each variant type
          const offsets: { [variantId: string]: { x: number; y: number } } = {};
          for (const sourceVariant of sourceVariantGroup.variants) {
            // Find corresponding new variant ID
            const newVariant = newVariants.find(
              (_, i) => sourceVariantGroup.variants[i].id === sourceVariant.id,
            );
            if (newVariant) {
              offsets[newVariant.id] = sourceVariant.baseFrameOffsets?.[
                frameIndex
              ] ?? { x: 0, y: 0 };
            }
          }
          return offsets;
        };

        updateProjectAndSave(
          (project) => ({
            ...project,
            // Add variant group at project level
            variants: [...(project.variants ?? []), newVariantGroup],
            objects: project.objects.map((o) => {
              if (o.id !== obj.id) return o;

              if (currentFrameOnly) {
                // Only add variant layer to the current frame
                return {
                  ...o,
                  frames: o.frames.map((f, idx) => {
                    if (idx === currentFrameIndex) {
                      const variantLayer: Layer = {
                        id: generateId(),
                        name: sourceVariantGroup.name,
                        pixels: createEmptyPixelGrid(
                          obj.gridSize.width,
                          obj.gridSize.height,
                        ),
                        visible: true,
                        isVariant: true,
                        variantGroupId: newVariantGroupId,
                        selectedVariantId: selectedVariantId,
                        variantOffsets: getOffsetsForFrame(idx),
                      };
                      return {
                        ...f,
                        layers: [...f.layers, variantLayer],
                      };
                    }
                    return f;
                  }),
                };
              } else {
                // Add variant layer to all frames at the top (end of layers array)
                return {
                  ...o,
                  frames: o.frames.map((f, idx) => {
                    const variantLayer: Layer = {
                      id: generateId(),
                      name: sourceVariantGroup.name,
                      pixels: createEmptyPixelGrid(
                        obj.gridSize.width,
                        obj.gridSize.height,
                      ),
                      visible: true,
                      isVariant: true,
                      variantGroupId: newVariantGroupId,
                      selectedVariantId: selectedVariantId,
                      variantOffsets: getOffsetsForFrame(idx),
                    };

                    return {
                      ...f,
                      layers: [...f.layers, variantLayer],
                    };
                  }),
                };
              }
            }),
            uiState: {
              ...project.uiState,
              variantFrameIndices: {
                ...project.uiState.variantFrameIndices,
                [newVariantGroupId]: 0,
              },
            },
          }),
          true,
        );
      } else if (
        layerClipboard.type === "layer" &&
        layerClipboard.layerFrames
      ) {
        // Paste regular layer
        const sourceFrames = layerClipboard.layerFrames;
        if (sourceFrames.length === 0) return;

        const layerName = sourceFrames[0].name;
        const { width, height } = obj.gridSize;

        if (currentFrameOnly) {
          // Only paste to the current frame using the frame's data from when it was copied
          // Use the sourceFrameIndex from when the copy was made, not the current frame index
          const clipboardSourceFrameIndex =
            layerClipboard.sourceFrameIndex ?? currentFrameIndex;
          const sourceFrameIndex = Math.min(
            clipboardSourceFrameIndex,
            sourceFrames.length - 1,
          );
          const sourceData = sourceFrames[sourceFrameIndex];

          updateProjectAndSave((project) => {
            let updatedObj = project.objects.find((o) => o.id === obj.id);
            if (!updatedObj) return project;

            // Resize pixels if needed (center the content)
            let pixels = sourceData.pixels;
            const sourceWidth = sourceData.pixels[0]?.length ?? 0;
            const sourceHeight = sourceData.pixels.length;

            if (sourceWidth !== width || sourceHeight !== height) {
              // Create new grid at target size and center the content
              pixels = createEmptyPixelGrid(width, height);
              const offsetX = Math.floor((width - sourceWidth) / 2);
              const offsetY = Math.floor((height - sourceHeight) / 2);

              for (let y = 0; y < sourceHeight; y++) {
                for (let x = 0; x < sourceWidth; x++) {
                  const targetX = x + offsetX;
                  const targetY = y + offsetY;
                  if (
                    targetX >= 0 &&
                    targetX < width &&
                    targetY >= 0 &&
                    targetY < height
                  ) {
                    const pd = sourceData.pixels[y][x];
                    // Deep copy PixelData
                    pixels[targetY][targetX] = {
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
                    } as PixelData;
                  }
                }
              }
            } else {
              // Deep copy - ensure we create new PixelData objects
              pixels = sourceData.pixels.map((row) =>
                row.map((pd) => {
                  // Deep copy PixelData
                  return {
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
                  } as PixelData;
                }),
              );
            }

            const newLayer: Layer = {
              id: generateId(),
              name: layerName,
              pixels,
              visible: sourceData.visible,
            };

            return {
              ...project,
              objects: project.objects.map((o) => {
                if (o.id !== obj.id) return o;
                return {
                  ...o,
                  frames: o.frames.map((f, idx) => {
                    if (idx === currentFrameIndex) {
                      return {
                        ...f,
                        layers: [...f.layers, newLayer],
                      };
                    }
                    return f;
                  }),
                };
              }),
            };
          }, true);
        } else {
          // Paste to all frames (original behavior)
          // Determine how many frames the object needs
          const neededFrames = sourceFrames.length;
          const currentFrames = obj.frames.length;

          updateProjectAndSave((project) => {
            let updatedObj = project.objects.find((o) => o.id === obj.id);
            if (!updatedObj) return project;

            // If we need more frames, add them
            let newFrames = [...updatedObj.frames];
            if (neededFrames > currentFrames) {
              const lastFrame = newFrames[newFrames.length - 1];
              for (let i = currentFrames; i < neededFrames; i++) {
                // Duplicate the last frame
                const newFrame: Frame = {
                  id: generateId(),
                  name: `Frame ${i + 1}`,
                  layers: lastFrame.layers.map((l) => ({
                    ...l,
                    id: generateId(),
                    pixels: l.pixels.map((row) => [...row]),
                  })),
                };
                newFrames.push(newFrame);
              }
            }

            // Add the new layer to each frame at the top (end of layers array)
            newFrames = newFrames.map((f, frameIndex) => {
              // Get source pixels for this frame
              let sourceData = sourceFrames[frameIndex];
              if (!sourceData) {
                // If the object has more frames than the source, use the last source frame
                sourceData = sourceFrames[sourceFrames.length - 1];
              }

              // Resize pixels if needed (center the content)
              let pixels = sourceData.pixels;
              const sourceWidth = sourceData.pixels[0]?.length ?? 0;
              const sourceHeight = sourceData.pixels.length;

              if (sourceWidth !== width || sourceHeight !== height) {
                // Create new grid at target size and center the content
                pixels = createEmptyPixelGrid(width, height);
                const offsetX = Math.floor((width - sourceWidth) / 2);
                const offsetY = Math.floor((height - sourceHeight) / 2);

                for (let y = 0; y < sourceHeight; y++) {
                  for (let x = 0; x < sourceWidth; x++) {
                    const targetX = x + offsetX;
                    const targetY = y + offsetY;
                    if (
                      targetX >= 0 &&
                      targetX < width &&
                      targetY >= 0 &&
                      targetY < height
                    ) {
                      const pd = sourceData.pixels[y][x];
                      // Deep copy PixelData
                      pixels[targetY][targetX] = {
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
                            : {
                                x: pd.normal.x,
                                y: pd.normal.y,
                                z: pd.normal.z,
                              },
                        height: pd.height,
                      } as PixelData;
                    }
                  }
                }
              } else {
                // Deep copy - ensure we create new PixelData objects
                pixels = sourceData.pixels.map((row) =>
                  row.map((pd) => {
                    // Deep copy PixelData
                    return {
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
                    } as PixelData;
                  }),
                );
              }

              const newLayer: Layer = {
                id: generateId(),
                name: layerName,
                pixels,
                visible: sourceData.visible,
              };

              return {
                ...f,
                layers: [...f.layers, newLayer],
              };
            });

            return {
              ...project,
              objects: project.objects.map((o) =>
                o.id === obj.id ? { ...o, frames: newFrames } : o,
              ),
            };
          }, true);
        }
      }
    },

    copyLayerFromObject: (
      sourceObjectId: string,
      sourceLayerId: string,
      isVariant: boolean,
      variantGroupId?: string,
      _variantId?: string,
    ) => {
      const { project } = get();
      const targetObj = get().getCurrentObject();
      const targetFrame = get().getCurrentFrame();
      if (!project || !targetObj || !targetFrame) return;

      const sourceObj = project.objects.find((o) => o.id === sourceObjectId);
      if (!sourceObj) return;

      if (isVariant && variantGroupId) {
        // Copy variant from project level - copy ALL variants in the variant group
        const sourceVariantGroup = project.variants?.find(
          (vg) => vg.id === variantGroupId,
        );
        if (!sourceVariantGroup || sourceVariantGroup.variants.length === 0)
          return;

        // Create new IDs
        const newVariantGroupId = generateId();

        // Deep copy ALL variants with new IDs
        const newVariants: Variant[] = sourceVariantGroup.variants.map(
          (sourceVariant) => ({
            id: generateId(),
            name: sourceVariant.name,
            gridSize: { ...sourceVariant.gridSize },
            frames: sourceVariant.frames.map((f) => ({
              id: generateId(),
              layers: f.layers.map((l) => ({
                ...l,
                id: generateId(),
                pixels: l.pixels.map((row) =>
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
                            : {
                                x: pd.normal.x,
                                y: pd.normal.y,
                                z: pd.normal.z,
                              },
                        height: pd.height,
                      }) as PixelData,
                  ),
                ),
              })),
            })),
            baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
          }),
        );

        const newVariantGroup: VariantGroup = {
          id: newVariantGroupId,
          name: sourceVariantGroup.name,
          variants: newVariants,
        };

        // Use the first variant as the selected one
        const selectedVariantId = newVariants[0].id;

        // Get the default offsets from the source variant's baseFrameOffsets for all variant types
        const getOffsetsForFrame = (frameIndex: number) => {
          const offsets: { [variantId: string]: { x: number; y: number } } = {};
          for (const sourceVariant of sourceVariantGroup.variants) {
            const newVariant = newVariants.find(
              (_, i) => sourceVariantGroup.variants[i].id === sourceVariant.id,
            );
            if (newVariant) {
              offsets[newVariant.id] = sourceVariant.baseFrameOffsets?.[
                frameIndex
              ] ?? { x: 0, y: 0 };
            }
          }
          return offsets;
        };

        updateProjectAndSave(
          (project) => ({
            ...project,
            // Add variant group at project level
            variants: [...(project.variants ?? []), newVariantGroup],
            objects: project.objects.map((o) => {
              if (o.id !== targetObj.id) return o;

              return {
                ...o,
                frames: o.frames.map((f, idx) => {
                  const variantLayer: Layer = {
                    id: generateId(),
                    name: sourceVariantGroup.name,
                    pixels: createEmptyPixelGrid(
                      targetObj.gridSize.width,
                      targetObj.gridSize.height,
                    ),
                    visible: true,
                    isVariant: true,
                    variantGroupId: newVariantGroupId,
                    selectedVariantId: selectedVariantId,
                    variantOffsets: getOffsetsForFrame(idx),
                  };

                  return {
                    ...f,
                    layers: [...f.layers, variantLayer],
                  };
                }),
              };
            }),
            uiState: {
              ...project.uiState,
              variantFrameIndices: {
                ...project.uiState.variantFrameIndices,
                [newVariantGroupId]: 0,
              },
            },
          }),
          true,
        );
      } else {
        // Copy regular layer from source object
        const sourceFrame = sourceObj.frames[0];
        if (!sourceFrame) return;

        const sourceLayer = sourceFrame.layers.find(
          (l) => l.id === sourceLayerId,
        );
        if (!sourceLayer) return;

        const layerName = sourceLayer.name;
        const { width: targetWidth, height: targetHeight } = targetObj.gridSize;

        // Collect all frames from source
        const sourceFrames: { pixels: PixelData[][]; visible: boolean }[] = [];
        for (const f of sourceObj.frames) {
          const matchingLayer = f.layers.find(
            (l) => l.name === layerName && !l.isVariant,
          );
          if (matchingLayer) {
            sourceFrames.push({
              pixels: matchingLayer.pixels,
              visible: matchingLayer.visible,
            });
          } else {
            sourceFrames.push({
              pixels: createEmptyPixelGrid(
                sourceObj.gridSize.width,
                sourceObj.gridSize.height,
              ),
              visible: true,
            });
          }
        }

        const neededFrames = sourceFrames.length;
        const currentFrames = targetObj.frames.length;

        updateProjectAndSave((project) => {
          let updatedObj = project.objects.find((o) => o.id === targetObj.id);
          if (!updatedObj) return project;

          let newFrames = [...updatedObj.frames];

          // Add more frames if needed
          if (neededFrames > currentFrames) {
            const lastFrame = newFrames[newFrames.length - 1];
            for (let i = currentFrames; i < neededFrames; i++) {
              const newFrame: Frame = {
                id: generateId(),
                name: `Frame ${i + 1}`,
                layers: lastFrame.layers.map((l) => ({
                  ...l,
                  id: generateId(),
                  pixels: l.pixels.map((row) => [...row]),
                })),
              };
              newFrames.push(newFrame);
            }
          }

          newFrames = newFrames.map((f, frameIndex) => {
            let sourceData = sourceFrames[frameIndex];
            if (!sourceData) {
              sourceData = sourceFrames[sourceFrames.length - 1];
            }

            const sourceWidth = sourceData.pixels[0]?.length ?? 0;
            const sourceHeight = sourceData.pixels.length;

            let pixels: PixelData[][];
            if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) {
              pixels = createEmptyPixelGrid(targetWidth, targetHeight);
              const offsetX = Math.floor((targetWidth - sourceWidth) / 2);
              const offsetY = Math.floor((targetHeight - sourceHeight) / 2);

              for (let y = 0; y < sourceHeight; y++) {
                for (let x = 0; x < sourceWidth; x++) {
                  const targetX = x + offsetX;
                  const targetY = y + offsetY;
                  if (
                    targetX >= 0 &&
                    targetX < targetWidth &&
                    targetY >= 0 &&
                    targetY < targetHeight
                  ) {
                    const pd = sourceData.pixels[y][x];
                    pixels[targetY][targetX] = {
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
                    } as PixelData;
                  }
                }
              }
            } else {
              pixels = sourceData.pixels.map((row) =>
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
            }

            const newLayer: Layer = {
              id: generateId(),
              name: layerName,
              pixels,
              visible: sourceData.visible,
            };

            return {
              ...f,
              layers: [...f.layers, newLayer],
            };
          });

          return {
            ...project,
            objects: project.objects.map((o) =>
              o.id === targetObj.id ? { ...o, frames: newFrames } : o,
            ),
          };
        }, true);
      }
    },
  };
}
