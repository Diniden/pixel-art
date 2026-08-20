/**
 * LayerPanel stories (REFRESH task 35). **No store provider.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE PROOF THE SPLIT WORKED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Before this task `LayerPanel` read 22 store members and imported three
 * `observer()` modal containers. Rendering it without a provider was not
 * merely unpleasant, it was impossible.
 *
 * These stories mount the whole panel with no provider at all, and the modal
 * slots take plain `<div>`s. That is a structural consequence of the split,
 * not a claim about it: the component's entire import list is React types,
 * two sibling components, the scope types, and a stylesheet.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LayerPanel } from "./LayerPanel";
import {
  TYPICAL_LAYERS,
  SINGLE_LAYER,
  WITH_VARIANT_LAYER,
  MANY_LONG_NAMED_LAYERS,
} from "./storyFixtures";

const meta = {
  title: "Components/LayerPanel/LayerPanel",
  component: LayerPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Composition only: a header, a list, and three modal SLOTS. The " +
          "modals arrive as `ReactNode` props because the real ones are " +
          "`observer()` containers — importing them would drag MobX across " +
          "the `ui/` boundary and make every story here impossible.",
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
    layers: TYPICAL_LAYERS,
    selectedLayerId: TYPICAL_LAYERS[1]?.id ?? null,
    allVisible: true,
    hasVariants: true,
    canMoveUp: true,
    canMoveDown: true,
    canSquashDown: true,
    canSquashUp: true,
    canDeleteLayer: true,
    dragIndex: null,
    editingId: null,
    editingName: "",
    newLayerName: "",
    onNewLayerNameChange: fn(),
    onAddLayer: fn(),
    onToggleAllVisibility: fn(),
    onOpenCopyFrom: fn(),
    onOpenAddVariant: fn(),
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
} satisfies Meta<typeof LayerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: no layers, no selection, no variants. Every header button is dead
 * and the empty copy shows. A fresh object opens here.
 */
export const Empty: Story = {
  args: {
    layers: [],
    selectedLayerId: null,
    hasVariants: false,
    canMoveUp: false,
    canMoveDown: false,
    canSquashDown: false,
    canSquashUp: false,
    canDeleteLayer: false,
  },
};

/** Typical: `projectTypical`'s hero frame with a middle layer selected. */
export const Typical: Story = {};

/** A single layer: delete refused in both scopes, nothing can move. */
export const SingleLayer: Story = {
  args: {
    layers: SINGLE_LAYER,
    selectedLayerId: SINGLE_LAYER[0].id,
    canMoveUp: false,
    canMoveDown: false,
    canSquashDown: false,
    canSquashUp: false,
    canDeleteLayer: false,
  },
};

/**
 * A variant layer selected: both squash buttons dead in the header, and the
 * variant row's action strip swapped for the remove-variant button.
 */
export const VariantSelected: Story = {
  args: {
    layers: WITH_VARIANT_LAYER,
    selectedLayerId: WITH_VARIANT_LAYER[1].id,
    allVisible: false,
    canSquashDown: false,
    canSquashUp: false,
  },
};

/**
 * Edge: 14 long-named layers, scrolling, with a long pending new-layer name.
 * The densest this panel gets before virtualisation would be needed.
 */
export const ManyLongNames: Story = {
  args: {
    layers: MANY_LONG_NAMED_LAYERS,
    selectedLayerId: MANY_LONG_NAMED_LAYERS[3]?.id ?? null,
    allVisible: false,
    newLayerName: "A rather long pending layer name",
  },
};

/**
 * A modal slot filled. The real slot takes `CopyFromModalContainer`; a story
 * passes a plain node, which is the whole point of the slot being a prop.
 */
export const WithModalSlot: Story = {
  args: {
    copyFromModal: (
      <div
        style={{
          padding: 12,
          margin: 8,
          border: "1px dashed currentColor",
          opacity: 0.7,
          fontSize: 12,
        }}
      >
        [slot] CopyFromModalContainer renders here
      </div>
    ),
  },
};
