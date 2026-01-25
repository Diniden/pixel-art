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
  selectFrame: (id: string) => void;
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
  adjustColor: (newColor: Color) => void;

  // Helpers
  getCurrentObject: () => PixelObject | null;
  getCurrentFrame: () => Frame | null;
  getCurrentLayer: () => Layer | null;
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

    selectFrame: (id) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const currentLayer = get().getCurrentLayer();
      const frame = obj.frames.find((f) => f.id === id);

      // Try to find a layer with the same name in the new frame
      let newLayerId = frame?.layers[0]?.id;
      if (frame && currentLayer) {
        const matchingLayer = frame.layers.find((l) => l.name === currentLayer.name);
        if (matchingLayer) {
          newLayerId = matchingLayer.id;
        }
      }

      updateProjectAndSave((project) => ({
        ...project,
        uiState: {
          ...project.uiState,
          selectedFrameId: id,
          selectedLayerId: newLayerId ?? project.uiState.selectedLayerId
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
      if (!obj || !frame || !layer) return;

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
      if (!obj || !frame || !layer || pixels.length === 0) return;

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
      const { selection } = get();
      if (!obj || !frame || !layer || !selection) return;

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

      // Also set the color picker to this color
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, selectedColor: color }
      }), false);
    },

    clearColorAdjustment: () => {
      set({ colorAdjustment: null });
    },

    adjustColor: (newColor: Color) => {
      const { colorAdjustment } = get();
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      if (!colorAdjustment || !obj || !frame || !layer) return;

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
        }), true);
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
        }), true);
      }
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
    }
  };
});
