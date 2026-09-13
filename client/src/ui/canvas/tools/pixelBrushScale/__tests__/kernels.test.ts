/**
 * `pixelBrushScale/kernels` — hand-computed vectors for the separable
 * resampler (plan 13, task 07; MASTER D6, D7).
 *
 * Every expected value below was computed by hand from the spec's
 * conventions BEFORE the module was written, and the arithmetic is shown
 * inline so a reader can re-derive it:
 *
 *   u   = (i + 0.5) · src / dst − 0.5          (destination centre → source)
 *   t   = k − u  for each source index k in [ceil(u − r), floor(u + r)]
 *   w_k = weight(t / stretch),  stretch = max(src / dst, 1),  r = support · stretch
 *   indices clamped to 0..n−1, weights normalised to Σw = 1.
 *
 * Where a value ends in .5, the pinned integer carries `Math.round`'s
 * half-up bias (62.5 → 63, 37.5 → 38) because `clampDelta` is the only
 * rounding the module is allowed to use.
 */

import { describe, expect, it } from "vitest";
import type { BrushCell, BrushDelta } from "@/types/brush";
import {
  PIXEL_BRUSH_KERNEL_IDS,
  PIXEL_BRUSH_KERNELS,
  resamplePixelBrushGrid,
} from "../kernels";
import type { PixelBrushKernel, PixelBrushKernelId } from "../kernels";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

function grid(width: number, height: number): BrushCell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): BrushCell => 0),
  );
}

function paint(
  pixels: BrushCell[][],
  x: number,
  y: number,
  delta: BrushDelta,
): void {
  pixels[y]![x] = delta;
}

/** A painted cell carrying `v` on channel 0 only. */
const d0 = (v: number): BrushDelta => [v, 0, 0, 0];

/** A 1-row grid of painted cells carrying `values` on channel 0. */
function row1d(values: number[]): BrushCell[][] {
  return [values.map(d0)];
}

/** Channel 0 of every cell in a row; `null` marks an unpainted cell. */
function ch0(row: BrushCell[]): (number | null)[] {
  return row.map((c) => (c === 0 ? null : c[0]));
}

/**
 * The spec's 1-D formula on a fully painted row, WITHOUT the clamp — the
 * raw weighted sum the module sees before `clampDelta`. Used to show
 * overshoot and the Mitchell 1:1 blur, which the public API hides.
 */
function raw1d(kernel: PixelBrushKernel, src: number[], dstN: number) {
  const ratio = src.length / dstN;
  const stretch = Math.max(ratio, 1);
  const r = kernel.support * stretch;
  return Array.from({ length: dstN }, (_, i) => {
    const u = (i + 0.5) * ratio - 0.5;
    let acc = 0;
    let sum = 0;
    for (let k = Math.ceil(u - r); k <= Math.floor(u + r); k++) {
      const w = kernel.weight((k - u) / stretch);
      acc += w * src[Math.min(src.length - 1, Math.max(0, k))]!;
      sum += w;
    }
    return acc / sum;
  });
}

const resample = (
  g: BrushCell[][],
  dstW: number,
  dstH: number,
  kx: PixelBrushKernelId,
  ky: PixelBrushKernelId = kx,
) => resamplePixelBrushGrid(g, g[0]!.length, g.length, dstW, dstH, kx, ky);

/* ── Registry ──────────────────────────────────────────────────────────────── */

describe("PIXEL_BRUSH_KERNELS", () => {
  it("lists the seven kernels in D7 order with their labels and shorts", () => {
    expect(PIXEL_BRUSH_KERNEL_IDS).toEqual([
      "nearest",
      "bilinear",
      "bicubic",
      "mitchell",
      "lanczos2",
      "lanczos3",
      "box",
    ]);
    expect(
      PIXEL_BRUSH_KERNEL_IDS.map((id) => {
        const k = PIXEL_BRUSH_KERNELS[id];
        return [k.id, k.label, k.short, k.support];
      }),
    ).toEqual([
      ["nearest", "Nearest", "NN", 0.5],
      ["bilinear", "Bilinear", "BIL", 1],
      ["bicubic", "Bicubic (Catmull-Rom)", "BIC", 2],
      ["mitchell", "Mitchell–Netravali", "MIT", 2],
      ["lanczos2", "Lanczos 2", "LZ2", 2],
      ["lanczos3", "Lanczos 3", "LZ3", 3],
      ["box", "Box (area)", "BOX", 0.5],
    ]);
  });

  it("weights are even in t and vanish at the edge of support", () => {
    for (const id of PIXEL_BRUSH_KERNEL_IDS) {
      const { weight, support } = PIXEL_BRUSH_KERNELS[id];
      expect(weight(0.3)).toBeCloseTo(weight(-0.3), 12);
      expect(weight(support + 0.01)).toBe(0);
    }
    // Interpolating kernels pass through the sample: w(0) = 1, w(±1) = 0.
    for (const id of ["bilinear", "bicubic", "lanczos2", "lanczos3"] as const) {
      expect(PIXEL_BRUSH_KERNELS[id].weight(0)).toBe(1);
      expect(PIXEL_BRUSH_KERNELS[id].weight(1)).toBeCloseTo(0, 12);
    }
  });
});

/* ── Identity ──────────────────────────────────────────────────────────────── */

describe("identical size", () => {
  const src = grid(3, 2);
  paint(src, 0, 0, [1, -2, 3, -4]);
  paint(src, 2, 0, [255, -255, 0, 9]);
  paint(src, 1, 1, [-7, 7, -7, 7]);

  it.each(PIXEL_BRUSH_KERNEL_IDS)(
    "%s returns an equal grid sharing no row or tuple",
    (id) => {
      const out = resample(src, 3, 2, id);
      expect(out).toEqual(src);
      expect(out).not.toBe(src);
      out.forEach((row, y) => {
        expect(row).not.toBe(src[y]);
        row.forEach((cell, x) => {
          if (cell !== 0) expect(cell).not.toBe(src[y]![x]);
        });
      });
    },
  );
});

/* ── Nearest ───────────────────────────────────────────────────────────────── */

describe("nearest", () => {
  it("2× of a 2×2 checker is the 4×4 block pattern with cloned tuples", () => {
    // u = (i + 0.5)/2 − 0.5 = −0.25, 0.25, 0.75, 1.25 → floor(u + 0.5) = 0, 0, 1, 1.
    const A: BrushDelta = [10, 20, 30, 40];
    const B: BrushDelta = [-10, -20, -30, -40];
    const src: BrushCell[][] = [
      [A, B],
      [B, A],
    ];
    const out = resample(src, 4, 4, "nearest");
    expect(out).toEqual([
      [A, A, B, B],
      [A, A, B, B],
      [B, B, A, A],
      [B, B, A, A],
    ]);
    expect(out[0]![0]).not.toBe(A);
    expect(out[0]![0]).not.toBe(out[0]![1]);
    expect(out[0]![0]).not.toBe(out[1]![0]);
  });

  it("3→2 picks the cells under the destination centres (0 and 2)", () => {
    // u = (i + 0.5)·1.5 − 0.5 = 0.25, 1.75 → floor(0.75) = 0, floor(2.25) = 2.
    const src = grid(3, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) paint(src, x, y, d0(10 * y + x));
    }
    const out = resample(src, 2, 2, "nearest");
    expect(out.map(ch0)).toEqual([
      [0, 2],
      [20, 22],
    ]);
  });

  it("keeps holes as holes (binary coverage)", () => {
    const src = grid(2, 1);
    paint(src, 1, 0, d0(50));
    expect(resample(src, 4, 1, "nearest").map(ch0)).toEqual([
      [null, null, 50, 50],
    ]);
  });
});

/* ── Bilinear ──────────────────────────────────────────────────────────────── */

describe("bilinear", () => {
  it("[100, 0] → width 4 is 100, 75, 25, 0", () => {
    // Centres u = −0.25, 0.25, 0.75, 1.25; triangle w = 1 − |t|; edge clamped.
    //   i=0 u=−0.25: k=−1→0 (w .25) + k=0 (w .75) → both cell 0 → 100
    //   i=1 u= 0.25: k=0 (w .75), k=1 (w .25) → 75 + 0 = 75
    //   i=2 u= 0.75: k=0 (w .25), k=1 (w .75) → 25
    //   i=3 u= 1.25: k=1 (w .75), k=2→1 (w .25) → 0
    expect(resample(row1d([100, 0]), 4, 1, "bilinear").map(ch0)).toEqual([
      [100, 75, 25, 0],
    ]);
  });

  it("is separable: a symmetric 2×2 upscales to a symmetric 4×4", () => {
    // Rows first: [100,0] → [100,75,25,0]; [0,100] → [0,25,75,100].
    // Then columns with the same .75/.25 weights:
    //   x=1: [75,25] → 75, .75·75+.25·25 = 56.25+6.25 = 62.5 → 63,
    //                     .25·75+.75·25 = 18.75+18.75 = 37.5 → 38, 25
    //   x=2 is the mirror: 25, 38, 63, 75.
    const src: BrushCell[][] = [
      [d0(100), d0(0)],
      [d0(0), d0(100)],
    ];
    const out = resample(src, 4, 4, "bilinear").map(ch0);
    expect(out).toEqual([
      [100, 75, 25, 0],
      [75, 63, 38, 25],
      [25, 38, 63, 75],
      [0, 25, 75, 100],
    ]);
    // Transpose-invariant, which is what "cols then rows" would also give.
    const transposed = out[0]!.map((_, x) => out.map((row) => row[x]));
    expect(transposed).toEqual(out);
  });
});

/* ── Coverage model ────────────────────────────────────────────────────────── */

describe("coverage", () => {
  it("a lone painted cell 2× bilinear is a 2×2 core with the SOURCE delta", () => {
    // Row pass on the centre row, coverage [0,1,0] → 6 (u = −.25 … 2.25):
    //   c = [0, .25, .75, .75, .25, 0]; channel sums = c·d.
    // Column pass on x=2 (c = .75 at y=1, else 0) → 6:
    //   y=2: .75·.75 = .5625 ≥ .5 → painted, Σ/c = (.75·.75·d)/(.5625) = d
    //   y=1: .25·.75 = .1875 < .5 → unpainted; x=1 column peaks at .1875.
    // Naive averaging would have written d/4 at the core and smeared the ring.
    const D: BrushDelta = [200, -100, 50, 0];
    const src = grid(3, 3);
    paint(src, 1, 1, D);
    const out = resample(src, 6, 6, "bilinear");
    const painted = out.map((row) => row.map((c) => (c === 0 ? "." : "#")));
    expect(painted.map((r) => r.join(""))).toEqual([
      "......",
      "......",
      "..##..",
      "..##..",
      "......",
      "......",
    ]);
    expect(out[2]![2]).toEqual(D);
    expect(out[2]![3]).toEqual(D);
    expect(out[3]![2]).toEqual(D);
    expect(out[3]![3]).toEqual(D);
    expect(out[2]![2]).not.toBe(D);
  });
});

/* ── Overshoot ─────────────────────────────────────────────────────────────── */

describe("overshoot", () => {
  const step = [-255, -255, 255, 255];

  it("Catmull-Rom rings past ±255 before the clamp; the output never does", () => {
    // i=2, u=0.75, taps k=−1→0, 0, 1, 2 with t = −1.75, −0.75, 0.25, 1.25:
    //   w(1.75) = −.5·5.359375 + 2.5·3.0625 − 4·1.75 + 2 = −0.0234375
    //   w(0.75) = 1.5·0.421875 − 2.5·0.5625 + 1      =  0.2265625
    //   w(0.25) = 1.5·0.015625 − 2.5·0.0625 + 1      =  0.8671875
    //   w(1.25) = −.5·1.953125 + 2.5·1.5625 − 5 + 2  = −0.0703125   (Σ = 1)
    //   Σ = −255·(0.203125 + 0.8671875) + 255·(−0.0703125) = −255·1.140625
    //     = −290.859375
    const raw = raw1d(PIXEL_BRUSH_KERNELS.bicubic, step, 8);
    expect(raw[2]).toBeCloseTo(-290.859375, 9);
    expect(raw[5]).toBeCloseTo(290.859375, 9);
    const out = resample(row1d(step), 8, 1, "bicubic")[0]!;
    expect(ch0(out)).toEqual([-255, -255, -255, -151, 151, 255, 255, 255]);
    // i=3, u=1.25: −255·(−0.0703125 + 0.8671875) + 255·(0.2265625 − 0.0234375)
    //   = −203.203125 + 51.796875 = −151.40625 → −151.
  });

  it.each([
    // Lanczos-2 at i=2 (u=0.75), t = −1.75, −0.75, 0.25, 1.25:
    //   w = sinc(t)·sinc(t/2) ≈ −0.0179, 0.2353, 0.8774, −0.0847 (Σ ≈ 1.0101)
    //   → (−255·(0.2174 + 0.8774) − 255·0.0847)/1.0101 ≈ −297.8 → clamps to −255.
    // i=0 (u=−0.25) reaches only cells 0,0,0,1 = all −255 → exactly −255.
    // i=3 (u=1.25), k=0..3 with t = −1.25, −0.25, 0.75, 1.75:
    //   (−255·(−0.0847 + 0.8774) + 255·(0.2353 − 0.0179))/1.0101 ≈ −145.2 → −145.
    ["lanczos2", [-255, -255, -255, -145]],
    // Lanczos-3's THIRD lobe is positive and reaches across the step, so even
    // i=0 (u=−0.25) is no longer a flat −255. Taps k=−3..2, t = −2.75 … 2.25:
    //   w = sinc(t)·sinc(t/3) ≈ 0.00736, −0.06779, 0.27020, 0.89007 (cell 0),
    //       −0.13287 (cell 1), 0.03002 (cell 2 = +255);   Σ ≈ 0.99699
    //   → (−255·(1.09984 − 0.13287) + 255·0.03002)/0.99699 ≈ −239.6 → −240.
    ["lanczos3", [-240, -255, -255, -148]],
  ] as const)(
    "%s overshoots before the clamp; output stays integer and in range",
    (id, leftHalf) => {
      const raw = raw1d(PIXEL_BRUSH_KERNELS[id], step, 8);
      expect(raw[2]).toBeLessThan(-255);
      expect(raw[5]).toBeGreaterThan(255);
      const out = resample(row1d(step), 8, 1, id)[0]!;
      for (const cell of out) {
        expect(cell).not.toBe(0);
        for (const v of cell as BrushDelta) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(-255);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
      // The step is odd-symmetric, so the row is antisymmetric about its middle.
      const mirrored = leftHalf.map((v) => -v).reverse();
      expect(ch0(out)).toEqual([...leftHalf, ...mirrored]);
    },
  );
});

/* ── Box ───────────────────────────────────────────────────────────────────── */

describe("box", () => {
  it("4→2 averages pairs: [10,20,30,40] → [15,35]", () => {
    // stretch 2, r = 1; u = 0.5, 2.5 → windows [0,1], [2,3]; t/2 = ∓0.25 → w 1
    // each, normalised ½: (10+20)/2 = 15, (30+40)/2 = 35.
    expect(resample(row1d([10, 20, 30, 40]), 2, 1, "box").map(ch0)).toEqual([
      [15, 35],
    ]);
  });

  it("2→4 equals nearest (magnification is a single tap)", () => {
    // r = 0.5; u = −.25, .25, .75, 1.25 → windows [0,0], [0,0], [1,1], [1,1].
    const src: BrushCell[][] = [
      [d0(1), d0(2)],
      [d0(3), 0],
    ];
    expect(resample(src, 4, 4, "box")).toEqual(resample(src, 4, 4, "nearest"));
  });
});

/* ── Mitchell at 1:1 ───────────────────────────────────────────────────────── */

describe("mitchell", () => {
  it("blurs at 1:1 by its weights, so identity holds only via the short-circuit", () => {
    // B = C = ⅓: w(0) = (6 − 2B)/6 = 8/9; w(±1) = B/6 = 1/18; w(±2) = 0.
    const { weight } = PIXEL_BRUSH_KERNELS.mitchell;
    expect(weight(0)).toBeCloseTo(8 / 9, 12);
    expect(weight(1)).toBeCloseTo(1 / 18, 12);
    expect(weight(2)).toBe(0);
    // Direct 3→3 on [0, 90, 0]: centre 90·8/9 = 80; edges 90/18 = 5.
    const raw = raw1d(PIXEL_BRUSH_KERNELS.mitchell, [0, 90, 0], 3);
    expect(raw.map((v) => Math.round(v))).toEqual([5, 80, 5]);
    // The public API short-circuits to a deep copy instead.
    expect(resample(row1d([0, 90, 0]), 3, 1, "mitchell").map(ch0)).toEqual([
      [0, 90, 0],
    ]);
  });
});

/* ── Per-axis kernels ──────────────────────────────────────────────────────── */

describe("kernelX ≠ kernelY", () => {
  const src: BrushCell[][] = [
    [d0(10), d0(50)],
    [d0(20), d0(60)],
    [d0(30), d0(70)],
    [d0(40), d0(80)],
  ];

  it("nearest on X duplicates columns, box on Y averages row pairs", () => {
    // X 2→4 nearest: [a,b] → [a,a,b,b]. Y 4→2 box: rows (0+1)/2, (2+3)/2.
    expect(resample(src, 4, 2, "nearest", "box").map(ch0)).toEqual([
      [15, 15, 55, 55],
      [35, 35, 75, 75],
    ]);
  });

  it("box on X (= nearest at 2×), nearest on Y picks rows 1 and 3", () => {
    // Y 4→2 nearest: u = 0.5, 2.5 → floor(1) = 1, floor(3) = 3.
    expect(resample(src, 4, 2, "box", "nearest").map(ch0)).toEqual([
      [20, 20, 60, 60],
      [40, 40, 80, 80],
    ]);
  });
});

/* ── clampDelta invariants ─────────────────────────────────────────────────── */

describe("output invariants", () => {
  const src = grid(4, 4);
  paint(src, 0, 0, [-3, 250, -250, 1]);
  paint(src, 1, 0, [255, -255, 0, -1]);
  paint(src, 3, 1, [-1, 1, -1, 1]);
  paint(src, 1, 2, [0, 0, 0, 0]);
  paint(src, 2, 2, [-255, 255, -2, 2]);
  paint(src, 2, 3, [7, -7, 7, -7]);

  const pairs = PIXEL_BRUSH_KERNEL_IDS.flatMap((kx) =>
    PIXEL_BRUSH_KERNEL_IDS.map((ky) => [kx, ky] as const),
  );

  it.each(pairs)(
    "%s × %s: integers in range, no −0, holes are literal 0",
    (kx, ky) => {
      for (const [w, h] of [
        [7, 5],
        [2, 3],
        [9, 9],
      ] as const) {
        const out = resample(src, w, h, kx, ky);
        expect(out).toHaveLength(h);
        for (const row of out) {
          expect(row).toHaveLength(w);
          for (const cell of row) {
            if (cell === 0) {
              expect(Object.is(cell, 0)).toBe(true);
              continue;
            }
            expect(cell).toHaveLength(4);
            for (const v of cell) {
              expect(Number.isInteger(v)).toBe(true);
              expect(Object.is(v, -0)).toBe(false);
              expect(v).toBeGreaterThanOrEqual(-255);
              expect(v).toBeLessThanOrEqual(255);
            }
          }
        }
      }
    },
  );
});
