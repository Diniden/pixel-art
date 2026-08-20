/**
 * Row view-models for the LayerPanel stories (REFRESH task 35).
 *
 * These are `LayerRowModel`s — the FLAT projection, not `Layer` nodes — built
 * from `src/fixtures`' shared projects wherever the shape allows, so the
 * stories and Vitest describe the same data (task 10's rule: if the visual
 * evidence and the unit evidence disagree they are not corroborating each
 * other).
 *
 * `projectTypical`'s hero object carries 3 layers plus one variant layer on
 * frame 1, which is exactly the mix these stories need: regular layers, a
 * variant layer with a resolved group + variant name, and a hidden layer.
 *
 * ⚠️ Everything here is in **display order — top layer first**, the same
 * order `LayerPanelContainer` hands to `LayerPanel`. Building it the other
 * way round would make every story silently z-inverted.
 */
import { projectTypical } from "../../../fixtures";
import type { LayerRowModel } from "./LayerRow";

/**
 * Projects the hero object's first frame the way `LayerPanelContainer` does,
 * including the two squash guards (a layer may not squash into a variant, and
 * the ends of the stack have nothing to squash into).
 */
function projectFrameLayers(): LayerRowModel[] {
  const hero = projectTypical.objects[0];
  const frame = hero.frames[0];
  const variants = projectTypical.variants ?? [];

  return frame.layers
    .map((layer, i): LayerRowModel => {
      const group = layer.isVariant
        ? variants.find((vg) => vg.id === layer.variantGroupId)
        : undefined;
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        isVariant: layer.isVariant ?? false,
        variantGroupName: group?.name ?? null,
        variantName:
          group?.variants.find((v) => v.id === layer.selectedVariantId)?.name ??
          null,
        canSquashDown:
          !layer.isVariant && i > 0 && !frame.layers[i - 1]?.isVariant,
        canSquashUp:
          !layer.isVariant &&
          i < frame.layers.length - 1 &&
          !frame.layers[i + 1]?.isVariant,
      };
    })
    .reverse();
}

/** The typical stack, straight off `projectTypical`'s hero object. */
export const TYPICAL_LAYERS: LayerRowModel[] = projectFrameLayers();

/** A single regular layer — the "nothing can move or squash" floor. */
export const SINGLE_LAYER: LayerRowModel[] = [
  {
    id: "layer-only",
    name: "Background",
    visible: true,
    isVariant: false,
    variantGroupName: null,
    variantName: null,
    canSquashDown: false,
    canSquashUp: false,
  },
];

/**
 * A variant layer with both badges resolved, sandwiched between two regular
 * layers. The neighbours' squash guards are therefore FALSE in the direction
 * of the variant — the asymmetry the header buttons must also respect.
 */
export const WITH_VARIANT_LAYER: LayerRowModel[] = [
  {
    id: "layer-top",
    name: "Highlights",
    visible: true,
    isVariant: false,
    variantGroupName: null,
    variantName: null,
    canSquashDown: false, // the layer below is the variant
    canSquashUp: false, // nothing above
  },
  {
    id: "layer-variant",
    name: "Helmet",
    visible: true,
    isVariant: true,
    variantGroupName: "Headgear",
    variantName: "Iron Helm",
    canSquashDown: false,
    canSquashUp: false,
  },
  {
    id: "layer-base",
    name: "Base",
    visible: false,
    isVariant: false,
    variantGroupName: null,
    variantName: null,
    canSquashDown: false, // nothing below
    canSquashUp: false, // the layer above is the variant
  },
];

/**
 * The edge case: 14 layers, long names, and a very long variant-group /
 * variant name pair. This is what the panel looks like when the badges and
 * the 8-button action strip compete for the same narrow sidebar row — the
 * layout failure mode this component actually has.
 */
export const MANY_LONG_NAMED_LAYERS: LayerRowModel[] = Array.from(
  { length: 14 },
  (_, i): LayerRowModel => {
    const isVariant = i === 6;
    return {
      id: `layer-long-${i}`,
      name: isVariant
        ? "Pauldron / Shoulder Armour (variant)"
        : `Detail pass ${i + 1} — rim light and specular highlights`,
      visible: i % 4 !== 3,
      isVariant,
      variantGroupName: isVariant ? "Shoulder Armour Set" : null,
      variantName: isVariant ? "Ornate Steel Pauldron" : null,
      canSquashDown: !isVariant && i !== 0 && i !== 7,
      canSquashUp: !isVariant && i !== 13 && i !== 5,
    };
  },
).reverse();
