#!/bin/bash
# PreToolUse guard for the two project rules that silently destroy work.
#
# 1. `vitest -u` / `--update` rewrites snapshots. The migration and corpus
#    snapshots ARE the owner's real pixel data — a rewrite discards the diff a
#    human was supposed to read. See CLAUDE.md and REFRESH/MASTER.md rule 9.
# 2. `--frozen-lockfile` is meaningless here: this repo has NO lockfiles by
#    owner policy (2026-08-16). Reproducibility comes from exact versions in
#    package.json.
#
# A permission-rule pattern cannot catch a flag in the middle of a command
# string, so this hook inspects the command directly. Exits 0 with no output
# when the command is fine.

cmd=$(jq -r '.tool_input.command // ""')

if printf '%s' "$cmd" | grep -qE '(^|[^-[:alnum:]])(-u|--update)([[:space:]]|$)' \
   && printf '%s' "$cmd" | grep -q 'vitest'; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED: vitest -u/--update rewrites snapshots. Migration and corpus snapshots are the owner'"'"'s real pixel data (CLAUDE.md). A human must read every snapshot diff."}}\n'
  exit 0
fi

if printf '%s' "$cmd" | grep -qE 'frozen-lockfile'; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED: --frozen-lockfile is meaningless in this repo. This project has NO lockfiles by policy; reproducibility comes from exact versions in package.json."}}\n'
  exit 0
fi

exit 0
