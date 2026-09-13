---
name: plan-go
description: Execute the most recent docs/XX-<feature>/ plan written by /plan-steps — in an isolated worktree branched from the latest origin/main, wave by wave, one subagent per task, coordinator verifies every gate and keeps HANDOFF.md current. Run in a fresh context (/clear first).
argument-hint: [XX — optional plan number to run instead of the latest]
---

# /plan-go — execute a plan

You are the **coordinator**. You do not write application code yourself. You dispatch
one subagent per task, verify each wave's gate with your own eyes, and keep the ledger
truthful. This keeps your context free of line-level detail so you can run the whole
plan in one session.

All work happens in a **dedicated git worktree branched from the latest `origin/main`**,
never in the launch checkout and never from whatever the launch checkout happens to be
sitting on. The launch checkout (call it `ROOT`) is only ever read from; it is not
edited, not committed to, and its branch is not switched.

## Step 1 — Locate the plan (in ROOT)

```sh
git worktree list                      # first row is the main checkout — that is ROOT
ls -d docs/[0-9][0-9]-* 2>/dev/null | sort
```

- If `$ARGUMENTS` gives a number, use `docs/<that number>-*/`.
- Otherwise use the folder with the **highest** two-digit prefix.
- If there is none, tell the user to run `/plan-steps` first and stop.

Note the plan's `XX` and `<slug>` (the folder name minus the `XX-` prefix). Do **not**
read the plan yet — the copy you execute from is the one inside the worktree (Step 2),
which may be ahead of ROOT's copy if a previous session already ran part of it.

## Step 2 — Enter the worktree

Branch: `feat/XX-<slug>`. Worktree directory: `.claude/worktrees/feat+XX-<slug>`
(same name with `/` replaced by `+`, matching the layout EnterWorktree uses).

1. **Refresh the remote ref.** Every run starts from the current remote, not local
   `main`:

   ```sh
   git fetch origin main
   ```

2. **Reuse or create.**

   - If `git worktree list` already shows `.claude/worktrees/feat+XX-<slug>`, this is a
     **resume**. Do not recreate or rebase it — the ledger inside it is the truth.
   - If the branch `feat/XX-<slug>` exists but has no worktree, a previous session ran
     outside a worktree or removed it. Attach one to the existing branch:
     `git worktree add .claude/worktrees/feat+XX-<slug> feat/XX-<slug>`.
   - Otherwise create both, based explicitly on the remote so the `worktree.baseRef`
     setting cannot change the outcome:

     ```sh
     git worktree add -b feat/XX-<slug> .claude/worktrees/feat+XX-<slug> origin/main
     ```

3. **Switch the session in** with the `EnterWorktree` tool, passing `path` (the absolute
   worktree path), not `name`. `name` would invent its own branch name and base ref;
   `path` enters the exact worktree created above. If `EnterWorktree` refuses because
   the session is already inside a different worktree, stop and say so — do not fall
   back to editing ROOT.

   Everything from here on runs inside the worktree. Every absolute path you write —
   in your own commands and in every subagent prompt — is under the worktree, never
   under ROOT.

4. **Carry the plan in.** `/plan-steps` normally commits `docs/XX-<slug>/` on `main` and
   pushes it, so a worktree cut from `origin/main` already contains it. If it does not
   (the push step was skipped or refused), the folder is still sitting uncommitted in
   ROOT.

   - If `docs/XX-<slug>/` is missing in the worktree: copy it from ROOT and commit it
     as the branch's first commit:

     ```sh
     cp -R "$ROOT/docs/XX-<slug>" docs/
     git add docs/XX-<slug> && git commit -m "docs(XX): add <slug> plan"
     ```

   - If it is already present (resume, or the plan was committed to `main`), leave it
     alone. Do not overwrite a worktree ledger with ROOT's copy.

5. **Dependencies.** The worktree has no `node_modules`. Run `bun install` in the
   worktree root before the first gate. Never create a lockfile; before every commit
   in Step 3, `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` must print
   nothing.

Now read, in full: `MASTER.md`, `HANDOFF.md`, and `CLAUDE.md` — the worktree copies.
Do **not** read every task file yet — read each one only when its wave is dispatched.

## Step 3 — Verify the starting state (in the worktree)

```sh
git status --short
git log --oneline -5
git branch --show-current                # must print feat/XX-<slug>
git merge-base --is-ancestor origin/main HEAD && echo "based on origin/main"
```

- On a fresh worktree the tree is clean, the branch is `feat/XX-<slug>`, and `HEAD` is
  `origin/main` plus at most the plan-docs commit.
- On a resume, `HANDOFF.md` records a branch, worktree path and last commit — they must
  match what you see. If they do not, or the tree is dirty with changes you cannot
  account for, **stop and report** — do not guess what a previous session left
  half-done.
- If the ledger says a wave is `IN PROGRESS`, `PARTIAL` or `BLOCKED`, read its notes and
  resume from there rather than restarting it.
- Record **Branch**, **Worktree** (absolute path) and **Base** (`origin/main` SHA) in
  `HANDOFF.md`. Never commit to `main`; never commit in ROOT.
- Re-run the previous completed wave's gate (if any) to prove you stand where the ledger
  claims.

## Step 4 — Execute waves in order

For each wave from the ledger's current position:

1. **Mark it** `IN PROGRESS` in `HANDOFF.md`.
2. **Read the wave's task files.** Confirm the collision matrix in `MASTER.md` still
   holds against the current tree (a previous wave's deviation can invalidate it).
3. **Dispatch one subagent per task**, all in one message so they run in parallel.
   Use `subagent_type: "general-purpose"`. The prompt must contain:
   - the absolute **worktree** path, with the instruction that all work, commands and
     commits happen there (`cd` into it first; never touch ROOT or any other worktree);
   - the absolute path of the task file, `MASTER.md`, and `CLAUDE.md` — all under the
     worktree — with the instruction to read all three fully before starting;
   - the instruction to stay strictly inside the task's `Touches` list and to **stop
     and report** rather than expand scope;
   - the instruction to commit at the points the task specifies, with clear messages;
   - the instruction to run the task's Verification and report **real output**, and to
     list every manual check it could not perform;
   - the instruction to report deviations from the spec and why;
   - the reminder: `bun`/`bunx` only, no lockfiles, no `vitest -u`, never touch
     `server/src/data/`.
4. **Verify the gate yourself.** When the subagents report, run the wave's gate command
   from `MASTER.md` in the worktree and read the output. Do not take a subagent's word
   for it. Also `git status --short` — an unexpected modified file outside the wave's
   `Touches` is a deviation to record and, if serious, a reason to stop. A stray
   `bun.lock*` is a deviation: delete it, do not commit it.
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

Partial completion, honestly recorded, is a legitimate outcome. When you stop, **leave
the worktree in place** — do not call `ExitWorktree` with `remove`. The ledger inside it
is how the next `/plan-go` resumes.

## Step 5 — Finish

When every wave is `DONE`:

1. Run the final gate from `MASTER.md` once more and paste the output into the ledger.
2. Set **Current position** to `COMPLETE`.
3. Report to the user: what landed (per wave), the branch, the worktree path and final
   commit, every deviation, every manual check still owed, and a suggested next step
   (review, merge, or a follow-up `/plan-steps`). Include the merge command they would
   run from ROOT once they have reviewed:

   ```sh
   git merge --no-ff feat/XX-<slug>
   ```

   Do not merge, push, or remove the worktree — that is the user's call.
