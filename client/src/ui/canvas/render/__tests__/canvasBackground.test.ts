/**
 * Golden-hash tests for the checkerboard background and the pixel grid.
 *
 * Render mode covered: **background** (both `lightGridMode` states).
 *
 * The checkerboard is `putImageData` work, so it hashes exactly. The GRID is
 * stroked, and `canvasStub` does not rasterise strokes — so the grid is asserted
 * two ways instead: its geometry via `gridLinePath` (pure data), and its drawing
 * via `ctx.calls`.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  backgroundTheme,
  paintCheckerboard,
  gridLinePath,
  strokeGrid,
} from "@/ui/canvas/render/canvasBackground";
import type { BackgroundGeometry } from "@/ui/canvas/render/canvasBackground";
import {
  createBuffer,
  createStubContext,
  getPixel,
  hashBuffer,
} from "@/test/canvasStub";

const geom = (over: Partial<BackgroundGeometry> = {}): BackgroundGeometry => ({
  canvasWidth: 16,
  canvasHeight: 16,
  cellsX: 4,
  cellsY: 4,
  offsetX: 0,
  offsetY: 0,
  zoom: 4,
  ...over,
});

const paint = (g: BackgroundGeometry, light: boolean) => {
  const buf = createBuffer(g.canvasWidth, g.canvasHeight);
  paintCheckerboard(buf, g, backgroundTheme(light));
  return buf;
};

describe("paintCheckerboard — golden hashes", () => {
  it("GOLDEN: dark mode, 4×4 cells at zoom 4", () => {
    expect(hashBuffer(paint(geom(), false))).toBe("16x16:160a0385");
  });

  it("GOLDEN: light mode, 4×4 cells at zoom 4", () => {
    expect(hashBuffer(paint(geom(), true))).toBe("16x16:085c2685");
  });

  it("the two grid modes produce DIFFERENT pixels", () => {
    expect(hashBuffer(paint(geom(), false))).not.toBe(
      hashBuffer(paint(geom(), true)),
    );
  });

  it("dark mode uses #2a2a3a / #222230 on alternating cells", () => {
    const buf = paint(geom(), false);
    // Cell (0,0) is even parity -> color1.
    expect(getPixel(buf, 0, 0)).toEqual([42, 42, 58, 255]);
    // Cell (1,0) is odd parity -> color2.
    expect(getPixel(buf, 4, 0)).toEqual([34, 34, 48, 255]);
  });

  it("light mode uses #cccccc / #eeeeee on alternating cells", () => {
    const buf = paint(geom(), true);
    expect(getPixel(buf, 0, 0)).toEqual([204, 204, 204, 255]);
    expect(getPixel(buf, 4, 0)).toEqual([238, 238, 238, 255]);
  });

  it("every pixel is fully opaque — the background never lets canvas show through", () => {
    const buf = paint(geom(), false);
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBe(255);
    }
  });

  it("a world offset FLIPS the checker parity, keeping phase across a variant view", () => {
    const even = paint(geom({ offsetX: 0 }), false);
    const odd = paint(geom({ offsetX: 1 }), false);
    expect(getPixel(even, 0, 0)).toEqual([42, 42, 58, 255]);
    expect(getPixel(odd, 0, 0)).toEqual([34, 34, 48, 255]);
    expect(hashBuffer(even)).not.toBe(hashBuffer(odd));
  });

  it("the base colour shows where the cells do not reach", () => {
    // 4 cells × zoom 4 = 16px of checker in a 24px buffer; the rest is base.
    const buf = paint(geom({ canvasWidth: 24, canvasHeight: 24 }), false);
    expect(getPixel(buf, 20, 20)).toEqual([26, 26, 37, 255]);
  });

  it("clips cells that overhang the buffer instead of writing out of bounds", () => {
    // 4 cells × zoom 4 = 16px of content in an 8px buffer.
    const g = geom({ canvasWidth: 8, canvasHeight: 8 });
    expect(() => paint(g, false)).not.toThrow();
    expect(hashBuffer(paint(g, false))).toBe("8x8:99fe61a5");
  });
});

describe("gridLinePath — geometry (the grid cannot be hashed)", () => {
  it("emits cells+1 lines per axis, so both outer edges are drawn", () => {
    const lines = gridLinePath(geom());
    expect(lines).toHaveLength(5 + 5);
  });

  it("offsets every line by the canonical half pixel", () => {
    for (const l of gridLinePath(geom())) {
      const onHalf = l.x1 % 1 === 0.5 || l.y1 % 1 === 0.5;
      expect(onHalf).toBe(true);
    }
  });

  it("verticals span the full height and horizontals the full width", () => {
    const lines = gridLinePath(geom());
    const verticals = lines.filter((l) => l.x1 === l.x2);
    const horizontals = lines.filter((l) => l.y1 === l.y2);
    expect(verticals).toHaveLength(5);
    expect(horizontals).toHaveLength(5);
    expect(verticals.every((l) => l.y1 === 0 && l.y2 === 16)).toBe(true);
    expect(horizontals.every((l) => l.x1 === 0 && l.x2 === 16)).toBe(true);
  });
});

describe("strokeGrid — asserted via ctx.calls, NOT a hash", () => {
  it("Q3 UNIFICATION: dark mode strokes at rgba(255,255,255,0.05)", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    expect(ctx.strokeStyle).toBe("rgba(255, 255, 255, 0.05)");
  });

  it("Q3 UNIFICATION: light mode strokes at rgba(0,0,0,0.08)", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(true));
    expect(ctx.strokeStyle).toBe("rgba(0, 0, 0, 0.08)");
  });

  it("batches every line into ONE path and ONE stroke call", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "beginPath")).toHaveLength(1);
    expect(names.filter((n) => n === "stroke")).toHaveLength(1);
    expect(names.filter((n) => n === "moveTo")).toHaveLength(10);
    expect(names.filter((n) => n === "lineTo")).toHaveLength(10);
  });

  it("leaves the pixel buffer untouched — proof strokes are unhashable", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    expect(ctx.buffer.data.every((b) => b === 0)).toBe(true);
  });
});
