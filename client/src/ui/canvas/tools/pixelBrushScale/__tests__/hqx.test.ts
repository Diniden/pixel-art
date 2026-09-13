/**
 * `pixelBrushScale/hqx` — hq2x (plan 13, task 10; MASTER D9, R3).
 *
 * The literal expectations below were derived by hand from the table rows
 * BEFORE the scaler ran: the 3×3 diagonal touches patterns 116, 73, 32, 19,
 * 255, 200, 4, 146 and 46, and each row was applied cell by cell with the
 * blend rule (blend only when every chosen cell is painted, otherwise the
 * heaviest cell; the 2:3:3 tie takes p when p == q, else E). The dihedral
 * suite is the strong self-check on the 256-row table — hq2x is invariant
 * under the 8 rotations and reflections of the square, and one wrong row
 * breaks it. The test is never weakened.
 */

import { describe, expect, it } from "vitest";
import type { BrushCell, BrushDelta } from "@/types/brush";
import { HQ2X_DIFF_THRESHOLD, PIXEL_BRUSH_HQ2X, hq2x } from "../hqx";
import { HQ2X_TABLE } from "../hqxTable";
import { XBR_PAINT_PENALTY, cellsEqual } from "../pixelArt";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

/** The one painted value of the diagonal fixtures (task 08's `X`). */
const X: BrushDelta = [100, -20, 5, 255];

/** ASCII grid → cells: `X` is a fresh clone of `X`, anything else is `0`. */
function parse(rows: readonly string[]): BrushCell[][] {
  return rows.map((row) =>
    [...row].map((ch): BrushCell => (ch === "X" ? [...X] : 0)),
  );
}

function flat(w: number, h: number, cell: BrushCell): BrushCell[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, (): BrushCell => (cell === 0 ? 0 : [...cell])),
  );
}

/** Dimensions of a well-formed `[y][x]` grid. */
function dims(g: BrushCell[][]): { w: number; h: number } {
  return { h: g.length, w: g[0]?.length ?? 0 };
}

/** Build a grid of size `w × h` whose `[y][x]` is `pick(x, y)` (cloned). */
function build(
  w: number,
  h: number,
  pick: (x: number, y: number) => BrushCell,
): BrushCell[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x): BrushCell => {
      const c = pick(x, y);
      return c === 0 ? 0 : [...c];
    }),
  );
}

/* ── Dihedral transforms (task 08's harness) ───────────────────────────────── */

type Transform = (g: BrushCell[][]) => BrushCell[][];

const TRANSFORMS: Record<string, Transform> = {
  identity: (g) => {
    const { w, h } = dims(g);
    return build(w, h, (x, y) => g[y]![x]!);
  },
  // Clockwise: source (x, y) lands at (h-1-y, x).
  rot90: (g) => {
    const { w, h } = dims(g);
    return build(h, w, (x, y) => g[h - 1 - x]![y]!);
  },
  rot180: (g) => {
    const { w, h } = dims(g);
    return build(w, h, (x, y) => g[h - 1 - y]![w - 1 - x]!);
  },
  rot270: (g) => {
    const { w, h } = dims(g);
    return build(h, w, (x, y) => g[x]![w - 1 - y]!);
  },
  flipX: (g) => {
    const { w, h } = dims(g);
    return build(w, h, (x, y) => g[y]![w - 1 - x]!);
  },
  flipY: (g) => {
    const { w, h } = dims(g);
    return build(w, h, (x, y) => g[h - 1 - y]![x]!);
  },
  transpose: (g) => {
    const { w, h } = dims(g);
    return build(h, w, (x, y) => g[x]![y]!);
  },
  // Source (x, y) lands at (h-1-y, w-1-x).
  antiTranspose: (g) => {
    const { w, h } = dims(g);
    return build(h, w, (x, y) => g[h - 1 - x]![w - 1 - y]!);
  },
};

/* ── Seeded grids (tiny LCG — no Math.random) ──────────────────────────────── */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/**
 * Every painted pair is farther apart than `HQ2X_DIFF_THRESHOLD`, so the
 * pattern bits are exactly "not equal"; `0` is weighted heavier so painted /
 * unpainted borders are frequent.
 */
const FAR_PALETTE: readonly BrushCell[] = [
  0,
  0,
  [100, 0, 0, 0],
  [0, 100, 0, 0],
  [-100, 0, 60, 0],
  [0, 0, 0, 0],
];

/**
 * Some painted pairs sit inside the threshold (10, 20, 30 apart) and some
 * outside, so both branches of every conditional row and the "similar but
 * not equal" blends are exercised.
 */
const NEAR_PALETTE: readonly BrushCell[] = [
  0,
  0,
  [10, 0, 0, 0],
  [20, 0, 0, 0],
  [0, 50, 0, 0],
  [0, 0, 0, 0],
  [-40, -40, 0, 0],
];

function seededGrid(
  w: number,
  h: number,
  seed: number,
  palette: readonly BrushCell[],
): BrushCell[][] {
  const next = lcg(seed);
  return build(w, h, () => palette[Math.floor(next() * palette.length)]!);
}

const SYMMETRY_SIZES: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [5, 3],
  [3, 6],
  [7, 5],
  [6, 6],
  [2, 5],
  [1, 4],
  [8, 3],
  [5, 5],
  [3, 3],
  [6, 2],
  [9, 4],
];

/** 24 seeded grids: 12 sizes × 2 palettes, seeds 1..24. */
const SYMMETRY_GRIDS: ReadonlyArray<BrushCell[][]> = [
  ...SYMMETRY_SIZES.map(([w, h], i) => seededGrid(w, h, i + 1, FAR_PALETTE)),
  ...SYMMETRY_SIZES.map(([w, h], i) => seededGrid(w, h, i + 13, NEAR_PALETTE)),
];

/* ── Registry shape ────────────────────────────────────────────────────────── */

describe("PIXEL_BRUSH_HQ2X", () => {
  it("is the hq2x strategy: id, label, short, factor 2", () => {
    expect(PIXEL_BRUSH_HQ2X).toMatchObject({
      id: "hq2x",
      label: "hq2x",
      short: "HQ2",
      factor: 2,
    });
    expect(PIXEL_BRUSH_HQ2X.scale).toBe(hq2x);
  });

  it("decodes a 256-row table with four rules per row", () => {
    expect(HQ2X_TABLE).toHaveLength(256);
    for (const row of HQ2X_TABLE) expect(row.split("|")).toHaveLength(4);
  });

  it("the threshold sits well under the painted-ness penalty", () => {
    expect(HQ2X_DIFF_THRESHOLD).toBeGreaterThan(0);
    expect(HQ2X_DIFF_THRESHOLD).toBeLessThan(XBR_PAINT_PENALTY);
  });
});

/* ── Flat grids → block replication ────────────────────────────────────────── */

describe("hq2x — flat grids", () => {
  it("replicates a flat painted grid into 2×2 blocks", () => {
    expect(hq2x(flat(3, 2, X), 3, 2)).toEqual(flat(6, 4, X));
  });

  it("replicates a flat unpainted grid", () => {
    expect(hq2x(flat(2, 3, 0), 2, 3)).toEqual(flat(4, 6, 0));
  });

  it("replicates a painted-zero grid without confusing it for unpainted", () => {
    expect(hq2x(flat(2, 2, [0, 0, 0, 0]), 2, 2)).toEqual(
      flat(4, 4, [0, 0, 0, 0]),
    );
  });

  it("scales a 1×1 grid to one block", () => {
    expect(hq2x([[X]], 1, 1)).toEqual(flat(2, 2, X));
  });

  it("returns an empty grid for an empty input", () => {
    expect(hq2x([], 0, 0)).toEqual([]);
  });
});

/* ── Hand-derived literals ─────────────────────────────────────────────────── */

describe("hq2x — hand-derived outputs (clamp-to-edge)", () => {
  it("3×3 diagonal → the smoothed 6×6", () => {
    // Patterns per cell (row-major): 116, 73, 32 / 19, 255, 200 / 4, 146, 46.
    // The corner cells keep their blocks (every blend there touches a hole,
    // so the centre X is copied); the four stair holes each gain one X from a
    // 2:3:3 row whose p and q are both X (pattern 73 BL, 19 TR, 200 BL,
    // 146 TR); the middle cell is pattern 255, whose 14:1:1 rows all touch
    // holes and copy X.
    expect(hq2x(parse(["X..", ".X.", "..X"]), 3, 3)).toEqual(
      parse([
        "XX....", //
        "XXX...",
        ".XXX..",
        "..XXX.",
        "...XXX",
        "....XX",
      ]),
    );
  });

  it("an isolated cell among equal painted neighbours blends 14:1:1", () => {
    // Pattern 255; each row is `?k:0:100` and every corner pair is B == B,
    // so all four sub-pixels are (14·A + B + B) / 16 with B = 0:
    //   160·14/16 = 140,  −30·14/16 = −26.25 → −26,
    //   7·14/16 = 6.125 → 6,  255·14/16 = 223.125 → 223.
    const A: BrushDelta = [160, -30, 7, 255];
    const B: BrushDelta = [0, 0, 0, 0];
    const g = flat(3, 3, B);
    g[1]![1] = [...A];
    const out = hq2x(g, 3, 3);
    const expected: BrushDelta = [140, -26, 6, 223];
    expect(out[2]![2]).toEqual(expected);
    expect(out[2]![3]).toEqual(expected);
    expect(out[3]![2]).toEqual(expected);
    expect(out[3]![3]).toEqual(expected);
  });

  it("an isolated cell among holes copies itself — never blends with a hole", () => {
    const A: BrushDelta = [160, -30, 7, 255];
    const g = flat(3, 3, 0);
    g[1]![1] = [...A];
    const out = hq2x(g, 3, 3);
    expect(out[2]![2]).toEqual(A);
    expect(out[2]![3]).toEqual(A);
    expect(out[3]![2]).toEqual(A);
    expect(out[3]![3]).toEqual(A);
    // …and the holes around it stay holes.
    expect(out[0]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out[5]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("the threshold decides the pattern: 48 apart is similar, 49 is different", () => {
    const B: BrushDelta = [0, 0, 0, 0];
    // Distance exactly the threshold → pattern 0 → 2:1:1 → (2·48)/4 = 24.
    const same = flat(3, 3, B);
    same[1]![1] = [HQ2X_DIFF_THRESHOLD, 0, 0, 0];
    expect(hq2x(same, 3, 3)[2]![2]).toEqual([24, 0, 0, 0]);
    // One more → pattern 255 → 14:1:1 → 49·14/16 = 42.875 → 43.
    const diff = flat(3, 3, B);
    diff[1]![1] = [HQ2X_DIFF_THRESHOLD + 1, 0, 0, 0];
    expect(hq2x(diff, 3, 3)[2]![2]).toEqual([43, 0, 0, 0]);
  });
});

/* ── Painted cells never blend with holes ──────────────────────────────────── */

describe("hq2x — the unpainted-neighbour rule", () => {
  it("a single painted value next to holes yields only that value or holes", () => {
    for (let seed = 30; seed < 36; seed++) {
      const g = seededGrid(7, 6, seed, [0, X, 0, X, X]);
      for (const row of hq2x(g, 7, 6)) {
        for (const c of row) expect(c === 0 || cellsEqual(c, X)).toBe(true);
      }
    }
  });

  it("two painted values next to holes blend only with each other", () => {
    // A and B put all their weight on channels 0 and 1; any convex blend of
    // the two keeps c0 + c1 = 100 (± 1 for rounding). A blend that leaked a
    // hole in ([0,0,0,0] weight) would pull the sum below that.
    const A: BrushDelta = [100, 0, 0, 0];
    const B: BrushDelta = [0, 100, 0, 0];
    for (let seed = 40; seed < 46; seed++) {
      const g = seededGrid(8, 7, seed, [0, 0, A, B]);
      for (const row of hq2x(g, 8, 7)) {
        for (const c of row) {
          if (c === 0) continue;
          expect(Math.abs(c[0] + c[1] - 100)).toBeLessThanOrEqual(1);
          expect(c[2]).toBe(0);
          expect(c[3]).toBe(0);
        }
      }
    }
  });
});

/* ── Dihedral symmetry ─────────────────────────────────────────────────────── */

describe("hq2x — dihedral symmetry", () => {
  for (const [name, T] of Object.entries(TRANSFORMS)) {
    it(`scale(${name}(g)) == ${name}(scale(g)) over ${SYMMETRY_GRIDS.length} seeded grids`, () => {
      for (const g of SYMMETRY_GRIDS) {
        const { w, h } = dims(g);
        const tg = T(g);
        const { w: tw, h: th } = dims(tg);
        expect(hq2x(tg, tw, th)).toEqual(T(hq2x(g, w, h)));
      }
    });
  }

  it("the transforms themselves are sound (rot90 four times is identity)", () => {
    const g = seededGrid(5, 3, 7, FAR_PALETTE);
    const r = TRANSFORMS.rot90!;
    expect(r(r(r(r(g))))).toEqual(g);
    expect(TRANSFORMS.rot270!(g)).toEqual(r(r(r(g))));
    expect(TRANSFORMS.rot180!(g)).toEqual(r(r(g)));
  });

  it("the seeded grids actually contain blends (the suite is not vacuous)", () => {
    let blended = 0;
    for (const g of SYMMETRY_GRIDS) {
      const { w, h } = dims(g);
      for (const row of hq2x(g, w, h)) {
        for (const c of row) {
          if (c !== 0 && !NEAR_PALETTE.some((p) => cellsEqual(p, c))) {
            if (!FAR_PALETTE.some((p) => cellsEqual(p, c))) blended++;
          }
        }
      }
    }
    expect(blended).toBeGreaterThan(0);
  });
});

/* ── No shared tuple references ────────────────────────────────────────────── */

describe("hq2x — output tuples are clones", () => {
  it("shares no tuple with the input or between output cells", () => {
    const g = seededGrid(6, 5, 11, NEAR_PALETTE);
    const inputTuples = new Set<BrushDelta>();
    for (const row of g) for (const c of row) if (c !== 0) inputTuples.add(c);

    const out = hq2x(g, 6, 5);
    const seen = new Set<BrushDelta>();
    let painted = 0;
    for (const row of out) {
      for (const c of row) {
        if (c === 0) continue;
        painted++;
        expect(inputTuples.has(c)).toBe(false);
        seen.add(c);
      }
    }
    expect(painted).toBeGreaterThan(0);
    expect(seen.size).toBe(painted);
  });

  it("does not mutate the input", () => {
    const g = seededGrid(4, 4, 13, NEAR_PALETTE);
    const before = JSON.stringify(g);
    hq2x(g, 4, 4);
    expect(JSON.stringify(g)).toBe(before);
  });

  it("never emits -0", () => {
    const g = seededGrid(6, 6, 17, [
      0,
      [-1, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    for (const row of hq2x(g, 6, 6)) {
      for (const c of row) {
        if (c === 0) continue;
        for (const v of c) expect(Object.is(v, -0)).toBe(false);
      }
    }
  });
});
