/**
 * `renderHoverMarker` — the hover marker's placement and perimeter.
 *
 * The fill is `paintBrushCells`, already covered by `renderBrushOverlay`'s
 * tests; what is new here is the STYLE (fainter than the lighting studio's
 * overlay, deliberately) and the PERIMETER stroke, which replaces the
 * per-cell boxes `strokeBrushOutlines` draws.
 */
import { describe, expect, it } from "vitest";
import { BRUSH_OVERLAY_STYLE } from "../renderBrushOverlay";
import {
  HOVER_MARKER_STYLE,
  markerPerimeter,
  paintHoverCells,
} from "../renderHoverMarker";

const buffer = (w: number, h: number) => ({
  data: new Uint8ClampedArray(w * h * 4),
  width: w,
  height: h,
});

const at = (b: ReturnType<typeof buffer>, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]];
};

describe("HOVER_MARKER_STYLE", () => {
  it("⭐ is FAINTER than the lighting studio's brush overlay", () => {
    // Not a cosmetic preference. The lighting overlay marks cells being
    // painted RIGHT NOW on a normal-map surface; this marks cells an edit
    // WOULD hit, drawn over the user's actual artwork. At the overlay's
    // weight it reads as a committed stroke.
    expect(HOVER_MARKER_STYLE.fill.a).toBeLessThan(BRUSH_OVERLAY_STYLE.fill.a);
  });
});

describe("paintHoverCells", () => {
  it("paints the cell's full zoom x zoom block", () => {
    const b = buffer(8, 8);
    paintHoverCells(b, [{ x: 1, y: 1 }], 4);

    // Every pixel of the block is touched...
    expect(at(b, 4, 4)[3]).toBeGreaterThan(0);
    expect(at(b, 7, 7)[3]).toBeGreaterThan(0);
    // ...and nothing outside it is.
    expect(at(b, 3, 3)[3]).toBe(0);
  });

  it("paints at the marker's faint alpha, not the overlay's", () => {
    const b = buffer(4, 4);
    paintHoverCells(b, [{ x: 0, y: 0 }], 1);
    expect(at(b, 0, 0)[3]).toBe(Math.round(HOVER_MARKER_STYLE.fill.a * 255));
  });
});

describe("markerPerimeter", () => {
  it("⭐ strokes only the OUTER edge of a multi-cell footprint", () => {
    // A 3x3 block: 4 edges per cell = 36 if drawn per-cell, but only the 12
    // that face outside belong to the perimeter. At brush size 12 the
    // per-cell version is 100+ nested boxes, which reads as noise rather than
    // as "where my pencil is".
    const cells = [];
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) cells.push({ x, y });

    expect(markerPerimeter(cells, 10)).toHaveLength(12);
  });

  it("gives a single cell its four edges", () => {
    expect(markerPerimeter([{ x: 0, y: 0 }], 10)).toHaveLength(4);
  });

  it("uses the canonical half-pixel inset so a 1px stroke lands on centres", () => {
    const [top] = markerPerimeter([{ x: 0, y: 0 }], 10);
    // Same `+ 0.5` / `zoom - 1` convention as `brushCellOutlines`.
    expect(top).toEqual({ x1: 0.5, y1: 0.5, x2: 9.5, y2: 0.5 });
  });

  it("keeps the interior edge of two DISCONNECTED cells", () => {
    // Nothing is merged that does not touch: a gap must still read as a gap.
    expect(markerPerimeter([{ x: 0, y: 0 }, { x: 5, y: 0 }], 10)).toHaveLength(
      8,
    );
  });

  it("returns nothing for an empty footprint", () => {
    expect(markerPerimeter([], 10)).toEqual([]);
  });
});
