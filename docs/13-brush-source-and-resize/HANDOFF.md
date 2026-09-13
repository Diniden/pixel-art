# HANDOFF — Brush colour source and resizable brushes (plan 13)

**Current position:** W2 IN PROGRESS (2026-09-13)
**Branch:** `feat/13-brush-source-and-resize`
**Worktree:** `/Users/diniden/Desktop/self/pixel-art/.claude/worktrees/feat+13-brush-source-and-resize`
**Base:** `origin/main @ 33266af`
**Last commit:** `ede8319` (W1 complete)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 07, 08 | DONE | 2026-09-13 | `5ae84e4` 01 · `505a794` 08 · `ede8319` 07 | tsc clean · eslint 0e/66w · vitest 195 files / 4179 tests · boundaries 5/5 OK · format:check clean · no lockfile · no snapshot change |
| W2 | 02, 03, 05, 09 | IN PROGRESS | 2026-09-13 | | |
| W3 | 04, 06, 10, 11 | TODO | | | |
| W4 | 12, 13, 14 | TODO | | | |
| W5 | 15 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Manual QA (MASTER §11 — filled by task 15)

| # | Status | Observed |
| --- | --- | --- |
| 1–12 | ❌ not performed | |

## Deviations
- **01** — `isColorSource` is exported (task's DoD lists it; `isChannelType` stays private). Extra normaliser cases (`"TARGET"`, non-string) added; all additive.
- **07** — Lanczos-3 step pin: the task-agent's first pin (`−255` at i=0) was wrong; the true value is `−240` (third lobe reaches across the step). Pinned with the derivation. Task's bilinear numbers (`100, 75, 25, 0`) were correct. `box`/`nearest` use the half-open box `(−0.5, 0.5]` so ties match `floor(u+0.5)`.
- **08** — xBR tie rule: the published `d(E,F) <= d(E,H) ? F : H` is not transpose-symmetric on ties, so ties are resolved symmetrically (equal cells → that cell; different cells → keep `E`); documented in the header and pinned. Extra exports `cellDistance`, `XBR_PAINT_PENALTY` (4096), `PixelBrushGrid` for task 10's reuse (MASTER D9).

## Notes for the next session
- **Corpus fixtures**: `client/src/test/__fixtures__/corpus/*.json` is gitignored and absent in a fresh worktree; `server/src/data/` (the regenerate source) is absent too. The 11 JSONs were copied read-only from the launch checkout's corpus dir into this worktree (2026-09-13); corpus suites then pass (`src/types/__tests__/` 3 files / 139 tests, digests unchanged). A new worktree needs the same copy.
- `bun run install:all` and any `bunx` in `client/` write gitignored `client/bun.lock` / `server/bun.lock` (no `bunfig.toml` in those dirs). Delete before every commit.
- Baseline gate on `main @ 9df1e72`: tsc clean · eslint 0e/66w · vitest 193 files / 4027 tests · build OK · no lockfile.
- Task 10 (hq2x) has an explicit deferral rule: if its symmetry test cannot pass, commit nothing from it and record the attempt here.
