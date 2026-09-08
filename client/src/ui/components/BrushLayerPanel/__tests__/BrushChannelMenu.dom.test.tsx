/**
 * BrushLayerRow + BrushChannelMenu — the portal, the keyboard, the rename.
 *
 * ⚠️ jsdom does no layout and no clipping, so the reason the menu is a
 * portal (the rail's scroller clips an in-flow menu) is NOT observable
 * here. The testable half is the PARENTAGE: the menu must sit on
 * `document.body`, outside the row's subtree. The rest pins the keyboard
 * contract and the inline-rename commit/cancel semantics.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BrushLayerRow, type BrushLayerRowModel } from "../BrushLayerRow";
import { BrushLayerPanel } from "../BrushLayerPanel";
import { BRUSH_GROUPS, BRUSH_LAYERS_TYPICAL } from "../storyFixtures";

function makeLayer(
  overrides: Partial<BrushLayerRowModel> = {},
): BrushLayerRowModel {
  return {
    id: "layer-1",
    name: "Base colour",
    visible: true,
    channelType: "rgb",
    appliedGroupName: null,
    appliedGroupId: null,
    ...overrides,
  };
}

const noop = () => {};

function renderRow(
  layer: BrushLayerRowModel = makeLayer(),
  handlers: Partial<
    Pick<
      React.ComponentProps<typeof BrushLayerRow>,
      | "onSelect"
      | "onRename"
      | "onSetChannelType"
      | "onSetAppliedGroup"
      | "onCreateAppliedGroup"
    >
  > = {},
) {
  return render(
    <BrushLayerRow
      layer={layer}
      isSelected={false}
      index={0}
      count={1}
      appliedGroups={BRUSH_GROUPS}
      onSelect={noop}
      onToggleVisibility={noop}
      onRename={noop}
      onSetChannelType={noop}
      onSetAppliedGroup={noop}
      onCreateAppliedGroup={noop}
      onMoveUp={noop}
      onMoveDown={noop}
      onDuplicate={noop}
      onDelete={noop}
      {...handlers}
    />,
  );
}

const badge = () => screen.getByRole("button", { name: /^Channel:/ });
const menu = () => screen.queryByRole("menu");

describe("the portal — the reason the menu is not clipped", () => {
  it("is closed until the badge is clicked", () => {
    renderRow();
    expect(menu()).toBeNull();
  });

  it("renders OUTSIDE the row subtree, on document.body", () => {
    const { container } = renderRow();
    fireEvent.click(badge());

    const el = menu()!;
    expect(el).not.toBeNull();
    expect(container.contains(el)).toBe(false);
    expect(document.body.contains(el)).toBe(true);
    expect(badge().contains(el)).toBe(false);
    expect(badge()).toHaveAttribute("aria-expanded", "true");
  });

  it("Escape closes it and leaves nothing behind in the body", () => {
    renderRow();
    fireEvent.click(badge());
    expect(menu()).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu()).toBeNull();
    expect(document.querySelector(".brush-layer-panel__menu")).toBeNull();
    expect(badge()).toHaveAttribute("aria-expanded", "false");
  });

  it("an outside pointerdown closes it", () => {
    renderRow();
    fireEvent.click(badge());

    fireEvent.pointerDown(document.body);

    expect(menu()).toBeNull();
  });

  it("clicking the badge again toggles it shut", () => {
    renderRow();
    fireEvent.click(badge());
    fireEvent.click(badge());
    expect(menu()).toBeNull();
  });

  it("opening the menu does not select the row", () => {
    const onSelect = vi.fn();
    renderRow(makeLayer(), { onSelect });
    fireEvent.click(badge());
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("choosing a channel", () => {
  it("ticks the channel in force and reports the chosen one, then closes", () => {
    const onSetChannelType = vi.fn();
    const onSelect = vi.fn();
    renderRow(makeLayer({ channelType: "rgb" }), {
      onSetChannelType,
      onSelect,
    });
    fireEvent.click(badge());

    expect(screen.getByRole("menuitemradio", { name: /^RGB/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Heightmap/ }));

    expect(onSetChannelType).toHaveBeenCalledWith("layer-1", "heightmap");
    expect(menu()).toBeNull();
    // A click inside the portal bubbles through the React tree — it must
    // not reach the row's own onClick.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("focuses the ticked row on open and the arrows move focus", () => {
    renderRow(makeLayer({ channelType: "hsl" }));
    fireEvent.click(badge());

    const hsl = screen.getByRole("menuitemradio", { name: /^HSL/ });
    const rgb = screen.getByRole("menuitemradio", { name: /^RGB/ });
    expect(document.activeElement).toBe(hsl);

    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rgb);

    fireEvent.keyDown(menu()!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(hsl);

    fireEvent.keyDown(menu()!, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: /New group/ }),
    );
  });
});

describe("the applied-group section", () => {
  it("ticks None for an ungrouped layer and reports a picked group", () => {
    const onSetAppliedGroup = vi.fn();
    renderRow(makeLayer(), { onSetAppliedGroup });
    fireEvent.click(badge());

    expect(screen.getByRole("menuitemradio", { name: "None" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "FX" }));

    expect(onSetAppliedGroup).toHaveBeenCalledWith("layer-1", "group-fx");
    expect(menu()).toBeNull();
  });

  it("ticks the group in force, resolved by id", () => {
    renderRow(
      makeLayer({ appliedGroupName: "Body", appliedGroupId: "group-body" }),
    );
    fireEvent.click(badge());
    expect(screen.getByRole("menuitemradio", { name: "Body" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("falls back to the group NAME when the model carries no id", () => {
    renderRow(makeLayer({ appliedGroupName: "FX", appliedGroupId: undefined }));
    fireEvent.click(badge());
    expect(screen.getByRole("menuitemradio", { name: "FX" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("New group… reveals an input; Enter creates and closes", () => {
    const onCreateAppliedGroup = vi.fn();
    renderRow(makeLayer(), { onCreateAppliedGroup });
    fireEvent.click(badge());

    fireEvent.click(screen.getByRole("menuitem", { name: /New group/ }));
    const input = screen.getByRole("textbox", { name: "New group name" });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "  Trim  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCreateAppliedGroup).toHaveBeenCalledWith("layer-1", "Trim");
    expect(menu()).toBeNull();
  });

  it("an empty draft cannot be created", () => {
    const onCreateAppliedGroup = vi.fn();
    renderRow(makeLayer(), { onCreateAppliedGroup });
    fireEvent.click(badge());
    fireEvent.click(screen.getByRole("menuitem", { name: /New group/ }));

    const input = screen.getByRole("textbox", { name: "New group name" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();

    expect(onCreateAppliedGroup).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("Escape in the input abandons the draft but keeps the menu open", () => {
    renderRow();
    fireEvent.click(badge());
    fireEvent.click(screen.getByRole("menuitem", { name: /New group/ }));
    const input = screen.getByRole("textbox", { name: "New group name" });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(menu()).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /New group/ })).not.toBeNull();
  });
});

describe("inline rename", () => {
  it("double-click opens the input; Enter commits the trimmed name", () => {
    const onRename = vi.fn();
    renderRow(makeLayer(), { onRename });

    fireEvent.doubleClick(screen.getByText("Base colour"));
    const input = screen.getByRole("textbox", { name: "Layer name" });
    expect((input as HTMLInputElement).value).toBe("Base colour");

    fireEvent.change(input, { target: { value: " Shading " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("layer-1", "Shading");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Escape cancels without renaming", () => {
    const onRename = vi.fn();
    renderRow(makeLayer(), { onRename });

    fireEvent.doubleClick(screen.getByText("Base colour"));
    const input = screen.getByRole("textbox", { name: "Layer name" });
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Base colour")).not.toBeNull();
  });

  it("blur commits; an unchanged or empty name is not reported", () => {
    const onRename = vi.fn();
    renderRow(makeLayer(), { onRename });

    fireEvent.doubleClick(screen.getByText("Base colour"));
    fireEvent.blur(screen.getByRole("textbox", { name: "Layer name" }));
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByText("Base colour"));
    const input = screen.getByRole("textbox", { name: "Layer name" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByText("Base colour"));
    const again = screen.getByRole("textbox", { name: "Layer name" });
    fireEvent.change(again, { target: { value: "Blurred" } });
    fireEvent.blur(again);
    expect(onRename).toHaveBeenCalledWith("layer-1", "Blurred");
  });
});

describe("the panel header", () => {
  it("the add button opens a channel-only menu and reports onAddLayer(type)", () => {
    const onAddLayer = vi.fn();
    render(
      <BrushLayerPanel
        layers={BRUSH_LAYERS_TYPICAL}
        selectedLayerId={null}
        appliedGroups={BRUSH_GROUPS}
        onAddLayer={onAddLayer}
        onSelect={noop}
        onToggleVisibility={noop}
        onRename={noop}
        onSetChannelType={noop}
        onSetAppliedGroup={noop}
        onCreateAppliedGroup={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDuplicate={noop}
        onDelete={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    const el = screen.getByRole("menu", { name: "New layer channel" });
    expect(document.body.contains(el)).toBe(true);
    // Channel-only: no group rows at all, and nothing is ticked yet.
    expect(screen.queryByRole("menuitem", { name: /New group/ })).toBeNull();
    expect(
      screen
        .getAllByRole("menuitemradio")
        .every((b) => b.getAttribute("aria-checked") === "false"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Normal/ }));
    expect(onAddLayer).toHaveBeenCalledWith("normal");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the empty copy with no layers", () => {
    render(
      <BrushLayerPanel
        layers={[]}
        selectedLayerId={null}
        appliedGroups={[]}
        onAddLayer={noop}
        onSelect={noop}
        onToggleVisibility={noop}
        onRename={noop}
        onSetChannelType={noop}
        onSetAppliedGroup={noop}
        onCreateAppliedGroup={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDuplicate={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText("No layers yet")).not.toBeNull();
  });
});
