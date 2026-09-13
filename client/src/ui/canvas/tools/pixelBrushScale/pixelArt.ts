/**
 * `pixelBrushScale/pixelArt` — integer-factor pixel-art scalers over a brush
 * grid (plan 13, task 08; MASTER D7, D9).
 *
 * Four classic scalers, each written from its public rule definition:
 *
 *  - **EPX / Scale2x** (2×) — the four AdvMAME2x rules on the up / right /
 *    left / down neighbours.
 *  - **Scale3x** (3×) — the nine-cell E0–E8 table from the same site.
 *  - **Eagle** (2×) — each output corner takes the source only when the three
 *    neighbours toward that corner agree.
 *  - **xBR** (2×, level-1 rule set) — Hyllian's edge-detection rule on each of
 *    the four corners of a cell, deciding whether the corner belongs to the
 *    diagonal edge formed by its two edge-adjacent neighbours and, if so,
 *    which of those two neighbours it takes.
 *
 * ## Rules every scaler here obeys
 *
 *  - Cells compare by **exact tuple equality including painted-ness**
 *    (`cellsEqual`; MASTER D9): `0` only equals `0`, and a `[0,0,0,0]` cell is
 *    a painted cell that is NOT equal to an unpainted one.
 *  - A pixel-art scaler **chooses** a source cell for every output cell; it
 *    never averages deltas. xBR's "interpolation" is the pick of the nearer
 *    of two real cells, so every delta in the output exists in the input.
 *  - Neighbours outside the grid are **clamped to the nearest edge cell**.
 *  - Every output tuple is a **fresh clone**: no output cell shares a tuple
 *    with the input or with any other output cell.
 *  - All four are invariant under the dihedral group of the square (the 8
 *    rotations and reflections); `__tests__/pixelArt.test.ts` proves it.
 *
 * ## xBR distance and tie rule
 *
 * The published xBR weighs a YUV colour difference. Here cells are signed
 * delta tuples, so the distance is the L1 sum over the four deltas plus
 * `XBR_PAINT_PENALTY` when painted-ness differs (an unpainted cell counts as
 * `[0,0,0,0]` for the L1 part). The penalty exceeds the largest possible L1
 * (4 × 510 = 2040), so a painted/unpainted pair is always farther apart than
 * any two painted cells.
 *
 * The published pick is `d(E,F) <= d(E,H) ? F : H`. That `<=` breaks the
 * transpose symmetry when the two distances tie and `F != H` (the mirrored
 * grid would pick the other cell), so the tie is resolved symmetrically: a
 * tie between equal cells picks that cell, a tie between different cells
 * keeps `E`.
 *
 * This module is pure: no MobX, no store, no API, no React.
 */
import type { BrushCell, BrushDelta } from "@/types/brush";

export type PixelBrushScalerId = "epx" | "scale3x" | "eagle" | "xbr";

export const PIXEL_BRUSH_SCALER_IDS: readonly PixelBrushScalerId[] = [
  "epx",
  "scale3x",
  "eagle",
  "xbr",
];

/** A brush grid indexed `[y][x]`, read-only from the scaler's point of view. */
export type PixelBrushGrid = ReadonlyArray<ReadonlyArray<BrushCell>>;

export interface PixelBrushScaler {
  id: PixelBrushScalerId;
  label: string;
  short: string;
  factor: 2 | 3;
  /** Scale a `w × h` grid to `w·factor × h·factor`. Output tuples are clones. */
  scale(grid: PixelBrushGrid, w: number, h: number): BrushCell[][];
}

/** Both `0`, or both tuples with four equal numbers (MASTER D9). */
export function cellsEqual(a: BrushCell, b: BrushCell): boolean {
  if (a === 0 || b === 0) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** Added to the L1 delta distance when exactly one of the two cells is painted. */
export const XBR_PAINT_PENALTY = 4096;

/**
 * xBR / hqx "colour distance" between two cells (MASTER D9): L1 over the four
 * deltas (an unpainted cell reads as `[0,0,0,0]`) plus `XBR_PAINT_PENALTY`
 * when painted-ness differs.
 */
export function cellDistance(a: BrushCell, b: BrushCell): number {
  if (a === 0) return b === 0 ? 0 : XBR_PAINT_PENALTY + l1(b, ZERO);
  if (b === 0) return XBR_PAINT_PENALTY + l1(a, ZERO);
  return l1(a, b);
}

const ZERO: BrushDelta = [0, 0, 0, 0];

function l1(a: BrushDelta, b: BrushDelta): number {
  return (
    Math.abs(a[0] - b[0]) +
    Math.abs(a[1] - b[1]) +
    Math.abs(a[2] - b[2]) +
    Math.abs(a[3] - b[3])
  );
}

function cloneCell(c: BrushCell): BrushCell {
  return c === 0 ? 0 : [c[0], c[1], c[2], c[3]];
}

/* ── Driver ────────────────────────────────────────────────────────────────── */

/** Reads a source cell at any coordinate, clamping to the nearest edge cell. */
type Sampler = (x: number, y: number) => BrushCell;

/**
 * One source cell's `factor × factor` output block, row-major, as references
 * to source cells (the driver clones them).
 */
type BlockRule = (s: Sampler, x: number, y: number) => BrushCell[];

function clampedSampler(grid: PixelBrushGrid, w: number, h: number): Sampler {
  const maxX = w - 1;
  const maxY = h - 1;
  return (x, y) => {
    const cx = x < 0 ? 0 : x > maxX ? maxX : x;
    const cy = y < 0 ? 0 : y > maxY ? maxY : y;
    return grid[cy]?.[cx] ?? 0;
  };
}

function scaleBy(
  factor: 2 | 3,
  rule: BlockRule,
  grid: PixelBrushGrid,
  w: number,
  h: number,
): BrushCell[][] {
  if (w <= 0 || h <= 0) return [];
  const s = clampedSampler(grid, w, h);
  const outW = w * factor;
  const out: BrushCell[][] = [];
  for (let y = 0; y < h * factor; y++) {
    out.push(new Array<BrushCell>(outW).fill(0));
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const block = rule(s, x, y);
      for (let i = 0; i < block.length; i++) {
        const row = out[y * factor + Math.floor(i / factor)]!;
        row[x * factor + (i % factor)] = cloneCell(block[i]!);
      }
    }
  }
  return out;
}

/* ── EPX / Scale2x ─────────────────────────────────────────────────────────── */

/**
 * Neighbours A (up), B (right), C (left), D (down) of P; outputs 1–4 are
 * top-left, top-right, bottom-left, bottom-right.
 */
const epxRule: BlockRule = (s, x, y) => {
  const p = s(x, y);
  const a = s(x, y - 1);
  const b = s(x + 1, y);
  const c = s(x - 1, y);
  const d = s(x, y + 1);
  const ca = cellsEqual(c, a);
  const ab = cellsEqual(a, b);
  const dc = cellsEqual(d, c);
  const bd = cellsEqual(b, d);
  return [
    ca && !dc && !ab ? a : p,
    ab && !ca && !bd ? b : p,
    dc && !bd && !ca ? c : p,
    bd && !ab && !dc ? d : p,
  ];
};

/* ── Scale3x ───────────────────────────────────────────────────────────────── */

/**
 * Neighbourhood
 * ```
 * A B C
 * D E F
 * G H I
 * ```
 * Outputs E0–E8 row-major.
 */
const scale3xRule: BlockRule = (s, x, y) => {
  const A = s(x - 1, y - 1);
  const B = s(x, y - 1);
  const C = s(x + 1, y - 1);
  const D = s(x - 1, y);
  const E = s(x, y);
  const F = s(x + 1, y);
  const G = s(x - 1, y + 1);
  const H = s(x, y + 1);
  const I = s(x + 1, y + 1);
  const DB = cellsEqual(D, B);
  const DH = cellsEqual(D, H);
  const BF = cellsEqual(B, F);
  const FH = cellsEqual(F, H);
  const EA = cellsEqual(E, A);
  const EC = cellsEqual(E, C);
  const EG = cellsEqual(E, G);
  const EI = cellsEqual(E, I);
  // The four corner conditions of the published table.
  const tl = DB && !DH && !BF; // D==B && D!=H && B!=F
  const tr = BF && !DB && !FH; // B==F && B!=D && F!=H
  const bl = DH && !FH && !DB; // H==D && H!=F && D!=B
  const br = FH && !BF && !DH; // F==H && F!=B && H!=D
  return [
    tl ? D : E,
    (tl && !EC) || (tr && !EA) ? B : E,
    tr ? F : E,
    (bl && !EA) || (tl && !EG) ? D : E,
    E,
    (tr && !EI) || (br && !EC) ? F : E,
    bl ? D : E,
    (br && !EG) || (bl && !EI) ? H : E,
    br ? F : E,
  ];
};

/* ── Eagle ─────────────────────────────────────────────────────────────────── */

/**
 * Neighbourhood
 * ```
 * S T U
 * V C W
 * X Y Z
 * ```
 * `1 = S if V==S==T; 2 = U if T==U==W; 3 = X if V==X==Y; 4 = Z if W==Z==Y`.
 */
const eagleRule: BlockRule = (s, x, y) => {
  const S = s(x - 1, y - 1);
  const T = s(x, y - 1);
  const U = s(x + 1, y - 1);
  const V = s(x - 1, y);
  const C = s(x, y);
  const W = s(x + 1, y);
  const X = s(x - 1, y + 1);
  const Y = s(x, y + 1);
  const Z = s(x + 1, y + 1);
  return [
    cellsEqual(V, S) && cellsEqual(S, T) ? S : C,
    cellsEqual(T, U) && cellsEqual(U, W) ? U : C,
    cellsEqual(V, X) && cellsEqual(X, Y) ? X : C,
    cellsEqual(W, Z) && cellsEqual(Z, Y) ? Z : C,
  ];
};

/* ── xBR (2×, level 1) ─────────────────────────────────────────────────────── */

/**
 * The level-1 rule for ONE corner of E, written for the bottom-right corner
 * and re-used for the other three by mirroring the offsets (`sx`, `sy` ∈ ±1).
 * The rule is invariant under the F↔H transpose, so mirroring is exact.
 *
 * ```
 *          B1
 *       A  B  C
 *    D0 D  E  F  F4
 *    G0 G  H  I  I4
 *          H5 I5
 * ```
 *
 * Edge strength along the H–F diagonal
 *   `e = d(E,C) + d(E,G) + d(I,H5) + d(I,F4) + 4·d(H,F)`
 * against the E–I diagonal
 *   `i = d(H,D) + d(H,I5) + d(F,I4) + d(F,B) + 4·d(E,I)`.
 * `e < i` ⇒ the corner lies on an H–F edge and takes the nearer of F and H.
 */
function xbrCorner(
  s: Sampler,
  x: number,
  y: number,
  sx: 1 | -1,
  sy: 1 | -1,
): BrushCell {
  const at = (dx: number, dy: number) => s(x + sx * dx, y + sy * dy);
  const E = at(0, 0);
  const B = at(0, -1);
  const C = at(1, -1);
  const D = at(-1, 0);
  const F = at(1, 0);
  const G = at(-1, 1);
  const H = at(0, 1);
  const I = at(1, 1);
  const F4 = at(2, 0);
  const I4 = at(2, 1);
  const H5 = at(0, 2);
  const I5 = at(1, 2);
  const e =
    cellDistance(E, C) +
    cellDistance(E, G) +
    cellDistance(I, H5) +
    cellDistance(I, F4) +
    4 * cellDistance(H, F);
  const i =
    cellDistance(H, D) +
    cellDistance(H, I5) +
    cellDistance(F, I4) +
    cellDistance(F, B) +
    4 * cellDistance(E, I);
  if (e >= i) return E;
  const ef = cellDistance(E, F);
  const eh = cellDistance(E, H);
  if (ef < eh) return F;
  if (eh < ef) return H;
  return cellsEqual(F, H) ? F : E;
}

const xbrRule: BlockRule = (s, x, y) => [
  xbrCorner(s, x, y, -1, -1),
  xbrCorner(s, x, y, 1, -1),
  xbrCorner(s, x, y, -1, 1),
  xbrCorner(s, x, y, 1, 1),
];

/* ── Registry ──────────────────────────────────────────────────────────────── */

export const PIXEL_BRUSH_SCALERS: Record<PixelBrushScalerId, PixelBrushScaler> =
  {
    epx: {
      id: "epx",
      label: "EPX / Scale2x",
      short: "EPX",
      factor: 2,
      scale: (grid, w, h) => scaleBy(2, epxRule, grid, w, h),
    },
    scale3x: {
      id: "scale3x",
      label: "Scale3x",
      short: "S3X",
      factor: 3,
      scale: (grid, w, h) => scaleBy(3, scale3xRule, grid, w, h),
    },
    eagle: {
      id: "eagle",
      label: "Eagle",
      short: "EGL",
      factor: 2,
      scale: (grid, w, h) => scaleBy(2, eagleRule, grid, w, h),
    },
    xbr: {
      id: "xbr",
      label: "xBR",
      short: "XBR",
      factor: 2,
      scale: (grid, w, h) => scaleBy(2, xbrRule, grid, w, h),
    },
  };
