# HANDOFF — Capacitor iPad feasibility analysis

**Current position:** W1 DONE (all six findings on disk, gate artifact checks PASS) — UNCOMMITTED, git actions suspended pending branch reconciliation; W2 not started
**Branch:** feat/10-capacitor-ipad-analysis (plan committed at 324c41c; tree currently checked out on feat/09 by another session)
**Last commit:** 324c41c (docs(10) plan)

> NOTE: this working-tree copy of HANDOFF.md is UNTRACKED and newer than the copy
> committed at 324c41c. When reconciling branches, this file's content wins — merge it
> over the tracked version before or when checking feat/10 out again.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05, 06 | DONE (uncommitted) | 2026-09-06 | pending reconciliation | gate.sh w1 body run inline: "GATE w1 artifact checks: PASS"; tree clean outside docs/ + .claude/; no lockfile. Findings 01–06 all present (25–43 KB each), all four D5 sections verified per file |
| W2 | 07 | TODO | | | |
| W3 | 08 | TODO | | | |
| W4 | 09 | TODO | | | |

## Deviations
- Coordinator decision (2026-09-06): W1 subagents do NOT commit — six parallel agents
  racing on the git index is a collision risk the plan didn't foresee. The coordinator
  commits each wave's artifacts after its gate passes. Task-level "commit" language is
  superseded for this docs-only plan.
- **CONCURRENT-SESSION HAZARD (2026-09-06, during W1):** a second Claude session is
  working this same working tree on the docs/09 plan. Mid-wave it committed d24ba3a
  ("docs(09): W1 complete") — which landed on feat/10-capacitor-ipad-analysis because
  that branch was checked out at that moment, and is now stranded in feat/10's history
  (cb27aa0 → d24ba3a → 324c41c) — then checked the tree out to feat/09-ipad-pencil-fixes
  (which removed docs/10's tracked files from the working tree) and continued there
  (49488b3, 5e1af2b + uncommitted color-store edits). Coordinator response: all
  git-mutating actions SUSPENDED (no commit/checkout/rebase); W1 agents allowed to
  finish since they write only untracked findings files, and server/src +
  client/src/api were verified untouched by the other session's changes. Agents read
  the plan files via `git show feat/10-capacitor-ipad-analysis:<path>`.
  **Owner must resolve before W1 commits:** (a) the other session's lifecycle,
  (b) which branch the tree rests on, (c) the stranded d24ba3a in feat/10 — feat/09's
  history appears to lack that docs/09 ledger commit; suggested cleanup once the other
  session is quiet: rebase 324c41c onto feat/09's tip so d24ba3a returns to its home
  branch and feat/10 carries only the docs/10 plan commit.

## Notes for the next session
- This plan is docs-only: the gate is "tree clean outside docs/ + artifacts exist"
  (MASTER §5/§10) via gate.sh (committed in feat/10 at 324c41c).
- W1 tasks must NOT write to GAPS.md (MASTER D7) — gaps go in each findings file.
- W1 findings so far (all untracked under docs/10-capacitor-ipad-analysis/findings/):
  - 01-server-portability.md — DONE. Key correction to MASTER §4: export-golden.test.ts
    pins pure functions, NOT artifact bytes; no test byte-compares export/backup output;
    backup .gz has zero gunzip call sites. Buckets refined: PORTABLE 1,312 / SHIM 1,409 /
    DROP 464 LOC. ServerPlatform sketch requires SYNCHRONOUS hashes (transform.ts sync
    paths — WebCrypto can't; JS md5/sha256 needed). Gaps G-101–G-109.
  - 02-capacitor-feasibility.md — DONE. Capacitor 8.5.1 pins; spike ran fully under
    `bun x` with no repo lockfile; SPM (no CocoaPods); origin `capacitor://localhost`;
    Filesystem `Directory.Data` maps to Documents on iOS (TRAP — use Library);
    webview storage evictable, Filesystem/Library is not; JS suspends in background
    (autosave must flush on appStateChange); zeroconf plugin exists but Cap-8 compat
    unverified. Gaps G-201–G-209.
  - 05-local-persistence.md — DONE. Winner: Capacitor Filesystem @ Directory.Library;
    runner-up OPFS+sidecar. Account-namespaced layout under Library/pixel-art/accounts/.
    Typed storage-full/write-verify-failed errors. Gaps G-501–G-509.
  - 06-sync-accounts-security.md — DONE. HMAC-namespace accounts; AES-256-GCM envelope +
    Argon2id (hash-wasm@4.12.0) with PBKDF2 fallback; six-word-code pairing windows
    (no maintained SPAKE2 — composition risk logged); relay-through-server for
    device↔device (webview can't listen); whole-file LWW sync with backup-before-
    overwrite; legacy no-auth surface stays open unless owner gates it (G-607).
    Gaps G-601–G-614.
- 03-client-transport-seam.md — DONE. Resource-level ApiTransport swap behind frozen
    delegators; boot branch behind VITE_APP_TARGET=capacitor (dead-code-eliminated in
    web build); SyncClient simply not constructed in local mode; full 18-method
    behavior/error table; shared contract-test suite for both transports. G-301–G-307.
  - 04-export-encoding.md — DONE, with scratchpad measurements on the real 264-texture
    corpus: fast-png pixel-exact and 0.86x sharp's size; Bun vendors Cloudflare zlib so
    .gz byte-identity is unachievable browser-side (G-403); canvas.toBlob corrupts via
    premultiplication (measured, G-404); wasm-vips is the only byte-identity shot
    (unproven, G-401). Confirms task 01: no automated byte gate exists — it is a manual
    diff -r procedure in comments (G-407). G-14 options written for DECISIONS-NEEDED,
    recommendation: sharp+fast-png with decoded-pixel re-baseline. G-401–G-408.
- W1 gap total: 15 seeded + 54 from findings (9+9+7+8+9+14, some overlapping) awaiting
  task 07 consolidation.
- NEXT ACTION (after owner reconciles branches): commit findings + this ledger on
  feat/10-capacitor-ipad-analysis, then dispatch W2 (task 07).
