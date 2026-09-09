# HANDOFF — Brush Studio follow-ups

**Current position:** W2 IN PROGRESS
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `d254b1b` (W1 complete, 2026-09-09)

Planned 2026-09-09 from `feat/01-brush-studio` @ `4ed1d3c` with a clean tree. The plan-01 ledger
(`docs/01-brush-studio/HANDOFF.md`) still lists 29 owed manual QA rows; the owner's first pass
produced the four requests this plan addresses.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 02 `c2bf857` · 04 `6bbfad6` · 03 `b6976f1` · 01 `ea7e8f2` · 05 `d254b1b` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 184 files / 3859 tests passed (baseline 183 / 3825) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.18s · no lockfile |
| W2 | 06, 07 | IN PROGRESS | 2026-09-09 | | |
| W3 | 08 | TODO | | | |
| W4 | 09 | TODO | | | |
| W5 | 10 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

### W1
- **02:** `BrushSelectModal.tsx` disabled-delete tooltip `"No brush is loaded"` → `"No brush project is loaded"` (not in the step list; consistent with the objective). Intro line uses `--text-sm` — the spec's `--font-size-sm` token does not exist.
- **01:** the `.timeline-view--min-rows .timeline-view__scroll` rule sits after the `__scroll` block rather than after `.timeline-view`, to avoid a new `no-descending-specificity` stylelint warning. Task file's `LayerRow.tsx` pointer is stale (lives under `LayerPanel/`).
- **03:** `setViewZoom` ignores non-finite input (spec asked for it; the twin `ViewportUIStore`/`CanvasCameraStore` have no such guard). Private `clampedCopy` helper shared by `setDelta`/`setFillDelta`.
- **05:** Left/Right arrow tab navigation implemented as specified, but the reference `ColorPicker.tsx` has no arrow-key handler — the delta picker is slightly more keyboard-capable than the colour picker. Target row renders above the "Select a layer" empty state with grey swatches.
- **04:** none.

## Notes for the next session

### Manual checks owed from W1 (nobody has performed these)
- **01 timeline:** 1-layer brush → rail shows header + five row-heights of blank grid; a 6th layer grows it; pixel-studio rail unchanged in `frames` and `timeline` views; `--rail-scale` steps still scale the floor.
- **02 naming:** brush-mode header reads "Brush Projects"; modal shows title + intro line + renamed actions; pixel mode still reads "Projects" / "Switch Project".
- **05 picker (Storybook):** tabs switch on click; swatches follow the sliders in `Interactive`; swap exchanges them.
- 03 and 04 are store-only; no manual checks.
