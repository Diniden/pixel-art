/**
 * BrushDeltaPicker — the props contract (task 14).
 *
 * The two Storybook manual checks that CAN be proven in jsdom are proven
 * here: typing −300 into a channel box and blurring commits −255 (the clamp
 * lives in `NumberInput`; this pins that the picker passes the delta range
 * through), and the swatch colour follows `brushCellToRgba` (127 = zero
 * delta). The iPad numeric-keyboard check cannot be, and is not, covered.
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
});
