/**
 * LayerList stories (REFRESH task 35). **No store provider.**
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LayerList } from "./LayerList";
import {
  TYPICAL_LAYERS,
  SINGLE_LAYER,
  WITH_VARIANT_LAYER,
  MANY_LONG_NAMED_LAYERS,
} from "./storyFixtures";

const meta = {
  title: "Components/LayerPanel/LayerList",
  component: LayerList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The new-layer form, the scrollable list, and the empty state. " +
          "`layers` arrives ALREADY REVERSED into display order (top layer " +
          "first) — the pre-split component converted between display and " +
          "stored indices in five separate inline expressions, and every " +
          "one of them was a chance to invert the z-order silently.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel layer-panel" style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    layers: TYPICAL_LAYERS,
    selectedLayerId: null,
    dragIndex: null,
    editingId: null,
    editingName: "",
    newLayerName: "",
    canDeleteLayer: true,
    onNewLayerNameChange: fn(),
    onAddLayer: fn(),
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
} satisfies Meta<typeof LayerList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: zero layers. The `layer-panel__empty` copy shows and the new-layer
 * form stays available above it — the list does not hide its own affordance
 * when it is empty.
 */
export const Empty: Story = {
  args: { layers: [], canDeleteLayer: false },
};

/** Typical: `projectTypical`'s hero frame, with the second row selected. */
export const Typical: Story = {
  args: { selectedLayerId: TYPICAL_LAYERS[1]?.id ?? null },
};

/** A single layer — per-row delete is refused throughout. */
export const SingleLayer: Story = {
  args: { layers: SINGLE_LAYER, canDeleteLayer: false },
};

/** A variant layer between two regular ones, one of them hidden. */
export const WithVariantLayer: Story = {
  args: {
    layers: WITH_VARIANT_LAYER,
    selectedLayerId: WITH_VARIANT_LAYER[1].id,
  },
};

/** Mid-drag: the second row carries `--dragging`. */
export const MidDrag: Story = {
  args: { dragIndex: 1, selectedLayerId: TYPICAL_LAYERS[1]?.id ?? null },
};

/** The inline rename input open on the first row. */
export const Renaming: Story = {
  args: {
    editingId: TYPICAL_LAYERS[0]?.id ?? null,
    editingName: "Renamed layer",
  },
};

/**
 * Edge: 14 layers with long names and a long variant badge pair. This is the
 * scroll + truncation case, and the one where the 8-button action strip and
 * the two badges compete hardest for a narrow sidebar.
 */
export const ManyLongNames: Story = {
  args: {
    layers: MANY_LONG_NAMED_LAYERS,
    selectedLayerId: MANY_LONG_NAMED_LAYERS[3]?.id ?? null,
    newLayerName: "A rather long pending layer name",
  },
};
