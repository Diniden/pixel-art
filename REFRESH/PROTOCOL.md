# REFRESH — Handoff Protocol

**This is the entry point for any agent session picking up the REFRESH work.**

The refresh is 38 tasks across 31 waves. No single context window can hold it. This
protocol exists so that a **fresh agent, with no memory of prior sessions, can resume
correctly from files on disk alone.**

The invariant: **`HANDOFF.md` is the single source of truth for what is done.**
Not git log, not your memory, not the task files. If `HANDOFF.md` says W3 is the next
wave, W3 is the next wave.

---

## The four documents

| File | Role | Who writes it |
| --- | --- | --- |
| `MASTER.md` | The plan. Wave table, dependency graph, collision matrix, risk register. **Read-only during execution.** | Nobody — it is the specification |
| `NN-*.md` (38 files) | One executable task spec each: objective, steps, constraints, verification, definition of done. **Read-only during execution.** | Nobody |
| `OPEN-QUESTIONS.md` | Owner decisions and stated assumptions. Read before starting a task that references a Q-number. | The owner, or an agent recording a new answer |
| **`HANDOFF.md`** | **The live ledger.** Current wave, per-wave status, gate evidence, deviations, and the next action. | **Every session, at the end of every wave** |

---

## Execution model: one subagent per wave

**Waves are executed by subagents, one per wave, each with a fresh context.** The
coordinator (the main session) does not do the wave's work itself. This is deliberate:
a wave's task file is a complete, self-contained spec, and a fresh context that reads only
that spec produces better work than a long-running context that has drifted through
twenty earlier waves.

**Coordinator's job, per wave:**

1. Confirm the tree is clean and matches the ledger.
2. Create the wave branch.
3. **Dispatch a subagent** with: the wave number, its task file path(s), `PROTOCOL.md`,
   `CLAUDE.md`, and the gate command from the ledger. Tell it to execute the task and
   report what it did, what passed, and what it could not do.
4. **Verify the gate itself** — do not take the subagent's word for it. Run the gate
   command and read the real output.
5. Commit, merge `--no-ff`, update the ledger with the merge SHA.
6. Dispatch the next wave.

**The coordinator never edits source files during a wave.** If a wave needs fixing, that
is a follow-up dispatch, not the coordinator reaching in. Keeping this boundary is what
stops the coordinator's context filling with line-level detail.

**Multi-task waves** (W5 runs 3 tasks; W6, W7, W11, W14, W25 run 2) dispatch one subagent
per task, in parallel — their collision matrices are proven empty in `MASTER.md` §6.

---

## Starting a session

Do this in order. Do not skip step 3 — a stale working tree has bitten this plan before.

### 1. Read the ledger

```sh
cd /Users/diniden/Desktop/self/pixel-art
cat REFRESH/HANDOFF.md
```

The **Current position** block at the top tells you the next wave and its tasks.

### 2. Read your task files

Read `MASTER.md` §4 (the wave table row for your wave) and §10 (the rules — all 14 apply
to you). Then read the full `NN-*.md` for **every** task in your wave. These specs are
detailed and measured; follow them rather than improvising a better approach.

If your task references a `Q<number>`, read that entry in `OPEN-QUESTIONS.md`. Several
owner decisions **invert** what an earlier draft assumed — Q10 (no lockfiles), Q2
(`aiServiceUrl` stays), Q28 (no pre-migration data survives), Q41 (a11y advisory only).

### 3. Verify the tree matches the ledger

```sh
git status --short          # must be clean; if not, STOP and report
git log --oneline -5        # last commit should match HANDOFF's "Last commit"
```

If the working tree is dirty or the last commit does not match what `HANDOFF.md`
records, **stop and report to the owner.** Do not guess at what a previous session
left half-finished. Reconstructing intent from a dirty tree is how a plan like this
corrupts data.

### 4. Re-run the *previous* wave's gate

Cheap, and it proves you are standing where the ledger claims. If the previous gate
does not pass, the ledger is wrong — stop and report.

### 5. Branch

```sh
git checkout -b refresh/w<N>-<slug>
```

One branch per **wave**, never per task. A wave is the unit that has a gate, so it is
the unit that can be proven good. Never commit to `main` directly.

---

## Doing the work

- **Commit per numbered step** where the task says to. A Prettier sweep, a strictness
  flag, and a refactor are three commits, never one.
- **Stay inside your task's `Touches` list.** The collision matrix in `MASTER.md` §6 is
  only valid if `Touches` is accurate. If the work genuinely needs a file outside it,
  stop and report rather than expanding scope.
- **`bun` / `bunx` only.** `node` and `npm` are not on PATH.
- **Never create a lockfile.** Never pass `--frozen-lockfile`. See `CLAUDE.md`.
- **Never run `vitest -u`** on the migration or corpus suites. Every snapshot diff
  there is a change to real user data and must be read by a human.

---

## Ending a session — the handoff write

**A wave is not done until `HANDOFF.md` is updated.** This is the step that makes the
next session possible, and it is the one most likely to be skipped under context
pressure. If you are running low on context, **write the handoff first**, then continue
working if room remains.

1. **Run the wave gate** from `MASTER.md` §4 and **capture the real output.**
2. **Do the manual checks** the task lists. Gesture behaviour, stacking order and visual
   regressions are not automatable here; a task whose manual checks were skipped is not
   done, and the ledger must say so honestly.
3. **Update `HANDOFF.md`:**
   - Move the **Current position** block to the next wave.
   - Fill in the wave's row: status, date, commit SHA, **pasted gate output**.
   - Record every **deviation** from the task spec, and why.
   - Record anything the next session needs that is not in the task files.
4. **Merge the wave** with `--no-ff` so it is one revertable commit:
   ```sh
   git checkout main && git merge --no-ff refresh/w<N>-<slug>
   ```
   Merge **only** when the gate exits 0. A wave that does not pass its gate stays on its
   branch and the ledger records it as `BLOCKED` with the reason.
5. Commit the `HANDOFF.md` update itself.

### Partial completion is a legitimate outcome

A wave that finished 6 of 8 steps, with the reasons stated and the ledger marked
`PARTIAL`, is far more useful than one claiming success. Record which steps landed,
which did not, and exactly what the next session must pick up. Do not mark a wave
`DONE` because it is nearly done.

---

## Stopping rules — report to the owner rather than proceeding

Stop, write the ledger, and report if any of these occur:

- The working tree is dirty at session start, or the last commit disagrees with the ledger.
- A wave gate fails and you cannot fix it within the task's stated scope.
- The work requires a file outside your `Touches` list.
- A **corpus or migration snapshot changes.** This means real user data is affected.
  Rule 9 forbids `vitest -u`; a human must read the diff.
- A dependency version resolves differently than the task specifies.
- You hit an unanswered question not covered in `OPEN-QUESTIONS.md`. Add it there as a
  new Q-number, mark it BLOCKING or NON-BLOCKING, and report.

---

## Why the waves are mostly sequential

Do not try to parallelise beyond what `MASTER.md` §4 authorises. Six waves run more than
one agent (W5 runs 3; W6, W7, W11, W14, W25 run 2) and their collision matrices are
proven empty in §6. **The other 25 are single-task and honestly so** — the store
migration is a genuine chain where each slice depends on the last. Manufacturing
parallelism the dependencies do not support is how a plan like this fails.
