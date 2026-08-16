# P3-09 — Author the REFRESH Plan

**Wave:** P3 · **Depends on:** all of 01–08 · **Output:** the entire `REFRESH/` folder

## Expert profile

You are a technical program manager who also reads code. You turn audit findings
into a dependency-ordered execution plan where each task is small enough for one
agent to finish in one session, and where parallel tasks genuinely don't collide
on the same files.

## Your position in the process

`REFRESH/` **does not exist**. You create it. There is no skeleton to edit and no
prior plan to reconcile against — the structure must be *derived from the
findings*, not fitted to a preconception.

Specifically: do not decide the wave count, the task count, or the task
boundaries before reading the findings. If the audits imply six waves, write six.
If splitting `Canvas.tsx` needs four sequential tasks, write four. The findings
determine the shape.

## Prerequisites

Read **all eight** before writing anything:

```
REFRESH-PREP/findings/dependencies.md
REFRESH-PREP/findings/store-state.md
REFRESH-PREP/findings/component-sizes.md
REFRESH-PREP/findings/css.md
REFRESH-PREP/findings/api-contract.md
REFRESH-PREP/findings/mobx-architecture.md
REFRESH-PREP/findings/component-taxonomy.md
REFRESH-PREP/findings/tooling.md
```

If any is missing or visibly incomplete, **stop and report** rather than filling
the gap with your own assumptions. A plan built on a missing audit is worse than
no plan, because it looks authoritative.

Also read `REFRESH-PREP/MASTER.md` for the locked decisions and the ground-truth
snapshot.

---

## Part 1 — Reconcile

Several audits will propose work on the same files. Known overlaps to expect
(there will be others):

- `server/src/routes/export.ts` — both the component-size audit (03) and the
  API-contract audit (05) propose decomposing it.
- The store action modules — the size audit (03) sees oversized files; the MobX
  design (06) plans to replace them entirely. Splitting a file that is about to
  be rewritten is wasted work.
- `types/index.ts` — the size audit wants it split; the API audit wants the
  serializers moved out.
- Modal chrome — the size audit (03) sees duplication; the taxonomy (07) plans a
  `Modal` primitive.

For each overlap: decide which task owns the work, and record the decision and
its reasoning in `REFRESH/MASTER.md` under `## Reconciled conflicts`. Every piece
of work belongs to **exactly one** task.

---

## Part 2 — Derive the tasks

Write one file per task, `NN-short-slug.md`, numbered in dependency order.

**Sizing rule:** one task = one agent, one session. If a task looks bigger,
split it. Sequential sub-tasks on the same file are normal and correct —
`11-decompose-canvas-pure-utils.md` then `12-decompose-canvas-hooks.md` is
better than one task that won't finish.

**Every task file uses this template:**

```markdown
# <NN> — <Title>

**Wave:** W<n> · **Depends on:** <task numbers, or "nothing">
**Touches:** <explicit file/directory list — this drives collision detection>
**Effort:** S / M / L

## Objective
<one paragraph: what is true after this task that wasn't before>

## Context
<the specific findings this implements, cited by file and section, with the
 facts inlined — see the self-containment rule below>

## Steps
<numbered, concrete, at file level>

## Constraints
<what must NOT change; invariants to preserve>

## Verification
<exact commands that must pass, plus what to check manually>

## Definition of done
<checklist>
```

**Self-containment rule:** a fresh agent handed one task file, with no access to
the findings, must be able to execute it. Cite the findings for provenance, but
inline the actual facts, file paths, class names, and interfaces the agent needs.
Do not write "see findings 04 for the mapping" — include the mapping.

**Coverage rule:** every goal the owner stated must map to at least one task.
Include the traceability table in `MASTER.md`:

| Owner's goal | Task(s) |
| --- | --- |
| Update packages to latest | |
| Break down oversized/sloppy files | |
| MobX ApplicationStore + Session/Domain/UI | |
| BEM CSS for all components | |
| Break large components into organized substructures | |
| UI completely divorced from state | |
| App assembled by joining UI components with the store | |
| Well-defined, simple, isolated, typed API layer | |
| Storybook bubbling up to full-page Layouts | |

---

## Part 3 — Design the waves

This is the part that determines whether parallel execution actually works.

**A wave is a set of tasks that satisfies all four conditions:**

1. **No unmet dependencies** — every task's `Depends on` is in an earlier wave.
2. **No file collisions** — no two tasks in the wave share any entry in their
   `Touches` lists, including directory overlap (`src/ui/**` collides with
   `src/ui/primitives/Button.tsx`).
3. **No semantic collisions** — two tasks may touch different files and still
   conflict, e.g. one renames CSS classes while another edits the `className`
   strings that reference them. Check for these deliberately; the file-list
   check will not catch them.
4. **One verifiable gate** — a command, or short set of commands, that must exit
   0 before the next wave starts.

**Build the collision matrix.** For each wave, write out a task × task grid
showing shared `Touches` entries, and confirm it is empty. Put the matrix in
`MASTER.md`. This is the artifact that proves parallelism is safe rather than
merely asserted — parallel agents editing the same file is the primary way a
plan like this fails in practice.

**Sequential waves are legitimate.** If findings 06 concludes the MobX migration
must be a hard cutover, that wave has one task and one agent. Do not manufacture
parallelism that the dependencies don't support. Note the agent count per wave
honestly.

**Ordering principle:** verification infrastructure precedes the changes it
verifies. A wave that refactors code with no way to check the result is a wave
that produces unreviewable work. Beyond that, let the findings drive the order —
particularly whether the MobX migration is incremental or big-bang, since that
reshapes everything after it.

**Watch the CSS/component interaction specifically.** BEM conversion edits
`className` strings; component decomposition and purification move those same
strings between files. These two streams must be ordered relative to each other,
not run in parallel, unless you can prove the file sets are disjoint.

---

## Part 4 — Write `REFRESH/MASTER.md`

Contents:

1. **Executive summary** — the current state and what the refresh delivers.
2. **Locked decisions** table (from `REFRESH-PREP/MASTER.md`).
3. **Ground truth** — the measured baseline, so progress is checkable.
4. **Wave table** — wave · tasks · agent count · depends on · gate command.
5. **Dependency graph** — ASCII.
6. **Collision matrix** — per wave, proving condition 2.
7. **Task index** — number · title · wave · effort.
8. **Goal traceability table** — from Part 2.
9. **`## Reconciled conflicts`** — from Part 1.
10. **Rules for every REFRESH agent** — at minimum: use `bun`, never `npm`
    (it is not installed); never break `bun run dev`; commit at task
    granularity; run your wave gate and paste the output; stay inside your
    `Touches` list; report honestly, including partial completion.
11. **Risk register** — top failure modes, severity, mitigation.
12. **Rollback** — branch and commit strategy for abandoning a bad wave.

---

## Part 5 — `REFRESH/OPEN-QUESTIONS.md`

Collect every `## Open questions` item from all eight findings into one file,
grouped by topic. Mark each:

- **`BLOCKING`** — a specific task cannot start until the owner answers. Name the
  task. Be conservative; most questions are not blocking.
- **`NON-BLOCKING`** — proceed under a stated assumption. **Write the assumption
  down explicitly**, so if it turns out wrong, the affected work is identifiable.

Two are already known to be blocking-ish and must appear:
- **React 19** — upgrade now or defer? (from findings 01)
- **SessionStore** — the app has no auth today; thin store for save/connection
  state, or defer it? (from findings 02)

---

## Constraints

- **Write plan files only.** Do not modify any application code.
- **Do not drop scope.** Every owner goal gets a task (see the traceability table).
- **Preserve the schema migrations** identified in findings 05
  (`needsVariantMigration`, `migrateLegacyProject`, `migrateLegacyLayer`,
  `projectToCompact`/`compactToProject`). Losing one silently corrupts the
  owner's real project files. Every task that touches them must say so.
- **Do not invent findings.** If the audits didn't establish something you need,
  raise it in `OPEN-QUESTIONS.md` rather than guessing.

## Definition of done

- [ ] `REFRESH/MASTER.md` exists with all 12 sections.
- [ ] `REFRESH/OPEN-QUESTIONS.md` exists, every item marked blocking or not.
- [ ] One file per task, all following the template exactly.
- [ ] Every wave's collision matrix is verified empty and published.
- [ ] Every owner goal appears in the traceability table with a task.
- [ ] Every task is self-contained — executable without reading the findings.
- [ ] Every overlap between audits is resolved and recorded.
