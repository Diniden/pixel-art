/**
 * Tests for the reflection guides.
 *
 * Render mode covered: **reflection tool lines present** (committed + draft).
 *
 * ⚠️ NO GOLDEN HASH IS POSSIBLE HERE, for the same reason as
 * `renderOriginCross.test.ts`: the guides are drawn entirely with
 * `moveTo`/`lineTo`/`stroke`, none of which `canvasStub` rasterises. The buffer
 * stays blank and `renderToHash` would throw. So the GEOMETRY is tested as pure
 * data and the DRAWING via `ctx.calls`. The last test in this file proves the
 * buffer really does stay blank, so nobody later mistakes the absence of a hash
 * test for an oversight.
 */
import { describe, expect, it } from "vitest";
import {
  reflectionSegments,
  drawReflectionLines,
  REFLECTION_DASH,
  REFLECTION_DASH_PERIOD,
} from "@/ui/canvas/render/renderReflectionLines";
import { createStubContext } from "@/test/canvasStub";
import { ACCENT_VARIANT, WHITE } from "@/ui/theme/canvasTokens";

/** A vertical guide between columns 4 and 5, spanning rows 0..8. */
const VERTICAL = { x1: 4, y1: 0, x2: 4, y2: 8 };
/** A horizontal guide between rows 2 and 3. */
const HORIZONTAL = { x1: 0, y1: 3, x2: 10, y2: 3 };

describe("reflectionSegments", () => {
  it("maps grid coordinates to canvas pixels by (g - viewOrigin) * zoom", () => {
    const [seg] = reflectionSegments([VERTICAL], null, 10, 0, 0);
    expect(seg).toEqual({ x1: 40, y1: 0, x2: 40, y2: 80, draft: false });
  });

  it("⭐ subtracts the view origin — the variant-edit case", () => {
    // While editing a variant the overlay is drawn relative to the variant's
    // sub-rect, exactly as `renderOverlay` does with viewMinX/viewMinY. Getting
    // this wrong puts every guide at the wrong place on a variant layer.
    const [seg] = reflectionSegments([VERTICAL], null, 10, 2, 1);
    expect(seg).toEqual({ x1: 20, y1: -10, x2: 20, y2: 70, draft: false });
  });

  it("scales with zoom", () => {
    const [near] = reflectionSegments([HORIZONTAL], null, 4, 0, 0);
    const [far] = reflectionSegments([HORIZONTAL], null, 16, 0, 0);
    expect(near.x2).toBe(40);
    expect(far.x2).toBe(160);
  });

  it("KEEPS a half-integer endpoint on the half pixel — it does not round", () => {
    // Presets on an odd grid put the mirror axis at a half-integer; rounding it
    // would shift the guide off the axis the effect actually reflects across.
    const [seg] = reflectionSegments(
      [{ x1: 4.5, y1: 0, x2: 4.5, y2: 9 }],
      null,
      5,
      0,
      0,
    );
    expect(seg.x1).toBe(22.5);
    expect(seg.x2).toBe(22.5);
  });

  it("maps every committed line, in order", () => {
    const segs = reflectionSegments([VERTICAL, HORIZONTAL], null, 10, 0, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0].x1).toBe(40);
    expect(segs[1].y1).toBe(30);
    expect(segs.every((s) => s.draft === false)).toBe(true);
  });

  it("⭐ flags the draft and appends it LAST so it strokes on top", () => {
    const segs = reflectionSegments([VERTICAL], HORIZONTAL, 10, 0, 0);
    expect(segs).toHaveLength(2);
    expect(segs[0].draft).toBe(false);
    expect(segs[1].draft).toBe(true);
  });

  it("returns nothing at all when there is nothing to draw", () => {
    expect(reflectionSegments([], null, 10, 0, 0)).toEqual([]);
  });

  it("⭐ skips degenerate (zero-length) lines", () => {
    const segs = reflectionSegments(
      [{ x1: 3, y1: 3, x2: 3, y2: 3 }, VERTICAL],
      null,
      10,
      0,
      0,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].x1).toBe(40);
  });

  it("skips a degenerate DRAFT — a press with no drag yet", () => {
    const segs = reflectionSegments([], { x1: 2, y1: 2, x2: 2, y2: 2 }, 10, 0, 0);
    expect(segs).toEqual([]);
  });

  it("judges degeneracy in GRID space, not after the zoom multiply", () => {
    // At zoom 0 every mapped segment collapses to a point, but the LINES are
    // still real; dropping them here would make the guides vanish rather than
    // being drawn (invisibly) at a degenerate zoom.
    const segs = reflectionSegments([VERTICAL], null, 0, 0, 0);
    expect(segs).toHaveLength(1);
  });

  it("pins the 4px dash and its 8px period", () => {
    expect(REFLECTION_DASH).toBe(4);
    expect(REFLECTION_DASH_PERIOD).toBe(8);
  });
});

describe("drawReflectionLines — asserted via ctx.calls, NOT a hash", () => {
  const draw = (
    lines = [VERTICAL],
    draft: typeof VERTICAL | null = null,
    phase = 0,
  ) => {
    const ctx = createStubContext(128, 128);
    const segs = reflectionSegments(lines, draft, 10, 0, 0);
    drawReflectionLines(ctx as never, segs, phase);
    return ctx;
  };

  it("strokes each segment TWICE — the purple pass and the white pass", () => {
    const ctx = draw();
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "stroke")).toHaveLength(2);
    expect(names.filter((n) => n === "beginPath")).toHaveLength(2);
  });

  it("draws the segment the user drew — not extended to the canvas bounds", () => {
    // Locked decision D8: the reflection EFFECT is infinite, the guide is not.
    const ctx = draw();
    const moves = ctx.calls.filter((c) => c.method === "moveTo");
    const lines = ctx.calls.filter((c) => c.method === "lineTo");
    expect(moves[0].args).toEqual([40, 0]);
    expect(lines[0].args).toEqual([40, 80]);
    // Both passes trace the identical path.
    expect(moves[1].args).toEqual([40, 0]);
    expect(lines[1].args).toEqual([40, 80]);
  });

  it("uses a [4,4] dash on both passes", () => {
    const ctx = draw();
    const dashes = ctx.calls
      .filter((c) => c.method === "setLineDash")
      .map((c) => c.args[0]);
    expect(dashes[0]).toEqual([4, 4]);
    expect(dashes[1]).toEqual([4, 4]);
  });

  it("⭐ drives lineDashOffset from the phase, the two passes half a period apart", () => {
    // This is what makes the dashes crawl. Sampled at stroke() because the
    // painter resets the offset when it finishes.
    const ctx = createStubContext(128, 128);
    const offsets: number[] = [];
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      offsets.push(ctx.lineDashOffset);
      realStroke();
    };
    drawReflectionLines(
      ctx as never,
      reflectionSegments([VERTICAL], null, 10, 0, 0),
      3,
    );
    expect(offsets).toEqual([-3, -3 + REFLECTION_DASH]);
  });

  it("⭐ WRAPS the phase modulo the dash period", () => {
    // The ticker already wraps, but an unbounded caller counter must not drift
    // the guides into float-precision territory over a long session.
    const sample = (phase: number) => {
      const ctx = createStubContext(128, 128);
      const offsets: number[] = [];
      const realStroke = ctx.stroke.bind(ctx);
      ctx.stroke = () => {
        offsets.push(ctx.lineDashOffset);
        realStroke();
      };
      drawReflectionLines(
        ctx as never,
        reflectionSegments([VERTICAL], null, 10, 0, 0),
        phase,
      );
      return offsets;
    };
    expect(sample(3 + REFLECTION_DASH_PERIOD * 100)).toEqual(sample(3));
    // A negative phase wraps into range rather than running the offset the
    // wrong way by a whole period.
    expect(sample(-5)).toEqual(sample(3));
  });

  it("uses ACCENT_VARIANT for the thick pass and WHITE for the thin one", () => {
    const ctx = createStubContext(128, 128);
    const styles: unknown[] = [];
    const widths: number[] = [];
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      styles.push(ctx.strokeStyle);
      widths.push(ctx.lineWidth);
      realStroke();
    };
    drawReflectionLines(
      ctx as never,
      reflectionSegments([VERTICAL], null, 10, 0, 0),
      0,
    );
    expect(styles).toEqual([ACCENT_VARIANT, WHITE]);
    expect(widths).toEqual([2, 1]);
  });

  it("⭐ strokes the draft at half alpha and committed lines at full", () => {
    const ctx = createStubContext(128, 128);
    const alphas: number[] = [];
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      alphas.push(ctx.globalAlpha);
      realStroke();
    };
    drawReflectionLines(
      ctx as never,
      reflectionSegments([VERTICAL], HORIZONTAL, 10, 0, 0),
      0,
    );
    // Two passes for the committed line, then two for the draft.
    expect(alphas).toEqual([1, 1, 0.5, 0.5]);
  });

  it("⭐ RESETS dash, offset, alpha and line width when it finishes", () => {
    // The overlay is one canvas among several; leaving a dash or a half alpha
    // set is exactly the bug `drawOriginCross` guards against on the way in.
    const ctx = draw([VERTICAL], HORIZONTAL, 5);
    const dashes = ctx.calls
      .filter((c) => c.method === "setLineDash")
      .map((c) => c.args[0]);
    expect(dashes[dashes.length - 1]).toEqual([]);
    expect(ctx.lineDashOffset).toBe(0);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.lineWidth).toBe(1);
  });

  it("draws nothing at all for an empty segment list", () => {
    const ctx = createStubContext(128, 128);
    drawReflectionLines(ctx as never, [], 0);
    expect(ctx.calls).toHaveLength(0);
  });

  it("skips a degenerate segment handed in directly", () => {
    const ctx = createStubContext(128, 128);
    drawReflectionLines(
      ctx as never,
      [{ x1: 10, y1: 10, x2: 10, y2: 10, draft: false }],
      0,
    );
    expect(ctx.calls.filter((c) => c.method === "stroke")).toHaveLength(0);
  });

  it("strokes every segment in a multi-line set", () => {
    const ctx = draw([VERTICAL, HORIZONTAL], HORIZONTAL);
    expect(ctx.calls.filter((c) => c.method === "stroke")).toHaveLength(6);
  });

  it("PROOF the buffer stays blank — this is why there is no golden hash", () => {
    const ctx = draw();
    expect(ctx.buffer.data.every((b) => b === 0)).toBe(true);
  });
});
