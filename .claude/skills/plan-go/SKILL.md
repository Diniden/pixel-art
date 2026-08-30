---
name: plan-go
description: Execute the most recent docs/XX-<feature>/ plan written by /plan-steps — wave by wave, one subagent per task, coordinator verifies every gate and keeps HANDOFF.md current. Run in a fresh context (/clear first).
argument-hint: [XX — optional plan number to run instead of the latest]
---

# /plan-go — execute a plan

You are the **coordinator**. You do not write application code yourself. You dispatch
one subagent per task, verify each wave's gate with your own eyes, and keep the ledger
truthful. This keeps your context free of line-level detail so you can run the whole
plan in one session.

## Step 1 — Locate the plan

```sh
ls -d docs/[0-9][0-9]-* 2>/dev/null | sort
```

- If `$ARGUMENTS` gives a number, use `docs/<that number>-*/`.
- Otherwise use the folder with the **highest** two-digit prefix.
- If there is none, tell the user to run `/plan-steps` first and stop.

Read, in full: `MASTER.md`, `HANDOFF.md`, and `CLAUDE.md`. Do **not** read every task
file yet — read each one only when its wave is dispatched.

## Step 2 — Verify the starting state

```sh
git status --short
git log --oneline -5
git branch --show-current
```

- If `HANDOFF.md` records a branch / last commit, they must match. If they do not, or
  the tree is dirty with changes you cannot account for, **stop and report** — do not
  guess what a previous session left half-done.
- If the ledger says a wave is `IN PROGRESS`, `PARTIAL` or `BLOCKED`, read its notes and
  resume from there rather than restarting it.
- Branch: if on `main`, create `feat/XX-<slug>`. If already on a feature branch, stay
  on it. Record the branch in `HANDOFF.md`. Never commit to `main`.
- Re-run the previous completed wave's gate (if any) to prove you stand where the ledger
  claims.

## Step 3 — Execute waves in order

For each wave from the ledger's current position:

1. **Mark it** `IN PROGRESS` in `HANDOFF.md`.
2. **Read the wave's task files.** Confirm the collision matrix in `MASTER.md` still
   holds against the current tree (a previous wave's deviation can invalidate it).
3. **Dispatch one subagent per task**, all in one message so they run in parallel.
   Use `subagent_type: "general-purpose"`. The prompt must contain:
   - the absolute path of the task file, `MASTER.md`, and `CLAUDE.md`, with the
     instruction to read all three fully before starting;
   - the instruction to stay strictly inside the task's `Touches` list and to **stop
     and report** rather than expand scope;
   - the instruction to commit at the points the task specifies, with clear messages;
   - the instruction to run the task's Verification and report **real output**, and to
     list every manual check it could not perform;
   - the instruction to report deviations from the spec and why;
   - the reminder: `bun`/`bunx` only, no lockfiles, no `vitest -u`, never touch
     `server/src/data/`.
4. **Verify the gate yourself.** When the subagents report, run the wave's gate command
   from `MASTER.md` and read the output. Do not take a subagent's word for it. Also
   `git status --short` — an unexpected modified file outside the wave's `Touches` is a
   deviation to record and, if serious, a reason to stop.
5. **Spot-check the work.** Skim the diff (`git diff <prev>..HEAD --stat`, then the
   files that matter most). You are checking for scope creep, broken boundaries
   (`ui/` importing stores, deep-observed pixel grids), and quietly skipped steps.
6. **Manual checks.** If the task lists manual checks (gesture, visual, StrictMode),
   surface them to the user explicitly in your report — say which were done by the
   subagent, which were not, and what the user should look at. Do not mark a wave
   `DONE` while claiming manual checks passed that nobody performed.
7. **Update `HANDOFF.md`:** status (`DONE` / `PARTIAL` / `BLOCKED`), date, commit SHA,
   pasted gate output (trimmed to the meaningful lines), deviations, and notes for the
   next session. Commit the ledger update.
8. If the gate failed and the fix is inside the task's scope, dispatch a **follow-up
   subagent** with the failure output. Do not fix it yourself. Two failed follow-ups →
   mark `BLOCKED`, report, stop.
9. Move to the next wave.

## Stopping rules

Write the ledger, then stop and report to the user, if:

- the tree/ledger disagree at start;
- a gate fails and the fix is out of scope or two follow-ups have failed;
- a subagent reports needing a file outside its `Touches`;
- a corpus or migration snapshot changes (real user data — a human must read the diff);
- a subagent hits a question the plan does not answer and any reasonable answer would
  change the work materially. Record the question in `HANDOFF.md` under Deviations.

Partial completion, honestly recorded, is a legitimate outcome.

## Step 4 — Finish

When every wave is `DONE`:

1. Run the final gate from `MASTER.md` once more and paste the output into the ledger.
2. Set **Current position** to `COMPLETE`.
3. Report to the user: what landed (per wave), the branch and final commit, every
   deviation, every manual check still owed, and a suggested next step (review, merge,
   or a follow-up `/plan-steps`). Do not merge or push — that is the user's call.
