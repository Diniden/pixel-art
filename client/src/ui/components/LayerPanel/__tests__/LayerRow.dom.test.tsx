/**
 * LayerRow — the thumbnail-as-visibility-toggle contract.
 *
 * The thumbnail IS the hide/show control, so this is not a decoration test:
 * the control is the ONLY affordance for hiding a layer from the siderail,
 * and the glyph swap is its only visual state. What matters here is that the
 * swap happens, that the toggle still exists when there is no thumbnail to
 * show, and that the state is readable without seeing the artwork.
 *
 * jsdom has no canvas, so `getContext` returns null and `draw` never runs —
 * the canvas ELEMENT is still rendered, which is what these assertions use.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayerRow, type LayerRowModel } from "../LayerRow";

function makeLayer(overrides: Partial<LayerRowModel> = {}): LayerRowModel {
  return {
    id: "layer-1",
    name: "Background",
    visible: true,
    isVariant: false,
    variantGroupName: null,
    variantName: null,
    canSquashDown: false,
    canSquashUp: false,
    drawThumbnail: () => {},
    thumbnailRevision: 0,
    thumbnailCacheKey: "layer-1@0@32",
    ...overrides,
  };
}

const noop = () => {};

function renderRow(layer: LayerRowModel, onToggleVisibility = vi.fn()) {
  const utils = render(
    <LayerRow
      layer={layer}
      displayIndex={0}
      displayCount={1}
      isSelected={false}
      isDragging={false}
      isEditing={false}
      editingName=""
      canDelete
      onSelect={noop}
      onToggleVisibility={onToggleVisibility}
      onStartRename={noop}
      onEditingNameChange={noop}
      onFinishRename={noop}
      onCancelRename={noop}
      onDragStart={noop}
      onDragOver={noop}
      onDragEnd={noop}
      onMoveLayer={noop}
      onSquashLayer={noop}
      onCopyLayer={noop}
      onMakeVariant={noop}
      onDuplicateLayer={noop}
      onDeleteLayer={noop}
      onRemoveVariantLayer={noop}
      onOpenVariantSelect={noop}
    />,
  );
  return { ...utils, onToggleVisibility };
}

describe("LayerRow visibility control", () => {
  it("renders the thumbnail canvas inside the toggle while visible", () => {
    const { container } = renderRow(makeLayer({ visible: true }));

    const button = screen.getByRole("button", { name: "Hide Background" });
    expect(button.querySelector("canvas")).not.toBeNull();
    // One control, not a preview beside a button.
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("swaps the canvas for the hidden glyph when the layer is hidden", () => {
    const { container } = renderRow(makeLayer({ visible: false }));

    const button = screen.getByRole("button", { name: "Show Background" });
    // No canvas at all: a hidden layer costs no paint and no cache entry.
    expect(container.querySelector("canvas")).toBeNull();
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("carries the state as aria-pressed, not only as a glyph", () => {
    renderRow(makeLayer({ visible: true }));
    expect(
      screen.getByRole("button", { name: "Hide Background" }),
    ).toHaveAttribute("aria-pressed", "true");

    renderRow(makeLayer({ visible: false }));
    expect(
      screen.getByRole("button", { name: "Show Background" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("tapping the thumbnail toggles visibility without selecting the row", () => {
    const onToggleVisibility = vi.fn();
    const onSelect = vi.fn();
    render(
      <LayerRow
        layer={makeLayer()}
        displayIndex={0}
        displayCount={1}
        isSelected={false}
        isDragging={false}
        isEditing={false}
        editingName=""
        canDelete
        onSelect={onSelect}
        onToggleVisibility={onToggleVisibility}
        onStartRename={noop}
        onEditingNameChange={noop}
        onFinishRename={noop}
        onCancelRename={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
        onMoveLayer={noop}
        onSquashLayer={noop}
        onCopyLayer={noop}
        onMakeVariant={noop}
        onDuplicateLayer={noop}
        onDeleteLayer={noop}
        onRemoveVariantLayer={noop}
        onOpenVariantSelect={noop}
      />,
    );

    screen.getByRole("button", { name: "Hide Background" }).click();
    expect(onToggleVisibility).toHaveBeenCalledWith("layer-1");
    // The row's own onClick selects; the button stops propagation.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps a plain eye toggle when the row has no thumbnail painter", () => {
    const { container } = renderRow(
      makeLayer({ drawThumbnail: undefined, visible: true }),
    );

    // The toggle must never disappear just because there is nothing to show.
    const button = screen.getByRole("button", { name: "Hide Background" });
    expect(button.className).not.toContain("layer-panel__visibility-btn--thumb");
    expect(container.querySelector("canvas")).toBeNull();
    expect(button.querySelector("svg")).not.toBeNull();
  });
});
