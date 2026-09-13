---
name: plan-steps
description: Analyze the project and write a wave-based implementation plan for a requested feature under docs/XX-<feature>/ (numbered task files + MASTER.md). Planning only — writes no application code. Run /plan-go afterwards, in a fresh context, to execute it.
argument-hint: <description of the feature(s) to implement>
---

# /plan-steps — write an executable, wave-based plan

You are producing a plan that a **different agent, in a fresh context, with no memory
of this conversation** will execute via `/plan-go`. Everything that agent needs must be
on disk. Nothing you learn here survives except what you write into the plan folder.

The feature request is: **$ARGUMENTS**

If `$ARGUMENTS` is empty, ask the user what they want planned and stop.

## Hard constraints

- **Do not modify any application source file.** This skill writes only under `docs/`.
- Respect every rule in `CLAUDE.md` (Bun only, no lockfiles, `ui/` boundary, never
  deep-observe pixel grids, protect `server/src/data/`). Plans must not ask an executor
  to break them.
- Do not manufacture parallelism. Two tasks share a wave **only** if their `Touches`
  lists are disjoint and neither depends on the other's output. A plan of mostly
  single-task waves is honest; a plan of fake parallelism fails at execution.

## Step 1 — Allocate the plan folder

```sh
ls -d docs/[0-9][0-9]-* 2>/dev/null | sort
```

- `XX` = highest existing two-digit prefix + 1, zero-padded (`01` if `docs/` is empty
  or missing).
- `<slug>` = short kebab-case name for the feature (3–5 words max).
- Folder: `docs/XX-<slug>/`. Create it. Never reuse or renumber an existing folder.

## Step 2 — Analyze the project

Ground the plan in **measured facts**, not assumptions. Use `Explore` subagents for
broad searches so your own context stays free for the plan itself. Establish at least:

1. **Refresh state.** Read `CLAUDE.md`, `ARCHITECTURE.md`, and — if it exists —
   `REFRESH/HANDOFF.md`. The codebase is in a mixed Zustand/MobX, legacy/BEM, state.
   Every task must name *which* pattern the executor follows in the files it touches.
2. **The files and subsystems the feature touches.** Stores (`client/src/stores/`),
   UI (`client/src/ui/`), containers (`client/src/containers/`), services, types,
   server routes, `ai-service/`. Record exact paths and, where useful, line numbers.
3. **Existing analogues.** Find the closest thing already in the codebase that does what
   the feature needs (a similar store, a similar control, a similar route). Tasks should
   point at these as the pattern to copy.
4. **Tests, stories and the gate.** What test/story/lint commands exist today
   (`bunx tsc --noEmit`, `bunx vitest run`, `bunx eslint .`, `bunx storybook build`,
   `bunx stylelint`). Verify which actually run — do not list a gate command you have
   not confirmed exists.
5. **Risks.** Data-safety exposure (types/services/domain/export → corpus snapshots),
   performance traps (pixel grids), scheduled refresh waves that will delete or rewrite
   something you would otherwise build on.

Read the files you will cite. A plan that references a function that does not exist is
worse than no plan.

## Step 3 — Decompose into tasks

Slice the feature into tasks that are each:

- **Independently executable** by a fresh agent reading only that file + `MASTER.md` +
  `CLAUDE.md`.
- **Bounded by an explicit `Touches` list** — every file created, edited, or deleted.
- **Verifiable** with a concrete command and/or concrete manual check.
- Sized **S / M / L** (roughly: under an hour / a few hours / most of a session for one
  agent). Split anything larger than L.

Then build the dependency graph and group tasks into waves: a wave contains only tasks
whose dependencies are all in earlier waves and whose `Touches` are pairwise disjoint.

## Step 4 — Write the task files

One file per task: `docs/XX-<slug>/NN-<task-slug>.md`, `NN` two-digit starting at `01`,
numbered in execution order. Use exactly this structure:

```markdown
# NN — <Task title>

**Wave:** W<k> · **Depends on:** <task numbers or "none">
**Touches:** `path/a.ts` · `path/b.tsx` (new) · `path/c.css` (deleted)
**Effort:** S | M | L

## Objective
One paragraph: what is true after this task that was not true before.

## Context
What the executor must know and would otherwise have to rediscover: current code
shape (with paths/lines), the pattern to follow (MobX vs Zustand, BEM vs legacy,
ui/ vs containers/), the analogue to copy, and the traps.

## Steps
Numbered, concrete, in order. Say where to commit ("commit after step 3").

## Constraints
Task-specific rules beyond CLAUDE.md. Files NOT to touch. Behaviour NOT to change.

## Verification
Exact commands to run and their expected result. Manual checks listed explicitly
(gesture, visual, StrictMode) — these are not optional.

## Definition of done
A checklist. Every item objectively checkable.
```

## Step 5 — Write `MASTER.md`

`docs/XX-<slug>/MASTER.md` is the executor's map. Sections, in order:

1. **Request** — the user's request, verbatim, plus your one-paragraph interpretation
   and any assumptions you made where it was ambiguous.
2. **Outcome** — what the user can do when the plan is complete. Concrete, testable.
3. **Locked decisions** — design choices made *now* so executors do not re-decide them
   mid-flight (naming, where state lives, which pattern, API shape). Table form.
4. **Ground truth** — the measured baseline from Step 2, with paths. Dated.
5. **Wave table** — one row per wave: wave, task files, parallelism (N agents), gate
   command(s) that must exit 0 before the next wave starts.
6. **Dependency graph** — task → depends-on, as a list or ASCII graph.
7. **Collision matrix** — for every multi-task wave, prove the `Touches` sets are
   disjoint. List them side by side.
8. **Alignment guide** — how to keep the implementation on track across many fresh
   contexts: naming conventions to hold, the analogue files to imitate, the boundaries
   that must not be crossed, what "done" looks like visually/behaviourally, and the
   things an executor is most likely to get wrong.
9. **Risk register** — risk, likelihood, impact, mitigation, which task owns it.
10. **Rules for every executor** — restate the `CLAUDE.md` rules that bite here, plus:
    stay inside `Touches`; report partial completion honestly; never mark done with
    manual checks skipped.
11. **Task index** — table of NN, title, wave, effort, one-line summary.

## Step 6 — Write `HANDOFF.md`

`docs/XX-<slug>/HANDOFF.md` is the live ledger `/plan-go` maintains. Seed it:

```markdown
# HANDOFF — <feature>

**Current position:** W1 not started
**Branch:** (set by /plan-go)
**Worktree:** (set by /plan-go)
**Base:** (set by /plan-go — origin/main SHA the branch was cut from)
**Last commit:** (set by /plan-go)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | TODO | | | |
...

## Deviations
(none yet)

## Notes for the next session
(none yet)
```

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Step 7 — Self-review, then report

Before finishing, re-open every task file and check:

- Every path in `Touches` exists (or is marked `(new)` / `(deleted)`).
- Every wave's gate command is one you confirmed runs.
- No two tasks in the same wave share a file.
- Each task's Context is enough for a stranger to start without reading this chat.

Then tell the user: the folder path, the number of tasks and waves, the wave table,
the biggest risk, and that the next step is **`/clear` followed by `/plan-go`**.
