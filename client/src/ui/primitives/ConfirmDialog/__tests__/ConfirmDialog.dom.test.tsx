import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../ConfirmDialog";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe("ConfirmDialog — DOM snapshots", () => {
  it("renders the neutral skin", () => {
    render(
      <ConfirmDialog
        title="Restore this backup?"
        message="The current project state will be replaced."
        undoNote="You can undo this."
        confirmLabel="Restore"
        onConfirm={() => {}}
        onCancel={() => {}}
        container={host}
      />,
    );
    expect(host.firstChild).toMatchSnapshot();
  });

  it("renders the danger skin with structured header/body", () => {
    render(
      <ConfirmDialog
        danger
        title="Delete variant group?"
        message="All frames will be removed."
        warning="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
        container={host}
      />,
    );
    expect(host.firstChild).toMatchSnapshot();
  });

  it("renders the amber warning callout", () => {
    render(
      <ConfirmDialog
        danger
        title="Delete layer?"
        warning="Variant layers will fall back to the base layer."
        warningCallout
        undoNote="You can undo this."
        onConfirm={() => {}}
        onCancel={() => {}}
        container={host}
      />,
    );
    expect(host.firstChild).toMatchSnapshot();
  });
});

describe("ConfirmDialog — behaviour", () => {
  it("Escape cancels; buttons fire their callbacks", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="T"
        onConfirm={onConfirm}
        onCancel={onCancel}
        container={host}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
