# HANDOFF — Canvas rendering performance for large editing surfaces

**Current position:** W5 DONE — W6 (task 07) next. Owner deferred ALL visual checks to one pass after W6.
**Branch:** `feat/03-reflection-tool`
**Last commit:** `ed7da83`

Planned against `5d76ce9` ("Checkpoint: Stable version before optimize"), branch
`feat/03-reflection-tool`, working tree clean.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01 | DONE | 2026-08-30 | `cacfafe` | typecheck 0 · vitest **132 files / 2269 tests passed** · lint:boundaries OK (5/5) |
| W2 | 02, 03 | **DONE** | 2026-08-30 | `5b2401d` `fd871c9` (03) · `cf4c7dd` `23ac19c` `c2963cf` (02) | typecheck 0 · vitest **134 files / 2330 passed** · lint 0 · boundaries 0 · `lint:css` exit 2 **pre-existing, see below** |
| W3 | 04 | **DONE** | 2026-08-30 | `75d3cf7` `72856b8` | typecheck 0 · vitest **134 files / 2353 passed** · lint 0 · lint:css no new · boundaries 0 · storybook 0 · **8 visual checks deferred** |
| W4 | 05 | **DONE** | 2026-08-30 | `82ae19a` `221b58f` | typecheck 0 · vitest **134 files / 2365 passed** · lint 0 · boundaries 0 · **10 visual checks owed, incl. R4** |
| W5 | 06 | **DONE** | 2026-08-30 | `1025d6b` `ed7da83` | typecheck 0 · vitest **134 files / 2385 passed** · lint 0 · lint:css **no new errors (still exactly 2 pre-existing)** · boundaries 0 |
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

## W2 — RESOLVED. Was blocked by a plan defect; unblocked by owner-authorized follow-up `c2963cf`

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

### RESOLUTION (owner chose "follow-up agent, 3 extra files")

Follow-up commit **`c2963cf`** finished the rename in `CanvasContainer.tsx`,
`LightingCanvasContainer.tsx` and `CanvasSurface.dom.test.tsx` (90 insertions, 19 deletions,
exactly those three files). `MASTER.md` §8 item 2 was corrected in `eca9011` so task 05 does
not redo this work.

**Final W2 gate, re-run by the coordinator on the settled tree:**

```
bun run --cwd client typecheck        -> $ tsc --noEmit   (no output)   exit 0
bun run --cwd client lint:boundaries  -> OK — all 5 boundary rules hold  exit 0
cd client && bunx vitest run          -> Test Files  134 passed (134)
                                              Tests  2330 passed (2330)   69.17s
bun run --cwd client lint             -> 0 errors, 65 warnings           exit 0
bun run --cwd client lint:css         -> 2 errors, 67 warnings           exit 2  (PRE-EXISTING)
```

Corpus golden digests + round-trip suites passed **unchanged**. No lockfile.

Coordinator spot-checks: diff is exactly the 3 authorized files; the only `fillRect` line in
the diff is an explanatory comment, so **the render loop is untouched** (task 05 owns it);
`handleResetView` centres on `contentWidth` with the §8-item-3 trap documented inline; four
R1 regression tests pin the data-safety invariant, including "the content box is
byte-identical to the pre-1:1 canvas box". Verified `contentWidth = cellWidth * zoom`
(view zoom 1, excluding `viewZoom`), so the call sites' `contentWidth * viewZoom` is correct
and does NOT square the factor — it preserves the persisted `panOffset` box exactly (R1).

### ⚠️ LEDGER CORRECTION — `lint:css` was never green, and an earlier W2 entry said it was

The follow-up agent challenged my ledger, and **it was right**. I had recorded "`lint:css`
exits 0" from task 02's report without checking it myself. `lint:css` exits **2** with 2
errors in `src/ui/components/OtherHand/OtherHand.css` (design-token rule, refresh task 12).

Proven pre-existing three ways: the file is byte-identical to the plan baseline
(`git diff 5d76ce9..HEAD` on it is empty), it was last touched in `d1fc2ac` ("Checkpoint:
Pre brush studio") long before this plan, and a **clean `5d76ce9` worktree reproduces
`stylelint` exit 2 with the same 2 errors**. It is outside every task's `Touches` list.

**Consequence for the plan: MASTER §4's claim that all gate commands were "verified to run
on 2026-08-30" is wrong for `lint:css` — it never exited 0.** W2's gate is therefore judged
green on typecheck + vitest + lint + boundaries, with `lint:css`'s 2 errors carried as a
pre-existing condition. W5 and W7 list `lint:css` in their gates and **must not** be blocked
by these 2 errors; fixing `OtherHand.css` belongs to refresh task 12, not to this plan.

### Original diagnosis (kept for the record)

**Verified failing gate at `23ac19c`, before the follow-up:**

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

### ⚠️ EXPECTED INTERMEDIATE STATE — the app compiles and boots, but artwork is CLIPPED

Resolved as far as W2 can take it: the app now boots and mounts cleanly (Vite ready, `GET /`
200, all three modules transform without error) where at `23ac19c` it fell back to a
300x150 default canvas.

**But `CanvasContainer`'s ~1000-line render loop still paints at `ctx.fillRect(x * zoom, ...)`
into 1:1 canvases, so the artwork is clipped to the top-left `cellWidth x cellHeight`
corner until TASK 05 converts it.** A documented transitional alias
`const canvasWidth = cellWidth * zoom` at `CanvasContainer.tsx:747-748` keeps that loop
compiling verbatim — **task 05 must delete it.** Sub-cell overlays stay wrong/invisible
until task 04. Both are the planned intermediate state, not regressions.

### 0 of 7 manual checks performed — all still owed

Not performed for two independent reasons: the app is in the broken intermediate state
above, and **no browser automation exists in this environment** (no Playwright/Puppeteer/
chromedriver). Still owed, including **the Landscapes KB-not-MB memory measurement — the
headline claim of this task, entirely unmeasured.** Static substitutes that did pass:
`coords.test.ts` 21/21 unmodified; the R1 wheel-pan test drives a real `WheelEvent` and
asserts the clamp against full content size; the D1 variant-edit sizing test.

## W5 DONE — coordinator-verified

Commits `1025d6b`, `ed7da83`.

```
typecheck        -> exit 0
vitest run       -> Test Files  134 passed (134) · Tests  2385 passed (2385)   69.07s
lint             -> 0 errors, 65 warnings                exit 0
lint:css         -> 69 problems (2 errors, 67 warnings)  — EXACTLY the 2 pre-existing
                    OtherHand.css:267/:288; count, rule and line numbers all unchanged.
                    CanvasSurface.css and tokens.css do NOT appear in the error list.
lint:boundaries  -> OK — all 5 boundary rules hold        exit 0
build-storybook  -> built in 5.49s                        exit 0
```
+20 tests, no pre-existing test regressed. Corpus unchanged. No lockfile.

### ⭐ THE GRID DECISION: kept in SVG, NOT moved to CSS — deliberate, and correct

Task 06's file predates W4 and assumed the grid was still canvas-painted; task 05 had already
moved it to SVG. Asked to decide, the executor kept it vector. **Coordinator agrees, and the
reasoning is worth preserving:**

1. **`calc(1px / var(--combined-scale))` is not the same invariant as `non-scaling-stroke`.**
   It is a computed *length*, resolved once and then scaled by the transform, with antialiased
   sub-pixel stops. `non-scaling-stroke` exempts the stroke at *paint* time, and
   `shape-rendering="crispEdges"` snaps to device pixels.
2. **`combinedScale` spans 0.25–200**, so that computed width would be 0.005px at the top and
   4px at the bottom — rounding to nothing or to a solid fill: **precisely the grey-wash
   silent failure the plan set out to eliminate.**
3. The **variant-edit grid is a placed sub-rectangle** (only `gridWidth x gridHeight` at
   `variantOffset − viewMin` inside a larger surface). On one DIV that needs a second
   `no-repeat` background layer driven by four more custom properties — more machinery than
   the path it replaces, with its own silent failure mode.
4. The owner's requirement ("CSS border tricks to maximize hardware utilization and not raw
   compute") is still met: one GPU-composited `<path>` allocating no raster.

**Coordinator verified exactly ONE mechanism draws the grid:** `CanvasSurface.css` contains
**zero** `linear-gradient`/`repeating-linear-gradient` declarations (only the two
`conic-gradient` checkerboards); `strokeGrid` survives in `CanvasContainer.tsx` only as
comments. The checkerboard DID move to CSS as specified — that half of the task landed.

**Synthetic `::background` id removed** (task 05 deviation 1 closed): survives only in
comments explaining its removal. `ensureBgCanvas`, `bgCanvasRef`, `bgCacheKeyRef` and the
`drawImage` blit are all deleted — likewise comments only. Pinned by tests asserting
`layerIds` does not contain it and exactly one `.canvas__background` DIV exists.

### Task 06 deviations (accepted)

1. **⚠️ SCOPE: two files beyond `Touches`** — `CanvasContainer.dom.test.tsx` and
   `CanvasSurface.dom.test.tsx`. Justified and unavoidable: 6 of their tests hard-code
   `"::background"` or the layer wrapper's child index, and removing that id is *mandated by
   the task*. A green suite was unreachable without them. Coordinator confirmed the edits are
   confined to those assertions plus new background-DIV tests.
2. `useCanvasGeometry.ts` (in Touches) **not** modified — `bgCacheKey` stays on the hook's
   contract for the lighting canvas (task 08); it is merely no longer destructured.
3. `canvasTokens.ts` **not** modified — its parity test iterates `CSS_MIRROR` only, so the new
   tokens were pinned against `backgroundTheme()` directly in `canvasBackground.test.ts`
   instead, catching drift without touching a file outside Touches.
4. **Nothing deleted from `canvasBackground.ts`** — grep proved `strokeGrid` is still called
   by `LightingCanvasContainer.tsx:517` and `LightingSurface.stories.tsx:142`, `gridLinePath`
   by `gridOverlay.ts:123`, and `paintCheckerboard`/`backgroundTheme` by three lighting/normal
   renderers. All retained. (Task 08 may revisit.)
5. **Checkerboard tokens are deliberately NOT per-`data-theme`.** `DARK_THEME` hard-coded the
   `:root` values, so the canvas well has always been theme-independent; aliasing onto
   `--bg-tertiary`/`--bg-hover`/`--canvas-checker-b` would have silently made the checkerboard
   follow the chrome palette. Six dedicated `--canvas-bg-*` tokens added on `:root` only.
6. A test comment was corrected rather than left overclaiming: mutation testing showed the
   double modulo in `checkerParity` is not caught by the pure-arithmetic model (on a 2px tile
   `-1px` is equivalent to `1px`) — it IS caught by the container DOM test.

### W5 manual checks — none claimed

Strongest static coverage: **checkerboard phase parity** — six world offsets including
negatives asserted cell-for-cell against `paintCheckerboard`, with a negative control proving
an odd offset inverts, mutation-verified (quadrant reversal fails 7 tests, phase removal 5).
Colours pinned byte-equal to `backgroundTheme()`'s exact RGB in both palettes.

**Still needing eyes, and all SILENT failure modes:** checkerboard crispness (a 2px tile at
200x that smooths is grey mush — `image-rendering: pixelated` is asserted present but jsdom
cannot rasterise a gradient); behaviour at zoom 50 and at minimum zoom; and whether a real
browser resolves the `conic-gradient` quadrants the same way the arithmetic model does.

## W4 DONE — coordinator-verified

Commits `82ae19a`, `221b58f`. Exactly the 6 authorized files (1,900 insertions / 1,133
deletions). `CanvasSurface.tsx` untouched.

```
typecheck        -> exit 0
vitest run       -> Test Files  134 passed (134) · Tests  2365 passed (2365)   69.09s
lint             -> 0 errors, 65 warnings          exit 0
lint:boundaries  -> OK — all 5 boundary rules hold  exit 0
```
Test delta reconciles exactly: **−16** (`renderScene.test.ts`, deleted per D10) **+28** (new
`CanvasContainer.dom.test.tsx` — the container had NO test file before). No pre-existing test
changed status. Corpus digests unchanged. No lockfile.

**Coordinator-verified claims** (each checked by hand, not taken on report):
- Transitional alias **deleted** — `grep "const canvasWidth"` in the container returns
  nothing, and no stale `* zoom` painting survives. **This is what un-clips the artwork.**
- Raster reflection painter **retired** — the only `drawReflectionLines` /
  `reflectionCanvasRef` hits left are comments explaining the removal (`:1696`, `:3407`).
- `renderScene.ts` and its test **deleted** (D10); `VARIANT_EDIT_REGULAR_DIM = 0.5` and
  `VARIANT_EDIT_OTHER_DIM = 0.7` preserved first in `canvasTokens.ts:130,132`.
- **`pixelDirty` NOT consumed** — the only mention is a comment saying so. Correct: task 07.

**Painting strategy: `ImageData` + `putImageData`.** Measured on the JS half at the
Landscapes grid: `rgba()` string-building **1.40 ms** vs `ImageData` indices **0.51 ms** per
full repaint — 2.7x, before counting the 57,344 `fillRect` calls the string path also makes.
Notably this does **not** add to R4: `putImageData` replaces rather than composites, which is
safe by construction since a pixel grid holds exactly one cell per (x,y) — which is why
variant sub-layers each get their own canvas. R4 therefore comes purely from CSS-opacity
stacking (D4), not from the buffer.

### ⚠️ ONE FUNCTIONAL GAP — the hover marker has NO OUTLINE (fill only)

Deliberate, documented at `CanvasContainer.tsx:3258-3273`, and **owed as follow-up work**.
The raster half is gone (at 1:1 every edge is zero-length and renders nothing) and
`CanvasSurface` accepts the `hoverOutline` prop, but it is not wired.

**Why deferring was the right call:** the hovered cell lives in `hoverPixelRef`, a **ref**,
and that is load-bearing. `setHoverPixel` is called from `handleTouchMove`, so a `useState`
there re-renders the container mid-gesture — the **measured 2026-08-28 "unable to slide and
draw" regression**. The reflection guides could take the vector path because they already had
a bounded ~12 fps ticker; a 120 Hz pointer stream has no such budget. Trading a silent visual
gap for a known gesture regression would have been the worse deal.

**Net effect for the user: the hover marker shows its fill but no outline.** Not a blocker,
but a real visual change that needs an owner decision (throttled state write? rAF-coalesced
publish? accept fill-only?).

### Task 05 deviations (accepted)

1. **A synthetic `::background` layer id** in `layerIds` — the checkerboard must sit behind
   the artwork and DOM order is z-order. It is one more *string*, so R8 is intact and
   boundaries are green. **Task 06's CSS DIV removes it.**
2. **Grid cache deleted; grid moved to the SVG `grid` prop** — at 1:1 `strokeGrid` is a flat
   grey wash over the whole canvas (MASTER §4's first named silent failure), so keeping it
   was not an option. The variant-edit grid is emitted in the container because
   `gridOverlayPathData` takes no offset; the colour rule stays owned by `gridOverlayAttrs`.
3. **Lasso, marching ants and origin cross moved to their SVG props** (same 1:1 degeneracy,
   R3); their canvas painters were removed from the container.
4. The hover-outline deferral above.

⚠️ Deviations 2 and 3 mean **four overlays moved canvas→SVG in W4 rather than W5/W6**. Their
failure mode is *silent* (render nothing, or a grey wash), which is exactly what a green test
suite cannot rule out — **the post-W6 visual pass must look at the grid, lasso, marching ants
and origin cross specifically.**

### W4's 10 manual checks — ALL OWED, none claimed

Statically supported: layer count/order/1:1 sizing, `display:none` targeting and stale-clear
on hide, `layerOpacity` against D4's table in all three focus modes, onion-as-outline with a
negative control (3x3 solid block → **8** cells onion vs **9** transparent), variant offset
placement and view-union expansion, both split panes mounting with independent ref maps.

**Check 5 — the R4 semi-transparent side-by-side — CANNOT be done without a browser and is
the owner's sign-off evidence.** Also needing eyes: occlusion when drawing on a middle layer,
move-tool preview, undo/redo leaving no stale pixels, swap/close and camera independence, and
the Landscapes perf observation (only the 2.7x JS-half microbenchmark was measurable).

## W3 DONE — coordinator-verified

Commits `75d3cf7`, `72856b8`. Exactly the 4 authorized files (1,316 insertions / 145
deletions); nothing under `ui/canvas/`, no container, no other file.

```
typecheck        -> exit 0
vitest run       -> Test Files  134 passed (134) · Tests  2353 passed (2353)   68.88s
lint             -> 0 errors, 65 warnings                        exit 0
lint:css         -> same 2 pre-existing OtherHand.css errors; CanvasSurface.css CLEAN
lint:boundaries  -> OK — all 5 boundary rules hold               exit 0
build-storybook  -> built in 5.59s                               exit 0
```
+23 tests, no pre-existing test changed status. Corpus digests unchanged. No lockfile.

**R8 boundary verified by the coordinator, not taken on report** — ESLint sees imports, not
prop types, so this check had to be done by hand. `CanvasSurface.tsx` imports only React
types plus `OriginCrossOverlay`/`ReflectionGuideOverlay`/`SvgPathSpec` from
`ui/canvas/svg/`. Props are `layerIds: readonly string[]`, `registerLayerCanvas(id, el|null)`,
`Readonly<Record<string, number|boolean>>`, refs, primitives and callbacks. **No `pixels`,
`layers`, `frame`, `Layer`, `PixelData` or any domain type anywhere in the interface.**

**Origin cross** (task-03 finding 1) handled correctly: verified at `CanvasSurface.tsx:677` —
`<g transform="translate(cx cy) scale(1/combinedScale)">` with the circle rendered inside.
Pinned by a test asserting `scale(0.125)` at `combinedScale=8`, plus a guard that
`combinedScale=0` degrades to `scale(1)` rather than `scale(Infinity)` (which would blank all
chrome).

### ⚠️ REFLECTION CANVAS KEPT — and TASK 05 must retire it

The task file said "remove it if now unused". **It is still in use, so it was correctly
kept.** Coordinator confirmed: `CanvasContainer.tsx:1585` still gets
`reflectionCanvasRef.current`, clears it and calls `drawReflectionLines`. Removing the canvas
would have left that painter writing into `null` — and `CanvasContainer.tsx` belongs to task
05. `reflectionGuides` (SVG) is mounted alongside it as the D5 replacement.
**Task 05 must stop that raster painter and then drop the canvas**, or the guides will be
drawn twice — once raster (wrong at 1:1) and once vector.

### Task 04 deviations (accepted)

1. `.canvas__svg` carries `z-index: var(--z-canvas-overlay)` — **not a new value**, the same
   token every `.canvas__overlay` uses. It must be *present*: a positioned element with no
   z-index loses to one with a value regardless of DOM order. With equal values the later
   sibling wins, which is the rule the file already documents. `.canvas__layers` has no
   z-index and stacks purely by source order. `lint:css` clean on this file.
2. **`useLayerRefs`, a memoised per-id ref-callback map** — found by the executor's own test.
   The obvious `ref={(el) => register(id, el)}` is a fresh closure every render, so React would
   detach/reattach EVERY layer canvas on EVERY render, firing `(id, null)` through the
   container's ref map on every pan frame, wheel tick and hover sample. That would discard at
   the ref level exactly the pooling that keyed reconciliation buys at the DOM level. Memo is
   keyed on the sorted id set, so reorder and pan/zoom do not rebuild it. Two tests pin it.
3. React-Compiler rules reject the `useRef`-cache pattern ("Cannot access refs during
   render"), which is why the memo was used; the eslint config has no
   `react/no-array-index-key`, so an initial disable comment was itself an error and was
   removed.
4. One unregister test now asserts the container map's **end state** rather than an exact
   call sequence (consequence of deviation 2).
5. `ReflectionGuides` story converted from raster paint to the `reflectionGuides` SVG prop.

### W3's 8 manual checks — ALL DEFERRED, none claimed

Per owner instruction (verify once after W6). Statically supported: #7 (per-layer canvas
count, order, dimensions, `display:none` targeting, and reorder-without-remount by element
identity — all asserted in jsdom) and #5 (counter-scale transform asserted exactly).
**Highest residual risk is #2, the hover outline** — its canvas failure mode was rendering
*nothing* with no error, so only eyes can confirm it. #6's reflection *animation* is
genuinely unverified: `dashOffset` is a parameter here and task 05 owns driving it.

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
