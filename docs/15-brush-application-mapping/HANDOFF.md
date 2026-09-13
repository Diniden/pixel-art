# HANDOFF — Brush application mapping (plan 15)

**Current position:** W1 not started — **pre-flight required** (MASTER top: plan 14 must be merged; run the three greps and record the result here)
**Branch:** (set by /plan-go — expected `feat/15-brush-application-mapping`)
**Worktree:** (set by /plan-go)
**Base:** (set by /plan-go — origin/main SHA the branch was cut from; planned against `6f1bc44`, must include plan 14's merge)
**Last commit:** (set by /plan-go)

## Pre-flight (coordinator, before W1)

| Check | Result |
| --- | --- |
| `grep -n '"brush-2"' client/src/types/brush.ts` matches | |
| `grep -n 'selectedBrushIn' client/src/stores/ui/BrushUIStore.ts` matches | |
| `grep -n 'projectName' client/src/stores/domain/BrushStore.ts` matches | |
| Corpus fixtures copied (`ls client/src/test/__fixtures__/corpus \| wc -l` → 11) | |
| Baseline re-measured on the branch: tsc / eslint errors+warnings / vitest files+tests / stylelint errors / storybook / boundaries | |

If any of the first three fails: every wave `BLOCKED`, note "plan 14 not merged", stop.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | TODO | | | |
| W2 | 06, 07, 08 | TODO | | | |
| W3 | 09, 10, 11 | TODO | | | |
| W4 | 12 | TODO | | | |
| W5 | 13 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

Every gate column carries: tsc result · eslint errors/warnings (≤ baseline) · vitest files/tests · boundaries · `src/types` suite green with snapshots untouched · lockfile check. W1, W3, W5 add stylelint + storybook.

## Manual QA (consolidated by task 13 from tasks 05, 11, 12)

| # | Where | Check | Status | Observed |
| --- | --- | --- | --- | --- |
| (filled by task 13) | | | | |

## Deviations
(none yet)

## Notes for the next session
- This plan depends on plan 14 (`docs/14-multi-brush-projects/`) being merged first; its baseline numbers (tsc clean · eslint 0e/66w · vitest 200 files / 4361 tests) are pre-14 and must be re-measured.
- ⚠️ Task 02 is the only task that touches `client/src/types/codecs/**` and `types/domain.ts`. Its gate is the corpus digest suite + R10's exact byte count, unchanged. Read its output, do not trust "passes".
- ⚠️ The Bash hook inspects command **text**: a heredoc that merely quotes `vitest -u` or the frozen-lockfile flag is blocked. Write docs with the Write tool.
- Behaviour change by design (MASTER R9): a multi-frame brush now fans out (frame `i` → Δ+`i`) instead of stamping the selected frame onto the current frame. A brush author can restore fan-in by setting every frame's default deltas to `0`.
- Open items carried out of scope: Brush Studio layer-panel controls for the defaults; Other Hand Mode widgets for the mapping; `CLAUDE.md`'s dead `REFRESH/*` links; plan 13's manual QA rows (see its HANDOFF).
