/**
 * BrushLayerRow + BrushChannelMenu — the portal, the keyboard, the rename.
 *
 * ⚠️ jsdom does no layout and no clipping, so the reason the menu is a
 * portal (the rail's scroller clips an in-flow menu) is NOT observable
 * here. The testable half is the PARENTAGE: the menu must sit on
 * `document.body`, outside the row's subtree. The rest pins the keyboard
 * contract, the inline-rename commit/cancel semantics, and (plan 13, task
 * 03) the colour-source contract: a sticky tick that does NOT close the
 * creation menu, and a row badge whose pick does.
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
    colorSource: "selected",
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
      | "onSetColorSource"
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
      onSetColorSource={noop}
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
const sourceBadge = () =>
  screen.getByRole("button", { name: /^Colour source:/ });
const menu = () => screen.queryByRole("menu");
const radio = (name: RegExp | string) =>
  screen.getByRole("menuitemradio", { name });

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

  it("focuses the first ticked row on open and the arrows traverse source, channels, then groups", () => {
    renderRow(makeLayer({ channelType: "hsl" }));
    fireEvent.click(badge());

    // The colour-source section sits ABOVE the channels, so the first ticked
    // row — and the open focus — is the source in force, not the channel.
    const selected = radio(/^Selected colour/);
    const target = radio(/^Target pixel/);
    const hsl = radio(/^HSL/);
    const rgb = radio(/^RGB/);
    expect(document.activeElement).toBe(selected);

    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(target);

    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(hsl);

    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rgb);

    fireEvent.keyDown(menu()!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(hsl);

    fireEvent.keyDown(menu()!, { key: "Home" });
    expect(document.activeElement).toBe(selected);

    fireEvent.keyDown(menu()!, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: /New group/ }),
    );

    // Wraps from the last row back to the first: source is the head.
    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(selected);
  });
});

describe("the colour-source badge (plan 13)", () => {
  it("shows SEL or TGT from the row model, after the channel badge", () => {
    renderRow(makeLayer({ colorSource: "target" }));
    const src = sourceBadge();
    expect(src).toHaveTextContent("TGT");
    expect(src).toHaveAttribute("aria-label", "Colour source: TGT");
    expect(src).toHaveClass("brush-layer-panel__source-badge--target");
    // DOM order: channel badge, then source badge, in the same label row.
    expect(
      badge().compareDocumentPosition(src) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(badge().parentElement).toBe(src.parentElement);
  });

  it("the TGT badge opens the row menu anchored on ITSELF; picking the other source fires once and closes", () => {
    const onSetColorSource = vi.fn();
    const onSelect = vi.fn();
    renderRow(makeLayer({ colorSource: "target" }), {
      onSetColorSource,
      onSelect,
    });
    fireEvent.click(sourceBadge());

    expect(menu()).not.toBeNull();
    expect(sourceBadge()).toHaveAttribute("aria-expanded", "true");
    expect(sourceBadge()).toHaveClass("brush-layer-panel__source-badge--open");
    // The channel badge is NOT the anchor this time.
    expect(badge()).toHaveAttribute("aria-expanded", "false");
    expect(badge()).not.toHaveClass("brush-layer-panel__channel-badge--open");
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "false");

    fireEvent.click(radio(/^Selected colour/));

    expect(onSetColorSource).toHaveBeenCalledTimes(1);
    expect(onSetColorSource).toHaveBeenCalledWith("layer-1", "selected");
    expect(menu()).toBeNull();
    expect(sourceBadge()).toHaveAttribute("aria-expanded", "false");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("the SEL badge opens the same menu; picking Target pixel fires once and closes", () => {
    const onSetColorSource = vi.fn();
    renderRow(makeLayer({ colorSource: "selected" }), { onSetColorSource });
    fireEvent.click(sourceBadge());

    expect(sourceBadge()).toHaveTextContent("SEL");
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radio(/^Target pixel/));

    expect(onSetColorSource).toHaveBeenCalledTimes(1);
    expect(onSetColorSource).toHaveBeenCalledWith("layer-1", "target");
    expect(menu()).toBeNull();
  });

  it("the channel badge's menu carries the source section too, and stays one menu", () => {
    const onSetColorSource = vi.fn();
    renderRow(makeLayer(), { onSetColorSource });
    fireEvent.click(badge());
    expect(badge()).toHaveAttribute("aria-expanded", "true");
    expect(sourceBadge()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("menu")).toHaveLength(1);

    // Pressing the other badge while open re-anchors rather than stacking.
    fireEvent.click(sourceBadge());
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(sourceBadge()).toHaveAttribute("aria-expanded", "true");
    expect(badge()).toHaveAttribute("aria-expanded", "false");

    // And its own second press toggles it shut, like the channel badge.
    fireEvent.click(sourceBadge());
    expect(menu()).toBeNull();
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
  const ADD_MENU = "New layer — colour source, then channel";
  const addButton = () => screen.getByRole("button", { name: "Add layer" });

  function renderPanel(
    onAddLayer: (...args: unknown[]) => void = noop,
    layers: ReadonlyArray<BrushLayerRowModel> = BRUSH_LAYERS_TYPICAL,
  ) {
    return render(
      <BrushLayerPanel
        layers={layers}
        selectedLayerId={null}
        appliedGroups={BRUSH_GROUPS}
        onAddLayer={onAddLayer}
        onSelect={noop}
        onToggleVisibility={noop}
        onRename={noop}
        onSetChannelType={noop}
        onSetColorSource={noop}
        onSetAppliedGroup={noop}
        onCreateAppliedGroup={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDuplicate={noop}
        onDelete={noop}
      />,
    );
  }

  it("the add button opens a source-then-channel menu and reports onAddLayer(type, 'selected') by default", () => {
    const onAddLayer = vi.fn();
    renderPanel(onAddLayer);

    fireEvent.click(addButton());
    const el = screen.getByRole("menu", { name: ADD_MENU });
    expect(document.body.contains(el)).toBe(true);
    // No group rows at all; "Selected colour" is the default tick and no
    // channel is ticked yet.
    expect(screen.queryByRole("menuitem", { name: /New group/ })).toBeNull();
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "false");
    expect(
      [
        radio(/^HSL/),
        radio(/^RGB/),
        radio(/^Normal/),
        radio(/^Heightmap/),
      ].every((b) => b.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    // Source section ABOVE the channels.
    expect(
      radio(/^Target pixel/).compareDocumentPosition(radio(/^HSL/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(radio(/Normal/));
    expect(onAddLayer).toHaveBeenCalledTimes(1);
    expect(onAddLayer).toHaveBeenCalledWith("normal", "selected");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("picking Target pixel ticks and KEEPS the menu open; the channel pick then reports 'target'", () => {
    const onAddLayer = vi.fn();
    renderPanel(onAddLayer);
    fireEvent.click(addButton());

    fireEvent.click(radio(/^Target pixel/));

    // Sticky tick, no close, nothing created yet (MASTER D3).
    expect(screen.getByRole("menu", { name: ADD_MENU })).not.toBeNull();
    expect(onAddLayer).not.toHaveBeenCalled();
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "false");
    expect(addButton()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(radio(/Normal/));
    expect(onAddLayer).toHaveBeenCalledTimes(1);
    expect(onAddLayer).toHaveBeenCalledWith("normal", "target");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the draft source resets to 'selected' when the menu closes without creating", () => {
    const onAddLayer = vi.fn();
    renderPanel(onAddLayer);
    fireEvent.click(addButton());
    fireEvent.click(radio(/^Target pixel/));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onAddLayer).not.toHaveBeenCalled();

    fireEvent.click(addButton());
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "false");

    // The "+" itself toggling the menu shut also resets the draft.
    fireEvent.click(radio(/^Target pixel/));
    fireEvent.click(addButton());
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(addButton());
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(radio(/Heightmap/));
    expect(onAddLayer).toHaveBeenCalledWith("heightmap", "selected");
  });

  it("shows the empty copy with no layers", () => {
    renderPanel(noop, []);
    expect(screen.getByText("No layers yet")).not.toBeNull();
  });
});
