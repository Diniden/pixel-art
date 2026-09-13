/**
 * BrushLayerRow stories (Brush Studio task 12). **No store provider.**
 *
 * Click the channel badge — or the `SEL` / `TGT` source badge after it — on
 * any story: the same menu must render ABOVE the panel chrome, not clipped
 * by it (it is a `document.body` portal), anchored on the badge pressed.
 * Open the Actions panel to see every callback fire with `(layerId, …)`;
 * picking a colour source fires `onSetColorSource` and closes.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrushLayerRow } from "./BrushLayerRow";
import {
  BRUSH_GROUPS,
  BRUSH_LAYERS_TYPICAL,
  BRUSH_LAYER_LONG_NAME,
} from "./storyFixtures";

const meta = {
  title: "Components/BrushLayerPanel/BrushLayerRow",
  component: BrushLayerRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One brush layer row: visibility toggle, channel badge and colour-" +
          "source badge (both open the portalled `BrushChannelMenu`), inline " +
          "rename on double-click, an optional applied-group badge, and up / " +
          "down / duplicate / delete. Takes a flat `BrushLayerRowModel`, " +
          "never a `BrushLayer`.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel brush-layer-panel" style={{ width: 260 }}>
        <div className="panel__body">
          <div className="brush-layer-panel__list">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    layer: BRUSH_LAYERS_TYPICAL[3],
    isSelected: false,
    index: 1,
    count: 4,
    appliedGroups: BRUSH_GROUPS,
    onSelect: fn(),
    onToggleVisibility: fn(),
    onRename: fn(),
    onSetChannelType: fn(),
    onSetColorSource: fn(),
    onSetAppliedGroup: fn(),
    onCreateAppliedGroup: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
    onDuplicate: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof BrushLayerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: a middle RGB layer, every action live. */
export const Default: Story = {};

/** Modifier story: `brush-layer-panel__item--selected`, at the top of the stack. */
export const Selected: Story = {
  args: { layer: BRUSH_LAYERS_TYPICAL[0], isSelected: true, index: 0 },
};

/** A grouped normal-map layer: the `__group-badge` follows the name. */
export const Grouped: Story = {
  args: { layer: BRUSH_LAYERS_TYPICAL[1] },
};

/** A hidden HSL layer: the eye glyph flips and `--visible` comes off. */
export const Hidden: Story = {
  args: { layer: BRUSH_LAYERS_TYPICAL[2], index: 3, count: 4 },
};

/**
 * Modifier story: `brush-layer-panel__source-badge--target` — a visible
 * target-sourced tint layer, so the `TGT` chip's accent tint shows next to
 * the muted `SEL` default of the other stories.
 */
export const WithTargetSource: Story = {
  args: {
    layer: { ...BRUSH_LAYERS_TYPICAL[2], visible: true },
    index: 2,
    count: 4,
  },
};

/** Edge: a long name and a long group name compete for one narrow row. */
export const LongName: Story = {
  args: { layer: BRUSH_LAYER_LONG_NAME },
};
