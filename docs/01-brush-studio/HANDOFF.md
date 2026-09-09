# HANDOFF — Brush Studio

**Current position:** PLAN COMPLETE (PARTIAL) — all 22 tasks code-complete, final gate exit 0 (coordinator re-run on `55e03a7`); 0 of 29 manual QA checks performed (see checklist)
**Branch:** `feat/01-brush-studio` (cut 2026-09-08 from `feat/09-ipad-pencil-fixes` @ `3845480`)
**Last commit:** `67661db` (W10 — `ARCHITECTURE.md`; the docs close-out commit follows it)

Planned 2026-08-29 from `feat/rail-layout-controls` @ `37a4bce` with a dirty worktree (103
uncommitted files of unrelated in-flight work — see MASTER §4). Executors stage only their
`Touches` files.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 05 | PARTIAL (code DONE, gate green; task 03 manual checks owed) | 2026-09-08 | `f1d0e0b` | client: tsc clean · eslint 0 err/65 warn · vitest 165 files, 3394 tests pass (baseline 164/3362), no snapshot diff · boundaries OK · server: tsc clean · vitest 102 pass (52+50) · eslint clean · no lockfile |
| W2 | 04, 06, 12, 13, 14, 15 | PARTIAL (code DONE, gate green; Storybook visual checks owed for 12/13/14) | 2026-09-08 | `226da76` | tsc clean · eslint 0 err/65 warn · vitest 170 files, 3480 tests pass (W1: 165/3394), no snapshot diff · boundaries OK · stylelint 2 errors = pre-existing `OtherHand.css:338,359` baseline, 0 new · storybook ✓ built in 6.02s · no lockfile |
| W3 | 07, 10 | DONE | 2026-09-08 | `fe9ee25` | tsc clean · eslint 0 err/65 warn · vitest 173 files, 3549 tests pass (W2: 170/3480), no snapshot diff · boundaries OK · no lockfile |
| W4 | 08, 09 | DONE | 2026-09-08 | `ea4d592` | tsc clean · eslint 0 err/66 warn (+1 `max-lines` on `BrushStructureStore.ts`, same as the other domain stores) · vitest 175 files, 3647 tests pass (W3: 173/3549), no snapshot diff · perf: 100-write drag on 64×64 worst 1.372 ms, undo 0.587 ms, redo 0.556 ms (budget 16 ms) · boundaries OK · no lockfile |
| W5 | 11 | DONE | 2026-09-08 | `6de0317` | tsc clean · eslint 0 err/66 warn · vitest 176 files, 3658 tests pass (W4: 175/3647), no snapshot diff · boundaries OK · no lockfile. (Was BLOCKED on the dirty `ApplicationStore.ts`; owner committed it as `be92287`; W4 gate re-run green on that HEAD before dispatch.) |
| W6 | 16, 17, 18 | PARTIAL (code DONE, gate green; manual checks deferred to W7/19 by design — nothing mounted yet) | 2026-09-08 | `f2474d3` | tsc clean · eslint 0 err/66 warn · vitest 177 files, 3703 tests pass (W5: 176/3658), no snapshot diff · boundaries OK · stylelint 2 errors = `OtherHand.css` baseline, 0 new · no lockfile |
| W7 | 19 | PARTIAL (code DONE, gate green; all 8 manual checks owed) | 2026-09-08 | `04335d7` | tsc clean · eslint 0 err/66 warn · vitest 179 files, 3709 tests pass (W6: 177/3703), no snapshot diff · boundaries OK · stylelint 2 errors = `OtherHand.css` baseline, 0 new · storybook ✓ built in 6.12s · `bun run build` ✓ 2.16s · no lockfile |
| W8 | 20 | PARTIAL (code DONE, gate green; 5 manual checks owed) | 2026-09-08 | `576675c` | tsc clean · eslint 0 err/66 warn (`max-lines` does NOT fire on the container: 379 counted / 400) · vitest 181 files, 3776 tests pass (W7: 179/3709), no snapshot diff · boundaries OK · no lockfile |
| W9 | 21 | PARTIAL (code DONE, gate green; 7 manual checks owed) | 2026-09-08 | `f85d78a` | tsc clean · eslint 0 err/66 warn (`max-lines` off on the container: 498 raw / 379 counted) · vitest 183 files, 3825 tests pass (W8: 181/3776), no snapshot diff · boundaries OK · no lockfile |
| W10 | 22 | PARTIAL (gate DONE; manual QA sweep owed) | 2026-09-08 | `67661db` (`a62ef85` formatting sweep · `67661db` ARCHITECTURE.md) | Full gate at `67661db`: `bun run verify` exit 0 — client+server tsc clean · eslint `✖ 66 problems (0 errors, 66 warnings)` · format:check `All matched files use Prettier code style!` · vitest `Test Files 183 passed (183)` / `Tests 3825 passed (3825)` (W9: 183/3825; no snapshot diff, no `-u`) · `bun run build` `✓ built in 2.16s` · `check-boundaries: OK — all 5 boundary rules hold.` · stylelint `✖ 71 problems (2 errors, 69 warnings)` = `OtherHand.css:338,359` baseline, 0 new · storybook `✓ built in 6.07s` · server tsc clean · server eslint clean · server vitest `Test Files 4 passed (4)` / `Tests 102 passed (102)` · no lockfile · `git status --short` empty. Corpus safety: `git diff --stat 3845480..HEAD -- client/src/types/codecs client/src/services server/src/export` is EMPTY (compared against the plan's base commit `3845480`, not `main`, which is older). First run of `verify` was RED at `format:check` (`types/__tests__/brush.test.ts` unformatted) — fixed by the formatting-only sweep `a62ef85` (3 files, line-wrapping only), then green. |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Coordinator's final gate (re-run on `55e03a7`, 2026-09-08)

```
bun run verify   → eslint ✖ 66 problems (0 errors, 66 warnings) · prettier: All matched files use
                   Prettier code style! · vitest Test Files 183 passed (183) / Tests 3825 passed
                   (3825) · vite ✓ built in 2.20s
lint:boundaries  → check-boundaries: OK — all 5 boundary rules hold.
stylelint        → ✖ 71 problems (2 errors, 69 warnings); both errors OtherHand.css:338,359 (baseline)
storybook build  → ✓ built in 6.00s
server           → tsc clean · eslint clean · vitest Test Files 4 passed / Tests 102 passed
corpus-sensitive → git diff --stat 3845480..HEAD -- types/codecs services server/src/export: empty
lockfile / tree  → none / clean
```

## Deviations
- **W1/03 — one file outside `Touches` edited:** `ui/components/Toolbar/__tests__/Toolbar.dom.test.tsx`
  (committed after the plan baseline; consumed the removed `isLightingMode` prop, so tsc went red).
  Minimal prop rename + switcher count 2→3. No other W1 task touches `Toolbar/`; matrix unaffected.
- **W1/03 —** `Toolbar.tsx` tool-group routing was an unlisted boolean site; made an exhaustive
  `switch` (`"brush"` → pixel tools per D19). Frame Reference button is now pixel-only. Studio
  buttons are data-driven with `--pixel/--lighting/--brush` modifiers (attribute selector dropped).
- **W1/02 —** `create` returns 200 (matches `routes/project.ts`), arrays rejected as documents,
  `listBrushes` also filters stems through `isValidProjectName`, extra export `getBrushPrevFilePath`.
- **W1/02 — residue on the owner's disk:** the curl overwrite check left
  `server/src/data/brushes/.prev/zz-plan-test.json` (~100 B). Harmless (listing ignores `.prev`);
  no API removes `.prev` files; owner may delete by hand.
- **W1/05 —** `DomainStore` diff is 4 added lines (Prettier formats the getter to 3 + blank), not ≤3.
- **W1/01 —** `clampDelta` folds `-0` → `+0`; `normalizeBrushDocument` floors fractional
  width/height and fills missing frame/layer ids by index (spec said "lenient", gave no rule).
- **W2/15 — prop shape:** `hiddenRails?: ReadonlySet<"left"|"right"|"bottom">` instead of the task's
  `focusMode: boolean` (both existing layouts dropped `focusMode` on 2026-08-30; `useRailLayout()`
  returns `hiddenRails`, and task 19 spreads it). Also passes through `canvasOverlay?`/`railDismiss?`.
  **Follow-up for 19/22:** `ui/layouts/__tests__/layouts.dom.test.tsx` mounts every story of the
  three older layouts; add a `BrushStudioLayout` block there.
- **W2/06 —** `PixelBuffer` imported from `./renderNormalEdit` — `renderScene.ts` no longer exists
  (deleted by plan 05). `renderBrushLayer` paints regardless of `visible` (thumbnails show hidden
  layers' content); `renderBrushFrame` skips hidden layers. Digest pinned: `16x16:682f7e4d`.
- **W2/12 —** extra `BrushChannelMenu.css` (kept the sheet under ~300 lines), `BrushLayerRowModel`
  gained optional `appliedGroupId?: string | null` (menu needs the id to tick the active group;
  falls back to name match), 19-test jsdom suite added under `__tests__/`.
- **W2/13 —** extra `BrushLibrary/brushName.ts` (shared validator), `storyFixtures.ts`, two jsdom
  suites (25 tests); `BrushSelectModal` built on the `Modal` + `ConfirmDialog` primitives (not
  `ProjectSelectModal`'s hand-rolled overlay) and gained optional `container?: HTMLElement | null`.
- **W2/14 —** composed `Slider` + `NumberInput` directly (zero tick needs a positioned track wrapper;
  `SliderWithNumber` doesn't forward `disabled`); swatch is a `div role="img"`, not `ColorSwatch`;
  optional `className?` prop; 12-test jsdom suite. Positive values show no `+` prefix.
- **W2/04 —** `brushApi.save` sends no `syncOriginHeaders()` (D12: no broadcast); `notFoundHandlers()`
  gained a `*/api/brush` 404 entry.
- **W3/07 — contracts downstream tasks must honour:** (a) `commit(label, mutate, options?: { bumpPixels?: boolean })`
  — third arg added so structural ops that change rendering (hide layer, delete frame) redraw
  without a separate `bumpPixelVersion()`; (b) **`createBrushPixelCommand.undo()` reverses the
  cells itself** — `BrushPatchHost.applyPatch` receives them already ordered and must NOT reverse
  again (differs from `PixelStore`, where the host reverses); (c) `installDocument` accepts `null`;
  (d) `loadBrush` sets `brushName`; (e) `createBrush` re-loads from the API after create;
  (f) snapshot commands keep `before` by reference (documents are immutable per D8);
  (g) `restore` during replay bumps versions, so an undo schedules a brush autosave once
  `isReplaying` clears — unlike the pixel project. **Task 11 must decide whether that is wanted.**
- **W3/10 —** mobx 7 exports `observable.ref` as `observableRef` (repo-wide convention). Extra
  `selectedLayerIn(doc)`, exported `BRUSH_ZOOM_MIN/MAX/DEFAULT` + `BrushDeltaIndex`; `setZoom`
  ignores non-finite input; `setDelta` clamps and copies; no `hydrate` (nothing persisted).
  **Task 11 must wire `reaction(() => brushes.document, doc => brushUI.adoptDocument(doc))`** —
  the UI store does not observe the domain itself.
- **W4 — commit collision, resolved:** executors 08 and 09 shared the git index; 09's `git commit`
  swept 08's staged files into `bc226dc`. 09 repaired it (`reset --soft`, recommitted its own two
  files as `40b5e57`, left 08's files staged); the coordinator then committed 08's files as
  `ea4d592` with 08's prepared message. `bc226dc` is unreachable. Content verified identical.
  **Lesson for later waves:** parallel executors in one worktree must `git commit -- <paths>`
  (pathspec form), not bare `git commit`.
- **W4/08 —** delete ops move the selection only when the deleted item was selected;
  `assertUniformLayers` runs unconditionally (throw aborts before `history.record`); no phantom
  history entries for same-value ops (`reorderFrame` to own slot, same channel type, same group,
  same size); `duplicateLayer` inserts directly above its source; `toggleLayerVisibility` writes
  `!frames[0].visible` to every frame. File is 447 lines (`max-lines` warning, not error).
- **W4/09 —** `moveLayerCells(dx, dy, opts?: { trackHistory? })` — no mask (masked move = task 21);
  `setCells` clamps deltas on the way in; **`applyPatch` bumps `pixelVersion` during replay** (the
  brush canvas has no dirty channel) so an undo wakes the brush autosave — consistent with 07(g);
  a composite undo bumps once per child inside one action; strict target resolution (stale id →
  no-op, no frame-0 fallback). **Not done:** MASTER risk-register's "pixel store asserts layer
  exists in every frame" — `resolveTarget` checks the selected frame only. Extra exports
  `BrushSelectionSource`, `BrushMoveOptions`, `ResolvedBrushTarget`, `brushCellsEqual`.
- **W5/11 — replay-autosave ACCEPTED:** a brush undo/redo schedules one debounced save of the
  restored document once `isReplaying` clears (the file then matches what the owner sees after
  ⌘Z). Pinned by a test; comment at the brush autosave construction site.
- **W5/11 —** brush stores constructed after `selectionUI` (the last pixel-studio store), before
  `makeObservable`/`autoSave`; `brushUI.adoptDocument` wired via `BrushStore`'s
  `onDocumentInstalled` dep (no extra reaction); `brushApi.save(doc, name ?? "")` instead of
  `name!`; project undo path still goes through `historyOps`/`historyControl`, brush path is a
  bare `HistoryStore` call. **Design consequence to keep in mind (19/22):** both autosave
  controllers share `SessionStore` — they write the same `saveStatus` dot and `BrushStore` flows
  toggle the same `saveSuspended` the project controller reads.
- **W6/16 — rendering model differs from the task text (task predates plan 05):** `CanvasSurface`
  is now 1:1 with `combinedScale` doing magnification, checkerboard is CSS, grid is SVG — so no
  `renderNormalEdit`/`paintCheckerboard`/`strokeGrid`. The frame is an `ImageData` from
  `renderBrushFrame`, `putImageData` onto one layer canvas, `combinedScale = brushUI.zoom`, grid
  via `gridOverlayPath` at zoom ≥ 8. Shape preview is painted into the frame render. Inert set is
  broader (also `reflection`, `pose`, `normal-pencil`, `auto-normal`, `height-map`). Camera:
  ctrl/meta+wheel zoom, plain wheel pan, two-finger pinch zoom; **space/middle-drag pan omitted**.
  Window-level `mouseup` ends strokes. 45 unit tests drive the real `toolHandlers`. 497 raw lines
  (under `max-lines` after moving geometry into `containers/brush/`).
- **W6/17 —** rail `thumbnailRevision = (pixelVersion + domainVersion) * 65536 + selectedFrameIndex`
  (frame selection bumps no counter). Studio panel composed from primitives (`Panel`,
  `SliderWithNumber`, `Field`, `Button`), with Pencil **and Eraser** sections; stroke section is
  a lowercase render helper (react-refresh lint). Layer panel container returns `null` with no
  document. Modal container omits the `container?` prop.
- **W6/18 —** `TimelineView` has no frame-op props, so the five frame buttons (add / duplicate /
  delete / left / right) render in the `viewModeDropdown` slot beside a static "Timeline" label,
  styled with `timeline-view__action-btn`. **Task 19/22 may lift this into a pure `ui/` component.**
  Thumbnail cache not used (no `cacheKey` on `TimelineCell`; layer ids are uniform across frames
  so an id key would collide). Drag callbacks are inert no-ops (a drag ghost still appears).
  `onOpenPreview` no-op. Header ops keyed by layer NAME (pure component contract). No unit test
  (no precedent to copy). Root wrapped in `.frame-timeline` for CSS parity.
- **W7/19 — two test files outside `Touches`** (co-located-test precedent):
  `containers/__tests__/BrushStudioContainer.dom.test.tsx` (brush branch mounts every region;
  StrictMode → exactly one `GET /api/brushes`; header reads "Brushes"/"No brush" and opens the
  brush modal) and `ui/components/Toolbar/__tests__/PixelStudioTools.dom.test.tsx` (13 → 12 tool
  buttons). `reference-trace` has no tool-table entry, so `hiddenTools` containing it hides the
  reference-image group + divider. `ToolbarContainer.tsx` untouched (03's `toolsForStudio` already
  routes brush → pixel tools). No exhaustiveness gate exists in `PixelStudioTools.tsx`. Header
  rename copy is now name-agnostic. `HeaderContainer` passes `brushList` as `projectList` in brush
  mode so duplicate-rename checks the right list. **Cosmetic debt:** `RAIL_LABELS` in
  `hooks/useRailLayout.tsx` still says "Objects & Layers" over the brush library.
- **W8/20 — executor died mid-task (API rate limit) and was resumed by a second executor**, which
  audited the uncommitted work, kept all of it, and fixed three defects in it (a test helper
  scoped inside one `describe` → 6 tsc errors; a wrong expectation in the round-trip move test;
  Prettier). Extra files under `containers/brush/` (allowed): `useBrushPointerHandlers.ts` (the
  mouse/touch device layer lifted out of the container, store-free) + a 22-test dom suite.
  Eyedropper uses `copyDelta(cell)`; move applies steps live so a round-trip records one net-zero
  entry (matches the pixel canvas). Extra exports `brushCursor`, `pickBrushDelta`,
  `BRUSH_MOVE_LABEL`, `BrushGestureHost/Controller`, `BRUSH_GESTURE_TOOLS`.
- **W9/21 — `SelectionUIStore` reuse: NO** (its geometry helpers `pack/unpack :59-65`,
  `computeBounds :67-82`, `clampBoxToMask :84-100`, `isPointInPolygon :102-120` are module-private
  and every public entry writes the pixel studio's observable mask). Brush-local
  `containers/brush/brushSelection.ts` instead. **Lasso DEFERRED** (rectangle only). Extra files
  under `containers/brush/`: `useBrushSelection.ts` (+ dom test), `useBrushHover.ts`,
  `useBrushCamera.ts` (verbatim lifts from the container to stay under `max-lines`). Marching
  ants are SVG chrome via `CanvasSurface`'s `marchingAnts` slot (a 1:1 backing store cannot draw
  a 1-screen-px dashed line — the defect the pixel canvas fixed 2026-09-07); mask fill and drag
  preview use `renderSelectionOverlay` on the overlay canvas. Move-selection issues `clears` then
  `writes` as two `setCells` inside one transaction (one undo entry, label "Move selection";
  degenerate all-off-grid case labels "Draw"). Selection resets on `loadGeneration` or grid-size
  change; not persisted, not undoable. `brushCursor("selection")` is `"crosshair"`.
- **Coordinator —** cut `feat/01-brush-studio` from `feat/09-ipad-pencil-fixes` instead of staying
  on the 09 branch: every prior plan in this repo has its own `feat/NN-*` branch.

## Notes for the next session
- ~~W5 was blocked on the owner~~ — resolved by the owner's checkpoint commit `be92287` (option A). Options: (A) owner commits (or stashes) the thumbnail-cache
  work so `ApplicationStore.ts` is clean, then re-run `/plan-go` — it resumes at W5; (B) owner
  says "accept a mixed commit" and task 11 stages the whole file (their +73 lines ride along in
  `brush-studio(11)`); (C) owner says "stash it" — the coordinator runs `git stash -u`, executes W5,
  then `git stash pop` (conflict risk in the ctor region of `ApplicationStore.ts`, where both edit).
  Recommended: A.
- ~~**Task 11 must also decide** (see W3/07(g), W4/09)~~ — resolved by W5/11: replay-autosave
  ACCEPTED (see Deviations).
- **Start-state (2026-09-08):** the tree was dirty with the owner's in-flight thumbnail-cache
  work (18 modified files incl. `stores/ApplicationStore.ts` +73, `containers/CanvasContainer.tsx`,
  `LayerPanelContainer.tsx`, `ThumbnailCanvas`, plus untracked `ui/canvas/thumbnailCache.ts` and
  two `__tests__` dirs). None of it overlaps W1–W4 `Touches`. **Task 11 (W5) touches
  `ApplicationStore.ts`, which is dirty** — before dispatching W5, check whether the owner has
  committed that work; if not, stop and ask rather than let an executor stage a mixed file.
  (Resolved by the owner's checkpoint `be92287`.)
- MASTER §4 line numbers were measured at `37a4bce`; nine plans have landed since (e.g.
  `StudioMode` is now `types/domain.ts:480`, not `:279`). Executors must grep, not trust lines.

### Manual QA checklist (owed — none performed by executors)

No executor in W1–W10 had a browser or the iPad; **nothing below has been run.** This list
consolidates every per-wave manual check that was owed (W1/03, W2, W6/16–18, W7/19, W8/20,
W9/21, W10/22). Run it in one sitting with `bun run dev` (Storybook items via
`bun run storybook` → http://localhost:6006) and record pass/fail per row. `—` = not applicable
on that device.

| # | Check (source) | Desktop | iPad |
| --- | --- | --- | --- |
| 1 | Three studio buttons (Pixel / Lighting / Brush) render, stacked when the toolbar is vertical, active state on the current mode (W1/03) | owed | owed — new button tappable |
| 2 | Brush → brush studio; Pixel button returns; the pixel project is intact afterwards (W1/03) | owed | owed |
| 3 | Studio hotkey toggles pixel↔lighting; from brush it goes to pixel (W1/03, D22) | owed | — |
| 4 | Reload while in brush mode boots into the brush studio and Pixel still works (W1/03) | owed | owed |
| 5 | Storybook `BrushLayerPanel`: channel menu renders *above* the panel un-clipped; keyboard nav and inline rename feel right (W2/12) | owed | — |
| 6 | Storybook `BrushSelectModal`: visual look (validation / Escape / backdrop / delete-confirm are jsdom-covered) (W2/13) | owed | — |
| 7 | Storybook `BrushDeltaPicker`: slider drag updates the swatch live (W2/14) | owed | owed — numeric keyboard accepts a leading minus (plain `type="number"`, no `inputMode`) |
| 8 | Pixel → Brush: header reads "Brushes", empty library, create "Test Brush" 16×16 → loads, layer panel "Layer 1 · RGB", timeline 1×1 (W7/19 #1) | owed | owed |
| 9 | Pencil at delta 0 paints 127-grey; R=+255 red-ish, L=+255 (HSL) blue-ish; eraser clears (W6/16, W7/19 #2) | owed | owed — Pencil paint |
| 10 | Line / rect / ellipse preview then commit; ⌘Z undoes one whole stroke; StrictMode does not double-record (W6/16) | owed | owed |
| 11 | 100-cell drag at zoom 16 stays smooth (< 16 ms frames); hover marker; wheel/pinch zoom; cursor switching (W6/16) | owed | owed — finger pan / pinch zoom |
| 12 | Add HSL layer (appears in every frame); add frame (copy) → 2 columns; move layer reorders both frames; play / stop (W7/19 #3) | owed | owed — tap buttons |
| 13 | Playback cycles at 200 ms and stops; editing during playback keeps playing; frame add/dup/delete/swap and layer swap/rename from the timeline header; thumbnails repaint on edit (W6/18) | owed | owed |
| 14 | Rail thumbnail repaints on frame step and brush switch; delta sliders follow the selected layer's channel type; primitives-based Max/Shape buttons look acceptable in the rail (W6/17) | owed | owed |
| 15 | ⌘Z / ⇧⌘Z undo brush edits; switch to Pixel → ⌘Z undoes the project, not the brush (W7/19 #4, D10) | owed | — |
| 16 | Save dot pending → saved; `curl 'localhost:3001/api/brush?name=Test%20Brush'` shows cells; reload restores brush mode with the brush as left (W7/19 #5) | owed | owed |
| 17 | Modal rename updates the header; delete → next brush / empty state; the project list never shows brushes (W7/19 #6) | owed | owed |
| 18 | Focus mode hides rails; Other-Hand rail toggles; no origin / reference-trace tools in brush mode (W7/19 #7) | owed | owed |
| 19 | Network tab shows exactly one `GET /api/brushes` on entering brush mode (jsdom-proven under StrictMode) (W7/19 #8) | owed | — |
| 20 | Paint a ring, flood-fill inside → interior only, one undo entry; gaussian-fill behaves the same (W8/20) | owed | owed |
| 21 | Eyedropper on a painted cell sets the delta sliders (W8/20) | owed | owed |
| 22 | Move drag shifts the layer, out-of-bounds cells dropped, one undo entry per drag (W8/20) | owed | owed — touch drag |
| 23 | StrictMode double-mount of the window `mouseup` listener does not double-fire (jsdom covers bind-only-while-open) (W8/20) | owed | — |
| 24 | Selection tool: rect selection → marching ants at the right zoom; pencil outside does nothing, inside paints (W9/21) | owed | owed |
| 25 | Delete clears selected cells; Escape clears the selection; switching brush clears it (W9/21) | owed | owed |
| 26 | Drag inside the selection moves cells with a preview, one undo entry ("Move selection"); StrictMode does not double-apply (W9/21) | owed | owed |
| 27 | First-ever selection: the overlay canvas mount paints the fill on the first frame (W9/21) | owed | owed |
| 28 | iPad touch / pinch abort path during a selection drag (W9/21) | — | owed |
| 29 | Owner's project untouched: open the pixel studio, the project loads, its undo stack behaves (W10/22 step 5 — the `git diff --stat` half is DONE and empty) | owed | — |

### Open items

Cosmetic and deferred work carried out of the plan; none blocks the gate.

- `RAIL_LABELS` in `containers/hooks/useRailLayout.tsx` still says "Objects & Layers" over the
  brush library (W7/19).
- The five timeline frame buttons (add / duplicate / delete / left / right) render in
  `TimelineView`'s `viewModeDropdown` slot beside a static "Timeline" label; could be lifted into
  a pure `ui/` component (W6/18). Timeline drag callbacks are inert no-ops (a drag ghost still
  appears), `onOpenPreview` is a no-op, the thumbnail cache is unused, and the container has no
  unit test.
- Lasso selection DEFERRED — rectangle only (W9/21).
- `ui/layouts/__tests__/layouts.dom.test.tsx` has no `BrushStudioLayout` block (W2/15 follow-up;
  not done by 19 or 22).
- Residue on the owner's disk: `server/src/data/brushes/.prev/zz-plan-test.json` (~100 B,
  W1/02); harmless, owner may delete by hand.
- Both autosave controllers share `SessionStore`: one `saveStatus` dot and one `saveSuspended`
  flag serve the project and the brush (W5/11). A brush undo/redo schedules a brush save
  (accepted, pinned by a test).
- `BrushPixelStore.resolveTarget` checks the selected frame only — it does not assert the layer
  exists in every frame (W4/09; MASTER risk-register item not done).
- Space / middle-drag pan omitted on the brush canvas (W6/16); ctrl/meta+wheel zoom, plain wheel
  pan and pinch zoom exist.
- `ARCHITECTURE.md` still carries the refresh-era "Today / Target" framing and §8 rows pointing
  at the deleted `REFRESH/` tree; W10 only added the brush subsection and one §8 row.
