/**
 * Tests for the selection chrome.
 *
 * Render modes covered: **selection active** (mask fill + marching ants) and
 * **lasso in progress**.
 *
 * Split by what the test rasteriser can see:
 * - mask fill and drag preview are `fillRect` work → GOLDEN HASHES.
 * - the lasso outline and the marching ants are dashed STROKES → the stub
 *   rasterises nothing, so they are asserted via pure geometry + `ctx.calls`.
 *   `strokeRect` is nominally rasterised, but as a solid outline with the dash
 *   ignored, which would pin a lie — so the ants use `ctx.calls` too.
 *
 * Every hash was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  paintMaskFill,
  paintDragPreview,
  lassoPath,
  drawLasso,
  marchingAntsRects,
  drawMarchingAnts,
  MASK_FILL_LIMIT,
  SELECTION_COLOR,
} from "@/ui/canvas/render/renderSelectionOverlay";
import {
  createBuffer,
  createStubContext,
  getPixel,
  hashBuffer,
} from "@/test/canvasStub";
import { RED } from "./fixtures";

describe("paintMaskFill — golden hash (selection active)", () => {
  const mask = new Set([0, 1, 4, 5]); // a 2×2 block in a 4-wide mask

  const fill = (over = {}) => {
    const buf = createBuffer(16, 16);
    const drew = paintMaskFill(buf, {
      mask,
      maskWidth: 4,
      zoom: 4,
      offsetX: 0,
      offsetY: 0,
      ...over,
    });
    return { buf, drew };
  };

  it("GOLDEN: a 2×2 selection block tinted cyan", () => {
    expect(hashBuffer(fill().buf)).toBe("16x16:87c24f85");
  });

  it("tints the selected cells and leaves the rest untouched", () => {
    const { buf } = fill();
    expect(getPixel(buf, 0, 0)[3]).toBeGreaterThan(0);
    expect(getPixel(buf, 12, 12)).toEqual([0, 0, 0, 0]);
  });

  it("maps flat mask indices back through maskWidth", () => {
    const { buf } = fill({ mask: new Set([6]), maskWidth: 4 });
    // index 6 -> (x=2, y=1) -> px (8, 4)
    expect(getPixel(buf, 8, 4)[3]).toBeGreaterThan(0);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("shifts every cell by the offset (variant offset + drag delta)", () => {
    const { buf } = fill({ mask: new Set([0]), offsetX: 1, offsetY: 1 });
    expect(getPixel(buf, 4, 4)[3]).toBeGreaterThan(0);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("PINNED GUARD: a mask over 20,000 cells draws NOTHING at all", () => {
    const huge = new Set<number>();
    for (let i = 0; i <= MASK_FILL_LIMIT; i++) huge.add(i);
    const { buf, drew } = fill({ mask: huge });
    expect(drew).toBe(false);
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("draws at exactly the limit — the guard is > not >=", () => {
    const atLimit = new Set<number>();
    for (let i = 0; i < MASK_FILL_LIMIT; i++) atLimit.add(i);
    const { drew } = fill({ mask: atLimit, maskWidth: 200 });
    expect(drew).toBe(true);
  });
});

describe("paintDragPreview — golden hash (move-pixels drag)", () => {
  const mask = new Set([0, 1]);
  const drag = (over = {}) => {
    const buf = createBuffer(16, 16);
    const drew = paintDragPreview(buf, {
      mask,
      maskWidth: 4,
      zoom: 4,
      offsetX: 0,
      offsetY: 0,
      dragDx: 1,
      dragDy: 1,
      gridWidth: 4,
      gridHeight: 4,
      readPixel: () => RED,
      ...over,
    });
    return { buf, drew };
  };

  it("GOLDEN: two cells shaded at source and redrawn one cell down-right", () => {
    expect(hashBuffer(drag().buf)).toBe("16x16:c3532745");
  });

  it("shades the ORIGINAL area and draws the moved pixels at the delta", () => {
    const { buf } = drag();
    // Source cell (0,0) is shaded dark, not red.
    const [r] = getPixel(buf, 0, 0);
    expect(r).toBeLessThan(255);
    // Moved copy lands at cell (1,1) -> px (4,4), full red.
    expect(getPixel(buf, 4, 4)).toEqual([255, 0, 0, 255]);
  });

  it("drops moved pixels that leave the editable grid", () => {
    const { buf } = drag({ dragDx: 10, dragDy: 10 });
    // Only the shade remains; nothing is drawn red anywhere.
    for (let i = 0; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBeLessThan(255);
    }
  });

  it("skips source cells the readPixel callback reports as empty", () => {
    const { buf } = drag({ readPixel: () => null });
    expect(getPixel(buf, 4, 4)).toEqual([0, 0, 0, 0]);
  });

  it("PINNED GUARD: the same 20,000-cell limit applies", () => {
    const huge = new Set<number>();
    for (let i = 0; i <= MASK_FILL_LIMIT; i++) huge.add(i);
    const { buf, drew } = drag({ mask: huge });
    expect(drew).toBe(false);
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });
});

describe("lassoPath — geometry (the lasso CANNOT be hashed)", () => {
  it("puts each vertex at its cell CENTRE, not its corner", () => {
    expect(lassoPath([{ x: 0, y: 0 }], 4, 0, 0)).toEqual([{ x: 2, y: 2 }]);
  });

  it("applies the offset before scaling by zoom", () => {
    expect(lassoPath([{ x: 0, y: 0 }], 4, 1, 2)).toEqual([{ x: 6, y: 10 }]);
  });
});

describe("drawLasso — asserted via ctx.calls", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 0 },
  ];

  it("strokes a 3-3 dashed cyan path through every point", () => {
    const ctx = createStubContext(16, 16);
    drawLasso(ctx as never, pts, 4, 0, 0);
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "moveTo")).toHaveLength(1);
    expect(names.filter((n) => n === "lineTo")).toHaveLength(2);
    expect(names.filter((n) => n === "stroke")).toHaveLength(1);
    const dash = ctx.calls.find((c) => c.method === "setLineDash");
    expect(dash?.args[0]).toEqual([3, 3]);
  });

  it("draws NOTHING for a single point — a lasso needs a segment", () => {
    const ctx = createStubContext(16, 16);
    drawLasso(ctx as never, [{ x: 0, y: 0 }], 4, 0, 0);
    expect(ctx.calls.filter((c) => c.method === "stroke")).toHaveLength(0);
  });

  it("balances save/restore so it cannot leak a dash to later chrome", () => {
    const ctx = createStubContext(16, 16);
    drawLasso(ctx as never, pts, 4, 0, 0);
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "save")).toHaveLength(1);
    expect(names.filter((n) => n === "restore")).toHaveLength(1);
  });

  it("leaves the pixel buffer blank — why this is not a hash test", () => {
    const ctx = createStubContext(16, 16);
    drawLasso(ctx as never, pts, 4, 0, 0);
    expect(ctx.buffer.data.every((b) => b === 0)).toBe(true);
  });
});

describe("marchingAntsRects — geometry", () => {
  const box = { x: 0, y: 0, width: 2, height: 2 };

  it("insets the inner rect by exactly 1px on every side", () => {
    const { outer, inner } = marchingAntsRects(box, 4, 0, 0);
    expect(outer).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    expect(inner).toEqual({ x: 1, y: 1, width: 6, height: 6 });
  });

  it("adds the drag delta on top of the offset", () => {
    const { outer } = marchingAntsRects(box, 4, 1, 1, 1, 0);
    expect(outer.x).toBe(8);
    expect(outer.y).toBe(4);
  });
});

describe("drawMarchingAnts — asserted via ctx.calls", () => {
  const box = { x: 0, y: 0, width: 2, height: 2 };

  it("strokes TWO rects — cyan outer, white inner", () => {
    const ctx = createStubContext(16, 16);
    drawMarchingAnts(ctx as never, box, 4, 0, 0);
    const rects = ctx.calls.filter((c) => c.method === "strokeRect");
    expect(rects).toHaveLength(2);
    expect(rects[0].args).toEqual([0, 0, 8, 8]);
    expect(rects[1].args).toEqual([1, 1, 6, 6]);
  });

  it("offsets the inner dash by half a period — that is the ants' motion", () => {
    const ctx = createStubContext(16, 16);
    drawMarchingAnts(ctx as never, box, 4, 0, 0);
    const dashes = ctx.calls
      .filter((c) => c.method === "setLineDash")
      .map((c) => c.args[0]);
    expect(dashes[0]).toEqual([4, 4]);
    expect(dashes[1]).toEqual([]);
    expect(dashes[2]).toEqual([4, 4]);
  });

  it("RESETS the dash and dash offset so later chrome is not dashed", () => {
    const ctx = createStubContext(16, 16);
    drawMarchingAnts(ctx as never, box, 4, 0, 0);
    expect(ctx.getLineDash()).toEqual([]);
    expect(ctx.lineDashOffset).toBe(0);
  });

  it("uses the shared selection cyan", () => {
    expect(SELECTION_COLOR).toBe("#00d9ff");
  });
});
