import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { modalHost } from "../../../../.storybook/decorators/modalHost";
import { Modal } from "./Modal";
import { Button } from "../Button/Button";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";

/**
 * Every story uses the task 10 `modalHost` decorator: it supplies the
 * `container` arg so the `position: fixed` overlay stays inside the story
 * canvas instead of covering the Storybook iframe.
 */
const meta = {
  title: "Primitives/Modal",
  component: Modal,
  tags: ["autodocs"],
  decorators: [modalHost],
  parameters: {
    docs: {
      description: {
        component:
          "BEM block `modal` (`styles/blocks/modal.css`, task 18): " +
          "`modal__overlay > modal > modal__header (h2, modal__close) > " +
          "modal__body[--fill] > modal__footer[--end] > modal__actions`. " +
          "Fixes the measured accessibility hole in all 14 legacy modals at " +
          "adoption: `role=\"dialog\"`, `aria-modal`, focus trap, Escape, " +
          "focus restore, and mousedown-origin backdrop close (the one " +
          "correct legacy implementation, AIInterpolateModal's). `isOpen` " +
          "defaults to true so the 6 conditionally-mounted modals adopt " +
          "unchanged; `container` retargets the portal for stories and tests.",
      },
    },
  },
  args: {
    title: "Modal title",
    children: "Modal body content.",
  },
  argTypes: {
    isOpen: { control: "boolean" },
    bodyFill: { control: "boolean" },
    footerEnd: { control: "boolean" },
    container: { control: false },
    footer: { control: false },
  },
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The basic shell: overlay, dialog, header with title + `modal__close`.
 * Keyboard: Escape closes (the story just logs it), Tab cycles inside.
 */
export const Basic: Story = {
  args: {
    onClose: () => {},
    children: (
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>
        The overlay blurs the page behind it; the dialog carries
        role=&quot;dialog&quot; and aria-modal, and focus is trapped inside.
      </p>
    ),
  },
};

/** `modal__footer--end` with a `modal__actions` button cluster. */
export const WithFooter: Story = {
  args: {
    onClose: () => {},
    footerEnd: true,
    footer: (
      <div className="modal__actions">
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Confirm</Button>
      </div>
    ),
    children: "A footer bar with right-aligned actions.",
  },
};

/** `modal__body--fill`: the non-scrolling flex column for canvas hosts. */
export const BodyFill: Story = {
  args: {
    onClose: () => {},
    bodyFill: true,
    children: (
      <div
        style={{
          flex: 1,
          minHeight: 160,
          background: "var(--bg-primary)",
          border: "1px dashed var(--border-primary)",
          borderRadius: "var(--radius-sm)",
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
        }}
      >
        canvas area
      </div>
    ),
  },
};

/** No `onClose`: no close button, no Escape, no backdrop close. */
export const NoCloseAffordance: Story = {
  args: {
    title: "Blocking flow",
    children: "This modal resolves only through an explicit action.",
  },
};

function NestedConfirmDemo({ container }: { container?: HTMLElement | null }) {
  const [modalOpen, setModalOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!modalOpen) {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Reopen modal
        </Button>
      </div>
    );
  }

  return (
    <Modal
      title="Escape precedence"
      onClose={() => setModalOpen(false)}
      container={container}
      footerEnd
      footer={
        <div className="modal__actions">
          <Button variant="danger-outline" onClick={() => setConfirmOpen(true)}>
            Delete something…
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>
        Open the confirm dialog, then press Escape: only the confirm dialog
        closes (topmost-wins, resolved by DOM order of{" "}
        <code>[data-ui-dialog]</code> — no shared registry). Press Escape again
        to close this modal. Tab always cycles within the topmost dialog only.
      </p>
      {confirmOpen && (
        <ConfirmDialog
          danger
          title="Delete the thing?"
          message="This is the nested dialog from Escape-matrix check 3."
          warning="This action cannot be undone."
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
          container={container ?? null}
        />
      )}
    </Modal>
  );
}

/**
 * ⌨️ THE KEYBOARD STORY — Escape-matrix checks 3 and 4.
 * Escape closes only the topmost dialog; Tab cycles within it.
 */
export const NestedConfirm: Story = {
  render: (args) => (
    <NestedConfirmDemo container={(args as { container?: HTMLElement | null }).container} />
  ),
};
