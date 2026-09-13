/**
 * BrushList — rows in order, selection, the create form's validation, the
 * inline rename and the action strip's bounds (multi-brush plan, task 03;
 * MASTER D8).
 *
 * jsdom has no canvas, so `getContext` returns null and no `draw` ever
 * runs — the canvas ELEMENT is still rendered, which is what the thumbnail
 * assertions use.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrushList,
  type BrushListProps,
  type BrushListRowModel,
} from "../BrushList";

const draw = () => {};

const BRUSHES: BrushListRowModel[] = [
  { id: "b1", name: "Soft Round", width: 16, height: 16, draw },
  { id: "b2", name: "Grass Tuft", width: 8, height: 12, draw },
  { id: "b3", name: "Dither 4x4", width: 4, height: 4, draw },
];

function renderList(overrides: Partial<BrushListProps> = {}) {
  const props: BrushListProps = {
    brushes: BRUSHES,
    selectedBrushId: "b2",
    thumbnailRevision: 1,
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    ...overrides,
  };
  const utils = render(<BrushList {...props} />);
  return { ...utils, props };
}

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(".brush-list__row"));
const addButton = () => screen.getByRole("button", { name: "New brush" });
const createButton = () => screen.getByRole("button", { name: "Create" });

describe("BrushList — rows", () => {
  it("renders one row per brush in array order, each with a thumbnail and a W×H badge", () => {
    const { container } = renderList();
    const all = rows(container);
    expect(all).toHaveLength(3);
    expect(all[0]).toHaveTextContent("Soft Round");
    expect(all[0]).toHaveTextContent("16×16");
    expect(all[1]).toHaveTextContent("Grass Tuft");
    expect(all[1]).toHaveTextContent("8×12");
    expect(all[2]).toHaveTextContent("Dither 4x4");
    expect(all[2]).toHaveTextContent("4×4");
    for (const row of all) expect(row.querySelector("canvas")).not.toBeNull();
    expect(
      screen.getByRole("img", { name: "Soft Round preview" }),
    ).toBeInTheDocument();
  });

  it("highlights only the selected brush", () => {
    const { container } = renderList({ selectedBrushId: "b2" });
    const [first, second, third] = rows(container);
    expect(second).toHaveClass("brush-list__row--selected");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveClass("brush-list__row--selected");
    expect(first).not.toHaveAttribute("aria-current");
    expect(third).not.toHaveClass("brush-list__row--selected");
  });

  it("a row with draw: null shows the name without a thumbnail", () => {
    const { container } = renderList({
      brushes: [{ ...BRUSHES[0], draw: null }],
    });
    const [row] = rows(container);
    expect(row).toHaveTextContent("Soft Round");
    expect(row.querySelector("canvas")).toBeNull();
  });

  it("click → onSelect(id)", async () => {
    const { container, props } = renderList();
    await userEvent.click(rows(container)[2]);
    expect(props.onSelect).toHaveBeenCalledWith("b3");
  });

  it("shows the empty state when there are no brushes", () => {
    const { container } = renderList({ brushes: [], selectedBrushId: null });
    expect(screen.getByText("No brushes in this project.")).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);
  });

  it("shows the panel title and no form until + is pressed", () => {
    renderList();
    expect(screen.getByText("Brushes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(addButton()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("BrushList — the create form", () => {
  it("+ opens the form with the 16×16 defaults; + again closes it", async () => {
    renderList();
    await userEvent.click(addButton());
    expect(addButton()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("W")).toHaveValue(16);
    expect(screen.getByLabelText("H")).toHaveValue(16);
    expect(createButton()).toBeDisabled();

    await userEvent.click(addButton());
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("an empty (whitespace) name shows the error and does not call onAdd", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "   {Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/);
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("a duplicate name (trimmed, case-sensitive) shows the error and does not call onAdd", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "  Grass Tuft  ");
    await userEvent.click(createButton());

    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    expect(props.onAdd).not.toHaveBeenCalled();
    // The form stays open with the draft intact.
    expect(screen.getByLabelText("Name")).toHaveValue("  Grass Tuft  ");
  });

  it("a name that differs only by case is NOT a duplicate", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "grass tuft{Enter}");
    expect(props.onAdd).toHaveBeenCalledWith("grass tuft", 16, 16);
  });

  it("typing after an error clears it", async () => {
    renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "Grass Tuft{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "!");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a valid submit calls onAdd(trimmed name, w, h) and closes the form", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "  Leaf Scatter  ");
    const width = screen.getByLabelText("W");
    await userEvent.clear(width);
    await userEvent.type(width, "32{Enter}");
    const height = screen.getByLabelText("H");
    await userEvent.clear(height);
    await userEvent.type(height, "8{Enter}");
    await userEvent.click(createButton());

    expect(props.onAdd).toHaveBeenCalledTimes(1);
    expect(props.onAdd).toHaveBeenCalledWith("Leaf Scatter", 32, 8);
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(addButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter in the name field submits; Escape cancels the form", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "Quick{Enter}");
    expect(props.onAdd).toHaveBeenCalledWith("Quick", 16, 16);
    expect(screen.queryByLabelText("Name")).toBeNull();

    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "Nope{Escape}");
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the form and forgets the draft", async () => {
    renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "Draft");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Name")).toBeNull();

    await userEvent.click(addButton());
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});

describe("BrushList — the local name rule (not the file-name rule)", () => {
  it("compares against the rows' TRIMMED names", async () => {
    const { props } = renderList({
      brushes: [{ ...BRUSHES[0], name: " Padded " }],
    });
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "Padded{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("accepts characters the FILE-name validator would reject", async () => {
    const { props } = renderList();
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText("Name"), "bad/name?{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onAdd).toHaveBeenCalledWith("bad/name?", 16, 16);
  });
});

describe("BrushList — inline rename", () => {
  it("double-click the name → input; Enter with a new name → onRename(id, trimmed)", async () => {
    const { props } = renderList();
    await userEvent.dblClick(screen.getByText("Grass Tuft"));

    const input = screen.getByRole("textbox", { name: "Brush name" });
    expect(input).toHaveValue("Grass Tuft");
    expect(document.activeElement).toBe(input);

    await userEvent.clear(input);
    await userEvent.type(input, "  Tall Grass  {Enter}");

    expect(props.onRename).toHaveBeenCalledWith("b2", "Tall Grass");
    expect(screen.queryByRole("textbox", { name: "Brush name" })).toBeNull();
    // A double-click is two clicks first, so the row IS selected on the way
    // in (as `BrushLayerRow`) — harmless, and never a rename by itself.
    expect(props.onSelect).toHaveBeenCalledWith("b2");
  });

  it("Escape cancels without calling onRename", async () => {
    const { props } = renderList();
    await userEvent.dblClick(screen.getByText("Grass Tuft"));
    const input = screen.getByRole("textbox", { name: "Brush name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Discarded{Escape}");

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Grass Tuft")).toBeInTheDocument();
  });

  it("an unchanged or empty name is not reported; blur commits a changed one", async () => {
    const { props } = renderList();

    await userEvent.dblClick(screen.getByText("Grass Tuft"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Brush name" }),
      "{Enter}",
    );
    expect(props.onRename).not.toHaveBeenCalled();

    await userEvent.dblClick(screen.getByText("Grass Tuft"));
    const input = screen.getByRole("textbox", { name: "Brush name" });
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    expect(props.onRename).not.toHaveBeenCalled();

    await userEvent.dblClick(screen.getByText("Grass Tuft"));
    const again = screen.getByRole("textbox", { name: "Brush name" });
    await userEvent.clear(again);
    await userEvent.type(again, "Blurred");
    await userEvent.tab();
    expect(props.onRename).toHaveBeenCalledWith("b2", "Blurred");
  });
});

describe("BrushList — the action strip", () => {
  it("up / down / duplicate / delete call through with the row's id, never selecting", async () => {
    const { container, props } = renderList();
    const middle = within(rows(container)[1]);

    await userEvent.click(
      middle.getByRole("button", { name: "Move Grass Tuft up" }),
    );
    await userEvent.click(
      middle.getByRole("button", { name: "Move Grass Tuft down" }),
    );
    await userEvent.click(
      middle.getByRole("button", { name: "Duplicate Grass Tuft" }),
    );
    await userEvent.click(
      middle.getByRole("button", { name: "Delete Grass Tuft" }),
    );

    expect(props.onMoveUp).toHaveBeenCalledWith("b2");
    expect(props.onMoveDown).toHaveBeenCalledWith("b2");
    expect(props.onDuplicate).toHaveBeenCalledWith("b2");
    expect(props.onDelete).toHaveBeenCalledWith("b2");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("up is disabled at index 0 and down at the last index", async () => {
    const { container, props } = renderList();
    const [first, , last] = rows(container);

    const up = within(first).getByRole("button", {
      name: "Move Soft Round up",
    });
    const down = within(last).getByRole("button", {
      name: "Move Dither 4x4 down",
    });
    expect(up).toBeDisabled();
    expect(down).toBeDisabled();
    expect(
      within(first).getByRole("button", { name: "Move Soft Round down" }),
    ).toBeEnabled();
    expect(
      within(last).getByRole("button", { name: "Move Dither 4x4 up" }),
    ).toBeEnabled();

    await userEvent.click(up);
    await userEvent.click(down);
    expect(props.onMoveUp).not.toHaveBeenCalled();
    expect(props.onMoveDown).not.toHaveBeenCalled();
  });

  it("delete is enabled with several brushes and titled plainly", () => {
    renderList();
    const del = screen.getByRole("button", { name: "Delete Grass Tuft" });
    expect(del).toBeEnabled();
    expect(del).toHaveAttribute("title", "Delete brush");
  });

  it("delete is disabled with one brush and onDelete never fires", async () => {
    const { props } = renderList({
      brushes: [BRUSHES[0]],
      selectedBrushId: "b1",
    });
    const del = screen.getByRole("button", { name: "Delete Soft Round" });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute("title", "Cannot delete the last brush");

    await userEvent.click(del);
    expect(props.onDelete).not.toHaveBeenCalled();
    // Up and down are both at their bound too.
    expect(
      screen.getByRole("button", { name: "Move Soft Round up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Soft Round down" }),
    ).toBeDisabled();
  });
});
