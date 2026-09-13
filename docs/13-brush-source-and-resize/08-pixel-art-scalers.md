# 08 — `pixelBrushScale/pixelArt.ts`: EPX/Scale2x, Scale3x, Eagle, xBR

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/tools/pixelBrushScale/pixelArt.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/__tests__/pixelArt.test.ts` (new)
**Effort:** M

## Objective
The integer-factor pixel-art scalers exist as pure functions over `BrushCell[][]`:
**EPX / Scale2x** (2×), **Scale3x** (3×), **Eagle** (2×) and **xBR** (2×, the level-1 rule
set). They compare cells by exact tuple equality (painted-ness included), never blend
deltas, and are verified by the dihedral symmetry every one of these algorithms has.
No registry or consumer yet (task 09).

## Context
- Grid type and rules as task 07 (`BrushCell`, cloned tuples, pure, node lane, `max-lines`
  error at 400 code lines under `src/ui/**` — split into `pixelArtXbr.ts` if xBR pushes
  this file over; report it).
- Algorithms (from the public descriptions; write them from the rules, not from memory of
  someone's source):
  - **EPX/Scale2x** — for P with neighbours A(up) B(right) C(left) D(down):
    `1=P 2=P 3=P 4=P; if C==A && C!=D && A!=B → 1=A; if A==B && A!=C && B!=D → 2=B; if D==C && D!=B && C!=A → 3=C; if B==D && B!=A && D!=C → 4=D`.
  - **Scale3x** — the 3×3 output rules from the same site (the 9-cell table with the
    E0–E8 conditions).
  - **Eagle** — `1 = (C==A && A==... )` per the classic definition: each output corner
    takes the source pixel only if the three neighbours toward that corner are equal.
  - **xBR (2×, lv1)** — the edge-detection rule on the 4 corners using the YUV-weighted
    colour distance; here the "distance" is the L1 distance over the four deltas plus a
    large penalty when painted-ness differs (MASTER D9); interpolate by **choosing** a
    source cell, never by blending (deltas must stay from real cells).
- Equality helper: `cellsEqual(a, b)` = both `0`, or both tuples with four equal numbers.
- Edge handling: clamp-to-edge neighbours (outside = the nearest cell).

## Steps
1. `pixelArt.ts` exporting:
   ```ts
   export type PixelBrushScalerId = "epx" | "scale3x" | "eagle" | "xbr";
   export const PIXEL_BRUSH_SCALER_IDS: readonly PixelBrushScalerId[];
   export interface PixelBrushScaler { id; label: string; short: string; factor: 2 | 3; scale(grid: ReadonlyArray<ReadonlyArray<BrushCell>>, w: number, h: number): BrushCell[][] }
   export const PIXEL_BRUSH_SCALERS: Record<PixelBrushScalerId, PixelBrushScaler>;
   export function cellsEqual(a: BrushCell, b: BrushCell): boolean;
   ```
   Labels / shorts (MASTER D7): EPX / Scale2x `EPX`, Scale3x `S3X`, Eagle `EGL`, xBR `XBR`.
2. Implement the four scalers; output tuples are **clones** of the chosen source tuples.
3. Tests (`__tests__/pixelArt.test.ts`):
   - flat grid → block-replicated output for every scaler;
   - a single diagonal line 3×3 → EPX output equals the hand-drawn 6×6 (write the expected
     grid literally in the test); Scale3x → the 9×9; Eagle → its 6×6; xBR → its 6×6;
   - **dihedral symmetry** for every scaler: `scale(T(g)) == T(scale(g))` for the 8
     transforms (identity, rot90/180/270, flipX, flipY, both diagonals) over a few random
     seeded grids (use a tiny LCG, no `Math.random`) — this is the strong self-check
     (MASTER §8);
   - no shared tuple references between input and output, or between output cells;
   - painted vs unpainted with equal deltas are *not* equal (`cellsEqual([0,0,0,0], 0) === false`).
4. Commit: `brush-scale(08): EPX, Scale3x, Eagle, xBR pixel-art scalers`.

## Constraints
- Pure; no imports from `kernels.ts` or `pixelBrushStamp.ts`; do not touch existing files.
- Never average deltas here — a pixel-art scaler picks, it does not blend.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools/pixelBrushScale && bunx vitest run src/ui/canvas/tools/pixelBrushScale
```

## Definition of done
- [ ] Four scalers exported with `factor`, labels, shorts; `cellsEqual` exported.
- [ ] Hand-drawn expected outputs and the 8-transform symmetry test pass for all four.
- [ ] Under the `max-lines` limit (or split and reported).
