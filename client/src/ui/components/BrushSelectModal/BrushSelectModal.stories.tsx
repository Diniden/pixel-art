/**
 * BrushSelectModal stories (Brush Studio plan, task 13).
 *
 * 🏁 NO STORE PROVIDER. Every lifecycle action is a promise-returning
 * callback (a `BrushStore` flow in the app), so a story stands them up with
 * `fn()`. ⚠️ `modalHost` is required — the `Modal` primitive is
 * `position: fixed`, and the decorator hands the story its `container`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrushSelectModal } from "./BrushSelectModal";
import modalHost from "../../../../.storybook/decorators/modalHost";

const meta = {
  title: "Components/BrushSelectModal/BrushSelectModal",
  component: BrushSelectModal,
  tags: ["autodocs"],
  decorators: [modalHost],
  parameters: {
    docs: {
      description: {
        component:
          "The Header's brush-file chooser: switch, create (with width and " +
          "height), rename the current brush, and delete it behind a " +
          "`ConfirmDialog`. The brush counterpart of `ProjectSelectModal`, on " +
          "the `Modal` primitive.",
      },
    },
  },
  args: {
    onClose: fn(),
    brushName: "Soft Round",
    brushList: ["Dither 4x4", "Grass Tuft", "Soft Round"],
    onSwitchBrush: fn(async () => true),
    onCreateBrush: fn(async () => true),
    onRenameBrush: fn(async () => true),
    onDeleteBrush: fn(async () => true),
    onRefreshBrushList: fn(async () => {}),
  },
} satisfies Meta<typeof BrushSelectModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: a handful of brushes, one of them loaded. */
export const Typical: Story = {};

/**
 * Empty: no brush files on disk and nothing loaded. The rename row and the
 * delete button are absent / disabled; only "New Brush Project" is actionable.
 */
export const Empty: Story = {
  args: { brushList: [], brushName: null },
};

/**
 * Error: every lifecycle action REJECTS the operation. The modal must surface
 * the failure in its error banner rather than closing as though it had
 * worked — switch a brush, create one, rename, or delete to see it.
 */
export const ActionsFail: Story = {
  args: {
    onSwitchBrush: fn(async () => false),
    onCreateBrush: fn(async () => false),
    onRenameBrush: fn(async () => false),
    onDeleteBrush: fn(async () => false),
  },
};

/** Edge: a long list with long names — the list scrolls and names truncate. */
export const ManyLongNames: Story = {
  args: {
    brushList: [
      "Soft Round",
      ...Array.from(
        { length: 20 },
        (_, i) => `Heavy foliage scatter brush revision ${i + 1}`,
      ),
    ],
  },
};
