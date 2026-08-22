import type { Meta, StoryObj } from "@storybook/react-vite";
import { modalHost } from "../../../../.storybook/decorators/modalHost";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Primitives/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  decorators: [modalHost],
  parameters: {
    docs: {
      description: {
        component:
          "BEM block `confirm-dialog` (`styles/blocks/confirm-dialog.css`, " +
          "task 18): `confirm-dialog__backdrop > confirm-dialog[--danger] > " +
          "__header / __body / __warning[--callout] / __undo / __actions`. " +
          "Replaces the three measured nested confirms (ObjectLibrary, " +
          'AddVariantModal, BrowseBackupsModal). `role="alertdialog"`, ' +
          "`aria-modal`, focus trap and Escape-cancels are built in; Escape " +
          "closes only this dialog when nested inside a Modal. " +
          "`__warning--callout` is the amber callout preserved from " +
          "LayerPanel's deleted dialog (task 18's record), declared in the " +
          "primitive's local stylesheet.",
      },
    },
  },
  args: {
    title: "Restore this backup?",
    message: "The current project state will be replaced.",
    onConfirm: () => {},
    onCancel: () => {},
  },
  argTypes: {
    danger: { control: "boolean" },
    warningCallout: { control: "boolean" },
    container: { control: false },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The neutral skin (BrowseBackupsModal's padded dialog). ⌨️ Keyboard:
 * Escape cancels, Tab cycles between the two buttons only.
 */
export const Neutral: Story = {
  args: {
    undoNote: "You can undo this from the History panel.",
    confirmLabel: "Restore",
  },
};

/** The danger skin — the old delete-confirm twins' structured dialog. */
export const Danger: Story = {
  args: {
    danger: true,
    title: "Delete variant group?",
    message: "All 12 frames in this group will be removed.",
    warning: "This action cannot be undone.",
    confirmLabel: "Delete",
  },
};

/**
 * The amber callout warning (`confirm-dialog__warning--callout`) — the one
 * styling task 18's record preserved from LayerPanel's deleted dialog.
 */
export const DangerWithCallout: Story = {
  args: {
    danger: true,
    title: "Delete layer?",
    message: "The layer and its pixels will be removed from every frame.",
    warning: "Variant layers referencing it will fall back to the base layer.",
    warningCallout: true,
    undoNote: "You can undo this.",
    confirmLabel: "Delete layer",
  },
};
