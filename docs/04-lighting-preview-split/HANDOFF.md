# HANDOFF — Lighting Preview Split

**Current position:** W2 IN PROGRESS
**Branch:** `feat/03-reflection-tool`
**Last commit:** `63145d3`

Planned 2026-08-29 from `feat/02-split-canvas-render-modes` @ `fe06e86` with a clean tree (two
untracked docs entries from a parallel planning session: `docs/plans/reflection-tool.md`,
`docs/03-reflection-tool/` — not ours, never stage them).

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE | 2026-08-29 | `63145d3` | tsc clean · eslint 0 errors / 64 warnings · vitest 119 files, 2029 tests pass · boundaries OK (5 rules) · stylelint 2 pre-existing errors only · no lockfile · corpus digests unchanged |
| W2 | 05 | IN PROGRESS | 2026-08-29 | | |
| W3 | 06 | TODO | | | |

## Deviations

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
