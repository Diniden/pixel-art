import type { Color, Normal, Palette, PixelData, UIState } from "./domain";

// Default values
export const DEFAULT_COLOR: Color = { r: 0, g: 0, b: 0, a: 255 };

// Default normal pointing straight out of the screen (0, 0, 255)
export const DEFAULT_NORMAL: Normal = { x: 0, y: 0, z: 255 };

// Default light direction (coming from top-left-front)
export const DEFAULT_LIGHT_DIRECTION: Normal = { x: -64, y: -64, z: 180 };

// Default light color (warm white)
export const DEFAULT_LIGHT_COLOR: Color = { r: 255, g: 250, b: 240, a: 255 };

// Default ambient color (soft blue-gray)
export const DEFAULT_AMBIENT_COLOR: Color = { r: 40, g: 45, b: 60, a: 255 };

// Empty pixel data constant
export const EMPTY_PIXEL_DATA: PixelData = { color: 0, normal: 0, height: 0 };

export const DEFAULT_UI_STATE: UIState = {
  selectedObjectId: null,
  selectedFrameId: null,
  selectedLayerId: null,
  selectedTool: "pixel",
  selectedColor: DEFAULT_COLOR,
  selectionMode: "rect",
  selectionBehavior: "movePixels",
  focusMode: false,
  brushSize: 1,
  bitDepth: 8,
  shapeMode: "both",
  borderRadius: 0,
  zoom: 10,
  panOffset: { x: 0, y: 0 },
  moveAllLayers: false,
  eraserShape: "circle",
  pencilBrushShape: "square",
  pencilBrushMax: 16,
  traceNudgeAmount: 10,
  variantFrameIndices: {},
  // Lighting studio defaults
  studioMode: "pixel",
  lightingDataLayerEditMode: "normals",
  selectedNormal: DEFAULT_NORMAL,
  normalBrushShape: "circle",
  lightDirection: DEFAULT_LIGHT_DIRECTION,
  lightColor: DEFAULT_LIGHT_COLOR,
  ambientColor: DEFAULT_AMBIENT_COLOR,
  heightScale: 100, // Default height scale for shadow calculation
  heightBrushValue: 128,
  objectLibraryViewMode: "normal",
  timelineThumbnailMode: false,
  gaussianFill: {
    smoothing: 1.0,
    radius: 2.0,
    radiusMax: 16,
  },
};

// Curated color palettes
export const BASE_PALETTES: Palette[] = [
  {
    id: "palette-default",
    name: "Default",
    colors: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 0, a: 255 },
      { r: 255, g: 0, b: 255, a: 255 },
      { r: 0, g: 255, b: 255, a: 255 },
    ],
  },
  {
    id: "palette-skin-hair-eyes",
    name: "Skin, Hair & Eyes",
    colors: [
      // Skin tones (light to dark)
      { r: 255, g: 224, b: 196, a: 255 }, // Fair
      { r: 255, g: 205, b: 178, a: 255 }, // Light
      { r: 234, g: 185, b: 157, a: 255 }, // Medium light
      { r: 210, g: 153, b: 121, a: 255 }, // Medium
      { r: 180, g: 120, b: 90, a: 255 }, // Tan
      { r: 141, g: 85, b: 60, a: 255 }, // Brown
      { r: 100, g: 60, b: 40, a: 255 }, // Dark brown
      { r: 60, g: 35, b: 25, a: 255 }, // Deep
      // Hair colors
      { r: 20, g: 15, b: 10, a: 255 }, // Black
      { r: 59, g: 48, b: 36, a: 255 }, // Dark brown
      { r: 111, g: 78, b: 55, a: 255 }, // Brown
      { r: 165, g: 107, b: 70, a: 255 }, // Auburn
      { r: 185, g: 55, b: 30, a: 255 }, // Red
      { r: 222, g: 188, b: 153, a: 255 }, // Blonde
      { r: 245, g: 222, b: 179, a: 255 }, // Light blonde
      { r: 192, g: 192, b: 192, a: 255 }, // Gray
      // Eye colors
      { r: 66, g: 41, b: 21, a: 255 }, // Dark brown
      { r: 130, g: 90, b: 50, a: 255 }, // Amber
      { r: 85, g: 107, b: 47, a: 255 }, // Hazel
      { r: 34, g: 139, b: 34, a: 255 }, // Green
      { r: 70, g: 130, b: 180, a: 255 }, // Blue
      { r: 135, g: 206, b: 235, a: 255 }, // Light blue
      { r: 105, g: 105, b: 105, a: 255 }, // Gray
    ],
  },
  {
    id: "palette-earth-tones",
    name: "Earth Tones",
    colors: [
      // Browns
      { r: 139, g: 90, b: 43, a: 255 }, // Saddle brown
      { r: 160, g: 82, b: 45, a: 255 }, // Sienna
      { r: 210, g: 180, b: 140, a: 255 }, // Tan
      { r: 188, g: 143, b: 143, a: 255 }, // Rosy brown
      { r: 101, g: 67, b: 33, a: 255 }, // Dark brown
      { r: 205, g: 133, b: 63, a: 255 }, // Peru
      // Reds/Oranges
      { r: 178, g: 34, b: 34, a: 255 }, // Brick red
      { r: 205, g: 92, b: 92, a: 255 }, // Indian red
      { r: 210, g: 105, b: 30, a: 255 }, // Chocolate
      { r: 184, g: 134, b: 11, a: 255 }, // Dark goldenrod
      // Yellows/Creams
      { r: 245, g: 245, b: 220, a: 255 }, // Beige
      { r: 255, g: 248, b: 220, a: 255 }, // Cornsilk
      { r: 189, g: 183, b: 107, a: 255 }, // Dark khaki
      { r: 218, g: 165, b: 32, a: 255 }, // Goldenrod
      // Grays/Stones
      { r: 128, g: 128, b: 128, a: 255 }, // Gray
      { r: 169, g: 169, b: 169, a: 255 }, // Dark gray
      { r: 112, g: 128, b: 144, a: 255 }, // Slate gray
      { r: 47, g: 79, b: 79, a: 255 }, // Dark slate gray
      // Muted blues/greens
      { r: 95, g: 158, b: 160, a: 255 }, // Cadet blue
      { r: 85, g: 107, b: 47, a: 255 }, // Olive drab
      { r: 128, g: 128, b: 0, a: 255 }, // Olive
    ],
  },
  {
    id: "palette-plant-tones",
    name: "Plant Tones",
    colors: [
      // Greens (light to dark)
      { r: 144, g: 238, b: 144, a: 255 }, // Light green
      { r: 152, g: 251, b: 152, a: 255 }, // Pale green
      { r: 124, g: 252, b: 0, a: 255 }, // Lawn green
      { r: 50, g: 205, b: 50, a: 255 }, // Lime green
      { r: 34, g: 139, b: 34, a: 255 }, // Forest green
      { r: 60, g: 179, b: 113, a: 255 }, // Medium sea green
      { r: 46, g: 139, b: 87, a: 255 }, // Sea green
      { r: 0, g: 128, b: 0, a: 255 }, // Green
      { r: 0, g: 100, b: 0, a: 255 }, // Dark green
      { r: 25, g: 60, b: 25, a: 255 }, // Very dark green
      // Olive/Yellow greens
      { r: 154, g: 205, b: 50, a: 255 }, // Yellow green
      { r: 173, g: 255, b: 47, a: 255 }, // Green yellow
      { r: 107, g: 142, b: 35, a: 255 }, // Olive drab
      { r: 85, g: 107, b: 47, a: 255 }, // Dark olive
      // Teal/Cyan (water plants)
      { r: 0, g: 139, b: 139, a: 255 }, // Dark cyan
      { r: 32, g: 178, b: 170, a: 255 }, // Light sea green
      { r: 102, g: 205, b: 170, a: 255 }, // Medium aquamarine
      // Flowers/Fruits
      { r: 255, g: 182, b: 193, a: 255 }, // Light pink
      { r: 255, g: 105, b: 180, a: 255 }, // Hot pink
      { r: 186, g: 85, b: 211, a: 255 }, // Medium orchid
      { r: 255, g: 215, b: 0, a: 255 }, // Gold
      { r: 255, g: 165, b: 0, a: 255 }, // Orange
      // Bark/Wood
      { r: 139, g: 90, b: 43, a: 255 }, // Saddle brown
      { r: 101, g: 67, b: 33, a: 255 }, // Dark wood
    ],
  },
];
