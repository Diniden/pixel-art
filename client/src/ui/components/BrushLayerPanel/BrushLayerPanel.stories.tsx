/**
 * BrushLayerPanel stories (Brush Studio task 12). **No store provider.**
 *
 * The manual check lives here: open a row's channel menu inside the panel
 * — it must render above the panel, un-clipped, because it is a
 * `document.body` portal. The header "+" opens the same menu in its
 * channel-only form and reports `onAddLayer(channelType)`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrushLayerPanel } from "./BrushLayerPanel";
import {
  BRUSH_GROUPS,
  BRUSH_LAYERS_MANY,
  BRUSH_LAYERS_TYPICAL,
} from "./storyFixtures";

const meta = {
  title: "Components/BrushLayerPanel/BrushLayerPanel",
  component: BrushLayerPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The brush document's layer list: a stacked header with an add " +
          "button and a list of `BrushLayerRow`s. No variants, no per-frame " +
          "scope — layer order is uniform across frames (MASTER D6).",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    layers: BRUSH_LAYERS_TYPICAL,
    selectedLayerId: BRUSH_LAYERS_TYPICAL[1].id,
    appliedGroups: BRUSH_GROUPS,
    onAddLayer: fn(),
    onSelect: fn(),
    onToggleVisibility: fn(),
    onRename: fn(),
    onSetChannelType: fn(),
    onSetAppliedGroup: fn(),
    onCreateAppliedGroup: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
    onDuplicate: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof BrushLayerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: one layer per channel type, the grouped normal map selected. */
export const Typical: Story = {};

/** Empty: no layers, no selection. Only the header "+" is live. */
export const Empty: Story = {
  args: { layers: [], selectedLayerId: null },
};

/** Edge: twelve long-named layers — the densest the rail gets. */
export const Many: Story = {
  args: {
    layers: BRUSH_LAYERS_MANY,
    selectedLayerId: BRUSH_LAYERS_MANY[4].id,
  },
};
