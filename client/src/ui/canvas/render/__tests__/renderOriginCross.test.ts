/**
 * Tests for the origin cross.
 *
 * Render mode covered: **origin tool active**.
 *
 * ⚠️ NO GOLDEN HASH IS POSSIBLE HERE. The cross is drawn entirely with
 * `moveTo`/`lineTo`/`arc`/`stroke`, none of which `canvasStub` rasterises — the
 * buffer stays blank and `renderToHash` would throw. So the GEOMETRY is tested
 * as pure data and the DRAWING via `ctx.calls`. The last test in this file
 * proves the buffer really does stay blank, so nobody later mistakes the absence
 * of a hash test for an oversight.
 */
import { describe, expect, it } from "vitest";
import {
  originCrossGeometry,
  drawOriginCross,
  ORIGIN_CROSS_SIZE,
  ORIGIN_CROSS_RADIUS,
} from "@/ui/canvas/render/renderOriginCross";
import { createStubContext } from "@/test/canvasStub";

const RED = { r: 255, g: 50, b: 50, a: 255 };

describe("originCrossGeometry", () => {
  it("centres the cross on origin × zoom", () => {
    const g = originCrossGeometry({ x: 2, y: 3 }, 10);
    expect(g.centerX).toBe(20);
    expect(g.centerY).toBe(30);
  });

  it("KEEPS a half-pixel origin on the half pixel — it does not round", () => {
    // The origin tool snaps to half CELLS; at an odd zoom that lands on a half
    // PIXEL, and rounding it would shift the marker off the point it marks.
    const g = originCrossGeometry({ x: 2.5, y: 3.5 }, 5);
    expect(g.centerX).toBe(12.5);
    expect(g.centerY).toBe(17.5);
  });

  it("a half-cell origin at an EVEN zoom lands on a whole pixel", () => {
    const g = originCrossGeometry({ x: 2.5, y: 2.5 }, 10);
    expect(g.centerX).toBe(25);
    expect(g.centerY).toBe(25);
  });

  it("extends each arm by a FIXED screen size, independent of zoom", () => {
    const near = originCrossGeometry({ x: 1, y: 1 }, 4);
    const far = originCrossGeometry({ x: 1, y: 1 }, 40);
    expect(near.hx2 - near.hx1).toBe(2 * ORIGIN_CROSS_SIZE);
    expect(far.hx2 - far.hx1).toBe(2 * ORIGIN_CROSS_SIZE);
    expect(near.radius).toBe(far.radius);
  });

  it("spans the arms symmetrically about the centre", () => {
    const g = originCrossGeometry({ x: 2, y: 2 }, 10);
    expect(g.centerX - g.hx1).toBe(ORIGIN_CROSS_SIZE);
    expect(g.hx2 - g.centerX).toBe(ORIGIN_CROSS_SIZE);
    expect(g.centerY - g.vy1).toBe(ORIGIN_CROSS_SIZE);
    expect(g.vy2 - g.centerY).toBe(ORIGIN_CROSS_SIZE);
  });

  it("handles a negative origin without clamping it", () => {
    const g = originCrossGeometry({ x: -1, y: -1 }, 10);
    expect(g.centerX).toBe(-10);
    expect(g.hx1).toBe(-22);
  });

  it("uses the pinned 12px arm and 3px dot", () => {
    expect(ORIGIN_CROSS_SIZE).toBe(12);
    expect(ORIGIN_CROSS_RADIUS).toBe(3);
  });
});

describe("drawOriginCross — asserted via ctx.calls, NOT a hash", () => {
  const draw = (origin = { x: 2, y: 2 }, zoom = 10) => {
    const ctx = createStubContext(64, 64);
    drawOriginCross(ctx as never, origin, zoom, RED);
    return ctx;
  };

  it("draws three shapes: horizontal arm, vertical arm, centre dot", () => {
    const ctx = draw();
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "beginPath")).toHaveLength(3);
    expect(names.filter((n) => n === "stroke")).toHaveLength(3);
    expect(names.filter((n) => n === "arc")).toHaveLength(1);
  });

  it("places the arms at the computed geometry", () => {
    const ctx = draw();
    const g = originCrossGeometry({ x: 2, y: 2 }, 10);
    const moves = ctx.calls.filter((c) => c.method === "moveTo");
    const lines = ctx.calls.filter((c) => c.method === "lineTo");
    expect(moves[0].args).toEqual([g.hx1, g.centerY]);
    expect(lines[0].args).toEqual([g.hx2, g.centerY]);
    expect(moves[1].args).toEqual([g.centerX, g.vy1]);
    expect(lines[1].args).toEqual([g.centerX, g.vy2]);
  });

  it("draws the centre dot as a full circle at the origin", () => {
    const ctx = draw();
    const arc = ctx.calls.find((c) => c.method === "arc");
    expect(arc?.args.slice(0, 4)).toEqual([20, 20, 3, 0]);
  });

  it("converts the 0-255 origin colour to a css rgba() string", () => {
    // The style must be sampled DURING the draw. `drawOriginCross` wraps itself
    // in save/restore, so afterwards the live strokeStyle is back to the stub's
    // default, and canvasStub does not record style assignments as calls. So we
    // capture it at the first stroke() — the moment it is actually in effect.
    const ctx = createStubContext(64, 64);
    let styleAtStroke: unknown;
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      styleAtStroke ??= ctx.strokeStyle;
      realStroke();
    };
    drawOriginCross(ctx as never, { x: 2, y: 2 }, 10, RED);
    expect(styleAtStroke).toBe("rgba(255, 50, 50, 1)");
  });

  it("carries a non-opaque origin alpha into the rgba string", () => {
    const ctx = createStubContext(64, 64);
    let styleAtStroke: unknown;
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      styleAtStroke ??= ctx.strokeStyle;
      realStroke();
    };
    drawOriginCross(ctx as never, { x: 2, y: 2 }, 10, { ...RED, a: 128 });
    expect(styleAtStroke).toBe(`rgba(255, 50, 50, ${128 / 255})`);
  });

  it("CLEARS the dash — the selection box drawn before it leaves one set", () => {
    const ctx = createStubContext(64, 64);
    ctx.setLineDash([4, 4]);
    drawOriginCross(ctx as never, { x: 2, y: 2 }, 10, RED);
    const dashes = ctx.calls
      .filter((c) => c.method === "setLineDash")
      .map((c) => c.args[0]);
    expect(dashes[dashes.length - 1]).toEqual([]);
  });

  it("balances save/restore", () => {
    const ctx = draw();
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "save")).toHaveLength(1);
    expect(names.filter((n) => n === "restore")).toHaveLength(1);
  });

  it("PROOF the buffer stays blank — this is why there is no golden hash", () => {
    const ctx = draw();
    expect(ctx.buffer.data.every((b) => b === 0)).toBe(true);
  });
});
