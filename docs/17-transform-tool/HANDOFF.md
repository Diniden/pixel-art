# HANDOFF — Transform tool (plan 17)

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/17-transform-tool`)
**Worktree:** (set by /plan-go)
**Base:** (set by /plan-go — origin/main SHA the branch was cut from; planned against `96e0284`)
**Last commit:** (set by /plan-go)

## Pre-flight (coordinator, before W1)

| Check | Result |
| --- | --- |
| Corpus fixtures copied (`ls client/src/test/__fixtures__/corpus \| wc -l` → 11) | |
| Baseline on the branch: tsc / eslint errors+warnings / vitest files+tests / stylelint errors / storybook / boundaries | |
| Have plans 14, 15 or 16 landed since `96e0284`? If yes, re-grep every cited line in `toolHandlers.ts`, `PixelStore.ts`, `CanvasContainer.tsx`, `PixelStudioTools.tsx`, `useCanvasKeyboard.ts` before W1 | |

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | TODO | | | |
| W2 | 05, 06 | TODO | | | |
| W3 | 07, 08, 09 | TODO | | | |
| W4 | 10 | TODO | | | |
| W5 | 11 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

Every gate column carries: tsc result · eslint errors/warnings (≤ 66) · vitest files/tests · boundaries · `src/types` suite green with snapshots untouched · lockfile check. W1, W3 and W5 add storybook (+ stylelint for W3/W5).

## Manual QA (consolidated by task 11 from tasks 01, 07, 10)

| # | Where | Check | Status | Observed |
| --- | --- | --- | --- | --- |
| (filled by task 11) | | | | |

## Deviations
(none yet)

## Notes for the next session
- Baseline after the plan-14 merge (`8eb365c`, per plan 14's ledger): tsc clean · eslint 0e/66w · vitest 201 files / 4529 tests · build OK · stylelint 2 pre-existing errors (`OtherHand.css:338,359`) / 69 warnings · storybook OK · boundaries 5/5 · server 5 files / 109 tests · no lockfile. Re-measure on the cut branch anyway.
- Plan 14 landed between this plan's measurement (`96e0284`) and its publication (`9d94103`). Drift among cited files: only `ApplicationStore.ts` (+26 lines; `undo()` now `:1924`). Everything else cited is byte-identical.
- ⚠️ The Bash hook inspects command **text**: a heredoc that merely quotes `vitest -u` or the frozen-lockfile flag is blocked. Write docs with the Write tool.
- Owner-facing decision to confirm (MASTER §1): **Escape commits the pending transform and clears the selection** (the request ties the retained original to the selection's existence). ⌘Z resets a pending transform; ⌘Z after committing restores the original pixels.
- Open items carried out of scope: normal-map vectors are copied, not rotated; a panel section with W×H / angle readouts and Apply / Reset buttons; the brush studio has no transform tool; Other Hand Mode has only the title.
- Plan 15 (unexecuted) edits `toolHandlers.ts`, `PixelStore.ts` and `CanvasContainer.tsx` additively as well; plan 16 (unexecuted) touches the right-sidebar tool config — run plans one at a time.
