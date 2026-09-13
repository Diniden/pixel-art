/**
 * `pixelBrushStamp` — hand-computed vectors for the Brush tool's pure core
 * (plan 12, task 02; MASTER D3, D5, D6, D7).
 *
 * Every expected value below was computed by hand from the spec BEFORE the
 * module was written, and the arithmetic is shown inline so a reader can
 * re-derive it. Where a converter in `colorMath.ts` rounds (`rgbToHsl` returns
 * integer H/S/L), the expected value carries that rounding rather than an
 * idealised one — the converters are the only ones the repo allows, and the
 * settle function must agree with THEM.
 */

import { describe, expect, it } from "vitest";
import type { BrushCell, BrushChannelType } from "@/types/brush";
import type { BrushSceneLayer } from "../../render/renderBrushFrame";
import type { LineFn, StampColor, StampPoint } from "../brushStamp";
import {
  PIXEL_BRUSH_HUE_PER_DELTA,
  PIXEL_BRUSH_PERCENT_PER_DELTA,
  pixelBrushFootprint,
  pixelBrushOrigin,
  resolvePixelBrushStamp,
  settlePixelBrushColor,
  stampPixelBrushSegment,
} from "../pixelBrushStamp";
import type { PixelBrushLayerDelta, PixelBrushStamp } from "../pixelBrushStamp";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

function grid(width: number, height: number): BrushCell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): BrushCell => 0),
  );
}

function layer(
  channelType: BrushChannelType,
  visible: boolean,
  pixels: BrushCell[][],
): BrushSceneLayer {
  return { channelType, visible, pixels };
}

function paint(
  pixels: BrushCell[][],
  x: number,
  y: number,
  delta: [number, number, number, number],
): void {
  pixels[y]![x] = delta;
}

const d = (
  channelType: BrushChannelType,
  delta: [number, number, number, number],
): PixelBrushLayerDelta => ({ channelType, delta });

const BLACK: StampColor = { r: 0, g: 0, b: 0, a: 255 };
const RED: StampColor = { r: 255, g: 0, b: 0, a: 255 };
const GREY100: StampColor = { r: 100, g: 100, b: 100, a: 255 };

const offsetsOf = (s: PixelBrushStamp) =>
  s.cells.map(({ dx, dy }) => ({ dx, dy }));

/* ── Origin ────────────────────────────────────────────────────────────────── */

describe("pixelBrushOrigin", () => {
  it("is floor(w/2), floor(h/2)", () => {
    expect(pixelBrushOrigin(16, 16)).toEqual({ originX: 8, originY: 8 });
    expect(pixelBrushOrigin(3, 3)).toEqual({ originX: 1, originY: 1 });
    expect(pixelBrushOrigin(1, 1)).toEqual({ originX: 0, originY: 0 });
  });
});

/* ── Scale constants ───────────────────────────────────────────────────────── */

describe("scale constants (MASTER D5)", () => {
  it("map ±255 to ±360° and ±100 %", () => {
    expect(255 * PIXEL_BRUSH_HUE_PER_DELTA).toBeCloseTo(360, 10);
    expect(255 * PIXEL_BRUSH_PERCENT_PER_DELTA).toBeCloseTo(100, 10);
  });
});

/* ── Footprint (D3) ────────────────────────────────────────────────────────── */

describe("pixelBrushFootprint", () => {
  it("is the row-major union of painted cells on VISIBLE layers, relative to the origin", () => {
    // 3×3 document, origin (1,1).
    const a = grid(3, 3);
    paint(a, 0, 0, [10, 0, 0, 0]); // painted
    paint(a, 2, 0, [0, 0, 0, 0]); // zero-delta: still painted
    paint(a, 0, 2, [0, 0, 0, -255]); // A = −255: still painted
    const b = grid(3, 3);
    paint(b, 2, 2, [10, 0, 0, 0]); // hidden layer: never counts
    const c = grid(3, 3);
    paint(c, 1, 1, [1, 2, 3, 0]); // normal layer: counts

    const fp = pixelBrushFootprint(
      [layer("rgb", true, a), layer("rgb", false, b), layer("normal", true, c)],
      3,
      3,
    );

    expect(fp.width).toBe(3);
    expect(fp.height).toBe(3);
    expect(fp.originX).toBe(1);
    expect(fp.originY).toBe(1);
    // Row-major: (0,0), (2,0), (1,1), (0,2) minus origin (1,1).
    expect(fp.offsets).toEqual([
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 0, dy: 0 },
      { dx: -1, dy: 1 },
    ]);
  });

  it("emits a cell once even when several layers paint it", () => {
    const a = grid(2, 2);
    paint(a, 1, 1, [1, 0, 0, 0]);
    const b = grid(2, 2);
    paint(b, 1, 1, [0, 1, 0, 0]);
    const fp = pixelBrushFootprint(
      [layer("rgb", true, a), layer("hsl", true, b)],
      2,
      2,
    );
    expect(fp.offsets).toEqual([{ dx: 0, dy: 0 }]);
  });

  it("counts heightmap cells and ignores every cell on a hidden layer", () => {
    const h = grid(2, 2);
    paint(h, 0, 0, [5, 0, 0, 0]);
    const hidden = grid(2, 2);
    paint(hidden, 1, 0, [5, 0, 0, 0]);
    paint(hidden, 0, 1, [5, 0, 0, 0]);
    paint(hidden, 1, 1, [5, 0, 0, 0]);
    const fp = pixelBrushFootprint(
      [layer("heightmap", true, h), layer("rgb", false, hidden)],
      2,
      2,
    );
    expect(fp.offsets).toEqual([{ dx: -1, dy: -1 }]);
  });

  it("clips a grid SHORTER than the document without throwing", () => {
    // Document is 3×3, but the layer has only one row (and a ragged row).
    const short: BrushCell[][] = [[[1, 0, 0, 0], 0]];
    const fp = pixelBrushFootprint([layer("rgb", true, short)], 3, 3);
    expect(fp.offsets).toEqual([{ dx: -1, dy: -1 }]);
  });

  it("clips a grid WIDER / TALLER than the document to width × height", () => {
    const big = grid(5, 5);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) paint(big, x, y, [1, 0, 0, 0]);
    const fp = pixelBrushFootprint([layer("rgb", true, big)], 2, 2);
    expect(fp.offsets).toEqual([
      { dx: -1, dy: -1 },
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it("tolerates a missing row (sparse grid) and an empty layer list", () => {
    const sparse: BrushCell[][] = [];
    sparse[1] = [0, [1, 0, 0, 0]];
    expect(
      pixelBrushFootprint([layer("rgb", true, sparse)], 2, 2).offsets,
    ).toEqual([{ dx: 0, dy: 0 }]);
    expect(pixelBrushFootprint([], 4, 4).offsets).toEqual([]);
  });
});

/* ── Settle, RGB (D5) ──────────────────────────────────────────────────────── */

describe("settlePixelBrushColor — rgb layers", () => {
  it("adds channel-for-channel", () => {
    expect(
      settlePixelBrushColor(GREY100, [d("rgb", [10, -20, 30, 0])]),
    ).toEqual({
      r: 110,
      g: 80,
      b: 130,
      a: 255,
    });
  });

  it("clamps to 0..255", () => {
    expect(
      settlePixelBrushColor({ r: 250, g: 0, b: 0, a: 255 }, [
        d("rgb", [10, -10, 0, 0]),
      ]),
    ).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("shifts alpha by the raw A delta", () => {
    expect(settlePixelBrushColor(GREY100, [d("rgb", [0, 0, 0, -255])]).a).toBe(
      0,
    );
    expect(
      settlePixelBrushColor({ ...GREY100, a: 100 }, [d("rgb", [0, 0, 0, 50])])
        .a,
    ).toBe(150);
  });

  it("applies two rgb layers cumulatively", () => {
    expect(
      settlePixelBrushColor(GREY100, [
        d("rgb", [10, 0, 0, 0]),
        d("rgb", [10, 5, -5, -10]),
      ]),
    ).toEqual({ r: 120, g: 105, b: 95, a: 245 });
  });

  it("clamps at each step, not only at the end (a saturated channel stays saturated)", () => {
    // 250 + 10 → 255 (clamped), then −3 → 252. Without per-step clamping: 257 − 3 = 254.
    expect(
      settlePixelBrushColor({ r: 250, g: 0, b: 0, a: 255 }, [
        d("rgb", [10, 0, 0, 0]),
        d("rgb", [-3, 0, 0, 0]),
      ]).r,
    ).toBe(252);
  });
});

/* ── Settle, HSL (D5) ──────────────────────────────────────────────────────── */

describe("settlePixelBrushColor — hsl layers", () => {
  it("H +85 on pure red is ≈ +120° → green", () => {
    // rgbToHsl(255,0,0) = (0, 100, 50); 85 · 360/255 = 120° exactly;
    // hslToRgb(120, 100, 50) = (0, 255, 0).
    const c = settlePixelBrushColor(RED, [d("hsl", [85, 0, 0, 0])]);
    expect(Math.abs(c.r - 0)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.g - 255)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.b - 0)).toBeLessThanOrEqual(2);
    expect(c.a).toBe(255);
  });

  it("S −255 on pure red desaturates to mid grey", () => {
    // (0, 100, 50) → s = clamp(100 − 100) = 0 → hslToRgb(0, 0, 50) = 127.5 → 128.
    const c = settlePixelBrushColor(RED, [d("hsl", [0, -255, 0, 0])]);
    expect(Math.abs(c.r - 128)).toBeLessThanOrEqual(1);
    expect(c.g).toBe(c.r);
    expect(c.b).toBe(c.r);
  });

  it("L +128 on black lifts to ≈ (128,128,128)", () => {
    // rgbToHsl(0,0,0) = (0, 0, 0); 128 · 100/255 = 50.196 %; 0.50196 · 255 = 128.0.
    const c = settlePixelBrushColor(BLACK, [d("hsl", [0, 0, 128, 0])]);
    expect(c).toEqual({ r: 128, g: 128, b: 128, a: 255 });
  });

  it("wraps hue in both directions", () => {
    // Red, H −85 → −120° → 240° → blue.
    const blue = settlePixelBrushColor(RED, [d("hsl", [0 - 85, 0, 0, 0])]);
    expect(blue.b).toBeGreaterThanOrEqual(253);
    expect(blue.r).toBeLessThanOrEqual(2);
    // Red, H +255 → +360° → still red.
    const red = settlePixelBrushColor(RED, [d("hsl", [255, 0, 0, 0])]);
    expect(red.r).toBeGreaterThanOrEqual(253);
    expect(red.g).toBeLessThanOrEqual(2);
  });

  it("consecutive hsl layers stay in HSL space: H/S given at L = 0 survive a later L lift", () => {
    // Layer 1 gives black a hue and full saturation (black stays black — L = 0).
    // Layer 2 lifts L. Because both are hsl, no round trip happens in between:
    // (120, 100, 0) → (120, 100, 50.196) → a saturated green, not grey.
    const c = settlePixelBrushColor(BLACK, [
      d("hsl", [85, 255, 0, 0]),
      d("hsl", [0, 0, 128, 0]),
    ]);
    expect(c.g).toBeGreaterThan(200);
    expect(c.r).toBeLessThan(20);
    expect(c.b).toBeLessThan(20);
    expect(c.r === c.g && c.g === c.b).toBe(false);
  });

  it("the prevHsl carry survives an hsl → rgb → hsl round trip through L = 0", () => {
    // Layer 1 (hsl): black → (120, 100, 0). Layer 2 (rgb, no-op delta) forces
    // a conversion back: hslToRgb(120,100,0) = (0,0,0), prevHsl = (120,100,0).
    // Layer 3 (hsl): rgbToHsl(0,0,0, prevHsl) — L rounds to 0, so H/S come
    // from prevHsl → (120, 100, 0); then L → 50.196 → green. WITHOUT the
    // carry this would be (0, 0, 50) → grey.
    const c = settlePixelBrushColor(BLACK, [
      d("hsl", [85, 255, 0, 0]),
      d("rgb", [0, 0, 0, 0]),
      d("hsl", [0, 0, 128, 0]),
    ]);
    expect(c.g).toBeGreaterThan(200);
    expect(c.r).toBeLessThan(20);
    expect(c.b).toBeLessThan(20);
  });

  it("without any earlier hue, black lifted in L is grey (no phantom hue)", () => {
    const c = settlePixelBrushColor(BLACK, [
      d("rgb", [0, 0, 0, 0]),
      d("hsl", [0, 0, 128, 0]),
    ]);
    expect(c.r).toBe(c.g);
    expect(c.g).toBe(c.b);
  });

  it("shifts alpha by the raw A delta in HSL space too", () => {
    expect(settlePixelBrushColor(RED, [d("hsl", [0, 0, 0, -55])]).a).toBe(200);
  });

  it("clamps S and L to 0..100", () => {
    // L +255 on red → l = clamp(50 + 100) = 100 → white.
    expect(settlePixelBrushColor(RED, [d("hsl", [0, 0, 255, 0])])).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 255,
    });
    // L −255 on red → l = 0 → black.
    expect(settlePixelBrushColor(RED, [d("hsl", [0, 0, -255, 0])])).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    });
  });
});

/* ── Settle, mixed order / inert layers / identity ─────────────────────────── */

describe("settlePixelBrushColor — mixed order and inert layers", () => {
  it("applies rgb → hsl → rgb sequentially (hand computation)", () => {
    // Base (100,100,100,255).
    // 1. rgb [55,−100,−100,0]      → (155, 0, 0, 255).
    // 2. hsl [85,0,0,0]: rgbToHsl(155,0,0): max = 155/255 = .6078, min = 0,
    //    l = .3039 → 30 (rounded by the converter), s = d/(max+min) = 1 → 100,
    //    h = 0. h += 120 → (120, 100, 30).
    // 3. rgb [0,0,50,0]: convert back first — hslToRgb(120,100,30):
    //    q = .3·2 = .6, p = 0; r = hue2rgb(0,.6,2/3) = p = 0; g = q = .6 → 153;
    //    b = hue2rgb(0,.6,0) = 0 → (0,153,0). Then b += 50 → (0,153,50,255).
    const c = settlePixelBrushColor(GREY100, [
      d("rgb", [55, -100, -100, 0]),
      d("hsl", [85, 0, 0, 0]),
      d("rgb", [0, 0, 50, 0]),
    ]);
    expect(c).toEqual({ r: 0, g: 153, b: 50, a: 255 });
  });

  it("normal and heightmap deltas change nothing, even between rgb/hsl layers", () => {
    const withInert = settlePixelBrushColor(GREY100, [
      d("normal", [255, -255, 100, 0]),
      d("rgb", [10, 0, 0, 0]),
      d("heightmap", [255, 0, 0, 0]),
      d("hsl", [0, 0, 20, 0]),
      d("normal", [0, 0, 0, 255]),
    ]);
    const without = settlePixelBrushColor(GREY100, [
      d("rgb", [10, 0, 0, 0]),
      d("hsl", [0, 0, 20, 0]),
    ]);
    expect(withInert).toEqual(without);
    expect(settlePixelBrushColor(GREY100, [d("normal", [1, 2, 3, 4])])).toEqual(
      GREY100,
    );
  });

  it("with no deltas returns an EQUAL but NON-IDENTICAL object", () => {
    const out = settlePixelBrushColor(GREY100, []);
    expect(out).toEqual(GREY100);
    expect(out).not.toBe(GREY100);
  });

  it("never mutates the base", () => {
    const base: StampColor = { r: 10, g: 20, b: 30, a: 40 };
    settlePixelBrushColor(base, [
      d("rgb", [100, 100, 100, 100]),
      d("hsl", [50, 50, 50, 50]),
    ]);
    expect(base).toEqual({ r: 10, g: 20, b: 30, a: 40 });
  });

  it("returns integers in 0..255 on every channel", () => {
    const c = settlePixelBrushColor({ r: 12.6, g: 0.4, b: 300, a: -5 }, [
      d("hsl", [3, 7, 11, 0.5]),
    ]);
    for (const v of [c.r, c.g, c.b, c.a]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

/* ── Stamp (D6) ────────────────────────────────────────────────────────────── */

describe("resolvePixelBrushStamp", () => {
  function twoLayerScene() {
    // 3×3; layer A (rgb) paints (0,0) and (1,1); layer B (hsl) paints (1,1) and (2,2).
    const a = grid(3, 3);
    paint(a, 0, 0, [10, 0, 0, 0]);
    paint(a, 1, 1, [10, 0, 0, 0]);
    const b = grid(3, 3);
    paint(b, 1, 1, [0, 0, -255, 0]); // L −100 % → black
    paint(b, 2, 2, [0, 0, 0, -255]); // A → 0
    const hidden = grid(3, 3);
    paint(hidden, 0, 2, [200, 200, 200, 0]);
    return [
      layer("rgb", true, a),
      layer("hsl", true, b),
      layer("rgb", false, hidden),
    ];
  }

  it("carries the footprint geometry and one settled colour per cell", () => {
    const s = resolvePixelBrushStamp(twoLayerScene(), 3, 3, GREY100);
    expect(s.width).toBe(3);
    expect(s.height).toBe(3);
    expect(s.originX).toBe(1);
    expect(s.originY).toBe(1);
    expect(s.cells).toEqual([
      { dx: -1, dy: -1, color: { r: 110, g: 100, b: 100, a: 255 } }, // A only
      { dx: 0, dy: 0, color: { r: 0, g: 0, b: 0, a: 255 } }, // A then B (L → 0)
      // B only: A → 0. The colour is 99, not 100 — an hsl layer round-trips
      // through `colorMath`, whose `rgbToHsl` returns an INTEGER L:
      // 100/255 = 39.2 % → 39; hslToRgb(0,0,39) = .39·255 = 99.45 → 99.
      // That ±1 drift belongs to the only converters the spec allows.
      { dx: 1, dy: 1, color: { r: 99, g: 99, b: 99, a: 0 } },
    ]);
  });

  it("colours differ where the layers differ", () => {
    const s = resolvePixelBrushStamp(twoLayerScene(), 3, 3, GREY100);
    const colours = s.cells.map((c) => JSON.stringify(c.color));
    expect(new Set(colours).size).toBe(colours.length);
  });

  it("no two cells share a colour object", () => {
    // Identical deltas everywhere → identical values, but still distinct objects.
    const a = grid(2, 2);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) paint(a, x, y, [1, 1, 1, 0]);
    const s = resolvePixelBrushStamp([layer("rgb", true, a)], 2, 2, GREY100);
    expect(s.cells).toHaveLength(4);
    const seen = new Set(s.cells.map((c) => c.color));
    expect(seen.size).toBe(4);
    // And none of them is the base object.
    for (const c of s.cells) expect(c.color).not.toBe(GREY100);
  });

  it("cell offsets equal the footprint's offsets for the same layers", () => {
    const layers = twoLayerScene();
    const fp = pixelBrushFootprint(layers, 3, 3);
    const s = resolvePixelBrushStamp(layers, 3, 3, GREY100);
    expect(offsetsOf(s)).toEqual(fp.offsets);
  });

  it("re-settles from a different base colour", () => {
    const layers = twoLayerScene();
    const fromGrey = resolvePixelBrushStamp(layers, 3, 3, GREY100);
    const fromRed = resolvePixelBrushStamp(layers, 3, 3, RED);
    expect(fromRed.cells[0]!.color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(fromRed.cells[0]!.color).not.toEqual(fromGrey.cells[0]!.color);
    expect(offsetsOf(fromRed)).toEqual(offsetsOf(fromGrey));
  });

  it("is empty for an empty scene", () => {
    expect(resolvePixelBrushStamp([], 4, 4, GREY100).cells).toEqual([]);
  });
});

/* ── Segment (D7) ──────────────────────────────────────────────────────────── */

describe("stampPixelBrushSegment", () => {
  const X: StampColor = { r: 1, g: 1, b: 1, a: 255 };
  const Y: StampColor = { r: 2, g: 2, b: 2, a: 255 };
  /** Cells (0,0) → X and (1,0) → Y, origin (0,0). */
  const stamp: PixelBrushStamp = {
    width: 2,
    height: 1,
    originX: 0,
    originY: 0,
    cells: [
      { dx: 0, dy: 0, color: X },
      { dx: 1, dy: 0, color: Y },
    ],
  };
  const GRID = { gridWidth: 10, gridHeight: 10 };
  const neverCalled: LineFn = () => {
    throw new Error("line must not be called");
  };

  it("with prev = null stamps only at next", () => {
    const out = stampPixelBrushSegment(
      null,
      { x: 5, y: 5 },
      neverCalled,
      stamp,
      GRID,
    );
    expect(out).toEqual([
      { x: 5, y: 5, color: X },
      { x: 6, y: 5, color: Y },
    ]);
  });

  it("stamps at every rasterised step; last write wins per cell", () => {
    const line: LineFn = () => [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const out = stampPixelBrushSegment(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      line,
      stamp,
      GRID,
    );
    // step (0,0): (0,0)=X (1,0)=Y · step (1,0): (1,0)=X (2,0)=Y · step (2,0): (2,0)=X (3,0)=Y
    expect(out).toEqual([
      { x: 0, y: 0, color: X },
      { x: 1, y: 0, color: X },
      { x: 2, y: 0, color: X },
      { x: 3, y: 0, color: Y },
    ]);
  });

  it("passes prev and next to the line function", () => {
    const calls: Array<[StampPoint, StampPoint]> = [];
    const line: LineFn = (a, b) => {
      calls.push([a, b]);
      return [b];
    };
    stampPixelBrushSegment({ x: 1, y: 2 }, { x: 3, y: 4 }, line, stamp, GRID);
    expect(calls).toEqual([
      [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    ]);
  });

  it("drops a cell that lands off-grid and keeps the rest", () => {
    const out = stampPixelBrushSegment(
      null,
      { x: 9, y: 5 },
      neverCalled,
      stamp,
      GRID,
    );
    expect(out).toEqual([{ x: 9, y: 5, color: X }]);
    expect(
      stampPixelBrushSegment(null, { x: -1, y: 0 }, neverCalled, stamp, GRID),
    ).toEqual([{ x: 0, y: 0, color: Y }]);
    expect(
      stampPixelBrushSegment(null, { x: -5, y: -5 }, neverCalled, stamp, GRID),
    ).toEqual([]);
  });

  it("stamps once when prev === next (no line call)", () => {
    const out = stampPixelBrushSegment(
      { x: 4, y: 4 },
      { x: 4, y: 4 },
      neverCalled,
      stamp,
      GRID,
    );
    expect(out).toEqual([
      { x: 4, y: 4, color: X },
      { x: 5, y: 4, color: Y },
    ]);
  });

  it("writes an empty list for an empty stamp", () => {
    const empty: PixelBrushStamp = {
      width: 0,
      height: 0,
      originX: 0,
      originY: 0,
      cells: [],
    };
    expect(
      stampPixelBrushSegment(null, { x: 5, y: 5 }, neverCalled, empty, GRID),
    ).toEqual([]);
  });

  it("translates negative offsets (a centred brush) correctly", () => {
    const centred: PixelBrushStamp = {
      width: 3,
      height: 3,
      originX: 1,
      originY: 1,
      cells: [
        { dx: -1, dy: -1, color: X },
        { dx: 1, dy: 1, color: Y },
      ],
    };
    expect(
      stampPixelBrushSegment(null, { x: 0, y: 0 }, neverCalled, centred, GRID),
    ).toEqual([{ x: 1, y: 1, color: Y }]);
  });
});
