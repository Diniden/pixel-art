/**
 * ResizeModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER — the modal was already pure; task 36 relocated it.
 *
 * ⚠️ `modalHost` is required. This is one of the 14 `position: fixed` modals;
 * without the decorator it escapes the story canvas and covers the whole
 * Storybook iframe, addon panels included.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ResizeModal } from "./ResizeModal";
import modalHost from "../../../../.storybook/decorators/modalHost";

const meta = {
  component: ResizeModal,
  decorators: [modalHost],
  args: {
    isOpen: true,
    onClose: fn(),
    onApply: fn(),
    currentWidth: 32,
    currentHeight: 32,
    title: "Resize Object",
  },
} satisfies Meta<typeof ResizeModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: closed — the modal must render nothing at all. */
export const Closed: Story = {
  args: { isOpen: false },
};

/** TYPICAL: a square 32×32 object. */
export const Typical: Story = {};

/** A non-square starting size, so the two axes are distinguishable. */
export const NonSquare: Story = {
  args: { currentWidth: 64, currentHeight: 16, title: "Resize Sprite" },
};

/**
 * EDGE: a long title and a large grid at the `maxSize` ceiling — the header
 * must not wrap the close button off the dialog.
 */
export const LongTitleAndLargeGrid: Story = {
  args: {
    currentWidth: 512,
    currentHeight: 512,
    maxSize: 1024,
    title:
      "Resize “Base Unit — Heavy Assault Walker (variant rig, mk II)” canvas",
  },
};

/** EDGE: the smallest legal grid. */
export const Minimal: Story = {
  args: { currentWidth: 1, currentHeight: 1, title: "Resize" },
};
