# pixel-art — agent instructions

A pixel-art editor with lighting/normal-map authoring, variant management, sprite export,
and an AI frame-interpolation service. Bun monorepo: `client/` (React + Vite),
`server/` (Express + sharp), `ai-service/` (Python).

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the project is structured and how to
extend it.** This file is the rules; that file is the map.

---

## 🔴 The project is mid-refresh — read this before writing any code

A 38-task structural refresh is in progress: Zustand → MobX, BEM CSS, a `ui/` layer
divorced from state, a typed API layer, and a Storybook/Vitest/ESLint harness.

**Before any non-trivial change, read [`REFRESH/HANDOFF.md`](./REFRESH/HANDOFF.md)** to
see which waves have landed. The codebase is in a **mixed state**: some subsystems are
migrated and some are not, and the correct pattern depends on which.

- Executing a refresh wave? Follow [`REFRESH/PROTOCOL.md`](./REFRESH/PROTOCOL.md) exactly.
- Doing unrelated work? Match the conventions of the subsystem you are in, and check the
  ledger so you do not build on something a scheduled wave is about to delete.

**`REFRESH/HANDOFF.md` is the single source of truth for refresh progress** — not git
log, not the task files, not memory.

---

## Non-negotiable rules

### Runtime: Bun only

`node` and `npm` are **not on PATH**. `which node` returns nothing. Use `bun` and `bunx`
in every command, script, and doc.

### Never create a lockfile

Standing owner policy (2026-08-16). The repo has **no** `bun.lock`, `bun.lockb`,
`package-lock.json`, or `yarn.lock`, and must never gain one.

- `bunfig.toml`'s `[install.lockfile] save = false` is **deliberate — never remove it.**
- Reproducibility comes from **exact version strings in `package.json`**: no `^`, no `~`,
  no ranges, no `*`.
- Every `bun add` must use **`--exact`** — plain `bun add x@1.2.3` writes `"^1.2.3"`.
- **`--frozen-lockfile` is meaningless here and must never appear in any command.**
- ⚠️ **`bunx` can recreate a lockfile as a side effect** (measured: `bunx vitest run` from
  the repo root printed `Saved lockfile`). After running `bunx`, check before committing:
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules`. This is **not** a reason
  to change `bunfig.toml`.

A `PreToolUse` hook (`.claude/hooks/guard-data-safety.sh`) blocks `vitest -u/--update` and
`--frozen-lockfile`. Treat it as a backstop, not permission to stop thinking — it only
inspects Bash commands.

### Never break `bun run dev`

If a change stops the app from starting, fix it or revert before finishing. `bun run dev`
launches all three processes via mprocs.

### Protect the owner's data — this is the highest-severity rule

`server/src/data/Base Unit.json` is **1.1 MB of the owner's real work**, with 9 gzipped
backups holding 149 snapshots. Eight schema migrations stand between those files and
corruption, and a bad refactor **mangles pixels silently rather than erroring**.

- **Never run `vitest -u`** on the migration or corpus suites. Every snapshot diff there
  is a change to real user data and must be read by a human.
- **Measured 2026-08-16: no pre-migration data survives anywhere in the repo.** All 149
  snapshots are already fully migrated. The migrations are verifiable **only** against
  hand-authored synthetic fixtures — there is no real-data safety net.
- The four known migration bugs are **pinned as characterisation tests, not fixed.**
  Assert observed behaviour, never desired behaviour. Fixing one needs a purpose-built
  synthetic corpus and explicit owner sign-off.
- Any change under `client/src/types/`, `client/src/services/`, `client/src/stores/domain/`
  or `server/src/export/` must confirm the corpus snapshots still pass **unchanged**.

### Never deep-observe a pixel grid

`layer.pixels` is **`observable.ref`, always.** The real project has **300,249 pixel
cells**; deep observation creates ~1M proxies and presents as "MobX is slow" rather than
as the modelling error it is. Canvases are driven by a `reaction` on `pixelVersion`, not
by `observer`.

### The `ui/` boundary

- **Nothing under `client/src/ui/` may import a store, the API, or MobX.** Pure
  presentation, props in and callbacks out.
- **`observer()` only under `client/src/containers/`.** Containers wire stores to UI.
- ESLint enforces both. **If the rule seems not to fire, run the boundary probe** — a
  rule matching nothing looks exactly like a rule that passes.

---

## Working conventions

- **Commit at task granularity.** A formatting sweep, a strictness flag, and a refactor
  are three commits, never one.
- **One branch per refresh wave** (`refresh/w<N>-<slug>`), merged `--no-ff` only when the
  gate exits 0. Never commit directly to `main`.
- **Run the gate and paste the real output.** "It passes" is not a report.
- **Do the manual checks.** Gesture behaviour, StrictMode semantics, stacking order and
  visual regressions are not automatable here. A task whose manual checks were skipped is
  not done.
- **Report honestly, including partial completion.** Six of eight steps with the reasons
  stated beats a claim of success. If a verification fails and you cannot fix it, say so.
- **Stay in scope.** During a refresh wave, stay inside the task's `Touches` list — the
  collision matrix is only valid if `Touches` is accurate.

---

## Commands

```sh
bun run dev            # all three processes via mprocs
bun run dev:client     # client only
bun run dev:server     # server only

cd client && bunx tsc --noEmit     # typecheck
cd client && bun run build         # typecheck + vite build
cd server && bunx tsc --noEmit
```

Scripts arriving with later waves: `bun run verify` (the full gate, task 38),
`bunx vitest run` (W4+), `bunx eslint .` (W3+), `bunx storybook build` (W6+),
`bunx stylelint "src/**/*.css"` (W7+).

## Environment notes

- Admin commands: wrap in `osascript ... with administrator privileges` — bare `sudo`
  cannot prompt and will hang. See the global preferences file.
- `server/src/data/` and `server/exports/` are gitignored — they hold real project data.
- `server/exports/lib/` **is consumed by external game code.** Its published format may
  not change without a coordinated version bump and owner sign-off (`OPEN-QUESTIONS.md`
  Q33).
