# HANDOFF — Reflection tool

**Current position:** W1 DONE — W2 not yet dispatched (see Blocking concern)
**Branch:** `feat/03-reflection-tool`
**Last commit:** `f9d2200`

Planned 2026-08-29 from `feat/02-split-canvas-render-modes` @ `ba5b5af` with a **dirty
worktree** (plan 02 W1 in progress). By execution time plan 02 had fully landed and the
tree was clean.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE | 2026-08-29 | 01 `00aea1d` · 02 `31ed99c` · 03 `1200f8d` · 04 `fa683e5` · 05 `f9d2200` | see W1 gate below |
| W2 | 06, 07 | TODO | | | |
| W3 | 08 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

- **2026-08-29 (start):** the plan was written against a dirty worktree at `ba5b5af`
  (plan 02 W1 uncommitted). By execution time plan 02 had fully landed (`fe06e86`,
  plan 02 COMPLETE). **Risk 1 in the register (shared dirty `ApplicationStore.ts`) is
  therefore void** — task 03 owns that file outright.
- **2026-08-29 (session 2):** a previous session committed **task 01** as `00aea1d`, then
  the owner made a checkpoint commit `63145d3` on `main` carrying the plan docs plus
  unrelated plan-04 lighting work (`LightingViewsUIStore`, `renderLitComposite`,
  `useLightingPaint`). `main` and `feat/02-split-canvas-render-modes` both point at
  `63145d3`. Task 01's code is verified present in HEAD.
- Execution moved to a new branch **`feat/03-reflection-tool`** off `63145d3`, because
  the previous ledger branch was identical to `main` and the skill forbids committing to
  `main`.
- Baseline test counts are **119 files / 2029 tests**, not MASTER.md §4's 117 / 1984 —
  the difference is the owner's plan-04 lighting tests in `63145d3`, unrelated to this
  plan.

### Verified baseline (2026-08-29, HEAD `63145d3`, branch `feat/03-reflection-tool`)
```
bunx tsc --noEmit           → exit 0
bun run lint:boundaries     → OK — all 5 boundary rules hold.
bunx stylelint src/**/*.css → 68 problems (2 errors, 66 warnings)   [baseline: 2 errors]
bunx vitest run             → Test Files 119 passed (119) / Tests 2029 passed (2029)
find bun.lock*              → empty
```

### W1 gate (coordinator-verified 2026-08-29, HEAD `f9d2200`)
```
bunx tsc --noEmit           → exit 0
bunx eslint .               → 64 problems (0 errors, 64 warnings)   [baseline: 0 errors]
bunx vitest run             → Test Files 123 passed (123) / Tests 2130 passed (2130)
                              (baseline 119/2029 → +4 files, +101 tests; corpus digests unchanged)
bun run lint:boundaries     → OK — all 5 boundary rules hold.
bunx stylelint src/**/*.css → 68 problems (2 errors, 66 warnings)   [baseline: 2 errors — intact]
bunx storybook build        → ✓ built in 5.39s
find bun.lock*              → none
```
Diff spot-check: every changed file is inside a W1 `Touches` list. Boundary probe on the
four new `ui/` files finds no store/MobX/API import.

## ⚠️ Blocking concern for the next session — CONCURRENT SESSION ON THIS BRANCH

**A second `/plan-go` session is executing plan 04 (lighting preview split) on this same
branch, at the same time.** `docs/04-lighting-preview-split/HANDOFF.md` records
"W2 IN PROGRESS, branch `feat/03-reflection-tool`" — it adopted the branch created for
plan 03. Observed consequences:

1. **A shared git index caused one commit to revert another.** Task 03 committed
   `10882b4`; task 02's commit `31ed99c` was built from a stale tree and deleted all three
   of task 03's files. Task 03 detected this and re-committed as `1200f8d` using an
   isolated `GIT_INDEX_FILE`. **History therefore contains two identical
   `feat(stores): ReflectionUIStore…` commits (`10882b4`, `1200f8d`).** The working tree
   is correct — exactly one `readonly reflection` field, one `new ReflectionUIStore()`,
   one dispose call — but the duplicate commit is cosmetic debt.
2. **Transient red gates.** `LightingCanvasContainer.tsx` (plan 04's task 05, uncommitted)
   broke `tsc` with TS6133/TS2304 during the wave. It cleared on its own. All W1 agents
   correctly identified it as not-theirs and left it alone.

**Before W2, decide with the owner:** either stop the plan-04 session, or move plan 03 to
its own branch. W2's task 07 rewrites `CanvasContainer.tsx` (L effort) while plan 04's
task 05 edits `LightingCanvasContainer.tsx` — a second index collision during a large
edit risks losing real work.

## Manual checks owed

- **Task 05 (PARTIAL by its own report):** storybook visual — six canvases stacked with
  **no layout shift**. The *stacking* half is now covered automatically by a
  `lastElementChild` assertion in the dom test; the *no layout shift* half is unverified.
  Run `bun run storybook:dev` → Components/CanvasSurface → `ReflectionGuides`.
- Nothing else in W1 is visually observable until task 07 mounts the overlay.

## Notes for the next session

- Task 02 exports `MAX_REFLECTION_LINES` from `ui/canvas/model/reflection.ts` and task 03
  exports its own copy from `stores/ui/ReflectionUIStore.ts` (both `8`), because the store
  may not import from `ui/`. **Task 07 must reconcile** — do not let them drift.
- Task 03's draft line carries the sentinel id `refl-draft`, discarded on commit.
- Task 04 deviated from its spec: `vi.useFakeTimers()` is incompatible with a stubbed
  `requestAnimationFrame` (vitest's fake timers install their own). The ticker gates on
  `performance.now()` and uses no timer, so the test drives a hand-stepped frame queue
  instead. Reason recorded in the test header.
- Task 05 added a sixth story (`ReflectionGuides`) beyond the letter of its spec, so the
  guides are visually exercised; the dom test's story-count gate was updated to match.
