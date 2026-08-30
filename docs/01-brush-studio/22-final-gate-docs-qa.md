# 22 — Final gate, docs, QA sweep

**Wave:** W10 · **Depends on:** 21
**Touches:** `ARCHITECTURE.md` · `docs/01-brush-studio/HANDOFF.md`
**Effort:** S

## Objective
The whole feature is verified end-to-end with the complete gate, documented for the next
engineer in `ARCHITECTURE.md`, and the plan ledger is closed out honestly.

## Context
- The root `verify` script (`package.json`) runs typecheck + lint + format:check + client test +
  build — it does **not** run server tests, `lint:boundaries`, `lint:css`, or storybook. Run them
  all here.
- `format:check` only covers `client/src/types/**` and config files; run `bunx prettier --check`
  on every new `.ts/.tsx/.css/.md` this plan added (list them from `git log --name-only main..HEAD`)
  and fix formatting with `--write` if needed (formatting-only commit, separately).
- `ARCHITECTURE.md` §3 describes the client tree and §5 the measured rules. Add a short
  **"Brush documents"** subsection under §3 (store members, document shape, where files live,
  the uniform-layer invariant, the `observable.ref` rule for `document`, the separate history and
  autosave) and a row in §8's table pointing at `docs/01-brush-studio/MASTER.md`.

## Steps
1. Run, from the repo root, and paste every summary line:
   ```sh
   bun run verify
   cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" && bunx storybook build && cd ..
   cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run && cd ..
   find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
   git status --short | grep -v '^??' | grep -v '^ [MD]'      # nothing staged that is not ours
   ```
   Stylelint: confirm the only errors are the two pre-existing ones in `OtherHand.css` (or fewer).
2. Prettier sweep of plan-added files; commit `brush-studio(22): formatting sweep` if anything changed.
3. `ARCHITECTURE.md` subsection; commit `brush-studio(22): document brush studio in ARCHITECTURE.md`.
4. QA sweep (manual, `bun run dev`): repeat task 19's eight checks plus task 20/21's checks in one
   sitting on desktop; on iPad if available (Pencil paint, finger pan/pinch, tap buttons). Record
   pass/fail per item in `HANDOFF.md` → "Notes for the next session".
5. Confirm the owner's project is untouched: open the pixel studio, the project loads, undo
   stack behaves, and `git diff --stat main..HEAD -- client/src/types/codecs client/src/services server/src/export` is empty.
6. Update `HANDOFF.md`: W10 DONE, final commit hash, deviations consolidated, open items listed.

## Constraints
- No feature code changes in this task; if the gate fails, report it as BLOCKED with output
  rather than patching here.

## Verification
The commands in step 1, pasted. `ARCHITECTURE.md` diff shown.

## Definition of done
- [ ] Full gate output pasted, green (stylelint ≤ baseline errors).
- [ ] Corpus-sensitive paths have zero diff vs `main`.
- [ ] `ARCHITECTURE.md` updated; QA sweep recorded; HANDOFF closed out.
