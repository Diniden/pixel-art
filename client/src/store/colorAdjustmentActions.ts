import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type { Color } from "../types";

export function createColorAdjustmentActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    startColorAdjustment: (color: Color, allFrames: boolean) => {
      const layer = get().getCurrentLayer();
      const obj = get().getCurrentObject();
      if (!layer || !obj) return;

      // Check if we're editing a variant
      const variantData = get().getCurrentVariant();
      const variantLayer = get().getSelectedVariantLayer();
      const isEditingVariant = layer.isVariant && variantData && variantLayer;

      if (isEditingVariant) {
        // Variant editing mode
        const { variant } = variantData;
        const { width, height } = variant.gridSize;

        if (allFrames) {
          // Find all pixels across all variant frames
          const affectedPixelsByFrame = new Map<
            string,
            Map<string, { x: number; y: number }[]>
          >();

          for (
            let frameIdx = 0;
            frameIdx < variant.frames.length;
            frameIdx++
          ) {
            const variantFrame = variant.frames[frameIdx];
            const frameKey = `variant-frame-${frameIdx}`;

            for (const vLayer of variantFrame.layers) {
              const pixels: { x: number; y: number }[] = [];

              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const pd = vLayer.pixels[y]?.[x];
                  const pColor = pd?.color;
                  if (pColor && typeof pColor === "object") {
                    if (
                      pColor.r === color.r &&
                      pColor.g === color.g &&
                      pColor.b === color.b &&
                      pColor.a === color.a
                    ) {
                      pixels.push({ x, y });
                    }
                  }
                }
              }

              if (pixels.length > 0) {
                if (!affectedPixelsByFrame.has(frameKey)) {
                  affectedPixelsByFrame.set(frameKey, new Map());
                }
                affectedPixelsByFrame.get(frameKey)!.set(vLayer.id, pixels);
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: true,
              affectedPixels: [], // Not used in all-frames mode
              affectedPixelsByFrame,
            },
          });
        } else {
          // Single frame mode - find pixels only in current variant frame's layer
          const affectedPixels: { x: number; y: number }[] = [];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pd = variantLayer.pixels[y]?.[x];
              const pColor = pd?.color;
              if (pColor && typeof pColor === "object") {
                if (
                  pColor.r === color.r &&
                  pColor.g === color.g &&
                  pColor.b === color.b &&
                  pColor.a === color.a
                ) {
                  affectedPixels.push({ x, y });
                }
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: false,
              affectedPixels,
            },
          });
        }
      } else {
        // Regular layer editing mode
        const { width, height } = obj.gridSize;

        if (allFrames) {
          // Find all pixels across all frames with matching layer names
          const affectedPixelsByFrame = new Map<
            string,
            Map<string, { x: number; y: number }[]>
          >();

          for (const frame of obj.frames) {
            // Find layers with the same name as the current layer
            const matchingLayers = frame.layers.filter(
              (l) => l.name === layer.name,
            );

            for (const matchingLayer of matchingLayers) {
              const pixels: { x: number; y: number }[] = [];

              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const pd = matchingLayer.pixels[y]?.[x];
                  const pColor = pd?.color;
                  if (pColor && typeof pColor === "object") {
                    if (
                      pColor.r === color.r &&
                      pColor.g === color.g &&
                      pColor.b === color.b &&
                      pColor.a === color.a
                    ) {
                      pixels.push({ x, y });
                    }
                  }
                }
              }

              if (pixels.length > 0) {
                if (!affectedPixelsByFrame.has(frame.id)) {
                  affectedPixelsByFrame.set(frame.id, new Map());
                }
                affectedPixelsByFrame
                  .get(frame.id)!
                  .set(matchingLayer.id, pixels);
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: true,
              affectedPixels: [], // Not used in all-frames mode
              affectedPixelsByFrame,
            },
          });
        } else {
          // Single frame mode - find pixels only in current layer
          const affectedPixels: { x: number; y: number }[] = [];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pd = layer.pixels[y]?.[x];
              const pColor = pd?.color;
              if (pColor && typeof pColor === "object") {
                if (
                  pColor.r === color.r &&
                  pColor.g === color.g &&
                  pColor.b === color.b &&
                  pColor.a === color.a
                ) {
                  affectedPixels.push({ x, y });
                }
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: false,
              affectedPixels,
            },
          });
        }
      }

      // Also set the color picker to this color
      updateProjectAndSave(
        (project) => ({
          ...project,
          uiState: { ...project.uiState, selectedColor: color },
        }),
        false,
      );
    },

    clearColorAdjustment: () => {
      set({ colorAdjustment: null });
    },

    adjustColor: (newColor: Color, trackHistory: boolean = false) => {
      const { colorAdjustment } = get();
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      if (!colorAdjustment || !obj || !frame || !layer) return;

      // Check if we're editing a variant
      const variantData = get().getCurrentVariant();
      const variantLayer = get().getSelectedVariantLayer();
      const isEditingVariant = layer.isVariant && variantData && variantLayer;

      if (isEditingVariant) {
        // Variant editing mode
        const variantGroupId = layer.variantGroupId!;
        const variantId = layer.selectedVariantId!;

        if (
          colorAdjustment.allFrames &&
          colorAdjustment.affectedPixelsByFrame
        ) {
          // All frames mode - update pixels across all variant frames
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
                    return {
                      ...v,
                      frames: v.frames.map((vf, frameIdx) => {
                        const frameKey = `variant-frame-${frameIdx}`;
                        const framePixels =
                          colorAdjustment.affectedPixelsByFrame!.get(frameKey);
                        if (!framePixels) return vf;

                        return {
                          ...vf,
                          layers: vf.layers.map((vl) => {
                            const layerPixels = framePixels.get(vl.id);
                            if (!layerPixels || layerPixels.length === 0)
                              return vl;

                            // Only copy affected rows
                            const affectedRows = new Set(
                              layerPixels.map((p) => p.y),
                            );
                            const newPixels = [...vl.pixels];
                            for (const rowY of affectedRows) {
                              newPixels[rowY] = [...vl.pixels[rowY]];
                            }
                            for (const { x, y } of layerPixels) {
                              const existing = newPixels[y][x];
                              newPixels[y][x] = {
                                color: newColor,
                                normal: existing?.normal ?? 0,
                                height: existing?.height ?? 1,
                              };
                            }
                            return { ...vl, pixels: newPixels };
                          }),
                        };
                      }),
                    };
                  }),
                };
              }),
              uiState: { ...project.uiState, selectedColor: newColor },
            }),
            trackHistory,
          );
        } else {
          // Single frame mode - update only current variant frame's layer
          const { project } = get();
          const frameIndex =
            project?.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
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
                    return {
                      ...v,
                      frames: v.frames.map((vf, idx) => {
                        if (idx !== frameIndex % v.frames.length) return vf;
                        return {
                          ...vf,
                          layers: vf.layers.map((vl) => {
                            if (vl.id !== variantLayer.id) return vl;
                            // Only copy affected rows
                            const affectedRows = new Set(
                              colorAdjustment.affectedPixels.map((p) => p.y),
                            );
                            const newPixels = [...vl.pixels];
                            for (const rowY of affectedRows) {
                              newPixels[rowY] = [...vl.pixels[rowY]];
                            }
                            for (const {
                              x,
                              y,
                            } of colorAdjustment.affectedPixels) {
                              const existing = newPixels[y][x];
                              newPixels[y][x] = {
                                color: newColor,
                                normal: existing?.normal ?? 0,
                                height: existing?.height ?? 1,
                              };
                            }
                            return { ...vl, pixels: newPixels };
                          }),
                        };
                      }),
                    };
                  }),
                };
              }),
              uiState: { ...project.uiState, selectedColor: newColor },
            }),
            trackHistory,
          );
        }
      } else {
        // Regular layer editing mode
        if (
          colorAdjustment.allFrames &&
          colorAdjustment.affectedPixelsByFrame
        ) {
          // All frames mode - update pixels across all frames
          updateProjectAndSave(
            (project) => ({
              ...project,
              objects: project.objects.map((o) =>
                o.id === obj.id
                  ? {
                      ...o,
                      frames: o.frames.map((f) => {
                        const framePixels =
                          colorAdjustment.affectedPixelsByFrame!.get(f.id);
                        if (!framePixels) return f;

                        return {
                          ...f,
                          layers: f.layers.map((l) => {
                            const layerPixels = framePixels.get(l.id);
                            if (!layerPixels || layerPixels.length === 0)
                              return l;

                            // Only copy affected rows
                            const affectedRows = new Set(
                              layerPixels.map((p) => p.y),
                            );
                            const newPixels = [...l.pixels];
                            for (const rowY of affectedRows) {
                              newPixels[rowY] = [...l.pixels[rowY]];
                            }
                            for (const { x, y } of layerPixels) {
                              const existing = newPixels[y][x];
                              newPixels[y][x] = {
                                color: newColor,
                                normal: existing?.normal ?? 0,
                                height: existing?.height ?? 1,
                              };
                            }
                            return { ...l, pixels: newPixels };
                          }),
                        };
                      }),
                    }
                  : o,
              ),
              uiState: { ...project.uiState, selectedColor: newColor },
            }),
            trackHistory,
          );
        } else {
          // Single frame mode - update only current layer
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
                                  colorAdjustment.affectedPixels.map(
                                    (p) => p.y,
                                  ),
                                );
                                const newPixels = [...l.pixels];
                                for (const rowY of affectedRows) {
                                  newPixels[rowY] = [...l.pixels[rowY]];
                                }
                                for (const {
                                  x,
                                  y,
                                } of colorAdjustment.affectedPixels) {
                                  const existing = newPixels[y][x];
                                  newPixels[y][x] = {
                                    color: newColor,
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
              uiState: { ...project.uiState, selectedColor: newColor },
            }),
            trackHistory,
          );
        }
      }
    },
  };
}
