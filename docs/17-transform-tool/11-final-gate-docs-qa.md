# 11 — Final gate, `ARCHITECTURE.md`, QA ledger

**Wave:** W5 · **Depends on:** 01–10
**Touches:** `ARCHITECTURE.md` · `docs/17-transform-tool/HANDOFF.md`
**Effort:** S

## Objective
The branch passes every gate with real output pasted into the ledger, `ARCHITECTURE.md` describes
the transform tool in the voice of its neighbouring tool sections, and the manual QA table
consolidates tasks 01, 07 and 10's checks with observed results.

## Context
- `ARCHITECTURE.md` §3 has one bullet per canvas tool plan (reflection, pose, brush tool, …) under
  the client structure sections. Add one bullet "**Transform tool** (plan `docs/17-transform-tool/`)"
  after the most recent tool bullet: the tool id and hotkey; the degrade-to-selection rule; the
  session model (`app.transform`, lift once, float params, nearest-neighbour inverse rasterisation,
  preview on its own overlay canvas, frame chrome counter-scaled); the lifecycle (Enter commits +
  selection follows, **Escape commits + clears**, tool / selection / frame / layer change commits,
  ⌘Z resets while pending, `loadGeneration` drops); the domain seam (`PixelStore.setPixelCellsAt`,
  label parameter); the `"float"` snap mode; what deliberately did not change (`SelectionUIStore`,
  the Selection tool's behaviours, Other Hand Mode, no panel section) and the open items (normals are
  copied not rotated; readouts / Apply / Reset panel; brush studio has no transform).
- Gate commands: MASTER §4. `bun run verify` does **not** run stylelint, boundaries, storybook or
  server tests — run them separately. Confirm the corpus fixtures are present
  (`ls client/src/test/__fixtures__/corpus | wc -l` → 11).

## Steps
1. Run, from the repo root, and capture output:
   ```sh
   bun run verify
   cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" && bunx storybook build
   cd ../server && bunx tsc --noEmit && bunx eslint . && bunx vitest run
   cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
   git status --porcelain | grep __snapshots__
   git diff --stat main..HEAD -- client/src/types/codecs client/src/services server/src/export client/src/stores/ui/SelectionUIStore.ts
   ```
   Expected: verify exit 0; boundaries 5/5; stylelint no new errors (2 baseline); storybook exit 0;
   server green; no lockfile; no snapshot; the last diff empty.
2. `ARCHITECTURE.md` bullet as above. Commit: `docs(17): ARCHITECTURE — transform tool`.
3. `HANDOFF.md`: fill the W5 row with the gate summary lines, consolidate the manual QA table from
   tasks 01 (toolbar), 07 (story), 10 (canvas 1–12) with status and observation per row, list every
   deviation, write "Notes for the next session" (open items above; the Escape-commits decision for
   the owner to confirm; plans 14/15/16 ordering). Set **Current position** to `PLAN COMPLETE` or
   `PLAN COMPLETE (PARTIAL)` with the reason. Commit: `docs(17): PLAN COMPLETE — final gate, QA ledger`.

## Constraints
- No application source changes. If a gate fails, record it verbatim under the W5 row, mark
  `BLOCKED`, and report — do not fix code in this task. Do not run `vitest -u`. Do not edit `CLAUDE.md`.

## Verification
The commands in step 1, with their real output pasted into `HANDOFF.md` and the report.

## Definition of done
- [ ] Every gate command run; outputs recorded; expected results met or the ledger says which did not.
- [ ] `ARCHITECTURE.md` bullet added.
- [ ] `HANDOFF.md` QA table filled from tasks 01, 07, 10; deviations and notes written; position set.
- [ ] Two commits `docs(17):`; no lockfile.
