import {
  createDefaultObject,
  createEmptyPixelGrid,
  generateId,
} from "../types";
import {
  getAnchorPadding,
  type AnchorPosition,
} from "../components/AnchorGrid/AnchorGrid";
import type { StoreGet, UpdateProjectAndSave } from "./storeTypes";

export function createObjectActions(
  _get: StoreGet,
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addObject: (name: string, width: number, height: number) => {
      updateProjectAndSave((project) => {
        const newObject = createDefaultObject(
          generateId(),
          name,
          width,
          height,
        );
        return {
          ...project,
          objects: [...project.objects, newObject],
          uiState: {
            ...project.uiState,
            selectedObjectId: newObject.id,
            selectedFrameId: newObject.frames[0].id,
            selectedLayerId: newObject.frames[0].layers[0].id,
          },
        };
      }, true);
    },

    deleteObject: (id: string) => {
      updateProjectAndSave((project) => {
        const newObjects = project.objects.filter((o) => o.id !== id);
        if (newObjects.length === 0) {
          const defaultObj = createDefaultObject(generateId(), "Object 1");
          newObjects.push(defaultObj);
        }
        const selectedObject = newObjects[0];
        return {
          ...project,
          objects: newObjects,
          uiState: {
            ...project.uiState,
            selectedObjectId: selectedObject.id,
            selectedFrameId: selectedObject.frames[0]?.id ?? null,
            selectedLayerId: selectedObject.frames[0]?.layers[0]?.id ?? null,
          },
        };
      }, true);
    },

    renameObject: (id: string, name: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === id ? { ...o, name } : o,
          ),
        }),
        true,
      );
    },

    resizeObject: (
      id: string,
      width: number,
      height: number,
      anchor: AnchorPosition = "middle-center",
    ) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((obj) => {
            if (obj.id !== id) return obj;

            const oldWidth = obj.gridSize.width;
            const oldHeight = obj.gridSize.height;

            // Calculate padding based on anchor position
            const widthDiff = width - oldWidth;
            const heightDiff = height - oldHeight;
            const { left: leftPadding, top: topPadding } = getAnchorPadding(
              anchor,
              widthDiff,
              heightDiff,
            );

            // Resize all frames with anchor-based positioning and adjust variant layer offsets
            const newFrames = obj.frames.map((frame) => ({
              ...frame,
              layers: frame.layers.map((layer) => {
                const newPixels = createEmptyPixelGrid(width, height);
                // Copy existing pixels with anchor-based offset
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
                      newPixels[newY][newX] = layer.pixels[y]?.[x] ?? 0;
                    }
                  }
                }

                // Adjust variant layer offsets when the object is resized
                // When pixels are added to the left/top, adjust offsets to keep variant in same visual position
                if (layer.isVariant && layer.variantOffsets) {
                  // Adjust all offsets in variantOffsets
                  const adjustedOffsets: {
                    [variantId: string]: { x: number; y: number };
                  } = {};
                  for (const [variantId, offset] of Object.entries(
                    layer.variantOffsets,
                  )) {
                    adjustedOffsets[variantId] = {
                      x: offset.x - leftPadding,
                      y: offset.y - topPadding,
                    };
                  }
                  return {
                    ...layer,
                    pixels: newPixels,
                    variantOffsets: adjustedOffsets,
                  };
                }
                // Handle legacy variantOffset if still present
                if (layer.isVariant && layer.variantOffset) {
                  return {
                    ...layer,
                    pixels: newPixels,
                    variantOffset: {
                      x: layer.variantOffset.x - leftPadding,
                      y: layer.variantOffset.y - topPadding,
                    },
                  };
                }

                return { ...layer, pixels: newPixels };
              }),
            }));

            return {
              ...obj,
              gridSize: { width, height },
              frames: newFrames,
            };
          }),
        }),
        true,
      );
    },

    selectObject: (id: string) => {
      updateProjectAndSave((project) => {
        const obj = project.objects.find((o) => o.id === id);
        return {
          ...project,
          uiState: {
            ...project.uiState,
            selectedObjectId: id,
            selectedFrameId: obj?.frames[0]?.id ?? null,
            selectedLayerId: obj?.frames[0]?.layers[0]?.id ?? null,
          },
        };
      }, false); // Don't track selection changes in history
    },

    duplicateObject: (id: string) => {
      updateProjectAndSave((project) => {
        const sourceObject = project.objects.find((o) => o.id === id);
        if (!sourceObject) return project;

        const newObjectId = generateId();
        const newObject = {
          ...sourceObject,
          id: newObjectId,
          name: `${sourceObject.name} Copy`,
          frames: sourceObject.frames.map((frame) => ({
            ...frame,
            id: generateId(),
            name: frame.name,
            layers: frame.layers.map((layer) => ({
              ...layer,
              id: generateId(),
              pixels: layer.pixels.map((row) => [...row]),
              // Deep copy variant offsets if present
              variantOffsets: layer.variantOffsets
                ? { ...layer.variantOffsets }
                : undefined,
              variantOffset: layer.variantOffset
                ? { ...layer.variantOffset }
                : undefined,
            })),
          })),
        };

        return {
          ...project,
          objects: [...project.objects, newObject],
          uiState: {
            ...project.uiState,
            selectedObjectId: newObject.id,
            selectedFrameId: newObject.frames[0]?.id ?? null,
            selectedLayerId: newObject.frames[0]?.layers[0]?.id ?? null,
          },
        };
      }, true);
    },

    setObjectOrigin: (id: string, origin: { x: number; y: number }) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          objects: project.objects.map((o) =>
            o.id === id ? { ...o, origin } : o,
          ),
        }),
        true,
      );
    },
  };
}
