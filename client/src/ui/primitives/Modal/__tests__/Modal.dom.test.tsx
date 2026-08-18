import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "../Modal";
import { ConfirmDialog } from "../../ConfirmDialog/ConfirmDialog";
import { Button } from "../../Button/Button";

/** A dedicated portal host, exercising the `container` prop each test. */
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe("Modal — DOM snapshots", () => {
  it("renders overlay > dialog > header/body with a11y wiring", () => {
    render(
      <Modal title="Settings" onClose={() => {}} container={host}>
        Body
      </Modal>,
    );
    expect(host.firstChild).toMatchSnapshot();
  });

  it("renders a footer--end with actions and body--fill", () => {
    render(
      <Modal
        title="Export"
        onClose={() => {}}
        container={host}
        bodyFill
        footerEnd
        footer={<div className="modal__actions">actions</div>}
      >
        Body
      </Modal>,
    );
    expect(host.firstChild).toMatchSnapshot();
  });

  it("renders no header chrome without title or onClose, with aria-label", () => {
    render(
      <Modal container={host} ariaLabel="Blocking flow">
        Body
      </Modal>,
    );
    expect(host.firstChild).toMatchSnapshot();
  });
});

describe("Modal — behaviour", () => {
  it("isOpen defaults to true; isOpen=false renders nothing", () => {
    const { rerender } = render(
      <Modal title="T" container={host}>
        Body
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(
      <Modal title="T" container={host} isOpen={false}>
        Body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape and stops it before window-level bubble handlers", async () => {
    // The App.tsx colorAdjustment handler is window-level bubble: it must
    // never see an Escape that an open dialog handled (Escape-matrix check 1,
    // the half a ui/ component can enforce).
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} container={host}>
        Body
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(windowSpy).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowSpy);
  });

  it("with no modal open, window-level handlers still receive Escape (check 2)", async () => {
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    render(
      <Modal title="T" onClose={() => {}} container={host} isOpen={false}>
        Body
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(windowSpy).toHaveBeenCalled();
    window.removeEventListener("keydown", windowSpy);
  });

  it("Escape closes only the topmost dialog (check 3)", async () => {
    function Nested() {
      const [confirmOpen, setConfirmOpen] = useState(true);
      return (
        <Modal title="Outer" onClose={() => {}} container={host}>
          {confirmOpen && (
            <ConfirmDialog
              title="Inner"
              onConfirm={() => setConfirmOpen(false)}
              onCancel={() => setConfirmOpen(false)}
              container={host}
            />
          )}
        </Modal>
      );
    }
    render(<Nested />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    // The confirm closed; the outer modal did not.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("traps Tab within the dialog (check 4)", async () => {
    render(
      <Modal
        title="T"
        onClose={() => {}}
        container={host}
        footer={
          <div className="modal__actions">
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary">OK</Button>
          </div>
        }
      >
        Body
      </Modal>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    const ok = screen.getByRole("button", { name: "OK" });
    // Initial focus is the dialog itself; Tab enters the cycle.
    await userEvent.tab();
    expect(close).toHaveFocus();
    // Shift+Tab from the first focusable wraps to the last.
    await userEvent.tab({ shift: true });
    expect(ok).toHaveFocus();
    // Tab from the last wraps back to the first.
    await userEvent.tab();
    expect(close).toHaveFocus();
  });

  it("backdrop close tracks the mousedown origin", () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} container={host}>
        Body
      </Modal>,
    );
    const overlay = host.querySelector(".modal__overlay") as HTMLElement;
    const dialog = screen.getByRole("dialog");

    // Drag that STARTS on the dialog and releases on the overlay: no close.
    fireEvent.mouseDown(dialog);
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();

    // Press and release both on the overlay: closes.
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
