import type { Frame, Layer, PixelData, PixelObject, Project } from "./domain";
import { BASE_PALETTES, DEFAULT_UI_STATE } from "./constants";

export function createEmptyPixelGrid(
  width: number,
  height: number,
): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ color: 0, normal: 0, height: 0 })),
  );
}

export function createDefaultLayer(
  id: string,
  name: string,
  width: number,
  height: number,
): Layer {
  return {
    id,
    name,
    pixels: createEmptyPixelGrid(width, height),
    visible: true,
  };
}

export function createDefaultFrame(
  id: string,
  name: string,
  width: number,
  height: number,
): Frame {
  return {
    id,
    name,
    layers: [createDefaultLayer(`${id}-layer-1`, "Layer 1", width, height)],
  };
}

export function createDefaultObject(
  id: string,
  name: string,
  width = 32,
  height = 32,
): PixelObject {
  return {
    id,
    name,
    gridSize: { width, height },
    frames: [createDefaultFrame(`${id}-frame-1`, "Frame 1", width, height)],
  };
}

export function createDefaultProject(): Project {
  const defaultObject = createDefaultObject("obj-1", "Object 1");
  return {
    version: "1.1.0",
    objects: [defaultObject],
    palettes: [...BASE_PALETTES],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: defaultObject.id,
      selectedFrameId: defaultObject.frames[0].id,
      selectedLayerId: defaultObject.frames[0].layers[0].id,
    },
    variants: [],
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
