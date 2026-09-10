# HANDOFF — Pixel-studio Brush tool

**Current position:** W2 IN PROGRESS
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `59ee342` (W1 complete, 2026-09-09)

Planned 2026-09-09 from `feat/01-brush-studio` @ `8ed9c1d` with a clean tree, directly after plan 11
(`docs/11-brush-studio-followups/`) closed with 30 owed manual QA rows. Plan 01's ledger still lists 29.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 03 `223afaa` · 04 `b9bff35` · 02 `a7f5322` · 01 `59ee342` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 189 files / 3982 tests passed (baseline 187 / 3919) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.13s · 0 `__snapshots__` files in the wave's commits · corpus diff (codecs / services / server export) empty · no lockfile |
| W2 | 05, 06 | IN PROGRESS | 2026-09-09 | | |
| W3 | 07 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

### W1
- **02 (worth the owner's attention):** any `hsl` layer forces a round trip through the only permitted converters (`rgbToHsl` returns an integer L percent), so an `hsl` layer that edits **only alpha** can nudge an untouched RGB channel by ±1 (measured: base (100,100,100) → (99,99,99,0) with A = −255). Inherent to D5 as locked; pinned and documented in the test. The spec's `prevHsl` vector used two consecutive `hsl` layers, which never leave HSL space; the executor added an hsl → rgb (no-op) → hsl variant that actually exercises the carry through L = 0 (green with the carry, grey without). Prettier run on the two new files only.
- **01:** the toolbar dom test matches `aria-label` by prefix because the button renders `"<label> (<hotkey>)"`. `brushToolContext.test.ts` enumerates the inert set via `it.each`, so `"brush"` was added there (one line, allowed by MASTER §10). Two stale comments updated ("Nothing is ever added.", "Thirteen tools"). Transient failure seen in task 02's not-yet-committed test during the full run — outside 01's scope, green once 02 committed, and green in the coordinator's gate.
- **03:** the store header's list of document-taking methods was stale (omitted `selectedLayerIn`) and now lists all four. Doc-only.
- **04:** loaded-state rows use a `<dl>` (the spec offered it) rather than the pencil's `<label>` markup to avoid a new `selector-max-type` warning; `Size` shows `?` for a null width/height defensively.

## Notes for the next session

### Manual checks owed from W1 (nobody has performed these)
- **01 tool registration (pixel mode):** Brush button sits after the Eraser with a paintbrush icon and "B" printed; pressing `B` selects it (crosshair, nothing paints yet); in the Brush Studio the button is absent and `B` does nothing visible.
- **04 panel section:** deferred until task 06 wires it — with the brush tool selected the section appears above the colour picker and the picker still works; with the pencil selected the section is gone.
- 02 and 03 are pure / store-only; no manual checks.
