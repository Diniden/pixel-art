/**
 * ReflectionLinesSection — every story mounts with NO store provider, and the
 * section's shape follows its props.
 *
 * What is pinned:
 *  - `Empty` shows the hint and NO Clear all, but the presets stay live: the
 *    presets are the only way to get a line without the canvas gesture, so
 *    hiding or disabling them on an empty list would strand the owner.
 *  - The ✕ buttons pass the line's ID (not its index) to `onRemoveLine` —
 *    indexes shift as soon as one row is removed, so a wrong wiring here is
 *    the kind of bug that only shows up on the second click.
 *  - The five presets are present, in order, and fire their own name.
 *  - `AtCapacity` disables every preset and leaves the rows and Clear all
 *    alone — a full list must still be emptiable.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../ReflectionLinesSection.stories";

const composed = composeStories(stories);

const PRESET_LABELS = ["Vertical", "Horizontal", "Both", "Diagonals", "All"];

function presets(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(".reflection-lines__preset"),
  );
}

function removeButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(".reflection-lines__remove"),
  );
}

describe("ReflectionLinesSection — mounts every story with no provider", () => {
  it("exposes exactly the three stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual(
      ["Empty", "TwoLines", "AtCapacity"].sort(),
    );
  });

  it("Empty shows the hint, no rows and no Clear all — presets stay live", () => {
    const { container } = render(<composed.Empty />);

    const empty = container.querySelector(".reflection-lines__empty");
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toBe(
      "Drag on the canvas to draw a reflection line",
    );

    expect(container.querySelector(".reflection-lines__list")).toBeNull();
    expect(container.querySelector(".reflection-lines__clear")).toBeNull();

    expect(presets(container).map((b) => b.textContent)).toEqual(
      PRESET_LABELS,
    );
    for (const button of presets(container)) expect(button.disabled).toBe(false);
  });

  it("TwoLines lists both labels with 1-based aria-labels and no hint", () => {
    const { container } = render(<composed.TwoLines />);

    expect(container.querySelector(".reflection-lines__empty")).toBeNull();

    const labels = Array.from(
      container.querySelectorAll(".reflection-lines__label"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["(16,0) → (16,32)", "(0,16) → (32,16)"]);

    expect(
      removeButtons(container).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Remove reflection line 1", "Remove reflection line 2"]);
  });

  it("the ✕ buttons fire onRemoveLine with the line ID, not the index", () => {
    const { container } = render(<composed.TwoLines />);
    const onRemoveLine = composed.TwoLines.args.onRemoveLine;

    fireEvent.click(removeButtons(container)[1]);
    expect(onRemoveLine).toHaveBeenLastCalledWith("refl-1");

    fireEvent.click(removeButtons(container)[0]);
    expect(onRemoveLine).toHaveBeenLastCalledWith("refl-0");
    expect(onRemoveLine).toHaveBeenCalledTimes(2);
  });

  it("Clear all fires onClearAll and appears only when there are lines", () => {
    const { container } = render(<composed.TwoLines />);
    const clear = container.querySelector<HTMLButtonElement>(
      ".reflection-lines__clear",
    );
    expect(clear).not.toBeNull();
    expect(clear!.textContent).toBe("Clear all");

    fireEvent.click(clear!);
    expect(composed.TwoLines.args.onClearAll).toHaveBeenCalledTimes(1);
  });

  it("each preset button fires onApplyPreset with its own preset name", () => {
    const { container } = render(<composed.TwoLines />);
    const onApplyPreset = composed.TwoLines.args.onApplyPreset;
    const names = ["vertical", "horizontal", "both", "diagonals", "all"];

    const buttons = presets(container);
    expect(buttons).toHaveLength(names.length);

    buttons.forEach((button, i) => {
      fireEvent.click(button);
      expect(onApplyPreset).toHaveBeenLastCalledWith(names[i]);
    });
    expect(onApplyPreset).toHaveBeenCalledTimes(names.length);
  });

  it("AtCapacity disables every preset but keeps the rows removable", () => {
    const { container } = render(<composed.AtCapacity />);

    const buttons = presets(container);
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("title")).toBe(
        "Remove a line before adding more",
      );
    }

    // Eight rows, and both escape hatches still work at the cap.
    expect(removeButtons(container)).toHaveLength(8);
    fireEvent.click(removeButtons(container)[7]);
    expect(composed.AtCapacity.args.onRemoveLine).toHaveBeenLastCalledWith(
      "refl-7",
    );

    fireEvent.click(
      container.querySelector<HTMLButtonElement>(".reflection-lines__clear")!,
    );
    expect(composed.AtCapacity.args.onClearAll).toHaveBeenCalledTimes(1);
  });

  it("a disabled preset does not fire its callback", () => {
    const { container } = render(<composed.AtCapacity />);
    fireEvent.click(presets(container)[0]);
    expect(composed.AtCapacity.args.onApplyPreset).not.toHaveBeenCalled();
  });
});
