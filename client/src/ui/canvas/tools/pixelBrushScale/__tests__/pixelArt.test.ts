/**
 * `pixelBrushScale/pixelArt` — the four integer-factor pixel-art scalers
 * (plan 13, task 08; MASTER D7, D9, §8).
 *
 * The hand-drawn expected outputs below were derived cell by cell from the
 * published rule tables BEFORE the module was written, with clamp-to-edge
 * neighbours, on a single 3×3 diagonal. The dihedral-symmetry suite is the
 * strong self-check: every one of these algorithms is invariant under the 8
 * rotations and reflections of the square, so `scale(T(g)) == T(scale(g))`
 * must hold for every transform T on any grid. A scaler that fails it is
 * wrong — the test is never weakened.
 */

import { describe, expect, it } from "vitest";
import type { BrushCell, BrushDelta } from "@/types/brush";
import {
  PIXEL_BRUSH_SCALER_IDS,
  PIXEL_BRUSH_SCALERS,
  XBR_PAINT_PENALTY,
  cellDistance,
  cellsEqual,
} from "../pixelArt";
import type { PixelBrushScaler } from "../pixelArt";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

/** The one painted value of the diagonal fixtures. */
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

const scalers: PixelBrushScaler[] = PIXEL_BRUSH_SCALER_IDS.map(
  (id) => PIXEL_BRUSH_SCALERS[id],
);

/** Dimensions of a well-formed `[y][x]` grid. */
function dims(g: BrushCell[][]): { w: number; h: number } {
  return { h: g.length, w: g[0]?.length ?? 0 };
}

/* ── Dihedral transforms ───────────────────────────────────────────────────── */

type Transform = (g: BrushCell[][]) => BrushCell[][];

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
 * A small palette so equalities are common (the rules only fire on equal
 * neighbours) and the xBR distances take several distinct values. `0` is
 * weighted heavier so painted/unpainted borders are frequent.
 */
const PALETTE: readonly BrushCell[] = [
  0,
  0,
  [10, 0, 0, 0],
  [20, 0, 0, 0],
  [0, 50, 0, 0],
  [0, 0, 0, 0],
];

function seededGrid(w: number, h: number, seed: number): BrushCell[][] {
  const next = lcg(seed);
  return build(w, h, () => PALETTE[Math.floor(next() * PALETTE.length)]!);
}

/* ── cellsEqual / cellDistance ─────────────────────────────────────────────── */

describe("cellsEqual", () => {
  it("treats two unpainted cells as equal", () => {
    expect(cellsEqual(0, 0)).toBe(true);
  });

  it("compares tuples by value, all four deltas", () => {
    expect(cellsEqual([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(cellsEqual([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
    expect(cellsEqual([1, 2, 3, 4], [0, 2, 3, 4])).toBe(false);
  });

  it("painted zero deltas are NOT equal to unpainted (MASTER D9)", () => {
    expect(cellsEqual([0, 0, 0, 0], 0)).toBe(false);
    expect(cellsEqual(0, [0, 0, 0, 0])).toBe(false);
  });
});

describe("cellDistance", () => {
  it("is L1 over the four deltas between painted cells", () => {
    // |1-4| + |2-2| + |3-0| + |4-(-4)| = 3 + 0 + 3 + 8 = 14
    expect(cellDistance([1, 2, 3, 4], [4, 2, 0, -4])).toBe(14);
    expect(cellDistance(0, 0)).toBe(0);
  });

  it("adds the penalty when painted-ness differs, symmetric", () => {
    // unpainted reads as [0,0,0,0]: L1 = 10 + 20 = 30, plus the penalty
    expect(cellDistance([10, -20, 0, 0], 0)).toBe(XBR_PAINT_PENALTY + 30);
    expect(cellDistance(0, [10, -20, 0, 0])).toBe(XBR_PAINT_PENALTY + 30);
    // the penalty alone beats the largest possible L1 (4 × 510)
    expect(XBR_PAINT_PENALTY).toBeGreaterThan(4 * 510);
  });
});

/* ── Registry ──────────────────────────────────────────────────────────────── */

describe("PIXEL_BRUSH_SCALERS", () => {
  it("exports the four scalers with ids, factors, labels and shorts", () => {
    expect(PIXEL_BRUSH_SCALER_IDS).toEqual(["epx", "scale3x", "eagle", "xbr"]);
    for (const id of PIXEL_BRUSH_SCALER_IDS) {
      expect(PIXEL_BRUSH_SCALERS[id].id).toBe(id);
    }
    expect(PIXEL_BRUSH_SCALERS.epx).toMatchObject({
      label: "EPX / Scale2x",
      short: "EPX",
      factor: 2,
    });
    expect(PIXEL_BRUSH_SCALERS.scale3x).toMatchObject({
      label: "Scale3x",
      short: "S3X",
      factor: 3,
    });
    expect(PIXEL_BRUSH_SCALERS.eagle).toMatchObject({
      label: "Eagle",
      short: "EGL",
      factor: 2,
    });
    expect(PIXEL_BRUSH_SCALERS.xbr).toMatchObject({
      label: "xBR",
      short: "XBR",
      factor: 2,
    });
  });
});

/* ── Flat grids → block replication ────────────────────────────────────────── */

describe.each(scalers)("$id — flat grids", (scaler) => {
  const f = scaler.factor;

  it("replicates a flat painted grid into blocks", () => {
    const out = scaler.scale(flat(3, 2, X), 3, 2);
    expect(out).toEqual(flat(3 * f, 2 * f, X));
  });

  it("replicates a flat unpainted grid", () => {
    const out = scaler.scale(flat(2, 3, 0), 2, 3);
    expect(out).toEqual(flat(2 * f, 3 * f, 0));
  });

  it("replicates a painted-zero grid without confusing it for unpainted", () => {
    const out = scaler.scale(flat(2, 2, [0, 0, 0, 0]), 2, 2);
    expect(out).toEqual(flat(2 * f, 2 * f, [0, 0, 0, 0]));
  });

  it("scales a 1×1 grid to one block", () => {
    expect(scaler.scale([[X]], 1, 1)).toEqual(flat(f, f, X));
  });

  it("returns an empty grid for an empty input", () => {
    expect(scaler.scale([], 0, 0)).toEqual([]);
  });
});

/* ── Hand-drawn diagonal ───────────────────────────────────────────────────── */

const DIAGONAL = ["X..", ".X.", "..X"];

describe("3×3 diagonal — hand-drawn outputs (clamp-to-edge)", () => {
  it("EPX / Scale2x → 6×6", () => {
    // Corner cells see their clamped selves as A/C (top-left) or B/D
    // (bottom-right); the middle cell's neighbours are all unpainted, so its
    // four rules all fail the `!=` clauses and it replicates.
    expect(PIXEL_BRUSH_SCALERS.epx.scale(parse(DIAGONAL), 3, 3)).toEqual(
      parse([
        "XX....", //
        "X.X...",
        ".XXX..",
        "..XXX.",
        "...X.X",
        "....XX",
      ]),
    );
  });

  it("Scale3x → 9×9", () => {
    expect(PIXEL_BRUSH_SCALERS.scale3x.scale(parse(DIAGONAL), 3, 3)).toEqual(
      parse([
        "XXX......", //
        "XX.X.....",
        "X..X.....",
        ".XXXXX...",
        "...XXX...",
        "...XXXXX.",
        ".....X..X",
        ".....X.XX",
        "......XXX",
      ]),
    );
  });

  it("Eagle → 6×6", () => {
    // Eagle only keeps a corner when all three neighbours toward it agree, so
    // the middle cell loses its off-diagonal corners; the edge cells keep
    // theirs through clamping.
    expect(PIXEL_BRUSH_SCALERS.eagle.scale(parse(DIAGONAL), 3, 3)).toEqual(
      parse([
        "XX....", //
        "XX....",
        "..X...",
        "...X..",
        "....XX",
        "....XX",
      ]),
    );
  });

  it("xBR → 6×6", () => {
    // The unpainted stair cells (1,0) / (0,1) / (2,1) / (1,2) each have one
    // corner on an H–F edge (e = 2·penalty < i = 4·penalty) between two
    // painted cells, so those corners fill; the middle line cell's off-
    // diagonal corners lie on an E–I edge (e = 0 < i = 4·penalty) and take
    // the unpainted F == H.
    expect(PIXEL_BRUSH_SCALERS.xbr.scale(parse(DIAGONAL), 3, 3)).toEqual(
      parse([
        "XX....", //
        "XXX...",
        ".XX...",
        "...XX.",
        "...XXX",
        "....XX",
      ]),
    );
  });
});

/* ── xBR picks, never blends ───────────────────────────────────────────────── */

describe("xBR corner pick", () => {
  const A: BrushDelta = [10, 0, 0, 0];
  const B: BrushDelta = [20, 0, 0, 0];
  // E = (1,1) unpainted; its bottom-right corner sees F = A, H = B, I = B.
  //   e = d(I,F4) + 4·d(H,F)          = 10 + 40           = 50
  //   i = d(H,D) + d(F,I4) + d(F,B) + 4·d(E,I)
  //     = (P+20) + 10 + (P+10) + 4·(P+20) = 6P + 120     (P = penalty)
  // so e < i and the corner takes the nearer of F (P+10) and H (P+20) → F.
  const STAIR: BrushCell[][] = [
    [0, 0, 0, 0],
    [0, 0, A, A],
    [0, B, B, B],
    [0, B, B, B],
  ];

  it("takes the nearer of F and H as an exact source tuple", () => {
    const out = PIXEL_BRUSH_SCALERS.xbr.scale(STAIR, 4, 4);
    // bottom-right subpixel of source (1,1) is output (3,3)
    expect(out[3]![3]).toEqual(A);
  });

  it("takes H when H is the nearer", () => {
    const swapped = STAIR.map((row) =>
      row.map((c): BrushCell =>
        c === 0 ? 0 : cellsEqual(c, A) ? [...B] : [...A],
      ),
    );
    const out = PIXEL_BRUSH_SCALERS.xbr.scale(swapped, 4, 4);
    // now F = B (P+20) and H = A (P+10): H wins
    expect(out[3]![3]).toEqual(A);
  });

  it("keeps E on a tie between two different cells (symmetry rule)", () => {
    const Ay: BrushDelta = [0, 10, 0, 0]; // same distance from E as A
    const tied = STAIR.map((row) =>
      row.map((c): BrushCell =>
        c === 0 ? 0 : cellsEqual(c, A) ? [...A] : [...Ay],
      ),
    );
    const out = PIXEL_BRUSH_SCALERS.xbr.scale(tied, 4, 4);
    expect(out[3]![3]).toBe(0);
  });

  it("never emits a tuple that is not in the input", () => {
    const g = seededGrid(7, 6, 99);
    const out = PIXEL_BRUSH_SCALERS.xbr.scale(g, 7, 6);
    for (const row of out) {
      for (const c of row) {
        expect(PALETTE.some((p) => cellsEqual(p, c))).toBe(true);
      }
    }
  });
});

/* ── Dihedral symmetry ─────────────────────────────────────────────────────── */

const SYMMETRY_GRIDS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 4, 1],
  [5, 3, 2],
  [3, 6, 3],
  [7, 5, 4],
  [6, 6, 5],
  [2, 5, 6],
];

describe.each(scalers)("$id — dihedral symmetry", (scaler) => {
  for (const [name, T] of Object.entries(TRANSFORMS)) {
    it(`scale(${name}(g)) == ${name}(scale(g))`, () => {
      for (const [w, h, seed] of SYMMETRY_GRIDS) {
        const g = seededGrid(w, h, seed);
        const tg = T(g);
        const { w: tw, h: th } = dims(tg);
        expect(scaler.scale(tg, tw, th)).toEqual(T(scaler.scale(g, w, h)));
      }
    });
  }

  it("the transforms themselves are sound (rot90 four times is identity)", () => {
    const g = seededGrid(5, 3, 7);
    const r = TRANSFORMS.rot90!;
    expect(r(r(r(r(g))))).toEqual(g);
    expect(TRANSFORMS.rot270!(g)).toEqual(r(r(r(g))));
    expect(TRANSFORMS.rot180!(g)).toEqual(r(r(g)));
  });
});

/* ── No shared tuple references ────────────────────────────────────────────── */

describe.each(scalers)("$id — output tuples are clones", (scaler) => {
  it("shares no tuple with the input or between output cells", () => {
    const g = seededGrid(6, 5, 11);
    const inputTuples = new Set<BrushDelta>();
    for (const row of g) for (const c of row) if (c !== 0) inputTuples.add(c);

    const out = scaler.scale(g, 6, 5);
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
    const g = seededGrid(4, 4, 13);
    const before = JSON.stringify(g);
    scaler.scale(g, 4, 4);
    expect(JSON.stringify(g)).toBe(before);
  });
});
