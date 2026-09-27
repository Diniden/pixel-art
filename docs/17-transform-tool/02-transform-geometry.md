# 02 — Geometry module `transform.ts`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/model/transform.ts` (new) · `client/src/ui/canvas/model/__tests__/transform.test.ts` (new)
**Effort:** L

## Objective
One pure, exhaustively tested module holds every piece of transform mathematics: the float params
model, forward / inverse mapping, the transformed quad and its eight handles, screen-aware zone
hit-testing, the drag rules for scale / rotate / translate, nearest-neighbour rasterisation of the
lifted source into whole cells, and the commit write list. Nothing consumes it yet.

## Context
- Sibling to copy: `client/src/ui/canvas/model/reflection.ts` (270 lines; `reflectPoint :111`,
  `reflectCell :138` — reflect the cell **centre** `(x+0.5, y+0.5)` then `Math.floor` with
  `EPSILON = 1e-9` `:89`; `expandWrites :166`) and its test (384 lines). Same file voice: a header
  stating the coordinate frame, what the module never sees (no DOM, no store, no grid walking beyond
  the lifted map), and each rule with its reason.
- Types to import from `@/types`: `SelectionBox { x; y; width; height }` (`domain.ts:485`), `Point`
  (`:508`), `PixelData` (`:18`). `PixelCellWrite` lives in `stores/domain/PixelStore.ts` — **do not
  import it** (`ui/` may not import stores); declare a structural `TransformCellWrite { x; y; color;
  normal; height }` that is assignable to it.
- The exact exported API is MASTER §3's type block for this file; the rules are D2 (frame), D3
  (hit-test), D4 (drag math), D5 (rasterisation), D6 (commit writes). Read them twice.
- `ui/` boundary: no store, api, mobx, React. `max-lines` is an **error** under `src/ui/**` at 400
  code lines — the module is large; if it nears the limit split the rasteriser into
  `transformRaster.ts` (record as a deviation only if you must).
- Packed cell keys are `y * width + x` (the `SelectionUIStore` convention).

## Steps
1. Write the constants, `TransformParams`, `TransformSource`, handle ids, zones, `sourceCenter`,
   `identityParams`, `isIdentity` (epsilon `1e-9` on all five fields), `forwardPoint`, `inversePoint`
   (D2: `world = c + R(θ)·S·(p − c0)`; inverse divides by scale — guard `|scale| ≥ 1e-9`).
2. `transformQuad` (TL, TR, BR, BL of the corner lattice mapped forward) and `transformHandles`
   (`nw n ne e se s sw w`: corners and edge midpoints, in that order).
3. `hitTestTransform` per D3 (handle radius → local frame inside → rotate band → outside). Commit
   after step 3: `transform(02): params, quad, handles, hit-test`.
4. `dragParams` per D4: handle drags with the opposite handle as the fixed anchor (corner: both axes;
   edge: one axis; `uniform` on corners; min half-extent `0.5` cell; sign preserved so a drag past the
   anchor flips); rotate with `atan2` deltas normalised to `(−π, π]` and 15° snap; inside → translate.
5. `rasterizeTransform` per D5 (destination box = integer bbox of the quad ∩ grid; centre-sample
   inverse mapping with `floor(v + 1e-9)`; `cells` keyed on the destination grid; `vacated` = source
   keys not covered) and `transformCommitWrites` per D6 (vacated first as empties, then result cells
   as copies). Commit: `transform(02): drag math, rasteriser, commit writes`.
6. Tests (`transform.test.ts`, node lane). Use tiny sources (2×2, 3×1) with distinct colours so
   every cell is identifiable. Pin at least:
   - identity: `forwardPoint` / `inversePoint` are inverses (random points, 1e-9); `isIdentity(identityParams(b), b)`.
   - quad: identity quad equals the bounds' corners; `rotation = π/2` maps TL → TR position, etc.;
     `scaleX = 2` doubles the width about the centre.
   - handles: 8 ids in order; `e` is the midpoint of TR–BR.
   - hit-test: a point within `8/combinedScale` of `se` → `handle se`; nearest handle wins when two
     overlap at low zoom; inside centre → `inside`; just outside a corner within `24/combinedScale` →
     `rotate`; far away → `outside`; the same screen distances hit at `combinedScale = 1` and `= 20`.
   - drag scale: dragging `se` by `(+w, +h)` doubles both scales and keeps `nw`'s world position
     fixed (compare `transformHandles` before/after); `e` changes only `scaleX`; `uniform` on `se`
     gives `|scaleX| === |scaleY|` (for a square source); dragging `e` past `w` yields negative
     `scaleX` and the box never collapses below `0.5` cell; under `rotation = π/2` the anchor still
     stays fixed.
   - drag rotate: a quarter-turn of the pointer around the centre gives `rotation = π/2`; the centre
     and scales are unchanged; `snap` rounds `0.3` rad to `π/12`; crossing ±π wraps.
   - drag inside: translate by the pointer delta; scale / rotation unchanged.
   - rasterise: identity reproduces the source keys and the **same** `PixelData` references,
     `vacated` empty; `scaleX = 2` on a 2×1 source paints 4 cells with each source cell doubled;
     `rotation = π/2` on a 2×1 source paints 1×2; a translate by `(0.4, 0)` changes nothing, by
     `(0.6, 0)` shifts by one cell; destination cells outside the grid are culled; partial overlap
     leaves the uncovered source keys in `vacated`; cells the result covers are not in `vacated`.
   - commit writes: vacated entries come first with `color: 0, normal: 0, height: 0`; result entries
     carry copies (not the same object); one write per distinct cell in each group.
   Commit: `transform(02): geometry tests`.

## Constraints
- No imports from `stores/`, `api/`, `mobx`, React, DOM. No `Math.round` for cell bucketing — floor
  with epsilon (D5).
- Do not edit `reflection.ts`, `coords.ts` (task 03), `chromeOverlay.ts`.
- No `max-lines` error; split by concern if needed and say so.

## Verification
```sh
cd client && bunx vitest run src/ui/canvas/model              # green
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas   # clean, no max-lines error
cd client && bun run lint:boundaries                          # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Manual: none (pure module).

## Definition of done
- [ ] Every export in MASTER §3's block exists with those signatures and D2–D6 semantics.
- [ ] Every test bullet above is pinned; the suite is green.
- [ ] Boundaries 5/5; no `max-lines` error under `src/ui/**`.
- [ ] Three commits `transform(02):`; no lockfile.
