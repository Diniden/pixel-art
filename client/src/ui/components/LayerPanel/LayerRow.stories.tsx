/**
 * LayerRow stories (REFRESH task 35). **No store provider.**
 *
 * The row is where the collapse is visible: every button below emits
 * `(layerId, direction, "frame")` through `onMoveLayer` / `onSquashLayer` /
 * `onDeleteLayer`. Open the Actions panel and click the two squash buttons —
 * the log shows the SAME callback name with a different `direction`, where
 * before the split it was two separately-named store members.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LayerRow } from "./LayerRow";
import {
  TYPICAL_LAYERS,
  WITH_VARIANT_LAYER,
  MANY_LONG_NAMED_LAYERS,
} from "./storyFixtures";

const meta = {
  title: "Components/LayerPanel/LayerRow",
  component: LayerRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One layer row. Takes a flat `LayerRowModel` — ids, names and " +
          "booleans — never a `Layer`, because a `Layer` carries `pixels` " +
          "and the owner's real project is 300,249 cells (R2).",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel layer-panel" style={{ width: 260 }}>
        <div className="panel__body">
          <div className="layer-panel__list">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    displayIndex: 1,
    displayCount: 4,
    isSelected: false,
    isDragging: false,
    isEditing: false,
    editingName: "",
    canDelete: true,
    onSelect: fn(),
    onToggleVisibility: fn(),
    onStartRename: fn(),
    onEditingNameChange: fn(),
    onFinishRename: fn(),
    onDragStart: fn(),
    onDragOver: fn(),
    onDragEnd: fn(),
    onMoveLayer: fn(),
    onSquashLayer: fn(),
    onDeleteLayer: fn(),
    onCopyLayer: fn(),
    onMakeVariant: fn(),
    onDuplicateLayer: fn(),
    onRemoveVariantLayer: fn(),
    onOpenVariantSelect: fn(),
  },
} satisfies Meta<typeof LayerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty-ish: the ONLY layer in the frame. Move, squash and delete are all
 * disabled together — the floor state, and the one where a wrong guard is
 * most obvious.
 */
export const OnlyLayer: Story = {
  args: {
    layer: {
      id: "layer-only",
      name: "Background",
      visible: true,
      isVariant: false,
      variantGroupName: null,
      variantName: null,
      canSquashDown: false,
      canSquashUp: false,
    },
    displayIndex: 0,
    displayCount: 1,
    canDelete: false,
  },
};

/** Typical: a middle regular layer with every action live. */
export const Typical: Story = {
  args: { layer: TYPICAL_LAYERS[TYPICAL_LAYERS.length - 1] },
};

/** Modifier story: `layer-panel__item--selected`. */
export const Selected: Story = {
  args: { layer: TYPICAL_LAYERS[0], isSelected: true, displayIndex: 0 },
};

/** Modifier story: `layer-panel__item--dragging`, mid-reorder. */
export const Dragging: Story = {
  args: { layer: TYPICAL_LAYERS[0], isDragging: true, displayIndex: 0 },
};

/**
 * Modifier story: `layer-panel__item--variant`. A variant row swaps its
 * action strip entirely — no make-variant, no squash, no duplicate, and the
 * delete becomes "remove variant layer (data preserved)" — and gains the
 * hexagon variant-select button in the visibility column.
 */
export const VariantLayer: Story = {
  args: { layer: WITH_VARIANT_LAYER[1] },
};

/** A hidden layer: the eye glyph flips and `--visible` comes off. */
export const Hidden: Story = {
  args: { layer: WITH_VARIANT_LAYER[2], displayIndex: 2, displayCount: 3 },
};

/** The inline rename input, mid-edit. */
export const Editing: Story = {
  args: {
    layer: TYPICAL_LAYERS[0],
    isEditing: true,
    editingName: "Renamed layer",
    displayIndex: 0,
  },
};

/**
 * Edge: a long layer name next to a long variant group + variant name pair.
 * Both badges and the 8-button action strip compete for one narrow row —
 * the layout failure mode this component actually has.
 */
export const LongNamesWithBadges: Story = {
  args: {
    layer: MANY_LONG_NAMED_LAYERS.find((l) => l.isVariant)!,
    displayIndex: 7,
    displayCount: 14,
  },
};
