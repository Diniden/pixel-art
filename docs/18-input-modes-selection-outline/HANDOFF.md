# HANDOFF — Input modes (iPad / Mac trackpad / Windows) + crisp selection outline (plan 18)

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/18-input-modes-selection-outline`)
**Worktree:** (set by /plan-go)
**Base:** (set by /plan-go — origin/main SHA the branch was cut from; planned against `096513f`)
**Last commit:** (set by /plan-go)

## Coordinator pre-flight (before W1)

Plan 17 (`docs/17-transform-tool/`) edits `CanvasSurface.tsx` and relies on `marchingAnts` /
`ScreenWidthPath`, which collides with task 06 here. Plans 14–16 do not collide. Record:

| Check | Result |
| --- | --- |
| Is plan 17 merged? (`ls client/src/ui/canvas/svg/transformOverlay.ts` — absent = not merged) | |
| Is any other plan being executed concurrently? | |
| Order chosen (18-before-17 / 18-after-17) | |

Confirm the baseline:

| Check | Expected | Result |
| --- | --- | --- |
| `grep -n 'if (e.ctrlKey)' client/src/ui/hooks/useCanvasViewport.ts` | one match near `:355` | |
| `grep -n 'canvas__svg-ants' client/src/ui/components/CanvasSurface/CanvasSurface.tsx` | match near `:892` | |
| `cd client && bun scripts/check-boundaries.mjs` | `all 5 boundary rules hold` | |
| `cd client && bunx tsc --noEmit` | exit 0 | |
| Corpus fixtures copied into the worktree (`ls client/src/test/__fixtures__/corpus/*.json \| wc -l`) | 11 | |
| `client/bun.lock`, `server/bun.lock` removed after `install:all` | yes | |

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | TODO | | | |
| W2 | 05, 06 | TODO | | | |
| W3 | 07 | TODO | | | |
| W4 | 08 | TODO | | | |

## Owner manual QA (filled by task 08)

| # | Check | Result |
| --- | --- | --- |
| 1 | MacBook · Safari pinch / scroll / ⌘-scroll | |
| 2 | MacBook · Chrome pinch / scroll | |
| 3 | Lighting + brush studios pinch | |
| 4 | Windows override on the Mac | |
| 5 | iPad pinch speed, pan, Pencil | |
| 6 | Rect selection crisp at zoom 1 / 7 / max | |
| 7 | Line on the cell boundary | |
| 8 | Lasso band thin | |
| 9 | Pan/zoom with a selection — crisp, glued | |
| 10 | External 1× display — re-snaps | |
| 11 | Brush studio selection | |
| 12 | Real Windows machine | |

## Deviations
(none yet)

## Notes for the next session

### Probe results
(task 01 writes the owner's MacBook capture here: browser, heartbeat, whether `gesture*` and/or
ctrl-wheel events arrived for a pinch, typical deltas. Task 07 reads this before wiring the fix.)
