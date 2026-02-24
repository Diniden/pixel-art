import type {
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
  Normal,
  SelectionBox,
  Variant,
  VariantGroup,
  VariantFrame,
  PixelData,
} from "../types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const MAX_HISTORY = 100;
export const MAX_COLOR_HISTORY = 10;

// Color adjustment mode - tracks which pixels should be updated when color changes
export interface ColorAdjustmentState {
  originalColor: Color; // The original color that was selected
  allFrames: boolean; // Whether to adjust across all frames
  // When allFrames is false, just pixel coordinates for current layer
  affectedPixels: { x: number; y: number }[];
  // When allFrames is true, map of frameId -> layerId -> pixel coordinates
  affectedPixelsByFrame?: Map<string, Map<string, { x: number; y: number }[]>>;
}

// Clipboard for copying layers/variants between objects
export interface LayerClipboard {
  type: "layer" | "variant";
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
  // Per-variant-type offsets (new system)
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  // Legacy single offset (for backward compatibility)
  variantOffset?: { x: number; y: number };
}

export interface SelectionState {
  width: number;
  height: number;
  /** Packed coords: idx = y * width + x */
  mask: Set<number>;
  /** Bounding box for rendering + quick checks */
  bounds: SelectionBox;
}

export interface EditorState {
  // Project data
  project: Project | null;
  projectName: string;
  projectList: string[];
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

  // Selection (pixel mask + bounds)
  selection: SelectionState | null;

  // Color adjustment mode
  colorAdjustment: ColorAdjustmentState | null;

  // Layer clipboard for copy/paste
  layerClipboard: LayerClipboard | null;

  // Timeline cell clipboard for timeline view copy/paste
  timelineCellClipboard: TimelineCellClipboard | null;

  // Actions
  initProject: () => Promise<void>;
  undo: () => void;

  // Project management actions
  createNewProject: (name: string) => Promise<boolean>;
  switchToProject: (name: string) => Promise<boolean>;
  renameCurrentProject: (newName: string) => Promise<boolean>;
  deleteCurrentProject: () => Promise<boolean>;
  refreshProjectList: () => Promise<void>;
  restoreFromBackup: (date: string, filename: string) => Promise<boolean>;

  // Object actions
  addObject: (name: string, width: number, height: number) => void;
  deleteObject: (id: string) => void;
  renameObject: (id: string, name: string) => void;
  resizeObject: (
    id: string,
    width: number,
    height: number,
    anchor?: import("../components/AnchorGrid/AnchorGrid").AnchorPosition,
  ) => void;
  selectObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  setObjectOrigin: (id: string, origin: { x: number; y: number }) => void;

  // Origin display color action
  setOriginColor: (color: import("../types").Color) => void;

  // Frame actions
  addFrame: (name: string, copyPrevious?: boolean) => void;
  deleteFrame: (id: string) => void;
  deleteSelectedFrame: () => void;
  renameFrame: (id: string, name: string) => void;
  selectFrame: (id: string, syncVariants?: boolean) => void;
  duplicateFrame: (id: string) => void;
  moveFrame: (id: string, direction: "left" | "right") => void;
  reorderFrame: (frameId: string, toIndex: number) => void;
  addFrameTag: (frameId: string, tag: string) => void;
  removeFrameTag: (frameId: string, tag: string) => void;

  // Layer actions
  addLayer: (name: string) => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleAllLayersVisibility: (visible: boolean) => void;
  selectLayer: (id: string) => void;
  moveLayer: (fromIndex: number, toIndex: number) => void;
  moveLayerAcrossAllFrames: (layerId: string, direction: "up" | "down") => void;
  deleteLayerAcrossAllFrames: (layerId: string) => void;
  squashLayerDown: (layerId: string) => void;
  squashLayerUp: (layerId: string) => void;
  squashLayerDownAcrossAllFrames: (layerId: string) => void;
  squashLayerUpAcrossAllFrames: (layerId: string) => void;
  moveLayerPixels: (dx: number, dy: number) => void;

  // Layer copy/paste actions
  copyLayerToClipboard: (layerId: string) => void;
  pasteLayerFromClipboard: (currentFrameOnly?: boolean) => void;
  copyLayerFromObject: (
    sourceObjectId: string,
    sourceLayerId: string,
    isVariant: boolean,
    variantGroupId?: string,
    variantId?: string,
  ) => void;

  // Timeline view actions
  addLayerToAllFrames: (name: string) => void;
  addLayerToFrameAtPosition: (
    frameId: string,
    name: string,
    position: number,
    variantInfo?: {
      isVariant?: boolean;
      variantGroupId?: string;
      selectedVariantId?: string;
      variantOffsets?: { [variantId: string]: { x: number; y: number } };
      variantOffset?: { x: number; y: number };
    },
  ) => string; // Returns layerId
  deleteLayerFromFrame: (frameId: string, layerId: string) => void;
  reorderLayerInFrame: (
    frameId: string,
    layerId: string,
    newIndex: number,
  ) => void;
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
  setEraserShape: (shape: "circle" | "square") => void;
  setPencilBrushShape: (shape: "circle" | "square") => void;
  setPencilBrushMax: (max: 8 | 16 | 32 | 64 | 128) => void;
  setTraceNudgeAmount: (amount: 10 | 20 | 25 | 50 | 100) => void;
  setNormalBrushShape: (shape: "circle" | "square") => void;
  setBitDepth: (depth: BitDepth) => void;
  setShapeMode: (mode: ShapeMode) => void;
  setBorderRadius: (radius: number) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setMoveAllLayers: (moveAll: boolean) => void;
  setFrameReferencePanelPosition: (position: {
    topPercent: number;
    leftPercent: number;
  }) => void;
  setFrameReferencePanelMinimized: (minimized: boolean) => void;
  setReferenceImagePanelPosition: (position: {
    topPercent: number;
    leftPercent: number;
  }) => void;
  setReferenceImagePanelMinimized: (minimized: boolean) => void;
  setCanvasInfoHidden: (hidden: boolean) => void;
  setObjectLibraryViewMode: (mode: "normal" | "small-rows" | "grid") => void;
  setTimelineThumbnailMode: (enabled: boolean) => void;
  toggleFocusMode: () => void;
  toggleLightGridMode: () => void;
  toggleFrameReferencePanelVisible: () => void;
  setGaussianFillParams: (params: {
    smoothing: number;
    radius: number;
    radiusMax?: number;
  }) => void;
  setSelectionMode: (mode: import("../types").SelectionMode) => void;
  setSelectionBehavior: (
    behavior: import("../types").SelectionBehavior,
  ) => void;

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
  setReferenceImage: (
    referenceImage:
      | {
          imageBase64: string;
          selectionBox: {
            startX: number;
            startY: number;
            endX: number;
            endY: number;
          };
        }
      | undefined,
  ) => void;

  // Frame trace actions
  setFrameTraceActive: (active: boolean, frameIndex: number | null) => void;
  moveFrameOverlay: (dx: number, dy: number) => void;
  resetFrameOverlay: () => void;

  // Frame reference object actions
  setFrameReferenceObjectId: (objectId: string | null) => void;
  getFrameReferenceObject: () => PixelObject | null;

  // Selection actions
  /** Rect select convenience. Converts the box to a pixel mask. */
  setSelection: (selection: SelectionBox | null) => void;
  /** Set/replace selection directly from a mask (used by flood/lasso/color-select). */
  setSelectionMask: (
    mask: Set<number> | null,
    dims: { width: number; height: number },
    op?: "replace" | "add" | "subtract",
  ) => void;
  clearSelection: () => void;
  moveSelectedPixels: (dx: number, dy: number) => void;
  moveSelection: (dx: number, dy: number) => void;
  deleteSelectionPixels: () => void;
  expandSelection: (steps?: number) => void;
  shrinkSelection: (steps?: number) => void;
  selectFloodFillAt: (x: number, y: number) => void;
  selectAllByColorAt: (x: number, y: number) => void;
  selectLasso: (points: Point[]) => void;

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
  renameVariant: (
    variantGroupId: string,
    variantId: string,
    name: string,
  ) => void;
  renameVariantGroup: (variantGroupId: string, name: string) => void;
  resizeVariant: (
    variantGroupId: string,
    variantId: string,
    width: number,
    height: number,
    anchor?: import("../components/AnchorGrid/AnchorGrid").AnchorPosition,
  ) => void;
  setVariantOffset: (dx: number, dy: number, allFrames?: boolean) => void;
  selectVariantFrame: (variantGroupId: string, frameIndex: number) => void;
  advanceVariantFrames: (delta: number) => void;
  duplicateVariantFrame: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
  ) => void;
  deleteVariantFrame: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
  ) => void;
  addVariantFrameTag: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
    tag: string,
  ) => void;
  removeVariantFrameTag: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
    tag: string,
  ) => void;
  addVariantFrame: (
    variantGroupId: string,
    variantId: string,
    copyPrevious?: boolean,
  ) => void;
  moveVariantFrame: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
    direction: "left" | "right",
  ) => void;
  reorderVariantFrame: (
    variantGroupId: string,
    variantId: string,
    frameId: string,
    toIndex: number,
  ) => void;
  // New variant layer management
  addVariantLayerFromExisting: (
    variantGroupId: string,
    selectedVariantId: string,
    addToAllFrames: boolean,
  ) => void;
  removeVariantLayer: (layerId: string) => void;

  // AI service actions
  setAiServiceUrl: (url: string) => void;

  // Lighting studio actions
  setStudioMode: (mode: StudioMode) => void;
  setLightingDataLayerEditMode: (mode: "normals" | "height") => void;
  setSelectedNormal: (normal: Normal) => void;
  setLightDirection: (normal: Normal) => void;
  setLightColor: (color: Color) => void;
  setAmbientColor: (color: Color) => void;
  setNormalPixel: (x: number, y: number, normal: Normal | 0) => void;
  setNormalPixels: (
    pixels: { x: number; y: number; normal: Normal | 0 }[],
  ) => void;
  setNormalPixelsForAllFrames: (
    pixels: { x: number; y: number; normal: Normal | 0 }[],
  ) => void;
  computeNormalsForAllFrames: (params: {
    startAngle: number;
    smoothing: number;
    radius: number;
  }) => void;
  setHeightPixels: (pixels: { x: number; y: number; height: number }[]) => void;
  setHeightScale: (scale: number) => void;
  setHeightBrushValue: (value: number) => void;
  setLightingPreviewPanelPosition: (position: {
    topPercent: number;
    leftPercent: number;
  }) => void;
  setLightingPreviewPanelMinimized: (minimized: boolean) => void;
  flipHorizontal: () => void;
  flipVertical: () => void;

  // Helpers
  getCurrentObject: () => PixelObject | null;
  getCurrentFrame: () => Frame | null;
  getCurrentLayer: () => Layer | null;
  getCurrentVariant: () => {
    variantGroup: VariantGroup;
    variant: Variant;
    variantFrame: VariantFrame;
    baseFrameIndex: number;
    offset: { x: number; y: number };
  } | null;
  getSelectedVariantLayer: () => Layer | null;
  isEditingVariant: () => boolean;
}

// Types for store module helper functions
export type StoreGet = () => EditorState;
export type StoreSet = (
  partial:
    | Partial<EditorState>
    | ((state: EditorState) => Partial<EditorState>),
) => void;
export type UpdateProjectAndSave = (
  updater: (project: Project) => Project,
  trackHistory?: boolean,
) => void;
