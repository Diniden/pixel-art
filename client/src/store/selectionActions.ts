import type { PixelData, Pixel, Point, SelectionBox } from "../types";
import { createEmptyPixelGrid } from "../types";
import type { StoreGet, StoreSet, UpdateProjectAndSave } from "./storeTypes";
import type { SelectionState } from "./storeTypes";

const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

function samePixelColor(a: Pixel | 0 | undefined, b: Pixel | 0 | undefined) {
  if (a === 0 || a === undefined) return b === 0 || b === undefined;
  if (b === 0 || b === undefined) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function pack(x: number, y: number, width: number) {
  return y * width + x;
}

function unpack(idx: number, width: number) {
  const x = idx % width;
  const y = Math.floor(idx / width);
  return { x, y };
}

function computeBounds(mask: Set<number>, width: number): SelectionBox | null {
  if (mask.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const idx of mask) {
    const { x, y } = unpack(idx, width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clampBoxToMask(
  box: SelectionBox,
  width: number,
  height: number,
): Set<number> {
  const mask = new Set<number>();
  const startX = Math.max(0, box.x);
  const startY = Math.max(0, box.y);
  const endX = Math.min(width - 1, box.x + box.width - 1);
  const endY = Math.min(height - 1, box.y + box.height - 1);
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      mask.add(pack(x, y, width));
    }
  }
  return mask;
}

function isPointInPolygon(
  px: number,
  py: number,
  poly: { x: number; y: number }[],
) {
  // Ray casting. poly is in continuous coords.
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function createSelectionActions(
  get: StoreGet,
  set: StoreSet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  const getSelectionDims = () => {
    const obj = get().getCurrentObject();
    const layer = get().getCurrentLayer();
    const { project } = get();
    if (!obj || !layer || !project) return { width: 32, height: 32 };

    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      const variantData = get().getCurrentVariant();
      if (variantData) {
        return {
          width: variantData.variant.gridSize.width,
          height: variantData.variant.gridSize.height,
        };
      }
    }
    return { width: obj.gridSize.width, height: obj.gridSize.height };
  };

  const getEditablePixels = () => {
    const obj = get().getCurrentObject();
    const layer = get().getCurrentLayer();
    const { project } = get();
    if (!obj || !layer || !project) {
      return { width: 32, height: 32, pixels: null as PixelData[][] | null };
    }

    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      const variantData = get().getCurrentVariant();
      if (!variantData) {
        return { width: 32, height: 32, pixels: null as PixelData[][] | null };
      }
      const width = variantData.variant.gridSize.width;
      const height = variantData.variant.gridSize.height;
      const pixels = variantData.variantFrame.layers[0]?.pixels ?? null;
      return { width, height, pixels };
    }

    return {
      width: obj.gridSize.width,
      height: obj.gridSize.height,
      pixels: layer.pixels,
    };
  };

  return {
    setSelection: (selection: SelectionBox | null) => {
      if (!selection) {
        set({ selection: null });
        return;
      }

      const { width, height } = getSelectionDims();
      const mask = clampBoxToMask(selection, width, height);
      const bounds = computeBounds(mask, width);
      set({
        selection: bounds
          ? ({ width, height, mask, bounds } satisfies SelectionState)
          : null,
      });
    },

    setSelectionMask: (
      mask: Set<number> | null,
      dims: { width: number; height: number },
      op: "replace" | "add" | "subtract" = "replace",
    ) => {
      if (!mask || mask.size === 0) {
        set({ selection: null });
        return;
      }

      const prev = get().selection;
      let nextMask: Set<number>;
      if (
        op === "replace" ||
        !prev ||
        prev.width !== dims.width ||
        prev.height !== dims.height
      ) {
        nextMask = new Set(mask);
      } else if (op === "add") {
        nextMask = new Set(prev.mask);
        for (const idx of mask) nextMask.add(idx);
      } else {
        // subtract
        nextMask = new Set(prev.mask);
        for (const idx of mask) nextMask.delete(idx);
      }

      const bounds = computeBounds(nextMask, dims.width);
      set({
        selection: bounds
          ? ({
              width: dims.width,
              height: dims.height,
              mask: nextMask,
              bounds,
            } satisfies SelectionState)
          : null,
      });
    },

    clearSelection: () => {
      set({ selection: null });
    },

    moveSelection: (dx: number, dy: number) => {
      const { selection } = get();
      if (!selection) return;
      if (dx === 0 && dy === 0) return;

      const { width, height } = selection;
      const moved = new Set<number>();
      for (const idx of selection.mask) {
        const { x, y } = unpack(idx, width);
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        moved.add(pack(nx, ny, width));
      }
      const bounds = computeBounds(moved, width);
      set({
        selection: bounds ? { width, height, mask: moved, bounds } : null,
      });
    },

    expandSelection: (steps: number = 1) => {
      const { selection } = get();
      if (!selection) return;
      const { width, height } = selection;
      let mask = new Set(selection.mask);

      for (let s = 0; s < Math.max(0, steps); s++) {
        const next = new Set(mask);
        for (const idx of mask) {
          const { x, y } = unpack(idx, width);
          const n = [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          ];
          for (const p of n) {
            if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
            next.add(pack(p.x, p.y, width));
          }
        }
        mask = next;
      }

      const bounds = computeBounds(mask, width);
      set({
        selection: bounds ? { width, height, mask, bounds } : null,
      });
    },

    shrinkSelection: (steps: number = 1) => {
      const { selection } = get();
      if (!selection) return;
      const { width, height } = selection;
      let mask = new Set(selection.mask);

      for (let s = 0; s < Math.max(0, steps); s++) {
        const next = new Set<number>();
        for (const idx of mask) {
          const { x, y } = unpack(idx, width);
          const neighbors = [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          ];
          let keep = true;
          for (const p of neighbors) {
            if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
              keep = false;
              break;
            }
            if (!mask.has(pack(p.x, p.y, width))) {
              keep = false;
              break;
            }
          }
          if (keep) next.add(idx);
        }
        mask = next;
        if (mask.size === 0) break;
      }

      const bounds = computeBounds(mask, width);
      set({
        selection: bounds ? { width, height, mask, bounds } : null,
      });
    },

    selectFloodFillAt: (x: number, y: number) => {
      const { width, height, pixels } = getEditablePixels();
      if (!pixels) return;
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const target = pixels[y]?.[x]?.color;

      const visited = new Uint8Array(width * height);
      const q: number[] = [pack(x, y, width)];
      visited[pack(x, y, width)] = 1;
      const mask = new Set<number>();

      while (q.length) {
        const idx = q.pop()!;
        const { x: cx, y: cy } = unpack(idx, width);
        const c = pixels[cy]?.[cx]?.color;
        if (!samePixelColor(c, target)) continue;
        mask.add(idx);

        const n = [
          { x: cx - 1, y: cy },
          { x: cx + 1, y: cy },
          { x: cx, y: cy - 1 },
          { x: cx, y: cy + 1 },
        ];
        for (const p of n) {
          if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
          const ni = pack(p.x, p.y, width);
          if (visited[ni]) continue;
          visited[ni] = 1;
          // We still enqueue, and filter by color when popping.
          q.push(ni);
        }
      }

      const bounds = computeBounds(mask, width);
      set({
        selection: bounds ? { width, height, mask, bounds } : null,
      });
    },

    selectAllByColorAt: (x: number, y: number) => {
      const { width, height, pixels } = getEditablePixels();
      if (!pixels) return;
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const target = pixels[y]?.[x]?.color;
      const mask = new Set<number>();
      for (let yy = 0; yy < height; yy++) {
        const row = pixels[yy];
        if (!row) continue;
        for (let xx = 0; xx < width; xx++) {
          const c = row[xx]?.color;
          if (samePixelColor(c, target)) mask.add(pack(xx, yy, width));
        }
      }
      const bounds = computeBounds(mask, width);
      set({
        selection: bounds ? { width, height, mask, bounds } : null,
      });
    },

    selectLasso: (points: Point[]) => {
      const { width, height } = getSelectionDims();
      if (!points || points.length === 0) return;
      if (points.length === 1) {
        const idx = pack(points[0].x, points[0].y, width);
        const mask = new Set<number>([idx]);
        const bounds = computeBounds(mask, width);
        set({ selection: bounds ? { width, height, mask, bounds } : null });
        return;
      }
      // Convert to continuous polygon at pixel centers
      const poly = points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      minX = Math.max(0, Math.floor(minX));
      minY = Math.max(0, Math.floor(minY));
      maxX = Math.min(width - 1, Math.ceil(maxX));
      maxY = Math.min(height - 1, Math.ceil(maxY));

      const mask = new Set<number>();
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          if (isPointInPolygon(cx, cy, poly)) mask.add(pack(x, y, width));
        }
      }
      const bounds = computeBounds(mask, width);
      set({
        selection: bounds ? { width, height, mask, bounds } : null,
      });
    },

    deleteSelectionPixels: () => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { selection, project } = get();
      if (!obj || !frame || !layer || !selection || !project) return;

      // Variant editing
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;
        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        if (selection.width !== width || selection.height !== height) return;

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
                          const newPixels = createEmptyPixelGrid(width, height);
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              newPixels[y][x] = l.pixels[y]?.[x] ?? EMPTY;
                            }
                          }
                          for (const idx of selection.mask) {
                            const { x, y } = unpack(idx, width);
                            if (x >= 0 && x < width && y >= 0 && y < height) {
                              newPixels[y][x] = { ...EMPTY };
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
      const width = obj.gridSize.width;
      const height = obj.gridSize.height;
      if (selection.width !== width || selection.height !== height) return;

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
                            const newPixels = createEmptyPixelGrid(
                              width,
                              height,
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                newPixels[y][x] = l.pixels[y]?.[x] ?? EMPTY;
                              }
                            }
                            for (const idx of selection.mask) {
                              const { x, y } = unpack(idx, width);
                              if (x >= 0 && x < width && y >= 0 && y < height) {
                                newPixels[y][x] = { ...EMPTY };
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

    moveSelectedPixels: (dx: number, dy: number) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { selection, project } = get();
      if (!obj || !frame || !layer || !selection || !project) return;
      if (dx === 0 && dy === 0) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        if (selection.width !== width || selection.height !== height) return;
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
                          const newPixels = createEmptyPixelGrid(width, height);
                          // Copy all pixels first
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              newPixels[y][x] = l.pixels[y]?.[x] ?? EMPTY;
                            }
                          }

                          // Clear selected pixels
                          for (const idx of selection.mask) {
                            const { x, y } = unpack(idx, width);
                            if (x >= 0 && x < width && y >= 0 && y < height) {
                              newPixels[y][x] = { ...EMPTY };
                            }
                          }

                          // Paste moved pixels from original layer
                          for (const idx of selection.mask) {
                            const { x, y } = unpack(idx, width);
                            const destX = x + dx;
                            const destY = y + dy;
                            if (
                              x >= 0 &&
                              x < width &&
                              y >= 0 &&
                              y < height &&
                              destX >= 0 &&
                              destX < width &&
                              destY >= 0 &&
                              destY < height
                            ) {
                              newPixels[destY][destX] =
                                l.pixels[y]?.[x] ?? EMPTY;
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

        // Move the selection mask along with the pixels
        get().moveSelection(dx, dy);
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;
      if (selection.width !== width || selection.height !== height) return;

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

                            const newPixels = createEmptyPixelGrid(
                              width,
                              height,
                            );
                            for (let y = 0; y < height; y++) {
                              for (let x = 0; x < width; x++) {
                                newPixels[y][x] = l.pixels[y]?.[x] ?? EMPTY;
                              }
                            }

                            for (const idx of selection.mask) {
                              const { x, y } = unpack(idx, width);
                              if (x >= 0 && x < width && y >= 0 && y < height) {
                                newPixels[y][x] = { ...EMPTY };
                              }
                            }

                            for (const idx of selection.mask) {
                              const { x, y } = unpack(idx, width);
                              const destX = x + dx;
                              const destY = y + dy;
                              if (
                                x >= 0 &&
                                x < width &&
                                y >= 0 &&
                                y < height &&
                                destX >= 0 &&
                                destX < width &&
                                destY >= 0 &&
                                destY < height
                              ) {
                                newPixels[destY][destX] =
                                  l.pixels[y]?.[x] ?? EMPTY;
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

      // Move the selection mask along with the pixels
      get().moveSelection(dx, dy);
    },
  };
}
