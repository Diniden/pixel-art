# 10 — Final gate, docs, QA checklist, HANDOFF close-out

**Wave:** W5 · **Depends on:** 09
**Touches:** `ARCHITECTURE.md` · `docs/11-brush-studio-followups/HANDOFF.md` · formatting-only changes to files this plan added (Prettier sweep)
**Effort:** S

## Objective
The whole follow-up is verified with the complete gate, `ARCHITECTURE.md`'s "Brush documents"
subsection mentions the brush camera, pane store and edge/fill deltas, and the ledger closes
honestly with a consolidated manual QA checklist.

## Context
- Root `bun run verify` = typecheck + lint + format:check + client test + build; it does **not**
  run server tests, `lint:boundaries`, `lint:css`, or storybook — run those explicitly.
- `format:check` covers `client/src/types/**` and config files only; sweep every file this plan
  added/edited with `bunx prettier --check` (list via `git log --name-only <base>..HEAD`).
- `ARCHITECTURE.md` §3 has a `### Brush documents` subsection (plan 01 task 22, line ~123).
  Add: `brushUI implements CanvasCamera` (Full pane camera), `app.brushViews` (`CanvasViewsUIStore`,
  Layer pane camera), the brush canvas runs on `useCanvasViewport` like the other two canvases,
  and the two delta slots (`selectedDelta` = edge, `fillDelta`, `deltaTarget`, `activeDelta`) with
  the sentinel-colour routing in `containers/brush/brushToolContext.ts`.
- Baseline for the plan: the commit recorded in `HANDOFF.md` as the start commit.

## Steps
1. Full gate, paste every summary line: `bun run verify`;
   `cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" && bunx storybook build`;
   `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`; lockfile check;
   `git status --short`. Stylelint: only the pre-existing `OtherHand.css` errors (or fewer).
   Corpus safety: `git diff --stat <base>..HEAD -- client/src/types/codecs client/src/services server/src/export`
   is empty.
2. Prettier sweep (formatting-only commit if anything changed; re-run tsc + affected tests).
3. `ARCHITECTURE.md` update; commit.
4. Consolidate every owed manual check from tasks 01, 02, 05, 06, 07, 08, 09 into one numbered
   "Manual QA checklist (owed — none performed by executors)" table in `HANDOFF.md` (desktop /
   iPad columns) and an "Open items" list (Other-Hand rail delta slot; lasso still deferred;
   per-pane selection masks; `touchDistance` dead export if still present; anything executors
   flagged). Do not claim any browser check.
5. `HANDOFF.md`: W5 row, final gate output, current position, last commit; commit.

## Constraints
- No feature code changes. If the gate fails, report BLOCKED with output; do not patch.

## Verification
The step-1 commands, pasted; `ARCHITECTURE.md` diff shown.

## Definition of done
- [ ] Full gate green (stylelint ≤ baseline); corpus-sensitive paths zero diff.
- [ ] `ARCHITECTURE.md` updated; QA checklist and open items recorded; HANDOFF closed out.
