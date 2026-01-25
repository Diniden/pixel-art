import { create } from 'zustand';
import {
  Project,
  PixelObject,
  Frame,
  Layer,
  Color,
  Tool,
  BitDepth,
  ShapeMode,
  Point,
  Pixel,
  SelectionBox,
  Variant,
  VariantGroup,
  VariantFrame,
  createDefaultProject,
  createDefaultObject,
  createDefaultFrame,
  createDefaultLayer,
  createEmptyPixelGrid,
  generateId,
  DEFAULT_COLOR
} from '../types';
import { loadProject } from '../services/api';
import { scheduleAutoSave, setOnSaveStatusChange } from '../services/autoSave';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const MAX_HISTORY = 100;
const MAX_COLOR_HISTORY = 10;

// Color adjustment mode - tracks which pixels should be updated when color changes
export interface ColorAdjustmentState {
  originalColor: Color;           // The original color that was selected
  allFrames: boolean;             // Whether to adjust across all frames
  // When allFrames is false, just pixel coordinates for current layer
  affectedPixels: { x: number; y: number }[];
  // When allFrames is true, map of frameId -> layerId -> pixel coordinates
  affectedPixelsByFrame?: Map<string, Map<string, { x: number; y: number }[]>>;
}

interface EditorState {
  // Project data
  project: Project | null;
  isLoading: boolean;
  saveStatus: SaveStatus;

  // History for undo (only for pixel/layer/frame/object edits)
  projectHistory: Project[];
  historyIndex: number;

  // Drawing state
  isDrawing: boolean;
  drawStartPoint: Point | null;
  previewPixels: Point[];

  // Reference trace overlay offset
  referenceOverlayOffset: { x: number; y: number };

  // Color history (last 10 colors used)
  colorHistory: Color[];

  // Previous tool (for eyedropper revert)
  previousTool: Tool | null;

  // Selection box
  selection: SelectionBox | null;

  // Color adjustment mode
  colorAdjustment: ColorAdjustmentState | null;

  // Actions
  initProject: () => Promise<void>;
  undo: () => void;

  // Object actions
  addObject: (name: string, width: number, height: number) => void;
  deleteObject: (id: string) => void;
  renameObject: (id: string, name: string) => void;
  resizeObject: (id: string, width: number, height: number) => void;
  selectObject: (id: string) => void;

  // Frame actions
  addFrame: (name: string, copyPrevious?: boolean) => void;
  deleteFrame: (id: string) => void;
  deleteSelectedFrame: () => void;
  renameFrame: (id: string, name: string) => void;
  selectFrame: (id: string, syncVariants?: boolean) => void;
  duplicateFrame: (id: string) => void;
  moveFrame: (id: string, direction: 'left' | 'right') => void;

  // Layer actions
  addLayer: (name: string) => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleAllLayersVisibility: (visible: boolean) => void;
  selectLayer: (id: string) => void;
  moveLayer: (fromIndex: number, toIndex: number) => void;
  moveLayerPixels: (dx: number, dy: number) => void;

  // Drawing actions
  setPixel: (x: number, y: number, color: Color | 0) => void;
  setPixels: (pixels: { x: number; y: number; color: Color | 0 }[]) => void;
  startDrawing: (point: Point) => void;
  updateDrawing: (point: Point) => void;
  endDrawing: () => void;
  setPreviewPixels: (pixels: Point[]) => void;
  clearPreviewPixels: () => void;

  // Tool & color actions
  setTool: (tool: Tool) => void;
  revertToPreviousTool: () => void;
  setColor: (color: Color) => void;
  setColorAndAddToHistory: (color: Color) => void;
  addToColorHistory: (color: Color) => void;
  setBrushSize: (size: number) => void;
  setBitDepth: (depth: BitDepth) => void;
  setShapeMode: (mode: ShapeMode) => void;
  setBorderRadius: (radius: number) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setMoveAllLayers: (moveAll: boolean) => void;

  // Palette actions
  addPalette: (name: string) => void;
  deletePalette: (id: string) => void;
  renamePalette: (id: string, name: string) => void;
  addColorToPalette: (paletteId: string, color: Color) => void;
  removeColorFromPalette: (paletteId: string, colorIndex: number) => void;

  // Reference trace actions
  setReferenceOverlayOffset: (offset: { x: number; y: number }) => void;
  moveReferenceOverlay: (dx: number, dy: number) => void;
  resetReferenceOverlay: () => void;

  // Selection actions
  setSelection: (selection: SelectionBox | null) => void;
  clearSelection: () => void;
  moveSelectedPixels: (dx: number, dy: number) => void;

  // Color adjustment actions
  startColorAdjustment: (color: Color, allFrames: boolean) => void;
  clearColorAdjustment: () => void;
  adjustColor: (newColor: Color, trackHistory?: boolean) => void;

  // Variant actions
  makeVariant: (layerId: string) => void;
  addVariant: (variantGroupId: string, copyFromVariantId?: string) => void;
  deleteVariant: (variantGroupId: string, variantId: string) => void;
  selectVariant: (layerId: string, variantId: string) => void;
  renameVariant: (variantGroupId: string, variantId: string, name: string) => void;
  resizeVariant: (variantGroupId: string, variantId: string, width: number, height: number) => void;
  setVariantOffset: (dx: number, dy: number) => void;
  selectVariantFrame: (variantGroupId: string, frameIndex: number) => void;
  advanceVariantFrames: (delta: number) => void;
  duplicateVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => void;
  deleteVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => void;
  addVariantFrame: (variantGroupId: string, variantId: string, copyPrevious?: boolean) => void;
  moveVariantFrame: (variantGroupId: string, variantId: string, frameId: string, direction: 'left' | 'right') => void;

  // Helpers
  getCurrentObject: () => PixelObject | null;
  getCurrentFrame: () => Frame | null;
  getCurrentLayer: () => Layer | null;
  getCurrentVariant: () => { variantGroup: VariantGroup; variant: Variant; variantFrame: VariantFrame; baseFrameIndex: number; offset: { x: number; y: number } } | null;
  getSelectedVariantLayer: () => Layer | null;
  isEditingVariant: () => boolean;
}

export const useEditorStore = create<EditorState>((set, get) => {
  // Set up save status callback
  setOnSaveStatusChange((status) => {
    set({ saveStatus: status });
    if (status === 'saved') {
      setTimeout(() => {
        const currentStatus = get().saveStatus;
        if (currentStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, 2000);
    }
  });

  // Update project and save - with optional history tracking
  const updateProjectAndSave = (
    updater: (project: Project) => Project,
    trackHistory: boolean = false
  ) => {
    const { project, projectHistory, historyIndex } = get();
    if (!project) return;

    const newProject = updater(project);

    if (trackHistory) {
      // Add current project to history before making the change
      const newHistory = [...projectHistory.slice(0, historyIndex + 1), project];
      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      set({
        project: newProject,
        projectHistory: newHistory,
        historyIndex: newHistory.length - 1
      });
    } else {
      set({ project: newProject });
    }

    scheduleAutoSave(newProject);
  };

  // Save current project state to history without making changes
  const saveCurrentStateToHistory = () => {
    const { project, projectHistory, historyIndex } = get();
    if (!project) return;

    const newHistory = [...projectHistory.slice(0, historyIndex + 1), project];
    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    set({
      projectHistory: newHistory,
      historyIndex: newHistory.length - 1
    });
  };

  return {
    project: null,
    isLoading: true,
    saveStatus: 'idle',
    projectHistory: [],
    historyIndex: -1,
    isDrawing: false,
    drawStartPoint: null,
    previewPixels: [],
    referenceOverlayOffset: { x: 0, y: 0 },
    colorHistory: [],
    previousTool: null,
    selection: null,
    colorAdjustment: null,

    initProject: async () => {
      set({ isLoading: true });
      try {
        const project = await loadProject();
        set({ project, isLoading: false, projectHistory: [], historyIndex: -1 });
      } catch (error) {
        console.error('Failed to load project:', error);
        set({ project: createDefaultProject(), isLoading: false, projectHistory: [], historyIndex: -1 });
      }
    },

    undo: () => {
      const { projectHistory, historyIndex } = get();
      if (historyIndex < 0 || projectHistory.length === 0) return;

      const previousProject = projectHistory[historyIndex];
      const newIndex = historyIndex - 1;

      set({
        project: previousProject,
        historyIndex: newIndex
      });
      scheduleAutoSave(previousProject);
    },

    // Object actions
    addObject: (name, width, height) => {
      updateProjectAndSave((project) => {
        const newObject = createDefaultObject(generateId(), name, width, height);
        return {
          ...project,
          objects: [...project.objects, newObject],
          uiState: {
            ...project.uiState,
            selectedObjectId: newObject.id,
            selectedFrameId: newObject.frames[0].id,
            selectedLayerId: newObject.frames[0].layers[0].id
          }
        };
      }, true);
    },

    deleteObject: (id) => {
      updateProjectAndSave((project) => {
        const newObjects = project.objects.filter((o) => o.id !== id);
        if (newObjects.length === 0) {
          const defaultObj = createDefaultObject(generateId(), 'Object 1');
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
            selectedLayerId: selectedObject.frames[0]?.layers[0]?.id ?? null
          }
        };
      }, true);
    },

    renameObject: (id, name) => {
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) =>
          o.id === id ? { ...o, name } : o
        )
      }), true);
    },

    resizeObject: (id, width, height) => {
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((obj) => {
          if (obj.id !== id) return obj;

          const oldWidth = obj.gridSize.width;
          const oldHeight = obj.gridSize.height;

          return {
            ...obj,
            gridSize: { width, height },
            frames: obj.frames.map((frame) => ({
              ...frame,
              layers: frame.layers.map((layer) => {
                const newPixels = createEmptyPixelGrid(width, height);
                // Copy existing pixels
                for (let y = 0; y < Math.min(oldHeight, height); y++) {
                  for (let x = 0; x < Math.min(oldWidth, width); x++) {
                    newPixels[y][x] = layer.pixels[y]?.[x] ?? 0;
                  }
                }
                return { ...layer, pixels: newPixels };
              })
            }))
          };
        })
      }), true);
    },

    selectObject: (id) => {
      updateProjectAndSave((project) => {
        const obj = project.objects.find((o) => o.id === id);
        return {
          ...project,
          uiState: {
            ...project.uiState,
            selectedObjectId: id,
            selectedFrameId: obj?.frames[0]?.id ?? null,
            selectedLayerId: obj?.frames[0]?.layers[0]?.id ?? null
          }
        };
      }, false); // Don't track selection changes in history
    },

    // Frame actions
    addFrame: (name, copyPrevious = false) => {
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
              pixels: l.pixels.map((row) => [...row])
            }))
          };
        } else {
          // Create empty frame
          newFrame = createDefaultFrame(frameId, name, obj.gridSize.width, obj.gridSize.height);
        }

        // Find the index of the currently selected frame and insert after it
        const currentFrameIndex = obj.frames.findIndex(
          (f) => f.id === project.uiState.selectedFrameId
        );
        const insertIndex = currentFrameIndex >= 0 ? currentFrameIndex + 1 : obj.frames.length;

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
            selectedLayerId: newFrame.layers[0].id
          }
        };
      }, true);
    },

    deleteFrame: (id) => {
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
            o.id === obj.id ? { ...o, frames: newFrames } : o
          ),
          uiState: {
            ...project.uiState,
            selectedFrameId: selectedFrame.id,
            selectedLayerId: selectedFrame.layers[0]?.id ?? null
          }
        };
      }, true);
    },

    deleteSelectedFrame: () => {
      const { project } = get();
      if (!project?.uiState.selectedFrameId) return;
      get().deleteFrame(project.uiState.selectedFrameId);
    },

    renameFrame: (id, name) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) =>
          o.id === obj.id
            ? {
                ...o,
                frames: o.frames.map((f) => (f.id === id ? { ...f, name } : f))
              }
            : o
        )
      }), true);
    },

    selectFrame: (id, syncVariants = true) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj) return;

      const currentLayer = get().getCurrentLayer();
      const frame = obj.frames.find((f) => f.id === id);

      // Find the base frame index
      const baseFrameIndex = obj.frames.findIndex(f => f.id === id);

      // If currently editing a variant, keep the same variant layer selected
      const isEditingVariant = currentLayer?.isVariant === true;
      let newLayerId = project?.uiState.selectedLayerId ?? null;

      if (isEditingVariant && currentLayer && frame) {
        // Find the variant layer in the new frame (same variant group)
        const variantLayer = frame.layers.find(
          (l) => l.isVariant && l.variantGroupId === currentLayer.variantGroupId
        );
        if (variantLayer) {
          newLayerId = variantLayer.id;
        }
      } else if (frame && currentLayer) {
        // Try to find a layer with the same name in the new frame
        const matchingLayer = frame.layers.find((l) => l.name === currentLayer.name);
        if (matchingLayer) {
          newLayerId = matchingLayer.id;
        } else if (frame.layers.length > 0) {
          newLayerId = frame.layers[0].id;
        }
      } else if (frame?.layers.length > 0) {
        newLayerId = frame.layers[0].id;
      }

      // Sync variant frame indices with base frame index (only if syncVariants is true)
      const newVariantFrameIndices: { [key: string]: number } = {};
      if (syncVariants && obj.variantGroups && baseFrameIndex >= 0) {
        for (const vg of obj.variantGroups) {
          // Get the number of frames for this variant group (from first variant)
          const variantFrameCount = vg.variants[0]?.frames.length ?? 1;
          if (variantFrameCount > 0) {
            // Map base frame index to variant frame index (wrap if needed)
            const variantFrameIndex = baseFrameIndex % variantFrameCount;
            newVariantFrameIndices[vg.id] = variantFrameIndex;
          }
        }
      }

      updateProjectAndSave((project) => ({
        ...project,
        uiState: {
          ...project.uiState,
          selectedFrameId: id,
          selectedLayerId: newLayerId ?? project.uiState.selectedLayerId,
          variantFrameIndices: syncVariants
            ? { ...project.uiState.variantFrameIndices, ...newVariantFrameIndices }
            : project.uiState.variantFrameIndices
        }
      }), false); // Don't track selection changes in history
    },

    duplicateFrame: (id) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const sourceFrame = obj.frames.find((f) => f.id === id);
      if (!sourceFrame) return;

      updateProjectAndSave((project) => {
        const newFrameId = generateId();
        const newFrame: Frame = {
          ...sourceFrame,
          id: newFrameId,
          name: `${sourceFrame.name} Copy`,
          layers: sourceFrame.layers.map((l) => ({
            ...l,
            id: generateId(),
            pixels: l.pixels.map((row) => [...row])
          }))
        };

        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id ? { ...o, frames: [...o.frames, newFrame] } : o
          ),
          uiState: {
            ...project.uiState,
            selectedFrameId: newFrame.id,
            selectedLayerId: newFrame.layers[0].id
          }
        };
      }, true);
    },

    moveFrame: (id, direction) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frameIndex = obj.frames.findIndex((f) => f.id === id);
      if (frameIndex === -1) return;

      const newIndex = direction === 'left' ? frameIndex - 1 : frameIndex + 1;
      if (newIndex < 0 || newIndex >= obj.frames.length) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) => {
          if (o.id !== obj.id) return o;
          const newFrames = [...o.frames];
          const [removed] = newFrames.splice(frameIndex, 1);
          newFrames.splice(newIndex, 0, removed);
          return { ...o, frames: newFrames };
        })
      }), true);
    },

    // Layer actions
    addLayer: (name) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => {
        const layerId = generateId();
        const newLayer = createDefaultLayer(layerId, name, obj.gridSize.width, obj.gridSize.height);
        return {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id ? { ...f, layers: [...f.layers, newLayer] } : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerId
          }
        };
      }, true);
    },

    duplicateLayer: (id) => {
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
          pixels: sourceLayer.pixels.map((row) => [...row])
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
                    f.id === frame.id ? { ...f, layers: newLayers } : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: newLayerId
          }
        };
      }, true);
    },

    deleteLayer: (id) => {
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
                    f.id === frame.id ? { ...f, layers: newLayers } : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: newLayers[0].id
          }
        };
      }, true);
    },

    renameLayer: (id, name) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => ({
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
                          l.id === id ? { ...l, name } : l
                        )
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    toggleLayerVisibility: (id) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => ({
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
                          l.id === id ? { ...l, visible: !l.visible } : l
                        )
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    toggleAllLayersVisibility: (visible) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) =>
          o.id === obj.id
            ? {
                ...o,
                frames: o.frames.map((f) =>
                  f.id === frame.id
                    ? {
                        ...f,
                        layers: f.layers.map((l) => ({ ...l, visible }))
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    selectLayer: (id) => {
      // Clear color adjustment when switching layers
      set({ colorAdjustment: null });

      updateProjectAndSave((project) => ({
        ...project,
        uiState: {
          ...project.uiState,
          selectedLayerId: id
        }
      }), false); // Don't track selection changes in history
    },

    moveLayer: (fromIndex, toIndex) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      updateProjectAndSave((project) => ({
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
                })
              }
            : o
        )
      }), true);
    },

    moveLayerPixels: (dx, dy) => {
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  variantGroups: o.variantGroups?.map(vg => {
                    if (vg.id !== variantGroupId) return vg;
                    return {
                      ...vg,
                      variants: vg.variants.map(v => {
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
                                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                                      newPixels[y][x] = l.pixels[srcY][srcX];
                                    }
                                  }
                                }
                                return { ...l, pixels: newPixels };
                              })
                            };
                          })
                        };
                      })
                    };
                  })
                }
              : o
          )
        }), true);
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;
      const moveAll = project.uiState.moveAllLayers;

      updateProjectAndSave((project) => ({
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
                          const newPixels = createEmptyPixelGrid(width, height);
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const srcX = x - dx;
                              const srcY = y - dy;
                              if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                                newPixels[y][x] = l.pixels[srcY][srcX];
                              }
                            }
                          }
                          return { ...l, pixels: newPixels };
                        })
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    // Drawing actions - optimized to only copy affected rows
    setPixel: (x, y, color) => {
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

        // Skip if pixel is already the same
        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;
        const currentPixel = targetLayer.pixels[y]?.[x];
        if (color === 0 && currentPixel === 0) return;
        if (color && currentPixel &&
            color.r === currentPixel.r &&
            color.g === currentPixel.g &&
            color.b === currentPixel.b &&
            color.a === currentPixel.a) return;

        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  variantGroups: o.variantGroups?.map(vg => {
                    if (vg.id !== variantGroupId) return vg;
                    return {
                      ...vg,
                      variants: vg.variants.map(v => {
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
                                newPixels[y][x] = color as Pixel | 0;
                                return { ...l, pixels: newPixels };
                              })
                            };
                          })
                        };
                      })
                    };
                  })
                }
              : o
          )
        }), true);
        return;
      }

      // Regular layer editing
      if (x < 0 || x >= obj.gridSize.width || y < 0 || y >= obj.gridSize.height) return;

      // Skip if pixel is already the same
      const currentPixel = layer.pixels[y]?.[x];
      if (color === 0 && currentPixel === 0) return;
      if (color && currentPixel &&
          color.r === currentPixel.r &&
          color.g === currentPixel.g &&
          color.b === currentPixel.b &&
          color.a === currentPixel.a) return;

      updateProjectAndSave((project) => ({
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
                          newPixels[y][x] = color as Pixel | 0;
                          return { ...l, pixels: newPixels };
                        })
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    setPixels: (pixels) => {
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

        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  variantGroups: o.variantGroups?.map(vg => {
                    if (vg.id !== variantGroupId) return vg;
                    return {
                      ...vg,
                      variants: vg.variants.map(v => {
                        if (v.id !== variantId) return v;
                        return {
                          ...v,
                          frames: v.frames.map((f, idx) => {
                            if (idx !== frameIndex % v.frames.length) return f;
                            return {
                              ...f,
                              layers: f.layers.map((l, li) => {
                                if (li !== 0) return l;
                                const affectedRows = new Set(pixels.map(p => p.y).filter(y => y >= 0 && y < height));
                                const newPixels = [...l.pixels];
                                for (const rowY of affectedRows) {
                                  newPixels[rowY] = [...l.pixels[rowY]];
                                }
                                for (const { x, y, color } of pixels) {
                                  if (x >= 0 && x < width && y >= 0 && y < height) {
                                    newPixels[y][x] = color as Pixel | 0;
                                  }
                                }
                                return { ...l, pixels: newPixels };
                              })
                            };
                          })
                        };
                      })
                    };
                  })
                }
              : o
          )
        }), true);
        return;
      }

      // Regular layer editing
      updateProjectAndSave((project) => ({
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
                          const affectedRows = new Set(pixels.map(p => p.y).filter(y => y >= 0 && y < obj.gridSize.height));
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y, color } of pixels) {
                            if (x >= 0 && x < obj.gridSize.width && y >= 0 && y < obj.gridSize.height) {
                              newPixels[y][x] = color as Pixel | 0;
                            }
                          }
                          return { ...l, pixels: newPixels };
                        })
                      }
                    : f
                )
              }
            : o
        )
      }), true);
    },

    startDrawing: (point) => {
      // Clear color adjustment when starting to draw
      set({ isDrawing: true, drawStartPoint: point, colorAdjustment: null });
    },

    updateDrawing: (point) => {
      set({ drawStartPoint: point });
    },

    endDrawing: () => {
      set({ isDrawing: false, drawStartPoint: null, previewPixels: [] });
    },

    setPreviewPixels: (pixels) => {
      set({ previewPixels: pixels });
    },

    clearPreviewPixels: () => {
      set({ previewPixels: [] });
    },

    // Tool & color actions
    setTool: (tool) => {
      const { project } = get();
      const currentTool = project?.uiState.selectedTool;

      // When switching TO eyedropper, save the current tool
      if (tool === 'eyedropper' && currentTool && currentTool !== 'eyedropper') {
        set({ previousTool: currentTool });
      }
      // When switching away from eyedropper manually, clear previous tool
      else if (currentTool === 'eyedropper' && tool !== 'eyedropper') {
        set({ previousTool: null });
      }

      // Clear color adjustment when switching tools
      set({ colorAdjustment: null });

      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, selectedTool: tool }
      }), false);
    },

    revertToPreviousTool: () => {
      const { previousTool, project } = get();
      if (previousTool && project?.uiState.selectedTool === 'eyedropper') {
        set({ previousTool: null });
        updateProjectAndSave((project) => ({
          ...project,
          uiState: { ...project.uiState, selectedTool: previousTool }
        }), false);
      }
    },

    setColor: (color) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, selectedColor: color }
      }), false);
    },

    setColorAndAddToHistory: (color) => {
      const { colorHistory } = get();

      // Check if color already exists in history
      const existingIndex = colorHistory.findIndex(
        (c) => c.r === color.r && c.g === color.g && c.b === color.b && c.a === color.a
      );

      let newHistory: Color[];
      if (existingIndex !== -1) {
        // Move existing color to front
        newHistory = [color, ...colorHistory.filter((_, i) => i !== existingIndex)];
      } else {
        // Add new color to front, limit to MAX_COLOR_HISTORY
        newHistory = [color, ...colorHistory].slice(0, MAX_COLOR_HISTORY);
      }

      set({ colorHistory: newHistory });
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, selectedColor: color }
      }), false);
    },

    addToColorHistory: (color) => {
      const { colorHistory } = get();

      // Check if color already exists in history
      const existingIndex = colorHistory.findIndex(
        (c) => c.r === color.r && c.g === color.g && c.b === color.b && c.a === color.a
      );

      if (existingIndex !== -1) {
        // Move existing color to front
        const newHistory = [color, ...colorHistory.filter((_, i) => i !== existingIndex)];
        set({ colorHistory: newHistory });
      } else {
        // Add new color to front, limit to MAX_COLOR_HISTORY
        const newHistory = [color, ...colorHistory].slice(0, MAX_COLOR_HISTORY);
        set({ colorHistory: newHistory });
      }
    },

    setBrushSize: (size) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, brushSize: size }
      }), false);
    },

    setBitDepth: (depth) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, bitDepth: depth }
      }), false);
    },

    setShapeMode: (mode) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, shapeMode: mode }
      }), false);
    },

    setBorderRadius: (radius) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, borderRadius: Math.max(0, radius) }
      }), false);
    },

    setZoom: (zoom) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, zoom: Math.max(1, Math.min(50, zoom)) }
      }), false);
    },

    setPanOffset: (offset) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, panOffset: offset }
      }), false);
    },

    setMoveAllLayers: (moveAll) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, moveAllLayers: moveAll }
      }), false);
    },

    // Palette actions
    addPalette: (name) => {
      updateProjectAndSave((project) => ({
        ...project,
        palettes: [
          ...project.palettes,
          { id: generateId(), name, colors: [DEFAULT_COLOR] }
        ]
      }), false);
    },

    deletePalette: (id) => {
      updateProjectAndSave((project) => ({
        ...project,
        palettes: project.palettes.filter((p) => p.id !== id)
      }), false);
    },

    renamePalette: (id, name) => {
      updateProjectAndSave((project) => ({
        ...project,
        palettes: project.palettes.map((p) =>
          p.id === id ? { ...p, name } : p
        )
      }), false);
    },

    addColorToPalette: (paletteId, color) => {
      updateProjectAndSave((project) => ({
        ...project,
        palettes: project.palettes.map((p) =>
          p.id === paletteId ? { ...p, colors: [...p.colors, color] } : p
        )
      }), false);
    },

    removeColorFromPalette: (paletteId, colorIndex) => {
      updateProjectAndSave((project) => ({
        ...project,
        palettes: project.palettes.map((p) =>
          p.id === paletteId
            ? { ...p, colors: p.colors.filter((_, i) => i !== colorIndex) }
            : p
        )
      }), false);
    },

    // Reference trace actions
    setReferenceOverlayOffset: (offset) => {
      set({ referenceOverlayOffset: offset });
    },

    moveReferenceOverlay: (dx, dy) => {
      const { referenceOverlayOffset } = get();
      set({
        referenceOverlayOffset: {
          x: referenceOverlayOffset.x + dx,
          y: referenceOverlayOffset.y + dy
        }
      });
    },

    resetReferenceOverlay: () => {
      set({ referenceOverlayOffset: { x: 0, y: 0 } });
    },

    // Selection actions
    setSelection: (selection) => {
      set({ selection });
    },

    clearSelection: () => {
      set({ selection: null });
    },

    moveSelectedPixels: (dx, dy) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { selection, project } = get();
      if (!obj || !frame || !layer || !selection || !project) return;

      // Check if we're editing a variant
      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        const variantData = get().getCurrentVariant();
        if (!variantData) return;

        const { variant } = variantData;
        const { width, height } = variant.gridSize;
        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          objects: proj.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  variantGroups: o.variantGroups?.map(vg => {
                    if (vg.id !== variantGroupId) return vg;
                    return {
                      ...vg,
                      variants: vg.variants.map(v => {
                        if (v.id !== variantId) return v;
                        return {
                          ...v,
                          frames: v.frames.map((f, idx) => {
                            if (idx !== frameIndex % v.frames.length) return f;
                            return {
                              ...f,
                              layers: f.layers.map((l) => {
                                // Create new pixel grid
                                const newPixels = createEmptyPixelGrid(width, height);

                                // Copy all pixels first
                                for (let y = 0; y < height; y++) {
                                  for (let x = 0; x < width; x++) {
                                    newPixels[y][x] = l.pixels[y][x];
                                  }
                                }

                                // Clear pixels in the original selection area
                                for (let sy = selection.y; sy < selection.y + selection.height; sy++) {
                                  for (let sx = selection.x; sx < selection.x + selection.width; sx++) {
                                    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                                      newPixels[sy][sx] = 0;
                                    }
                                  }
                                }

                                // Place the selected pixels at the new position
                                for (let sy = 0; sy < selection.height; sy++) {
                                  for (let sx = 0; sx < selection.width; sx++) {
                                    const srcX = selection.x + sx;
                                    const srcY = selection.y + sy;
                                    const destX = srcX + dx;
                                    const destY = srcY + dy;

                                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                                      const pixel = l.pixels[srcY][srcX];
                                      if (destX >= 0 && destX < width && destY >= 0 && destY < height) {
                                        newPixels[destY][destX] = pixel;
                                      }
                                    }
                                  }
                                }

                                return { ...l, pixels: newPixels };
                              })
                            };
                          })
                        };
                      })
                    };
                  })
                }
              : o
          )
        }), true);

        // Move the selection box along with the pixels
        set({
          selection: {
            ...selection,
            x: selection.x + dx,
            y: selection.y + dy
          }
        });
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => ({
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

                          // Create new pixel grid
                          const newPixels = createEmptyPixelGrid(width, height);

                          // Copy all pixels first
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              newPixels[y][x] = l.pixels[y][x];
                            }
                          }

                          // Clear pixels in the original selection area
                          for (let sy = selection.y; sy < selection.y + selection.height; sy++) {
                            for (let sx = selection.x; sx < selection.x + selection.width; sx++) {
                              if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                                newPixels[sy][sx] = 0;
                              }
                            }
                          }

                          // Place the selected pixels at the new position
                          for (let sy = 0; sy < selection.height; sy++) {
                            for (let sx = 0; sx < selection.width; sx++) {
                              const srcX = selection.x + sx;
                              const srcY = selection.y + sy;
                              const destX = srcX + dx;
                              const destY = srcY + dy;

                              if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                                const pixel = l.pixels[srcY][srcX];
                                if (destX >= 0 && destX < width && destY >= 0 && destY < height) {
                                  newPixels[destY][destX] = pixel;
                                }
                              }
                            }
                          }

                          return { ...l, pixels: newPixels };
                        })
                      }
                    : f
                )
              }
            : o
        )
      }), true);

      // Move the selection box along with the pixels
      set({
        selection: {
          ...selection,
          x: selection.x + dx,
          y: selection.y + dy
        }
      });
    },

    // Color adjustment actions
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
          const affectedPixelsByFrame = new Map<string, Map<string, { x: number; y: number }[]>>();

          for (let frameIdx = 0; frameIdx < variant.frames.length; frameIdx++) {
            const variantFrame = variant.frames[frameIdx];
            const frameKey = `variant-frame-${frameIdx}`;

            for (const vLayer of variantFrame.layers) {
              const pixels: { x: number; y: number }[] = [];

              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const pixel = vLayer.pixels[y]?.[x];
                  if (pixel &&
                      pixel.r === color.r &&
                      pixel.g === color.g &&
                      pixel.b === color.b &&
                      pixel.a === color.a) {
                    pixels.push({ x, y });
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
              affectedPixelsByFrame
            }
          });
        } else {
          // Single frame mode - find pixels only in current variant frame's layer
          const affectedPixels: { x: number; y: number }[] = [];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pixel = variantLayer.pixels[y]?.[x];
              if (pixel &&
                  pixel.r === color.r &&
                  pixel.g === color.g &&
                  pixel.b === color.b &&
                  pixel.a === color.a) {
                affectedPixels.push({ x, y });
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: false,
              affectedPixels
            }
          });
        }
      } else {
        // Regular layer editing mode
        const { width, height } = obj.gridSize;

        if (allFrames) {
          // Find all pixels across all frames with matching layer names
          const affectedPixelsByFrame = new Map<string, Map<string, { x: number; y: number }[]>>();

          for (const frame of obj.frames) {
            // Find layers with the same name as the current layer
            const matchingLayers = frame.layers.filter(l => l.name === layer.name);

            for (const matchingLayer of matchingLayers) {
              const pixels: { x: number; y: number }[] = [];

              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const pixel = matchingLayer.pixels[y]?.[x];
                  if (pixel &&
                      pixel.r === color.r &&
                      pixel.g === color.g &&
                      pixel.b === color.b &&
                      pixel.a === color.a) {
                    pixels.push({ x, y });
                  }
                }
              }

              if (pixels.length > 0) {
                if (!affectedPixelsByFrame.has(frame.id)) {
                  affectedPixelsByFrame.set(frame.id, new Map());
                }
                affectedPixelsByFrame.get(frame.id)!.set(matchingLayer.id, pixels);
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: true,
              affectedPixels: [], // Not used in all-frames mode
              affectedPixelsByFrame
            }
          });
        } else {
          // Single frame mode - find pixels only in current layer
          const affectedPixels: { x: number; y: number }[] = [];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pixel = layer.pixels[y]?.[x];
              if (pixel &&
                  pixel.r === color.r &&
                  pixel.g === color.g &&
                  pixel.b === color.b &&
                  pixel.a === color.a) {
                affectedPixels.push({ x, y });
              }
            }
          }

          set({
            colorAdjustment: {
              originalColor: color,
              allFrames: false,
              affectedPixels
            }
          });
        }
      }

      // Also set the color picker to this color
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, selectedColor: color }
      }), false);
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
        const { variant, variantGroup } = variantData;
        const variantGroupId = layer.variantGroupId!;
        const variantId = layer.selectedVariantId!;

        if (colorAdjustment.allFrames && colorAdjustment.affectedPixelsByFrame) {
          // All frames mode - update pixels across all variant frames
          updateProjectAndSave((project) => ({
            ...project,
            objects: project.objects.map((o) =>
              o.id === obj.id
                ? {
                    ...o,
                    variantGroups: o.variantGroups?.map(vg => {
                      if (vg.id !== variantGroupId) return vg;
                      return {
                        ...vg,
                        variants: vg.variants.map(v => {
                          if (v.id !== variantId) return v;
                          return {
                            ...v,
                            frames: v.frames.map((vf, frameIdx) => {
                              const frameKey = `variant-frame-${frameIdx}`;
                              const framePixels = colorAdjustment.affectedPixelsByFrame!.get(frameKey);
                              if (!framePixels) return vf;

                              return {
                                ...vf,
                                layers: vf.layers.map((vl) => {
                                  const layerPixels = framePixels.get(vl.id);
                                  if (!layerPixels || layerPixels.length === 0) return vl;

                                  // Only copy affected rows
                                  const affectedRows = new Set(layerPixels.map(p => p.y));
                                  const newPixels = [...vl.pixels];
                                  for (const rowY of affectedRows) {
                                    newPixels[rowY] = [...vl.pixels[rowY]];
                                  }
                                  for (const { x, y } of layerPixels) {
                                    newPixels[y][x] = newColor as Pixel | 0;
                                  }
                                  return { ...vl, pixels: newPixels };
                                })
                              };
                            })
                          };
                        })
                      };
                    })
                  }
                : o
            ),
            uiState: { ...project.uiState, selectedColor: newColor }
          }), trackHistory);
        } else {
          // Single frame mode - update only current variant frame's layer
          const { project } = get();
          const frameIndex = project?.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
          updateProjectAndSave((project) => ({
            ...project,
            objects: project.objects.map((o) =>
              o.id === obj.id
                ? {
                    ...o,
                    variantGroups: o.variantGroups?.map(vg => {
                      if (vg.id !== variantGroupId) return vg;
                      return {
                        ...vg,
                        variants: vg.variants.map(v => {
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
                                  const affectedRows = new Set(colorAdjustment.affectedPixels.map(p => p.y));
                                  const newPixels = [...vl.pixels];
                                  for (const rowY of affectedRows) {
                                    newPixels[rowY] = [...vl.pixels[rowY]];
                                  }
                                  for (const { x, y } of colorAdjustment.affectedPixels) {
                                    newPixels[y][x] = newColor as Pixel | 0;
                                  }
                                  return { ...vl, pixels: newPixels };
                                })
                              };
                            })
                          };
                        })
                      };
                    })
                  }
                : o
            ),
            uiState: { ...project.uiState, selectedColor: newColor }
          }), trackHistory);
        }
      } else {
        // Regular layer editing mode
        if (colorAdjustment.allFrames && colorAdjustment.affectedPixelsByFrame) {
          // All frames mode - update pixels across all frames
          updateProjectAndSave((project) => ({
            ...project,
            objects: project.objects.map((o) =>
              o.id === obj.id
                ? {
                    ...o,
                    frames: o.frames.map((f) => {
                      const framePixels = colorAdjustment.affectedPixelsByFrame!.get(f.id);
                      if (!framePixels) return f;

                      return {
                        ...f,
                        layers: f.layers.map((l) => {
                          const layerPixels = framePixels.get(l.id);
                          if (!layerPixels || layerPixels.length === 0) return l;

                          // Only copy affected rows
                          const affectedRows = new Set(layerPixels.map(p => p.y));
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y } of layerPixels) {
                            newPixels[y][x] = newColor as Pixel | 0;
                          }
                          return { ...l, pixels: newPixels };
                        })
                      };
                    })
                  }
                : o
            ),
            uiState: { ...project.uiState, selectedColor: newColor }
          }), trackHistory);
        } else {
          // Single frame mode - update only current layer
          updateProjectAndSave((project) => ({
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
                              const affectedRows = new Set(colorAdjustment.affectedPixels.map(p => p.y));
                              const newPixels = [...l.pixels];
                              for (const rowY of affectedRows) {
                                newPixels[rowY] = [...l.pixels[rowY]];
                              }
                              for (const { x, y } of colorAdjustment.affectedPixels) {
                                newPixels[y][x] = newColor as Pixel | 0;
                              }
                              return { ...l, pixels: newPixels };
                            })
                          }
                        : f
                    )
                  }
                : o
            ),
            uiState: { ...project.uiState, selectedColor: newColor }
          }), trackHistory);
        }
      }
    },

    saveCurrentStateToHistory: () => {
      saveCurrentStateToHistory();
    },

    // Variant actions
    makeVariant: (layerId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      // Find the layer to convert
      const currentFrame = get().getCurrentFrame();
      if (!currentFrame) return;

      const layerToConvert = currentFrame.layers.find(l => l.id === layerId);
      if (!layerToConvert || layerToConvert.isVariant) return;

      const layerName = layerToConvert.name;
      const { width: objWidth, height: objHeight } = obj.gridSize;

      // Collect all pixels from all frames for layers with this name
      const framesPixelData: { frameId: string; layerIds: string[]; pixels: (Pixel | 0)[][]; frameMinX: number; frameMinY: number; frameMaxX: number; frameMaxY: number }[] = [];

      // First pass: collect pixel data and calculate per-frame bounding boxes
      let maxFrameWidth = 0;
      let maxFrameHeight = 0;
      let hasPixels = false;

      for (const frame of obj.frames) {
        const matchingLayers = frame.layers.filter(l => l.name === layerName);
        if (matchingLayers.length === 0) {
          // No matching layers in this frame, but we still need an entry
          framesPixelData.push({
            frameId: frame.id,
            layerIds: [],
            pixels: createEmptyPixelGrid(objWidth, objHeight),
            frameMinX: 0,
            frameMinY: 0,
            frameMaxX: 0,
            frameMaxY: 0
          });
          continue;
        }

        // Combine all matching layers' pixels
        const combinedPixels = createEmptyPixelGrid(objWidth, objHeight);
        let frameMinX = objWidth, frameMinY = objHeight, frameMaxX = 0, frameMaxY = 0;
        let frameHasPixels = false;

        for (const layer of matchingLayers) {
          for (let y = 0; y < objHeight; y++) {
            for (let x = 0; x < objWidth; x++) {
              const pixel = layer.pixels[y]?.[x];
              if (pixel && pixel.a > 0) {
                combinedPixels[y][x] = pixel;
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
          layerIds: matchingLayers.map(l => l.id),
          pixels: combinedPixels,
          frameMinX: frameHasPixels ? frameMinX : 0,
          frameMinY: frameHasPixels ? frameMinY : 0,
          frameMaxX: frameHasPixels ? frameMaxX : 0,
          frameMaxY: frameHasPixels ? frameMaxY : 0
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
      const baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } } = {};

      for (let i = 0; i < obj.frames.length; i++) {
        const frame = obj.frames[i];
        const frameData = framesPixelData.find(f => f.frameId === frame.id);

        if (!frameData) {
          // Fallback: create empty frame with default offset
          variantFrames.push({
            id: generateId(),
            layers: [{
              id: generateId(),
              name: 'Layer 1',
              pixels: createEmptyPixelGrid(variantWidth, variantHeight),
              visible: true
            }]
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

        if (frameData.frameMaxX >= frameData.frameMinX && frameData.frameMaxY >= frameData.frameMinY) {
          // Position pixels at the top-left of the variant grid
          // The offset will preserve their position relative to the parent object
          for (let y = 0; y < frameHeight; y++) {
            for (let x = 0; x < frameWidth; x++) {
              const srcX = frameData.frameMinX + x;
              const srcY = frameData.frameMinY + y;
              const pixel = frameData.pixels[srcY]?.[srcX];
              if (pixel && pixel.a > 0) {
                // Place pixels starting at (0, 0) in variant grid
                // The offset preserves the original position relative to parent
                if (x < variantWidth && y < variantHeight) {
                  variantPixels[y][x] = pixel;
                }
              }
            }
          }
        }

        variantFrames.push({
          id: generateId(),
          layers: [{
            id: generateId(),
            name: 'Layer 1',
            pixels: variantPixels,
            visible: true
          }]
        });
      }

      const variantGroupId = generateId();
      const variantId = generateId();

      const newVariant: Variant = {
        id: variantId,
        name: layerName,
        gridSize: { width: variantWidth, height: variantHeight },
        frames: variantFrames,
        baseFrameOffsets
      };

      const newVariantGroup: VariantGroup = {
        id: variantGroupId,
        name: layerName,
        variants: [newVariant]
      };

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;

          // Add variant group to object
          const variantGroups = [...(o.variantGroups ?? []), newVariantGroup];

          // Update frames: remove original layers with matching name, add variant layer
          return {
            ...o,
            variantGroups,
            frames: o.frames.map(f => {
              // Remove all layers with matching name
              const filteredLayers = f.layers.filter(l => l.name !== layerName);

              // Add variant layer (one per frame, referencing the variant group)
              const variantLayer: Layer = {
                id: generateId(),
                name: layerName,
                pixels: createEmptyPixelGrid(objWidth, objHeight), // Not used for rendering
                visible: true,
                isVariant: true,
                variantGroupId,
                selectedVariantId: variantId
              };

              return {
                ...f,
                layers: [...filteredLayers, variantLayer]
              };
            })
          };
        }),
        uiState: {
          ...project.uiState,
          variantFrameIndices: {
            ...project.uiState.variantFrameIndices,
            [variantGroupId]: 0
          }
        }
      }), true);
    },

    addVariant: (variantGroupId: string, copyFromVariantId?: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      let newVariant: Variant;

      if (copyFromVariantId) {
        // Copy from existing variant
        const sourceVariant = variantGroup.variants.find(v => v.id === copyFromVariantId);
        if (!sourceVariant) return;

        newVariant = {
          id: generateId(),
          name: `${sourceVariant.name} Copy`,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map(f => ({
            id: generateId(),
            layers: f.layers.map(l => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map(row => [...row])
            }))
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets }
        };
      } else {
        // Create empty variant
        const templateVariant = variantGroup.variants[0];
        newVariant = {
          id: generateId(),
          name: `${variantGroup.name} ${variantGroup.variants.length + 1}`,
          gridSize: { ...templateVariant.gridSize },
          frames: templateVariant.frames.map(f => ({
            id: generateId(),
            layers: [{
              id: generateId(),
              name: 'Layer 1',
              pixels: createEmptyPixelGrid(templateVariant.gridSize.width, templateVariant.gridSize.height),
              visible: true
            }]
          })),
          baseFrameOffsets: { ...templateVariant.baseFrameOffsets }
        };
      }

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            variantGroups: o.variantGroups?.map(vg => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: [...vg.variants, newVariant]
              };
            })
          };
        })
      }), true);
    },

    deleteVariant: (variantGroupId: string, variantId: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup || variantGroup.variants.length <= 1) return; // Can't delete last variant

      const remainingVariants = variantGroup.variants.filter(v => v.id !== variantId);
      const newSelectedId = remainingVariants[0].id;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            variantGroups: o.variantGroups?.map(vg => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: remainingVariants
              };
            }),
            // Update variant layers to select first remaining variant if they had the deleted one
            frames: o.frames.map(f => ({
              ...f,
              layers: f.layers.map(l => {
                if (l.isVariant && l.variantGroupId === variantGroupId && l.selectedVariantId === variantId) {
                  return { ...l, selectedVariantId: newSelectedId };
                }
                return l;
              })
            }))
          };
        })
      }), true);
    },

    selectVariant: (layerId: string, variantId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the variant layer to get its variantGroupId
      const variantLayer = frame.layers.find(l => l.id === layerId && l.isVariant);
      if (!variantLayer || !variantLayer.variantGroupId) return;

      const variantGroupId = variantLayer.variantGroupId;

      // Update ALL variant layers across ALL frames that share this variantGroupId
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            frames: o.frames.map(f => ({
              ...f,
              layers: f.layers.map(l => {
                // Update all variant layers that belong to the same variant group
                if (l.isVariant && l.variantGroupId === variantGroupId) {
                  return { ...l, selectedVariantId: variantId };
                }
                return l;
              })
            }))
          };
        })
      }), false);
    },

    renameVariant: (variantGroupId: string, variantId: string, name: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            variantGroups: o.variantGroups?.map(vg => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: vg.variants.map(v => {
                  if (v.id !== variantId) return v;
                  return { ...v, name };
                })
              };
            })
          };
        })
      }), true);
    },

    resizeVariant: (variantGroupId: string, variantId: string, width: number, height: number) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            variantGroups: o.variantGroups?.map(vg => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: vg.variants.map(v => {
                  if (v.id !== variantId) return v;

                  const oldWidth = v.gridSize.width;
                  const oldHeight = v.gridSize.height;

                  return {
                    ...v,
                    gridSize: { width, height },
                    frames: v.frames.map(f => ({
                      ...f,
                      layers: f.layers.map(l => {
                        const newPixels = createEmptyPixelGrid(width, height);
                        for (let y = 0; y < Math.min(oldHeight, height); y++) {
                          for (let x = 0; x < Math.min(oldWidth, width); x++) {
                            newPixels[y][x] = l.pixels[y]?.[x] ?? 0;
                          }
                        }
                        return { ...l, pixels: newPixels };
                      })
                    }))
                  };
                })
              };
            })
          };
        })
      }), true);
    },

    setVariantOffset: (dx: number, dy: number) => {
      const obj = get().getCurrentObject();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !layer || !project || !layer.isVariant || !layer.variantGroupId) return;

      const variantGroupId = layer.variantGroupId;
      const variantId = layer.selectedVariantId;
      // Get the current base frame index (not variant frame index)
      const currentFrameId = project.uiState.selectedFrameId;
      const baseFrameIndex = obj.frames.findIndex(f => f.id === currentFrameId);
      if (baseFrameIndex < 0) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            variantGroups: o.variantGroups?.map(vg => {
              if (vg.id !== variantGroupId) return vg;
              return {
                ...vg,
                variants: vg.variants.map(v => {
                  if (v.id !== variantId) return v;
                  // Update offset for the current base frame
                  const currentOffset = v.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 };
                  return {
                    ...v,
                    baseFrameOffsets: {
                      ...v.baseFrameOffsets,
                      [baseFrameIndex]: {
                        x: currentOffset.x + dx,
                        y: currentOffset.y + dy
                      }
                    }
                  };
                })
              };
            })
          };
        })
      }), true);
    },

    selectVariantFrame: (variantGroupId: string, frameIndex: number) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const currentLayer = get().getCurrentLayer();
      const isEditingVariant = currentLayer?.isVariant === true && currentLayer?.variantGroupId === variantGroupId;

      // Sync base frame to match variant frame index
      const baseFrameCount = obj.frames.length;
      let newBaseFrameId = project.uiState.selectedFrameId;
      let newLayerId = project.uiState.selectedLayerId;

      if (baseFrameCount > 0) {
        // Map variant frame index to base frame index (wrap if needed)
        const baseFrameIndex = frameIndex % baseFrameCount;
        const targetFrame = obj.frames[baseFrameIndex];
        if (targetFrame) {
          newBaseFrameId = targetFrame.id;

          // If editing a variant, ensure the variant layer stays selected in the new frame
          if (isEditingVariant && currentLayer) {
            const variantLayer = targetFrame.layers.find(
              (l) => l.isVariant && l.variantGroupId === variantGroupId
            );
            if (variantLayer) {
              newLayerId = variantLayer.id;
            }
          }
        }
      }

      updateProjectAndSave((project) => ({
        ...project,
        uiState: {
          ...project.uiState,
          selectedFrameId: newBaseFrameId,
          selectedLayerId: newLayerId ?? project.uiState.selectedLayerId,
          variantFrameIndices: {
            ...project.uiState.variantFrameIndices,
            [variantGroupId]: frameIndex
          }
        }
      }), false);
    },

    advanceVariantFrames: (delta: number) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      // Advance all variant frame indices by delta (with wrapping)
      const newIndices: { [key: string]: number } = {};
      const currentIndices = project.uiState.variantFrameIndices ?? {};

      for (const vg of obj.variantGroups ?? []) {
        const currentIdx = currentIndices[vg.id] ?? 0;
        // Get max frames from first variant (they should all have same count)
        const maxFrames = vg.variants[0]?.frames.length ?? 1;
        const newIdx = (currentIdx + delta + maxFrames * Math.abs(delta)) % maxFrames;
        newIndices[vg.id] = newIdx;
      }

      updateProjectAndSave((project) => ({
        ...project,
        uiState: {
          ...project.uiState,
          variantFrameIndices: {
            ...project.uiState.variantFrameIndices,
            ...newIndices
          }
        }
      }), false);
    },

    duplicateVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(v => v.id === variantId);
      if (!variant) return;

      const sourceFrame = variant.frames.find(f => f.id === frameId);
      if (!sourceFrame) return;

      updateProjectAndSave((project) => {
        const newFrameId = generateId();
        const newFrame: VariantFrame = {
          id: newFrameId,
          layers: sourceFrame.layers.map((l) => ({
            ...l,
            id: generateId(),
            pixels: l.pixels.map((row) => [...row])
          }))
        };

        const frameIndex = variant.frames.findIndex(f => f.id === frameId);
        const newFrames = [...variant.frames];
        newFrames.splice(frameIndex + 1, 0, newFrame);

        return {
          ...project,
          objects: project.objects.map(o => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              variantGroups: o.variantGroups?.map(vg => {
                if (vg.id !== variantGroupId) return vg;
                return {
                  ...vg,
                  variants: vg.variants.map(v => {
                    if (v.id !== variantId) return v;
                    return {
                      ...v,
                      frames: newFrames
                    };
                  })
                };
              })
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: frameIndex + 1
            }
          }
        };
      }, true);
    },

    deleteVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(v => v.id === variantId);
      if (!variant || variant.frames.length <= 1) return; // Can't delete last frame

      updateProjectAndSave((project) => {
        const frameIndex = variant.frames.findIndex(f => f.id === frameId);
        const newFrames = variant.frames.filter(f => f.id !== frameId);

        // Select the previous frame if possible, otherwise the first one
        const newSelectedIndex = Math.max(0, frameIndex - 1);

        return {
          ...project,
          objects: project.objects.map(o => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              variantGroups: o.variantGroups?.map(vg => {
                if (vg.id !== variantGroupId) return vg;
                return {
                  ...vg,
                  variants: vg.variants.map(v => {
                    if (v.id !== variantId) return v;
                    return {
                      ...v,
                      frames: newFrames
                    };
                  })
                };
              })
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: newSelectedIndex
            }
          }
        };
      }, true);
    },

    addVariantFrame: (variantGroupId: string, variantId: string, copyPrevious: boolean = true) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(v => v.id === variantId);
      if (!variant) return;

      updateProjectAndSave((project) => {
        const currentFrameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
        const currentFrame = variant.frames[currentFrameIndex];

        let newFrame: VariantFrame;
        if (copyPrevious && currentFrame) {
          // Copy from current frame
          newFrame = {
            id: generateId(),
            layers: currentFrame.layers.map(l => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map(row => [...row])
            }))
          };
        } else {
          // Create empty frame
          newFrame = {
            id: generateId(),
            layers: [{
              id: generateId(),
              name: 'Layer 1',
              pixels: createEmptyPixelGrid(variant.gridSize.width, variant.gridSize.height),
              visible: true
            }]
          };
        }

        const newFrames = [...variant.frames];
        newFrames.splice(currentFrameIndex + 1, 0, newFrame);

        return {
          ...project,
          objects: project.objects.map(o => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              variantGroups: o.variantGroups?.map(vg => {
                if (vg.id !== variantGroupId) return vg;
                return {
                  ...vg,
                  variants: vg.variants.map(v => {
                    if (v.id !== variantId) return v;
                    return {
                      ...v,
                      frames: newFrames
                    };
                  })
                };
              })
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: currentFrameIndex + 1
            }
          }
        };
      }, true);
    },

    moveVariantFrame: (variantGroupId: string, variantId: string, frameId: string, direction: 'left' | 'right') => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      const variant = variantGroup.variants.find(v => v.id === variantId);
      if (!variant) return;

      const frameIndex = variant.frames.findIndex(f => f.id === frameId);
      if (frameIndex === -1) return;

      const newIndex = direction === 'left' ? frameIndex - 1 : frameIndex + 1;
      if (newIndex < 0 || newIndex >= variant.frames.length) return;

      updateProjectAndSave((project) => {
        const newFrames = [...variant.frames];
        const [movedFrame] = newFrames.splice(frameIndex, 1);
        newFrames.splice(newIndex, 0, movedFrame);

        return {
          ...project,
          objects: project.objects.map(o => {
            if (o.id !== obj.id) return o;
            return {
              ...o,
              variantGroups: o.variantGroups?.map(vg => {
                if (vg.id !== variantGroupId) return vg;
                return {
                  ...vg,
                  variants: vg.variants.map(v => {
                    if (v.id !== variantId) return v;
                    return {
                      ...v,
                      frames: newFrames
                    };
                  })
                };
              })
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [variantGroupId]: newIndex
            }
          }
        };
      }, true);
    },

    // Helpers
    getCurrentObject: () => {
      const { project } = get();
      if (!project) return null;
      return project.objects.find((o) => o.id === project.uiState.selectedObjectId) ?? null;
    },

    getCurrentFrame: () => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return null;
      return obj.frames.find((f) => f.id === project.uiState.selectedFrameId) ?? null;
    },

    getCurrentLayer: () => {
      const frame = get().getCurrentFrame();
      const { project } = get();
      if (!frame || !project) return null;
      return frame.layers.find((l) => l.id === project.uiState.selectedLayerId) ?? null;
    },

    getCurrentVariant: () => {
      const obj = get().getCurrentObject();
      const layer = get().getCurrentLayer();
      const { project } = get();

      if (!obj || !layer || !project || !layer.isVariant || !layer.variantGroupId) return null;

      const variantGroup = obj.variantGroups?.find(vg => vg.id === layer.variantGroupId);
      if (!variantGroup) return null;

      const variant = variantGroup.variants.find(v => v.id === layer.selectedVariantId);
      if (!variant) return null;

      const variantFrameIndex = project.uiState.variantFrameIndices?.[variantGroup.id] ?? 0;
      const variantFrame = variant.frames[variantFrameIndex % variant.frames.length];

      // Get the current base frame index for the offset
      const currentFrameId = project.uiState.selectedFrameId;
      const baseFrameIndex = obj.frames.findIndex(f => f.id === currentFrameId);
      const offset = variant.baseFrameOffsets?.[baseFrameIndex >= 0 ? baseFrameIndex : 0] ?? { x: 0, y: 0 };

      return { variantGroup, variant, variantFrame, baseFrameIndex, offset };
    },

    getSelectedVariantLayer: () => {
      const variantData = get().getCurrentVariant();
      if (!variantData) return null;
      return variantData.variantFrame.layers[0] ?? null;
    },

    isEditingVariant: () => {
      const layer = get().getCurrentLayer();
      return layer?.isVariant === true;
    }
  };
});
