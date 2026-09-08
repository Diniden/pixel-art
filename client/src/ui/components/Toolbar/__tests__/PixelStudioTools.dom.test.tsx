/**
 * PixelStudioTools `hiddenTools` (brush-studio task 19).
 *
 * The brush studio shares this bar but has no anchor point and no reference
 * image, so its container passes `{ origin, reference-trace }`. `origin` is
 * a table entry and is filtered by id; `reference-trace` has none — its UI
 * is the reference-image group, which goes with it. Everything else stays,
 * and with the prop absent the bar is exactly what the pixel studio had.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PixelStudioTools } from "../PixelStudioTools";
import type { Tool } from "../../../../types";

const noop = () => {};

const base = {
  selectedTool: "pixel" as Tool,
  onSelectTool: noop,
  alternateTool: "eraser" as Tool,
  onSelectAlternateTool: noop,
  onSwapTools: noop,
  eyedropperMode: "revert" as const,
  onSelectEyedropperMode: noop,
  onUndo: noop,
  onRedo: noop,
  canUndo: false,
  canRedo: false,
  onFlipHorizontal: noop,
  onFlipVertical: noop,
  referenceImageModal: () => null,
};

/** The tool-table buttons only — the first `toolbar__group` in the section. */
function toolButtons(container: HTMLElement): HTMLButtonElement[] {
  const group = container.querySelector(".toolbar__group");
  return [...(group?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
}

const origin = (c: HTMLElement) =>
  c.querySelector('button[aria-label^="Origin"]');
const addReference = (c: HTMLElement) =>
  c.querySelector('button[aria-label="Add Reference Image"]');

describe("PixelStudioTools hiddenTools", () => {
  it("with the prop absent, shows Origin and the reference-image group", () => {
    const { container } = render(<PixelStudioTools {...base} />);
    expect(origin(container)).not.toBeNull();
    expect(addReference(container)).not.toBeNull();
    expect(
      container.querySelector(".toolbar__group--reference"),
    ).not.toBeNull();
    expect(toolButtons(container)).toHaveLength(13);
  });

  it("the brush studio's set hides Origin and the whole reference group", () => {
    const { container } = render(
      <PixelStudioTools
        {...base}
        hiddenTools={new Set<Tool>(["origin", "reference-trace"])}
      />,
    );
    expect(origin(container)).toBeNull();
    expect(addReference(container)).toBeNull();
    expect(container.querySelector(".toolbar__group--reference")).toBeNull();
    expect(toolButtons(container)).toHaveLength(12);

    // Undo/redo/flip survive — they are not tools, they are the bar's own
    // buttons and the brush studio routes them by mode in the container.
    expect(container.querySelector('button[aria-label="Undo"]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Flip Horizontal"]'),
    ).not.toBeNull();
  });

  it("hiding only a table tool keeps the reference group", () => {
    const { container } = render(
      <PixelStudioTools {...base} hiddenTools={new Set<Tool>(["origin"])} />,
    );
    expect(origin(container)).toBeNull();
    expect(addReference(container)).not.toBeNull();
    expect(toolButtons(container)).toHaveLength(12);
  });
});
