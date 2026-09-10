# HANDOFF — Pixel-studio Brush tool

**Current position:** W3 IN PROGRESS
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `e7ca913` (W2 complete, 2026-09-09)

Planned 2026-09-09 from `feat/01-brush-studio` @ `8ed9c1d` with a clean tree, directly after plan 11
(`docs/11-brush-studio-followups/`) closed with 30 owed manual QA rows. Plan 01's ledger still lists 29.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 03 `223afaa` · 04 `b9bff35` · 02 `a7f5322` · 01 `59ee342` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 189 files / 3982 tests passed (baseline 187 / 3919) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.13s · 0 `__snapshots__` files in the wave's commits · corpus diff (codecs / services / server export) empty · no lockfile |
| W2 | 05, 06 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 06 `c8e282f` · 05 `e7ca913` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 193 files / 4027 tests passed · boundaries OK all 5 rules · 0 `__snapshots__` files in the wave's commits · no lockfile · `CanvasContainer.tsx` +11 / −0 lines |
| W3 | 07 | IN PROGRESS | 2026-09-09 | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

### W1
- **02 (worth the owner's attention):** any `hsl` layer forces a round trip through the only permitted converters (`rgbToHsl` returns an integer L percent), so an `hsl` layer that edits **only alpha** can nudge an untouched RGB channel by ±1 (measured: base (100,100,100) → (99,99,99,0) with A = −255). Inherent to D5 as locked; pinned and documented in the test. The spec's `prevHsl` vector used two consecutive `hsl` layers, which never leave HSL space; the executor added an hsl → rgb (no-op) → hsl variant that actually exercises the carry through L = 0 (green with the carry, grey without). Prettier run on the two new files only.
- **01:** the toolbar dom test matches `aria-label` by prefix because the button renders `"<label> (<hotkey>)"`. `brushToolContext.test.ts` enumerates the inert set via `it.each`, so `"brush"` was added there (one line, allowed by MASTER §10). Two stale comments updated ("Nothing is ever added.", "Thirteen tools"). Transient failure seen in task 02's not-yet-committed test during the full run — outside 01's scope, green once 02 committed, and green in the coordinator's gate.
- **03:** the store header's list of document-taking methods was stale (omitted `selectedLayerIn`) and now lists all four. Doc-only.
- **05 (out-of-Touches edit, accepted by the coordinator):** `containers/brush/__tests__/brushToolContext.test.ts` gained a six-line carve-out (`if (tool === "brush") continue;` with a comment) in the "inert and gesture tools have no handler body" loop. Task 01 put `"brush"` in `BRUSH_INERT_TOOLS`; task 05 gave it a real handler body for the pixel canvas, so the "no body" claim no longer held. Coordinator verified the brush studio gates inert tools BEFORE consulting the handler table (`BrushCanvasContainer.tsx:170`, `useBrushPointerHandlers.ts:46`), so runtime behaviour in the brush studio is unchanged and the pin was over-strict. This is the fix the coordinator would have dispatched as a follow-up. Prettier also re-wrapped one pre-existing over-long ternary in `toolFootprint.ts`.
- **05 findings:** in the container stroke rig, `mouseDown` and window `mouseUp` must be fired in two separate `act()` calls (the window listener reads a ref that a single `act` leaves stale); `app.history` is the module-singleton `editorHistory`, so per-file tests clear it in `beforeEach`. A press with no brush document loaded writes nothing but still adds one history entry (pinned; same as `strokeControl.end()` on an empty transaction).
- **06:** none in behaviour; tests install the brush through direct store writes rather than a fake API; two extra tests (post-mount reactivity, loading message).
- **04:** loaded-state rows use a `<dl>` (the spec offered it) rather than the pencil's `<label>` markup to avoid a new `selector-max-type` warning; `Size` shows `?` for a null width/height defensively.

## Notes for the next session

### Manual checks owed from W1 (nobody has performed these)
- **01 tool registration (pixel mode):** Brush button sits after the Eraser with a paintbrush icon and "B" printed; pressing `B` selects it (crosshair, nothing paints yet); in the Brush Studio the button is absent and `B` does nothing visible.
- **04 panel section:** deferred until task 06 wires it — with the brush tool selected the section appears above the colour picker and the picker still works; with the pencil selected the section is gone.
- 02 and 03 are pure / store-only; no manual checks.

### Manual checks owed from W2 (nobody has performed these)
- **05 brush draws (desktop + iPad, pixel mode):** (1) fresh load, press `B` → the brush list loads and the first brush becomes the footprint; (2) hover marker = painted cells of the current frame, centred, clipped at the edge, hidden layers absent; (3) click stamps the tinted cells, drag paints a ribbon, ⌘Z removes the whole drag; (4) colour change re-settles the tint; (5) selection mask clips (automated), reflection lines mirror (not automated); (6) iPad Pencil with a resting finger still draws; (7) edit / hide a layer / switch frame in the Brush Studio, return, press `B` → footprint and colours reflect it.
- **06 panel:** section names the loaded brush project, size, frame and layers; colour picker sits below it and still changes the stamp colour; "Open Brush Studio" switches mode.
