/**
 * CanvasSplit — structure of the three stories (mounted with NO provider) and
 * the no-remount contract: swapping pane order with the same keys must keep
 * the same DOM element instances alive.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../CanvasSplit.stories";
import { CanvasSplit } from "../CanvasSplit";
import type { CanvasSplitPane } from "../CanvasSplit";

const { Single, Dual, DualSwapped } = composeStories(stories);

const paneKeys = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".canvas-split__pane")).map((el) =>
    el.getAttribute("data-pane"),
  );

describe("CanvasSplit — stories mount with no provider", () => {
  it("Single renders one pane and no --dual modifier", () => {
    const { container } = render(<Single />);
    const block = container.querySelector(".canvas-split");
    expect(block).not.toBeNull();
    expect(block!.classList.contains("canvas-split--dual")).toBe(false);
    expect(paneKeys(container)).toEqual(["full"]);
  });

  it("Dual renders two panes in the given order with the --dual modifier", () => {
    const { container } = render(<Dual />);
    const block = container.querySelector(".canvas-split");
    expect(block!.classList.contains("canvas-split--dual")).toBe(true);
    expect(paneKeys(container)).toEqual(["full", "layer"]);
  });

  it("DualSwapped reverses the order", () => {
    const { container } = render(<DualSwapped />);
    expect(paneKeys(container)).toEqual(["layer", "full"]);
  });
});

describe("CanvasSplit — a swap reorders, it never remounts", () => {
  it("keeps the same DOM element instances after reversing the array", () => {
    const a: CanvasSplitPane = { key: "full", node: <span>A</span> };
    const b: CanvasSplitPane = { key: "layer", node: <span>B</span> };
    const { container, rerender } = render(<CanvasSplit panes={[a, b]} />);

    const before = Array.from(
      container.querySelectorAll<HTMLElement>(".canvas-split__pane"),
    );
    const [fullBefore, layerBefore] = before;
    const fullChildBefore = fullBefore.firstElementChild;
    const layerChildBefore = layerBefore.firstElementChild;
    expect(paneKeys(container)).toEqual(["full", "layer"]);

    rerender(<CanvasSplit panes={[b, a]} />);

    expect(paneKeys(container)).toEqual(["layer", "full"]);
    const after = Array.from(
      container.querySelectorAll<HTMLElement>(".canvas-split__pane"),
    );
    // Same nodes, new positions.
    expect(after[0] === layerBefore).toBe(true);
    expect(after[1] === fullBefore).toBe(true);
    expect(after[0].firstElementChild === layerChildBefore).toBe(true);
    expect(after[1].firstElementChild === fullChildBefore).toBe(true);
    // And they are still attached to the document.
    expect(fullBefore.isConnected).toBe(true);
    expect(layerBefore.isConnected).toBe(true);
  });
});
