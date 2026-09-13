# 10 — `pixelBrushScale/hqx.ts`: hq2x, registered as a 2-D strategy

**Wave:** W3 · **Depends on:** 09
**Touches:** `client/src/ui/canvas/tools/pixelBrushScale/hqx.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/hqxTable.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/__tests__/hqx.test.ts` (new) · `client/src/ui/canvas/tools/pixelBrushScale/index.ts` (created by task 09) · `client/src/ui/canvas/tools/pixelBrushScale/__tests__/index.test.ts` (created by task 09)
**Effort:** L

## Objective
hq2x is available as the twelfth strategy (`id: "hq2x"`, label `hq2x`, short `HQ2`,
`factor: 2`, group `pixel-art`). If a faithful, symmetry-verified hq2x cannot be completed
inside this task, the strategy is **not registered**, the partial files are not committed,
and the ledger records exactly what was attempted (MASTER §9 R6). Shipping eleven verified
strategies beats shipping a twelfth that draws garbage.

## Context
- hq2x: 3×3 neighbourhood → 8-bit pattern of "different" neighbours (YUV threshold
  comparison in the original; here `cellsEqual` from task 08 plus an L1 delta distance with
  a painted-ness penalty, MASTER D9) → one of 256 cases → four output pixels, each an
  interpolation rule over up to three source cells. The original interpolations blend
  colours (e.g. 3:1, 2:1:1, 7:1); for signed deltas the blend is a weighted average of the
  chosen cells' deltas **only when all chosen cells are painted**, otherwise the majority
  cell is copied (never average a painted cell with an unpainted one).
- `max-lines` is an **error at 400 code lines** under `src/ui/**`: the 256-case table must
  be **data**, not a switch — encode each case as a compact string of per-output-pixel
  rules (e.g. `"P|P|3P1A|P"`) in `hqxTable.ts` as a 256-entry array (≈260 lines), decoded
  once at module load into closures by `hqx.ts`.
- The self-check that catches a wrong table: hq2x is invariant under the dihedral group when
  the pattern bits are permuted accordingly. Task 08's symmetry test (8 transforms over
  seeded random grids) must pass for hq2x too; a single wrong case fails it.
- Registration: `index.ts` (task 09) — add the option after `xbr`, and `isPixelBrush2DStrategy`
  must include it; task 09's registry test count becomes 12.

## Steps
1. `hqxTable.ts`: the 256 cases as strings, documented format at the top.
2. `hqx.ts`: pattern detection (clamp-to-edge neighbours), decoder, `hq2x(grid, w, h)`,
   exported as `PIXEL_BRUSH_HQ2X: PixelBrushScaler`.
3. `hqx.test.ts`: flat → block replication; a diagonal line → the smoothed 6×6 (write it
   literally); the 8-transform symmetry over ≥ 20 seeded grids; no shared tuples; the
   unpainted-neighbour rule (a painted cell next to holes never blends with a hole).
4. Register in `index.ts`; update `index.test.ts` (12 options).
5. Commit: `brush-scale(10): hq2x`.
   **If step 3's symmetry test cannot be made to pass**, do not commit any of steps 1–4;
   report which patterns failed, and leave `index.ts` at 11 options.

## Constraints
- Do not modify tasks 07/08 files. Everything pure, node-lane tested.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools/pixelBrushScale && bunx vitest run src/ui/canvas/tools/pixelBrushScale
```

## Definition of done
- [ ] Either: `hq2x` registered, table as data, symmetry + literal tests green, files under the line limit.
- [ ] Or: nothing committed, the attempt and failing patterns recorded in `HANDOFF.md` under Deviations.
