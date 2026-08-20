/**
 * AnchorGrid stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. `AnchorGrid` was already props-in/callbacks-out before
 * this wave; task 36 only relocated it into `ui/`. These stories prove the
 * relocation kept it pure — nothing here supplies a store, and it renders.
 *
 * The component's whole job is to show WHICH WAY the grid grows or shrinks
 * when resized from a given anchor, so the interesting axis is the sign of
 * `newWidth - currentWidth` (and the same for height), not the anchor alone.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AnchorGrid } from "./AnchorGrid";

const meta = {
  component: AnchorGrid,
  args: {
    onChange: fn(),
    anchor: "middle-center",
    currentWidth: 32,
    currentHeight: 32,
    newWidth: 32,
    newHeight: 32,
  },
} satisfies Meta<typeof AnchorGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY-equivalent: no size change at all, so no arrows are drawn. */
export const NoChange: Story = {};

/** TYPICAL: growing in both axes from the top-left corner. */
export const Growing: Story = {
  args: {
    anchor: "top-left",
    newWidth: 48,
    newHeight: 48,
  },
};

/** Shrinking — the arrows reverse relative to `Growing`. */
export const Shrinking: Story = {
  args: {
    anchor: "bottom-right",
    newWidth: 16,
    newHeight: 16,
  },
};

/**
 * EDGE: the two axes disagree — wider but shorter. This is the case that
 * catches an implementation which derives one arrow set for both axes.
 */
export const MixedAxes: Story = {
  args: {
    anchor: "middle-center",
    currentWidth: 32,
    currentHeight: 32,
    newWidth: 64,
    newHeight: 8,
  },
};

/** EDGE: a very large grid, to check the cells stay square and legible. */
export const LargeGrid: Story = {
  args: {
    anchor: "top-right",
    currentWidth: 256,
    currentHeight: 256,
    newWidth: 512,
    newHeight: 300,
  },
};
