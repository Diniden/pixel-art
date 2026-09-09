# HANDOFF — Brush Studio

**Current position:** W9 IN PROGRESS (W1–W8 code-complete; W1/W2/W6/W7/W8 manual checks owed, see Notes)
**Branch:** `feat/01-brush-studio` (cut 2026-09-08 from `feat/09-ipad-pencil-fixes` @ `3845480`)
**Last commit:** `576675c` (W8)

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
| W9 | 21 | IN PROGRESS | 2026-09-08 | | |
| W10 | 22 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

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
- **Coordinator —** cut `feat/01-brush-studio` from `feat/09-ipad-pencil-fixes` instead of staying
  on the 09 branch: every prior plan in this repo has its own `feat/NN-*` branch.

## Notes for the next session
- ~~W5 was blocked on the owner~~ — resolved by the owner's checkpoint commit `be92287` (option A). Options: (A) owner commits (or stashes) the thumbnail-cache
  work so `ApplicationStore.ts` is clean, then re-run `/plan-go` — it resumes at W5; (B) owner
  says "accept a mixed commit" and task 11 stages the whole file (their +73 lines ride along in
  `brush-studio(11)`); (C) owner says "stash it" — the coordinator runs `git stash -u`, executes W5,
  then `git stash pop` (conflict risk in the ctor region of `ApplicationStore.ts`, where both edit).
  Recommended: A.
- **Task 11 must also decide** (see W3/07(g), W4/09): undo/redo bumps brush versions, so a replay
  schedules a brush autosave. Either accept (simplest; the saved doc is correct) or gate the
  brush controller's trigger on `!history.isReplaying`.
- **Manual checks owed for W1/03 (no browser available to executors):** (1) three studio buttons
  render, stacked when the toolbar is vertical, active state on current; (2) Brush → placeholder
  with working "Back to Pixel Studio", project intact; (3) hotkey from pixel↔lighting, from brush →
  pixel; (4) reload while in brush mode boots into the placeholder and Back works; (5) iPad: the
  new button is tappable.
- **Manual checks owed for W8/20** (brush mode): paint a ring, flood-fill inside → interior only,
  one undo entry; gaussian-fill same; eyedropper on a painted cell sets the sliders; move drag
  shifts the layer, out-of-bounds cells dropped, one undo per drag; iPad touch drag. Also:
  StrictMode double-mount of the window `mouseup` listener (jsdom covers bind-only-while-open).
- **Manual checks owed for W7/19 — all eight** (`bun run dev`): (1) Pixel → Brush: header
  "Brushes", empty library, create "Test Brush" 16×16 → loads, layer panel "Layer 1 · RGB",
  timeline 1×1; (2) pencil at delta 0 → grey, R=+255 → red-ish, eraser clears; (3) add HSL
  layer in every frame, add frame (copy) → 2 columns, move layer reorders both, play/stop;
  (4) ⌘Z/⇧⌘Z on brush edits, then Pixel → ⌘Z undoes the project, not the brush; (5) save dot
  pending→saved, `curl 'localhost:3001/api/brush?name=Test%20Brush'` shows cells, reload restores
  brush mode; (6) modal rename updates header, delete → next/empty, project list never shows
  brushes; (7) focus mode hides rails, Other-Hand rail toggles, no origin/trace tools;
  (8) Network tab shows one `GET /api/brushes` (jsdom-proven under StrictMode already).
- **Manual checks owed for W6 (need task 19's mount; fold into the W7 sweep):** 16 — pencil at
  delta 0 paints 127-grey, L=+255 renders blue-ish; eraser clears; line/rect/ellipse preview then
  commit; ⌘Z undoes one whole stroke; 100-cell drag at zoom 16 smooth (< 16 ms frames);
  StrictMode does not double-record; hover marker, wheel/pinch zoom, cursor switching.
  17 — rail thumbnail repaints on frame step and brush switch; delta sliders follow the selected
  layer's channel type; primitives-based Max/Shape buttons look acceptable in the rail.
  18 — playback cycles at 200 ms and stops; edit during playback keeps playing; frame
  add/dup/delete/swap and layer swap/rename from the header; thumbnails repaint on edit.
- **Manual checks owed for W2 (Storybook, `bun run storybook` → http://localhost:6006):**
  12 — channel menu renders *above* the panel un-clipped (jsdom proves the portal, not layout);
  keyboard nav and inline rename felt in a real browser. 13 — visual look only (name validation,
  Escape/backdrop close, delete confirm are jsdom-covered). 14 — slider drag updates the swatch
  live; **iPad numeric keyboard accepts a leading minus** (plain `type="number"`, no `inputMode`).
- **Start-state (2026-09-08):** the tree was dirty with the owner's in-flight thumbnail-cache
  work (18 modified files incl. `stores/ApplicationStore.ts` +73, `containers/CanvasContainer.tsx`,
  `LayerPanelContainer.tsx`, `ThumbnailCanvas`, plus untracked `ui/canvas/thumbnailCache.ts` and
  two `__tests__` dirs). None of it overlaps W1–W4 `Touches`. **Task 11 (W5) touches
  `ApplicationStore.ts`, which is dirty** — before dispatching W5, check whether the owner has
  committed that work; if not, stop and ask rather than let an executor stage a mixed file.
- MASTER §4 line numbers were measured at `37a4bce`; nine plans have landed since (e.g.
  `StudioMode` is now `types/domain.ts:480`, not `:279`). Executors must grep, not trust lines.
