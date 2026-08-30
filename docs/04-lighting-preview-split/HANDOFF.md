# HANDOFF — Lighting Preview Split

**Current position:** W2 DONE — **W3 BLOCKED, see Deviations**
**Branch:** `feat/03-reflection-tool`
**Last commit:** `a08606d` (task 05); HEAD is `24f09a4`, a plan-03 commit

Planned 2026-08-29 from `feat/02-split-canvas-render-modes` @ `fe06e86` with a clean tree (two
untracked docs entries from a parallel planning session: `docs/plans/reflection-tool.md`,
`docs/03-reflection-tool/` — not ours, never stage them).

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE | 2026-08-29 | `63145d3` | tsc clean · eslint 0 errors / 64 warnings · vitest 119 files, 2029 tests pass · boundaries OK (5 rules) · stylelint 2 pre-existing errors only · no lockfile · corpus digests unchanged |
| W2 | 05 | DONE | 2026-08-29 | `586cfb6`, `cb90966`, `a08606d` | subagent: tsc exit 0 · eslint 0 errors / 1 pre-existing max-lines warning on the file · vitest 123 files, 2130 tests pass · boundaries OK · prettier clean · build ✓ · no lockfile · corpus digests unchanged |
| W3 | 06 | **BLOCKED** | 2026-08-29 | | not dispatched — concurrent session owns the tree |


## Deviations

### 🔴 W3 BLOCKED — a second Claude session is executing plan 03 on this same branch

Discovered 2026-08-29 while verifying W2. **Do not resume W3 until this is resolved.**

- Another session is running `/plan-go` for `docs/03-reflection-tool/` on `feat/03-reflection-tool`,
  the same branch this plan is on. It **rewrote history under us**: the W1 ledger commit `bb9a247`
  is no longer reachable from HEAD, and task 05's step-1 commit changed SHA (`121bcbf` → `586cfb6`)
  between creation and verification.
- **Plan 04's work all survived** — coordinator verified `LightingViewsUIStore.ts` (+ test),
  `renderLitComposite.ts` (+ test), the `onStrokeStart` hook option, the `viewControls` slot,
  `app.lightingViews`, and task 05's `renderMode` prop / `keyboardOwner` gate are present in the
  tree. Nothing of ours was lost.
- **The tree does not currently typecheck**, but every one of the 7 `tsc` errors is in the other
  session's 141 uncommitted lines in `client/src/containers/CanvasContainer.tsx` (half-wired
  reflection imports: `useDashTicker`, `reflectionCanvasRef`, `reflectionLines`,
  `reflectionDraft`, `getCornerCoords` all declared and unused). The committed HEAD version of
  that file contains none of them. **This is not plan 04's breakage.**
- Task 06 must edit `LightingSurface.tsx`, `LightingStudioLayout.tsx` and `ViewportUIStore` while
  deleting the floating panel — with a concurrent writer and a non-compiling tree, its gate could
  not be attributed and a history rewrite could drop the deletions.

**To resume:** let the plan-03 session finish (or land/stash its `CanvasContainer.tsx` work), get
`bunx tsc --noEmit` clean, confirm no further history rewrites, then dispatch task 06.

- ⚠️ A redundant `stash@{0}` (`WIP on feat/03-reflection-tool: bb9a247`) remains — a duplicate
  backup of the plan-03 session's WIP, created and restored byte-for-byte by the task-05 executor.
  Harmless; drop it once the plan-03 session is done. **Do not drop it while that session runs.**

### W2 deviations (task 05, reported by its executor)

- `viewControls` was wired in step 1 rather than step 3: an unused `handleResetView` is a
  `TS6133` error under this tsconfig, so step 1 would not have compiled alone. The risk
  register's real requirement — the camera move committed by itself, first — is honored.
- Preview's pointer handlers are module-scope no-ops rather than omitted, because
  `LightingSurfaceProps` declares all seven as required and that file belongs to task 03.
- The Preview pane's info readout reports `viewCellsX/Y` (the object) rather than the edit grid,
  following from D8's whole-object preview.
- Prettier reformatted one pre-existing non-conforming dep array in the same file.


- **W1 landed as one owner checkpoint commit, not four task commits.** All four task
  deliverables (01 store + tests + `ApplicationStore`, 02 `useLightingPaint` stroke callbacks +
  tests, 03 `LightingSurface` `viewControls` slot + css/story/test, 04 `renderLitComposite` +
  tests) are present in `63145d3` ("Checkpoint: Workspace splitting for previews etc") and were
  verified against their specs by the coordinator. Per-task commit granularity was not achieved
  for W1.
- **Branch is `feat/03-reflection-tool`, not `feat/02-split-canvas-render-modes`.** `4216879` is
  an ancestor of HEAD; the reflection-tool branch carries plan 04's W1 work. Continuing here
  rather than rewriting history.
- **`63145d3` also carries unrelated plan-03 work** (`CanvasSurface.tsx` doc comment for the
  reflection canvas, `docs/03-reflection-tool/`). Not plan 04's, left alone.

## Manual checks still owed (W2 / task 05)

None of the interactive checks were performed — no browser-driving tool is available in these
sessions. The executor substituted a temporary jsdom probe against a real `ApplicationStore`
(11 assertions, all passing, probe then deleted), which covered read-only Preview, camera
independence, the single-`.`-frame-step keyboard gate, control placement, and — measured
directly — one `beginTransaction` and one undo entry per multi-cell drag.

**The owner still needs to eyes-on:** painting normals/heights is pixel-identical to before;
⌘Z after a 10-cell drag in a real browser; pan / ctrl+wheel / pinch per pane; the reset
button's centring; `.`/`,` frame stepping by hand; and that the Preview pane visually shows
the lit composite at editor scale (not a 200 px thumb).

## Notes for the next session

- **The owner reversed the original request mid-planning.** The first ask was "edit the normal and
  height map on the preview"; after clarifying questions the owner decided the preview stays
  **read-only** ("it's a composite view of everything which just gets super complex in reality").
  The plan reflects the correction, not the original wording. Do not re-add painting to the
  Preview pane.
- **Owner's other explicit answers:** the floating 200 px preview panel is **retired entirely**;
  the lighting studio gets **two** modes only (`edit` | `preview`), not a Layer-style third; a
  lighting paint stroke must become **one undo entry**.
- **`CanvasViewsUIStore` was deliberately not generalised** — it is hard-coded to `full`/`layer`
  with two booleans, one camera, and 13 pinned tests. Plan 04 adds a sibling store instead.
- **Corpus trap:** retiring the panel must not remove the persisted `lightingPreviewPanel*` keys or
  the `PanelName` union member. Deleting a key from `toPersistedUIState()` moves 151 snapshots of
  the owner's real work.
- **Manual checks still owed from plan 02** (unrelated but outstanding): touch/pinch per pane, iPad
  portrait stacking, and an eyes-on storybook pass for `CanvasViewControls` / `CanvasSplit`.
