import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type {
  Layer,
  Variant,
  VariantGroup,
  VariantFrame,
  Pixel,
  PixelData,
  Frame,
} from "../types";
import { createEmptyPixelGrid, generateId } from "../types";
import {
  getAnchorPadding,
  type AnchorPosition,
} from "../components/AnchorGrid/AnchorGrid";

export function createVariantActions(
  get: StoreGet,
  _set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    makeVariant: (layerId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      // Find the layer to convert
      const currentFrame = get().getCurrentFrame();
      if (!currentFrame) return;

      const layerToConvert = currentFrame.layers.find((l) => l.id === layerId);
      if (!layerToConvert || layerToConvert.isVariant) return;

      const layerName = layerToConvert.name;
      const { width: objWidth, height: objHeight } = obj.gridSize;

      // Collect all pixels from all frames for layers with this name
      const framesPixelData: {
        frameId: string;
        layerIds: string[];
        pixels: PixelData[][];
        frameMinX: number;
        frameMinY: number;
        frameMaxX: number;
        frameMaxY: number;
      }[] = [];

      // First pass: collect pixel data and calculate per-frame bounding boxes
      let maxFrameWidth = 0;
      let maxFrameHeight = 0;
      let hasPixels = false;

      for (const frame of obj.frames) {
        const matchingLayers = frame.layers.filter((l) => l.name === layerName);
        if (matchingLayers.length === 0) {
          // No matching layers in this frame, but we still need an entry
          framesPixelData.push({
            frameId: frame.id,
            layerIds: [],
            pixels: createEmptyPixelGrid(objWidth, objHeight),
            frameMinX: 0,
            frameMinY: 0,
            frameMaxX: 0,
            frameMaxY: 0,
          });
          continue;
        }

        // Combine all matching layers' pixels
        const combinedPixels = createEmptyPixelGrid(objWidth, objHeight);
        let frameMinX = objWidth,
          frameMinY = objHeight,
          frameMaxX = 0,
          frameMaxY = 0;
        let frameHasPixels = false;

        for (const layer of matchingLayers) {
          for (let y = 0; y < objHeight; y++) {
            for (let x = 0; x < objWidth; x++) {
              const pd = layer.pixels[y]?.[x];
              if (pd && pd.color !== 0 && (pd.color as Pixel).a > 0) {
                combinedPixels[y][x] = pd;
                frameMinX = Math.min(frameMinX, x);
                frameMinY = Math.min(frameMinY, y);
                frameMaxX = Math.max(frameMaxX, x);
                frameMaxY = Math.max(frameMaxY, y);
                frameHasPixels = true;
                hasPixels = true;
              }
            }
          }
        }

        // Calculate this frame's bounding box dimensions
        if (frameHasPixels) {
          const frameWidth = frameMaxX - frameMinX + 1;
          const frameHeight = frameMaxY - frameMinY + 1;
          maxFrameWidth = Math.max(maxFrameWidth, frameWidth);
          maxFrameHeight = Math.max(maxFrameHeight, frameHeight);
        }

        framesPixelData.push({
          frameId: frame.id,
          layerIds: matchingLayers.map((l) => l.id),
          pixels: combinedPixels,
          frameMinX: frameHasPixels ? frameMinX : 0,
          frameMinY: frameHasPixels ? frameMinY : 0,
          frameMaxX: frameHasPixels ? frameMaxX : 0,
          frameMaxY: frameHasPixels ? frameMaxY : 0,
        });
      }

      // If no pixels found, use minimum 1x1 size at origin
      if (!hasPixels) {
        maxFrameWidth = 1;
        maxFrameHeight = 1;
      }

      // Variant grid size is the largest single-frame bounding box
      const variantWidth = maxFrameWidth;
      const variantHeight = maxFrameHeight;

      // Create variant frames and base frame offsets
      const variantFrames: VariantFrame[] = [];
      const baseFrameOffsets: {
        [baseFrameIndex: number]: { x: number; y: number };
      } = {};

      for (let i = 0; i < obj.frames.length; i++) {
        const frame: Frame = obj.frames[i];
        const frameData = framesPixelData.find((fd) => fd.frameId === frame.id);

        if (!frameData) {
          // Fallback: create empty frame with default offset
          variantFrames.push({
            id: generateId(),
            layers: [
              {
                id: generateId(),
                name: "Layer 1",
                pixels: createEmptyPixelGrid(variantWidth, variantHeight),
                visible: true,
              },
            ],
          });
          baseFrameOffsets[i] = { x: 0, y: 0 };
          continue;
        }

        // Use this frame's specific bounding box for the offset (preserves position relative to parent)
        const frameOffsetX = frameData.frameMinX;
        const frameOffsetY = frameData.frameMinY;
        const frameWidth = frameData.frameMaxX - frameData.frameMinX + 1;
        const frameHeight = frameData.frameMaxY - frameData.frameMinY + 1;

        // Store offset per base frame index (new system)
        baseFrameOffsets[i] = { x: frameOffsetX, y: frameOffsetY };

        // Extract pixels for this frame, positioned within the variant grid
        // Pixels are positioned at the top-left of the variant grid, preserving their relative position
        const variantPixels = createEmptyPixelGrid(variantWidth, variantHeight);

        if (
          frameData.frameMaxX >= frameData.frameMinX &&
          frameData.frameMaxY >= frameData.frameMinY
        ) {
          // Position pixels at the top-left of the variant grid
          // The offset will preserve their position relative to the parent object
          for (let y = 0; y < frameHeight; y++) {
            for (let x = 0; x < frameWidth; x++) {
              const srcX = frameData.frameMinX + x;
              const srcY = frameData.frameMinY + y;
              const pd = frameData.pixels[srcY]?.[srcX];
              if (pd && pd.color !== 0 && (pd.color as Pixel).a > 0) {
                // Place pixels starting at (0, 0) in variant grid
                // The offset preserves the original position relative to parent
                if (x < variantWidth && y < variantHeight) {
                  variantPixels[y][x] = pd;
                }
              }
            }
          }
        }

        variantFrames.push({
          id: generateId(),
          layers: [
            {
              id: generateId(),
              name: "Layer 1",
              pixels: variantPixels,
              visible: true,
            },
          ],
        });
      }

      const variantGroupId = generateId();
      const variantId = generateId();

      const newVariant: Variant = {
        id: variantId,
        name: layerName,
        gridSize: { width: variantWidth, height: variantHeight },
        frames: variantFrames,
        baseFrameOffsets,
      };

      const newVariantGroup: VariantGroup = {
        id: variantGroupId,
        name: layerName,
        variants: [newVariant],
      };

      updateProjectAndSave(
        (project) => ({
          ...project,
          // Add variant group at project level
          variants: [...(project.variants ?? []), newVariantGroup],
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;

            // Update frames: remove original layers with matching name, add variant layer
            return {
              ...o,
              frames: o.frames.map((f, frameIndex) => {
                // Find the index of the first layer with matching name to preserve position
                const firstMatchingIndex = f.layers.findIndex(
                  (l) => l.name === layerName,
                );

                // Remove all layers with matching name
                const filteredLayers = f.layers.filter(
                  (l) => l.name !== layerName,
                );

                // Add variant layer (one per frame, referencing the variant group)
                // Include the offset for this frame and variant type
                const variantLayer: Layer = {
                  id: generateId(),
                  name: layerName,
                  pixels: createEmptyPixelGrid(objWidth, objHeight), // Not used for rendering
                  visible: true,
                  isVariant: true,
                  variantGroupId,
                  selectedVariantId: variantId,
                  variantOffsets: {
                    [variantId]: baseFrameOffsets[frameIndex] ?? {
                      x: 0,
                      y: 0,
                    },
                  },
                };

                // Insert variant layer at the original position (or at the end if no match found)
                const insertIndex =
                  firstMatchingIndex >= 0
                    ? firstMatchingIndex
                    : filteredLayers.length;
                const newLayers = [...filteredLayers];
                newLayers.splice(insertIndex, 0, variantLayer);

                return {
                  ...f,
                  layers: newLayers,
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: 0,
            },
          },
        }),
        true,
      );
    },

    addVariant: (variantGroupId: string, copyFromVariantId?: string) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      let newVariant: Variant;

      if (copyFromVariantId) {
        // Copy from existing variant
        const sourceVariant = variantGroup.variants.find(
          (v) => v.id === copyFromVariantId,
        );
        if (!sourceVariant) return;

        newVariant = {
          id: generateId(),
          name: `${sourceVariant.name} Copy`,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map((f) => ({
            id: generateId(),
            layers: f.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map((row) => [...row]),
            })),
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
        };
      } else {
        // Create empty variant
        const templateVariant = variantGroup.variants[0];
        newVariant = {
          id: generateId(),
          name: `${variantGroup.name} ${variantGroup.variants.length + 1}`,
          gridSize: { ...templateVariant.gridSize },
          frames: templateVariant.frames.map((_f) => ({
            id: generateId(),
            layers: [
              {
                id: generateId(),
                name: "Layer 1",
                pixels: createEmptyPixelGrid(
                  templateVariant.gridSize.width,
                  templateVariant.gridSize.height,
                ),
                visible: true,
              },
            ],
          })),
          baseFrameOffsets: { ...templateVariant.baseFrameOffsets },
        };
      }

      updateProjectAndSave(
        (project) => ({
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: [...vg.variants, newVariant],
            };
          }),
        }),
        true,
      );
    },

    deleteVariant: (variantGroupId: string, variantId: string) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup || variantGroup.variants.length <= 1) return; // Can't delete last variant

      const remainingVariants = variantGroup.variants.filter(
        (v) => v.id !== variantId,
      );
      const newSelectedId = remainingVariants[0].id;

      updateProjectAndSave(
        (project) => ({
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: remainingVariants,
            };
          }),
          // Update all variant layers across all objects to select first remaining variant if they had the deleted one
          objects: project.objects.map((o) => ({
            ...o,
            frames: o.frames.map((f) => ({
              ...f,
              layers: f.layers.map((l) => {
                if (
                  l.isVariant &&
                  l.variantGroupId === variantGroupId &&
                  l.selectedVariantId === variantId
                ) {
                  return { ...l, selectedVariantId: newSelectedId };
                }
                return l;
              }),
            })),
          })),
        }),
        true,
      );
    },

    deleteVariantGroup: (variantGroupId: string) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      updateProjectAndSave(
        (project) => ({
          ...project,
          // Remove the variant group from project level
          variants: project.variants?.filter(
            (vg) => vg.id !== variantGroupId,
          ),
          // Remove variant layers from all objects and all frames
          objects: project.objects.map((o) => ({
            ...o,
            frames: o.frames.map((f) => ({
              ...f,
              layers: f.layers.filter(
                (l) =>
                  !(l.isVariant && l.variantGroupId === variantGroupId),
              ),
            })),
          })),
          // Clean up variant frame indices
          uiState: {
            ...project.uiState,
            variantFrameIndices: Object.fromEntries(
              Object.entries(
                project.uiState.variantFrameIndices || {},
              ).filter(([key]) => key !== variantGroupId),
            ),
          },
        }),
        true,
      );

      // Select another layer if the deleted one was selected
      const frame = get().getCurrentFrame();
      if (frame && frame.layers.length > 0) {
        const { selectLayer } = get();
        selectLayer(frame.layers[frame.layers.length - 1].id);
      }
    },

    selectVariant: (layerId: string, variantId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the variant layer to get its variantGroupId
      const variantLayer = frame.layers.find(
        (l) => l.id === layerId && l.isVariant,
      );
      if (!variantLayer || !variantLayer.variantGroupId) return;

      const variantGroupId = variantLayer.variantGroupId;

      // Update ALL variant layers across ALL frames that share this variantGroupId
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f) => ({
                ...f,
                layers: f.layers.map((l) => {
                  // Update all variant layers that belong to the same variant group
                  if (l.isVariant && l.variantGroupId === variantGroupId) {
                    return { ...l, selectedVariantId: variantId };
                  }
                  return l;
                }),
              })),
            };
          }),
        }),
        false,
      );
    },

    renameVariant: (
      variantGroupId: string,
      variantId: string,
      name: string,
    ) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return { ...v, name };
              }),
            };
          }),
        }),
        true,
      );
    },

    renameVariantGroup: (variantGroupId: string, name: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return { ...vg, name };
          }),
        }),
        true,
      );
    },

    resizeVariant: (
      variantGroupId: string,
      variantId: string,
      width: number,
      height: number,
      anchor: AnchorPosition = "middle-center",
    ) => {
      updateProjectAndSave((project) => {
        // Calculate padding values based on anchor position
        const variantGroup = project.variants?.find(
          (vg) => vg.id === variantGroupId,
        );
        const variant = variantGroup?.variants.find(
          (v) => v.id === variantId,
        );
        if (!variant) return project;

        const oldWidth = variant.gridSize.width;
        const oldHeight = variant.gridSize.height;

        // Calculate padding based on anchor position
        const widthDiff = width - oldWidth;
        const heightDiff = height - oldHeight;
        const { left: leftPadding, top: topPadding } = getAnchorPadding(
          anchor,
          widthDiff,
          heightDiff,
        );

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;

                // Copy pixels with anchor-based offset
                const newFrames = v.frames.map((f) => ({
                  ...f,
                  layers: f.layers.map((l) => {
                    const newPixels = createEmptyPixelGrid(width, height);
                    for (let y = 0; y < oldHeight; y++) {
                      for (let x = 0; x < oldWidth; x++) {
                        const newX = x + leftPadding;
                        const newY = y + topPadding;
                        if (
                          newX >= 0 &&
                          newX < width &&
                          newY >= 0 &&
                          newY < height
                        ) {
                          newPixels[newY][newX] = l.pixels[y]?.[x] ?? {
                            color: 0,
                            normal: 0,
                            height: 0,
                          };
                        }
                      }
                    }
                    return { ...l, pixels: newPixels };
                  }),
                }));

                // Adjust baseFrameOffsets to compensate for pixels added to left/top
                const newBaseFrameOffsets: {
                  [baseFrameIndex: number]: { x: number; y: number };
                } = {};
                if (v.baseFrameOffsets) {
                  for (const [baseFrameIndexStr, offset] of Object.entries(
                    v.baseFrameOffsets,
                  )) {
                    const baseFrameIndex = parseInt(baseFrameIndexStr, 10);
                    newBaseFrameOffsets[baseFrameIndex] = {
                      x: offset.x - leftPadding,
                      y: offset.y - topPadding,
                    };
                  }
                }

                return {
                  ...v,
                  gridSize: { width, height },
                  frames: newFrames,
                  baseFrameOffsets: newBaseFrameOffsets,
                };
              }),
            };
          }),
          // Also adjust per-layer offsets across all objects
          objects: project.objects.map((o) => ({
            ...o,
            frames: o.frames.map((f) => ({
              ...f,
              layers: f.layers.map((l) => {
                if (l.isVariant && l.variantGroupId === variantGroupId) {
                  // Adjust variantOffsets for the specific variant being resized
                  if (l.variantOffsets?.[variantId]) {
                    return {
                      ...l,
                      variantOffsets: {
                        ...l.variantOffsets,
                        [variantId]: {
                          x: l.variantOffsets[variantId].x - leftPadding,
                          y: l.variantOffsets[variantId].y - topPadding,
                        },
                      },
                    };
                  }
                  // Also handle legacy variantOffset if this is the currently selected variant
                  if (
                    l.variantOffset &&
                    l.selectedVariantId === variantId
                  ) {
                    return {
                      ...l,
                      variantOffset: {
                        x: l.variantOffset.x - leftPadding,
                        y: l.variantOffset.y - topPadding,
                      },
                    };
                  }
                }
                return l;
              }),
            })),
          })),
        };
      }, true);
    },

    setVariantOffset: (
      dx: number,
      dy: number,
      allFrames: boolean = false,
    ) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (
        !obj ||
        !frame ||
        !layer ||
        !project ||
        !layer.isVariant ||
        !layer.variantGroupId ||
        !layer.selectedVariantId
      )
        return;

      // Get the current selected variant ID - this is the key we'll write to
      const currentSelectedVariantId = layer.selectedVariantId;

      // Get the variant to access baseFrameOffsets for fallback
      const variantGroup = project.variants?.find(
        (vg) => vg.id === layer.variantGroupId,
      );
      const variant = variantGroup?.variants.find(
        (v) => v.id === currentSelectedVariantId,
      );
      const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

      // Helper to get current offset for a layer (uses new variantOffsets, falls back to old variantOffset, then baseFrameOffsets)
      const getLayerOffset = (
        l: Layer,
        frameIdx: number,
      ): { x: number; y: number } => {
        // First check new variantOffsets for the CURRENT selected variant type
        if (l.variantOffsets?.[currentSelectedVariantId]) {
          return l.variantOffsets[currentSelectedVariantId];
        }
        // Fall back to legacy variantOffset
        if (l.variantOffset) {
          return l.variantOffset;
        }
        // Fall back to variant's baseFrameOffsets
        return (
          variant?.baseFrameOffsets?.[frameIdx >= 0 ? frameIdx : 0] ?? {
            x: 0,
            y: 0,
          }
        );
      };

      // Update only the variantOffsets for the CURRENT selected variant type
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f) => {
                const frameIndex = obj.frames.findIndex(
                  (frame) => frame.id === f.id,
                );
                return {
                  ...f,
                  layers: f.layers.map((l) => {
                    // If allFrames is true, update all layers with the same variantGroupId
                    // (but only update the offset for the currently selected variant type)
                    if (allFrames) {
                      if (
                        l.isVariant &&
                        l.variantGroupId === layer.variantGroupId
                      ) {
                        const currentOffset = getLayerOffset(l, frameIndex);
                        return {
                          ...l,
                          variantOffsets: {
                            ...l.variantOffsets,
                            [currentSelectedVariantId]: {
                              x: currentOffset.x + dx,
                              y: currentOffset.y + dy,
                            },
                          },
                        };
                      }
                    } else {
                      // Original behavior: only update the current layer
                      if (f.id !== frame.id || l.id !== layer.id) return l;
                      const currentOffset = getLayerOffset(
                        l,
                        baseFrameIndex,
                      );
                      return {
                        ...l,
                        variantOffsets: {
                          ...l.variantOffsets,
                          [currentSelectedVariantId]: {
                            x: currentOffset.x + dx,
                            y: currentOffset.y + dy,
                          },
                        },
                      };
                    }
                    return l;
                  }),
                };
              }),
            };
          }),
        }),
        true,
      );
    },

    selectVariantFrame: (variantGroupId: string, frameIndex: number) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const currentLayer = get().getCurrentLayer();
      const isEditingVariant =
        currentLayer?.isVariant === true &&
        currentLayer?.variantGroupId === variantGroupId;

      // Sync base frame to match variant frame index
      const baseFrameCount = obj.frames.length;
      let newBaseFrameId = project.uiState.selectedFrameId;
      let newLayerId = project.uiState.selectedLayerId;
      let targetFrame = null;

      if (baseFrameCount > 0) {
        // Map variant frame index to base frame index (wrap if needed)
        const baseFrameIndex = frameIndex % baseFrameCount;
        targetFrame = obj.frames[baseFrameIndex];
        if (targetFrame) {
          newBaseFrameId = targetFrame.id;

          // If editing a variant, ensure the variant layer stays selected in the new frame
          if (isEditingVariant && currentLayer) {
            const variantLayer = targetFrame.layers.find(
              (l) =>
                l.isVariant && l.variantGroupId === variantGroupId,
            );
            if (variantLayer) {
              newLayerId = variantLayer.id;
            }
          }
        }
      }

      // Sync ALL other variant groups to the same frame index (with wrapping based on their frame counts)
      // This ensures clicking a variant frame syncs all variant timelines
      const newVariantFrameIndices: { [key: string]: number } = {
        [variantGroupId]: frameIndex, // The clicked variant group gets the exact frame index
      };

      if (targetFrame && project.variants) {
        for (const vg of project.variants) {
          if (vg.id === variantGroupId) continue; // Skip the one we already set

          // Find the variant layer in the target frame for this variant group
          const variantLayer = targetFrame.layers.find(
            (l) => l.isVariant && l.variantGroupId === vg.id,
          );

          // Get the selected variant's frame count
          let variantFrameCount = 1;
          if (variantLayer?.selectedVariantId) {
            const selectedVariant = vg.variants.find(
              (v) => v.id === variantLayer.selectedVariantId,
            );
            variantFrameCount = selectedVariant?.frames.length ?? 1;
          } else {
            variantFrameCount = vg.variants[0]?.frames.length ?? 1;
          }

          if (variantFrameCount > 0) {
            // Sync to the same frame index (with wrapping)
            newVariantFrameIndices[vg.id] =
              frameIndex % variantFrameCount;
          }
        }
      }

      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            selectedFrameId: newBaseFrameId,
            selectedLayerId:
              newLayerId ?? project.uiState.selectedLayerId,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              ...newVariantFrameIndices,
            },
          },
        }),
        false,
      );
    },

    advanceVariantFrames: (delta: number) => {
      const { project } = get();
      if (!project) return;

      // Get the current frame to find which variant is selected for each variant group
      const currentFrame = get().getCurrentFrame();
      if (!currentFrame) return;

      // Advance all variant frame indices by delta (with wrapping)
      const newIndices: { [key: string]: number } = {};
      const currentIndices = project.uiState.variantFrameIndices ?? {};

      for (const vg of project.variants ?? []) {
        const currentIdx = currentIndices[vg.id] ?? 0;

        // Find the variant layer in the current frame for this variant group
        const variantLayer = currentFrame.layers.find(
          (l) => l.isVariant && l.variantGroupId === vg.id,
        );

        // Get the currently selected variant's frame count
        let maxFrames = 1;
        if (variantLayer?.selectedVariantId) {
          const selectedVariant = vg.variants.find(
            (v) => v.id === variantLayer.selectedVariantId,
          );
          maxFrames = selectedVariant?.frames.length ?? 1;
        } else {
          // Fallback to first variant if no layer found (shouldn't happen, but safe)
          maxFrames = vg.variants[0]?.frames.length ?? 1;
        }

        const newIdx =
          (currentIdx + delta + maxFrames * Math.abs(delta)) % maxFrames;
        newIndices[vg.id] = newIdx;
      }

      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              ...newIndices,
            },
          },
        }),
        false,
      );
    },

    duplicateVariantFrame: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
    ) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(
        (v) => v.id === variantId,
      );
      if (!variant) return;

      const sourceFrame = variant.frames.find((f) => f.id === frameId);
      if (!sourceFrame) return;

      updateProjectAndSave((project) => {
        const newFrameId = generateId();
        const newFrame: VariantFrame = {
          id: newFrameId,
          layers: sourceFrame.layers.map((l) => ({
            ...l,
            id: generateId(),
            pixels: l.pixels.map((row) => [...row]),
          })),
          tags: sourceFrame.tags ? [...sourceFrame.tags] : undefined,
        };

        const frameIndex = variant.frames.findIndex(
          (f) => f.id === frameId,
        );
        const newFrames = [...variant.frames];
        newFrames.splice(frameIndex + 1, 0, newFrame);

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return {
                  ...v,
                  frames: newFrames,
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: frameIndex + 1,
            },
          },
        };
      }, true);
    },

    deleteVariantFrame: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
    ) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(
        (v) => v.id === variantId,
      );
      if (!variant || variant.frames.length <= 1) return; // Can't delete last frame

      updateProjectAndSave((project) => {
        const frameIndex = variant.frames.findIndex(
          (f) => f.id === frameId,
        );
        const newFrames = variant.frames.filter((f) => f.id !== frameId);

        // Select the previous frame if possible, otherwise the first one
        const newSelectedIndex = Math.max(0, frameIndex - 1);

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return {
                  ...v,
                  frames: newFrames,
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: newSelectedIndex,
            },
          },
        };
      }, true);
    },

    addVariantFrameTag: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
      tag: string,
    ) => {
      const { project } = get();
      if (!project) return;
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) return;

      updateProjectAndSave((project) => ({
        ...project,
        variants: project.variants?.map((vg) => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: vg.variants.map((v) => {
              if (v.id !== variantId) return v;
              return {
                ...v,
                frames: v.frames.map((f) => {
                  if (f.id !== frameId) return f;
                  const tags = f.tags ?? [];
                  if (tags.includes(trimmed)) return f;
                  return { ...f, tags: [...tags, trimmed] };
                }),
              };
            }),
          };
        }),
      }), true);
    },

    removeVariantFrameTag: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
      tag: string,
    ) => {
      const { project } = get();
      if (!project) return;

      updateProjectAndSave((project) => ({
        ...project,
        variants: project.variants?.map((vg) => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: vg.variants.map((v) => {
              if (v.id !== variantId) return v;
              return {
                ...v,
                frames: v.frames.map((f) => {
                  if (f.id !== frameId) return f;
                  const tags = (f.tags ?? []).filter((t) => t !== tag);
                  return { ...f, tags: tags.length ? tags : undefined };
                }),
              };
            }),
          };
        }),
      }), true);
    },

    addVariantFrame: (
      variantGroupId: string,
      variantId: string,
      copyPrevious: boolean = true,
    ) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(
        (v) => v.id === variantId,
      );
      if (!variant) return;

      updateProjectAndSave((project) => {
        const currentFrameIndex =
          project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
        const currentFrame = variant.frames[currentFrameIndex];

        let newFrame: VariantFrame;
        if (copyPrevious && currentFrame) {
          // Copy from current frame
          newFrame = {
            id: generateId(),
            layers: currentFrame.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map((row) => [...row]),
            })),
          };
        } else {
          // Create empty frame
          newFrame = {
            id: generateId(),
            layers: [
              {
                id: generateId(),
                name: "Layer 1",
                pixels: createEmptyPixelGrid(
                  variant.gridSize.width,
                  variant.gridSize.height,
                ),
                visible: true,
              },
            ],
          };
        }

        const newFrames = [...variant.frames];
        newFrames.splice(currentFrameIndex + 1, 0, newFrame);

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return {
                  ...v,
                  frames: newFrames,
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: currentFrameIndex + 1,
            },
          },
        };
      }, true);
    },

    moveVariantFrame: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
      direction: "left" | "right",
    ) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(
        (v) => v.id === variantId,
      );
      if (!variant) return;

      const frameIndex = variant.frames.findIndex(
        (f) => f.id === frameId,
      );
      if (frameIndex === -1) return;

      const newIndex =
        direction === "left" ? frameIndex - 1 : frameIndex + 1;
      if (newIndex < 0 || newIndex >= variant.frames.length) return;

      updateProjectAndSave((project) => {
        const newFrames = [...variant.frames];
        const [movedFrame] = newFrames.splice(frameIndex, 1);
        newFrames.splice(newIndex, 0, movedFrame);

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return {
                  ...v,
                  frames: newFrames,
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: newIndex,
            },
          },
        };
      }, true);
    },

    reorderVariantFrame: (
      variantGroupId: string,
      variantId: string,
      frameId: string,
      toIndex: number,
    ) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(
        (v) => v.id === variantId,
      );
      if (!variant) return;

      const fromIndex = variant.frames.findIndex(
        (f) => f.id === frameId,
      );
      if (fromIndex === -1) return;
      if (toIndex < 0 || toIndex > variant.frames.length) return;
      if (toIndex === fromIndex) return;

      updateProjectAndSave((project) => {
        const newFrames = [...variant.frames];
        const [movedFrame] = newFrames.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        newFrames.splice(insertIndex, 0, movedFrame);

        const newIndex = insertIndex;
        const currentVariantIndex =
          project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
        let updatedVariantIndex = currentVariantIndex;
        if (currentVariantIndex === fromIndex) {
          updatedVariantIndex = newIndex;
        } else if (
          fromIndex < currentVariantIndex &&
          newIndex >= currentVariantIndex
        ) {
          updatedVariantIndex = currentVariantIndex - 1;
        } else if (
          fromIndex > currentVariantIndex &&
          newIndex <= currentVariantIndex
        ) {
          updatedVariantIndex = currentVariantIndex + 1;
        }

        return {
          ...project,
          variants: project.variants?.map((vg) => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map((v) => {
                if (v.id !== variantId) return v;
                return { ...v, frames: newFrames };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: updatedVariantIndex,
            },
          },
        };
      }, true);
    },

    // New variant layer management
    addVariantLayerFromExisting: (
      variantGroupId: string,
      selectedVariantId: string,
      addToAllFrames: boolean,
    ) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const { project } = get();
      if (!obj || !frame || !project) return;

      const variantGroup = project.variants?.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!variantGroup) return;

      const currentFrameIndex = obj.frames.findIndex(
        (f) => f.id === frame.id,
      );

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f, idx) => {
                // Only add to current frame if not adding to all frames
                if (!addToAllFrames && idx !== currentFrameIndex) return f;

                const variantLayer: Layer = {
                  id: generateId(),
                  name: variantGroup.name,
                  pixels: createEmptyPixelGrid(
                    obj.gridSize.width,
                    obj.gridSize.height,
                  ),
                  visible: true,
                  isVariant: true,
                  variantGroupId,
                  selectedVariantId,
                  variantOffset: { x: 0, y: 0 },
                };

                return {
                  ...f,
                  // Add to top of layers array
                  layers: [...f.layers, variantLayer],
                };
              }),
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: 0,
            },
          },
        }),
        true,
      );
    },

    removeVariantLayer: (layerId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      // Only remove the layer, not the variant group - variant groups persist independently
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              frames: o.frames.map((f) => ({
                ...f,
                layers: f.layers.filter((l) => l.id !== layerId),
              })),
            };
          }),
        }),
        true,
      );

      // Select another layer if needed
      const frame = get().getCurrentFrame();
      if (frame && frame.layers.length > 0) {
        const { selectLayer } = get();
        selectLayer(frame.layers[frame.layers.length - 1].id);
      }
    },
  };
}
