/**
 * AddVariantModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. All four store members are callbacks.
 *
 * ⚠️ `variants` is `DomainStore.variants` — the PROJECT-level groups, never
 * `obj.variantGroups`. Feeding a story the object-level list would render a
 * plausible dialog that does not match what the container actually supplies.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AddVariantModal } from "./AddVariantModal";
import { makeVariant, makeVariantGroup } from "../../../fixtures";
import modalHost from "../../../../.storybook/decorators/modalHost";

const groups = [
  makeVariantGroup("vg-headwear", "Headwear", [
    makeVariant("variant-hat", "Hat"),
    makeVariant("variant-hood", "Hood"),
  ]),
  makeVariantGroup("vg-weapon", "Weapon", [
    makeVariant("variant-sword", "Sword"),
  ]),
];

const meta = {
  component: AddVariantModal,
  decorators: [modalHost],
  args: {
    onClose: fn(),
    variants: groups,
    onAddVariantLayerFromExisting: fn(),
    onDeleteVariantGroup: fn(),
    onRenameVariantGroup: fn(),
  },
} satisfies Meta<typeof AddVariantModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: no variant groups exist yet. */
export const NoVariantGroups: Story = {
  args: { variants: [] },
};

/** TYPICAL: two groups, one with two variants. */
export const Typical: Story = {};

/** A single group holding a single variant — the minimum non-empty case. */
export const SingleGroup: Story = {
  args: { variants: [groups[1]] },
};

/** EDGE: many groups with long names — scrolling and truncation. */
export const ManyLongNames: Story = {
  args: {
    variants: Array.from({ length: 14 }, (_, i) =>
      makeVariantGroup(`vg-${i}`, `Equipment slot ${i + 1} — long group name`, [
        makeVariant(`v-${i}-a`, `Variant ${i + 1}A with a long name`),
        makeVariant(`v-${i}-b`, `Variant ${i + 1}B`),
      ]),
    ),
  },
};
