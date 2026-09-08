/**
 * BrushLibrary — the create form's validation and the one-thumbnail rule.
 *
 * jsdom has no canvas, so `getContext` returns null and `thumbnailDraw`
 * never runs — the canvas ELEMENT is still rendered, which is what the
 * thumbnail assertions use.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrushLibrary, type BrushLibraryProps } from "../BrushLibrary";

function renderLibrary(overrides: Partial<BrushLibraryProps> = {}) {
  const props: BrushLibraryProps = {
    brushes: ["Dither 4x4", "Grass Tuft", "Soft Round"],
    currentBrush: "Soft Round",
    currentSize: { width: 16, height: 16 },
    thumbnailDraw: () => {},
    thumbnailRevision: 1,
    isLoading: false,
    onSelectBrush: vi.fn(),
    onCreateBrush: vi.fn(),
    ...overrides,
  };
  const utils = render(<BrushLibrary {...props} />);
  return { ...utils, props };
}

describe("BrushLibrary — rows", () => {
  it("highlights the current brush and gives only it a thumbnail and size", () => {
    renderLibrary();
    const current = screen.getByRole("button", { name: /Soft Round/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toHaveClass("brush-library__item--current");
    expect(current.querySelector("canvas")).not.toBeNull();
    expect(current).toHaveTextContent("16×16");

    const other = screen.getByRole("button", { name: /Grass Tuft/ });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other.querySelector("canvas")).toBeNull();
    expect(other).not.toHaveTextContent("16×16");
  });

  it("selects a brush on click", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: /Grass Tuft/ }));
    expect(props.onSelectBrush).toHaveBeenCalledWith("Grass Tuft");
  });

  it("shows the empty state when there are no brushes", () => {
    renderLibrary({
      brushes: [],
      currentBrush: null,
      currentSize: null,
      thumbnailDraw: null,
    });
    expect(screen.getByText(/No brushes yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Dither|Grass|Soft/ }),
    ).toBeNull();
  });
});

describe("BrushLibrary — create form validates names", () => {
  it("rejects an invalid name and never calls onCreateBrush", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "bad/name");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /letters, numbers, spaces, hyphens, and underscores/,
    );
    expect(props.onCreateBrush).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "Grass Tuft");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    expect(props.onCreateBrush).not.toHaveBeenCalled();
  });

  it("creates with the trimmed name and the default 16×16, then closes", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "  Leaf Scatter  ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(props.onCreateBrush).toHaveBeenCalledWith("Leaf Scatter", 16, 16);
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("passes edited width and height through", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "Wide");
    const width = screen.getByLabelText("W");
    await userEvent.clear(width);
    await userEvent.type(width, "32{Enter}");
    const height = screen.getByLabelText("H");
    await userEvent.clear(height);
    await userEvent.type(height, "8{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(props.onCreateBrush).toHaveBeenCalledWith("Wide", 32, 8);
  });

  it("Enter in the name field submits; Escape cancels the form", async () => {
    const { props } = renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "Quick{Enter}");
    expect(props.onCreateBrush).toHaveBeenCalledWith("Quick", 16, 16);

    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "Nope{Escape}");
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(props.onCreateBrush).toHaveBeenCalledTimes(1);
  });

  it("disables Create and the rows while loading", async () => {
    renderLibrary({ isLoading: true });
    expect(screen.getByRole("button", { name: /Soft Round/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "New Brush" }));
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
