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
 *
 * ── The thumbnail painter ─────────────────────────────────────────────────
 *
 * `drawThumbnail` is supplied here so the stories show a REAL thumbnail
 * rather than an empty box — the row's thumbnail slot is only meaningful
 * with pixels behind it. The painter is a fixture-local transcription of the
 * regular-layer branch of `containers/hooks/timelineCellThumbnail`, which is
 * where production paints from; importing that would pull `containers/` into
 * `ui/`, and reaching for `layer.pixels` from a component would be the R2
 * error the row exists to prevent. Fixtures build a CLOSURE over the pixels,
 * exactly as the container does, so nothing about the boundary changes.
 */
import { projectTypical } from "../../../fixtures";
import type { LayerRowModel } from "./LayerRow";
import type { PixelData } from "../../../types";
import { thumbnailCacheKey } from "../../canvas/thumbnailCache";
import { LAYER_THUMB_SIZE } from "./LayerRow";

/** See the header — the regular-layer branch of the production painter. */
function makeFixtureDraw(
  pixels: PixelData[][],
  gridWidth: number,
  gridHeight: number,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, thumbSize) => {
    const scale = thumbSize / Math.max(gridWidth, gridHeight);
    const offsetX = (thumbSize - gridWidth * scale) / 2;
    const offsetY = (thumbSize - gridHeight * scale) / 2;
    for (let y = 0; y < pixels.length && y < gridHeight; y++) {
      const row = pixels[y];
      if (!row) continue;
      for (let x = 0; x < row.length && x < gridWidth; x++) {
        const cell = row[x];
        if (!cell || cell.color === 0) continue;
        const { r, g, b, a } = cell.color;
        if (a === 0) continue;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        ctx.fillRect(
          Math.floor(offsetX + x * scale),
          Math.floor(offsetY + y * scale),
          Math.ceil(scale) || 1,
          Math.ceil(scale) || 1,
        );
      }
    }
  };
}

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
        drawThumbnail: makeFixtureDraw(
          layer.pixels,
          hero.gridSize.width,
          hero.gridSize.height,
        ),
        thumbnailRevision: 0,
        thumbnailCacheKey: thumbnailCacheKey(
          `story:${layer.id}`,
          0,
          LAYER_THUMB_SIZE,
        ),
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
