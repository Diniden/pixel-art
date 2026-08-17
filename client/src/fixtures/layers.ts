import type { Layer, PixelData } from "@/types";
import {
  makeBorderGrid,
  makeCheckerGrid,
  makeEmptyGrid,
  makeSpriteGrid,
} from "./pixels";

/**
 * Layer builders.
 *
 * Note `variantOffsets` (plural, keyed by variant id) is the CURRENT shape;
 * `variantOffset` (singular) is the DEPRECATED one that migration M5 converts.
 * Both builders exist because the migration characterisation tests need to
 * construct the pre-migration shape deliberately — `makeLegacyVariantLayer` is
 * the only place in this module that should ever emit the singular field.
 */

export const GRID = 16;

export function makeLayer(
  id: string,
  name: string,
  pixels: PixelData[][],
  visible = true,
): Layer {
  return { id, name, pixels, visible };
}

export const makeEmptyLayer = (
  id: string,
  name = "Empty",
  width = GRID,
  height = GRID,
): Layer => makeLayer(id, name, makeEmptyGrid(width, height));

/** A layer with content that survives a visual diff. */
export const makeSpriteLayer = (id: string, name = "Sprite"): Layer =>
  makeLayer(id, name, makeSpriteGrid());

export const makeCheckerLayer = (
  id: string,
  name = "Checker",
  width = GRID,
  height = GRID,
): Layer => makeLayer(id, name, makeCheckerGrid(width, height));

export const makeBorderLayer = (
  id: string,
  name = "Border",
  width = GRID,
  height = GRID,
): Layer => makeLayer(id, name, makeBorderGrid(width, height));

/** A hidden layer — exercises the `visible: false` render branch. */
export const makeHiddenLayer = (id: string, name = "Hidden"): Layer => ({
  ...makeCheckerLayer(id, name),
  visible: false,
});

/**
 * A variant layer in the CURRENT shape: per-variant-type offsets keyed by
 * variant id. This is the shape the 4-level offset fallback resolves against.
 */
export function makeVariantLayer(
  id: string,
  name: string,
  variantGroupId: string,
  selectedVariantId: string,
  variantOffsets: Layer["variantOffsets"] = {
    [selectedVariantId]: { x: 0, y: 0 },
  },
): Layer {
  return {
    ...makeEmptyLayer(id, name),
    isVariant: true,
    variantGroupId,
    selectedVariantId,
    variantOffsets,
  };
}

/**
 * A variant layer in the DEPRECATED single-offset shape.
 *
 * ⚠️ Only for migration characterisation tests. `compactToProject` migrates
 * `variantOffset` -> `variantOffsets` and clears the old field; a test that
 * needs to observe that migration must be able to build the input. Do NOT use
 * this in a story — stories should render the shape the app produces today.
 */
export function makeLegacyVariantLayer(
  id: string,
  name: string,
  variantGroupId: string,
  selectedVariantId: string,
  variantOffset: { x: number; y: number } = { x: 2, y: -1 },
): Layer {
  return {
    ...makeEmptyLayer(id, name),
    isVariant: true,
    variantGroupId,
    selectedVariantId,
    variantOffset,
  };
}

/** The 3-layer stack `projectTypical` uses: background, art, hidden overlay. */
export function makeLayerStack(prefix: string): Layer[] {
  return [
    makeBorderLayer(`${prefix}-layer-1`, "Background"),
    makeSpriteLayer(`${prefix}-layer-2`, "Art"),
    makeHiddenLayer(`${prefix}-layer-3`, "Overlay"),
  ];
}
