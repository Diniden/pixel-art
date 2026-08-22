/**
 * Golden-hash tests for the lighting studio's brush hover overlay.
 *
 * Render mode covered: **translucent brush cells** (hashed) plus the **outline
 * geometry** (asserted as data, then through `ctx.calls`).
 *
 * The split is forced by the stub, not chosen for taste: `canvasStub` rasterises
 * `fillRect` exactly but only RECORDS `strokeRect`. A single function drawing
 * both would hash the fill and silently lose the outline — the failure mode
 * `hashContext`'s blank-buffer throw exists to expose.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  paintBrushCells,
  brushCellOutlines,
  strokeBrushOutlines,
  BRUSH_OVERLAY_STYLE,
} from "@/ui/canvas/render/renderBrushOverlay";
import {
  createBuffer,
  createStubContext,
  getPixel,
  hashBuffer,
  isBlank,
} from "@/test/canvasStub";

/** A 3-cell brush footprint — enough to see placement AND spacing. */
const CELLS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
];

const paint = (zoom: number, cells = CELLS) => {
  const buf = createBuffer(4 * zoom, 4 * zoom);
  paintBrushCells(buf, cells, zoom);
  return buf;
};

describe("paintBrushCells — golden hashes", () => {
  it("GOLDEN: three cells at zoom 4", () => {
    expect(hashBuffer(paint(4))).toBe("16x16:7a94f785");
  });

  it("GOLDEN: three cells at zoom 1", () => {
    expect(hashBuffer(paint(1))).toBe("4x4:5787882d");
  });

  it("GOLDEN: an empty footprint leaves the buffer untouched", () => {
    expect(hashBuffer(paint(4, []))).toBe("16x16:bbfc2485");
  });
});

describe("paintBrushCells — the properties behind the hashes", () => {
  it("paints the cyan at 22% alpha over transparent black", () => {
    const buf = paint(4);
    // `fillRect` with `rgba(0,217,255,0.22)` on a cleared canvas: the colour
    // survives un-darkened and the alpha becomes 0.22 → 56.
    expect(getPixel(buf, 0, 0)).toEqual([0, 217, 255, 56]);
  });

  it("fills the whole zoom² block of each cell and nothing else", () => {
    const buf = paint(4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getPixel(buf, x, y)[3]).toBe(56);
      }
    }
    // Cell (0,1) is NOT in the footprint.
    expect(getPixel(buf, 0, 4)).toEqual([0, 0, 0, 0]);
  });

  it("leaves an empty footprint entirely blank", () => {
    expect(isBlank(paint(4, []))).toBe(true);
  });

  it("clips cells that hang off the buffer rather than throwing", () => {
    const buf = createBuffer(8, 8);
    expect(() =>
      paintBrushCells(
        buf,
        [
          { x: 3, y: 3 },
          { x: -1, y: -1 },
        ],
        4,
      ),
    ).not.toThrow();
    // (3,3) at zoom 4 starts at (12,12), fully outside an 8×8 buffer.
    expect(isBlank(buf)).toBe(true);
  });

  it("returns the same buffer it was given", () => {
    const buf = createBuffer(16, 16);
    expect(paintBrushCells(buf, CELLS, 4)).toBe(buf);
  });
});

describe("brushCellOutlines — the half-pixel inset", () => {
  it("insets by 0.5 and shrinks by 1, so a 1px stroke lands on centres", () => {
    expect(brushCellOutlines([{ x: 0, y: 0 }], 4)).toEqual([
      { x: 0.5, y: 0.5, width: 3, height: 3 },
    ]);
    expect(brushCellOutlines([{ x: 2, y: 3 }], 10)).toEqual([
      { x: 20.5, y: 30.5, width: 9, height: 9 },
    ]);
  });

  it("returns one rectangle per cell, in order", () => {
    expect(brushCellOutlines(CELLS, 4)).toHaveLength(3);
  });
});

describe("strokeBrushOutlines — asserted via ctx.calls, not pixels", () => {
  it("strokes one rect per cell with the settled style", () => {
    const ctx = createStubContext(16, 16);
    strokeBrushOutlines(ctx as never, CELLS, 4);

    const strokes = ctx.calls.filter((c) => c.method === "strokeRect");
    expect(strokes).toHaveLength(3);
    expect(strokes[0]!.args).toEqual([0.5, 0.5, 3, 3]);
    expect(ctx.strokeStyle).toBe(BRUSH_OVERLAY_STYLE.stroke);
    expect(ctx.lineWidth).toBe(BRUSH_OVERLAY_STYLE.lineWidth);
  });

  it("pins the two colours the overlay has always used", () => {
    expect(BRUSH_OVERLAY_STYLE.stroke).toBe("rgba(0, 217, 255, 0.55)");
    expect(BRUSH_OVERLAY_STYLE.fill).toEqual({ r: 0, g: 217, b: 255, a: 0.22 });
  });
});
