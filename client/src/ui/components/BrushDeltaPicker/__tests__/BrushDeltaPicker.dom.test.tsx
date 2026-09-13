/**
 * BrushDeltaPicker — the props contract (task 14).
 *
 * The two Storybook manual checks that CAN be proven in jsdom are proven
 * here: typing −300 into a channel box and blurring commits −255 (the clamp
 * lives in `NumberInput`; this pins that the picker passes the delta range
 * through), and the swatch colour follows `brushCellToRgba` (127 = zero
 * delta). The iPad numeric-keyboard check cannot be, and is not, covered.
 *
 * Edge/Fill (follow-ups task 05): the tab row is opt-in — absent unless BOTH
 * `target` and `onTargetChange` are supplied — so the first describe block
 * (no slots) is unchanged and doubles as the compatibility pin for the W1
 * caller.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BrushDeltaPicker } from "../BrushDeltaPicker";
import type { BrushDelta } from "../../../../types";

function renderPicker(
  channelType: Parameters<typeof BrushDeltaPicker>[0]["channelType"],
  value: BrushDelta,
  overrides: Partial<Parameters<typeof BrushDeltaPicker>[0]> = {},
) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <BrushDeltaPicker
      channelType={channelType}
      value={value}
      onChange={onChange}
      onReset={onReset}
      {...overrides}
    />,
  );
  return { onChange, onReset };
}

describe("BrushDeltaPicker", () => {
  it("renders one slider + number box per channel of the channel type", () => {
    renderPicker("hsl", [0, 0, 0, 0]);
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
    expect(screen.getByRole("slider", { name: "H delta" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "A delta" })).toBeInTheDocument();
  });

  it("shows 3 rows for normal and 1 for heightmap", () => {
    const { unmount } = render(
      <BrushDeltaPicker
        channelType="normal"
        value={[0, 0, 0, 0]}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getByRole("slider", { name: "Z delta" })).toBeInTheDocument();
    unmount();

    render(
      <BrushDeltaPicker
        channelType="heightmap"
        value={[0, 0, 0, 0]}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.getByRole("slider", { name: "H delta" })).toBeInTheDocument();
  });

  it("renders the empty state and no sliders when channelType is null", () => {
    renderPicker(null, [0, 0, 0, 0]);
    expect(screen.getByText("Select a layer")).toBeInTheDocument();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("slider moves fire onChange(index, value) with no debounce", () => {
    const { onChange } = renderPicker("rgb", [0, 0, 0, 0]);
    fireEvent.change(screen.getByRole("slider", { name: "G delta" }), {
      target: { value: "-120" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1, -120);
  });

  it("typing -300 into the number box and blurring clamps to -255", () => {
    const { onChange } = renderPicker("rgb", [0, 0, 0, 0]);
    const box = screen.getByRole("spinbutton", { name: "R delta" });
    fireEvent.change(box, { target: { value: "-300" } });
    // Keystrokes never commit.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith(0, -255);
  });

  it("typing 999 and pressing Enter clamps to 255", () => {
    const { onChange } = renderPicker("rgb", [0, 0, 0, 0]);
    const box = screen.getByRole("spinbutton", { name: "B delta" });
    fireEvent.change(box, { target: { value: "999" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(2, 255);
  });

  it("the number box shows the signed value", () => {
    renderPicker("rgb", [-42, 0, 0, 0]);
    expect(screen.getByRole("spinbutton", { name: "R delta" })).toHaveValue(
      -42,
    );
  });

  it("swatch colour follows brushCellToRgba: zero delta is mid-grey", () => {
    renderPicker("rgb", [0, 0, 0, 0]);
    const swatch = screen.getByTestId("brush-delta-swatch");
    expect(swatch).toHaveAttribute("aria-label", "#7f7f7f alpha 127");
    const fill = swatch.querySelector(
      ".brush-delta-picker__swatch-color",
    ) as HTMLElement;
    expect(fill.style.background).toContain("rgba(127, 127, 127");
  });

  it("swatch colour: extremes map to 0 and 255, heightmap is grey", () => {
    const { unmount } = render(
      <BrushDeltaPicker
        channelType="rgb"
        value={[255, -255, 0, 255]}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId("brush-delta-swatch")).toHaveAttribute(
      "aria-label",
      "#ff007f alpha 255",
    );
    unmount();

    render(
      <BrushDeltaPicker
        channelType="heightmap"
        value={[-255, 0, 0, 0]}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId("brush-delta-swatch")).toHaveAttribute(
      "aria-label",
      "#000000 alpha 255",
    );
  });

  it("Reset fires onReset, and is disabled when every channel is zero", () => {
    const { onReset } = renderPicker("hsl", [10, 0, 0, 0]);
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Reset is disabled at all-zero (only visible channels count)", () => {
    // heightmap shows slot 0 only; a non-zero hidden slot must not enable it.
    renderPicker("heightmap", [0, 50, 0, 0]);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("disabled disables every input and the reset button", () => {
    renderPicker("rgb", [10, 20, 30, 40], { disabled: true });
    for (const el of screen.getAllByRole("slider")) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole("spinbutton")) {
      expect(el).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("renders no tab row and no swap button without target/onTargetChange", () => {
    renderPicker("rgb", [0, 0, 0, 0], { onSwap: () => {} });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Swap edge and fill deltas" }),
    ).toBeNull();
  });
});

describe("BrushDeltaPicker edge/fill target row", () => {
  const EDGE: BrushDelta = [255, -255, 0, 255];
  const FILL: BrushDelta = [0, 0, 0, 0];

  function renderWithTargets(
    overrides: Partial<Parameters<typeof BrushDeltaPicker>[0]> = {},
  ) {
    const onTargetChange = vi.fn();
    const rest = renderPicker("rgb", EDGE, {
      target: "edge",
      onTargetChange,
      edgeValue: EDGE,
      fillValue: FILL,
      ...overrides,
    });
    return { ...rest, onTargetChange };
  }

  it("renders a tablist with Edge and Fill tabs; the active one is selected", () => {
    renderWithTargets();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    const edge = screen.getByRole("tab", { name: "Edge" });
    const fill = screen.getByRole("tab", { name: "Fill" });
    expect(edge).toHaveAttribute("aria-selected", "true");
    expect(fill).toHaveAttribute("aria-selected", "false");
    expect(edge).toHaveClass("brush-delta-picker__target--active");
    expect(fill).not.toHaveClass("brush-delta-picker__target--active");
  });

  it("target='fill' selects the Fill tab", () => {
    renderWithTargets({ target: "fill", value: FILL });
    expect(screen.getByRole("tab", { name: "Fill" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Edge" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("clicking Fill calls onTargetChange('fill')", () => {
    const { onTargetChange } = renderWithTargets();
    fireEvent.click(screen.getByRole("tab", { name: "Fill" }));
    expect(onTargetChange).toHaveBeenCalledTimes(1);
    expect(onTargetChange).toHaveBeenCalledWith("fill");
  });

  it("Left/Right arrows on the tablist move to the other tab", () => {
    const { onTargetChange } = renderWithTargets();
    const edge = screen.getByRole("tab", { name: "Edge" });
    const fill = screen.getByRole("tab", { name: "Fill" });
    // Roving tabindex: only the active tab is in the tab order.
    expect(edge).toHaveAttribute("tabindex", "0");
    expect(fill).toHaveAttribute("tabindex", "-1");
    edge.focus();
    fireEvent.keyDown(edge, { key: "ArrowRight" });
    expect(onTargetChange).toHaveBeenCalledWith("fill");
    expect(fill).toHaveFocus();
    // An unrelated key does nothing.
    fireEvent.keyDown(edge, { key: "Enter" });
    expect(onTargetChange).toHaveBeenCalledTimes(1);
  });

  it("the two tab swatches carry each slot's colourised delta (grey at zero)", () => {
    renderWithTargets();
    const edgeSwatch = screen.getByTestId("brush-delta-target-swatch-edge");
    const fillSwatch = screen.getByTestId("brush-delta-target-swatch-fill");
    // jsdom serialises an opaque rgba() as rgb().
    expect(edgeSwatch.style.backgroundColor).toMatch(/^rgba?\(255, 0, 127/);
    // Zero delta → #7f7f7f, alpha 127/255.
    expect(fillSwatch.style.backgroundColor).toContain("rgba(127, 127, 127");
  });

  it("swatches are grey with no layer selected, and the row still renders", () => {
    renderPicker(null, EDGE, {
      target: "edge",
      onTargetChange: () => {},
      edgeValue: EDGE,
      fillValue: FILL,
    });
    expect(screen.getByText("Select a layer")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(
      screen.getByTestId("brush-delta-target-swatch-edge").style
        .backgroundColor,
    ).toMatch(/^rgba?\(127, 127, 127/);
  });

  it("edgeValue/fillValue default to value", () => {
    renderPicker("rgb", EDGE, { target: "edge", onTargetChange: () => {} });
    expect(
      screen.getByTestId("brush-delta-target-swatch-fill").style
        .backgroundColor,
    ).toMatch(/^rgba?\(255, 0, 127/);
  });

  it("swap button is absent without onSwap", () => {
    renderWithTargets();
    expect(
      screen.queryByRole("button", { name: "Swap edge and fill deltas" }),
    ).toBeNull();
  });

  it("swap button is present with onSwap, sits outside the tablist, and fires once", () => {
    const onSwap = vi.fn();
    renderWithTargets({ onSwap });
    const swap = screen.getByRole("button", {
      name: "Swap edge and fill deltas",
    });
    expect(screen.getByRole("tablist")).not.toContainElement(swap);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it("sliders still edit `value` via onChange, whichever slot is active", () => {
    const { onChange } = renderWithTargets({ target: "fill", value: FILL });
    expect(screen.getByRole("spinbutton", { name: "R delta" })).toHaveValue(0);
    fireEvent.change(screen.getByRole("slider", { name: "R delta" }), {
      target: { value: "77" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0, 77);
  });

  it("disabled disables the tabs and the swap button too", () => {
    renderWithTargets({ onSwap: () => {}, disabled: true });
    for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Swap edge and fill deltas" }),
    ).toBeDisabled();
  });
});
