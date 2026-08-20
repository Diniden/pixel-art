/**
 * ObjectDeleteDialog stories (REFRESH task 35). **No store provider.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE DIALOG HERE THAT REALLY IS AN OVERLAY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It portals to `document.body` through the `ConfirmDialog` primitive, which
 * task 19 extracted FROM this very dialog (`ObjectLibrary.tsx:608`) along
 * with its two twins in `AddVariantModal` and `BrowseBackupsModal`.
 *
 * The task's manual check requires the confirm to render **above** the object
 * library. The primitive's `useDialogFocus` resolves "topmost" by DOM order
 * of `[data-ui-dialog]` rather than module state, so nesting is correct by
 * construction — and Escape here closes only this dialog, never a Modal it
 * might be opened from.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectDeleteDialog } from "./ObjectDeleteDialog";

const meta = {
  title: "Components/ObjectLibrary/Dialogs/ObjectDeleteDialog",
  component: ObjectDeleteDialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The danger-skinned confirm, on the `ConfirmDialog` primitive. " +
          "Replaces 35 lines of hand-written `createPortal` and ADDS what " +
          "the hand-rolled copy lacked: `role=\"alertdialog\"`, `aria-modal`, " +
          "a focus trap, and topmost-only Escape handling.",
      },
    },
  },
  args: { objectName: "Hero", onConfirm: fn(), onCancel: fn() },
} satisfies Meta<typeof ObjectDeleteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: deleting a normally-named object. */
export const Typical: Story = {};

/**
 * Edge: an empty name. The prompt renders `""` rather than collapsing, which
 * is honest — an unnamed object is still identifiable by the row you clicked.
 */
export const EmptyName: Story = {
  args: { objectName: "" },
};

/**
 * Edge: a name long enough to wrap inside the dialog. The `<strong>` run has
 * to wrap without pushing the action buttons off the panel.
 */
export const VeryLongName: Story = {
  args: {
    objectName:
      "Protagonist — idle / walk / run cycle sheet (working draft v3)",
  },
};

/**
 * Edge: a name containing quotes and angle brackets. It is rendered as TEXT,
 * not markup — the prompt already wraps the name in its own quotes, so a
 * quoted name is the case where a naive template string would look broken.
 */
export const NameWithQuotes: Story = {
  args: { objectName: 'The "Hero" <draft>' },
};
