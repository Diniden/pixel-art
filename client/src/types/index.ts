export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Layer {
  id: string;
  name: string;
  pixels: (Pixel | 0)[][]; // 2D array [y][x], 0 means transparent/empty
  visible: boolean;
  // Variant-specific fields (only present if this is a variant layer)
  isVariant?: boolean;
  variantGroupId?: string;
  selectedVariantId?: string;
}

export interface Frame {
  id: string;
  name: string;
  layers: Layer[];
}

// ============================================
// Variant types
// ============================================

// A single frame within a variant, with its own layers
export interface VariantFrame {
  id: string;
  layers: Layer[]; // Regular layers (without variant fields)
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
  objects: PixelObject[];
  palettes: Palette[];
  uiState: UIState;
}

export interface UIState {
  selectedObjectId: string | null;
  selectedFrameId: string | null;
  selectedLayerId: string | null;
  selectedTool: Tool;
  selectedColor: Color;
  brushSize: number;
  bitDepth: BitDepth;
  shapeMode: ShapeMode;
  borderRadius: number;
  zoom: number;
  panOffset: { x: number; y: number };
  moveAllLayers: boolean;
  // Variant editing state
  variantFrameIndices?: { [variantGroupId: string]: number }; // Track current frame index for each variant group
}

export type Tool = 'pixel' | 'fill-square' | 'flood-fill' | 'line' | 'rectangle' | 'ellipse' | 'eraser' | 'move' | 'reference-trace' | 'eyedropper' | 'selection';

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BitDepth = 8 | 16 | 32;

export type ShapeMode = 'outline' | 'fill' | 'both';

export interface Point {
  x: number;
  y: number;
}

// Default values
export const DEFAULT_COLOR: Color = { r: 0, g: 0, b: 0, a: 255 };

export const DEFAULT_UI_STATE: UIState = {
  selectedObjectId: null,
  selectedFrameId: null,
  selectedLayerId: null,
  selectedTool: 'pixel',
  selectedColor: DEFAULT_COLOR,
  brushSize: 1,
  bitDepth: 8,
  shapeMode: 'both',
  borderRadius: 0,
  zoom: 10,
  panOffset: { x: 0, y: 0 },
  moveAllLayers: false,
  variantFrameIndices: {}
};

export function createEmptyPixelGrid(width: number, height: number): (Pixel | 0)[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 0)
  );
}

export function createDefaultLayer(id: string, name: string, width: number, height: number): Layer {
  return {
    id,
    name,
    pixels: createEmptyPixelGrid(width, height),
    visible: true
  };
}

export function createDefaultFrame(id: string, name: string, width: number, height: number): Frame {
  return {
    id,
    name,
    layers: [createDefaultLayer(`${id}-layer-1`, 'Layer 1', width, height)]
  };
}

export function createDefaultObject(id: string, name: string, width = 32, height = 32): PixelObject {
  return {
    id,
    name,
    gridSize: { width, height },
    frames: [createDefaultFrame(`${id}-frame-1`, 'Frame 1', width, height)]
  };
}

// Curated color palettes
export const BASE_PALETTES: Palette[] = [
  {
    id: 'palette-default',
    name: 'Default',
    colors: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 0, a: 255 },
      { r: 255, g: 0, b: 255, a: 255 },
      { r: 0, g: 255, b: 255, a: 255 },
    ]
  },
  {
    id: 'palette-skin-hair-eyes',
    name: 'Skin, Hair & Eyes',
    colors: [
      // Skin tones (light to dark)
      { r: 255, g: 224, b: 196, a: 255 }, // Fair
      { r: 255, g: 205, b: 178, a: 255 }, // Light
      { r: 234, g: 185, b: 157, a: 255 }, // Medium light
      { r: 210, g: 153, b: 121, a: 255 }, // Medium
      { r: 180, g: 120, b: 90, a: 255 },  // Tan
      { r: 141, g: 85, b: 60, a: 255 },   // Brown
      { r: 100, g: 60, b: 40, a: 255 },   // Dark brown
      { r: 60, g: 35, b: 25, a: 255 },    // Deep
      // Hair colors
      { r: 20, g: 15, b: 10, a: 255 },    // Black
      { r: 59, g: 48, b: 36, a: 255 },    // Dark brown
      { r: 111, g: 78, b: 55, a: 255 },   // Brown
      { r: 165, g: 107, b: 70, a: 255 },  // Auburn
      { r: 185, g: 55, b: 30, a: 255 },   // Red
      { r: 222, g: 188, b: 153, a: 255 }, // Blonde
      { r: 245, g: 222, b: 179, a: 255 }, // Light blonde
      { r: 192, g: 192, b: 192, a: 255 }, // Gray
      // Eye colors
      { r: 66, g: 41, b: 21, a: 255 },    // Dark brown
      { r: 130, g: 90, b: 50, a: 255 },   // Amber
      { r: 85, g: 107, b: 47, a: 255 },   // Hazel
      { r: 34, g: 139, b: 34, a: 255 },   // Green
      { r: 70, g: 130, b: 180, a: 255 },  // Blue
      { r: 135, g: 206, b: 235, a: 255 }, // Light blue
      { r: 105, g: 105, b: 105, a: 255 }, // Gray
    ]
  },
  {
    id: 'palette-earth-tones',
    name: 'Earth Tones',
    colors: [
      // Browns
      { r: 139, g: 90, b: 43, a: 255 },   // Saddle brown
      { r: 160, g: 82, b: 45, a: 255 },   // Sienna
      { r: 210, g: 180, b: 140, a: 255 }, // Tan
      { r: 188, g: 143, b: 143, a: 255 }, // Rosy brown
      { r: 101, g: 67, b: 33, a: 255 },   // Dark brown
      { r: 205, g: 133, b: 63, a: 255 },  // Peru
      // Reds/Oranges
      { r: 178, g: 34, b: 34, a: 255 },   // Brick red
      { r: 205, g: 92, b: 92, a: 255 },   // Indian red
      { r: 210, g: 105, b: 30, a: 255 },  // Chocolate
      { r: 184, g: 134, b: 11, a: 255 },  // Dark goldenrod
      // Yellows/Creams
      { r: 245, g: 245, b: 220, a: 255 }, // Beige
      { r: 255, g: 248, b: 220, a: 255 }, // Cornsilk
      { r: 189, g: 183, b: 107, a: 255 }, // Dark khaki
      { r: 218, g: 165, b: 32, a: 255 },  // Goldenrod
      // Grays/Stones
      { r: 128, g: 128, b: 128, a: 255 }, // Gray
      { r: 169, g: 169, b: 169, a: 255 }, // Dark gray
      { r: 112, g: 128, b: 144, a: 255 }, // Slate gray
      { r: 47, g: 79, b: 79, a: 255 },    // Dark slate gray
      // Muted blues/greens
      { r: 95, g: 158, b: 160, a: 255 },  // Cadet blue
      { r: 85, g: 107, b: 47, a: 255 },   // Olive drab
      { r: 128, g: 128, b: 0, a: 255 },   // Olive
    ]
  },
  {
    id: 'palette-plant-tones',
    name: 'Plant Tones',
    colors: [
      // Greens (light to dark)
      { r: 144, g: 238, b: 144, a: 255 }, // Light green
      { r: 152, g: 251, b: 152, a: 255 }, // Pale green
      { r: 124, g: 252, b: 0, a: 255 },   // Lawn green
      { r: 50, g: 205, b: 50, a: 255 },   // Lime green
      { r: 34, g: 139, b: 34, a: 255 },   // Forest green
      { r: 60, g: 179, b: 113, a: 255 },  // Medium sea green
      { r: 46, g: 139, b: 87, a: 255 },   // Sea green
      { r: 0, g: 128, b: 0, a: 255 },     // Green
      { r: 0, g: 100, b: 0, a: 255 },     // Dark green
      { r: 25, g: 60, b: 25, a: 255 },    // Very dark green
      // Olive/Yellow greens
      { r: 154, g: 205, b: 50, a: 255 },  // Yellow green
      { r: 173, g: 255, b: 47, a: 255 },  // Green yellow
      { r: 107, g: 142, b: 35, a: 255 },  // Olive drab
      { r: 85, g: 107, b: 47, a: 255 },   // Dark olive
      // Teal/Cyan (water plants)
      { r: 0, g: 139, b: 139, a: 255 },   // Dark cyan
      { r: 32, g: 178, b: 170, a: 255 },  // Light sea green
      { r: 102, g: 205, b: 170, a: 255 }, // Medium aquamarine
      // Flowers/Fruits
      { r: 255, g: 182, b: 193, a: 255 }, // Light pink
      { r: 255, g: 105, b: 180, a: 255 }, // Hot pink
      { r: 186, g: 85, b: 211, a: 255 },  // Medium orchid
      { r: 255, g: 215, b: 0, a: 255 },   // Gold
      { r: 255, g: 165, b: 0, a: 255 },   // Orange
      // Bark/Wood
      { r: 139, g: 90, b: 43, a: 255 },   // Saddle brown
      { r: 101, g: 67, b: 33, a: 255 },   // Dark wood
    ]
  }
];

export function createDefaultProject(): Project {
  const defaultObject = createDefaultObject('obj-1', 'Object 1');
  return {
    objects: [defaultObject],
    palettes: [...BASE_PALETTES],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: defaultObject.id,
      selectedFrameId: defaultObject.frames[0].id,
      selectedLayerId: defaultObject.frames[0].layers[0].id
    }
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// Compact format conversion utilities
// ============================================

// Convert RGBA to a single hex number (0xRRGGBBAA)
export function rgbaToHex(pixel: Pixel | Color): number {
  return ((pixel.r & 0xFF) << 24) | ((pixel.g & 0xFF) << 16) | ((pixel.b & 0xFF) << 8) | (pixel.a & 0xFF);
}

// Convert hex number back to RGBA object
export function hexToRgba(hex: number): Pixel {
  return {
    r: (hex >>> 24) & 0xFF,
    g: (hex >>> 16) & 0xFF,
    b: (hex >>> 8) & 0xFF,
    a: hex & 0xFF
  };
}

// Compact types for storage (matching runtime types but with hex colors)
export interface CompactLayer {
  id: string;
  name: string;
  pixels: number[][]; // hex numbers instead of Pixel objects, 0 means transparent/empty
  visible: boolean;
  // Variant-specific fields (only present if this is a variant layer)
  isVariant?: boolean;
  variantGroupId?: string;
  selectedVariantId?: string;
}

export interface CompactFrame {
  id: string;
  name: string;
  layers: CompactLayer[];
}

// Compact variant types
export interface CompactVariantFrame {
  id: string;
  layers: CompactLayer[];
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
  brushSize: number;
  bitDepth: BitDepth;
  shapeMode: ShapeMode;
  borderRadius: number;
  zoom: number;
  panOffset: { x: number; y: number };
  moveAllLayers: boolean;
  variantFrameIndices?: { [variantGroupId: string]: number };
}

export interface CompactProject {
  objects: CompactPixelObject[];
  palettes: CompactPalette[];
  uiState: CompactUIState;
}

// Helper to convert a layer to compact format
function layerToCompact(layer: Layer): CompactLayer {
  const compactLayer: CompactLayer = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    pixels: layer.pixels.map(row =>
      row.map(pixel => pixel === 0 ? 0 : rgbaToHex(pixel))
    )
  };
  // Include variant fields if present
  if (layer.isVariant) {
    compactLayer.isVariant = layer.isVariant;
    compactLayer.variantGroupId = layer.variantGroupId;
    compactLayer.selectedVariantId = layer.selectedVariantId;
  }
  return compactLayer;
}

// Helper to convert variant groups to compact format
function variantGroupsToCompact(groups: VariantGroup[] | undefined): CompactVariantGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  return groups.map(group => ({
    id: group.id,
    name: group.name,
    variants: group.variants.map(variant => ({
      id: variant.id,
      name: variant.name,
      gridSize: variant.gridSize,
      frames: variant.frames.map(frame => ({
        id: frame.id,
        layers: frame.layers.map(layerToCompact)
      })),
      baseFrameOffsets: variant.baseFrameOffsets
    }))
  }));
}

// Convert runtime Project to compact format for saving
export function projectToCompact(project: Project): CompactProject {
  return {
    objects: project.objects.map(obj => ({
      id: obj.id,
      name: obj.name,
      gridSize: obj.gridSize,
      frames: obj.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        layers: frame.layers.map(layerToCompact)
      })),
      variantGroups: variantGroupsToCompact(obj.variantGroups)
    })),
    palettes: project.palettes.map(palette => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors.map(color => rgbaToHex(color))
    })),
    uiState: {
      ...project.uiState,
      selectedColor: rgbaToHex(project.uiState.selectedColor)
    }
  };
}

// Helper to convert compact layer back to runtime format
function compactToLayer(layer: CompactLayer): Layer {
  const runtimeLayer: Layer = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    pixels: layer.pixels.map(row =>
      row.map(pixel => pixel === 0 ? 0 : hexToRgba(pixel))
    )
  };
  // Include variant fields if present
  if (layer.isVariant) {
    runtimeLayer.isVariant = layer.isVariant;
    runtimeLayer.variantGroupId = layer.variantGroupId;
    runtimeLayer.selectedVariantId = layer.selectedVariantId;
  }
  return runtimeLayer;
}

// Helper to convert compact variant groups back to runtime format
function compactToVariantGroups(groups: CompactVariantGroup[] | undefined): VariantGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  return groups.map(group => ({
    id: group.id,
    name: group.name,
    variants: group.variants.map(variant => {
      // Handle migration from old format (offset on frames) to new format (baseFrameOffsets)
      let baseFrameOffsets = variant.baseFrameOffsets;
      if (!baseFrameOffsets || Object.keys(baseFrameOffsets).length === 0) {
        // Migrate from old format: use the offset from the first frame for all base frames
        // This is a reasonable default since old format had offsets per variant frame
        baseFrameOffsets = {};
        // Check if frames have old-style offsets
        const firstFrameWithOffset = variant.frames.find(f => f.offset);
        if (firstFrameWithOffset?.offset) {
          // Use the first frame's offset as default for base frame 0
          // Other base frames will get this default offset too
          for (let i = 0; i < Math.max(variant.frames.length, 10); i++) {
            const frameOffset = variant.frames[i]?.offset;
            baseFrameOffsets[i] = frameOffset || firstFrameWithOffset.offset;
          }
        } else {
          // No offsets found, use default (0, 0)
          baseFrameOffsets[0] = { x: 0, y: 0 };
        }
      }

      return {
        id: variant.id,
        name: variant.name,
        gridSize: variant.gridSize,
        frames: variant.frames.map(frame => ({
          id: frame.id,
          layers: frame.layers.map(compactToLayer)
        })),
        baseFrameOffsets
      };
    })
  }));
}

// Convert compact format back to runtime Project
export function compactToProject(compact: CompactProject): Project {
  return {
    objects: compact.objects.map(obj => ({
      id: obj.id,
      name: obj.name,
      gridSize: obj.gridSize,
      frames: obj.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        layers: frame.layers.map(compactToLayer)
      })),
      variantGroups: compactToVariantGroups(obj.variantGroups)
    })),
    palettes: compact.palettes.map(palette => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors.map(hex => hexToRgba(hex))
    })),
    uiState: {
      ...compact.uiState,
      selectedColor: hexToRgba(compact.uiState.selectedColor)
    }
  };
}

// Check if a project is in compact format (colors are numbers, not objects)
export function isCompactFormat(data: unknown): data is CompactProject {
  if (!data || typeof data !== 'object') return false;
  const project = data as Record<string, unknown>;

  // Check if palettes exist and have numeric colors
  if (Array.isArray(project.palettes) && project.palettes.length > 0) {
    const palette = project.palettes[0] as Record<string, unknown>;
    if (Array.isArray(palette.colors) && palette.colors.length > 0) {
      return typeof palette.colors[0] === 'number';
    }
  }

  // Check uiState.selectedColor
  if (project.uiState && typeof project.uiState === 'object') {
    const uiState = project.uiState as Record<string, unknown>;
    return typeof uiState.selectedColor === 'number';
  }

  return false;
}

