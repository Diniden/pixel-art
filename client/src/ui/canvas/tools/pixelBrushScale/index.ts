/**
 * `pixelBrushScale` — the strategy registry and the layer-scaling pipeline
 * (plan 13, task 09; MASTER D7, D10, D12).
 *
 * Two families of scaler live in this folder: the separable convolution
 * kernels of `kernels.ts` (one per axis) and the integer-factor pixel-art
 * scalers of `pixelArt.ts` (inherently 2-D). This module is the one place the
 * UI reads them from — `PIXEL_BRUSH_SCALE_OPTIONS` is the dropdown / thumb
 * list, kernels first in task 07's order, then the pixel-art scalers in task
 * 08's order — and the one function that scales a brush frame's layers to a
 * target size with a strategy per axis.
 *
 * ## The pipeline (D10)
 *
 *  - **Identical size** → `resamplePixelBrushGrid` with `nearest`, which is a
 *    deep copy for every kernel. At the layer level the identity request
 *    returns the SAME `layers` array (reference equality) so the stamp memo in
 *    `usePixelBrush` (task 12) stays stable at native size.
 *  - **Both axes kernels** → the separable resampler, `x` across rows and `y`
 *    down columns.
 *  - **A 2-D id on either axis** → the pixel-art path. The store guarantees
 *    both axes hold the same 2-D id, but it is resolved defensively (`x`'s
 *    id, else `y`'s). With `need = max(dstW / srcW, dstH / srcH)`:
 *    `need ≤ 1` → nearest only (a pixel-art scaler never minifies); otherwise
 *    `passes = need > factor ? 2 : 1` of the scaler (so a 2× scaler reaches
 *    4× and Scale3x 9× at most), then `nearest` to the exact `dstW × dstH`.
 *
 * Pure: no React, no MobX, no DOM, no store. Grids are `[y][x]`.
 */

import type { BrushCell } from "@/types/brush";
import {
  PIXEL_BRUSH_KERNEL_IDS,
  PIXEL_BRUSH_KERNELS,
  resamplePixelBrushGrid,
} from "./kernels";
import type { PixelBrushKernelId } from "./kernels";
import { PIXEL_BRUSH_SCALER_IDS, PIXEL_BRUSH_SCALERS } from "./pixelArt";
import type { PixelBrushGrid, PixelBrushScalerId } from "./pixelArt";

export type { PixelBrushKernelId } from "./kernels";
export type { PixelBrushScalerId } from "./pixelArt";

/* ── Registry ──────────────────────────────────────────────────────────────── */

export type PixelBrushScaleStrategy = PixelBrushKernelId | PixelBrushScalerId;

export interface PixelBrushScaleOption {
  id: PixelBrushScaleStrategy;
  label: string;
  /** Two-or-three-letter badge for the rail / Other Hand Mode. */
  short: string;
  /** `kernel` = per-axis convolution; `pixel-art` = 2-D integer-factor scaler. */
  group: "kernel" | "pixel-art";
}

/** Kernels first, in task 07's order, then the pixel-art scalers in task 08's order (D7). */
export const PIXEL_BRUSH_SCALE_OPTIONS: ReadonlyArray<PixelBrushScaleOption> = [
  ...PIXEL_BRUSH_KERNEL_IDS.map((id): PixelBrushScaleOption => {
    const k = PIXEL_BRUSH_KERNELS[id];
    return { id, label: k.label, short: k.short, group: "kernel" };
  }),
  ...PIXEL_BRUSH_SCALER_IDS.map((id): PixelBrushScaleOption => {
    const s = PIXEL_BRUSH_SCALERS[id];
    return { id, label: s.label, short: s.short, group: "pixel-art" };
  }),
];

export const DEFAULT_PIXEL_BRUSH_SCALE: PixelBrushScaleStrategy = "nearest";

const SCALER_ID_SET: ReadonlySet<string> = new Set(PIXEL_BRUSH_SCALER_IDS);
const STRATEGY_ID_SET: ReadonlySet<string> = new Set(
  PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.id),
);

/** `true` for the pixel-art (2-D) scalers; `false` for the per-axis kernels. */
export function isPixelBrush2DStrategy(
  id: PixelBrushScaleStrategy,
): id is PixelBrushScalerId {
  return SCALER_ID_SET.has(id);
}

/** Runtime guard for values read from untrusted places (URL state, old UI state). */
export function isPixelBrushScaleStrategy(
  v: unknown,
): v is PixelBrushScaleStrategy {
  return typeof v === "string" && STRATEGY_ID_SET.has(v);
}

/* ── Pipeline ──────────────────────────────────────────────────────────────── */

export interface PixelBrushScaleRequest {
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
  x: PixelBrushScaleStrategy;
  y: PixelBrushScaleStrategy;
}

/** Whole cells, at least one — the same normalisation the kernels apply. */
function wholeSize(n: number): number {
  return Math.max(1, Math.floor(n));
}

function isIdentity(req: PixelBrushScaleRequest): boolean {
  return wholeSize(req.dstW) === req.srcW && wholeSize(req.dstH) === req.srcH;
}

/**
 * The kernels never mutate their input, but their signature is the mutable
 * `BrushCell[][]`; a read-only grid is handed through unchanged.
 */
function nearest(
  grid: PixelBrushGrid,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): BrushCell[][] {
  return resamplePixelBrushGrid(
    grid as BrushCell[][],
    srcW,
    srcH,
    dstW,
    dstH,
    "nearest",
    "nearest",
  );
}

/** The 2-D path of D10: `passes` of the scaler, then nearest to the exact size. */
function scalePixelArt(
  grid: PixelBrushGrid,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  id: PixelBrushScalerId,
): BrushCell[][] {
  const need = Math.max(dstW / srcW, dstH / srcH);
  if (need <= 1) return nearest(grid, srcW, srcH, dstW, dstH);
  const scaler = PIXEL_BRUSH_SCALERS[id];
  const passes = need > scaler.factor ? 2 : 1;
  let cur: PixelBrushGrid = grid;
  let w = srcW;
  let h = srcH;
  for (let p = 0; p < passes; p++) {
    cur = scaler.scale(cur, w, h);
    w *= scaler.factor;
    h *= scaler.factor;
  }
  return nearest(cur, w, h, dstW, dstH);
}

/**
 * Scale one `srcW × srcH` grid to `dstW × dstH` per `req` (see the header).
 * Always returns a new grid sharing no row or tuple with the input; an empty
 * source yields an empty grid.
 */
export function scalePixelBrushGrid(
  grid: PixelBrushGrid,
  req: PixelBrushScaleRequest,
): BrushCell[][] {
  const { srcW, srcH, x, y } = req;
  if (srcW <= 0 || srcH <= 0) return [];
  const dstW = wholeSize(req.dstW);
  const dstH = wholeSize(req.dstH);
  if (dstW === srcW && dstH === srcH) {
    return nearest(grid, srcW, srcH, srcW, srcH);
  }
  const twoD = isPixelBrush2DStrategy(x)
    ? x
    : isPixelBrush2DStrategy(y)
      ? y
      : null;
  if (twoD === null) {
    return resamplePixelBrushGrid(
      grid as BrushCell[][],
      srcW,
      srcH,
      dstW,
      dstH,
      x as PixelBrushKernelId,
      y as PixelBrushKernelId,
    );
  }
  return scalePixelArt(grid, srcW, srcH, dstW, dstH, twoD);
}

/**
 * Scale every layer's `pixels`, keeping the rest of each layer by spread. An
 * identity request returns `layers` ITSELF — reference equality is what the
 * `usePixelBrush` memo (task 12) keys its stamp stability on (risk R9).
 */
export function scalePixelBrushLayers<
  L extends { pixels: ReadonlyArray<ReadonlyArray<BrushCell>> },
>(layers: ReadonlyArray<L>, req: PixelBrushScaleRequest): ReadonlyArray<L> {
  if (isIdentity(req)) return layers;
  return layers.map((layer) => ({
    ...layer,
    pixels: scalePixelBrushGrid(layer.pixels, req),
  }));
}
