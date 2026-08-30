# 02 — Reflection geometry module + corner snapping

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/model/reflection.ts` (new) · `client/src/ui/canvas/model/__tests__/reflection.test.ts` (new) · `client/src/ui/canvas/model/coords.ts` · `client/src/ui/canvas/model/__tests__/coords.test.ts`
**Effort:** M

## Objective
A pure, store-free module defines the `ReflectionLine` shape, reflects cells across a
line, expands a batch of pixel writes into the closure of images across N lines, and
computes preset line sets. `screenToPixel` gains a `"corner"` snap mode returning
integer lattice coordinates in grid space.

## Context
- Everything under `client/src/ui/` is pure: no store, API or MobX imports (ESLint +
  `bun run lint:boundaries`). Copy the style of `ui/canvas/model/variantOffset.ts` and
  `coords.ts` (module header explaining the rule, exported interfaces, no classes).
- **Coordinate frame (locked, MASTER §3 D2):** a grid cell `(x, y)` covers
  `[x, x+1) × [y, y+1)`; its centre is `(x+0.5, y+0.5)`. "Between pixels" therefore means
  the **integer lattice** of cell corners, `0..gridWidth × 0..gridHeight`. Hand-drawn
  lines snap to that lattice. Presets may produce half-integer coordinates for odd grid
  sizes (a vertical centre line on a 17-wide grid is `x = 8.5`) — the geometry must work
  for any real-valued line.
- **Reflection of a cell (locked D3):** reflect the cell centre across the infinite line
  through `(x1,y1)-(x2,y2)`, then `Math.floor` both components to get the image cell.
  Drop images outside `[0,w) × [0,h)`. For axis-aligned and 45° lines through lattice
  points this is exact; for other angles it is a rounding approximation — acceptable.
  Use an epsilon (`1e-9`) before flooring so `7.9999999` becomes 8, not 7.
- **Multiple lines (locked D4):** `expandWrites` applies lines sequentially:
  `S = writes; for each line: S = S ∪ reflect(S, line)`. Two perpendicular lines yield
  4-fold symmetry. Output order: the original writes first, then images in generation
  order; de-duplicate by `y*w + x` keeping the **first** occurrence (the original beats
  its image; `PixelStore.setPixels` lets later writes win, so an image must never
  overwrite an original). Cap: `MAX_REFLECTION_LINES = 8` (2^8 = 256× worst case).
- Degenerate line (both endpoints equal) is invalid — export `isDegenerate`.
- `screenToPixel` at `coords.ts:76-142` has modes `"pixel"` (floor, variant-local, strict
  bounds → null) and `"origin"` (half-cell round, object space, slop). Add `"corner"`:
  same **space** as `"pixel"` (variant-local when `editingVariant`), `Math.round` both
  axes, then **clamp** to `[0, gridWidth] × [0, gridHeight]` (never null on
  out-of-range — a drag to the edge must land on the edge; still return null on a
  degenerate rect). Keep `SnapMode = "pixel" | "origin" | "corner"`.

## Steps
1. Create `reflection.ts` exporting:
   ```ts
   export interface ReflectionLine { id: string; x1: number; y1: number; x2: number; y2: number; }
   export interface GridCell { x: number; y: number }
   export const MAX_REFLECTION_LINES = 8;
   export type ReflectionPreset = "vertical" | "horizontal" | "both" | "diagonals" | "all";
   export function isDegenerate(line: Pick<ReflectionLine, "x1"|"y1"|"x2"|"y2">): boolean;
   export function reflectPoint(px: number, py: number, line): { x: number; y: number };
   export function reflectCell(cell: GridCell, line, w: number, h: number): GridCell | null;
   export function expandWrites<T extends GridCell>(writes: readonly T[], lines: readonly ReflectionLine[], w: number, h: number): T[];
   export function presetLines(preset: ReflectionPreset, w: number, h: number, makeId: () => string): ReflectionLine[];
   export function describeLine(line: ReflectionLine): string; // e.g. "(0,8) → (16,8)" for the panel
   ```
   `expandWrites` must be generic so `{x,y,color}` writes and `{x,y}` preview points both
   pass through unchanged apart from coordinates (spread the source record, override x/y).
   Presets: vertical = `(w/2,0)-(w/2,h)`; horizontal = `(0,h/2)-(w,h/2)`; both = those
   two; diagonals = `(0,0)-(w,h)` and `(w,0)-(0,h)`; all = four lines.
2. Write `reflection.test.ts` (unit lane, node): exact reflection across vertical centre
   of an even grid; odd grid (half-integer line maps middle column to itself); 45°
   diagonal maps `(0,3)` ↔ `(3,0)` on a square grid; out-of-bounds images dropped; two
   perpendicular lines produce 4 cells from 1; original-first ordering and dedupe when a
   cell lies on the axis; `expandWrites` with zero lines returns an array equal to the
   input; generic payload preserved; `presetLines` shapes; `isDegenerate`.
3. Add `"corner"` to `coords.ts` with tests in `coords.test.ts` (round vs floor,
   clamp to `w`/`h`, variant-local subtraction, null on zero-size rect).
4. Commit: `feat(canvas): reflection geometry module and corner snap mode`.

## Constraints
- No imports from `stores/`, `types/` runtime values, or React. Type-only imports from
  `types/` are acceptable but not needed.
- Do not change `"pixel"` or `"origin"` behaviour — existing `coords.test.ts` cases must
  pass untouched.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/ui/canvas/model 2>&1 | tail -8    # all pass
cd client && bunx eslint src/ui/canvas/model && bun run lint:boundaries
```

## Definition of done
- [ ] All exports above exist with the stated signatures.
- [ ] ≥ 12 unit tests covering the cases in step 2, all green.
- [ ] `"corner"` mode tested; old coords tests unchanged and green.
- [ ] Boundary check passes (no store/MobX import).
