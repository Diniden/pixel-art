/**
 * CanvasViewControls — every story mounts with NO store provider, and the
 * cluster's shape follows its props.
 *
 * What is pinned:
 *  - `ResetOnly` renders exactly the one button it always has (same class,
 *    same aria-label) — existing call sites are unchanged.
 *  - Inside `__stack` the DOM order is mode → (close) → reset, so the mode
 *    button is always directly above whatever sits below it.
 *  - The arrows pass (dx, dy, shiftKey) through `onNudgeOffset`, mirroring
 *    Shift+WASD's "all frames" flag.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../CanvasViewControls.stories";

const composed = composeStories(stories);

const RESET_LABEL = "Center the workspace and return to 100% zoom";

function stackLabels(container: HTMLElement): (string | null)[] {
  const stack = container.querySelector(".canvas-view-controls__stack");
  expect(stack).not.toBeNull();
  return Array.from(stack!.querySelectorAll("button")).map((b) =>
    b.getAttribute("aria-label"),
  );
}

describe("CanvasViewControls — mounts every story with no provider", () => {
  it("exposes exactly the four stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual(
      [
        "ResetOnly",
        "OpenOtherMode",
        "SwapAndClose",
        "FullModeWithOffsetArrows",
      ].sort(),
    );
  });

  it("ResetOnly renders exactly one button — the unchanged reset", () => {
    const { container } = render(<composed.ResetOnly />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].className).toBe("canvas-view-controls__btn");
    expect(buttons[0].getAttribute("aria-label")).toBe(RESET_LABEL);
    expect(buttons[0].getAttribute("title")).toBe(
      "Center the workspace and return to 100%",
    );
    expect(
      container.querySelector(".canvas-view-controls__offsets"),
    ).toBeNull();
    fireEvent.click(buttons[0]);
    expect(composed.ResetOnly.args.onResetView).toHaveBeenCalledTimes(1);
  });

  it("OpenOtherMode stacks mode above reset with data-kind=open", () => {
    const { container } = render(<composed.OpenOtherMode />);
    expect(stackLabels(container)).toEqual(["Open Layer view", RESET_LABEL]);
    const mode = container.querySelector('[data-kind="open"]') as HTMLElement;
    expect(mode).not.toBeNull();
    fireEvent.click(mode);
    expect(
      composed.OpenOtherMode.args.modeButton?.onClick,
    ).toHaveBeenCalledTimes(1);
  });

  it("SwapAndClose stacks swap → close → reset", () => {
    const { container } = render(<composed.SwapAndClose />);
    expect(stackLabels(container)).toEqual([
      "Swap panes",
      "Close Full view",
      RESET_LABEL,
    ]);
    expect(container.querySelector('[data-kind="swap"]')).not.toBeNull();
    fireEvent.click(container.querySelector('[aria-label="Close Full view"]')!);
    expect(composed.SwapAndClose.args.onClose?.onClick).toHaveBeenCalledTimes(
      1,
    );
  });

  it("FullModeWithOffsetArrows renders ← ↑ ↓ → and forwards shift as allFrames", () => {
    const { container } = render(<composed.FullModeWithOffsetArrows />);
    expect(stackLabels(container)).toEqual(["Open Layer view", RESET_LABEL]);

    const arrows = Array.from(
      container.querySelectorAll(".canvas-view-controls__offsets button"),
    );
    expect(arrows.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Nudge variant left (shift: all frames)",
      "Nudge variant up (shift: all frames)",
      "Nudge variant down (shift: all frames)",
      "Nudge variant right (shift: all frames)",
    ]);
    for (const b of arrows) {
      expect(b.classList.contains("canvas-view-controls__btn")).toBe(true);
      expect(b.classList.contains("canvas-view-controls__btn--arrow")).toBe(
        true,
      );
    }

    const nudge = composed.FullModeWithOffsetArrows.args.onNudgeOffset;
    fireEvent.click(arrows[0]);
    expect(nudge).toHaveBeenLastCalledWith(-1, 0, false);
    fireEvent.click(arrows[1], { shiftKey: true });
    expect(nudge).toHaveBeenLastCalledWith(0, -1, true);
    fireEvent.click(arrows[2]);
    expect(nudge).toHaveBeenLastCalledWith(0, 1, false);
    fireEvent.click(arrows[3], { shiftKey: true });
    expect(nudge).toHaveBeenLastCalledWith(1, 0, true);
  });
});
