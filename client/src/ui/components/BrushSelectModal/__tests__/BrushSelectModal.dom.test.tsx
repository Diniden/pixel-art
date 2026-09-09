/**
 * BrushSelectModal — the task's manual Storybook checks, run in jsdom:
 * Escape closes, a backdrop press-and-release closes, delete asks first.
 * Plus the create / rename / switch contracts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrushSelectModal,
  type BrushSelectModalProps,
} from "../BrushSelectModal";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function renderModal(overrides: Partial<BrushSelectModalProps> = {}) {
  const props: BrushSelectModalProps = {
    onClose: vi.fn(),
    brushName: "Soft Round",
    brushList: ["Dither 4x4", "Grass Tuft", "Soft Round"],
    onSwitchBrush: vi.fn(async () => true),
    onCreateBrush: vi.fn(async () => true),
    onRenameBrush: vi.fn(async () => true),
    onDeleteBrush: vi.fn(async () => true),
    onRefreshBrushList: vi.fn(async () => {}),
    container: host,
    ...overrides,
  };
  const utils = render(<BrushSelectModal {...props} />);
  return { ...utils, props };
}

describe("BrushSelectModal — closing", () => {
  it("Escape closes the modal", async () => {
    const { props } = renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("a press-and-release on the backdrop closes; a drag out does not", () => {
    const { props } = renderModal();
    const overlay = host.querySelector(".modal__overlay") as HTMLElement;
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(dialog);
    fireEvent.click(overlay);
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape inside the create form cancels the form, not the modal", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "New Brush Project" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "Draft{Escape}");
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("BrushSelectModal — delete asks first", () => {
  it("shows a confirm; cancelling it deletes nothing", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Current Brush Project" }),
    );
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent(/Soft Round/);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.onDeleteBrush).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("confirming deletes, refreshes the list and closes", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Current Brush Project" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onDeleteBrush).toHaveBeenCalledTimes(1);
    expect(props.onRefreshBrushList).toHaveBeenCalledTimes(1);
  });

  it("is disabled when no brush is loaded", () => {
    renderModal({ brushName: null, brushList: [] });
    expect(
      screen.getByRole("button", { name: "Delete Current Brush Project" }),
    ).toBeDisabled();
    expect(screen.getByText(/No brush projects yet/)).toBeInTheDocument();
  });

  it("a failed delete keeps the modal open with an error", async () => {
    const { props } = renderModal({
      onDeleteBrush: vi.fn(async () => false),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Current Brush Project" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to delete brush project",
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("BrushSelectModal — create validates names", () => {
  it("rejects an invalid name and never calls onCreateBrush", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "New Brush Project" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "bad/name");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /letters, numbers, spaces, hyphens, and underscores/,
    );
    expect(props.onCreateBrush).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "New Brush Project" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "Grass Tuft");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    expect(props.onCreateBrush).not.toHaveBeenCalled();
  });

  it("creates with name, width and height, then closes", async () => {
    const { props } = renderModal();
    await userEvent.click(
      screen.getByRole("button", { name: "New Brush Project" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "Leaf Scatter");
    const width = screen.getByLabelText("W");
    await userEvent.clear(width);
    await userEvent.type(width, "24{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onCreateBrush).toHaveBeenCalledWith("Leaf Scatter", 24, 16);
  });

  it("a failed create keeps the modal open with an error", async () => {
    const { props } = renderModal({
      onCreateBrush: vi.fn(async () => false),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "New Brush Project" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "Leaf{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to create brush project",
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("BrushSelectModal — switch and rename", () => {
  it("clicking another brush switches and closes on success", async () => {
    const { props } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /Grass Tuft/ }));
    expect(props.onSwitchBrush).toHaveBeenCalledWith("Grass Tuft");
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });

  it("clicking the current brush just closes", async () => {
    const { props } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /Soft Round/ }));
    expect(props.onSwitchBrush).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("a failed switch shows an error and stays open", async () => {
    const { props } = renderModal({
      onSwitchBrush: vi.fn(async () => false),
    });
    await userEvent.click(screen.getByRole("button", { name: /Grass Tuft/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to switch brush project",
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Rename is disabled until the name differs, then renames the current brush", async () => {
    const { props } = renderModal();
    const rename = screen.getByRole("button", { name: "Rename" });
    expect(rename).toBeDisabled();

    const field = screen.getByLabelText("Current brush project");
    await userEvent.clear(field);
    await userEvent.type(field, "Softer Round");
    expect(rename).toBeEnabled();
    await userEvent.click(rename);
    expect(props.onRenameBrush).toHaveBeenCalledWith("Softer Round");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Rename rejects a name that collides with another brush", async () => {
    const { props } = renderModal();
    const field = screen.getByLabelText("Current brush project");
    await userEvent.clear(field);
    await userEvent.type(field, "Grass Tuft");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    expect(props.onRenameBrush).not.toHaveBeenCalled();
  });
});
