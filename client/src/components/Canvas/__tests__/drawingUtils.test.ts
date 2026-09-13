/**
 * Characterisation tests for `components/Canvas/drawingUtils.ts`.
 *
 * MASTER.md §10 rule 10: every assertion below pins OBSERVED behaviour. Several
 * of them record results that are arguably wrong (`getSquarePixels(2)` returns a
 * 3×3 block, `getEllipsePixels` emits the same pixel set for `"fill"` and
 * `"both"`). They are recorded, not fixed — task 30 unifies, this file is the
 * equivalence proof.
 *
 * Every value here was produced by RUNNING the function and transcribing the
 * result, never by reasoning about what the algorithm ought to emit.
 */
import { describe, expect, it } from "vitest";
import {
  floodFill,
  gaussianFloodFill,
  getCirclePixels,
  getEllipsePixels,
  getLinePixels,
  getRectanglePixels,
  getSquarePixels,
  getShapeOutlineKeys,
} from "@/components/Canvas/drawingUtils";
import type { Color, PixelData, Point } from "@/types";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };

const empty = (): PixelData => ({ color: 0, normal: 0, height: 0 });
const solid = (c: Color) => (): PixelData => ({
  color: { ...c },
  normal: 0,
  height: 0,
});

const grid = (
  w: number,
  h: number,
  fill: () => PixelData = empty,
): PixelData[][] =>
  Array.from({ length: h }, () => Array.from({ length: w }, fill));

/** `[x, y]` pairs — far easier to read in a failure diff than objects. */
const xy = (pts: readonly Point[]): [number, number][] =>
  pts.map((p) => [p.x, p.y]);

const coords = (pts: readonly { x: number; y: number }[]): [number, number][] =>
  pts.map((p) => [p.x, p.y]);

/* ────────────────────────────────────────────────────────────────────────── */
/* getLinePixels — Bresenham                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

describe("getLinePixels", () => {
  it("returns exactly one pixel when start === end", () => {
    expect(getLinePixels({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
    ]);
    expect(getLinePixels({ x: 7, y: 3 }, { x: 7, y: 3 })).toEqual([
      { x: 7, y: 3 },
    ]);
  });

  it("is endpoint-INCLUSIVE at both ends", () => {
    const pixels = getLinePixels({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(pixels[0]).toEqual({ x: 0, y: 0 });
    expect(pixels[pixels.length - 1]).toEqual({ x: 3, y: 0 });
    // n+1 pixels for a span of n, precisely because both ends are included.
    expect(pixels).toHaveLength(4);
  });

  it("walks a horizontal run", () => {
    expect(xy(getLinePixels({ x: 0, y: 0 }, { x: 3, y: 0 }))).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("walks a vertical run", () => {
    expect(xy(getLinePixels({ x: 0, y: 0 }, { x: 0, y: 3 }))).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
  });

  it("walks the main diagonal", () => {
    expect(xy(getLinePixels({ x: 0, y: 0 }, { x: 3, y: 3 }))).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("walks the anti-diagonal", () => {
    expect(xy(getLinePixels({ x: 0, y: 3 }, { x: 3, y: 0 }))).toEqual([
      [0, 3],
      [1, 2],
      [2, 1],
      [3, 0],
    ]);
  });

  it("walks a negative-direction line, emitting pixels from start to end", () => {
    // NOT reversed to canonical order — the caller sees start-first ordering.
    expect(xy(getLinePixels({ x: 3, y: 3 }, { x: 0, y: 0 }))).toEqual([
      [3, 3],
      [2, 2],
      [1, 1],
      [0, 0],
    ]);
  });

  it("steps x-major on a shallow slope (dx > dy)", () => {
    expect(xy(getLinePixels({ x: 0, y: 0 }, { x: 4, y: 2 }))).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
    ]);
  });

  it("steps y-major on a steep slope (dy > dx)", () => {
    expect(xy(getLinePixels({ x: 0, y: 0 }, { x: 2, y: 4 }))).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
    ]);
  });

  it("is reversal-symmetric as a SET (not as a sequence)", () => {
    const a = getLinePixels({ x: 0, y: 0 }, { x: 7, y: 3 });
    const b = getLinePixels({ x: 7, y: 3 }, { x: 0, y: 0 });
    const key = (p: Point) => `${p.x},${p.y}`;
    expect(new Set(a.map(key))).toEqual(new Set(b.map(key)));
  });

  it("accepts negative coordinates without clamping to the grid", () => {
    // No bounds argument exists, so callers MUST filter. Canvas.tsx's touch
    // eraser path does not — that latent out-of-bounds write is upstream of
    // this function, and this assertion records why.
    expect(xy(getLinePixels({ x: -2, y: 0 }, { x: 0, y: 0 }))).toEqual([
      [-2, 0],
      [-1, 0],
      [0, 0],
    ]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* getRectanglePixels                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe("getRectanglePixels", () => {
  it('"outline" emits the border ring only, in row-major order', () => {
    expect(
      xy(getRectanglePixels({ x: 0, y: 0 }, { x: 3, y: 3 }, "outline")),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [3, 1],
      [0, 2],
      [3, 2],
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('"fill" emits every interior cell', () => {
    expect(
      xy(getRectanglePixels({ x: 0, y: 0 }, { x: 2, y: 2 }, "fill")),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('"both" is byte-identical to "fill" — the outline adds nothing new', () => {
    const fill = getRectanglePixels({ x: 0, y: 0 }, { x: 4, y: 3 }, "fill");
    const both = getRectanglePixels({ x: 0, y: 0 }, { x: 4, y: 3 }, "both");
    // The `mode === "fill" || mode === "both"` branch means these two modes
    // literally share a code path. Recorded, not fixed.
    expect(both).toEqual(fill);
  });

  it("1×1 yields exactly one pixel in every mode", () => {
    for (const mode of ["outline", "fill", "both"] as const) {
      expect(getRectanglePixels({ x: 5, y: 5 }, { x: 5, y: 5 }, mode)).toEqual([
        { x: 5, y: 5 },
      ]);
    }
  });

  it("normalises reversed corners (x2 < x1, y2 < y1)", () => {
    const forward = getRectanglePixels({ x: 0, y: 0 }, { x: 3, y: 3 }, "fill");
    const reversed = getRectanglePixels({ x: 3, y: 3 }, { x: 0, y: 0 }, "fill");
    expect(reversed).toEqual(forward);
    expect(reversed).toHaveLength(16);
  });

  it("borderRadius 0 is a plain rectangle", () => {
    expect(
      getRectanglePixels({ x: 0, y: 0 }, { x: 3, y: 3 }, "outline", 0),
    ).toEqual(getRectanglePixels({ x: 0, y: 0 }, { x: 3, y: 3 }, "outline"));
  });

  it("borderRadius 1 knocks the four corner pixels off the outline", () => {
    expect(
      xy(getRectanglePixels({ x: 0, y: 0 }, { x: 4, y: 4 }, "outline", 1)),
    ).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [4, 1],
      [0, 2],
      [4, 2],
      [0, 3],
      [4, 3],
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
  });

  /* ⚠️ REGRESSION (2026-09-01): rounded outlines drew BLANK CORNERS.
     `isOnRoundedRectBorder` began by demanding the pixel sit on one of the four
     straight edges (x === minX/maxX || y === minY/maxY) and returned false
     otherwise — but a corner arc is pulled INWARD, off all four of those lines,
     so every arc pixel was discarded and the outline fell apart into four
     disconnected segments.

     The radius-1 test above cannot catch it: at r == 1 the arc DEGENERATES to
     "drop the four corner pixels", which the broken code also produced. The
     bug only appears at r >= 2, where the arc has intermediate pixels to lose.
     These pin an actual arc, and its connectivity. */
  it("a radius-3 outline draws CONNECTED corner arcs, not blank corners", () => {
    const px = getRectanglePixels({ x: 0, y: 0 }, { x: 11, y: 9 }, "outline", 3);
    const at = new Set(px.map((p) => `${p.x},${p.y}`));

    // The arc pixels that the edge-only guard used to throw away.
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [9, 1],
      [10, 1],
      [10, 2],
      [1, 8],
      [2, 8],
      [1, 7],
      [9, 8],
      [10, 8],
      [10, 7],
    ]) {
      expect(at.has(`${x},${y}`)).toBe(true);
    }

    // Corner CELLS stay empty — the shape is rounded, not square.
    for (const [x, y] of [
      [0, 0],
      [11, 0],
      [0, 9],
      [11, 9],
    ]) {
      expect(at.has(`${x},${y}`)).toBe(false);
    }

    // A closed ring: every pixel has >= 2 of its 8 neighbours in the set.
    for (const p of px) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && at.has(`${p.x + dx},${p.y + dy}`)) n++;
        }
      }
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });

  it("a rounded outline is exactly the fill's boundary", () => {
    const fill = getRectanglePixels({ x: 0, y: 0 }, { x: 11, y: 9 }, "fill", 3);
    const solid = new Set(fill.map((p) => `${p.x},${p.y}`));
    const outline = getRectanglePixels(
      { x: 0, y: 0 },
      { x: 11, y: 9 },
      "outline",
      3,
    );

    /* Set EQUALITY, in both directions. Checking only that each emitted pixel
       is a valid boundary cell is vacuous — the broken version emitted a
       subset (four straight segments), and every pixel in that subset was
       individually legitimate. The missing arc is caught only by deriving the
       expected boundary independently and comparing whole sets. */
    const expected = fill
      .filter((p) =>
        [
          [p.x - 1, p.y],
          [p.x + 1, p.y],
          [p.x, p.y - 1],
          [p.x, p.y + 1],
        ].some(([x, y]) => !solid.has(`${x},${y}`)),
      )
      .map((p) => `${p.x},${p.y}`)
      .sort();

    expect(outline.map((p) => `${p.x},${p.y}`).sort()).toEqual(expected);
  });

  it("clamps a radius larger than half the size, producing a diamond/disc", () => {
    // radius 99 on a 5×5 clamps to floor(4/2) = 2.
    expect(
      xy(getRectanglePixels({ x: 0, y: 0 }, { x: 4, y: 4 }, "fill", 99)),
    ).toEqual([
      [2, 0],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [1, 3],
      [2, 3],
      [3, 3],
      [2, 4],
    ]);
  });

  it("never emits a duplicate coordinate", () => {
    const pts = getRectanglePixels({ x: 0, y: 0 }, { x: 6, y: 6 }, "both", 2);
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(pts.length);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* getEllipsePixels                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

describe("getEllipsePixels", () => {
  it("returns the centre alone when rx and ry are both 0", () => {
    for (const mode of ["outline", "fill", "both"] as const) {
      expect(getEllipsePixels({ x: 2, y: 2 }, { x: 2, y: 2 }, mode)).toEqual([
        { x: 2, y: 2 },
      ]);
    }
  });

  it("collapses to a single pixel when ry is 0 but rx is not", () => {
    // BEHAVIOUR NOTE: region 1's `while (dx < dy)` never runs (dy = 0) and
    // region 2's `while (y >= 0)` runs once at y = 0 with x = 0, so a
    // zero-height ellipse degenerates to the centre point only. Observed.
    expect(
      xy(getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 4 }, "outline")),
    ).toEqual([[4, 4]]);
  });

  it("emits a vertical bar when rx is 0 but ry is not", () => {
    expect(
      xy(getEllipsePixels({ x: 4, y: 4 }, { x: 4, y: 6 }, "outline")),
    ).toEqual([
      [4, 6],
      [4, 2],
      [4, 5],
      [4, 3],
      [4, 4],
    ]);
  });

  it('"outline" of a 2-radius circle emits the 12-pixel ring', () => {
    expect(
      xy(getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 6 }, "outline")),
    ).toEqual([
      [4, 6],
      [4, 2],
      [5, 6],
      [3, 6],
      [5, 2],
      [3, 2],
      [6, 5],
      [2, 5],
      [6, 3],
      [2, 3],
      [6, 4],
      [2, 4],
    ]);
  });

  it('"fill" and "both" are identical, and both are supersets of the outline', () => {
    const outline = getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 6 }, "outline");
    const fill = getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 6 }, "fill");
    const both = getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 6 }, "both");
    expect(both).toEqual(fill);
    expect(fill).toHaveLength(21);
    expect(outline).toHaveLength(12);
    const fillKeys = new Set(fill.map((p) => `${p.x},${p.y}`));
    for (const p of outline) expect(fillKeys.has(`${p.x},${p.y}`)).toBe(true);
  });

  it("is symmetric about both axes for a circle", () => {
    const cx = 4;
    const cy = 4;
    const keys = new Set(
      getEllipsePixels(
        { x: cx, y: cy },
        { x: cx + 3, y: cy + 3 },
        "outline",
      ).map((p) => `${p.x},${p.y}`),
    );
    for (const k of [...keys]) {
      const [x, y] = k.split(",").map(Number);
      expect(keys.has(`${2 * cx - x},${y}`)).toBe(true);
      expect(keys.has(`${x},${2 * cy - y}`)).toBe(true);
    }
  });

  it("handles a reversed edge point identically (radii are absolute)", () => {
    const a = getEllipsePixels({ x: 4, y: 4 }, { x: 6, y: 6 }, "outline");
    const b = getEllipsePixels({ x: 4, y: 4 }, { x: 2, y: 2 }, "outline");
    expect(b).toEqual(a);
  });

  it("never emits a duplicate coordinate", () => {
    const pts = getEllipsePixels({ x: 8, y: 8 }, { x: 13, y: 11 }, "fill");
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(pts.length);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* floodFill                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

describe("floodFill", () => {
  it("fills a region bounded by a differently-coloured wall", () => {
    const g = grid(5, 5);
    for (let y = 0; y < 5; y++) g[y][2] = solid(BLUE)();
    const result = floodFill(g, 0, 0, 5, 5, RED);
    expect(coords(result)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
      [0, 3],
      [1, 3],
      [0, 4],
      [1, 4],
    ]);
    expect(result.every((r) => r.color === RED)).toBe(true);
  });

  it("fills from a corner", () => {
    expect(floodFill(grid(3, 3), 0, 0, 3, 3, RED)).toHaveLength(9);
  });

  it("returns EMPTY when the start pixel already holds the fill colour", () => {
    // The early-return guard at drawingUtils.ts:292-301. Note it compares by
    // VALUE, not identity, so a structurally-equal colour also short-circuits.
    const g = grid(3, 3, solid(RED));
    expect(floodFill(g, 1, 1, 3, 3, { ...RED })).toEqual([]);
  });

  it("fills a uniformly-coloured region with a DIFFERENT colour", () => {
    expect(floodFill(grid(3, 3, solid(BLUE)), 1, 1, 3, 3, RED)).toHaveLength(9);
  });

  it("fills a 1-pixel region", () => {
    const g = grid(3, 3, solid(BLUE));
    g[1][1] = empty();
    expect(coords(floodFill(g, 1, 1, 3, 3, RED))).toEqual([[1, 1]]);
  });

  it("fills a region that touches all four edges", () => {
    const g = grid(4, 4);
    // A single interior blue pixel; the transparent region wraps every edge.
    g[1][1] = solid(BLUE)();
    const result = floodFill(g, 0, 0, 4, 4, RED);
    expect(result).toHaveLength(15);
    const keys = new Set(coords(result).map(([x, y]) => `${x},${y}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("3,3")).toBe(true);
    expect(keys.has("1,1")).toBe(false);
  });

  it("STARTS ON A TRANSPARENT PIXEL and fills the transparent component", () => {
    // `targetColor` is the `0` sentinel. The value-equality guard above is
    // skipped (`typeof 0 === "object"` is false), and `isSameColor` treats
    // 0 === 0 as a match, so the transparent run IS filled. Observed.
    const g = grid(4, 4);
    expect(floodFill(g, 1, 1, 4, 4, RED)).toHaveLength(16);
  });

  it("does not cross from transparent into coloured, or the reverse", () => {
    const g = grid(4, 1);
    g[0][2] = solid(BLUE)();
    g[0][3] = solid(BLUE)();
    expect(coords(floodFill(g, 0, 0, 4, 1, RED))).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(coords(floodFill(g, 3, 0, 4, 1, RED))).toEqual([
      [3, 0],
      [2, 0],
    ]);
  });

  it("returns empty for an out-of-bounds start", () => {
    expect(floodFill(grid(3, 3), 9, 9, 3, 3, RED)).toEqual([]);
    expect(floodFill(grid(3, 3), -1, 0, 3, 3, RED)).toEqual([]);
  });

  it("respects a width/height smaller than the backing array", () => {
    const g = grid(6, 6);
    // Only the top-left 2×2 is considered in-bounds.
    expect(floodFill(g, 0, 0, 2, 2, RED)).toHaveLength(4);
  });

  it("distinguishes colours that differ only in alpha", () => {
    const g = grid(3, 1, solid(RED));
    g[0][1] = { color: { r: 255, g: 0, b: 0, a: 128 }, normal: 0, height: 0 };
    expect(coords(floodFill(g, 0, 0, 3, 1, BLUE))).toEqual([[0, 0]]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* gaussianFloodFill  (+ the private isSamePixelColor, asserted through it)   */
/* ────────────────────────────────────────────────────────────────────────── */

describe("gaussianFloodFill", () => {
  it("returns empty when the start coordinate is outside the array", () => {
    expect(gaussianFloodFill(grid(3, 3), -1, -1, 3, 3, 1, 2, BLUE)).toEqual([]);
    expect(gaussianFloodFill(grid(3, 3), 9, 9, 3, 3, 1, 2, BLUE)).toEqual([]);
  });

  // ── THE FORMER TS2367 SITE (drawingUtils.ts:436-441) ────────────────────
  //
  // Task 02 removed an unreachable `c === 0` arm there. These two tests are the
  // post-fix baseline for a TRANSPARENT start region — run, observed, recorded.
  it("OBSERVED: a wholly transparent grid finds no seeds and falls back to the solid fill colour", () => {
    const result = gaussianFloodFill(grid(4, 4), 1, 1, 4, 4, 1.0, 2.0, BLUE);
    // The whole 4×4 is one transparent component; there is no coloured
    // neighbour anywhere, so `seeds.length === 0` and every cell takes
    // `fallbackFillColor` verbatim (same object reference, not a copy).
    expect(result).toHaveLength(16);
    expect(result.every((r) => r.color === BLUE)).toBe(true);
  });

  it("OBSERVED: a transparent hole inside a coloured ring IS discovered and IS seeded from the ring", () => {
    // This is the load-bearing case. `isSamePixelColor(0, 0) === true`, so the
    // transparent 3×3 hole forms the region; the surrounding RED pixels are
    // NOT the same colour and DO have a colour, so they become seeds. The hole
    // is therefore Gaussian-interpolated to RED — the fallback colour (BLUE)
    // never appears.
    const g = grid(5, 5, solid(RED));
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) g[y][x] = empty();

    const result = gaussianFloodFill(g, 2, 2, 5, 5, 1.0, 2.0, BLUE);

    expect(result).toHaveLength(9);
    expect(coords(result)).toEqual([
      [2, 2],
      [3, 2],
      [1, 2],
      [2, 3],
      [2, 1],
      [3, 3],
      [3, 1],
      [1, 3],
      [1, 1],
    ]);
    for (const r of result) {
      expect(r.color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    }
  });

  it("OBSERVED: interpolates between two differently-coloured seeds", () => {
    // 1×5 strip: RED at x=0, transparent x=1..3, BLUE at x=4.
    const g = grid(5, 1);
    g[0][0] = solid(RED)();
    g[0][4] = solid(BLUE)();
    const result = gaussianFloodFill(g, 2, 0, 5, 1, 1.0, 2.0, GREEN);
    expect(result).toEqual([
      { x: 2, y: 0, color: { r: 128, g: 0, b: 128, a: 255 } },
      { x: 3, y: 0, color: { r: 69, g: 0, b: 186, a: 255 } },
      { x: 1, y: 0, color: { r: 186, g: 0, b: 69, a: 255 } },
    ]);
  });

  it("falls back per-pixel when every seed is beyond the Gaussian cutoff", () => {
    const g = grid(5, 5, solid(RED));
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) g[y][x] = empty();
    const result = gaussianFloodFill(g, 2, 2, 5, 5, 0.0001, 0.0001, BLUE);
    expect(result).toHaveLength(9);
    expect(result.every((r) => r.color === BLUE)).toBe(true);
  });

  it("clamps the interpolated alpha to a minimum of 1", () => {
    // Seeds are fully transparent-but-present colours (a = 0). The weighted
    // mean alpha is 0, and `Math.max(1, clampByte(...))` lifts it to 1.
    const g = grid(3, 1);
    g[0][0] = { color: { r: 200, g: 100, b: 50, a: 0 }, normal: 0, height: 0 };
    g[0][2] = { color: { r: 200, g: 100, b: 50, a: 0 }, normal: 0, height: 0 };
    const result = gaussianFloodFill(g, 1, 0, 3, 1, 1.0, 2.0, BLUE);
    expect(result).toHaveLength(1);
    expect(result[0].color).toEqual({ r: 200, g: 100, b: 50, a: 1 });
  });

  it("treats a coloured start region symmetrically (region = same-colour run)", () => {
    const g = grid(5, 1, solid(RED));
    g[0][0] = solid(BLUE)();
    g[0][4] = solid(BLUE)();
    const result = gaussianFloodFill(g, 2, 0, 5, 1, 1.0, 2.0, GREEN);
    // The RED run at x=1..3 is the region; both BLUE ends are seeds.
    expect(
      coords(result)
        .map(([x]) => x)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(result.every((r) => r.color !== GREEN)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* getSquarePixels / getCirclePixels — the brush footprints                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe("getSquarePixels", () => {
  it("size 1 is exactly one pixel at the centre", () => {
    expect(getSquarePixels({ x: 5, y: 7 }, 1, RED)).toEqual([
      { x: 5, y: 7, color: RED },
    ]);
  });

  it("OBSERVED: size 2 yields NINE pixels (a 3×3), not four", () => {
    // `halfSize = floor(2/2) = 1` and the loop is inclusive on both ends, so an
    // even size is rendered one pixel too large in every direction. Recorded as
    // current behaviour — an even-brush-size fix belongs to a later task.
    expect(coords(getSquarePixels({ x: 0, y: 0 }, 2, RED))).toEqual([
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]);
  });

  it("OBSERVED: sizes 2 and 3 produce identical footprints", () => {
    expect(getSquarePixels({ x: 4, y: 4 }, 2, RED)).toEqual(
      getSquarePixels({ x: 4, y: 4 }, 3, RED),
    );
    expect(getSquarePixels({ x: 4, y: 4 }, 4, RED)).toEqual(
      getSquarePixels({ x: 4, y: 4 }, 5, RED),
    );
  });

  it("size 3 is a 3×3 block, size 4 a 5×5 block", () => {
    expect(getSquarePixels({ x: 0, y: 0 }, 3, RED)).toHaveLength(9);
    expect(getSquarePixels({ x: 0, y: 0 }, 4, RED)).toHaveLength(25);
  });

  it("is symmetric about the centre for every size 1..8", () => {
    for (let size = 1; size <= 8; size++) {
      const keys = new Set(
        coords(getSquarePixels({ x: 0, y: 0 }, size, RED)).map(
          ([x, y]) => `${x},${y}`,
        ),
      );
      for (const k of keys) {
        const [x, y] = k.split(",").map(Number);
        expect(keys.has(`${-x},${y}`)).toBe(true);
        expect(keys.has(`${x},${-y}`)).toBe(true);
        expect(keys.has(`${-x},${-y}`)).toBe(true);
      }
    }
  });

  it("emits negative coordinates near an origin — the caller must bounds-filter", () => {
    // Canvas.tsx's MOUSE path filters this (`.filter()` on the bounds); the
    // TOUCH eraser path does not. The divergence lives at the call sites, not
    // here, so this assertion records what the callee hands them.
    const pts = coords(getSquarePixels({ x: 0, y: 0 }, 3, RED));
    expect(pts.some(([x, y]) => x < 0 || y < 0)).toBe(true);
  });

  it("shares the SAME colour object reference across every emitted pixel", () => {
    const pts = getSquarePixels({ x: 0, y: 0 }, 3, RED);
    for (const p of pts) expect(p.color).toBe(RED);
  });
});

describe("getCirclePixels", () => {
  it("size 1 is exactly one pixel at the centre", () => {
    expect(getCirclePixels({ x: 5, y: 7 }, 1, RED)).toEqual([
      { x: 5, y: 7, color: RED },
    ]);
  });

  it("OBSERVED: size 2 is a 5-pixel plus, size 3 a full 3×3", () => {
    // radius = size/2 = 1 for size 2 (so only |d| <= 1 orthogonals survive),
    // but radius = 1.5 for size 3, whose radiusSq = 2.25 admits the diagonals.
    expect(coords(getCirclePixels({ x: 0, y: 0 }, 2, RED))).toEqual([
      [0, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(getCirclePixels({ x: 0, y: 0 }, 3, RED)).toHaveLength(9);
  });

  it("OBSERVED: size 4 is a 13-pixel disc", () => {
    expect(coords(getCirclePixels({ x: 0, y: 0 }, 4, RED))).toEqual([
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, -1],
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [0, 2],
    ]);
  });

  it("is symmetric about the centre for every size 1..8", () => {
    for (let size = 1; size <= 8; size++) {
      const keys = new Set(
        coords(getCirclePixels({ x: 0, y: 0 }, size, RED)).map(
          ([x, y]) => `${x},${y}`,
        ),
      );
      for (const k of keys) {
        const [x, y] = k.split(",").map(Number);
        expect(keys.has(`${-x},${y}`)).toBe(true);
        expect(keys.has(`${x},${-y}`)).toBe(true);
        expect(keys.has(`${-x},${-y}`)).toBe(true);
      }
    }
  });

  it("is always a subset of the square of the same size", () => {
    for (let size = 1; size <= 8; size++) {
      const square = new Set(
        coords(getSquarePixels({ x: 0, y: 0 }, size, RED)).map(
          ([x, y]) => `${x},${y}`,
        ),
      );
      for (const [x, y] of coords(getCirclePixels({ x: 0, y: 0 }, size, RED))) {
        expect(square.has(`${x},${y}`)).toBe(true);
      }
    }
  });

  it("translates with the centre", () => {
    const at0 = coords(getCirclePixels({ x: 0, y: 0 }, 4, RED));
    const at10 = coords(getCirclePixels({ x: 10, y: 20 }, 4, RED));
    expect(at10).toEqual(at0.map(([x, y]) => [x + 10, y + 20]));
  });
});

describe("getShapeOutlineKeys — which pixels take the EDGE colour", () => {
  /* The edge/fill colour split (2026-09-01): in `"both"` mode a shape's
     outline takes the edge colour and its interior the fill colour, so the
     commit needs to know which pixels are which. */
  it("a rectangle's outline set is exactly its \"outline\" mode pixels", () => {
    const keys = getShapeOutlineKeys(
      "rectangle",
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      0,
    );
    const outline = getRectanglePixels(
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      "outline",
      0,
    );
    expect(keys).toEqual(new Set(outline.map((p) => `${p.x},${p.y}`)));
  });

  it("respects the border radius — a rounded corner is not an edge cell", () => {
    const keys = getShapeOutlineKeys(
      "rectangle",
      { x: 0, y: 0 },
      { x: 11, y: 9 },
      3,
    );
    // The bare corner is rounded away...
    expect(keys.has("0,0")).toBe(false);
    // ...and the arc pixel that replaces it IS an edge.
    expect(keys.has("1,1")).toBe(true);
  });

  /* ⚠️ THE PARTITION PROPERTY — the one that matters for a seam. Every pixel
     of a `"both"` shape must be either outline or interior: a pixel in neither
     set would go uncoloured, and the two sets disagreeing would show the wrong
     colour along the edge. */
  it("partitions a \"both\" rectangle with no gap and no overlap", () => {
    const both = getRectanglePixels({ x: 0, y: 0 }, { x: 11, y: 9 }, "both", 3);
    const keys = getShapeOutlineKeys(
      "rectangle",
      { x: 0, y: 0 },
      { x: 11, y: 9 },
      3,
    );

    // Every outline pixel is part of the shape.
    for (const k of keys) {
      expect(both.some((p) => `${p.x},${p.y}` === k)).toBe(true);
    }
    // And the shape's own pixels split cleanly in two non-empty groups.
    const edge = both.filter((p) => keys.has(`${p.x},${p.y}`));
    const interior = both.filter((p) => !keys.has(`${p.x},${p.y}`));
    expect(edge.length + interior.length).toBe(both.length);
    expect(edge.length).toBeGreaterThan(0);
    expect(interior.length).toBeGreaterThan(0);
  });

  it("partitions a \"both\" ellipse the same way", () => {
    const both = getEllipsePixels({ x: 8, y: 8 }, { x: 14, y: 13 }, "both");
    const keys = getShapeOutlineKeys("ellipse", { x: 8, y: 8 }, { x: 14, y: 13 });
    const edge = both.filter((p) => keys.has(`${p.x},${p.y}`));
    const interior = both.filter((p) => !keys.has(`${p.x},${p.y}`));
    expect(edge.length + interior.length).toBe(both.length);
    expect(edge.length).toBeGreaterThan(0);
    expect(interior.length).toBeGreaterThan(0);
  });

  it("a LINE is all edge — it has no interior to fill", () => {
    const line = getLinePixels({ x: 0, y: 0 }, { x: 9, y: 4 });
    const keys = getShapeOutlineKeys("line", { x: 0, y: 0 }, { x: 9, y: 4 });
    expect(keys.size).toBe(line.length);
    for (const p of line) expect(keys.has(`${p.x},${p.y}`)).toBe(true);
  });
});
