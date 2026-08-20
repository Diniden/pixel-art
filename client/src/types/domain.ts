export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Normal vector for lighting calculations
// x, y are signed bytes (-128 to 127), z is unsigned byte (0 to 255, always positive toward screen)
// All zeros (0, 0, 0) means no normal data
export interface Normal {
  x: number; // Signed byte (-128 to 127)
  y: number; // Signed byte (-128 to 127)
  z: number; // Unsigned byte (0 to 255, always positive)
}

// Complete pixel data including color, normal, and height
export interface PixelData {
  color: Pixel | 0; // RGBA color (0 = empty/transparent)
  normal: Normal | 0; // Normal map data (0 = no normal)
  height: number; // Height map (0 = no height data, 1-255 = height values)
}

export interface Layer {
  id: string;
  name: string;
  pixels: PixelData[][]; // 2D array [y][x] with full pixel data
  visible: boolean;
  // Variant-specific fields (only present if this is a variant layer)
  isVariant?: boolean;
  variantGroupId?: string; // Reference to project-level VariantGroup
  selectedVariantId?: string; // Reference to which Variant (variant type) is selected
  // Per-layer, per-variant-type offsets for positioning variant within the frame
  // Key is the variant ID (variant type), value is the offset for that variant type
  // This allows different variant types to have independent positioning when selected
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  // DEPRECATED: Single offset for backward compatibility during migration
  variantOffset?: { x: number; y: number };
}

export interface Frame {
  id: string;
  name: string;
  layers: Layer[];
  tags?: string[];
}

// ============================================
// Variant types
// ============================================

// A single frame within a variant, with its own layers
export interface VariantFrame {
  id: string;
  layers: Layer[]; // Regular layers (without variant fields)
  tags?: string[];
  // DEPRECATED: offset is now stored in Variant.baseFrameOffsets
  // Kept for backwards compatibility during migration
  offset?: { x: number; y: number };
}

// A single variant definition
export interface Variant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: VariantFrame[];
  // Offset for this variant at each base frame index
  // Key is base frame index (0, 1, 2, ...), value is the offset
  baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } };
}

// A group of variants (all alternatives for a layer)
export interface VariantGroup {
  id: string;
  name: string; // Display name (original layer name)
  variants: Variant[];
}

export interface PixelObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: Frame[];
  // Origin anchor point (offset from top-left of object's render region)
  origin?: { x: number; y: number };
  // DEPRECATED: variantGroups now live at project level
  // Kept for backwards compatibility during migration
  variantGroups?: VariantGroup[];
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Palette {
  id: string;
  name: string;
  colors: Color[];
}

export interface Project {
  version?: string; // Matches package.json version
  objects: PixelObject[];
  palettes: Palette[];
  uiState: UIState;
  // Project-level variants (new in version 1.1.0)
  // Variants are shared across all objects - editing affects all objects using them
  variants?: VariantGroup[];
  // Reference image data (base64 encoded image and selection box)
  referenceImage?: {
    imageBase64: string; // Base64 encoded image data
    selectionBox: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    };
  };
}

export interface UIState {
  selectedObjectId: string | null;
  selectedFrameId: string | null;
  selectedLayerId: string | null;
  selectedTool: Tool;
  selectedColor: Color;
  // Selection tool options
  selectionMode?: SelectionMode;
  selectionBehavior?: SelectionBehavior;
  // Focus mode: hide side/bottom panels for distraction-free editing
  focusMode?: boolean;
  // Light grid mode: use a light background for the canvas grid instead of dark
  lightGridMode?: boolean;
  brushSize: number;
  bitDepth: BitDepth;
  shapeMode: ShapeMode;
  borderRadius: number;
  zoom: number;
  panOffset: { x: number; y: number };
  moveAllLayers: boolean;
  eraserShape: "circle" | "square";
  // Pixel pencil brush settings
  pencilBrushShape: "circle" | "square";
  pencilBrushMax: 8 | 16 | 32 | 64 | 128;
  // Trace mode nudge: how far Shift+WASD moves reference/frame trace offsets
  traceNudgeAmount: 10 | 20 | 25 | 50 | 100;
  // Variant editing state
  variantFrameIndices?: { [variantGroupId: string]: number }; // Track current frame index for each variant group
  layerSelectionCounter?: number; // Increments on every layer click (even re-selection) to detect layer clicks
  // Lighting studio state
  studioMode: StudioMode;
  // Which lighting data layer the pencil edits
  lightingDataLayerEditMode?: "normals" | "height";
  selectedNormal: Normal;
  lightDirection: Normal;
  lightColor: Color;
  ambientColor: Color;
  heightScale: number; // Height scale factor for shadow calculation (default: 100)
  // Height brush value (0 clears height, 1-255 paints height)
  heightBrushValue?: number;
  normalBrushShape: "circle" | "square"; // Shape for normal brush tool
  // Frame reference panel state (position stored as percentage of canvas area)
  frameReferencePanelPosition?: { topPercent: number; leftPercent: number };
  frameReferencePanelMinimized?: boolean;
  frameReferencePanelVisible?: boolean;
  // Reference image panel state (position stored as percentage of canvas area)
  referenceImagePanelPosition?: { topPercent: number; leftPercent: number };
  referenceImagePanelMinimized?: boolean;
  // Lighting preview panel (floating) state (position stored as percentage of canvas area)
  lightingPreviewPanelPosition?: { topPercent: number; leftPercent: number };
  lightingPreviewPanelMinimized?: boolean;
  // Canvas info panel state
  canvasInfoHidden?: boolean;
  // Object library view mode
  objectLibraryViewMode?: "normal" | "small-rows" | "grid";
  // Timeline thumbnail mode
  timelineThumbnailMode?: boolean;
  // Origin display color
  originColor?: Color;

  // Flood fill (bucket) options
  gaussianFill?: {
    smoothing: number;
    radius: number;
    radiusMax?: number;
  };

  // AI frame interpolation service URL (remote machine)
  aiServiceUrl?: string;
}

export type Tool =
  | "pixel"
  | "fill-square"
  | "flood-fill"
  | "gaussian-fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "eraser"
  | "move"
  | "reference-trace"
  | "eyedropper"
  | "selection"
  | "origin"
  | "normal-pencil"
  | "auto-normal"
  | "height-map";

export type StudioMode = "pixel" | "lighting";

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SelectionMode = "rect" | "flood" | "lasso" | "color";
export type SelectionBehavior = "movePixels" | "moveSelection" | "editMask";

export type BitDepth = 8 | 16 | 32;

export type ShapeMode = "outline" | "fill" | "both";

export interface Point {
  x: number;
  y: number;
}

/**
 * A single timestamped backup file on disk.
 *
 * REFRESH task 36 (W27): this interface used to live in
 * `src/api/resources/backupApi.ts`. `BrowseBackupsModal` moved into `ui/`,
 * where the ESLint purity boundary bans every `api` path — and it bans them for TYPE
 * imports too, since a `import type` still names the forbidden module.
 *
 * It is a plain three-string DTO with no transport concerns, so it belongs in
 * the domain layer rather than the API layer. `backupApi` re-exports it from
 * here, which keeps every existing `from "../../api"` import working unchanged.
 */
export interface BackupEntry {
  date: string;
  time: string;
  filename: string;
}

/**
 * The resolved variant context — the shape `helpers.getCurrentVariant` returned.
 *
 * REFRESH task 36 (W27): moved here from `stores/ApplicationStore.ts` so that
 * `HeightMapModal` — now pure and living in `ui/` — can name it. The `ui/`
 * purity boundary bans every `stores` path for type imports too, and this interface
 * is a pure composition of domain types with no store behaviour, so the domain
 * layer is where it belongs. `ApplicationStore` re-exports it, leaving every
 * existing importer unchanged.
 */
export interface CurrentVariant {
  variantGroup: VariantGroup;
  variant: Variant;
  variantFrame: VariantFrame;
  baseFrameIndex: number;
  offset: { x: number; y: number };
}
