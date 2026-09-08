---
name: quick
description: Make a small change fast — research how to do it right, write it once, and stop. No gate runs, no post-verification, no diff re-reading. For low-stakes edits where a green gate is not worth the wall-clock.
argument-hint: [the change to make]
---

# /quick — research properly, write once, stop

The user wants the change **landed**, not audited. Assume it works first shot.

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

## Report

Two or three sentences. What changed, which file, and — if it matters — the one
thing that would make it wrong. No gate output, no checklist, no owed-verification
tally.

## When to break out of this skill

Say so plainly, do the safe thing, and keep going:

- The change turns out **not** to be small — it needs a migration, a wire-format
  change, or edits across many files.
- It touches **the owner's real data**: `server/src/data/`, the migrations, the
  corpus snapshots, or anything under `client/src/types/codecs/`. Those carry a
  human-reads-the-diff rule that `/quick` does not override.
- Research says the obvious change is **wrong**, and the right one is a redesign.

In those cases: stop, say why in one or two sentences, and ask — do not quietly
expand a `/quick` into a refactor.

## The bargain

The user has accepted the risk of an unverified edit in exchange for speed. If it
breaks, they will say so and you will fix it — that round trip is **cheaper** than
a full gate on every small change. Do not re-litigate this or add verification back
"just to be safe."
