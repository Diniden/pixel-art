/**
 * `pixelBrushScale/kernels` — separable resampling of a signed-delta brush
 * grid (plan 13, task 07; MASTER D6, D7, D8).
 *
 * The pixel studio's Brush tool lets the user stretch a brush frame to any
 * width × height before stamping it. There is no resampler anywhere else in
 * the repo (`BrushStructureStore.resizeGrid` is a top-left crop/pad, and the
 * server's `sharp` is a PNG encoder), so this module is the one model. It
 * covers the CONVOLUTION family — the pixel-art family (EPX, Eagle, xBR, …)
 * is 2-D and lives in its sibling `pixelArt.ts`; a registry over both arrives
 * with task 09.
 *
 * ## The coverage model (D6) — why holes neither bleed nor vanish
 *
 * A `BrushCell` is `0` (unpainted) or a 4-tuple of signed deltas. Averaging a
 * painted cell with an unpainted neighbour as if the hole were `[0,0,0,0]`
 * would drag every edge delta toward zero and fill the hole with a faint
 * smear — the brush changes shape when scaled (risk R1). Instead every source
 * cell is FIVE channels `(c·d0, c·d1, c·d2, c·d3, c)` with `c = 1` painted and
 * `c = 0` unpainted, all five are resampled with the same weights, and a
 * destination cell is painted iff `c ≥ 0.5`, carrying `clampDelta(Σ / c)`.
 * Dividing by the resampled coverage un-weights the hole's contribution, so a
 * painted cell next to a hole keeps its own delta, and a hole stays a hole.
 *
 * ## Sampling conventions (D6)
 *
 *  - **Separable.** Pass 1 resamples every source row to `dstW` with
 *    `kernelX`; pass 2 resamples every column of that to `dstH` with
 *    `kernelY`. The intermediate stays in floats; rounding happens once.
 *  - **Pixel centres.** Destination index `i` maps to source coordinate
 *    `u = (i + 0.5) · src / dst − 0.5`, so a 2× upscale of `[A, B]` samples at
 *    −0.25, 0.25, 0.75, 1.25 and the two halves are symmetric.
 *  - **Minification stretches the kernel.** When `scale = src / dst > 1` the
 *    weight is evaluated at `t / scale` over a window `support · scale` wide —
 *    the standard anti-aliased downscale. `box` then becomes area averaging
 *    (exact for integer factors) and `bilinear` a triangle over the footprint.
 *  - **Clamp-to-edge.** Window indices outside `0..n−1` are clamped, so an
 *    edge cell absorbs the weight that would fall off the grid; weights are
 *    then normalised per destination sample (Σw = 1 over the window).
 *  - **Nearest is exact.** `nearest` is `floor(u + 0.5)` clamped — a single
 *    tap of weight 1 — and when BOTH axes are nearest the sampled tuple is
 *    cloned with no arithmetic at all, so integer upscales are pixel-exact
 *    and coverage stays binary.
 *  - **Identical size is a deep copy for EVERY kernel.** Mitchell–Netravali
 *    blurs even at 1:1 (`weight(0) = 8/9`), and the tool must show the brush
 *    unchanged at its native size. The short-circuit is the only reason a 1:1
 *    Mitchell request is an identity.
 *
 * ## Traps
 *
 *  - Never reach for `brushCellToRgba` / `deltaToByte` here: those are the
 *    Brush Studio's DISPLAY mapping and halve every delta around 127. Deltas
 *    are read raw and written back through `clampDelta` only.
 *  - New grids only: every output row and tuple is freshly allocated, and no
 *    two cells ever share a tuple (`BrushStructureStore.cloneCell` rule).
 *
 * Pure: no React, no MobX, no DOM, no store. Grids are `[y][x]`.
 */

import { clampDelta } from "@/types/brush";
import type { BrushCell, BrushDelta } from "@/types/brush";

export type PixelBrushKernelId =
  | "nearest"
  | "bilinear"
  | "bicubic"
  | "mitchell"
  | "lanczos2"
  | "lanczos3"
  | "box";

/** Display order (MASTER D7). */
export const PIXEL_BRUSH_KERNEL_IDS: readonly PixelBrushKernelId[] = [
  "nearest",
  "bilinear",
  "bicubic",
  "mitchell",
  "lanczos2",
  "lanczos3",
  "box",
];

export interface PixelBrushKernel {
  id: PixelBrushKernelId;
  label: string;
  /** Two-or-three-letter badge for the rail / Other Hand Mode. */
  short: string;
  /** Half-width of support in source cells at 1:1 (stretched by `src/dst` when minifying). */
  support: number;
  /** Weight at signed distance `t` (source cells) from the sample point. Even in `t`. */
  weight(t: number): number;
}

/* ── Weight functions ───────────────────────────────────────────────────── */

/**
 * Half-open box `(−0.5, 0.5]`, so the tie at `t = 0.5` lands on the SAME cell
 * `floor(u + 0.5)` picks: `idx = floor(u + 0.5)` ⇔ `−0.5 < idx − u ≤ 0.5`.
 * Shared by `nearest` and `box` — at magnification they are the same filter.
 */
function boxWeight(t: number): number {
  return t > -0.5 && t <= 0.5 ? 1 : 0;
}

function triangleWeight(t: number): number {
  return Math.max(0, 1 - Math.abs(t));
}

/**
 * Mitchell–Netravali family (B, C). Catmull-Rom is (0, ½); Mitchell's own
 * recommendation is (⅓, ⅓). Support 2 either way.
 */
function cubicBC(B: number, C: number): (t: number) => number {
  const a3 = 12 - 9 * B - 6 * C;
  const a2 = -18 + 12 * B + 6 * C;
  const a0 = 6 - 2 * B;
  const b3 = -B - 6 * C;
  const b2 = 6 * B + 30 * C;
  const b1 = -12 * B - 48 * C;
  const b0 = 8 * B + 24 * C;
  return (t) => {
    const x = Math.abs(t);
    if (x < 1) return (a3 * x * x * x + a2 * x * x + a0) / 6;
    if (x < 2) return (b3 * x * x * x + b2 * x * x + b1 * x + b0) / 6;
    return 0;
  };
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Lanczos with `a` lobes: `sinc(t) · sinc(t / a)` inside `|t| < a`. */
function lanczos(a: number): (t: number) => number {
  return (t) => {
    const x = Math.abs(t);
    return x >= a ? 0 : sinc(x) * sinc(x / a);
  };
}

export const PIXEL_BRUSH_KERNELS: Record<PixelBrushKernelId, PixelBrushKernel> =
  {
    nearest: {
      id: "nearest",
      label: "Nearest",
      short: "NN",
      support: 0.5,
      weight: boxWeight,
    },
    bilinear: {
      id: "bilinear",
      label: "Bilinear",
      short: "BIL",
      support: 1,
      weight: triangleWeight,
    },
    bicubic: {
      id: "bicubic",
      label: "Bicubic (Catmull-Rom)",
      short: "BIC",
      support: 2,
      weight: cubicBC(0, 0.5),
    },
    mitchell: {
      id: "mitchell",
      label: "Mitchell–Netravali",
      short: "MIT",
      support: 2,
      weight: cubicBC(1 / 3, 1 / 3),
    },
    lanczos2: {
      id: "lanczos2",
      label: "Lanczos 2",
      short: "LZ2",
      support: 2,
      weight: lanczos(2),
    },
    lanczos3: {
      id: "lanczos3",
      label: "Lanczos 3",
      short: "LZ3",
      support: 3,
      weight: lanczos(3),
    },
    box: {
      id: "box",
      label: "Box (area)",
      short: "BOX",
      support: 0.5,
      weight: boxWeight,
    },
  };

/* ── Taps: one normalised weight table per destination index ───────────── */

interface KernelTap {
  /** Source index, already clamped to `0..n−1`. */
  index: number;
  weight: number;
}

function clampIndex(i: number, last: number): number {
  return i < 0 ? 0 : i > last ? last : i;
}

/**
 * For every destination index `i` in `0..dstN−1`, the clamped source indices
 * that contribute and their normalised weights, per the conventions in the
 * header. `nearest` is a single tap of weight exactly 1 (no division).
 */
function buildTaps(
  kernel: PixelBrushKernel,
  srcN: number,
  dstN: number,
): KernelTap[][] {
  const ratio = srcN / dstN;
  const stretch = Math.max(ratio, 1);
  const radius = kernel.support * stretch;
  const last = srcN - 1;
  const taps: KernelTap[][] = [];
  for (let i = 0; i < dstN; i++) {
    const u = (i + 0.5) * ratio - 0.5;
    const nearest = clampIndex(Math.floor(u + 0.5), last);
    if (kernel.id === "nearest") {
      taps.push([{ index: nearest, weight: 1 }]);
      continue;
    }
    const lo = Math.ceil(u - radius);
    const hi = Math.floor(u + radius);
    const acc = new Map<number, number>();
    let sum = 0;
    for (let k = lo; k <= hi; k++) {
      const w = kernel.weight((k - u) / stretch);
      if (w === 0) continue;
      const index = clampIndex(k, last);
      acc.set(index, (acc.get(index) ?? 0) + w);
      sum += w;
    }
    if (sum === 0) {
      // Unreachable for the seven kernels above (the nearest tap always has a
      // positive weight); kept so a future kernel can never divide by zero.
      taps.push([{ index: nearest, weight: 1 }]);
      continue;
    }
    const row: KernelTap[] = [];
    for (const [index, w] of acc) row.push({ index, weight: w / sum });
    taps.push(row);
  }
  return taps;
}

/* ── Resampling ─────────────────────────────────────────────────────────── */

function cloneCell(cell: BrushCell): BrushCell {
  return cell === 0 ? 0 : [cell[0], cell[1], cell[2], cell[3]];
}

/** Five float channels per intermediate sample: `c·d0, c·d1, c·d2, c·d3, c`. */
const CHANNELS = 5;

/** Pass 1: every source row resampled to `dstW`, as `srcH × dstW × 5` floats. */
function resampleRows(
  grid: BrushCell[][],
  srcH: number,
  dstW: number,
  tapsX: KernelTap[][],
): Float64Array {
  const mid = new Float64Array(srcH * dstW * CHANNELS);
  for (let y = 0; y < srcH; y++) {
    const row = grid[y];
    for (let i = 0; i < dstW; i++) {
      const base = (y * dstW + i) * CHANNELS;
      for (const { index, weight } of tapsX[i]) {
        const cell = row[index];
        if (cell === 0) continue;
        mid[base] += weight * cell[0];
        mid[base + 1] += weight * cell[1];
        mid[base + 2] += weight * cell[2];
        mid[base + 3] += weight * cell[3];
        mid[base + 4] += weight;
      }
    }
  }
  return mid;
}

/** Pass 2: every column of `mid` resampled to `dstH`, resolved to cells. */
function resampleColumns(
  mid: Float64Array,
  dstW: number,
  dstH: number,
  tapsY: KernelTap[][],
): BrushCell[][] {
  const out: BrushCell[][] = [];
  for (let j = 0; j < dstH; j++) {
    const taps = tapsY[j];
    const row: BrushCell[] = [];
    for (let i = 0; i < dstW; i++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      let c = 0;
      for (const { index, weight } of taps) {
        const base = (index * dstW + i) * CHANNELS;
        s0 += weight * mid[base];
        s1 += weight * mid[base + 1];
        s2 += weight * mid[base + 2];
        s3 += weight * mid[base + 3];
        c += weight * mid[base + 4];
      }
      if (c < 0.5) {
        row.push(0);
        continue;
      }
      const delta: BrushDelta = [
        clampDelta(s0 / c),
        clampDelta(s1 / c),
        clampDelta(s2 / c),
        clampDelta(s3 / c),
      ];
      row.push(delta);
    }
    out.push(row);
  }
  return out;
}

/**
 * Resample `grid` (`srcH` rows × `srcW` cells) to `dstH × dstW` with
 * `kernelX` across rows and `kernelY` down columns. Always returns a new grid
 * with no tuple shared with the input; `srcW × srcH → srcW × srcH` is a deep
 * copy for every kernel (see the header). Sizes are whole cells ≥ 1.
 */
export function resamplePixelBrushGrid(
  grid: BrushCell[][],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  kernelX: PixelBrushKernelId,
  kernelY: PixelBrushKernelId,
): BrushCell[][] {
  const w = Math.max(1, Math.floor(dstW));
  const h = Math.max(1, Math.floor(dstH));
  if (w === srcW && h === srcH) {
    return grid.map((row) => row.map(cloneCell));
  }
  const tapsX = buildTaps(PIXEL_BRUSH_KERNELS[kernelX], srcW, w);
  const tapsY = buildTaps(PIXEL_BRUSH_KERNELS[kernelY], srcH, h);
  if (kernelX === "nearest" && kernelY === "nearest") {
    // Pure index mapping: the tuple is cloned, never recomputed.
    return tapsY.map(([ty]) => {
      const row = grid[ty.index];
      return tapsX.map(([tx]) => cloneCell(row[tx.index]));
    });
  }
  return resampleColumns(resampleRows(grid, srcH, w, tapsX), w, h, tapsY);
}
