# 08 — Full gate, end-to-end QA, handoff

**Wave:** W3 · **Depends on:** 06, 07
**Touches:** `docs/03-reflection-tool/HANDOFF.md` · `docs/plans/reflection-tool.md`
**Effort:** S

## Objective
The feature is verified end to end on the integrated branch, the full repository gate
passes, the stylelint baseline is unchanged, and the ledger records exactly what shipped.

## Context
- `bun run verify` (root) = typecheck + lint + format:check + test + build.
- stylelint baseline (measured 2026-08-29): **2 pre-existing errors** in
  `ui/primitives/ConfirmDialog/ConfirmDialog.css:15` and
  `ui/primitives/IconButton/IconButton.css:32`, plus 66 warnings. The plan must add **zero**
  new errors; do not fix the two old ones here (out of scope).
- eslint baseline: 0 errors / 64 warnings.

## Steps
1. Run the gate block below; paste real output into HANDOFF.
2. Perform the panel-driven manual pass (task 06 manual list) and re-run task 07's
   manual items 2, 4, 5 on the integrated build.
3. Append a "Shipped" section to `docs/plans/reflection-tool.md` stating: coordinate
   model (corner lattice), mirror order (originals win, mirror-then-mask), line cap 8,
   non-persistence, and that the split-canvas Layer pane (plan 02, tasks 05/06) still needs
   its own reflection overlay.
4. Commit: `docs(03): reflection tool shipped — gate output and notes`.

## Verification
```sh
bun run verify 2>&1 | tail -15                       # exit 0
cd client && bunx stylelint "src/**/*.css" 2>&1 | tail -4   # exactly "2 errors" (baseline), no new files listed
cd client && bunx storybook build 2>&1 | tail -3
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # empty
bun run dev                                         # all three processes start; app loads
```

## Definition of done
- [ ] `bun run verify` exit 0 with output pasted.
- [ ] stylelint error count == 2 (baseline) and neither is in a new file.
- [ ] Manual checks recorded; HANDOFF `Current position: DONE`.
