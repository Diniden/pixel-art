# HANDOFF — Brush Studio follow-ups

**Current position:** W5 IN PROGRESS
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `c5d2003` (W4 complete, 2026-09-09)

Planned 2026-09-09 from `feat/01-brush-studio` @ `4ed1d3c` with a clean tree. The plan-01 ledger
(`docs/01-brush-studio/HANDOFF.md`) still lists 29 owed manual QA rows; the owner's first pass
produced the four requests this plan addresses.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 02 `c2bf857` · 04 `6bbfad6` · 03 `b6976f1` · 01 `ea7e8f2` · 05 `d254b1b` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 184 files / 3859 tests passed (baseline 183 / 3825) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.18s · no lockfile |
| W2 | 06, 07 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 07 `79e1913` · 06 `710aeb6` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 186 files / 3889 tests passed · boundaries OK all 5 rules · no lockfile · `BrushCanvasContainer.tsx` 390 / 400 counted lines |
| W3 | 08 | DONE (automated; manual checks owed, see below) | 2026-09-09 | `ae43385` + follow-up `cd3ae4a` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 186 files / 3910 tests passed · boundaries OK all 5 rules · no lockfile · `BrushCanvasContainer.tsx` 389 / 400 counted lines |
| W4 | 09 | DONE (automated; manual checks owed, see below) | 2026-09-09 | `c5d2003` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 187 files / 3919 tests passed · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · no lockfile · `BrushCanvasContainer.tsx` 370 / 400 counted lines |
| W5 | 10 | IN PROGRESS | 2026-09-09 | | |

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
