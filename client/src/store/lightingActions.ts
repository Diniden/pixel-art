import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type { Normal, Color, StudioMode, PixelData } from "../types";
import { computeEdgeInterpolatedNormals } from "../utils/edgeInterpolate";

export function createLightingActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    setStudioMode: (mode: StudioMode) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            studioMode: mode,
            // Reset tool to appropriate default when switching modes
            selectedTool: mode === "lighting" ? "normal-pencil" : "pixel",
          },
        },
      });
    },

    setLightingDataLayerEditMode: (mode: "normals" | "height") => {
      const { project } = get();
      if (!project) return;
      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            lightingDataLayerEditMode: mode,
          },
        },
      });
    },

    setSelectedNormal: (normal: Normal) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            selectedNormal: normal,
          },
        },
      });
    },

    setLightDirection: (normal: Normal) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            lightDirection: normal,
          },
        },
      });
    },

    setLightColor: (color: Color) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            lightColor: color,
          },
        },
      });
    },

    setAmbientColor: (color: Color) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            ambientColor: color,
          },
        },
      });
    },

    setHeightBrushValue: (value: number) => {
      const { project } = get();
      if (!project) return;
      const clamped = Math.max(0, Math.min(255, Math.round(value)));
      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            heightBrushValue: clamped,
          },
        },
      });
    },

    setHeightScale: (scale: number) => {
      const { project } = get();
      if (!project) return;

      set({
        project: {
          ...project,
          uiState: {
            ...project.uiState,
            heightScale: Math.max(1, Math.min(500, scale)), // Clamp between 1 and 500
          },
        },
      });
    },

    setNormalPixel: (x: number, y: number, normal: Normal | 0) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant, variantFrame } = variantData;
        const { width, height } = variant.gridSize;

        if (x < 0 || x >= width || y < 0 || y >= height) return;

        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;

        // Can only set normal where color exists
        const pixelData = targetLayer.pixels[y]?.[x];
        if (!pixelData || pixelData.color === 0) return;

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
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
                          const newPixels = [...l.pixels];
                          newPixels[y] = [...l.pixels[y]];
                          newPixels[y][x] = { ...newPixels[y][x], normal };
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
      if (x < 0 || x >= obj.gridSize.width || y < 0 || y >= obj.gridSize.height)
        return;

      // Can only set normal where color exists
      const pixelData = layer.pixels[y]?.[x];
      if (!pixelData || pixelData.color === 0) return;

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
                            if (l.id !== layer.id) return l;
                            const newPixels = [...l.pixels];
                            newPixels[y] = [...l.pixels[y]];
                            newPixels[y][x] = { ...newPixels[y][x], normal };
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

    setNormalPixels: (
      pixels: { x: number; y: number; normal: Normal | 0 }[],
    ) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project || pixels.length === 0) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant, variantFrame } = variantData;
        const { width, height } = variant.gridSize;
        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;

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
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
                          const affectedRows = new Set(
                            pixels
                              .map((p) => p.y)
                              .filter((y) => y >= 0 && y < height),
                          );
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y, normal } of pixels) {
                            if (x >= 0 && x < width && y >= 0 && y < height) {
                              const pd = newPixels[y][x];
                              // Only set normal where color exists
                              if (pd && pd.color !== 0) {
                                newPixels[y][x] = { ...pd, normal };
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
                            if (l.id !== layer.id) return l;
                            const affectedRows = new Set(
                              pixels
                                .map((p) => p.y)
                                .filter(
                                  (y) => y >= 0 && y < obj.gridSize.height,
                                ),
                            );
                            const newPixels = [...l.pixels];
                            for (const rowY of affectedRows) {
                              newPixels[rowY] = [...l.pixels[rowY]];
                            }
                            for (const { x, y, normal } of pixels) {
                              if (
                                x >= 0 &&
                                x < obj.gridSize.width &&
                                y >= 0 &&
                                y < obj.gridSize.height
                              ) {
                                const pd = newPixels[y][x];
                                // Only set normal where color exists
                                if (pd && pd.color !== 0) {
                                  newPixels[y][x] = { ...pd, normal };
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

    setNormalPixelsForAllFrames: (
      pixels: { x: number; y: number; normal: Normal | 0 }[],
    ) => {
      const obj = get().getCurrentObject();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !layer || !project || pixels.length === 0) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;

        // Apply to ALL frames in the variant (not just the current one)
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
                    frames: v.frames.map((f) => {
                      // Apply to all frames - find the first layer (layer index 0)
                      const targetLayer = f.layers[0];
                      if (!targetLayer) return f;

                      const affectedRows = new Set(
                        pixels
                          .map((p) => p.y)
                          .filter((y) => y >= 0 && y < height),
                      );
                      const newPixels = [...targetLayer.pixels];
                      for (const rowY of affectedRows) {
                        newPixels[rowY] = [...targetLayer.pixels[rowY]];
                      }
                      for (const { x, y, normal } of pixels) {
                        if (x >= 0 && x < width && y >= 0 && y < height) {
                          const pd = newPixels[y][x];
                          // Only set normal where color exists
                          if (pd && pd.color !== 0) {
                            newPixels[y][x] = { ...pd, normal };
                          }
                        }
                      }

                      return {
                        ...f,
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
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

      // Regular layer editing - apply to all frames that contain this layer
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Find the layer with matching ID in this frame
                    const targetLayer = f.layers.find((l) => l.id === layer.id);
                    if (!targetLayer) return f;

                    // Apply normals to this layer in this frame
                    const affectedRows = new Set(
                      pixels
                        .map((p) => p.y)
                        .filter((y) => y >= 0 && y < obj.gridSize.height),
                    );
                    const newPixels = [...targetLayer.pixels];
                    for (const rowY of affectedRows) {
                      newPixels[rowY] = [...targetLayer.pixels[rowY]];
                    }
                    for (const { x, y, normal } of pixels) {
                      if (
                        x >= 0 &&
                        x < obj.gridSize.width &&
                        y >= 0 &&
                        y < obj.gridSize.height
                      ) {
                        const pd = newPixels[y][x];
                        // Only set normal where color exists
                        if (pd && pd.color !== 0) {
                          newPixels[y][x] = { ...pd, normal };
                        }
                      }
                    }

                    return {
                      ...f,
                      layers: f.layers.map((l) =>
                        l.id === layer.id ? { ...l, pixels: newPixels } : l,
                      ),
                    };
                  }),
                }
              : o,
          ),
        }),
        true,
      );
    },

    computeNormalsForAllFrames: (params: {
      startAngle: number;
      smoothing: number;
      radius: number;
    }) => {
      const obj = get().getCurrentObject();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !layer || !project) return;

      const { startAngle, smoothing, radius } = params;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;

        // Apply to ALL frames in the variant - computing normals per-frame
        updateProjectAndSave(
          (proj) => ({
            ...proj,
            variants: proj.variants?.map((vg) => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: vg.variants.map((v) => {
                  if (v.id !== variantId) return v;
                  return {
                    ...v,
                    frames: v.frames.map((f) => {
                      const targetLayer = f.layers[0];
                      if (!targetLayer) return f;

                      // Compute normals for THIS frame's layer
                      const normals = computeEdgeInterpolatedNormals(
                        targetLayer,
                        width,
                        height,
                        startAngle,
                        smoothing,
                        radius,
                      );

                      // Convert normals array to pixel updates
                      const newPixels = [...targetLayer.pixels];
                      for (let y = 0; y < height; y++) {
                        newPixels[y] = [...targetLayer.pixels[y]];
                        for (let x = 0; x < width; x++) {
                          const index = y * width + x;
                          const normal = normals[index];
                          const pd = newPixels[y][x];
                          // Only set normal where color exists
                          if (pd && pd.color !== 0) {
                            newPixels[y][x] = { ...pd, normal: normal || 0 };
                          }
                        }
                      }

                      return {
                        ...f,
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
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

      // Regular layer editing - compute normals per-frame for all frames
      const gridWidth = obj.gridSize.width;
      const gridHeight = obj.gridSize.height;

      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Find the layer with matching ID in this frame
                    const targetLayer = f.layers.find((l) => l.id === layer.id);
                    if (!targetLayer) return f;

                    // Compute normals for THIS frame's layer
                    const normals = computeEdgeInterpolatedNormals(
                      targetLayer,
                      gridWidth,
                      gridHeight,
                      startAngle,
                      smoothing,
                      radius,
                    );

                    // Convert normals array to pixel updates
                    const newPixels = [...targetLayer.pixels];
                    for (let y = 0; y < gridHeight; y++) {
                      newPixels[y] = [...targetLayer.pixels[y]];
                      for (let x = 0; x < gridWidth; x++) {
                        const index = y * gridWidth + x;
                        const normal = normals[index];
                        const pd = newPixels[y][x];
                        // Only set normal where color exists
                        if (pd && pd.color !== 0) {
                          newPixels[y][x] = { ...pd, normal: normal || 0 };
                        }
                      }
                    }

                    return {
                      ...f,
                      layers: f.layers.map((l) =>
                        l.id === layer.id ? { ...l, pixels: newPixels } : l,
                      ),
                    };
                  }),
                }
              : o,
          ),
        }),
        true,
      );
    },

    setHeightPixels: (pixels: { x: number; y: number; height: number }[]) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project || pixels.length === 0) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant, variantFrame } = variantData;
        const { width, height } = variant.gridSize;
        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;

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
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
                          const affectedRows = new Set(
                            pixels
                              .map((p) => p.y)
                              .filter((y) => y >= 0 && y < height),
                          );
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y, height: heightValue } of pixels) {
                            if (x >= 0 && x < width && y >= 0 && y < height) {
                              const pd = newPixels[y][x];
                              // Only set height where color exists
                              if (pd && pd.color !== 0) {
                                newPixels[y][x] = {
                                  ...pd,
                                  height: heightValue,
                                };
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
                            if (l.id !== layer.id) return l;
                            const affectedRows = new Set(
                              pixels
                                .map((p) => p.y)
                                .filter(
                                  (y) => y >= 0 && y < obj.gridSize.height,
                                ),
                            );
                            const newPixels = [...l.pixels];
                            for (const rowY of affectedRows) {
                              newPixels[rowY] = [...l.pixels[rowY]];
                            }
                            for (const {
                              x,
                              y,
                              height: heightValue,
                            } of pixels) {
                              if (
                                x >= 0 &&
                                x < obj.gridSize.width &&
                                y >= 0 &&
                                y < obj.gridSize.height
                              ) {
                                const pd = newPixels[y][x];
                                // Only set height where color exists
                                if (pd && pd.color !== 0) {
                                  newPixels[y][x] = {
                                    ...pd,
                                    height: heightValue,
                                  };
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

    flipHorizontal: () => {
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
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
                          // Create flipped pixel grid
                          const newPixels: PixelData[][] = Array.from(
                            { length: height },
                            () =>
                              Array.from({ length: width }, () => ({
                                color: 0,
                                normal: 0,
                                height: 0,
                              })),
                          );
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const flippedX = width - 1 - x;
                              const sourcePixel = l.pixels[y]?.[x];
                              if (sourcePixel) {
                                let flippedNormal = sourcePixel.normal;
                                if (flippedNormal !== 0) {
                                  // Negate x component of normal for horizontal flip
                                  flippedNormal = {
                                    ...flippedNormal,
                                    x: -flippedNormal.x,
                                  };
                                }
                                newPixels[y][flippedX] = {
                                  color: sourcePixel.color,
                                  normal: flippedNormal,
                                  height: sourcePixel.height,
                                };
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
      updateProjectAndSave(
        (proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) => {
                            if (l.id !== layer.id) return l;
                            // Create flipped pixel grid
                            const newPixels: PixelData[][] = Array.from(
                              { length: height },
                              () =>
                                Array.from({ length: width }, () => ({
                                  color: 0,
                                  normal: 0,
                                  height: 0,
                                })),
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                const flippedX = width - 1 - x;
                                const sourcePixel = l.pixels[y]?.[x];
                                if (sourcePixel) {
                                  let flippedNormal = sourcePixel.normal;
                                  if (flippedNormal !== 0) {
                                    // Negate x component of normal for horizontal flip
                                    flippedNormal = {
                                      ...flippedNormal,
                                      x: -flippedNormal.x,
                                    };
                                  }
                                  newPixels[y][flippedX] = {
                                    color: sourcePixel.color,
                                    normal: flippedNormal,
                                    height: sourcePixel.height,
                                  };
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

    flipVertical: () => {
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
                        layers: f.layers.map((l, li) => {
                          if (li !== 0) return l;
                          // Create flipped pixel grid
                          const newPixels: PixelData[][] = Array.from(
                            { length: height },
                            () =>
                              Array.from({ length: width }, () => ({
                                color: 0,
                                normal: 0,
                                height: 0,
                              })),
                          );
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const flippedY = height - 1 - y;
                              const sourcePixel = l.pixels[y]?.[x];
                              if (sourcePixel) {
                                let flippedNormal = sourcePixel.normal;
                                if (flippedNormal !== 0) {
                                  // Negate y component of normal for vertical flip
                                  flippedNormal = {
                                    ...flippedNormal,
                                    y: -flippedNormal.y,
                                  };
                                }
                                newPixels[flippedY][x] = {
                                  color: sourcePixel.color,
                                  normal: flippedNormal,
                                  height: sourcePixel.height,
                                };
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
      updateProjectAndSave(
        (proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l) => {
                            if (l.id !== layer.id) return l;
                            // Create flipped pixel grid
                            const newPixels: PixelData[][] = Array.from(
                              { length: height },
                              () =>
                                Array.from({ length: width }, () => ({
                                  color: 0,
                                  normal: 0,
                                  height: 0,
                                })),
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                const flippedY = height - 1 - y;
                                const sourcePixel = l.pixels[y]?.[x];
                                if (sourcePixel) {
                                  let flippedNormal = sourcePixel.normal;
                                  if (flippedNormal !== 0) {
                                    // Negate y component of normal for vertical flip
                                    flippedNormal = {
                                      ...flippedNormal,
                                      y: -flippedNormal.y,
                                    };
                                  }
                                  newPixels[flippedY][x] = {
                                    color: sourcePixel.color,
                                    normal: flippedNormal,
                                    height: sourcePixel.height,
                                  };
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
