---
name: quick
description: Make a small change fast in an isolated worktree based on the latest origin/main — research how to do it right, write it once, commit, merge it back into main, and stop. No gate runs, no post-verification, no diff re-reading. For low-stakes edits where a green gate is not worth the wall-clock.
argument-hint: [the change to make]
---

# /quick — research properly, write once, merge, stop

The user wants the change **landed on `main`**, not audited. Assume it works first shot.

## Step 0 — isolate the work in a worktree (always, before touching any file)

Every `/quick` runs in its own git worktree branched from the **latest `origin/main`**,
never from whatever the launch checkout happens to be sitting on.

1. Make sure the remote ref is current, and note where `main` lives on disk:

   ```sh
   git fetch origin main
   git worktree list          # first row is the main checkout — call it ROOT
   ```

2. Enter a new worktree with the `EnterWorktree` tool, `name: quick/<slug>` where
   `<slug>` is two to four kebab-case words naming the change (e.g.
   `quick/brush-cursor-offset`). The tool creates `.claude/worktrees/<name>` on a new
   branch and switches the session into it.

3. Pin the branch to the remote regardless of the `worktree.baseRef` setting. The
   branch is brand new with nothing on it, so this is safe:

   ```sh
   git reset --hard origin/main
   ```

4. Dependencies: the worktree has no `node_modules`. If the change needs to run
   anything, `bun install` inside the worktree. **Never** create a lockfile; check
   `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` before committing.

If `EnterWorktree` refuses because the session is already inside a worktree, stop and
say so — do not fall back to editing the launch checkout.

## What this skill changes

The default working style front-loads research and back-loads verification. `/quick`
keeps the front and **deletes the back**.

**Still do:**

- **Read enough to be right.** Find the existing pattern, the file that already
  solves this, the constant that already exists. Grepping three files to learn the
  convention is *cheap and in scope* — it is what makes the one shot land.
- Match the surrounding code's idiom, naming and comment density.
- Follow every non-negotiable rule in `CLAUDE.md` (bun only, no lockfiles, the `ui/`
  boundary, never deep-observe a pixel grid, never touch `server/src/data/`).

**Do NOT:**

- Run `bun run verify`, `bunx tsc --noEmit`, `bunx vitest run`, `bunx eslint`,
  `bunx stylelint`, `bunx storybook build`, or `bun run lint:boundaries`.
- Re-read the file after editing to confirm the edit took. `Edit`/`Write` error if
  they fail; a clean return **is** the confirmation.
- `git diff` your own change to inspect it.
- Write a test for the change, unless the user asked for one.
- Spawn a subagent to review it.
- Hedge in the report about what *might* be broken. State what you changed.

## Step N — commit and merge back into `main`

Once the edit is written:

1. **Commit in the worktree**, one commit, with a conventional subject
   (`fix(client): …`, `docs: …`, `chore(server): …`) and whatever attribution trailers
   the session requires:

   ```sh
   git add -A && git commit -m "<subject>"
   ```

2. **Check that `ROOT` can receive the merge.** All three must hold, otherwise stop,
   leave the worktree in place, and report the branch name for the user to merge
   themselves:

   ```sh
   git -C "$ROOT" branch --show-current                       # must print: main
   git -C "$ROOT" status --porcelain --untracked-files=no     # must print nothing
   git -C "$ROOT" merge --ff-only origin/main                 # must succeed
   ```

   The third line brings local `main` up to the same `origin/main` the work was based
   on. If it fails, local `main` has diverged from the remote and reconciling that is
   the user's call, not `/quick`'s.

3. **Merge, no fast-forward**, so the change stays a visible unit in history the same
   way wave branches do:

   ```sh
   git -C "$ROOT" merge --no-ff quick/<slug> -m "Merge quick/<slug>: <subject>"
   ```

   On a conflict: `git -C "$ROOT" merge --abort`, keep the worktree, and report. Do not
   resolve conflicts inside a `/quick` — a conflict means the change was not as small
   as it looked.

4. **Clean up.** Call `ExitWorktree` with `action: "remove"`. It deletes the worktree
   directory and the `quick/<slug>` branch and returns the session to `ROOT`. It refuses
   if anything is uncommitted or unmerged — that refusal is a signal something above
   was skipped, not a prompt to pass `discard_changes`.

5. **Do not push.** `main` is merged locally. Pushing is a separate, outward-facing
   action the user takes themselves unless they asked for it in the request.

## Report

Two or three sentences. What changed, which file, the merge commit on `main`, and —
if it matters — the one thing that would make it wrong. Mention that `main` is not
pushed. No gate output, no checklist, no owed-verification tally.

## When to break out of this skill

Say so plainly, do the safe thing, and keep going:

- The change turns out **not** to be small — it needs a migration, a wire-format
  change, or edits across many files.
- It touches **the owner's real data**: `server/src/data/`, the migrations, the
  corpus snapshots, or anything under `client/src/types/codecs/`. Those carry a
  human-reads-the-diff rule that `/quick` does not override.
- Research says the obvious change is **wrong**, and the right one is a redesign.
- The merge step cannot complete (root not on `main`, dirty root, diverged `main`,
  or a conflict).

In those cases: stop, say why in one or two sentences, and ask — do not quietly
expand a `/quick` into a refactor. If a worktree already exists, leave it (`ExitWorktree`
with `action: "keep"`) and name the branch so nothing is lost.

## The bargain

The user has accepted the risk of an unverified edit in exchange for speed. If it
breaks, they will say so and you will fix it — that round trip is **cheaper** than
a full gate on every small change. Do not re-litigate this or add verification back
"just to be safe." The worktree is not verification; it is what lets the unverified
edit land on a clean, current `main` without disturbing whatever the launch checkout
is in the middle of.
