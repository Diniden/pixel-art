# HANDOFF — Multi-brush projects (plan 14)

**Current position:** W1 IN PROGRESS (2026-09-13)
**Branch:** `feat/14-multi-brush-projects`
**Worktree:** `/Users/diniden/Desktop/self/pixel-art/.claude/worktrees/feat+14-multi-brush-projects`
**Base:** `origin/main @ 6f1bc44` (planned against `9007990`; the only commit between is the plan itself)
**Last commit:** (set by /plan-go)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | IN PROGRESS | 2026-09-13 | | |
| W2 | 05, 06, 07 | TODO | | | |
| W3 | 08, 09, 10, 11 | TODO | | | |
| W4 | 12, 13, 14 | TODO | | | |
| W5 | 15 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

For W2 and W3 the gate column must carry the actual `tsc` file list and the actual failing vitest suites, each stated as a subset of MASTER §8's allowed lists.

## Manual QA (MASTER §5 W4/W5 — consolidated by task 15)

| # | Where | Check | Status | Observed |
| --- | --- | --- | --- | --- |
| (filled by task 15 from tasks 03, 04, 12, 13, 14) | | | | |

## Deviations
(none yet)

## Notes for the next session
- Worktree setup done 2026-09-13: `bun run install:all`, corpus JSONs (11) copied read-only from the launch checkout, gitignored `client/bun.lock`/`server/bun.lock` deleted (they reappear after every `bunx` in those dirs — delete before every commit).
- Baseline on `main @ 9007990`: tsc clean · eslint 0e/66w · vitest 200 files / 4361 tests · build OK · stylelint 2 pre-existing errors (`OtherHand.css:338,359`) · storybook OK · boundaries 5/5 · server 4 files / 102 tests · no lockfile.
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is gitignored and absent in a fresh worktree — copy it from the launch checkout before the first gate or `src/types/__tests__/` fails (MASTER R7).
- ⚠️ Owner-facing (MASTER R1): the app on this branch rewrites brush-1 files under `server/src/data/brushes/` as brush-2 on first autosave (the server keeps one `.prev/` copy). Back that directory up before running the app on the branch. Agents never read or write it.
- Plan 13's 12 manual QA rows remain unperformed (`docs/13-brush-source-and-resize/HANDOFF.md`); they are not this plan's debt but the brush-tool rows overlap with task 14's checks — note any you happen to observe.
