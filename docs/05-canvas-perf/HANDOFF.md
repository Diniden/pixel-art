# HANDOFF — Canvas rendering performance for large editing surfaces

**Current position:** BLOCKED — W2: task 03 DONE, task 02 PARTIAL. Plan defect; awaiting owner decision.
**Branch:** `feat/03-reflection-tool`
**Last commit:** `23ac19c`

Planned against `5d76ce9` ("Checkpoint: Stable version before optimize"), branch
`feat/03-reflection-tool`, working tree clean.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01 | DONE | 2026-08-30 | `cacfafe` | typecheck 0 · vitest **132 files / 2269 tests passed** · lint:boundaries OK (5/5) |
| W2 | 02, 03 | **BLOCKED** | 2026-08-30 | `5b2401d` `fd871c9` (03) · `cf4c7dd` `23ac19c` (02) | typecheck **exit 2**, 5 errors · vitest **1 failed / 2329 passed** — see W2 section |
| W3 | 04 | TODO | | | |
| W4 | 05 | TODO | | | |
| W5 | 06 | TODO | | | |
| W6 | 07 | TODO | | | |
| W7 | 08 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

**D-01 (2026-08-30, resolved before W1):** The plan required a clean tree at `5d76ce9`, but
a concurrent session had ~1,900 lines uncommitted across `LayerColors*`, `PaletteManager*`,
rail layout, layout presets and toast. Verified green as-is (typecheck exit 0; vitest
131 files / 2255 tests passing; corpus golden digests unchanged) and confirmed **no overlap
with any task's `Touches` list**. On the owner's instruction it was committed as its own
checkpoint `85bb3d7`, so plan-05 starts from a clean tree. Plan-05 therefore branches from
`85bb3d7`, not `5d76ce9`.

**Revised baseline** (at `85bb3d7`, supersedes the plan's 123/2128): **131 files, 2255
tests, all passing, ~69s.** Task gates should compare against this. After W1: **132 / 2269**.

**D-02 (W1, accepted):** `DomainStore.ts` crossed ESLint's `max-lines` threshold (396 → 404)
from task 01's additions — a **warning**, not an error; `eslint` exits 0 and the gate passes.
Not fixed: splitting the file is outside task 01's mandate. `PixelStore.ts` carries the same
warning but pre-existed at 857 lines (now 875); coordinator verified both independently.

**D-03 (W1, accepted):** The executor added 8 tests beyond the 6 required cases (14 total),
including a guard that the published cells array is a raw array and not a MobX proxy — which
is what would catch a regression of the `observableRef` annotation. Kept.

**D-04 (W1, accepted):** The executor factored the four publish sites through two private
helpers (`publishDirty` / `publishDirtyAll`) rather than inlining `runInAction` four times.
Behaviourally identical, keeps the D8 rationale documented once. `publishAndBump` untouched.

## W1 gate — verified by the coordinator, not taken on report

Re-run independently at `cacfafe`:

```
bun run --cwd client typecheck          → $ tsc --noEmit    (no output)   exit 0
bun run --cwd client lint:boundaries    → check-boundaries: OK — all 5 boundary rules hold.  exit 0
cd client && bunx vitest run
  Test Files  132 passed (132)
       Tests  2269 passed (2269)
    Duration  69.04s
```

Delta vs the `85bb3d7` baseline is exactly **+1 file / +14 tests** — the new
`pixelDirty.test.ts`. No pre-existing test changed status. Corpus golden digests and all
round-trip stability tests passed **unchanged**; `vitest -u` was never run. No lockfile.

Coordinator spot-checks beyond the gate:

- `git diff 85bb3d7..HEAD --stat` → 3 files, **447 insertions, 0 deletions**. Zero removed
  lines structurally proves `publishAndBump`, `bumpPixelVersion` and the `isReplaying` gate
  are unchanged; `publishAndBump` re-read and confirmed verbatim.
- `grep pixelDirty` outside `stores/domain/` → **no matches**. No consumer added (task 07
  owns that), nothing persisted, no codec/migration/fixture touched.
- D8 confirmed by reading the diff: `applyPatch` publishes its region *after*
  `publishAndBump` and *outside* the `isReplaying` early-return, so undo repaints without
  triggering a save.
- `pixelDirty` is annotated `observableRef`, not `observable` (R2).

## W2 BLOCKED — the plan cannot be executed as written (coordinator-verified)

**Task 03: DONE.** Commits `5b2401d`, `fd871c9`. Exactly 4 new files, 1,397 insertions,
**zero existing files modified**. Pure (no React/JSX/store/MobX/API). `ui/canvas` +
`ui/theme` → 24 files / 435 tests pass, golden hashes and the `tokens.css` parity test
included. `lint` and `lint:boundaries` exit 0. No lockfile.

**Task 02: PARTIAL.** Commits `cf4c7dd`, `23ac19c`. All in-scope work is done and correct:
`cellWidth`/`cellHeight` in grid cells, `contentWidth`/`contentHeight` derived, `zoom` out
of `bgCacheKey`, `scale(combinedScale)` on `.canvas__layout`, the `:339-340` clamp fixed,
D1 conditional preserved, `clampPanToViewport` and both anchor blocks untouched, R1
regression tests added. It stopped at the boundary rather than expanding scope. Correct call.

### The defect — MASTER section 8 and section 7 contradict each other

**Section 8 "most likely to get wrong" item 2 instructs task 02 to fix
`CanvasContainer.tsx:2457`, `:2885` and `:3010`. But section 7 and the `Touches` lists
assign `CanvasContainer.tsx` to task 05 and `LightingCanvasContainer.tsx` to task 08.**
Task 02 therefore *cannot* reach a passing typecheck from inside its own five files — the
rename it is required to perform breaks 49 references in `CanvasContainer.tsx` and 27 in
`LightingCanvasContainer.tsx` that no task in W2 is allowed to touch.

Task 05's own task file already assumes `cellWidth` exists in `CanvasContainer`
(`05-...md:38`), confirming the rename was always meant to reach that file — the plan simply
never assigned the edit to anyone.

### Verified failing gate (coordinator re-ran on the settled tree, not taken on report)

```
bun run --cwd client typecheck   -> exit 2
  CanvasContainer.tsx(713,5)  TS2339  'canvasWidth' does not exist on type 'CanvasGeometry'
  CanvasContainer.tsx(714,5)  TS2339  'canvasHeight' does not exist on type 'CanvasGeometry'
  CanvasContainer.tsx(746,5)  TS2353  'canvasWidth' not in 'UseCanvasViewportOptions'
  CanvasContainer.tsx(3068,7) TS2322  'canvasWidth' not in 'CanvasSurfaceProps'
  LightingCanvasContainer.tsx(304,7) TS2353 'canvasWidth' not in 'UseCanvasViewportOptions'

bunx vitest run                  -> Test Files  1 failed | 133 passed (134)
                                        Tests  1 failed | 2329 passed (2330)
  CanvasSurface.dom.test.tsx:132 — receives scale(12), asserts scale(1)
  NOTE: that file is in TASK 04's Touches, so task 02 could not fix it either
```

`lint` / `lint:css` / `lint:boundaries` all exit 0; `lint:css` byte-identical to baseline.
**Corpus snapshots passed unchanged** (R3, R6, golden digests, migrations all green).
No lockfile. Both agents stayed exactly in scope — the 9 changed files are precisely the two
`Touches` lists, which is why the defect is the plan's and not theirs.

### The app is knowingly broken at this commit

Vite still builds (it strips types without checking), but `CanvasContainer` destructures
`canvasWidth` as `undefined`, so canvases fall back to the 300x150 default while the render
loop still paints at `* zoom`. **`bun run dev` will not render correctly until the follow-up
lands.** No manual check is meaningful before then.

### Remaining work (small, mechanical, but needs 2 files outside W2's scope)

`geom.cellWidth/cellHeight`; `contentWidth`/`contentHeight` into `useCanvasViewport`;
`combinedScale={zoom * viewZoom}` + `cellWidth`/`cellHeight` onto `<CanvasSurface>`;
`contentWidth` at the two pan-clamp sites and the centring site (section 8 items 2 and 3);
and `contentWidth: viewCellsX * zoom` in `LightingCanvasContainer` (its own sizing stays,
R7). Plus the one-line `CanvasSurface.dom.test.tsx` transform assertion.

### 0 of 7 manual checks performed — all still owed

Not performed for two independent reasons: the app is in the broken intermediate state
above, and **no browser automation exists in this environment** (no Playwright/Puppeteer/
chromedriver). Still owed, including **the Landscapes KB-not-MB memory measurement — the
headline claim of this task, entirely unmeasured.** Static substitutes that did pass:
`coords.test.ts` 21/21 unmodified; the R1 wheel-pan test drives a real `WheelEvent` and
asserts the clamp against full content size; the D1 variant-edit sizing test.

## W2 task-03 findings that TASK 04 MUST READ

Task 03 (SVG primitives, commits `5b2401d` + `fd871c9`) hit four places where the plan's
"call the geometry function with `zoom = 1` and drop the `+ 0.5`" instruction does not
survive contact. **Task 04 mounts these — read this before writing the JSX.**

1. **⚠️ THE ORIGIN CROSS NEEDS A COUNTER-SCALED `<g>` WRAPPER.** This is the one that will
   bite. `vector-effect: non-scaling-stroke` exempts the **stroke width** from the
   transform, **not the geometry** — so `ORIGIN_CROSS_SIZE = 12` emitted as 12 user units
   would render 600 screen px at zoom 50, which is the original bug in new clothes.
   `originCrossOverlay` therefore returns *numbers*, not a cell-space path: the centre in
   cell space, plus arm length and circle radius in **screen px**. Task 04 must place it
   inside a `<g>` counter-scaled by `1 / combinedScale`. It is the only overlay that cannot
   simply be spread onto a `<path>`. The same reasoning applies to any future
   screen-constant decoration.
2. `hoverOutlineOverlay` probes `markerPerimeter` at `zoom = 2`, not 1: at 1 the function's
   `zoom - 1` span is zero, collapsing a cell's four edges onto one mutually
   indistinguishable point. It normalises back exactly (`ceil((n - 0.5) / 2)`; the fraction
   can only be 0 or 0.5), keeping the perimeter rule owned by the existing function rather
   than duplicated. No view zoom reaches it — pinned by the zoom-independence test.
3. `marchingAntsOverlay` discards `marchingAntsRects`'s `inner` rect and strokes `outer`
   twice. The 1px inset is one whole cell at 1:1 and `width - 2` inverts below 3 cells;
   under `non-scaling-stroke` both passes are already screen-width and overlap correctly.
4. `lassoOverlay` **keeps its `+ 0.5`** — that offset is cell-*centre* placement, not stroke
   centring, so dropping it would make the rubber band track corners instead of the cells
   the user crossed. (The plan's "drop `+ 0.5`" applies to the grid, which did drop it.)

## Notes for the next session

**⚠️ A concurrent session was editing this repo while this plan was written (2026-08-30).**
At planning time the tree was clean at `5d76ce9`; by the time the plan folder was written,
another session had uncommitted changes across `LayerColors*`, `PaletteManager*`,
`PixelStudioLayout`, `LightingStudioLayout`, `ApplicationStore.ts` and `storeTypes.ts`.

None of those files appear in any task's `Touches` list, so there is no planned collision.
But **before starting W1, confirm the working tree is clean and branch from a known-good
commit** — do not start on top of another session's half-finished work. If those changes are
still uncommitted, coordinate with the owner first.

**Baseline for comparison** (measured 2026-08-30 at `5d76ce9`): `bunx vitest run` →
123 files, 2128 tests, all passing, ~72s. `bun run --cwd client typecheck` → exit 0.
No lockfile present, and none created by the baseline run.
