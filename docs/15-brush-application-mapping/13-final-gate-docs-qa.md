# 13 — Final gate, `ARCHITECTURE.md`, QA ledger

**Wave:** W5 · **Depends on:** 01–12
**Touches:** `ARCHITECTURE.md` · `docs/15-brush-application-mapping/HANDOFF.md`
**Effort:** S

## Objective
The branch passes every gate with real output pasted into the ledger, `ARCHITECTURE.md` describes the
brush application mapping in the "Brush documents" section's voice, and the manual QA table consolidates
tasks 05, 11 and 12's checks with observed results.

## Context
- `ARCHITECTURE.md` §3 "Brush documents" (from line 123) has one bullet per plan (`Brush tool (pixel
  studio)`, `Colour source`, `Target seeding at write time`, `Resizable stamps`, `app.ui.pixelBrush`, …).
  Plan 14 adds its own bullet. Add **one** bullet "**Application mapping** (plan `docs/15-brush-application-mapping/`)"
  after plan 14's, and a short note under §5 "The serialization layer is load-bearing" that
  `PixelObject.brushApplication` is the second optional object key after `origin`, emitted conditionally.
- Gate commands are in MASTER §4. `bun run verify` does **not** run stylelint, boundaries, storybook or
  server tests — run them separately.
- Corpus fixtures may be missing in the worktree (MASTER R7) — the coordinator copied them before W1;
  confirm they are present (`ls client/src/test/__fixtures__/corpus | wc -l` → 11).
- `CLAUDE.md`'s `REFRESH/*` links are dead; **do not edit `CLAUDE.md`** in this task (out of scope) —
  note it under "Notes for the next session".

## Steps
1. Run, from the repo root, and capture output:
   ```sh
   bun run verify
   cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" && bunx storybook build
   cd ../server && bunx tsc --noEmit && bunx eslint . && bunx vitest run
   cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
   git status --porcelain | grep __snapshots__
   git diff --stat main..HEAD -- client/src/services server/src/export
   git diff main..HEAD -- client/src/types/codecs
   grep -rln "pixelBrushStamp\b\|pixelBrushTarget\b" client/src
   ```
   Expected: verify exit 0; boundaries 5/5; stylelint no new errors (2 baseline); storybook exit 0; server
   green; no lockfile; no snapshot; empty services/export diff; codec diff = the `brushApplication`
   lines in three files; grep = `pixelBrushStamp.ts` + its test only.
2. `ARCHITECTURE.md`: the Application-mapping bullet — the two levels (brush defaults `applyDelta`/`applyTo`,
   object overrides `PixelObject.brushApplication` keyed by `brushApplicationKey`), the resolution rules
   in one breath (delta → index, specific id → index in the current frame else any frame else default,
   frame `i` → Δ+`i` by default, culling, variant collapse), the seam (`ToolContext.pixelBrushPlan`,
   `setPixelsAt`, `PixelStore.setPixelsAt` with no transaction), the UI (`PixelStudioBrushApplication`,
   `ui.pixelBrush.applyScope`), and what deliberately did **not** change (Other Hand Mode, Brush Studio
   controls, the codec's pass-through). Mention the behaviour change for multi-frame brushes (MASTER R9).
   Commit: `docs(15): ARCHITECTURE — brush application mapping`.
3. `HANDOFF.md`: fill the W5 row with the gate output (trimmed to the summary lines), consolidate the
   manual QA table from tasks 05 (story check), 11 (rail checks 1–5) and 12 (canvas checks 1–7) with each
   row's status and observation, list every deviation, and write "Notes for the next session" (open
   items: Brush Studio controls for defaults, Other Hand Mode, `CLAUDE.md` dead links, plan 13's still-owed
   QA rows if still unperformed). Set **Current position** to `PLAN COMPLETE` or `PLAN COMPLETE (PARTIAL)`
   with the reason. Commit: `docs(15): PLAN COMPLETE — final gate, QA ledger`.

## Constraints
- No application source changes. If the gate fails, stop, record the failure verbatim in `HANDOFF.md`
  under the W5 row, mark it `BLOCKED`, and report — do not fix code in this task.
- Do not run `vitest -u`. Do not edit `CLAUDE.md`.

## Verification
The commands in step 1, with their real output pasted into `HANDOFF.md` and the report.

## Definition of done
- [ ] Every gate command run; outputs recorded; all expected results met (or the ledger says exactly which did not).
- [ ] `ARCHITECTURE.md` bullet + serialisation note added.
- [ ] `HANDOFF.md` manual QA table filled from tasks 05, 11, 12; deviations and notes written; position set.
- [ ] Two commits `docs(15):`; no lockfile.
