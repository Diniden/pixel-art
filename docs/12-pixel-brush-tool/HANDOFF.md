# HANDOFF — Pixel-studio Brush tool

**Current position:** COMPLETE (PARTIAL — every automated gate green; 0 of 20 manual QA rows performed)
**Branch:** `feat/01-brush-studio` (already on it at start; plan-go stays on the feature branch)
**Last commit:** `110b084` (W3 code-adjacent commits complete, 2026-09-09; the `docs(12)` ledger commit recording W3 follows it)

Planned 2026-09-09 from `feat/01-brush-studio` @ `8ed9c1d` with a clean tree, directly after plan 11
(`docs/11-brush-studio-followups/`) closed with 30 owed manual QA rows. Plan 01's ledger still lists 29.

## Coordinator final gate (run by /plan-go after W3, 2026-09-10, tree clean at `38518ad`)

```
bun run verify                        exit 0
  client tsc                          clean
  server tsc                          clean
  client eslint                       ✖ 66 problems (0 errors, 66 warnings)   = baseline
  server eslint                       clean
  prettier --check                    All matched files use Prettier code style!
  client vitest                       Test Files 193 passed (193) · Tests 4027 passed (4027)
  vite build                          ✓ built in 2.32s
client: bun run lint:boundaries       check-boundaries: OK — all 5 boundary rules hold.
client: stylelint "src/**/*.css"      ✖ 71 problems (2 errors, 69 warnings) — errors = pre-existing OtherHand.css:338,359 (= baseline)
client: storybook build               exit 0
server: tsc --noEmit                  exit 0
server: eslint .                      exit 0
server: vitest run                    Test Files 4 passed (4) · Tests 102 passed (102)
lockfile check (repo root)            nothing found
corpus diff 8ed9c1d..HEAD (codecs / services / server export)   empty
__snapshots__ files in 8ed9c1d..HEAD  0
git status --short                    clean
```

Baseline at `8ed9c1d` was 187 files / 3919 tests; the plan added 6 test files and 108 tests.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 03 `223afaa` · 04 `b9bff35` · 02 `a7f5322` · 01 `59ee342` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 189 files / 3982 tests passed (baseline 187 / 3919) · boundaries OK all 5 rules · stylelint 2 errors (pre-existing `OtherHand.css:338,359`) / 69 warnings (= baseline) · storybook ✓ built in 6.13s · 0 `__snapshots__` files in the wave's commits · corpus diff (codecs / services / server export) empty · no lockfile |
| W2 | 05, 06 | DONE (automated; manual checks owed, see below) | 2026-09-09 | 06 `c8e282f` · 05 `e7ca913` | coordinator: tsc exit 0 · eslint 0 errors / 66 warnings (= baseline) · vitest 193 files / 4027 tests passed · boundaries OK all 5 rules · 0 `__snapshots__` files in the wave's commits · no lockfile · `CanvasContainer.tsx` +11 / −0 lines |
| W3 | 07 | DONE (automated; manual checks owed — consolidated below) | 2026-09-09 | formatting `de82901` · ARCHITECTURE.md `110b084` · ledger: the `docs(12)` commit that adds this row | executor final gate (tree at `110b084`, clean): root `bun run verify` **exit 0** — client `tsc --noEmit` exit 0 · `eslint .` `✖ 66 problems (0 errors, 66 warnings)` (= baseline) · `format:check` "All matched files use Prettier code style!" · vitest **193 files / 4027 tests passed** (70.85s) · `vite build` ✓ built in 2.23s · `bun run lint:boundaries` "OK — all 5 boundary rules hold." exit 0 · `bunx stylelint "src/**/*.css"` exit 2, `✖ 71 problems (2 errors, 69 warnings)`, both errors the pre-existing `OtherHand.css:338,359` (= baseline, none new) · `bunx storybook build` ✓ built in 6.18s exit 0 · server `tsc --noEmit` exit 0 · `eslint .` exit 0 · vitest **4 files / 102 tests passed** exit 0 · `git status --short` empty · lockfile check prints nothing · `git diff --stat 8ed9c1d..HEAD -- client/src/types/codecs client/src/services server/src/export` empty · `git log --name-only 8ed9c1d..HEAD \| grep __snapshots__` prints nothing |

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

### W3
- **07 Prettier sweep:** `bunx prettier --check` over every file in `git log --name-only 8ed9c1d..HEAD` found two
  unformatted code files, both task 06's (`containers/PixelStudioPanelContainer.tsx`,
  `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx`): import wrapping, a signature layout, three
  `expect()` wraps. Committed alone as `de82901`; client tsc exit 0 and the affected test 7/7 afterwards. The plan's
  own `docs/12-pixel-brush-tool/*.md` also fail `--check` and were **left alone**: every earlier plan's `docs/NN-*/`
  markdown is unformatted too (measured: 24, 8, 10, 8, 10, 11, 9, 11, 13, 1, 12 files) and `format:check` does not
  cover `docs/`, so formatting them would be a repo-wide convention change, not a sweep.
- **07 ARCHITECTURE.md:** the task file says the "Brush documents" subsection ends with "Camera and panes" /
  "Edge/fill deltas"; it actually continues with "Timeline floor" and a closing "Files" index. The new
  "Brush tool (pixel studio)" bullet sits after "Timeline floor" and before "Files". Prettier-clean (root `*.md` is
  inside `format:check`). Commit `110b084`.
- **07 no feature code changes.** No browser was opened; nothing below is claimed as performed.

## Notes for the next session

### Manual checks owed from W1 (nobody has performed these)
- **01 tool registration (pixel mode):** Brush button sits after the Eraser with a paintbrush icon and "B" printed; pressing `B` selects it (crosshair, nothing paints yet); in the Brush Studio the button is absent and `B` does nothing visible.
- **04 panel section:** deferred until task 06 wires it — with the brush tool selected the section appears above the colour picker and the picker still works; with the pencil selected the section is gone.
- 02 and 03 are pure / store-only; no manual checks.

### Manual checks owed from W2 (nobody has performed these)
- **05 brush draws (desktop + iPad, pixel mode):** (1) fresh load, press `B` → the brush list loads and the first brush becomes the footprint; (2) hover marker = painted cells of the current frame, centred, clipped at the edge, hidden layers absent; (3) click stamps the tinted cells, drag paints a ribbon, ⌘Z removes the whole drag; (4) colour change re-settles the tint; (5) selection mask clips (automated), reflection lines mirror (not automated); (6) iPad Pencil with a resting finger still draws; (7) edit / hide a layer / switch frame in the Brush Studio, return, press `B` → footprint and colours reflect it.
- **06 panel:** section names the loaded brush project, size, frame and layers; colour picker sits below it and still changes the stamp colour; "Open Brush Studio" switches mode.

## Manual QA checklist (owed — none performed by executors)

Consolidated from tasks 01, 04, 05 and 06 and the W1/W2 sections above. **No executor, coordinator or the W3 agent
opened a browser during this plan**; every row is unperformed on both devices. Rows marked "automated" have a
matching test but still owe the visual confirmation. (Plan 01's ledger still lists 29 owed rows and plan 11's 30;
none of those were performed here either.)

| # | Source | Check (pixel mode unless stated; `bun run dev`) | Desktop | iPad |
| --- | --- | --- | --- | --- |
| 1 | 01 | Toolbar: a Brush button sits directly after the Eraser with a paintbrush icon and "B" printed on it | not performed | not performed |
| 2 | 01 | Pressing `B` selects the brush; the cursor is a crosshair | not performed | not performed |
| 3 | 01 | Brush Studio: the Brush button is absent from the toolbar | not performed | not performed |
| 4 | 01 | Brush Studio: pressing `B` does nothing visible (no marker, no writes — see open item 9) | not performed | not performed |
| 5 | 04 / 06 | Brush selected: a "Brush" section appears in the right rail **above** the colour picker; pencil selected: the section is gone and the pencil section shows | not performed | not performed |
| 6 | 04 / 06 | The colour picker below the section still works and picking a colour changes the stamp colour | not performed | not performed |
| 7 | 06 | The section names the loaded brush project, its size (w × h), the current frame as "name (n/N)" and the layer count | not performed | not performed |
| 8 | 06 | "Open Brush Studio" switches to the Brush Studio | not performed | not performed |
| 9 | 04 / 06 | With no brush project on disk (or a failed load) the section shows the empty / failed message with the button; the loading message shows while the list loads | not performed | not performed |
| 10 | 05 | Fresh load in pixel mode, press `B`: the brush list loads and the first brush becomes the footprint without ever visiting the Brush Studio | not performed | not performed |
| 11 | 05 | Hover: the marker is exactly the painted cells of the brush's current frame, centred on the cursor, clipped at the grid edge; hidden brush layers do not appear | not performed | not performed |
| 12 | 05 | Click: those cells land in the selected colour tinted per layer (RGB layers add, HSL layers shift hue / saturation / lightness) | not performed | not performed |
| 13 | 05 | Drag: a continuous ribbon of stamps, no gaps along the segment | not performed | not performed |
| 14 | 05 | Undo (⌘Z / the toolbar) removes the whole drag in one step | not performed | not performed |
| 15 | 05 | Change the selected colour and click again: the tint re-settles from the new base | not performed | not performed |
| 16 | 05 | With a selection active the stamp is clipped to the mask (automated in `pixelBrushTool.dom.test.tsx`) | not performed | not performed |
| 17 | 05 | With reflection lines active the stamp mirrors across them (not automated) | not performed | not performed |
| 18 | 05 | Pencil with a resting finger still draws with the brush tool (touch arbitration unchanged) | n/a | not performed |
| 19 | 05 | Brush Studio round trip: paint a cell / hide a layer / switch frame, return to pixel mode, press `B`: footprint and colours reflect the change | not performed | not performed |
| 20 | 05 | Marker behaviour mid-stroke matches the pencil (does not track during a drag, D12) and hover recompute on a large brush (64×64, 8 layers) feels instant | not performed | not performed |

## Open items

1. **`normal` / `heightmap` layers are footprint-only.** They count as painted cells (the marker shows them and a
   press writes the unchanged base colour there) but contribute nothing to the colour — they target lighting data
   and have no meaning against an RGBA base. Needs a semantics decision (MASTER §1 assumptions, D5).
2. **HSL scale constants await owner confirmation.** ±255 ↔ ±360° for H and ±100 % for S / L
   (`PIXEL_BRUSH_HUE_PER_DELTA = 360 / 255`, `PIXEL_BRUSH_PERCENT_PER_DELTA = 100 / 255`, both only in
   `ui/canvas/tools/pixelBrushStamp.ts`). A re-tune (e.g. ±180°) is a one-line change plus the pinned expectations.
3. **±1 RGB drift from an alpha-only `hsl` layer (W1 deviation, task 02).** Any `hsl` layer forces a round trip
   through the only permitted converters and `rgbToHsl` returns an integer L percent, so an `hsl` layer that edits
   only alpha can nudge an untouched RGB channel by ±1 (measured: base (100,100,100) with A = −255 →
   (99,99,99,0)). Inherent to D5 as locked; pinned and documented in `pixelBrushStamp.test.ts`. Possible fixes,
   both owner decisions: skip the HSL round trip when d0..d2 are all zero, or a float-precision converter.
4. **Fill-slot base colour ignored.** Only the edge colour (`ui.tool.selectedColor`) seeds the stamp;
   `colorTarget` / the fill slot are ignored in v1 (MASTER §1).
5. **Applied groups / target layers ignored.** `appliedGroupId` and mixed-target layers are not consulted; every
   visible layer of the frame stamps onto the active pixel layer.
6. **No brush scaling, spacing or frame animation.** `brushSize` does not scale the stamp; stamps land at every
   rasterised step with no spacing; only the current frame is stamped (out of scope, MASTER §1).
7. **Last-used brush is not remembered.** `BrushStore.init()` loads `brushList[0]`; persisting a name would touch
   `types/codecs/**`, which this plan deliberately avoided (D13).
8. **`setStudioMode` resets the tool to `"pixel"`.** Returning from the Brush Studio requires pressing `B` again
   (unchanged behaviour, D11).
9. **`B` in the Brush Studio selects an inert tool.** The tool is hidden from the toolbar (`BRUSH_HIDDEN_TOOLS`) and
   inert (`BRUSH_INERT_TOOLS`), but the hotkey is not suppressed, so `B` silently selects a tool that does nothing
   until the user picks another (risk register row 7). Follow-up: suppress the hotkey in brush mode.
10. **Accepted test carve-out for the inert-tool pin (W2, task 05, out of Touches).**
    `containers/brush/__tests__/brushToolContext.test.ts` now skips `"brush"` in its "inert and gesture tools have
    no handler body" loop, because task 05 gave the tool a real handler body for the pixel canvas. The brush studio
    gates inert tools before consulting the table (`BrushCanvasContainer.tsx:170`, `useBrushPointerHandlers.ts:46`),
    so runtime behaviour there is unchanged; the pin's wording ("no body") was over-strict and could be re-stated as
    "inert tools are never dispatched".
11. **A press with no brush document loaded still adds one empty history entry** (task 05 finding, pinned) — the
    same as `strokeControl.end()` on an empty pencil transaction; a cosmetic extra undo step.
12. **Stroke test rig findings worth keeping** (task 05): `mouseDown` and the window `mouseUp` must be fired in two
    separate `act()` calls (the window listener reads a ref a single `act` leaves stale); `app.history` is the
    module-singleton `editorHistory`, so per-file tests clear it in `beforeEach`.
13. **Rail "Size" shows `?` for a null width / height** (task 04, defensive) — unreachable with a normalised document.
14. **`CanvasContainer.tsx` grew by 11 lines** and remains over `max-lines` (pre-existing eslint warning; the count of
    66 warnings is unchanged from the baseline).
15. **The plan's `docs/` markdown is not Prettier-formatted**, matching every earlier plan (W3 deviation above).
