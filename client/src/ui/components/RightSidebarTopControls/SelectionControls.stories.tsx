/**
 * SelectionControls stories (REFRESH task 35). **No store provider.**
 *
 * ⚠️ Note what the args below do NOT contain: a mask. `summary` is three
 * numbers. The live `Selection` holds a `Set` of packed cell indices that
 * MobX never observes, and it stops at `RightSidebarTopControlsContainer`.
 * A story that had to build a 10,000-entry `Set` to render a sidebar row
 * would be evidence the boundary was drawn in the wrong place.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SelectionControls } from "./SelectionControls";

const meta = {
  title: "Components/RightSidebarTopControls/SelectionControls",
  component: SelectionControls,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Selection mode, behaviour, and expand/shrink/clear. The three " +
          "stepper buttons are disabled together whenever `summary` is null.",
      },
    },
  },
  args: {
    summary: null,
    selectionMode: "rect",
    onSelectionModeChange: fn(),
    selectionBehavior: "movePixels",
    onSelectionBehaviorChange: fn(),
    onExpand: fn(),
    onShrink: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof SelectionControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: no active selection. The readout is an em-dash and all three
 * buttons are disabled — the state the sidebar sits in most of the time.
 */
export const NoSelection: Story = {};

/** Typical: a modest rectangular marquee. */
export const Typical: Story = {
  args: { summary: { width: 12, height: 8, pixelCount: 96 } },
};

/**
 * Modifier story: `__segment--active` on a non-first segment in BOTH
 * segmented rows at once (lasso + edit mask), which is also the combination
 * where the behaviour labels are longest and most likely to wrap.
 */
export const LassoEditMask: Story = {
  args: {
    summary: { width: 40, height: 31, pixelCount: 812 },
    selectionMode: "lasso",
    selectionBehavior: "editMask",
  },
};

/**
 * Edge: a flood selection covering most of a 256x256 grid — 61,214 cells.
 * The readout is the widest string this row ever shows, and it is the case
 * that makes the point of the `SelectionSummary` projection: the container
 * passes the integer 61214, not a `Set` with 61,214 entries in it.
 */
export const VeryLargeSelection: Story = {
  args: {
    summary: { width: 256, height: 256, pixelCount: 61214 },
    selectionMode: "flood",
    selectionBehavior: "moveSelection",
  },
};

/** Edge: a single-pixel selection — the narrowest non-empty readout. */
export const SinglePixel: Story = {
  args: {
    summary: { width: 1, height: 1, pixelCount: 1 },
    selectionMode: "color",
  },
};
