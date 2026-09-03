# HANDOFF — Pose tool

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/06-pose-tool`)
**Last commit:** (set by /plan-go)
**Plan written:** 2026-09-02 · Planning baseline HEAD: `cd7a852`

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | TODO | | | |
| W2 | 06, 07 | TODO | | | |
| W3 | 08 | TODO | | | |
| W4 | 09 | TODO | | | |
| W5 | 10 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Register the `pose` tool | W1 | TODO | | |
| 02 | `PoseUIStore` + wiring | W1 | TODO | | |
| 03 | three.js + engine skeleton | W1 | TODO | | |
| 04 | Pose overlay canvas | W1 | TODO | | |
| 05 | `PixelStore.setPixelCells()` | W1 | TODO | | |
| 06 | Meshes, camera, auto-fit, stamp math | W2 | TODO | | |
| 07 | Pose rail section + orbs | W2 | TODO | | |
| 08 | `CanvasContainer` integration | W3 | TODO | | |
| 09 | Vendor the CC0 mannequin | W4 | TODO | | May legitimately end BLOCKED |
| 10 | Full gate, QA, handoff | W5 | TODO | | |

## Known state at planning time (2026-09-02)

⚠️ **The worktree was DIRTY when this plan was written.** 27 modified files and 1 untracked,
an unrelated in-flight **edge/fill colour split** (`ToolUIStore.fillColor`, `colorTarget`,
`ColorPicker` tabs, a new `"pixel-unbounded"` snap mode, marker policy). It shares four files
with this plan:

- `client/src/types/domain.ts` (task 01)
- `client/src/ui/components/Toolbar/PixelStudioTools.tsx` (task 01)
- `client/src/stores/ui/UIStore.ts` (not in any Touches list — do not edit)
- `client/src/containers/CanvasContainer.tsx` (task 08)

**Ideally that work is committed or stashed before `/plan-go` runs.** Otherwise every
executor touching those files must stage only their own hunks with `git add -p`, and must
never revert or commit someone else's work.

**Gate baseline measured 2026-09-02:**

- `bunx tsc --noEmit` → exit 0, clean
- `bunx stylelint "src/**/*.css"` → exit 0, **2 errors** (`ConfirmDialog.css:15`,
  `IconButton.css:32`) + 67 warnings. **This 2-error baseline is pre-existing.**
- No lockfile present anywhere.
- No 3D library installed; no WebGL context created anywhere in `client/src`.

## Deviations

(none yet)

## Blocked items

(none yet)

## Manual check results

(recorded per task as waves complete — tasks 01, 04, 07, 08, 09 and 10 all carry required
manual checks)

## Notes for the next session

(none yet)
