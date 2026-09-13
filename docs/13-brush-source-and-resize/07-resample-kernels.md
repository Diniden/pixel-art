# 07 — `pixelBrushScale/kernels.ts`: separable resampling of a signed-delta grid

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/tools/pixelBrushScale/kernels.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/__tests__/kernels.test.ts` (new)
**Effort:** L

## Objective
A pure module resamples a `BrushCell[][]` grid to any width × height with a **separable
kernel per axis** — nearest, bilinear (triangle), bicubic (Catmull-Rom), Mitchell–Netravali,
Lanczos-2, Lanczos-3, box (area average) — treating unpainted cells as zero-coverage so holes
neither bleed nor vanish. Every output delta is clamped through `clampDelta`; identical
size returns an exact copy. No registry or consumer yet (task 09).

## Context
- Grid type: `client/src/types/brush.ts` — `BrushCell = BrushDelta | 0`, `BrushDelta`
  is a 4-tuple in −255..255, `clampDelta` `:76` (rounds, clamps, folds `NaN`/`−0`).
  `ui/canvas/tools` may import `@/types/brush` (precedent `pixelBrushStamp.ts:60`).
- **There is no resampler anywhere in the repo.** `BrushStructureStore.ts:91` `resizeGrid`
  is a top-left crop/pad — not a model. Server `sharp` is a PNG encoder only and off-limits.
- Conventions: `pixelBrushStamp.ts` header style (why it exists, the traps); pure — no
  React/MobX/DOM/store; new grids, never in-place mutation; no two cells share a tuple
  (`BrushStructureStore.ts:78` `cloneCell` rule). Node-lane test (`*.test.ts`, not `.dom`).
- `max-lines` is an **error at 400 code lines** under `src/ui/**` — this folder is split by
  family for that reason (MASTER D8). Keep this file under the limit; a second file
  `kernelWeights.ts` for the weight functions is allowed if needed (report it).
- Test fixtures to re-declare locally: `pixelBrushStamp.test.ts:28-63` (`grid`, `paint`).
  Expected values hand-computed with the arithmetic inline (that file's header `:1-11`).

## Steps
1. Create `kernels.ts` exporting:
   ```ts
   export type PixelBrushKernelId = "nearest" | "bilinear" | "bicubic" | "mitchell" | "lanczos2" | "lanczos3" | "box";
   export const PIXEL_BRUSH_KERNEL_IDS: readonly PixelBrushKernelId[];
   export interface PixelBrushKernel { id; label: string; short: string; /** half-width of support in source cells at 1:1 */ support: number; weight(t: number): number }
   export const PIXEL_BRUSH_KERNELS: Record<PixelBrushKernelId, PixelBrushKernel>;
   export function resamplePixelBrushGrid(grid, srcW, srcH, dstW, dstH, kernelX: PixelBrushKernelId, kernelY: PixelBrushKernelId): BrushCell[][];
   ```
   Labels / shorts (MASTER D7): Nearest `NN`, Bilinear `BIL`, Bicubic (Catmull-Rom) `BIC`,
   Mitchell–Netravali `MIT`, Lanczos 2 `LZ2`, Lanczos 3 `LZ3`, Box (area) `BOX`.
2. Coverage model (MASTER D6): each source cell is five channels `(c·d0, c·d1, c·d2, c·d3, c)`
   with `c = 1` painted, `0` unpainted. Resample all five; a destination cell is painted iff
   `c ≥ 0.5`, with deltas `clampDelta(Σ/c)`. Pass 1 resamples rows to `dstW` with `kernelX`,
   pass 2 columns to `dstH` with `kernelY`. Pixel-centre convention: destination centre `i`
   maps to source `u = (i + 0.5) · src/dst − 0.5`. Minification: when `scale = src/dst > 1`
   stretch the kernel (`weight((t)/scale)`, support × scale) — the standard anti-aliased
   downscale; `box` then becomes area averaging. Normalise weights per output sample
   (Σw = 1 over the clamped window); edge handling = clamp-to-edge indices.
3. `nearest`: exact copy of the sampled cell (`floor(u + 0.5)` clamped), tuple cloned — no
   arithmetic, so integer upscales are pixel-exact and coverage is binary.
4. Short-circuit: `dstW === srcW && dstH === srcH` → deep copy (`cloneCell` per cell) for
   **every** kernel, documented: Mitchell blurs even at 1:1, and the tool must show the brush
   unchanged at its native size.
5. Tests (`__tests__/kernels.test.ts`), each with the arithmetic inline:
   - identity for every kernel returns equal-but-not-same grids (no shared tuples);
   - nearest 2× of a 2×2 checker → the 4×4 block pattern; nearest 3→2 picks centres;
   - bilinear 1-D case: `[100, 0]` → width 4 gives `100, 75, 25, 0`? — compute with the
     centre convention (`u = −0.25, 0.25, 0.75, 1.25` → clamped weights) and pin the actual
     numbers; then the 2-D separability (`rows then cols == cols then rows` for symmetric
     input);
   - coverage: a single painted cell among unpainted neighbours upscaled 2× bilinear yields
     a painted 2×2 core with the source delta (not a quarter of it) and unpainted ring;
   - bicubic / lanczos overshoot: a step `[−255 … 255]` produces values that would exceed
     ±255 before clamp; assert every output is within range and integer;
   - box 4→2 averages `[10, 20, 30, 40]` → `[15, 35]`; box 2→4 equals nearest;
   - Mitchell 1:1 identity holds only via the short-circuit (assert a 1-D 3→3 direct call of
     the weight sum ≠ identity to document why);
   - kernelX ≠ kernelY: nearest on X and box on Y produce different rows/cols as expected;
   - `clampDelta` invariants: no `−0`, no non-integers in any output.
6. Commit: `brush-scale(07): separable kernels with a coverage channel`.

## Constraints
- Pure; no imports from `pixelBrushStamp.ts`. Do not touch any existing file.
- Do not use `brushCellToRgba`/`deltaToByte` (display-only, halve the deltas).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools/pixelBrushScale && bunx vitest run src/ui/canvas/tools/pixelBrushScale
```

## Definition of done
- [ ] Seven kernels exported with labels/shorts; `resamplePixelBrushGrid` separable per axis.
- [ ] Coverage model, centre convention, minification stretch and clamp-to-edge as specified and documented in the header.
- [ ] Tests in step 5 present, hand-computed, green; file under the `max-lines` limit.
