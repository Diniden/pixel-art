/**
 * `pixelBrushScale/hqx` — hq2x over a brush grid (plan 13, task 10; MASTER
 * D7, D9, R3).
 *
 * hq2x reads the 3×3 neighbourhood of every source cell, turns "which of the
 * eight neighbours differ from the centre" into an 8-bit pattern, and looks
 * the pattern up in a 256-row table that names, for each of the four output
 * sub-pixels, a weighted blend over the centre and that corner's three
 * neighbours. The table is data in `hqxTable.ts` (its header documents the
 * row format and the blend variants); this module decodes it once at load
 * and runs it.
 *
 * ## How the published algorithm maps onto delta cells
 *
 *  - **Different.** The original compares YUV against per-channel thresholds
 *    (Y 48, U 7, V 6 of 255). Cells here are signed delta tuples, so two
 *    cells are different when task 08's `cellDistance` — L1 over the four
 *    deltas plus `XBR_PAINT_PENALTY` when painted-ness differs — exceeds
 *    `HQ2X_DIFF_THRESHOLD`. The threshold keeps the original's luminance
 *    tolerance (48) as an L1 budget over all four deltas; a painted cell and
 *    a hole are always different, and `cellDistance` is 0 exactly when
 *    `cellsEqual`.
 *  - **Blend.** The original's `Interp` functions are integer-weighted
 *    averages of colours (3:1, 2:1:1, 5:2:1, 6:1:1, 2:3:3, 14:1:1). Here they
 *    are the same weighted averages of the deltas, rounded to the nearest
 *    integer, **only when every chosen cell is painted**. A blend that would
 *    touch an unpainted cell copies the heaviest chosen cell instead — the
 *    centre in every variant but 2:3:3, whose two side cells tie: the tie
 *    copies that cell when the two are equal and the centre otherwise, so a
 *    mirrored grid makes the same choice. A painted cell is never averaged
 *    with a hole.
 *  - **Edges.** Neighbours outside the grid clamp to the nearest edge cell,
 *    exactly as the original duplicates its border pixels.
 *  - Every output tuple is a fresh clone; the input is never mutated.
 *
 * hq2x is invariant under the dihedral group of the square. That is the
 * self-check on the table: `__tests__/hqx.test.ts` runs the 8-transform
 * symmetry suite, and a single wrong row fails it.
 *
 * This module is pure: no MobX, no store, no API, no React.
 */
import type { BrushCell, BrushDelta } from "@/types/brush";
import { HQ2X_TABLE } from "./hqxTable";
import { cellDistance, cellsEqual } from "./pixelArt";
import type { PixelBrushGrid, PixelBrushScaler } from "./pixelArt";

export type PixelBrushHqxId = "hq2x";

/** Task 08's scaler shape with this family's id (its `id` union is closed). */
export interface PixelBrushHqxScaler extends Omit<PixelBrushScaler, "id"> {
  id: PixelBrushHqxId;
}

/** Two cells are "different" when their `cellDistance` exceeds this. */
export const HQ2X_DIFF_THRESHOLD = 48;

function differ(a: BrushCell, b: BrushCell): boolean {
  return cellDistance(a, b) > HQ2X_DIFF_THRESHOLD;
}

/* ── Table decoding ────────────────────────────────────────────────────────── */

/** Blend weights over `[E, p, q, d]` (see `hqxTable.ts`). */
type Weights = readonly [number, number, number, number];

const VARIANTS: Readonly<Record<string, Weights>> = {
  "0": [1, 0, 0, 0],
  "10": [3, 0, 0, 1],
  "11": [3, 1, 0, 0],
  "12": [3, 0, 1, 0],
  "20": [2, 1, 1, 0],
  "21": [2, 0, 1, 1],
  "22": [2, 1, 0, 1],
  "60": [5, 1, 2, 0],
  "61": [5, 2, 1, 0],
  "70": [6, 1, 1, 0],
  "90": [2, 3, 3, 0],
  "100": [14, 1, 1, 0],
};

interface QuadrantRule {
  /** Corner whose edge pair is tested, or `-1` when unconditional. */
  corner: number;
  /** Weights when that pair is different. */
  diff: Weights;
  /** Weights when it is not (and the only weights when unconditional). */
  same: Weights;
}

type CaseRule = readonly [
  QuadrantRule,
  QuadrantRule,
  QuadrantRule,
  QuadrantRule,
];

function variant(name: string, entry: string): Weights {
  const w = VARIANTS[name];
  if (w === undefined) throw new Error(`hq2x table: bad variant in "${entry}"`);
  return w;
}

function decodeQuadrant(token: string, entry: string): QuadrantRule {
  if (!token.startsWith("?")) {
    const w = variant(token, entry);
    return { corner: -1, diff: w, same: w };
  }
  const parts = token.slice(1).split(":");
  const corner = Number(parts[0]);
  if (parts.length !== 3 || !(corner >= 0 && corner <= 3)) {
    throw new Error(`hq2x table: bad conditional in "${entry}"`);
  }
  return {
    corner,
    diff: variant(parts[1]!, entry),
    same: variant(parts[2]!, entry),
  };
}

function decodeCase(entry: string): CaseRule {
  const tokens = entry.split("|");
  if (tokens.length !== 4) throw new Error(`hq2x table: bad row "${entry}"`);
  return [
    decodeQuadrant(tokens[0]!, entry),
    decodeQuadrant(tokens[1]!, entry),
    decodeQuadrant(tokens[2]!, entry),
    decodeQuadrant(tokens[3]!, entry),
  ];
}

if (HQ2X_TABLE.length !== 256) {
  throw new Error(`hq2x table: ${HQ2X_TABLE.length} rows, expected 256`);
}

const RULES: readonly CaseRule[] = HQ2X_TABLE.map(decodeCase);

/* ── Neighbourhood geometry ────────────────────────────────────────────────── */

/**
 * The 3×3 neighbourhood is read row-major into nine slots:
 * ```
 *   0 1 2      w1 w2 w3
 *   3 4 5   =  w4 E  w6
 *   6 7 8      w7 w8 w9
 * ```
 */
const CENTRE = 4;

/** Slot of the neighbour behind pattern bit `b` (w1 w2 w3 w4 w6 w7 w8 w9). */
const BIT_SLOT: readonly number[] = [0, 1, 2, 3, 5, 6, 7, 8];

interface Corner {
  /** Edge neighbour before the corner, clockwise. */
  p: number;
  /** The diagonal neighbour. */
  d: number;
  /** Edge neighbour after the corner, clockwise. */
  q: number;
}

/** TL, TR, BL, BR — the output sub-pixels in row-major order. */
const CORNERS: readonly Corner[] = [
  { p: 3, d: 0, q: 1 },
  { p: 1, d: 2, q: 5 },
  { p: 7, d: 6, q: 3 },
  { p: 5, d: 8, q: 7 },
];

/* ── Blending ──────────────────────────────────────────────────────────────── */

function cloneCell(c: BrushCell): BrushCell {
  return c === 0 ? 0 : [c[0], c[1], c[2], c[3]];
}

type Chosen = readonly [BrushCell, BrushCell, BrushCell, BrushCell];

/** Weighted average of painted cells, rounded; never yields `-0`. */
function blend(wts: Weights, cells: Chosen, total: number): BrushDelta {
  const out: BrushDelta = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch++) {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const w = wts[i]!;
      if (w !== 0) sum += w * (cells[i] as BrushDelta)[ch];
    }
    const v = Math.round(sum / total);
    out[ch] = v === 0 ? 0 : v;
  }
  return out;
}

/** Apply one variant's weights to `[E, p, q, d]` (see the header). */
function resolve(wts: Weights, cells: Chosen): BrushCell {
  let total = 0;
  let hole = false;
  for (let i = 0; i < 4; i++) {
    const w = wts[i]!;
    if (w === 0) continue;
    total += w;
    if (cells[i] === 0) hole = true;
  }
  if (!hole) return blend(wts, cells, total);
  let best = 0;
  let ties = 0;
  for (let i = 1; i < 4; i++) {
    if (wts[i]! > wts[best]!) {
      best = i;
      ties = 0;
    } else if (wts[i] === wts[best]) {
      ties++;
    }
  }
  if (ties === 0) return cloneCell(cells[best]!);
  // Only 2:3:3 ties, between p and q.
  return cloneCell(cellsEqual(cells[1], cells[2]) ? cells[1] : cells[0]);
}

/* ── The scaler ────────────────────────────────────────────────────────────── */

/** hq2x: scale a `w × h` grid to `2w × 2h`. Output tuples are clones. */
export function hq2x(
  grid: PixelBrushGrid,
  w: number,
  h: number,
): BrushCell[][] {
  if (w <= 0 || h <= 0) return [];
  const maxX = w - 1;
  const maxY = h - 1;
  const out: BrushCell[][] = [];
  for (let y = 0; y < h * 2; y++) out.push(new Array<BrushCell>(w * 2).fill(0));
  const n: BrushCell[] = new Array<BrushCell>(9).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let slot = 0; slot < 9; slot++) {
        const nx = x + (slot % 3) - 1;
        const ny = y + Math.floor(slot / 3) - 1;
        const cx = nx < 0 ? 0 : nx > maxX ? maxX : nx;
        const cy = ny < 0 ? 0 : ny > maxY ? maxY : ny;
        n[slot] = grid[cy]?.[cx] ?? 0;
      }
      const e = n[CENTRE]!;
      let pattern = 0;
      for (let b = 0; b < 8; b++) {
        if (differ(e, n[BIT_SLOT[b]!]!)) pattern |= 1 << b;
      }
      const rule = RULES[pattern]!;
      for (let k = 0; k < 4; k++) {
        const r = rule[k]!;
        let wts = r.same;
        if (r.corner >= 0) {
          const t = CORNERS[r.corner]!;
          if (differ(n[t.p]!, n[t.q]!)) wts = r.diff;
        }
        const c = CORNERS[k]!;
        out[y * 2 + (k >> 1)]![x * 2 + (k & 1)] = resolve(wts, [
          e,
          n[c.p]!,
          n[c.q]!,
          n[c.d]!,
        ]);
      }
    }
  }
  return out;
}

export const PIXEL_BRUSH_HQ2X: PixelBrushHqxScaler = {
  id: "hq2x",
  label: "hq2x",
  short: "HQ2",
  factor: 2,
  scale: hq2x,
};
