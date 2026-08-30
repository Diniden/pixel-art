/**
 * Other Hand Mode — the pure arrangement functions (2026-08-28).
 *
 * ⭐ The invariant worth pinning: `DEFAULT_RAIL_LAYOUT.otherHand` is `{}`,
 * and every function returns the SAME object when nothing changes, so a
 * layout that has never been arranged is never rewritten.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RAIL_LAYOUT,
  resetOtherHandPositions,
  setOtherHandColorModel,
  setOtherHandIncludeAlpha,
  setOtherHandWidgetPosition,
  isOtherHandPosition,
  isOtherHandColorModel,
} from "../railLayout";

describe("Other Hand arrangements", () => {
  it("⭐ the default layout has nothing arranged", () => {
    expect(DEFAULT_RAIL_LAYOUT.otherHand).toEqual({});
  });

  it("places a widget under its section, clamped to the stage", () => {
    const next = setOtherHandWidgetPosition(
      DEFAULT_RAIL_LAYOUT,
      "tool:pixel",
      "size",
      { x: 130, y: -4 },
    );
    expect(next.otherHand["tool:pixel"].positions.size).toEqual({
      x: 100,
      y: 0,
    });
    // Other sections and the rest of the layout are untouched.
    expect(next.left).toBe(DEFAULT_RAIL_LAYOUT.left);
    expect(DEFAULT_RAIL_LAYOUT.otherHand).toEqual({});
  });

  it("a non-finite position lands at the origin rather than poisoning the file", () => {
    const next = setOtherHandWidgetPosition(DEFAULT_RAIL_LAYOUT, "color", "h", {
      x: Number.NaN,
      y: Number.POSITIVE_INFINITY,
    });
    expect(next.otherHand.color.positions.h).toEqual({ x: 0, y: 0 });
  });

  it("keeps sibling widgets when one moves", () => {
    const a = setOtherHandWidgetPosition(DEFAULT_RAIL_LAYOUT, "color", "h", {
      x: 1,
      y: 2,
    });
    const b = setOtherHandWidgetPosition(a, "color", "s", { x: 3, y: 4 });
    expect(b.otherHand.color.positions).toEqual({
      h: { x: 1, y: 2 },
      s: { x: 3, y: 4 },
    });
  });

  it("the colour model and alpha flag are preferences, and no-op when unchanged", () => {
    const hsl = setOtherHandColorModel(DEFAULT_RAIL_LAYOUT, "color", "rgb");
    expect(hsl.otherHand.color.colorModel).toBe("rgb");
    expect(setOtherHandColorModel(hsl, "color", "rgb")).toBe(hsl);

    const alpha = setOtherHandIncludeAlpha(hsl, "color", true);
    expect(alpha.otherHand.color.includeAlpha).toBe(true);
    expect(setOtherHandIncludeAlpha(alpha, "color", true)).toBe(alpha);
  });

  it("⭐ reset forgets positions but keeps the colour preferences", () => {
    let layout = setOtherHandColorModel(DEFAULT_RAIL_LAYOUT, "color", "rgb");
    layout = setOtherHandIncludeAlpha(layout, "color", true);
    layout = setOtherHandWidgetPosition(layout, "color", "r", { x: 50, y: 50 });

    const reset = resetOtherHandPositions(layout, "color");
    expect(reset.otherHand.color).toEqual({
      positions: {},
      colorModel: "rgb",
      includeAlpha: true,
    });
    // Resetting a section that was never arranged is the identity.
    expect(resetOtherHandPositions(DEFAULT_RAIL_LAYOUT, "light")).toBe(
      DEFAULT_RAIL_LAYOUT,
    );
  });

  it("the guards accept only what the store can use", () => {
    expect(isOtherHandPosition({ x: 1, y: 2 })).toBe(true);
    expect(isOtherHandPosition({ x: "1", y: 2 })).toBe(false);
    expect(isOtherHandPosition(null)).toBe(false);
    expect(isOtherHandColorModel("hsl")).toBe(true);
    expect(isOtherHandColorModel("cmyk")).toBe(false);
  });
});
