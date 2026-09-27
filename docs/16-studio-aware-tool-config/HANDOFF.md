# HANDOFF — Studio-aware tool configuration (plan 16)

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/16-studio-aware-tool-config`)
**Worktree:** (set by /plan-go)
**Base:** (set by /plan-go — origin/main SHA the branch was cut from; planned against `96e0284`)
**Last commit:** (set by /plan-go)

## Coordinator pre-flight (before W1)

Plans 14 and 15 are written but **not executed**, and plan 14 collides with this plan's tasks
03 and 04 (see MASTER's top banner and §7). Record which order was used:

| Check | Result |
| --- | --- |
| Is plan 14 merged? (`grep -c '"brush-2"' client/src/types/brush.ts` — 0 = not merged) | |
| Is plan 14 currently being executed by another session? | |
| Order chosen (16-before-14 / 16-after-14) | |

If plan 14 is mid-flight, **stop** and set every wave to `BLOCKED` with the note
"plan 14 concurrent". Neither plan is a prerequisite for the other; only concurrency is the
problem.

Also confirm the baseline is the one this plan was measured against:

| Check | Expected | Result |
| --- | --- | --- |
| `grep -n 'isPixelMode' client/src/containers/RightSidebarTopControlsContainer.tsx` | matches at `:76` | |
| `cd client && bun scripts/check-boundaries.mjs` | `all 5 boundary rules hold` | |
| `cd client && bunx tsc --noEmit` | exit 0 | |

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01 | TODO | | | |
| W2 | 02, 03 | TODO | | | |
| W3 | 04 | TODO | | | |
| W4 | 05 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Lockfile check (after every wave — `CLAUDE.md`)

`bunx` can recreate a lockfile as a side effect. Record the result each wave:

| Wave | `find . -maxdepth 2 -name 'bun.lock*' \| grep -v node_modules` | Action taken |
| --- | --- | --- |
| W1 | | |
| W2 | | |
| W3 | | |
| W4 | | |

## Snapshot integrity (after every wave — highest-severity rule)

This plan touches no wire format (MASTER D9). Corpus and migration snapshots must be
**unchanged**, and none may be updated.

| Wave | Any corpus/migration snapshot differed? | Any snapshot updated? (must be NO) |
| --- | --- | --- |
| W1 | | |
| W2 | | |
| W3 | | |
| W4 | | |

## Manual QA ledger

`CLAUDE.md`: a task whose manual checks were skipped is not done. One row per check; record
what was actually seen, not "pass".

| Task | Check | Performed? | What was seen |
| --- | --- | --- | --- |
| 02 | 1 · brush studio, rectangle → Shape + Border radius, and "fill" actually fills | | |
| 02 | 2 · brush studio, gaussian-fill → panel absent, tool still fills | | |
| 02 | 3 · brush studio, selection → summary + Clear, no mode/behaviour | | |
| 02 | 4 · pixel studio regression sweep (7 tools) | | |
| 02 | 5 · lighting studio → no panel | | |
| 02 | 6 · StrictMode studio/tool churn | | |
| 03 | 1 · all 11 brush tools, rail contents, Delta always present | | |
| 03 | 2 · eyedropper readout follows the active slot; pick moves fill sliders | | |
| 03 | 3 · rectangle "both" → readout matches the painted result | | |
| 03 | 4 · no layer selected → "Select a layer", no slot named, no crash | | |
| 03 | 5 · pixel studio rail unchanged | | |
| 03 | 6 · StrictMode tool/studio churn | | |
| 04 | 1 · selection size × count correct, arithmetic checked | | |
| 04 | 2 · rail Clear clears the brush ants | | |
| 04 | 3 · canvas Escape clears the rail summary | | |
| 04 | 4 · two panes → one coherent summary; closing the owner leaves none stale | | |
| 04 | 5 · leave/return; pixel selection panel incl. expand/shrink unaffected | | |
| 04 | 6 · pixel selection not shown in brush mode | | |
| 04 | 7 · StrictMode; **console checked** for MobX render-phase-write warning | | |
| 05 | 1 · brush toolbar: Reflection and Pose gone; every remaining tool does something | | |
| 05 | 2 · pixel toolbar: Reflection and Pose present, both rail sections appear | | |
| 05 | 3 · hotkey probe: does `P` still select Pose in the brush studio? | | |
| 05 | 4 · end-to-end sweep of all 11 brush tools, one line each | | |
| 05 | 5 · full pixel-studio tool sweep, rails unchanged | | |

## Deviations

(none yet)

Record here: the task-05 hotkey finding (whether `P` still selects Pose in the brush studio —
a finding to record, not to fix); whether task 04 step 9 touched
`useBrushSelection.dom.test.ts` or was a justified no-op; and any `Touches` list that turned
out to be inaccurate.

## Notes for the next session

(none yet)
