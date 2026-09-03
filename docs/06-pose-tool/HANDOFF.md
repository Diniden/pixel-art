# HANDOFF — Pose tool

**Current position:** W1 IN PROGRESS
**Branch:** `feat/06-pose-tool`
**Last commit:** `35d1644`
**Plan written:** 2026-09-02 · Planning baseline HEAD: `cd7a852`

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | IN PROGRESS | 2026-09-02 | | |
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

✅ **RESOLVED 2026-09-02 by /plan-go, with owner sign-off.** The in-flight edge/fill colour
split was complete and green (tsc 0 · eslint 0 errors · 2497/2497 tests · boundaries OK ·
stylelint 2 errors · no lockfile), so it was committed on its own as `45e3c8a
"feat(color): split the edge colour from the fill colour"`. The plan folder was then
committed as `35d1644` on a fresh `feat/06-pose-tool` branched from it. **Executors get a
clean tree — no `git add -p` hunk-staging is needed, and the four-shared-file risk is gone.**
The four files are now at their post-split state; task 01 and 08 must read them as they are
rather than as MASTER.md's line numbers describe (the line numbers may have shifted).

The original warning, for the record:

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

- **2026-09-02 · pre-W1 · owner-approved.** The plan assumed the dirty worktree might have to
  be worked around with `git add -p`. Instead the unrelated edge/fill work was committed
  first (`45e3c8a`) and the pose branch cut from it, so risk-register row 1 ("Dirty
  worktree", High/High) **does not apply to this execution**. MASTER.md's stated line
  numbers for `types/domain.ts`, `PixelStudioTools.tsx`, `UIStore.ts` and
  `CanvasContainer.tsx` predate that commit — locate symbols by name, not by line.

## Blocked items

(none yet)

## Manual check results

(recorded per task as waves complete — tasks 01, 04, 07, 08, 09 and 10 all carry required
manual checks)

## Notes for the next session

(none yet)
