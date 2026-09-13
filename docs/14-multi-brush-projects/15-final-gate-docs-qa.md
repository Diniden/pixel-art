# 15 — Final gate, `ARCHITECTURE.md`, QA ledger

**Wave:** W5 · **Depends on:** 01–14
**Touches:** `ARCHITECTURE.md` · `docs/14-multi-brush-projects/HANDOFF.md`
**Effort:** S

## Objective
The whole plan is verified end to end (`bun run verify` plus every side gate the root script skips), `ARCHITECTURE.md`'s brush section describes the two-level document and the selected-brush rule, and the HANDOFF carries the consolidated manual QA table with every row's real observation — or an honest "not performed".

## Context
`ARCHITECTURE.md:123-260` ("Brush documents"): the "Document shape" bullet (`:138-148`) states `BrushDocument { version: "brush-1"; width; height; frames; appliedGroups }` and "the file carries no name"; the "Store members" bullet (`:130-137`); "The uniform-layer invariant" (`:156-159`); "Brush tool (pixel studio)" (`:222-246`, "stamps the brush document open in the Brush Studio"). Plan 13's "Colour source" / "Resampling" bullets follow — unchanged.

Root `bun run verify` = typecheck → lint → format:check → client test → build; it does **not** run stylelint, `lint:boundaries`, storybook or the server tests (MASTER §4). The corpus fixtures must be present (R7). The data-safety check is `git diff --stat <base>..HEAD -- client/src/types/codecs client/src/services server/src/export` (empty) and `git status --porcelain | grep __snapshots__` (empty), where `<base>` is the SHA recorded in HANDOFF.

## Steps
1. Run the full gate from the repo root and the side gates; paste **all** output into HANDOFF's W5 row:
   ```sh
   bun run verify
   cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" ; bunx storybook build
   cd ../server && bunx tsc --noEmit && bunx eslint . && bunx vitest run
   cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
   git diff --stat <base>..HEAD -- client/src/types/codecs client/src/services server/src/export
   git status --porcelain | grep __snapshots__ ; echo "exit $?"
   cd client && bunx eslint . 2>&1 | tail -3
   ```
   Expected: verify exit 0; boundaries 5/5; stylelint no new errors (baseline 2 in `OtherHand.css`); storybook OK; server green; no lockfile; both data-safety commands empty; warnings ≤ 66.
2. `ARCHITECTURE.md`: rewrite the "Document shape" bullet for `Brush` / `BrushDocument { version: "brush-2"; brushes }`, the legacy wrap, `brushIn`; add a "Selected brush" bullet (`brushUI.selectedBrushId`, `selectBrush(id, doc)`, brush → frame → layer clamp, the `ApplicationStore` sink adapter, the `*Project` naming in `BrushStore`); update "Store members" (`BrushStructureStore` brush CRUD), the invariant bullet (`assertBrushDocument`), the rail description (the `BrushList` panel replaces `BrushLibrary`), and the "Brush tool (pixel studio)" bullet (stamps the **selected brush**; the rail picker; the other-hand stack; `usePixelBrush` keys). Keep the house voice: measured facts, file paths, no marketing.
3. Consolidate the manual checks from tasks 03, 04, 12, 13, 14 into one QA table in HANDOFF (`#`, where, check, status ✅/❌, observed, automated coverage). Perform every row you can with `bun run dev` in a browser; mark the rest ❌ "not performed" with the reason. Add the owner-facing note from R1 (back up `server/src/data/brushes/` before running the branch) at the top of "Notes for the next session" if it is not there.
4. Fill HANDOFF's status line: `PLAN COMPLETE` only if every gate is green **and** every QA row is ✅; otherwise `PLAN COMPLETE (PARTIAL)` with the counts. Commit: `docs(14): ARCHITECTURE multi-brush projects; final gate; QA ledger`.

## Constraints
- No application source edits in this task. If the final gate fails, fix it in the owning task's files under a `multi-brush(NN):` commit and say so in HANDOFF's Deviations.
- Do not touch `CLAUDE.md`.

## Verification
The commands in step 1, all pasted. `git log --oneline` shows one commit per task plus this one.

## Definition of done
- [ ] Every gate output pasted in HANDOFF; all green or the failures named.
- [ ] `ARCHITECTURE.md` describes brush-2, the selected brush, the rail list and the pixel-studio picker accurately.
- [ ] QA table complete with real observations or explicit ❌ rows; status line honest.
