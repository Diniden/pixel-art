# 03 — `coords.ts` `"float"` snap mode

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/model/coords.ts` · `client/src/ui/canvas/model/__tests__/coords.test.ts`
**Effort:** S

## Objective
`screenToPixel(clientX, clientY, rect, geom, "float")` returns the un-floored, unclamped world cell
coordinate — the same mapping as `"pixel-unbounded"` without the floor — so handle hit-testing and
transform drags can work at float granularity. Every existing mode is unchanged.

## Context
- `client/src/ui/canvas/model/coords.ts` (193 lines): `SnapMode :80` = `"pixel" | "pixel-unbounded" | "origin" | "corner"`;
  `screenToPixel :88-193`; the `"pixel-unbounded"` branch `:121-143` computes the raw coordinate
  (through `rect.width / gridWidth`, applying the variant view offset from `geom`) then `Math.floor`s;
  `"corner"` `:145-169` rounds and clamps. Header `:9-15` explains why the rect (not `zoom`) is the
  only valid source — keep that rule.
- Test `__tests__/coords.test.ts` (393 lines) covers the four modes with a fixed `rect` and `geom`;
  add a `describe("float")` in the same style.
- The container wrapper (`getFloatCoords`) is task 10's; this task only adds the mode.

## Steps
1. Extend `SnapMode` with `"float"` and document it in the header table ("raw world cell coordinate,
   floats, unclamped; the transform tool's hit-testing and drags").
2. Add the branch: identical arithmetic to `"pixel-unbounded"` (variant offset included) returning
   `{ x: rawX, y: rawY }` without `Math.floor`; `null` only for a degenerate rect (width or height 0),
   as the other modes do.
3. Tests: the centre of cell (3, 4) at `CELL_PX` per cell → `(3.5, 4.5)`; a point 25 % into a cell →
   `x.25`; a point left of the grid → negative, not `null`; a point past the right edge → `> gridWidth`;
   the variant-offset case matches `"pixel-unbounded"`'s floor when floored; degenerate rect → `null`;
   the four existing modes' tests untouched and green.
4. Commit: `transform(03): coords "float" snap mode`.

## Constraints
- Do not change any existing branch or the function signature beyond the union member.
- No clamping, no rounding in the new branch.

## Verification
```sh
cd client && bunx vitest run src/ui/canvas/model/__tests__/coords.test.ts   # green
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/model            # clean
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules                  # prints nothing
```
Manual: none.

## Definition of done
- [ ] `"float"` mode exists with the D12 semantics; header table updated.
- [ ] New tests green; existing coords tests untouched and green.
- [ ] One commit `transform(03):`; no lockfile.
