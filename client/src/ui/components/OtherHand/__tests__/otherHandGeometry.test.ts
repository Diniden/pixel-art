import { describe, expect, it } from "vitest";
import {
  defaultWidgetSlot,
  snapToStep,
  valueAtTrackY,
} from "../otherHandGeometry";

describe("the default placement", () => {
  it("⭐ spreads a row edge to edge: first at 0, last at 1, evenly between", () => {
    expect(defaultWidgetSlot(0, 3)).toEqual({ row: 0, fraction: 0 });
    expect(defaultWidgetSlot(1, 3)).toEqual({ row: 0, fraction: 0.5 });
    expect(defaultWidgetSlot(2, 3)).toEqual({ row: 0, fraction: 1 });
  });

  it("a lone widget is centred", () => {
    expect(defaultWidgetSlot(0, 1)).toEqual({ row: 0, fraction: 0.5 });
  });

  it("wraps after four, and a short last row spreads on its own count", () => {
    expect(defaultWidgetSlot(3, 7)).toEqual({ row: 0, fraction: 1 });
    expect(defaultWidgetSlot(4, 7)).toEqual({ row: 1, fraction: 0 });
    expect(defaultWidgetSlot(6, 7)).toEqual({ row: 1, fraction: 1 });
    expect(defaultWidgetSlot(4, 5)).toEqual({ row: 1, fraction: 0.5 });
  });
});

describe("snapToStep", () => {
  it("clamps and snaps integers", () => {
    expect(snapToStep(7.4, 1, 16, 1)).toBe(7);
    expect(snapToStep(-3, 1, 16, 1)).toBe(1);
    expect(snapToStep(99, 1, 16, 1)).toBe(16);
  });

  it("⭐ fractional steps do not accumulate float noise", () => {
    expect(snapToStep(0.30000000000000004, 0.1, 5, 0.1)).toBe(0.3);
    expect(snapToStep(2.26, 0.5, 16, 0.5)).toBe(2.5);
  });
});

describe("valueAtTrackY", () => {
  it("the bottom of the track is min and the top is max", () => {
    // Track from y=100 to y=300 (height 200).
    expect(valueAtTrackY(300, 100, 200, 1, 16, 1)).toBe(1);
    expect(valueAtTrackY(100, 100, 200, 1, 16, 1)).toBe(16);
    expect(valueAtTrackY(200, 100, 200, 0, 100, 1)).toBe(50);
  });

  it("a pointer past either end is clamped, and a zero-height track is min", () => {
    expect(valueAtTrackY(-50, 100, 200, 0, 100, 1)).toBe(100);
    expect(valueAtTrackY(999, 100, 200, 0, 100, 1)).toBe(0);
    expect(valueAtTrackY(150, 100, 0, 3, 9, 1)).toBe(3);
  });
});
