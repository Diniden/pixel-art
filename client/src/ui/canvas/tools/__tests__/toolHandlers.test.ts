/**
 * `toolHandlers` — the `brush` entry (plan 12, task 05; MASTER D7).
 *
 * The handler is a thin delegation: it must open a stroke, hand
 * `stampPixelBrushSegment`'s writes to `setPixels` unchanged (the stamp's
 * OWN colours, not `currentColor`), and advance the stroke cursor. What is
 * pinned here is the DELEGATION — which context members are read and called,
 * how many times, with what — over a fake `ToolContext` made of spies. The
 * arithmetic of the stamp itself is `pixelBrushStamp.test.ts`'s business.
 */
import { describe, expect, it, vi } from "vitest";
import type { LineFn, StampPoint } from "../brushStamp";
import type { PixelBrushStamp } from "../pixelBrushStamp";
import { getToolHandler, toolHandlers } from "../toolHandlers";
import type { ToolContext, ToolEvent } from "../toolHandlers";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

/** A 3×3 stamp, origin (1,1): a cell above, a cell left, and the origin. */
const STAMP: PixelBrushStamp = {
  width: 3,
  height: 3,
  originX: 1,
  originY: 1,
  cells: [
    { dx: 0, dy: -1, color: { r: 10, g: 20, b: 30, a: 255 } },
    { dx: -1, dy: 0, color: { r: 40, g: 50, b: 60, a: 255 } },
    { dx: 0, dy: 0, color: { r: 70, g: 80, b: 90, a: 128 } },
  ],
};

/** A deliberately NON-Bresenham line so a call through `ctx.line` is visible. */
const fakeLine: LineFn = (from, to) => [from, { x: 99, y: 99 }, to];

function fakeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    gridWidth: 16,
    gridHeight: 16,
    brushSize: 5,
    currentColor: { r: 1, g: 2, b: 3, a: 4 },
    pencilShape: () => [],
    eraserShapeFn: () => [],
    line: vi.fn(fakeLine),
    shapeMode: "outline",
    borderRadius: 0,
    lastStrokePixel: null,
    setLastStrokePixel: vi.fn(),
    beginStroke: vi.fn(),
    endDrawing: vi.fn(),
    setPixels: vi.fn(),
    setPreviewPixels: vi.fn(),
    floodFillAt: vi.fn(() => []),
    gaussianFillAt: vi.fn(() => []),
    squarePixelsAt: vi.fn(() => []),
    rectanglePreview: vi.fn(() => []),
    ellipsePreview: vi.fn(() => []),
    linePreview: vi.fn(() => []),
    ...overrides,
  };
}

const down = (coords: StampPoint): ToolEvent => ({
  coords,
  device: "mouse",
  drawStartPoint: null,
});
const move = (coords: StampPoint, from: StampPoint): ToolEvent => ({
  coords,
  device: "mouse",
  drawStartPoint: from,
});

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

/* ── The entry ─────────────────────────────────────────────────────────────── */

describe("toolHandlers.brush", () => {
  it("getToolHandler('brush') returns the table entry with onDown and onMove", () => {
    const h = getToolHandler("brush");
    expect(h).toBe(toolHandlers.brush);
    expect(typeof h?.onDown).toBe("function");
    expect(typeof h?.onMove).toBe("function");
    expect(h?.onUp).toBeUndefined();
  });

  describe("onDown", () => {
    it("⭐ opens a stroke once, writes the translated stamp with ITS colours, and sets the cursor", () => {
      const ctx = fakeContext({ pixelBrushStamp: STAMP });
      toolHandlers.brush.onDown(down({ x: 5, y: 7 }), ctx);

      expect(ctx.beginStroke).toHaveBeenCalledTimes(1);
      expect(ctx.setPixels).toHaveBeenCalledTimes(1);
      const writes = vi.mocked(ctx.setPixels).mock.calls[0]![0];
      // Each write is the stamp cell translated to the press, carrying the
      // cell's own settled colour — NOT `ctx.currentColor`.
      expect(writes).toEqual([
        { x: 5, y: 6, color: { r: 10, g: 20, b: 30, a: 255 } },
        { x: 4, y: 7, color: { r: 40, g: 50, b: 60, a: 255 } },
        { x: 5, y: 7, color: { r: 70, g: 80, b: 90, a: 128 } },
      ]);
      expect(ctx.setLastStrokePixel).toHaveBeenCalledTimes(1);
      expect(ctx.setLastStrokePixel).toHaveBeenCalledWith({ x: 5, y: 7 });
      // A press is a single stamp — `line` is never consulted.
      expect(ctx.line).not.toHaveBeenCalled();
    });

    it("clips at the grid edge and skips setPixels when nothing is in bounds", () => {
      const ctx = fakeContext({ pixelBrushStamp: STAMP });
      // At (0,0) only the origin cell survives.
      toolHandlers.brush.onDown(down({ x: 0, y: 0 }), ctx);
      expect(vi.mocked(ctx.setPixels).mock.calls[0]![0]).toEqual([
        { x: 0, y: 0, color: { r: 70, g: 80, b: 90, a: 128 } },
      ]);

      const off = fakeContext({ pixelBrushStamp: STAMP });
      toolHandlers.brush.onDown(down({ x: 40, y: 40 }), off);
      expect(off.beginStroke).toHaveBeenCalledTimes(1);
      expect(off.setPixels).not.toHaveBeenCalled();
      expect(off.setLastStrokePixel).toHaveBeenCalledWith({ x: 40, y: 40 });
    });

    it("⭐ with no stamp (null) the stroke still opens and nothing is written", () => {
      // MASTER D7: an empty undo entry, like a pencil that paints nothing.
      const ctx = fakeContext({ pixelBrushStamp: null });
      toolHandlers.brush.onDown(down({ x: 5, y: 5 }), ctx);
      expect(ctx.beginStroke).toHaveBeenCalledTimes(1);
      expect(ctx.setPixels).not.toHaveBeenCalled();
      expect(ctx.setLastStrokePixel).toHaveBeenCalledWith({ x: 5, y: 5 });
    });

    it("with the field ABSENT (the brush studio's context) behaves as null", () => {
      // `pixelBrushStamp` is optional so `buildBrushToolContext` compiles
      // untouched; the handler must treat absence exactly as `null`.
      const ctx = fakeContext();
      expect("pixelBrushStamp" in ctx).toBe(false);
      toolHandlers.brush.onDown(down({ x: 5, y: 5 }), ctx);
      expect(ctx.beginStroke).toHaveBeenCalledTimes(1);
      expect(ctx.setPixels).not.toHaveBeenCalled();
    });
  });

  describe("onMove", () => {
    it("⭐ rasterises from lastStrokePixel through the INJECTED line and stamps every step", () => {
      const ctx = fakeContext({
        pixelBrushStamp: STAMP,
        lastStrokePixel: { x: 2, y: 2 },
      });
      toolHandlers.brush.onMove(move({ x: 6, y: 2 }, { x: 2, y: 2 }), ctx);

      // The segment came from `ctx.line(prev, next)`, not a built-in.
      expect(ctx.line).toHaveBeenCalledTimes(1);
      expect(ctx.line).toHaveBeenCalledWith({ x: 2, y: 2 }, { x: 6, y: 2 });
      expect(ctx.beginStroke).not.toHaveBeenCalled();

      expect(ctx.setPixels).toHaveBeenCalledTimes(1);
      const writes = vi.mocked(ctx.setPixels).mock.calls[0]![0];
      // The fake line visits (2,2), (99,99) and (6,2); (99,99) is off-grid so
      // only the two real steps stamp — three cells each, none overlapping.
      expect(key(writes)).toEqual(
        key([
          { x: 2, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 6, y: 1 },
          { x: 5, y: 2 },
          { x: 6, y: 2 },
        ]),
      );
      expect(ctx.setLastStrokePixel).toHaveBeenCalledWith({ x: 6, y: 2 });
    });

    it("with lastStrokePixel null stamps only the new point (no line call)", () => {
      const ctx = fakeContext({
        pixelBrushStamp: STAMP,
        lastStrokePixel: null,
      });
      toolHandlers.brush.onMove(move({ x: 8, y: 8 }, { x: 8, y: 8 }), ctx);
      expect(ctx.line).not.toHaveBeenCalled();
      expect(vi.mocked(ctx.setPixels).mock.calls[0]![0]).toHaveLength(3);
    });

    it("with no stamp writes nothing but still advances the cursor", () => {
      const ctx = fakeContext({
        pixelBrushStamp: null,
        lastStrokePixel: { x: 2, y: 2 },
      });
      toolHandlers.brush.onMove(move({ x: 6, y: 2 }, { x: 2, y: 2 }), ctx);
      expect(ctx.setPixels).not.toHaveBeenCalled();
      expect(ctx.line).not.toHaveBeenCalled();
      expect(ctx.setLastStrokePixel).toHaveBeenCalledWith({ x: 6, y: 2 });
    });
  });

  describe("regression — the `pixel` entry is unchanged", () => {
    it("the pencil still paints `currentColor` through its shape, ignoring any stamp", () => {
      const ctx = fakeContext({
        pixelBrushStamp: STAMP,
        pencilShape: (center) => [{ x: center.x, y: center.y }],
        brushSize: 1,
      });
      toolHandlers.pixel.onDown(down({ x: 3, y: 3 }), ctx);
      expect(ctx.beginStroke).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ctx.setPixels).mock.calls[0]![0]).toEqual([
        { x: 3, y: 3, color: { r: 1, g: 2, b: 3, a: 4 } },
      ]);
      expect(ctx.setLastStrokePixel).toHaveBeenCalledWith({ x: 3, y: 3 });
    });
  });
});
