import type { Color, Normal, UIState } from "@/types";
import { cyan, normalFlat, normalTopLeftFront } from "./colors";

/**
 * `UIState` fixtures.
 *
 * ⚠️ Written as an EXPLICIT, FIELD-BY-FIELD literal, not as
 * `{ ...DEFAULT_UI_STATE, ... }`.
 *
 * That is deliberate and it is the same reasoning as R3 in the risk register:
 * all 44 `uiState` fields are part of the persisted wire format, and a fixture
 * that spreads the production default silently absorbs any future field change.
 * A wire-format test built on such a fixture would keep passing while the
 * payload drifted. Writing it out means adding a field to `UIState` shows up
 * here as a type error, which is exactly the signal wanted.
 */

const lightColor: Color = { r: 255, g: 250, b: 240, a: 255 };
const ambientColor: Color = { r: 40, g: 45, b: 60, a: 255 };
const lightDirection: Normal = normalTopLeftFront;

export function makeUIState(overrides: Partial<UIState> = {}): UIState {
  const base: UIState = {
    selectedObjectId: null,
    selectedFrameId: null,
    selectedLayerId: null,
    selectedTool: "pixel",
    selectedColor: { ...cyan },
    selectionMode: "rect",
    selectionBehavior: "movePixels",
    focusMode: false,
    lightGridMode: false,
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
    layerSelectionCounter: 0,
    studioMode: "pixel",
    lightingDataLayerEditMode: "normals",
    selectedNormal: { ...normalFlat },
    lightDirection: { ...lightDirection },
    lightColor: { ...lightColor },
    ambientColor: { ...ambientColor },
    heightScale: 100,
    heightBrushValue: 128,
    normalBrushShape: "circle",
    canvasInfoHidden: false,
    objectLibraryViewMode: "normal",
    timelineThumbnailMode: false,
    gaussianFill: { smoothing: 1.0, radius: 2.0, radiusMax: 16 },
  };
  return { ...base, ...overrides };
}

/** Nothing selected — the empty-project state. */
export const uiStateEmpty: UIState = makeUIState();

/** Pixel studio, with the hero object / first frame / first layer selected. */
export const uiStateTypical: UIState = makeUIState({
  selectedObjectId: "obj-hero",
  selectedFrameId: "obj-hero-frame-1",
  selectedLayerId: "obj-hero-frame-1-layer-2",
  brushSize: 3,
  zoom: 16,
  panOffset: { x: 24, y: -12 },
});

/**
 * Lighting studio, mid-edit. `studioMode: "lighting"` gates an entire second
 * half of the UI, so a fixture that only ever says `"pixel"` leaves it untested.
 */
export const uiStateLighting: UIState = makeUIState({
  selectedObjectId: "obj-hero",
  selectedFrameId: "obj-hero-frame-1",
  selectedLayerId: "obj-hero-frame-1-layer-2",
  studioMode: "lighting",
  selectedTool: "normal-pencil",
  lightingDataLayerEditMode: "normals",
  heightScale: 140,
});

/** Focus mode on: side and bottom panels hidden. */
export const uiStateFocus: UIState = makeUIState({
  selectedObjectId: "obj-hero",
  selectedFrameId: "obj-hero-frame-1",
  selectedLayerId: "obj-hero-frame-1-layer-2",
  focusMode: true,
});
