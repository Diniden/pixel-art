import type {
  BitDepth,
  EyedropperMode,
  PersistedLayoutPreset,
  PersistedPosePreset,
  PersistedRailLayout,
  SelectionBehavior,
  SelectionMode,
  ShapeMode,
  StudioMode,
  Tool,
} from "../domain";

// Compact pixel data for storage
// [colorHex, normalPacked, height] where normalPacked = (x+128) << 16 | (y+128) << 8 | z
// If all are 0, represents empty pixel
export type CompactPixelData = [number, number, number] | 0;

// Compact types for storage (matching runtime types but with hex colors)
export interface CompactLayer {
  id: string;
  name: string;
  pixels: CompactPixelData[][]; // Compact pixel data or 0 for empty
  visible: boolean;
  // Variant-specific fields (only present if this is a variant layer)
  isVariant?: boolean;
  variantGroupId?: string;
  selectedVariantId?: string;
  // Per-layer, per-variant-type offsets for positioning variant within the frame
  // Key is the variant ID (variant type), value is the offset for that variant type
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  // DEPRECATED: Single offset for backward compatibility during migration
  variantOffset?: { x: number; y: number };
}

export interface CompactFrame {
  id: string;
  name: string;
  layers: CompactLayer[];
  tags?: string[];
}

// Compact variant types
export interface CompactVariantFrame {
  id: string;
  layers: CompactLayer[];
  tags?: string[];
  // DEPRECATED: offset is now stored in CompactVariant.baseFrameOffsets
  offset?: { x: number; y: number };
}

export interface CompactVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactVariantFrame[];
  // Offset for this variant at each base frame index
  baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } };
}

export interface CompactVariantGroup {
  id: string;
  name: string;
  variants: CompactVariant[];
}

export interface CompactPixelObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactFrame[];
  // Origin anchor point (offset from top-left of object's render region)
  origin?: { x: number; y: number };
  // DEPRECATED: variantGroups now live at project level
  // Kept for backwards compatibility during migration
  variantGroups?: CompactVariantGroup[];
}

export interface CompactPalette {
  id: string;
  name: string;
  colors: number[]; // hex numbers instead of Color objects
}

export interface CompactUIState {
  selectedObjectId: string | null;
  selectedFrameId: string | null;
  selectedLayerId: string | null;
  selectedTool: Tool;
  selectedColor: number; // hex number
  /**
   * The FILL colour, as a hex number (2026-09-01).
   *
   * ⚠️ Conditional, like `hiddenRails` above: absent until the user picks a
   * fill colour distinct from the edge colour, so an untouched project's key
   * set — and therefore its corpus digest — is unchanged. Readers fall back to
   * `selectedColor` (`ToolUIStore.fillColorOrSelected`).
   */
  fillColor?: number;
  selectionMode?: SelectionMode;
  selectionBehavior?: SelectionBehavior;
  focusMode?: boolean;
  /**
   * Dismissed rails (2026-08-30). Conditional: absent until a rail is
   * hidden, so an untouched project's key set is unchanged.
   */
  hiddenRails?: string[];
  lightGridMode?: boolean;
  pencilOnly?: boolean;
  brushSize: number;
  bitDepth: BitDepth;
  shapeMode: ShapeMode;
  borderRadius: number;
  zoom: number;
  panOffset: { x: number; y: number };
  moveAllLayers: boolean;
  eraserShape?: "circle" | "square"; // Optional for backward compatibility
  pencilBrushShape?: "circle" | "square"; // Optional for backward compatibility
  pencilBrushMax?: 8 | 16 | 32 | 64 | 128; // Optional for backward compatibility
  traceNudgeAmount?: 10 | 20 | 25 | 50 | 100; // Optional for backward compatibility
  normalBrushShape?: "circle" | "square"; // Optional for backward compatibility
  variantFrameIndices?: { [variantGroupId: string]: number };
  layerSelectionCounter?: number; // Increments on every layer click (even re-selection) to detect layer clicks
  // Lighting studio state
  studioMode: StudioMode;
  lightingDataLayerEditMode?: "normals" | "height";
  selectedNormal: number; // packed normal
  lightDirection: number; // packed normal
  lightColor: number; // hex color
  ambientColor: number; // hex color
  heightScale?: number; // Height scale factor (optional for backward compatibility)
  heightBrushValue?: number;
  frameReferencePanelPosition?: { topPercent: number; leftPercent: number };
  frameReferencePanelMinimized?: boolean;
  frameReferencePanelVisible?: boolean;
  // Reference image panel state (position stored as percentage of canvas area)
  referenceImagePanelPosition?: { topPercent: number; leftPercent: number };
  referenceImagePanelMinimized?: boolean;
  canvasInfoHidden?: boolean;
  objectLibraryViewMode?: "normal" | "small-rows" | "grid";
  timelineThumbnailMode?: boolean;
  // Origin display color (hex number)
  originColor?: number;
  lightingPreviewPanelPosition?: { topPercent: number; leftPercent: number };
  lightingPreviewPanelMinimized?: boolean;

  // Flood fill (bucket) options
  gaussianFill?: {
    smoothing: number;
    radius: number;
    radiusMax?: number;
  };

  // AI frame interpolation service URL (remote machine)
  aiServiceUrl?: string;

  // Shell chrome. Both are CONDITIONALLY present: absent until the user
  // changes something, so an untouched project's key set is unchanged (R3).
  // `railLayouts` is keyed by device class; `theme` is one per project.
  railLayouts?: { [deviceClass: string]: PersistedRailLayout };
  /**
   * The user's own saved layouts, keyed by device class (2026-08-30).
   * Conditional for the same reason as `railLayouts`: absent until the user
   * saves one, so an untouched project's key set is unchanged.
   */
  layoutPresets?: { [deviceClass: string]: PersistedLayoutPreset[] };
  /**
   * The user's saved POSE SCENE presets (plan 08, 2026-09-04). Conditional
   * for exactly the same reason as `layoutPresets`, and the reason is the
   * owner's 151 backup snapshots: `PoseUIStore.toPersistedPosePresets()`
   * returns `undefined` until one is saved and the builder emits it through
   * `assign()`, so an untouched project gains no key and no digest moves
   * (**F13**). ⚠️ Only the PRESETS persist — the live pose is session-only.
   */
  posePresets?: PersistedPosePreset[];
  theme?: string;
  /** Canvas view-transform scale. Conditional: absent until the user zooms. */
  viewZoom?: number;
  /**
   * The eyedropper's post-sample behaviour. Conditional for the same reason:
   * absent until the user picks a mode, so no existing project gains a key.
   */
  eyedropperMode?: EyedropperMode;
}

export interface CompactProject {
  version?: string; // Matches package.json version
  objects: CompactPixelObject[];
  palettes: CompactPalette[];
  uiState: CompactUIState;
  // Project-level variants (new in version 1.1.0)
  variants?: CompactVariantGroup[];
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
