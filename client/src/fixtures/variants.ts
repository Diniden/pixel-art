import type { Variant, VariantFrame, VariantGroup } from "@/types";
import { GRID, makeBorderLayer, makeSpriteLayer } from "./layers";

/**
 * Variant builders.
 *
 * `baseFrameOffsets` is keyed by BASE FRAME INDEX (0, 1, 2 ...), not by frame
 * id — that indirection is the source of most variant-offset confusion, so the
 * fixture makes it explicit with distinct, non-zero, non-uniform offsets.
 * A fixture where every offset is {0,0} cannot distinguish "resolved the right
 * offset" from "fell through to the default".
 */

export function makeVariantFrame(id: string, tags?: string[]): VariantFrame {
  const layers = [
    makeBorderLayer(`${id}-layer-1`, "Base"),
    makeSpriteLayer(`${id}-layer-2`, "Detail"),
  ];
  return tags && tags.length > 0 ? { id, layers, tags } : { id, layers };
}

export function makeVariant(
  id: string,
  name: string,
  frameCount = 2,
  baseFrameOffsets: Variant["baseFrameOffsets"] = {
    0: { x: 0, y: 0 },
    1: { x: 1, y: -2 },
    2: { x: -3, y: 4 },
    3: { x: 2, y: 2 },
  },
): Variant {
  return {
    id,
    name,
    gridSize: { width: GRID, height: GRID },
    frames: Array.from({ length: frameCount }, (_f, i) =>
      makeVariantFrame(`${id}-vframe-${i + 1}`),
    ),
    baseFrameOffsets,
  };
}

export function makeVariantGroup(
  id: string,
  name: string,
  variants: Variant[],
): VariantGroup {
  return { id, name, variants };
}

/** Ids referenced by both the variant group and the variant layers that use it. */
export const VARIANT_GROUP_ID = "vg-headwear";
export const VARIANT_A_ID = "variant-hat";
export const VARIANT_B_ID = "variant-hood";

/**
 * The one variant group `projectTypical` carries: 2 variants, with DIFFERENT
 * `baseFrameOffsets` so a test can prove which variant's offset was resolved.
 */
export function makeTypicalVariantGroup(): VariantGroup {
  return makeVariantGroup(VARIANT_GROUP_ID, "Headwear", [
    makeVariant(VARIANT_A_ID, "Hat", 2, {
      0: { x: 0, y: 0 },
      1: { x: 1, y: -2 },
      2: { x: -3, y: 4 },
      3: { x: 2, y: 2 },
    }),
    makeVariant(VARIANT_B_ID, "Hood", 2, {
      0: { x: 5, y: 5 },
      1: { x: -1, y: 6 },
      2: { x: 0, y: -7 },
      3: { x: 3, y: 0 },
    }),
  ]);
}
