# HANDOFF — Brush Studio follow-ups

**Current position:** COMPLETE (PARTIAL — every automated gate green; 0 of 30 manual QA rows performed)
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `97fea4b` (last code commit, 2026-09-09); ledger commits `03535fb` and this close-out sit on top of it

Planned 2026-09-09 from `feat/01-brush-studio` @ `4ed1d3c` with a clean tree. The plan-01 ledger
(`docs/01-brush-studio/HANDOFF.md`) still lists 29 owed manual QA rows; the owner's first pass
produced the four requests this plan addresses.

## Coordinator final gate (run by /plan-go after W5, 2026-09-09, tree clean at `03535fb`)

```
bun run verify                        exit 0
  client tsc                          clean
  server tsc                          clean
  client eslint                       ✖ 66 problems (0 errors, 66 warnings)   = baseline
  server eslint                       clean
  prettier --check                    All matched files use Prettier code style!
  client vitest                       Test Files 187 passed (187) · Tests 3919 passed (3919)
  vite build                          ✓ built in 2.24s
client: bun run lint:boundaries       check-boundaries: OK — all 5 boundary rules hold.  exit 0
client: stylelint "src/**/*.css"      ✖ 71 problems (2 errors, 69 warnings) — errors = pre-existing OtherHand.css:338,359 (= baseline)
client: storybook build               ✓ built in 6.18s
server: tsc --noEmit                  exit 0
server: eslint .                      exit 0
server: vitest run                    Test Files 4 passed (4) · Tests 102 passed (102)
lockfile check (repo root)            nothing found
corpus diff 52b9d6a..HEAD (codecs / services / server export)   empty
git status --short                    clean
```

Baseline at `4ed1d3c` was 183 files / 3825 tests; the plan added 4 test files and 94 tests.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 02 `c2bf857` · 04 `6bbfad6` · 03 `b6976f1` · 01 `ea7e8f2` · 05 `d254b1b` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 184 files / 3859 tests passed (baseline 183 / 3825) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.18s · no lockfile |
| W2 | 06, 07 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 07 `79e1913` · 06 `710aeb6` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 186 files / 3889 tests passed · boundaries OK all 5 rules · no lockfile · `BrushCanvasContainer.tsx` 390 / 400 counted lines |
| W3 | 08 | DONE (automated; manual checks owed, see below) | 2026-09-09 | `ae43385` + follow-up `cd3ae4a` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 186 files / 3910 tests passed · boundaries OK all 5 rules · no lockfile · `BrushCanvasContainer.tsx` 389 / 400 counted lines |
| W4 | 09 | DONE (automated; manual checks owed, see below) | 2026-09-09 | `c5d2003` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 187 files / 3919 tests passed · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · no lockfile · `BrushCanvasContainer.tsx` 370 / 400 counted lines |
| W5 | 10 | DONE (automated; **no manual checks performed** — see the consolidated checklist below) | 2026-09-09 | formatting `0de1bda` · ARCHITECTURE.md `97fea4b` · ledger (this commit) | executor, at `97fea4b`: root `bun run verify` **exit 0** — client tsc + server tsc clean · client eslint `✖ 66 problems (0 errors, 66 warnings)` (= baseline) · server eslint clean · format:check `All matched files use Prettier code style!` · vitest `Test Files 187 passed (187)` / `Tests 3919 passed (3919)` (70.26s) · vite build `✓ built in 2.21s` · `bun run lint:boundaries` exit 0 `check-boundaries: OK — all 5 boundary rules hold.` · `bunx stylelint "src/**/*.css"` exit 2 `✖ 71 problems (2 errors, 69 warnings)` — the 2 errors are the pre-existing `OtherHand.css:338,359` (= baseline) · `bunx storybook build` exit 0 `✓ built in 6.06s` · server `bunx tsc --noEmit` exit 0 · `bunx eslint .` exit 0 · `bunx vitest run` exit 0 `Test Files 4 passed (4)` / `Tests 102 passed (102)` · lockfile check empty (after every bunx) · `git status --short` empty · corpus check `git diff --stat 52b9d6a..HEAD -- client/src/types/codecs client/src/services server/src/export` **empty** |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

### W1
- **02:** `BrushSelectModal.tsx` disabled-delete tooltip `"No brush is loaded"` → `"No brush project is loaded"` (not in the step list; consistent with the objective). Intro line uses `--text-sm` — the spec's `--font-size-sm` token does not exist.
- **01:** the `.timeline-view--min-rows .timeline-view__scroll` rule sits after the `__scroll` block rather than after `.timeline-view`, to avoid a new `no-descending-specificity` stylelint warning. Task file's `LayerRow.tsx` pointer is stale (lives under `LayerPanel/`).
- **03:** `setViewZoom` ignores non-finite input (spec asked for it; the twin `ViewportUIStore`/`CanvasCameraStore` have no such guard). Private `clampedCopy` helper shared by `setDelta`/`setFillDelta`.
- **05:** Left/Right arrow tab navigation implemented as specified, but the reference `ColorPicker.tsx` has no arrow-key handler — the delta picker is slightly more keyboard-capable than the colour picker. Target row renders above the "Select a layer" empty state with grey swatches.
- **04:** none.

### W2
- **06:** `useBrushCamera` owns and returns `containerRef` (re-created when the surface mounts) instead of taking it as an argument — `useCanvasViewport` binds listeners in an effect keyed on the ref object, and the brush surface is conditionally mounted behind an EmptyState; passing a once-created ref left the listeners unbound. Pinned by a test. Cursor: `grabbing` only during a middle/alt pan — the pixel container has no `grab`/`grabbing` rule to copy. `combinedScale` is computed in the adapter hook (one place) and passed through the container. Grid-visibility threshold still keys on `zoom` only (unchanged tool behaviour); a pinched-in view does not toggle the grid — open item. `brushUI.zoomBy`/`setZoom` are now unused by any gesture (no zoom control exists).
- **06 blur comparison (measured before the change):** both chains are 1:1 backing + one CSS `scale()` + `image-rendering: pixelated`; no `will-change`/`filter`/`backdrop-filter` on any brush-studio ancestor CSS. The one divergence was that every pinch/ctrl-wheel made `brushUI.zoom` fractional (e.g. 11.83 px/cell) and it never returned to an integer. Gestures now change `viewZoom` only; `zoom` stays integer.
- **08 (gate red on first pass, one follow-up):** making `BrushToolContextArgs.fillDelta` required broke two sibling rigs outside the task's Touches (`containers/brush/__tests__/brushFill.test.ts`, `brushSelection.test.ts`: 2 tsc errors, 4 test failures). The executor stopped and reported per instructions; the coordinator confirmed the failures and dispatched one follow-up that changed only those two test files (allowed by MASTER §10 "co-located test that breaks purely from a changed argument"). Flood/gaussian assertions now prove the FILL delta is copied, per D9.
- **08:** `shapeCommitCells(points, outlineKeys, slots)` takes a `BrushShapeSlots` object rather than five positional args (container line budget). Outline keys are computed inside the context's preview wrappers from the generator's own `from`/`to` and reported via a new optional `setShapeOutlineKeys` arg — same result as a `lastShapeAimRef`, provably consistent with the preview. **Step 3 (`useBrushHover.ts`) skipped:** measured, the hover marker on both canvases is the fixed faint cyan `HOVER_MARKER_STYLE` (`renderHoverMarker.ts:52-58`), so there is no delta-tinted hover colour to reroute; tinting it would be a new design, not parity. `BrushGestureHost.setDelta` keeps its name (doc says it writes the active slot).
- **09:** new helper `containers/brush/brushPanes.ts` (+ `__tests__/brushPanes.test.ts`), allowed by the task's Constraints. It holds more than the suggested pane-control builder: `brushPaneScene` (Layer = selected layer alone, forced visible via a shallow copy that keeps the same `pixels` ref) and `useBrushPaneRender`, the pane compositor (frame canvas ref, reused RGBA buffer, `renderBrushFrame`, shape preview, `useCanvasRender`, `registerLayerCanvas`). Reason: with the spec's edits the container measured 411 counted lines; moving only the controls left ~405; moving the compositor landed at 370. Coordinator spot-check: the helper imports no MobX, redraws through `useCanvasRender` keyed on `pixelVersion`/`domainVersion`, grids untouched. `brushPaneControls` returns the full `CanvasViewControlsProps` (reset included). `paneCamera` not annotated `: CanvasCamera` (inferred union is assignable). `useBrushSelection` already had `enabled` gating the keydown binding — only its doc comment changed.
- **07:** none in behaviour; extra tests beyond the two named (typing guard in brush mode, re-bind after leaving brush mode, edge-side slider, Reset, disabled).

### W5
- **10 Prettier sweep:** `bunx prettier --check` over all 39 non-doc files this plan touched (from `git log --name-only 52b9d6a..HEAD`) flagged 2 — `ui/components/BrushDeltaPicker/BrushDeltaPicker.tsx` and its `__tests__/BrushDeltaPicker.dom.test.tsx` — whitespace-only line wraps (+7/−3). Committed alone as `0de1bda`; tsc and the two suites that render the picker (`BrushDeltaPicker`, `BrushStudioPanelContainer`: 32/32) re-run green, then the full `bun run verify` was re-run at `97fea4b`. Root `format:check` only covers `client/src/types/**` and config files, which is why the W1 gate did not see it.
- **10 gate note:** the stylelint command exits 2 because of the two baseline `OtherHand.css` errors; the plan's criterion is "≤ baseline", not exit 0, and the count is unchanged (2 / 69).
- **10 no code changes:** `touchDistance` (`containers/brush/brushToolContext.ts:417`) is still exported and referenced only by its own test — left in place per the task's "no feature code changes" constraint; recorded under Open items.
- **10 no browser checks:** none of the owed manual checks were performed in W5 either; the plan closes with every manual row still open.

## Notes for the next session

### Manual checks owed from W1 (nobody has performed these)
- **01 timeline:** 1-layer brush → rail shows header + five row-heights of blank grid; a 6th layer grows it; pixel-studio rail unchanged in `frames` and `timeline` views; `--rail-scale` steps still scale the floor.
- **02 naming:** brush-mode header reads "Brush Projects"; modal shows title + intro line + renamed actions; pixel mode still reads "Projects" / "Switch Project".
- **05 picker (Storybook):** tabs switch on click; swatches follow the sliders in `Interactive`; swap exchanges them.
- 03 and 04 are store-only; no manual checks.

### Manual checks owed from W2 (nobody has performed these)
- **06 canvas (desktop + iPad, brush mode):** (1) two-finger pan; pinch about the finger midpoint without drift; (2) Pencil + resting finger keeps drawing; with Pencil-only on, a lone finger does nothing; (3) ctrl/⌘-wheel zooms about the pointer, plain wheel pans, middle/alt drag pans; (4) Reset View recentres and sets view zoom 1; (5) zoom-out floor ~50 screen px; (6) **blur:** brush cells as crisp as pixel-studio cells at integer and non-integer view zoom on the iPad — if not, log `combinedScale`, `zoom`, `viewZoom`, `devicePixelRatio` via the dev-only `/api/debug/log` sink before touching CSS; (7) switching brush/frame re-seats the view.
- **09 split view (brush mode):** "Open Layer view" splits 50/50; Layer pane shows only the selected layer and follows layer selection; each pane pans/zooms independently (shared px/cell zoom); Swap reorders without a flash; Close returns to one pane; Escape/Delete act once with two panes open; portrait iPad stacks the panes; painting in either pane updates both.
- **08 edge/fill writes (brush mode):** set Edge red-ish and Fill blue-ish; a rectangle in "both" mode previews AND commits a red outline with a blue interior; flood fill uses blue; pencil uses red; eyedropper with Fill active loads the sampled cell into Fill; one ⌘Z per shape.
- **07 panel/hotkey:** brush-mode panel shows Edge/Fill tabs with swatches; editing under Fill leaves Edge alone; `X` swaps deltas in brush mode; `X` still swaps colours in pixel mode.

## Manual QA checklist (owed — none performed by executors)

Consolidated from the per-wave notes above (tasks 01, 02, 05, 06, 07, 08, 09). No executor or
coordinator opened a browser or an iPad during this plan; every row is unverified. `☐` = owed on
that device, `n/a` = not applicable there. All rows are in **brush mode** unless stated.

| # | Task | Check | Desktop | iPad |
| --- | --- | --- | --- | --- |
| 1 | 01 timeline | Load a 1-layer brush: the bottom rail shows the header plus five row-heights of blank grid (not one 32 px row) | ☐ | ☐ |
| 2 | 01 timeline | Add a 6th layer: the rail grows past the floor | ☐ | ☐ |
| 3 | 01 timeline | Pixel studio rail is unchanged in both `frames` and `timeline` views (no floor there) | ☐ | ☐ |
| 4 | 01 timeline | `--rail-scale` steps still scale the floored rail | ☐ | ☐ |
| 5 | 02 naming | Brush-mode header button reads "Brush Projects" ("No brush project" fallback with nothing loaded) | ☐ | ☐ |
| 6 | 02 naming | Modal shows the "Brush Projects" title, the intro line, "New Brush Project", "Delete Current Brush Project", "Current brush project", and the empty state "No brush projects yet. Create one to start." | ☐ | ☐ |
| 7 | 02 naming | Left rail header reads "Brush Projects" | ☐ | ☐ |
| 8 | 02 naming | Pixel mode still reads "Projects" / "Switch Project" | ☐ | ☐ |
| 9 | 05 picker | Storybook `BrushDeltaPicker`: Edge/Fill tabs switch on click | ☐ | n/a |
| 10 | 05 picker | Storybook `Interactive`: the swatches follow the sliders | ☐ | n/a |
| 11 | 05 picker | Storybook: Swap exchanges the two swatches | ☐ | n/a |
| 12 | 06 canvas | Two-finger pan; pinch zooms about the finger midpoint without drift (same curve as the pixel canvas) | n/a (no touch) | ☐ |
| 13 | 06 canvas | Pencil + a resting finger keeps drawing; with Pencil-only on, a lone finger does nothing | n/a | ☐ |
| 14 | 06 canvas | ctrl/⌘-wheel zooms about the pointer; plain wheel pans; middle-drag and alt-drag pan (cursor `grabbing`) | ☐ | ☐ (trackpad/mouse attached) |
| 15 | 06 canvas | Reset View recentres and sets view zoom to 1 | ☐ | ☐ |
| 16 | 06 canvas | Zoom-out floor: the brush never shrinks below ~50 screen px | ☐ | ☐ |
| 17 | 06 blur | Brush cells are as crisp as pixel-studio cells at integer **and** non-integer view zoom; if not, log `combinedScale`, `zoom`, `viewZoom`, `devicePixelRatio` via the dev-only `/api/debug/log` sink **before** touching CSS | ☐ | ☐ (primary) |
| 18 | 06 canvas | Switching brush project or frame re-seats the view (no stale pan/zoom) | ☐ | ☐ |
| 19 | 07 panel | Brush-mode delta panel shows Edge/Fill tabs with swatches; editing under Fill leaves Edge alone (and vice versa) | ☐ | ☐ |
| 20 | 07 hotkey | `X` swaps deltas in brush mode; `X` still swaps colours in pixel mode; typing in an input does not trigger it | ☐ | ☐ (hardware keyboard) |
| 21 | 08 writes | Edge red-ish, Fill blue-ish: a rectangle in "both" mode **previews and commits** a red outline with a blue interior | ☐ | ☐ |
| 22 | 08 writes | Flood fill (and gaussian fill) paint the fill delta; pencil / line / outline paint the edge delta; eraser erases | ☐ | ☐ |
| 23 | 08 writes | Eyedropper writes the **active** slot: with Fill active the sampled cell lands in Fill, with Edge active in Edge | ☐ | ☐ |
| 24 | 08 writes | One ⌘Z undoes a whole "both" shape (one transaction) | ☐ | ☐ |
| 25 | 09 panes | "Open Layer view" splits 50/50; the Layer pane shows only the selected layer and follows layer selection | ☐ | ☐ |
| 26 | 09 panes | Each pane pans/zooms independently (shared px/cell zoom, separate view zoom) and has its own Reset View | ☐ | ☐ |
| 27 | 09 panes | Swap reorders the panes without a flash; Close returns to a single pane | ☐ | ☐ |
| 28 | 09 panes | Escape / Delete act exactly once with two panes open (keyboard owner) | ☐ | ☐ (hardware keyboard) |
| 29 | 09 panes | Portrait iPad stacks the panes vertically | n/a | ☐ |
| 30 | 09 panes | Painting in either pane updates both panes and the timeline thumbnails | ☐ | ☐ |

## Open items

- **Other-Hand rail Edge/Fill/Swap widgets in brush mode** — out of scope by MASTER §1; the rail still drives the colour picker only.
- **Lasso** — still deferred (carried over from plan 01).
- **Per-pane selection masks** — each pane keeps its own container-local mask; the two panes do not share a selection (MASTER assumption, task 09).
- **`touchDistance` dead export** — still present at `client/src/containers/brush/brushToolContext.ts:417`; referenced only by `brushToolContext.test.ts`. Not removed (W5 is docs-only).
- **Grid-visibility threshold keys on `zoom`, not `combinedScale`** — `GRID_MIN_ZOOM = 8` at `BrushCanvasContainer.tsx:110`, used at `:452`; a pinched-in view does not toggle the grid (task 06 deviation).
- **`useBrushHover` not delta-tinted** — the hover marker is the fixed cyan `HOVER_MARKER_STYLE`; task 08 step 3 skipped as "new design, not parity".
- **`brushUI.zoomBy` / `setZoom` unused by any gesture** — no zoom control exists after task 06; the methods remain on the store (still unit-tested).
- **Cursor** — `grabbing` only during a middle/alt pan; no `grab` idle rule (no pixel-canvas precedent to copy).
- **`BrushUIStore.setViewZoom` ignores non-finite input** — the twin `ViewportUIStore` / `CanvasCameraStore` have no such guard (task 03).
- **Delta picker keyboard** — Left/Right arrow tab navigation exists on `BrushDeltaPicker` but not on `ColorPicker` (task 05).
- **Stylelint baseline** — the two pre-existing `OtherHand.css:338,359` token errors remain; this plan neither added nor fixed any.
- **Plan 01 ledger** — `docs/01-brush-studio/HANDOFF.md` still lists 29 owed manual rows on top of the 30 above.
