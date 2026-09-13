/**
 * Row view-models for the BrushLayerPanel stories (Brush Studio task 12).
 *
 * `BrushLayerRowModel`s — the FLAT projection — never `BrushLayer` nodes,
 * for the same reason `LayerPanel/storyFixtures.ts` never passes a `Layer`:
 * the node carries `pixels`. Hand-authored rather than derived from a
 * document fixture because the brush document type is new (W1) and has no
 * shared fixture yet.
 *
 * ⚠️ Everything here is in DISPLAY order — top of the stack first — the
 * order the container hands to `BrushLayerPanel`.
 */
import type { BrushAppliedGroup, BrushChannelType } from "../../../types";
import type { BrushLayerRowModel } from "./BrushLayerRow";

export const BRUSH_GROUPS: BrushAppliedGroup[] = [
  { id: "group-body", name: "Body" },
  { id: "group-fx", name: "FX" },
];

/**
 * Four layers, one per channel type; the normal map is grouped and the HSL
 * tint reads the TARGET pixel (plan 13) — every other layer is `"selected"`.
 */
export const BRUSH_LAYERS_TYPICAL: BrushLayerRowModel[] = [
  {
    id: "brush-layer-height",
    name: "Height",
    visible: true,
    channelType: "heightmap",
    colorSource: "selected",
    appliedGroupName: null,
    appliedGroupId: null,
  },
  {
    id: "brush-layer-normal",
    name: "Normals",
    visible: true,
    channelType: "normal",
    colorSource: "selected",
    appliedGroupName: "Body",
    appliedGroupId: "group-body",
  },
  {
    id: "brush-layer-tint",
    name: "Tint",
    visible: false,
    channelType: "hsl",
    colorSource: "target",
    appliedGroupName: null,
    appliedGroupId: null,
  },
  {
    id: "brush-layer-base",
    name: "Base colour",
    visible: true,
    channelType: "rgb",
    colorSource: "selected",
    appliedGroupName: null,
    appliedGroupId: null,
  },
];

/** A row whose name and group name both overflow the narrow rail. */
export const BRUSH_LAYER_LONG_NAME: BrushLayerRowModel = {
  id: "brush-layer-long",
  name: "Specular highlight pass — rim light, upper-left key",
  visible: true,
  channelType: "hsl",
  colorSource: "selected",
  appliedGroupName: "Shoulder Armour Set",
  appliedGroupId: "group-shoulder",
};

const CYCLE: BrushChannelType[] = ["rgb", "hsl", "normal", "heightmap"];

/**
 * The dense case: twelve layers, long names, every third one grouped and
 * every third one (offset by one) target-sourced.
 */
export const BRUSH_LAYERS_MANY: BrushLayerRowModel[] = Array.from(
  { length: 12 },
  (_, i): BrushLayerRowModel => {
    const grouped = i % 3 === 1;
    return {
      id: `brush-layer-many-${i}`,
      name: `Detail pass ${i + 1} — rim light and specular highlights`,
      visible: i % 4 !== 3,
      channelType: CYCLE[i % CYCLE.length],
      colorSource: i % 3 === 2 ? "target" : "selected",
      appliedGroupName: grouped ? BRUSH_GROUPS[i % 2].name : null,
      appliedGroupId: grouped ? BRUSH_GROUPS[i % 2].id : null,
    };
  },
);
