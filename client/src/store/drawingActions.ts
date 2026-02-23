import type { Color, Point } from "../types";
import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";

export function createDrawingActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  const isEditMaskActiveFor = (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const { project, selection } = get();
    const behavior = project?.uiState.selectionBehavior ?? "movePixels";
    if (behavior !== "editMask") return true;
    if (!selection) return true; // no selection -> allow edits
    if (selection.width !== width || selection.height !== height) return true;
    const idx = y * width + x;
    return selection.mask.has(idx);
  };

  return {
    setPixel: (x: number, y: number, color: Color | 0) => {
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
        if (!isEditMaskActiveFor(x, y, width, height)) return;

        // Skip if pixel color is already the same
        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;
        const currentPixelData = targetLayer.pixels[y]?.[x];
        const currentColor = currentPixelData?.color;
        if (color === 0 && currentColor === 0) return;
        if (color && currentColor && typeof currentColor === "object") {
          if (
            color.r === currentColor.r &&
            color.g === currentColor.g &&
            color.b === currentColor.b &&
            color.a === currentColor.a
          )
            return;
        }

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
                          const existing = newPixels[y][x];
                          // When erasing, clear all data; when drawing, preserve normal/height or set defaults
                          if (color === 0) {
                            newPixels[y][x] = {
                              color: 0,
                              normal: 0,
                              height: 0,
                            };
                          } else {
                            newPixels[y][x] = {
                              color,
                              normal: existing?.normal ?? 0,
                              height: existing?.height ?? 1,
                            };
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
      if (x < 0 || x >= obj.gridSize.width || y < 0 || y >= obj.gridSize.height)
        return;
      if (!isEditMaskActiveFor(x, y, obj.gridSize.width, obj.gridSize.height))
        return;

      // Skip if pixel color is already the same
      const currentPixelData = layer.pixels[y]?.[x];
      const currentColor = currentPixelData?.color;
      if (color === 0 && currentColor === 0) return;
      if (color && currentColor && typeof currentColor === "object") {
        if (
          color.r === currentColor.r &&
          color.g === currentColor.g &&
          color.b === currentColor.b &&
          color.a === currentColor.a
        )
          return;
      }

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
                            // Only copy the affected row, not the entire grid
                            const newPixels = [...l.pixels];
                            newPixels[y] = [...l.pixels[y]];
                            const existing = newPixels[y][x];
                            // When erasing, clear all data; when drawing, preserve normal/height or set defaults
                            if (color === 0) {
                              newPixels[y][x] = {
                                color: 0,
                                normal: 0,
                                height: 0,
                              };
                            } else {
                              newPixels[y][x] = {
                                color,
                                normal: existing?.normal ?? 0,
                                height: existing?.height ?? 1,
                              };
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

    setPixels: (pixels: { x: number; y: number; color: Color | 0 }[]) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project || pixels.length === 0) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;

        // Edit-mask filtering
        pixels = pixels.filter(
          (p) =>
            p.x >= 0 &&
            p.x < width &&
            p.y >= 0 &&
            p.y < height &&
            isEditMaskActiveFor(p.x, p.y, width, height),
        );
        if (pixels.length === 0) return;

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
                          for (const { x, y, color } of pixels) {
                            if (x >= 0 && x < width && y >= 0 && y < height) {
                              const existing = newPixels[y][x];
                              if (color === 0) {
                                newPixels[y][x] = {
                                  color: 0,
                                  normal: 0,
                                  height: 0,
                                };
                              } else {
                                newPixels[y][x] = {
                                  color,
                                  normal: existing?.normal ?? 0,
                                  height: existing?.height ?? 1,
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
      // Edit-mask filtering
      pixels = pixels.filter(
        (p) =>
          p.x >= 0 &&
          p.x < obj.gridSize.width &&
          p.y >= 0 &&
          p.y < obj.gridSize.height &&
          isEditMaskActiveFor(
            p.x,
            p.y,
            obj.gridSize.width,
            obj.gridSize.height,
          ),
      );
      if (pixels.length === 0) return;

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
                            // Only copy affected rows
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
                            for (const { x, y, color } of pixels) {
                              if (
                                x >= 0 &&
                                x < obj.gridSize.width &&
                                y >= 0 &&
                                y < obj.gridSize.height
                              ) {
                                const existing = newPixels[y][x];
                                if (color === 0) {
                                  newPixels[y][x] = {
                                    color: 0,
                                    normal: 0,
                                    height: 0,
                                  };
                                } else {
                                  newPixels[y][x] = {
                                    color,
                                    normal: existing?.normal ?? 0,
                                    height: existing?.height ?? 1,
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

    startDrawing: (point: Point) => {
      // Clear color adjustment when starting to draw
      set({ isDrawing: true, drawStartPoint: point, colorAdjustment: null });
    },

    updateDrawing: (point: Point) => {
      set({ drawStartPoint: point });
    },

    endDrawing: () => {
      set({ isDrawing: false, drawStartPoint: null, previewPixels: [] });
    },

    setPreviewPixels: (pixels: Point[]) => {
      set({ previewPixels: pixels });
    },

    clearPreviewPixels: () => {
      set({ previewPixels: [] });
    },
  };
}
