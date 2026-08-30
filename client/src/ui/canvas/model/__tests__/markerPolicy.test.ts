/**
 * `markerAction` — who owns the hover marker.
 *
 * ⭐ The starred test below is the one that would have caught the 2026-08-28
 * regression: the touch path cleared the marker on start and end but never set
 * it on move, so it was permanently null during a touch stroke and the feature
 * was invisible on the iPad. Nothing threw; the marker was simply never there.
 */
import { describe, expect, it } from "vitest";
import { markerAction } from "../markerPolicy";

describe("markerAction", () => {
  describe("touch — tracks THROUGH the stroke", () => {
    it("⭐ tracks while drawing, because the hand covers the cells", () => {
      // THE REGRESSION. A finger or pencil tip hides what it is painting, so
      // the marker is the only feedback — most of all for the eraser, which
      // paints nothing to look at. If this returns "clear" or "ignore", the
      // marker is invisible for the entire stroke.
      expect(
        markerAction({ device: "touch", phase: "move", isDrawing: true }),
      ).toBe("track");
    });

    it("tracks between strokes too — a resting pencil still reports moves", () => {
      expect(
        markerAction({ device: "touch", phase: "move", isDrawing: false }),
      ).toBe("track");
    });

    it("clears on start, so a tap that never moves drops the stale marker", () => {
      expect(
        markerAction({ device: "touch", phase: "start", isDrawing: false }),
      ).toBe("clear");
    });

    it("clears on end", () => {
      expect(
        markerAction({ device: "touch", phase: "end", isDrawing: true }),
      ).toBe("clear");
    });
  });

  describe("mouse — cleared during a stroke, deliberately unlike touch", () => {
    it("clears while drawing: the cursor and stroke are feedback enough", () => {
      expect(
        markerAction({ device: "mouse", phase: "move", isDrawing: true }),
      ).toBe("clear");
    });

    it("tracks when not drawing", () => {
      expect(
        markerAction({ device: "mouse", phase: "move", isDrawing: false }),
      ).toBe("track");
    });

    it("⭐ disagrees with touch during a stroke — the asymmetry is the point", () => {
      // If these ever return the same thing, one of the two devices has the
      // wrong behaviour: the rule is about OCCLUSION, not consistency.
      const mouse = markerAction({
        device: "mouse",
        phase: "move",
        isDrawing: true,
      });
      const touch = markerAction({
        device: "touch",
        phase: "move",
        isDrawing: true,
      });
      expect(mouse).not.toBe(touch);
    });
  });

  describe("bridged pencil hover — yields to the touch handlers", () => {
    it("ignores samples while a stroke is in flight, so there is ONE writer", () => {
      // The airborne tip and the contact point disagree when the pencil is
      // tilted; two writers would jitter the marker between two cells.
      expect(
        markerAction({ device: "pencil-hover", phase: "move", isDrawing: true }),
      ).toBe("ignore");
    });

    it("tracks when no stroke is in flight", () => {
      expect(
        markerAction({
          device: "pencil-hover",
          phase: "move",
          isDrawing: false,
        }),
      ).toBe("track");
    });
  });
});
