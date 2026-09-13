# 09 — `pixelBrushScale/index.ts`: the strategy registry and the layer pipeline

**Wave:** W2 · **Depends on:** 07, 08
**Touches:** `client/src/ui/canvas/tools/pixelBrushScale/index.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/__tests__/index.test.ts` (new)
**Effort:** S

## Objective
One registry lists every scaling strategy the UI can offer, grouped as per-axis kernels or
2-D pixel-art scalers, and one function scales a brush frame's layers to a target size with
a strategy per axis — running a 2-D scaler at the right integer factor and finishing with
nearest to the exact size. The identity case returns the very same layer array.

## Context
- Task 07 exports `PIXEL_BRUSH_KERNELS`, `resamplePixelBrushGrid`; task 08 exports
  `PIXEL_BRUSH_SCALERS` (`factor: 2 | 3`).
- Consumers: `usePixelBrush` (task 12) passes `frame.layers` (real `BrushLayer`s, which are
  `PixelBrushSourceLayer`-compatible, task 05) and needs back the same structural shape with
  scaled `pixels`; the rail (task 13) and the other-hand widgets (task 14) need the option
  list with labels and shorts.
- `max-lines` error at 400 under `src/ui/**` (this file will be small).

## Steps
1. `index.ts`:
   ```ts
   export type PixelBrushScaleStrategy = PixelBrushKernelId | PixelBrushScalerId;
   export interface PixelBrushScaleOption { id: PixelBrushScaleStrategy; label: string; short: string; group: "kernel" | "pixel-art" }
   export const PIXEL_BRUSH_SCALE_OPTIONS: ReadonlyArray<PixelBrushScaleOption>; // kernels first, in task 07 order, then scalers in task 08 order
   export const DEFAULT_PIXEL_BRUSH_SCALE: PixelBrushScaleStrategy = "nearest";
   export function isPixelBrush2DStrategy(id: PixelBrushScaleStrategy): id is PixelBrushScalerId;
   export function isPixelBrushScaleStrategy(v: unknown): v is PixelBrushScaleStrategy;
   export interface PixelBrushScaleRequest { srcW; srcH; dstW; dstH; x: PixelBrushScaleStrategy; y: PixelBrushScaleStrategy }
   export function scalePixelBrushGrid(grid, req): BrushCell[][];
   export function scalePixelBrushLayers<L extends { pixels: ReadonlyArray<ReadonlyArray<BrushCell>> }>(layers: ReadonlyArray<L>, req): ReadonlyArray<L>;
   ```
   Re-export the kernel and scaler id types.
2. `scalePixelBrushGrid` (MASTER D10): if `dstW === srcW && dstH === srcH` → deep copy via
   `resamplePixelBrushGrid` nearest. Else if neither axis is 2-D → separable kernels. Else
   (a 2-D id on either axis — the store guarantees both hold the same id, but resolve
   defensively: use the 2-D id from `x`, else `y`): `need = max(dstW/srcW, dstH/srcH)`;
   if `need <= 1` → nearest only; else with `f = scaler.factor`: passes = `need > f ? 2 : 1`
   (so 2× scalers give 4× and Scale3x gives 9× at most), then `nearest` to the exact
   `dstW × dstH`.
3. `scalePixelBrushLayers`: identity request → **return `layers` itself** (reference
   equality; the memo in task 12 depends on it). Otherwise map each layer to
   `{ ...layer, pixels: scalePixelBrushGrid(layer.pixels, req) }`.
4. Tests: option list has 11 entries with unique ids/shorts, kernels before pixel-art;
   guards; identity returns the same array; kernel path calls through (a 2×2 → 4×4 nearest
   equals task 07's answer); 2-D path: EPX from 3×3 to 5×5 = one pass to 6×6 then nearest
   down; to 12×12 = two passes; to 2×2 = nearest only; mixed `x: "epx", y: "bilinear"`
   resolves to the 2-D path.
5. Commit: `brush-scale(09): strategy registry + scalePixelBrushLayers pipeline`.

## Constraints
- Pure. Do not touch tasks 07/08's files (extend only via imports). Do not edit `pixelBrushStamp.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools/pixelBrushScale && bunx vitest run src/ui/canvas/tools/pixelBrushScale
```

## Definition of done
- [ ] Registry of 11 options, defaults, guards and the pipeline exported from `pixelBrushScale/index.ts`.
- [ ] Identity returns the same layer array; 2-D pass counts as specified; tests green.
