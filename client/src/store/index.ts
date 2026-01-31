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
  StudioMode,
  Point,
  Pixel,
  PixelData,
  Normal,
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
  DEFAULT_COLOR,
  DEFAULT_NORMAL,
  DEFAULT_LIGHT_DIRECTION,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_AMBIENT_COLOR,
  projectToCompact,
  compactToProject
} from '../types';
import { loadProject } from '../services/api';
import { scheduleAutoSave, setOnSaveStatusChange } from '../services/autoSave';
import { blendPixels } from '../utils/alphaBlend';

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

// Clipboard for copying layers/variants between objects
export interface LayerClipboard {
  type: 'layer' | 'variant';
  // For regular layers: pixel data for each frame (indexed by frame position)
  layerFrames?: {
    name: string;
    pixels: PixelData[][];
    visible: boolean;
  }[];
  // Frame index when the copy was made (for current-frame-only paste)
  sourceFrameIndex?: number;
  // For variants: the complete variant group and variant data
  variantGroup?: VariantGroup;
  variantId?: string;
}

// Clipboard for timeline cell copy/paste
export interface TimelineCellClipboard {
  layerName: string;
  pixels: PixelData[][];
  // Variant layer information (if the copied layer was a variant)
  isVariant?: boolean;
  variantGroupId?: string;
  selectedVariantId?: string;
  variantOffset?: { x: number; y: number };
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

  // Frame trace mode state
  frameTraceActive: boolean;
  frameTraceFrameIndex: number | null;
  frameOverlayOffset: { x: number; y: number };

  // Frame reference panel - can reference a different object than currently selected
  frameReferenceObjectId: string | null;

  // Color history (last 10 colors used)
  colorHistory: Color[];

  // Previous tool (for eyedropper revert)
  previousTool: Tool | null;

  // Selection box
  selection: SelectionBox | null;

  // Color adjustment mode
  colorAdjustment: ColorAdjustmentState | null;

  // Layer clipboard for copy/paste
  layerClipboard: LayerClipboard | null;

  // Timeline cell clipboard for timeline view copy/paste
  timelineCellClipboard: TimelineCellClipboard | null;

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
  moveLayerAcrossAllFrames: (layerId: string, direction: 'up' | 'down') => void;
  deleteLayerAcrossAllFrames: (layerId: string) => void;
  squashLayerDown: (layerId: string) => void;
  squashLayerUp: (layerId: string) => void;
  squashLayerDownAcrossAllFrames: (layerId: string) => void;
  squashLayerUpAcrossAllFrames: (layerId: string) => void;
  moveLayerPixels: (dx: number, dy: number) => void;

  // Layer copy/paste actions
  copyLayerToClipboard: (layerId: string) => void;
  pasteLayerFromClipboard: (currentFrameOnly?: boolean) => void;
  copyLayerFromObject: (sourceObjectId: string, sourceLayerId: string, isVariant: boolean, variantGroupId?: string, variantId?: string) => void;

  // Timeline view actions
  addLayerToAllFrames: (name: string) => void;
  addLayerToFrameAtPosition: (frameId: string, name: string, position: number, variantInfo?: { isVariant?: boolean; variantGroupId?: string; selectedVariantId?: string; variantOffset?: { x: number; y: number } }) => string; // Returns layerId
  deleteLayerFromFrame: (frameId: string, layerId: string) => void;
  reorderLayerInFrame: (frameId: string, layerId: string, newIndex: number) => void;
  copyTimelineCell: (frameId: string, layerId: string) => void;
  pasteTimelineCell: (frameId: string, targetLayerId: string) => void;

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
  setEraserShape: (shape: 'circle' | 'square') => void;
  setNormalBrushShape: (shape: 'circle' | 'square') => void;
  setBitDepth: (depth: BitDepth) => void;
  setShapeMode: (mode: ShapeMode) => void;
  setBorderRadius: (radius: number) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setMoveAllLayers: (moveAll: boolean) => void;
  setFrameReferencePanelPosition: (position: { topPercent: number; leftPercent: number }) => void;
  setFrameReferencePanelMinimized: (minimized: boolean) => void;
  setReferenceImagePanelPosition: (position: { topPercent: number; leftPercent: number }) => void;
  setReferenceImagePanelMinimized: (minimized: boolean) => void;
  setCanvasInfoHidden: (hidden: boolean) => void;

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
  setReferenceImage: (referenceImage: { imageBase64: string; selectionBox: { startX: number; startY: number; endX: number; endY: number } } | undefined) => void;

  // Frame trace actions
  setFrameTraceActive: (active: boolean, frameIndex: number | null) => void;
  moveFrameOverlay: (dx: number, dy: number) => void;
  resetFrameOverlay: () => void;

  // Frame reference object actions
  setFrameReferenceObjectId: (objectId: string | null) => void;
  getFrameReferenceObject: () => PixelObject | null;

  // Selection actions
  setSelection: (selection: SelectionBox | null) => void;
  clearSelection: () => void;
  moveSelectedPixels: (dx: number, dy: number) => void;

  // Color adjustment actions
  startColorAdjustment: (color: Color, allFrames: boolean) => void;
  clearColorAdjustment: () => void;
  adjustColor: (newColor: Color, trackHistory?: boolean) => void;
  saveCurrentStateToHistory: () => void;

  // Variant actions
  makeVariant: (layerId: string) => void;
  addVariant: (variantGroupId: string, copyFromVariantId?: string) => void;
  deleteVariant: (variantGroupId: string, variantId: string) => void;
  deleteVariantGroup: (variantGroupId: string) => void;
  selectVariant: (layerId: string, variantId: string) => void;
  renameVariant: (variantGroupId: string, variantId: string, name: string) => void;
  renameVariantGroup: (variantGroupId: string, name: string) => void;
  resizeVariant: (variantGroupId: string, variantId: string, width: number, height: number) => void;
  setVariantOffset: (dx: number, dy: number, allFrames?: boolean) => void;
  selectVariantFrame: (variantGroupId: string, frameIndex: number) => void;
  advanceVariantFrames: (delta: number) => void;
  duplicateVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => void;
  deleteVariantFrame: (variantGroupId: string, variantId: string, frameId: string) => void;
  addVariantFrame: (variantGroupId: string, variantId: string, copyPrevious?: boolean) => void;
  moveVariantFrame: (variantGroupId: string, variantId: string, frameId: string, direction: 'left' | 'right') => void;
  // New variant layer management
  addVariantLayerFromExisting: (variantGroupId: string, selectedVariantId: string, addToAllFrames: boolean) => void;
  removeVariantLayer: (layerId: string) => void;

  // Lighting studio actions
  setStudioMode: (mode: StudioMode) => void;
  setSelectedNormal: (normal: Normal) => void;
  setLightDirection: (normal: Normal) => void;
  setLightColor: (color: Color) => void;
  setAmbientColor: (color: Color) => void;
  setNormalPixel: (x: number, y: number, normal: Normal | 0) => void;
  setNormalPixels: (pixels: { x: number; y: number; normal: Normal | 0 }[]) => void;
  setHeightPixels: (pixels: { x: number; y: number; height: number }[]) => void;
  setHeightScale: (scale: number) => void;
  flipHorizontal: () => void;
  flipVertical: () => void;

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
      // Deep clone the current project before saving to history
      // This ensures history entries are completely independent
      const compactProject = projectToCompact(project);
      const clonedProject = compactToProject(compactProject);

      // Add current project to history before making the change
      const newHistory = [...projectHistory.slice(0, historyIndex + 1), clonedProject];
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

    // Deep clone the current project before saving to history
    // This ensures history entries are completely independent
    const compactProject = projectToCompact(project);
    const clonedProject = compactToProject(compactProject);

    const newHistory = [...projectHistory.slice(0, historyIndex + 1), clonedProject];
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
    frameTraceActive: false,
    frameTraceFrameIndex: null,
    frameOverlayOffset: { x: 0, y: 0 },
    frameReferenceObjectId: null,
    colorHistory: [],
    previousTool: null,
    selection: null,
    colorAdjustment: null,
    layerClipboard: null,
    timelineCellClipboard: null,

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
      // Deep clone when restoring to ensure complete independence
      const compactProject = projectToCompact(previousProject);
      const clonedProject = compactToProject(compactProject);
      const newIndex = historyIndex - 1;

      set({
        project: clonedProject,
        historyIndex: newIndex
      });
      scheduleAutoSave(clonedProject);
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

          // Calculate padding to center the content
          // For odd differences, bias to the right and down
          const widthDiff = width - oldWidth;
          const heightDiff = height - oldHeight;

          const leftPadding = Math.floor(widthDiff / 2);
          const topPadding = Math.floor(heightDiff / 2);

          // Resize all frames with centered pixels and adjust variant layer offsets
          const newFrames = obj.frames.map((frame) => ({
            ...frame,
            layers: frame.layers.map((layer) => {
              const newPixels = createEmptyPixelGrid(width, height);
              // Copy existing pixels with centering offset
              for (let y = 0; y < oldHeight; y++) {
                for (let x = 0; x < oldWidth; x++) {
                  const newX = x + leftPadding;
                  const newY = y + topPadding;
                  if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
                    newPixels[newY][newX] = layer.pixels[y]?.[x] ?? 0;
                  }
                }
              }

              // Adjust variant layer offset when the object is resized
              // When pixels are added to the left/top, adjust offset to keep variant in same visual position
              if (layer.isVariant && layer.variantOffset) {
                return {
                  ...layer,
                  pixels: newPixels,
                  variantOffset: {
                    x: layer.variantOffset.x - leftPadding,
                    y: layer.variantOffset.y - topPadding
                  }
                };
              }

              return { ...layer, pixels: newPixels };
            })
          }));

          return {
            ...obj,
            gridSize: { width, height },
            frames: newFrames
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
      } else if (frame && frame.layers && frame.layers.length > 0) {
        newLayerId = frame.layers[0].id;
      }

      // Sync variant frame indices with base frame index (only if syncVariants is true)
      // We need to look at each variant layer in the target frame to determine the correct
      // frame count based on the layer's selectedVariantId, not just the first variant
      const newVariantFrameIndices: { [key: string]: number } = {};
      if (syncVariants && project?.variants && baseFrameIndex >= 0 && frame) {
        for (const vg of project.variants) {
          // Find the variant layer in the target frame for this variant group
          const variantLayer = frame.layers.find(
            (l) => l.isVariant && l.variantGroupId === vg.id
          );

          // Get the selected variant's frame count (use the layer's selectedVariantId)
          let variantFrameCount = 1;
          if (variantLayer?.selectedVariantId) {
            const selectedVariant = vg.variants.find(v => v.id === variantLayer.selectedVariantId);
            variantFrameCount = selectedVariant?.frames.length ?? 1;
          } else {
            // Fallback to first variant if no layer found
            variantFrameCount = vg.variants[0]?.frames.length ?? 1;
          }

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

      const sourceFrameIndex = obj.frames.findIndex((f) => f.id === id);
      if (sourceFrameIndex === -1) return;
      const sourceFrame = obj.frames[sourceFrameIndex];

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
          objects: project.objects.map((o) => {
            if (o.id !== obj.id) return o;
            const newFrames = [...o.frames];
            newFrames.splice(sourceFrameIndex + 1, 0, newFrame);
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
          selectedLayerId: id,
          // Increment counter on every layer click (even re-selection) to allow
          // detecting layer clicks vs frame switches
          layerSelectionCounter: (project.uiState.layerSelectionCounter ?? 0) + 1
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

    moveLayerAcrossAllFrames: (layerId, direction) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the layer's index in the current frame
      const currentLayerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (currentLayerIndex === -1) return;

      // Calculate target index
      const targetIndex = direction === 'up' ? currentLayerIndex + 1 : currentLayerIndex - 1;

      // Check bounds - if can't move in current frame, can't move in any frame
      if (targetIndex < 0 || targetIndex >= frame.layers.length) return;

      // Move layer at the same index position in all frames
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) =>
          o.id === obj.id
            ? {
                ...o,
                frames: o.frames.map((f) => {
                  // Only move if this frame has enough layers
                  if (f.layers.length <= currentLayerIndex) return f;

                  const newLayers = [...f.layers];
                  // Only move if target index is valid for this frame
                  if (targetIndex < 0 || targetIndex >= newLayers.length) return f;

                  const [removed] = newLayers.splice(currentLayerIndex, 1);
                  newLayers.splice(targetIndex, 0, removed);
                  return { ...f, layers: newLayers };
                })
              }
            : o
        )
      }), true);
    },

    deleteLayerAcrossAllFrames: (layerId) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      // Find the layer's index in the current frame
      const currentLayerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (currentLayerIndex === -1) return;

      // Don't delete if it's the last layer
      if (frame.layers.length <= 1) return;

      // Delete layer at the same index position in all frames
      updateProjectAndSave((project) => {
        let newSelectedLayerId: string | null = null;

        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only delete if this frame has enough layers and has a layer at this index
                    if (f.layers.length <= 1 || f.layers.length <= currentLayerIndex) return f;

                    const newLayers = f.layers.filter((_, index) => index !== currentLayerIndex);

                    // Set selected layer to the first remaining layer (or layer at same index if available)
                    if (f.id === frame.id && newLayers.length > 0) {
                      const targetIndex = Math.min(currentLayerIndex, newLayers.length - 1);
                      newSelectedLayerId = newLayers[targetIndex].id;
                    }

                    return { ...f, layers: newLayers };
                  })
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: newSelectedLayerId || project.uiState.selectedLayerId
          }
        };

        return updatedProject;
      }, true);
    },

    squashLayerDown: (layerId) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (layerIndex === -1 || layerIndex === 0) return; // Can't squash down if it's the bottom layer

      const currentLayer = frame.layers[layerIndex];
      const layerBelow = frame.layers[layerIndex - 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerBelow.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        let newSelectedLayerId: string | null = null;

        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l, idx) => {
                            if (idx === layerIndex - 1) {
                              // Blend current layer into layer below
                              const newPixels = createEmptyPixelGrid(width, height);
                              for (let y = 0; y < height; y++) {
                                for (let x = 0; x < width; x++) {
                                  const belowPixel = l.pixels[y]?.[x] || 0;
                                  const currentPixel = f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                  // Blend current (src) onto below (dst)
                                  newPixels[y][x] = blendPixels(currentPixel, belowPixel);
                                }
                              }
                              return { ...l, pixels: newPixels };
                            }
                            return l;
                          }).filter((l, idx) => idx !== layerIndex) // Remove the current layer after squashing
                        }
                      : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerBelow.id
          }
        };

        return updatedProject;
      }, true);
    },

    squashLayerUp: (layerId) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return; // Can't squash up if it's the top layer

      const currentLayer = frame.layers[layerIndex];
      const layerAbove = frame.layers[layerIndex + 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerAbove.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) =>
                    f.id === frame.id
                      ? {
                          ...f,
                          layers: f.layers.map((l, idx) => {
                            if (idx === layerIndex + 1) {
                              // Blend current layer into layer above
                              const newPixels = createEmptyPixelGrid(width, height);
                              for (let y = 0; y < height; y++) {
                                for (let x = 0; x < width; x++) {
                                  const abovePixel = l.pixels[y]?.[x] || 0;
                                  const currentPixel = f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                                  // Blend current (src) onto above (dst)
                                  newPixels[y][x] = blendPixels(currentPixel, abovePixel);
                                }
                              }
                              return { ...l, pixels: newPixels };
                            }
                            return l;
                          }).filter((l, idx) => idx !== layerIndex) // Remove the current layer after squashing
                        }
                      : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerAbove.id
          }
        };

        return updatedProject;
      }, true);
    },

    squashLayerDownAcrossAllFrames: (layerId) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (layerIndex === -1 || layerIndex === 0) return; // Can't squash down if it's the bottom layer

      const currentLayer = frame.layers[layerIndex];
      const layerBelow = frame.layers[layerIndex - 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerBelow.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only squash if this frame has enough layers
                    if (f.layers.length <= layerIndex) return f;

                    const fCurrentLayer = f.layers[layerIndex];
                    const fLayerBelow = f.layers[layerIndex - 1];

                    // Skip if either layer is a variant
                    if (fCurrentLayer.isVariant || fLayerBelow.isVariant) return f;

                    return {
                      ...f,
                      layers: f.layers.map((l, idx) => {
                        if (idx === layerIndex - 1) {
                          // Blend current layer into layer below
                          const newPixels = createEmptyPixelGrid(width, height);
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const belowPixel = l.pixels[y]?.[x] || 0;
                              const currentPixel = f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                              // Blend current (src) onto below (dst)
                              newPixels[y][x] = blendPixels(currentPixel, belowPixel);
                            }
                          }
                          return { ...l, pixels: newPixels };
                        }
                        return l;
                      }).filter((l, idx) => idx !== layerIndex) // Remove the current layer after squashing
                    };
                  })
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerBelow.id
          }
        };

        return updatedProject;
      }, true);
    },

    squashLayerUpAcrossAllFrames: (layerId) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layerIndex = frame.layers.findIndex(l => l.id === layerId);
      if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return; // Can't squash up if it's the top layer

      const currentLayer = frame.layers[layerIndex];
      const layerAbove = frame.layers[layerIndex + 1];

      // Only squash regular layers
      if (currentLayer.isVariant || layerAbove.isVariant) return;

      const { width, height } = obj.gridSize;

      updateProjectAndSave((project) => {
        const updatedProject = {
          ...project,
          objects: project.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  frames: o.frames.map((f) => {
                    // Only squash if this frame has enough layers
                    if (f.layers.length <= layerIndex + 1) return f;

                    const fCurrentLayer = f.layers[layerIndex];
                    const fLayerAbove = f.layers[layerIndex + 1];

                    // Skip if either layer is a variant
                    if (fCurrentLayer.isVariant || fLayerAbove.isVariant) return f;

                    return {
                      ...f,
                      layers: f.layers.map((l, idx) => {
                        if (idx === layerIndex + 1) {
                          // Blend current layer into layer above
                          const newPixels = createEmptyPixelGrid(width, height);
                          for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                              const abovePixel = l.pixels[y]?.[x] || 0;
                              const currentPixel = f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                              // Blend current (src) onto above (dst)
                              newPixels[y][x] = blendPixels(currentPixel, abovePixel);
                            }
                          }
                          return { ...l, pixels: newPixels };
                        }
                        return l;
                      }).filter((l, idx) => idx !== layerIndex) // Remove the current layer after squashing
                    };
                  })
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerAbove.id
          }
        };

        return updatedProject;
      }, true);
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
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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

    // Layer copy/paste actions
    copyLayerToClipboard: (layerId: string) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!obj || !frame) return;

      const layer = frame.layers.find(l => l.id === layerId);
      if (!layer) return;

      if (layer.isVariant && layer.variantGroupId) {
        // Copy variant - deep copy the ENTIRE variant group with ALL variants
        const { project } = get();
        const variantGroup = project?.variants?.find(vg => vg.id === layer.variantGroupId);
        if (!variantGroup) return;

        // Deep copy the entire variant group with all variants
        const copiedVariantGroup: VariantGroup = {
          id: generateId(),
          name: variantGroup.name,
          variants: variantGroup.variants.map(variant => ({
            id: generateId(),
            name: variant.name,
            gridSize: { ...variant.gridSize },
            frames: variant.frames.map(f => ({
              id: generateId(),
              layers: f.layers.map(l => ({
                ...l,
                id: generateId(),
                pixels: l.pixels.map(row =>
                  row.map(pd => {
                    // Deep copy PixelData
                    return {
                      color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                      normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                      height: pd.height
                    } as PixelData;
                  })
                )
              }))
            })),
            baseFrameOffsets: { ...variant.baseFrameOffsets }
          }))
        };

        set({
          layerClipboard: {
            type: 'variant',
            variantGroup: copiedVariantGroup,
            variantId: copiedVariantGroup.variants[0].id
          }
        });
      } else {
        // Copy regular layer - collect from all frames
        const layerName = layer.name;
        const layerFrames: LayerClipboard['layerFrames'] = [];

        // Store the frame index when copying (for current-frame-only paste)
        const sourceFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

        for (const f of obj.frames) {
          const matchingLayer = f.layers.find(l => l.name === layerName && !l.isVariant);
          if (matchingLayer) {
            // Deep copy pixels - ensure we create new PixelData objects
            const copiedPixels: PixelData[][] = matchingLayer.pixels.map(row =>
              row.map(pd => {
                // Deep copy PixelData
                return {
                  color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                  normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                  height: pd.height
                } as PixelData;
              })
            );
            layerFrames.push({
              name: matchingLayer.name,
              pixels: copiedPixels,
              visible: matchingLayer.visible
            });
          } else {
            // No matching layer in this frame, create empty placeholder
            layerFrames.push({
              name: layerName,
              pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
              visible: true
            });
          }
        }

        set({
          layerClipboard: {
            type: 'layer',
            layerFrames,
            sourceFrameIndex
          }
        });
      }
    },

    pasteLayerFromClipboard: (currentFrameOnly: boolean = false) => {
      const { layerClipboard, project } = get();
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      if (!layerClipboard || !obj || !frame || !project) return;

      // Get current frame index
      const currentFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

      if (layerClipboard.type === 'variant' && layerClipboard.variantGroup) {
        // Paste variant - copy ALL variants from the variant group
        const sourceVariantGroup = layerClipboard.variantGroup;
        if (sourceVariantGroup.variants.length === 0) return;

        // Create new IDs for the pasted variant group
        const newVariantGroupId = generateId();

        // Deep copy all variants with new IDs
        const newVariants: Variant[] = sourceVariantGroup.variants.map(sourceVariant => ({
          id: generateId(),
          name: sourceVariant.name,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map(f => ({
            id: generateId(),
            layers: f.layers.map(l => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map(row =>
                row.map(pd => {
                  // Deep copy PixelData
                  return {
                    color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                    normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                    height: pd.height
                  } as PixelData;
                })
              )
            }))
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets }
        }));

        const newVariantGroup: VariantGroup = {
          id: newVariantGroupId,
          name: sourceVariantGroup.name,
          variants: newVariants
        };

        // Use the first variant as the selected one
        const selectedVariantId = newVariants[0].id;

        // Get the default offset from the source variant's baseFrameOffsets
        const getOffsetForFrame = (frameIndex: number) => {
          const sourceVariant = sourceVariantGroup.variants[0];
          return sourceVariant?.baseFrameOffsets?.[frameIndex] ?? { x: 0, y: 0 };
        };

        updateProjectAndSave((project) => ({
          ...project,
          // Add variant group at project level
          variants: [...(project.variants ?? []), newVariantGroup],
          objects: project.objects.map(o => {
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
                      pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
                      visible: true,
                      isVariant: true,
                      variantGroupId: newVariantGroupId,
                      selectedVariantId: selectedVariantId,
                      variantOffset: getOffsetForFrame(idx)
                    };
                    return {
                      ...f,
                      layers: [...f.layers, variantLayer]
                    };
                  }
                  return f;
                })
              };
            } else {
              // Add variant layer to all frames at the top (end of layers array)
              return {
                ...o,
                frames: o.frames.map((f, idx) => {
                  const variantLayer: Layer = {
                    id: generateId(),
                    name: sourceVariantGroup.name,
                    pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
                    visible: true,
                    isVariant: true,
                    variantGroupId: newVariantGroupId,
                    selectedVariantId: selectedVariantId,
                    variantOffset: getOffsetForFrame(idx)
                  };

                  return {
                    ...f,
                    layers: [...f.layers, variantLayer]
                  };
                })
              };
            }
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [newVariantGroupId]: 0
            }
          }
        }), true);
      } else if (layerClipboard.type === 'layer' && layerClipboard.layerFrames) {
        // Paste regular layer
        const sourceFrames = layerClipboard.layerFrames;
        if (sourceFrames.length === 0) return;

        const layerName = sourceFrames[0].name;
        const { width, height } = obj.gridSize;

        if (currentFrameOnly) {
          // Only paste to the current frame using the frame's data from when it was copied
          // Use the sourceFrameIndex from when the copy was made, not the current frame index
          const clipboardSourceFrameIndex = layerClipboard.sourceFrameIndex ?? currentFrameIndex;
          const sourceFrameIndex = Math.min(clipboardSourceFrameIndex, sourceFrames.length - 1);
          const sourceData = sourceFrames[sourceFrameIndex];

          updateProjectAndSave((project) => {
            let updatedObj = project.objects.find(o => o.id === obj.id);
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
                  if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                    const pd = sourceData.pixels[y][x];
                    // Deep copy PixelData
                    pixels[targetY][targetX] = {
                      color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                      normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                      height: pd.height
                    } as PixelData;
                  }
                }
              }
            } else {
              // Deep copy - ensure we create new PixelData objects
              pixels = sourceData.pixels.map(row =>
                row.map(pd => {
                  // Deep copy PixelData
                  return {
                    color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                    normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                    height: pd.height
                  } as PixelData;
                })
              );
            }

            const newLayer: Layer = {
              id: generateId(),
              name: layerName,
              pixels,
              visible: sourceData.visible
            };

            return {
              ...project,
              objects: project.objects.map(o => {
                if (o.id !== obj.id) return o;
                return {
                  ...o,
                  frames: o.frames.map((f, idx) => {
                    if (idx === currentFrameIndex) {
                      return {
                        ...f,
                        layers: [...f.layers, newLayer]
                      };
                    }
                    return f;
                  })
                };
              })
            };
          }, true);
        } else {
          // Paste to all frames (original behavior)
          // Determine how many frames the object needs
          const neededFrames = sourceFrames.length;
          const currentFrames = obj.frames.length;

          updateProjectAndSave((project) => {
            let updatedObj = project.objects.find(o => o.id === obj.id);
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
                  layers: lastFrame.layers.map(l => ({
                    ...l,
                    id: generateId(),
                    pixels: l.pixels.map(row => [...row])
                  }))
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
                    if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                      const pd = sourceData.pixels[y][x];
                      // Deep copy PixelData
                      pixels[targetY][targetX] = {
                        color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                        normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                        height: pd.height
                      } as PixelData;
                    }
                  }
                }
              } else {
                // Deep copy - ensure we create new PixelData objects
                pixels = sourceData.pixels.map(row =>
                  row.map(pd => {
                    // Deep copy PixelData
                    return {
                      color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                      normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                      height: pd.height
                    } as PixelData;
                  })
                );
              }

              const newLayer: Layer = {
                id: generateId(),
                name: layerName,
                pixels,
                visible: sourceData.visible
              };

              return {
                ...f,
                layers: [...f.layers, newLayer]
              };
            });

            return {
              ...project,
              objects: project.objects.map(o =>
                o.id === obj.id ? { ...o, frames: newFrames } : o
              )
            };
          }, true);
        }
      }
    },

    copyLayerFromObject: (sourceObjectId: string, sourceLayerId: string, isVariant: boolean, variantGroupId?: string, _variantId?: string) => {
      const { project } = get();
      const targetObj = get().getCurrentObject();
      const targetFrame = get().getCurrentFrame();
      if (!project || !targetObj || !targetFrame) return;

      const sourceObj = project.objects.find(o => o.id === sourceObjectId);
      if (!sourceObj) return;

      if (isVariant && variantGroupId) {
        // Copy variant from project level - copy ALL variants in the variant group
        const sourceVariantGroup = project.variants?.find(vg => vg.id === variantGroupId);
        if (!sourceVariantGroup || sourceVariantGroup.variants.length === 0) return;

        // Create new IDs
        const newVariantGroupId = generateId();

        // Deep copy ALL variants with new IDs
        const newVariants: Variant[] = sourceVariantGroup.variants.map(sourceVariant => ({
          id: generateId(),
          name: sourceVariant.name,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map(f => ({
            id: generateId(),
            layers: f.layers.map(l => ({
              ...l,
              id: generateId(),
              pixels: l.pixels.map(row => row.map(pd => ({
                color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                height: pd.height
              } as PixelData)))
            }))
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets }
        }));

        const newVariantGroup: VariantGroup = {
          id: newVariantGroupId,
          name: sourceVariantGroup.name,
          variants: newVariants
        };

        // Use the first variant as the selected one
        const selectedVariantId = newVariants[0].id;

        // Get the default offset from the source variant's baseFrameOffsets
        const getOffsetForFrame = (frameIndex: number) => {
          const sourceVariant = sourceVariantGroup.variants[0];
          return sourceVariant?.baseFrameOffsets?.[frameIndex] ?? { x: 0, y: 0 };
        };

        updateProjectAndSave((project) => ({
          ...project,
          // Add variant group at project level
          variants: [...(project.variants ?? []), newVariantGroup],
          objects: project.objects.map(o => {
            if (o.id !== targetObj.id) return o;

            return {
              ...o,
              frames: o.frames.map((f, idx) => {
                const variantLayer: Layer = {
                  id: generateId(),
                  name: sourceVariantGroup.name,
                  pixels: createEmptyPixelGrid(targetObj.gridSize.width, targetObj.gridSize.height),
                  visible: true,
                  isVariant: true,
                  variantGroupId: newVariantGroupId,
                  selectedVariantId: selectedVariantId,
                  variantOffset: getOffsetForFrame(idx)
                };

                return {
                  ...f,
                  layers: [...f.layers, variantLayer]
                };
              })
            };
          }),
          uiState: {
            ...project.uiState,
            variantFrameIndices: {
              ...project.uiState.variantFrameIndices,
              [newVariantGroupId]: 0
            }
          }
        }), true);
      } else {
        // Copy regular layer from source object
        const sourceFrame = sourceObj.frames[0];
        if (!sourceFrame) return;

        const sourceLayer = sourceFrame.layers.find(l => l.id === sourceLayerId);
        if (!sourceLayer) return;

        const layerName = sourceLayer.name;
        const { width: targetWidth, height: targetHeight } = targetObj.gridSize;

        // Collect all frames from source
        const sourceFrames: { pixels: PixelData[][]; visible: boolean }[] = [];
        for (const f of sourceObj.frames) {
          const matchingLayer = f.layers.find(l => l.name === layerName && !l.isVariant);
          if (matchingLayer) {
            sourceFrames.push({
              pixels: matchingLayer.pixels,
              visible: matchingLayer.visible
            });
          } else {
            sourceFrames.push({
              pixels: createEmptyPixelGrid(sourceObj.gridSize.width, sourceObj.gridSize.height),
              visible: true
            });
          }
        }

        const neededFrames = sourceFrames.length;
        const currentFrames = targetObj.frames.length;

        updateProjectAndSave((project) => {
          let updatedObj = project.objects.find(o => o.id === targetObj.id);
          if (!updatedObj) return project;

          let newFrames = [...updatedObj.frames];

          // Add more frames if needed
          if (neededFrames > currentFrames) {
            const lastFrame = newFrames[newFrames.length - 1];
            for (let i = currentFrames; i < neededFrames; i++) {
              const newFrame: Frame = {
                id: generateId(),
                name: `Frame ${i + 1}`,
                layers: lastFrame.layers.map(l => ({
                  ...l,
                  id: generateId(),
                  pixels: l.pixels.map(row => [...row])
                }))
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
                  if (targetX >= 0 && targetX < targetWidth && targetY >= 0 && targetY < targetHeight) {
                    const pd = sourceData.pixels[y][x];
                    pixels[targetY][targetX] = {
                      color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                      normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                      height: pd.height
                    } as PixelData;
                  }
                }
              }
            } else {
              pixels = sourceData.pixels.map(row => row.map(pd => ({
                color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
                normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
                height: pd.height
              } as PixelData)));
            }

            const newLayer: Layer = {
              id: generateId(),
              name: layerName,
              pixels,
              visible: sourceData.visible
            };

            return {
              ...f,
              layers: [...f.layers, newLayer]
            };
          });

          return {
            ...project,
            objects: project.objects.map(o =>
              o.id === targetObj.id ? { ...o, frames: newFrames } : o
            )
          };
        }, true);
      }
    },

    // Timeline view actions
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
                      obj.gridSize.height
                    );
                    // Add to top of layer stack
                    return { ...f, layers: [...f.layers, newLayer] };
                  })
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

    addLayerToFrameAtPosition: (frameId: string, name: string, position: number, variantInfo?: { isVariant?: boolean; variantGroupId?: string; selectedVariantId?: string; variantOffset?: { x: number; y: number } }) => {
      const obj = get().getCurrentObject();
      if (!obj) return '';

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
                        obj.gridSize.height
                      ),
                      // Add variant information if provided
                      ...(variantInfo?.isVariant ? {
                        isVariant: true,
                        variantGroupId: variantInfo.variantGroupId,
                        selectedVariantId: variantInfo.selectedVariantId,
                        variantOffset: variantInfo.variantOffset
                      } : {})
                    };
                    // Insert at the specified position
                    const newLayers = [...f.layers];
                    newLayers.splice(position, 0, newLayer);
                    return { ...f, layers: newLayers };
                  })
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            selectedLayerId: layerId
          }
        };
      }, true);
      return layerId;
    },

    deleteLayerFromFrame: (frameId: string, layerId: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find(f => f.id === frameId);
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
                      ? { ...f, layers: f.layers.filter(l => l.id !== layerId) }
                      : f
                  )
                }
              : o
          ),
          uiState: {
            ...project.uiState,
            // If the deleted layer was selected, select another layer
            selectedLayerId: project.uiState.selectedLayerId === layerId
              ? (frame.layers.find(l => l.id !== layerId)?.id ?? null)
              : project.uiState.selectedLayerId
          }
        };
      }, true);
    },

    reorderLayerInFrame: (frameId: string, layerId: string, newIndex: number) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map((o) =>
          o.id === obj.id
            ? {
                ...o,
                frames: o.frames.map((f) => {
                  if (f.id !== frameId) return f;

                  const currentIndex = f.layers.findIndex(l => l.id === layerId);
                  if (currentIndex === -1 || currentIndex === newIndex) return f;

                  const newLayers = [...f.layers];
                  const [removed] = newLayers.splice(currentIndex, 1);
                  newLayers.splice(newIndex, 0, removed);
                  return { ...f, layers: newLayers };
                })
              }
            : o
        )
      }), true);
    },

    copyTimelineCell: (frameId: string, layerId: string) => {
      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find(f => f.id === frameId);
      if (!frame) return;

      const layer = frame.layers.find(l => l.id === layerId);
      if (!layer) return;

      // Deep copy the pixels
      const pixelsCopy: PixelData[][] = layer.pixels.map(row =>
        row.map(pd => ({
          color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
          normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
          height: pd.height
        } as PixelData))
      );

      set({
        timelineCellClipboard: {
          layerName: layer.name,
          pixels: pixelsCopy,
          // Preserve variant information if this is a variant layer
          isVariant: layer.isVariant,
          variantGroupId: layer.variantGroupId,
          selectedVariantId: layer.selectedVariantId,
          variantOffset: layer.variantOffset
        }
      });
    },

    pasteTimelineCell: (frameId: string, targetLayerId: string) => {
      const { timelineCellClipboard } = get();
      if (!timelineCellClipboard) return;

      const obj = get().getCurrentObject();
      if (!obj) return;

      const frame = obj.frames.find(f => f.id === frameId);
      if (!frame) return;

      const targetLayer = frame.layers.find(l => l.id === targetLayerId);
      if (!targetLayer) return;

      // Deep copy clipboard pixels
      const newPixels: PixelData[][] = timelineCellClipboard.pixels.map(row =>
        row.map(pd => ({
          color: pd.color === 0 ? 0 : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
          normal: pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
          height: pd.height
        } as PixelData))
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
          variantOffset: timelineCellClipboard.variantOffset
        };
      } else {
        // If clipboard doesn't have variant info, clear variant properties
        // (in case we're pasting a normal layer over a variant layer)
        const { isVariant, variantGroupId, selectedVariantId, variantOffset, ...rest } = targetLayer;
        updatedLayer = {
          ...rest,
          pixels: newPixels
        } as Layer;
      }

      updateProjectAndSave((project) => ({
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
                          l.id === targetLayerId
                            ? updatedLayer
                            : l
                        )
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

        // Skip if pixel color is already the same
        const targetLayer = variantFrame.layers[0];
        if (!targetLayer) return;
        const currentPixelData = targetLayer.pixels[y]?.[x];
        const currentColor = currentPixelData?.color;
        if (color === 0 && currentColor === 0) return;
        if (color && currentColor && typeof currentColor === 'object') {
          if (color.r === currentColor.r && color.g === currentColor.g && color.b === currentColor.b && color.a === currentColor.a) return;
        }

        const variantGroupId = layer.variantGroupId;
        const variantId = layer.selectedVariantId;
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                        const existing = newPixels[y][x];
                        // When erasing, clear all data; when drawing, preserve normal/height or set defaults
                        if (color === 0) {
                          newPixels[y][x] = { color: 0, normal: 0, height: 0 };
                        } else {
                          newPixels[y][x] = {
                            color,
                            normal: existing?.normal ?? 0,
                            height: existing?.height ?? 1
                          };
                        }
                        return { ...l, pixels: newPixels };
                      })
                    };
                  })
                };
              })
            };
          })
        }), true);
        return;
      }

      // Regular layer editing
      if (x < 0 || x >= obj.gridSize.width || y < 0 || y >= obj.gridSize.height) return;

      // Skip if pixel color is already the same
      const currentPixelData = layer.pixels[y]?.[x];
      const currentColor = currentPixelData?.color;
      if (color === 0 && currentColor === 0) return;
      if (color && currentColor && typeof currentColor === 'object') {
        if (color.r === currentColor.r && color.g === currentColor.g && color.b === currentColor.b && color.a === currentColor.a) return;
      }

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
                          const existing = newPixels[y][x];
                          // When erasing, clear all data; when drawing, preserve normal/height or set defaults
                          if (color === 0) {
                            newPixels[y][x] = { color: 0, normal: 0, height: 0 };
                          } else {
                            newPixels[y][x] = {
                              color,
                              normal: existing?.normal ?? 0,
                              height: existing?.height ?? 1
                            };
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
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                            const existing = newPixels[y][x];
                            if (color === 0) {
                              newPixels[y][x] = { color: 0, normal: 0, height: 0 };
                            } else {
                              newPixels[y][x] = {
                                color,
                                normal: existing?.normal ?? 0,
                                height: existing?.height ?? 1
                              };
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
                              const existing = newPixels[y][x];
                              if (color === 0) {
                                newPixels[y][x] = { color: 0, normal: 0, height: 0 };
                              } else {
                                newPixels[y][x] = {
                                  color,
                                  normal: existing?.normal ?? 0,
                                  height: existing?.height ?? 1
                                };
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

    setEraserShape: (shape) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, eraserShape: shape }
      }), false);
    },

    setNormalBrushShape: (shape) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, normalBrushShape: shape }
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

    setFrameReferencePanelPosition: (position) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, frameReferencePanelPosition: position }
      }), false);
    },

    setFrameReferencePanelMinimized: (minimized) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, frameReferencePanelMinimized: minimized }
      }), false);
    },

    setReferenceImagePanelPosition: (position) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, referenceImagePanelPosition: position }
      }), false);
    },

    setReferenceImagePanelMinimized: (minimized) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, referenceImagePanelMinimized: minimized }
      }), false);
    },

    setCanvasInfoHidden: (hidden) => {
      updateProjectAndSave((project) => ({
        ...project,
        uiState: { ...project.uiState, canvasInfoHidden: hidden }
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

    // Frame trace actions
    setFrameTraceActive: (active, frameIndex) => {
      set({
        frameTraceActive: active,
        frameTraceFrameIndex: active ? frameIndex : null,
        frameOverlayOffset: active ? { x: 0, y: 0 } : { x: 0, y: 0 }
      });
    },

    moveFrameOverlay: (dx, dy) => {
      const { frameOverlayOffset } = get();
      set({
        frameOverlayOffset: {
          x: frameOverlayOffset.x + dx,
          y: frameOverlayOffset.y + dy
        }
      });
    },

    resetFrameOverlay: () => {
      set({ frameOverlayOffset: { x: 0, y: 0 } });
    },

    // Frame reference object actions
    setFrameReferenceObjectId: (objectId) => {
      set({ frameReferenceObjectId: objectId });
    },

    getFrameReferenceObject: () => {
      const { project, frameReferenceObjectId } = get();
      if (!project) return null;

      // If a specific object is set for frame reference, use that
      if (frameReferenceObjectId) {
        return project.objects.find((o) => o.id === frameReferenceObjectId) ?? null;
      }

      // Otherwise, fall back to the currently selected object
      const selectedObjectId = project.uiState.selectedObjectId;
      if (!selectedObjectId) return null;
      return project.objects.find((o) => o.id === selectedObjectId) ?? null;
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
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                            newPixels[y][x] = l.pixels[y][x] ?? { color: 0, normal: 0, height: 0 };
                          }
                        }

                        // Clear pixels in the original selection area
                        for (let sy = selection.y; sy < selection.y + selection.height; sy++) {
                          for (let sx = selection.x; sx < selection.x + selection.width; sx++) {
                            if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                              newPixels[sy][sx] = { color: 0, normal: 0, height: 0 };
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
                              newPixels[y][x] = l.pixels[y][x] ?? { color: 0, normal: 0, height: 0 };
                            }
                          }

                          // Clear pixels in the original selection area
                          for (let sy = selection.y; sy < selection.y + selection.height; sy++) {
                            for (let sx = selection.x; sx < selection.x + selection.width; sx++) {
                              if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                                newPixels[sy][sx] = { color: 0, normal: 0, height: 0 };
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
                  const pd = vLayer.pixels[y]?.[x];
                  const pColor = pd?.color;
                  if (pColor && typeof pColor === 'object') {
                    if (pColor.r === color.r && pColor.g === color.g && pColor.b === color.b && pColor.a === color.a) {
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
              affectedPixelsByFrame
            }
          });
        } else {
          // Single frame mode - find pixels only in current variant frame's layer
          const affectedPixels: { x: number; y: number }[] = [];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const pd = variantLayer.pixels[y]?.[x];
              const pColor = pd?.color;
              if (pColor && typeof pColor === 'object') {
                if (pColor.r === color.r && pColor.g === color.g && pColor.b === color.b && pColor.a === color.a) {
                  affectedPixels.push({ x, y });
                }
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
                  const pd = matchingLayer.pixels[y]?.[x];
                  const pColor = pd?.color;
                  if (pColor && typeof pColor === 'object') {
                    if (pColor.r === color.r && pColor.g === color.g && pColor.b === color.b && pColor.a === color.a) {
                      pixels.push({ x, y });
                    }
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
              const pd = layer.pixels[y]?.[x];
              const pColor = pd?.color;
              if (pColor && typeof pColor === 'object') {
                if (pColor.r === color.r && pColor.g === color.g && pColor.b === color.b && pColor.a === color.a) {
                  affectedPixels.push({ x, y });
                }
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
        const variantGroupId = layer.variantGroupId!;
        const variantId = layer.selectedVariantId!;

        if (colorAdjustment.allFrames && colorAdjustment.affectedPixelsByFrame) {
          // All frames mode - update pixels across all variant frames
          updateProjectAndSave((project) => ({
            ...project,
            // Update variants at project level
            variants: project.variants?.map(vg => {
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
                            const existing = newPixels[y][x];
                            newPixels[y][x] = {
                              color: newColor,
                              normal: existing?.normal ?? 0,
                              height: existing?.height ?? 1
                            };
                          }
                          return { ...vl, pixels: newPixels };
                        })
                      };
                    })
                  };
                })
              };
            }),
            uiState: { ...project.uiState, selectedColor: newColor }
          }), trackHistory);
        } else {
          // Single frame mode - update only current variant frame's layer
          const { project } = get();
          const frameIndex = project?.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
          updateProjectAndSave((project) => ({
            ...project,
            // Update variants at project level
            variants: project.variants?.map(vg => {
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
                            const existing = newPixels[y][x];
                            newPixels[y][x] = {
                              color: newColor,
                              normal: existing?.normal ?? 0,
                              height: existing?.height ?? 1
                            };
                          }
                          return { ...vl, pixels: newPixels };
                        })
                      };
                    })
                  };
                })
              };
            }),
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
                            const existing = newPixels[y][x];
                            newPixels[y][x] = {
                              color: newColor,
                              normal: existing?.normal ?? 0,
                              height: existing?.height ?? 1
                            };
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
                                const existing = newPixels[y][x];
                                newPixels[y][x] = {
                                  color: newColor,
                                  normal: existing?.normal ?? 0,
                                  height: existing?.height ?? 1
                                };
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
      const framesPixelData: { frameId: string; layerIds: string[]; pixels: PixelData[][]; frameMinX: number; frameMinY: number; frameMaxX: number; frameMaxY: number }[] = [];

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
        const frame: Frame = obj.frames[i];
        const frameData = framesPixelData.find(fd => fd.frameId === frame.id);

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
        // Add variant group at project level
        variants: [...(project.variants ?? []), newVariantGroup],
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;

          // Update frames: remove original layers with matching name, add variant layer
          return {
            ...o,
            frames: o.frames.map((f, frameIndex) => {
              // Find the index of the first layer with matching name to preserve position
              const firstMatchingIndex = f.layers.findIndex(l => l.name === layerName);

              // Remove all layers with matching name
              const filteredLayers = f.layers.filter(l => l.name !== layerName);

              // Add variant layer (one per frame, referencing the variant group)
              // Include the offset for this frame
              const variantLayer: Layer = {
                id: generateId(),
                name: layerName,
                pixels: createEmptyPixelGrid(objWidth, objHeight), // Not used for rendering
                visible: true,
                isVariant: true,
                variantGroupId,
                selectedVariantId: variantId,
                variantOffset: baseFrameOffsets[frameIndex] ?? { x: 0, y: 0 }
              };

              // Insert variant layer at the original position (or at the end if no match found)
              const insertIndex = firstMatchingIndex >= 0 ? firstMatchingIndex : filteredLayers.length;
              const newLayers = [...filteredLayers];
              newLayers.splice(insertIndex, 0, variantLayer);

              return {
                ...f,
                layers: newLayers
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
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
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
        // Update variants at project level
        variants: project.variants?.map(vg => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: [...vg.variants, newVariant]
          };
        })
      }), true);
    },

    deleteVariant: (variantGroupId: string, variantId: string) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
      if (!variantGroup || variantGroup.variants.length <= 1) return; // Can't delete last variant

      const remainingVariants = variantGroup.variants.filter(v => v.id !== variantId);
      const newSelectedId = remainingVariants[0].id;

      updateProjectAndSave((project) => ({
        ...project,
        // Update variants at project level
        variants: project.variants?.map(vg => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: remainingVariants
          };
        }),
        // Update all variant layers across all objects to select first remaining variant if they had the deleted one
        objects: project.objects.map(o => ({
          ...o,
          frames: o.frames.map(f => ({
            ...f,
            layers: f.layers.map(l => {
              if (l.isVariant && l.variantGroupId === variantGroupId && l.selectedVariantId === variantId) {
                return { ...l, selectedVariantId: newSelectedId };
              }
              return l;
            })
          }))
        }))
      }), true);
    },

    deleteVariantGroup: (variantGroupId: string) => {
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      updateProjectAndSave((project) => ({
        ...project,
        // Remove the variant group from project level
        variants: project.variants?.filter(vg => vg.id !== variantGroupId),
        // Remove variant layers from all objects and all frames
        objects: project.objects.map(o => ({
          ...o,
          frames: o.frames.map(f => ({
            ...f,
            layers: f.layers.filter(l => !(l.isVariant && l.variantGroupId === variantGroupId))
          }))
        })),
        // Clean up variant frame indices
        uiState: {
          ...project.uiState,
          variantFrameIndices: Object.fromEntries(
            Object.entries(project.uiState.variantFrameIndices || {})
              .filter(([key]) => key !== variantGroupId)
          )
        }
      }), true);

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
      updateProjectAndSave((project) => ({
        ...project,
        // Update variants at project level
        variants: project.variants?.map(vg => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: vg.variants.map(v => {
              if (v.id !== variantId) return v;
              return { ...v, name };
            })
          };
        })
      }), true);
    },

    renameVariantGroup: (variantGroupId: string, name: string) => {
      updateProjectAndSave((project) => ({
        ...project,
        variants: project.variants?.map(vg => {
          if (vg.id !== variantGroupId) return vg;
          return { ...vg, name };
        })
      }), true);
    },

    resizeVariant: (variantGroupId: string, variantId: string, width: number, height: number) => {
      updateProjectAndSave((project) => {
        // Calculate padding values once
        const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
        const variant = variantGroup?.variants.find(v => v.id === variantId);
        if (!variant) return project;

        const oldWidth = variant.gridSize.width;
        const oldHeight = variant.gridSize.height;

        // Calculate padding to center the content
        const widthDiff = width - oldWidth;
        const heightDiff = height - oldHeight;

        const leftPadding = Math.floor(widthDiff / 2);
        const topPadding = Math.floor(heightDiff / 2);

        return {
          ...project,
          // Update variants at project level
          variants: project.variants?.map(vg => {
            if (vg.id !== variantGroupId) return vg;
            return {
              ...vg,
              variants: vg.variants.map(v => {
                if (v.id !== variantId) return v;

                // Copy pixels with centering offset
                const newFrames = v.frames.map(f => ({
                  ...f,
                  layers: f.layers.map(l => {
                    const newPixels = createEmptyPixelGrid(width, height);
                    for (let y = 0; y < oldHeight; y++) {
                      for (let x = 0; x < oldWidth; x++) {
                        const newX = x + leftPadding;
                        const newY = y + topPadding;
                        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
                          newPixels[newY][newX] = l.pixels[y]?.[x] ?? { color: 0, normal: 0, height: 0 };
                        }
                      }
                    }
                    return { ...l, pixels: newPixels };
                  })
                }));

                // Adjust baseFrameOffsets to compensate for pixels added to left/top
                const newBaseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } } = {};
                if (v.baseFrameOffsets) {
                  for (const [baseFrameIndexStr, offset] of Object.entries(v.baseFrameOffsets)) {
                    const baseFrameIndex = parseInt(baseFrameIndexStr, 10);
                    newBaseFrameOffsets[baseFrameIndex] = {
                      x: offset.x - leftPadding,
                      y: offset.y - topPadding
                    };
                  }
                }

                return {
                  ...v,
                  gridSize: { width, height },
                  frames: newFrames,
                  baseFrameOffsets: newBaseFrameOffsets
                };
              })
            };
          }),
          // Also adjust per-layer offsets across all objects
          objects: project.objects.map(o => ({
            ...o,
            frames: o.frames.map(f => ({
              ...f,
              layers: f.layers.map(l => {
                if (l.isVariant && l.variantGroupId === variantGroupId && l.variantOffset) {
                  return {
                    ...l,
                    variantOffset: {
                      x: l.variantOffset.x - leftPadding,
                      y: l.variantOffset.y - topPadding
                    }
                  };
                }
                return l;
              })
            }))
          }))
        };
      }, true);
    },

    setVariantOffset: (dx: number, dy: number, allFrames: boolean = false) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const layer = get().getCurrentLayer();
      const { project } = get();
      if (!obj || !frame || !layer || !project || !layer.isVariant || !layer.variantGroupId) return;

      // Get the variant to access baseFrameOffsets for fallback
      const variantGroup = project.variants?.find(vg => vg.id === layer.variantGroupId);
      const variant = variantGroup?.variants.find(v => v.id === layer.selectedVariantId);
      const baseFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

      // Update the per-layer offset (new system)
      // Use the same fallback logic as rendering: layer.variantOffset ?? variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 }
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            frames: o.frames.map(f => {
              const frameIndex = obj.frames.findIndex(frame => frame.id === f.id);
              return {
                ...f,
                layers: f.layers.map(l => {
                  // If allFrames is true, update all layers with the same variantGroupId and selectedVariantId
                  // Otherwise, only update the current layer
                  if (allFrames) {
                    if (l.isVariant && l.variantGroupId === layer.variantGroupId && l.selectedVariantId === layer.selectedVariantId) {
                      // Use the same fallback logic as rendering to get current offset
                      const currentOffset = l.variantOffset ?? variant?.baseFrameOffsets?.[frameIndex >= 0 ? frameIndex : 0] ?? { x: 0, y: 0 };
                      return {
                        ...l,
                        variantOffset: {
                          x: currentOffset.x + dx,
                          y: currentOffset.y + dy
                        }
                      };
                    }
                  } else {
                    // Original behavior: only update the current layer
                    if (f.id !== frame.id || l.id !== layer.id) return l;
                    // Use the same fallback logic as rendering to get current offset
                    const currentOffset = l.variantOffset ?? variant?.baseFrameOffsets?.[baseFrameIndex >= 0 ? baseFrameIndex : 0] ?? { x: 0, y: 0 };
                    return {
                      ...l,
                      variantOffset: {
                        x: currentOffset.x + dx,
                        y: currentOffset.y + dy
                      }
                    };
                  }
                  return l;
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
              (l) => l.isVariant && l.variantGroupId === variantGroupId
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
        [variantGroupId]: frameIndex  // The clicked variant group gets the exact frame index
      };

      if (targetFrame && project.variants) {
        for (const vg of project.variants) {
          if (vg.id === variantGroupId) continue; // Skip the one we already set

          // Find the variant layer in the target frame for this variant group
          const variantLayer = targetFrame.layers.find(
            (l) => l.isVariant && l.variantGroupId === vg.id
          );

          // Get the selected variant's frame count
          let variantFrameCount = 1;
          if (variantLayer?.selectedVariantId) {
            const selectedVariant = vg.variants.find(v => v.id === variantLayer.selectedVariantId);
            variantFrameCount = selectedVariant?.frames.length ?? 1;
          } else {
            variantFrameCount = vg.variants[0]?.frames.length ?? 1;
          }

          if (variantFrameCount > 0) {
            // Sync to the same frame index (with wrapping)
            newVariantFrameIndices[vg.id] = frameIndex % variantFrameCount;
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
            ...newVariantFrameIndices
          }
        }
      }), false);
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
          (l) => l.isVariant && l.variantGroupId === vg.id
        );

        // Get the currently selected variant's frame count
        let maxFrames = 1;
        if (variantLayer?.selectedVariantId) {
          const selectedVariant = vg.variants.find(v => v.id === variantLayer.selectedVariantId);
          maxFrames = selectedVariant?.frames.length ?? 1;
        } else {
          // Fallback to first variant if no layer found (shouldn't happen, but safe)
          maxFrames = vg.variants[0]?.frames.length ?? 1;
        }

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
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
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
          // Update variants at project level
          variants: project.variants?.map(vg => {
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
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
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
          // Update variants at project level
          variants: project.variants?.map(vg => {
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
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
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
          // Update variants at project level
          variants: project.variants?.map(vg => {
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
      const { project } = get();
      if (!project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
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
          // Update variants at project level
          variants: project.variants?.map(vg => {
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

    // New variant layer management
    addVariantLayerFromExisting: (variantGroupId: string, selectedVariantId: string, addToAllFrames: boolean) => {
      const obj = get().getCurrentObject();
      const frame = get().getCurrentFrame();
      const { project } = get();
      if (!obj || !frame || !project) return;

      const variantGroup = project.variants?.find(vg => vg.id === variantGroupId);
      if (!variantGroup) return;

      const currentFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            frames: o.frames.map((f, idx) => {
              // Only add to current frame if not adding to all frames
              if (!addToAllFrames && idx !== currentFrameIndex) return f;

              const variantLayer: Layer = {
                id: generateId(),
                name: variantGroup.name,
                pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
                visible: true,
                isVariant: true,
                variantGroupId,
                selectedVariantId,
                variantOffset: { x: 0, y: 0 }
              };

              return {
                ...f,
                // Add to top of layers array
                layers: [...f.layers, variantLayer]
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

    removeVariantLayer: (layerId: string) => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return;

      // Only remove the layer, not the variant group - variant groups persist independently
      updateProjectAndSave((project) => ({
        ...project,
        objects: project.objects.map(o => {
          if (o.id !== obj.id) return o;
          return {
            ...o,
            frames: o.frames.map(f => ({
              ...f,
              layers: f.layers.filter(l => l.id !== layerId)
            }))
          };
        })
      }), true);

      // Select another layer if needed
      const frame = get().getCurrentFrame();
      if (frame && frame.layers.length > 0) {
        const { selectLayer } = get();
        selectLayer(frame.layers[frame.layers.length - 1].id);
      }
    },

    // Lighting studio actions
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
            selectedTool: mode === 'lighting' ? 'normal-pencil' : 'pixel'
          }
        }
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
            selectedNormal: normal
          }
        }
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
            lightDirection: normal
          }
        }
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
            lightColor: color
          }
        }
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
            ambientColor: color
          }
        }
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
            heightScale: Math.max(1, Math.min(500, scale)) // Clamp between 1 and 500
          }
        }
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                        newPixels[y][x] = { ...newPixels[y][x], normal };
                        return { ...l, pixels: newPixels };
                      })
                    };
                  })
                };
              })
            };
          })
        }), true);
        return;
      }

      // Regular layer editing
      if (x < 0 || x >= obj.gridSize.width || y < 0 || y >= obj.gridSize.height) return;

      // Can only set normal where color exists
      const pixelData = layer.pixels[y]?.[x];
      if (!pixelData || pixelData.color === 0) return;

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
                          const newPixels = [...l.pixels];
                          newPixels[y] = [...l.pixels[y]];
                          newPixels[y][x] = { ...newPixels[y][x], normal };
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

    setNormalPixels: (pixels: { x: number; y: number; normal: Normal | 0 }[]) => {
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                      })
                    };
                  })
                };
              })
            };
          })
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
                          const affectedRows = new Set(pixels.map(p => p.y).filter(y => y >= 0 && y < obj.gridSize.height));
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y, normal } of pixels) {
                            if (x >= 0 && x < obj.gridSize.width && y >= 0 && y < obj.gridSize.height) {
                              const pd = newPixels[y][x];
                              // Only set normal where color exists
                              if (pd && pd.color !== 0) {
                                newPixels[y][x] = { ...pd, normal };
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          // Update variants at project level
          variants: proj.variants?.map(vg => {
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
                        for (const { x, y, height: heightValue } of pixels) {
                          if (x >= 0 && x < width && y >= 0 && y < height) {
                            const pd = newPixels[y][x];
                            // Only set height where color exists
                            if (pd && pd.color !== 0) {
                              newPixels[y][x] = { ...pd, height: heightValue };
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
                          const affectedRows = new Set(pixels.map(p => p.y).filter(y => y >= 0 && y < obj.gridSize.height));
                          const newPixels = [...l.pixels];
                          for (const rowY of affectedRows) {
                            newPixels[rowY] = [...l.pixels[rowY]];
                          }
                          for (const { x, y, height: heightValue } of pixels) {
                            if (x >= 0 && x < obj.gridSize.width && y >= 0 && y < obj.gridSize.height) {
                              const pd = newPixels[y][x];
                              // Only set height where color exists
                              if (pd && pd.color !== 0) {
                                newPixels[y][x] = { ...pd, height: heightValue };
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

    setReferenceImage: (referenceImage: { imageBase64: string; selectionBox: { startX: number; startY: number; endX: number; endY: number } } | undefined) => {
      updateProjectAndSave((project) => ({
        ...project,
        referenceImage
      }), false); // Don't track reference image changes in history
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          variants: proj.variants?.map(vg => {
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
                        // Create flipped pixel grid
                        const newPixels: PixelData[][] = Array.from({ length: height }, () =>
                          Array.from({ length: width }, () => ({ color: 0, normal: 0, height: 0 }))
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
                                  x: -flippedNormal.x
                                };
                              }
                              newPixels[y][flippedX] = {
                                color: sourcePixel.color,
                                normal: flippedNormal,
                                height: sourcePixel.height
                              };
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
        }), true);
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;
      updateProjectAndSave((proj) => ({
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
                          const newPixels: PixelData[][] = Array.from({ length: height }, () =>
                            Array.from({ length: width }, () => ({ color: 0, normal: 0, height: 0 }))
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
                                    x: -flippedNormal.x
                                  };
                                }
                                newPixels[y][flippedX] = {
                                  color: sourcePixel.color,
                                  normal: flippedNormal,
                                  height: sourcePixel.height
                                };
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
        const frameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;

        updateProjectAndSave((proj) => ({
          ...proj,
          variants: proj.variants?.map(vg => {
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
                        // Create flipped pixel grid
                        const newPixels: PixelData[][] = Array.from({ length: height }, () =>
                          Array.from({ length: width }, () => ({ color: 0, normal: 0, height: 0 }))
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
                                  y: -flippedNormal.y
                                };
                              }
                              newPixels[flippedY][x] = {
                                color: sourcePixel.color,
                                normal: flippedNormal,
                                height: sourcePixel.height
                              };
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
        }), true);
        return;
      }

      // Regular layer editing
      const { width, height } = obj.gridSize;
      updateProjectAndSave((proj) => ({
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
                          const newPixels: PixelData[][] = Array.from({ length: height }, () =>
                            Array.from({ length: width }, () => ({ color: 0, normal: 0, height: 0 }))
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
                                    y: -flippedNormal.y
                                  };
                                }
                                newPixels[flippedY][x] = {
                                  color: sourcePixel.color,
                                  normal: flippedNormal,
                                  height: sourcePixel.height
                                };
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

      // Look for variant group at project level first, fall back to object level for backward compatibility
      const variantGroup = project.variants?.find(vg => vg.id === layer.variantGroupId);
      if (!variantGroup) return null;

      const variant = variantGroup.variants.find(v => v.id === layer.selectedVariantId);
      if (!variant) return null;

      const variantFrameIndex = project.uiState.variantFrameIndices?.[variantGroup.id] ?? 0;
      const variantFrame = variant.frames[variantFrameIndex % variant.frames.length];

      // Get the current base frame index for the offset
      const currentFrameId = project.uiState.selectedFrameId;
      const baseFrameIndex = obj.frames.findIndex(f => f.id === currentFrameId);

      // Use per-layer offset (new system) with fallback to variant-level baseFrameOffsets (legacy)
      const offset = layer.variantOffset ?? variant.baseFrameOffsets?.[baseFrameIndex >= 0 ? baseFrameIndex : 0] ?? { x: 0, y: 0 };

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
