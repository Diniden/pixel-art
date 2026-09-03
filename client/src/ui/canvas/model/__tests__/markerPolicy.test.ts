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

  describe("⭐ the ERASER keeps its marker through a mouse stroke", () => {
    /* Owner report, 2026-09-01: "the eraser's highlight region disappears
       while I erase, which is dangerous." The mouse rule — clear during a
       stroke because "the cursor and the stroke are feedback enough" — is an
       argument about a tool that ADDS colour. An erased cell shows nothing, so
       the marker is the only thing describing the footprint being destroyed.
       The module header already made this argument for touch; it was simply
       never applied to the mouse. */
    it("tracks while drawing, unlike every other tool", () => {
      expect(
        markerAction({
          device: "mouse",
          phase: "move",
          isDrawing: true,
          tool: "eraser",
        }),
      ).toBe("track");
    });

    it("still differs from the pencil, which clears", () => {
      const eraser = markerAction({
        device: "mouse",
        phase: "move",
        isDrawing: true,
        tool: "eraser",
      });
      const pencil = markerAction({
        device: "mouse",
        phase: "move",
        isDrawing: true,
        tool: "pixel",
      });
      expect(eraser).toBe("track");
      expect(pencil).toBe("clear");
    });

    it("an ENDED gesture still clears — no marker outlives a stroke", () => {
      // The `phase === "end"` rule outranks the tool: a released eraser must
      // not leave a marker sitting on the last cell.
      expect(
        markerAction({
          device: "mouse",
          phase: "end",
          isDrawing: true,
          tool: "eraser",
        }),
      ).toBe("clear");
    });

    it("is unchanged when NOT drawing — it tracked already", () => {
      expect(
        markerAction({
          device: "mouse",
          phase: "move",
          isDrawing: false,
          tool: "eraser",
        }),
      ).toBe("track");
    });

    it("touch is unaffected — it already tracked for every tool", () => {
      expect(
        markerAction({
          device: "touch",
          phase: "move",
          isDrawing: true,
          tool: "eraser",
        }),
      ).toBe("track");
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
