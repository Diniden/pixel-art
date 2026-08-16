# REFRESH — Handoff Ledger

**This file is the single source of truth for what is done.** Not git log, not memory,
not the task files. Every session updates it before finishing. Read
[`PROTOCOL.md`](./PROTOCOL.md) first if you are a fresh session.

---

## Current position

> **Next wave: W0 — task 01 (repo hygiene: exact version pinning, no lockfiles, `tsc -b` misuse)**
>
> **Status:** not started. No refresh work has landed yet.
> **Last commit on `main`:** `c3a56b4` — *Checkpoint: Some more prep before executing the refactor*
> **Working tree at last handoff:** clean, plus the untracked scaffolding this session added
> (`CLAUDE.md`, `ARCHITECTURE.md`, `.claude/`, `REFRESH/PROTOCOL.md`, `REFRESH/HANDOFF.md`).
>
> **Next action:** read `REFRESH/01-repo-hygiene-and-lockfiles.md` in full, branch
> `refresh/w0-repo-hygiene`, execute its 12 steps, run the W0 gate below, update this file.

---

## Baseline — measured 2026-08-16, re-verified at scaffolding time

These are the numbers every later wave is checked against. Two were re-confirmed by
direct measurement when this ledger was created; the rest come from the eight audits in
`REFRESH-PREP/findings/`.

| Metric | Value | Re-verified |
| --- | ---: | :---: |
| `bunx tsc --noEmit` errors in `client` | **29** | ✅ measured |
| `bunx tsc --noEmit` errors in `server` | **0** | — |
| `bun run build` | **exits 1, no `dist/`** | — |
| Flexible version specifiers across 3 manifests | **22** | ✅ measured |
| Tracked build artifacts | `client/tsconfig.tsbuildinfo` | ✅ measured |
| Tracked lockfiles | **1** — `server/bun.lock` **is tracked in HEAD** | ✅ measured |
| Files importing `useEditorStore` | **34** (33 destructure the whole store) | — |
| Store LOC / files | **8,050 / 17** | ✅ measured (8,050) |
| Largest client file | `Canvas.tsx` **3,062** lines | — |
| Stylesheets / lines | **34 / 10,596** | — |
| Undefined CSS custom properties | **6, referenced 76×** | — |
| Tests / stories / ESLint configs / CI | **0 / 0 / 0 / 0** | — |

### ⚠️ Measured hazard: `bunx` regenerates a lockfile despite `bunfig.toml`

Observed directly while scaffolding. Running `bunx vitest run` from the **repo root**
resolved dependencies and printed **`Saved lockfile`**, recreating `server/bun.lock`
even though `bunfig.toml` sets `[install.lockfile] save = false`.

**Consequence for every wave:** the no-lockfile policy can be violated as a *side effect*
of an ordinary `bunx` command — nobody has to run `bun install` wrong. After any wave that
runs `bunx`, re-check before committing:

```sh
find . -maxdepth 2 -name 'bun.lock*' -o -maxdepth 2 -name 'package-lock.json' \
  -o -maxdepth 2 -name 'yarn.lock' | grep -v node_modules
```

Task 01's `.gitignore` entries will stop a regenerated lockfile being *committed*, but the
file will still reappear on disk. **This is not a reason to change `bunfig.toml`.**

**Data at risk:** `server/src/data/Base Unit.json` is 1.1 MB of the owner's real work,
plus 9 gzipped backups holding 149 snapshots. **All 149 are already fully migrated** —
no pre-migration format survives anywhere in the repo, so the 8 schema migrations can
only ever be tested against hand-authored synthetic fixtures (task 07). There is no
real-data safety net behind them.

---

## Status legend

| Mark | Meaning |
| :---: | --- |
| ⬜ | Not started |
| 🟡 | In progress — branch exists, gate not yet green |
| ⚠️ | **PARTIAL** — some steps landed; see notes for exactly what remains |
| ⛔ | **BLOCKED** — gate failed or a stopping rule fired; see notes |
| ✅ | **DONE** — gate green, manual checks done, merged to `main` |

---

## Wave ledger

Gate commands are copied from `MASTER.md` §4 so a session does not have to re-derive
them. Run them from the repo root unless the command says otherwise.

| Wave | Tasks | Dep | Status | Commit | Gate command |
| --- | --- | --- | :---: | --- | --- |
| **W0** | 01 | — | ⬜ | — | `! grep -qE '"[^"]+": *"[~^><*]' package.json client/package.json server/package.json` · no lockfiles anywhere · `bun install` clean in all 3 workspaces · `! git ls-files --error-unmatch client/tsconfig.tsbuildinfo` · client still reports **exactly 29** errors |
| **W1** | 02 | W0 | ⬜ | — | `cd client && bunx tsc --noEmit && bun run build && test -d dist` · `cd server && bunx tsc --noEmit` |
| **W2a** | 03 | W1 | ⬜ | — | client: `bunx tsc --noEmit && bunx vite build`; server: `bunx tsc --noEmit` |
| **W2b** | 04 | W2a | ⬜ | — | server: `bunx tsc --noEmit` + `diff -r` on the export goldens |
| **W3** | 05 | W2b | ⬜ | — | `bunx eslint .` in both workspaces · `bun run format:check` · the two boundary probes must **fail** ESLint |
| **W4** | 06 | W3 | ⬜ | — | `bunx vitest run --reporter=json \| grep -q '"numPassedTests":[1-9]'` · `--project unit` and `--project dom` both exit 0 |
| **W5** | 07, 08, 09 | W4 | ⬜ | — | `bunx vitest run` · `bunx vite build` · `node scripts/check-classes.mjs --dead` · no undefined custom property in the bundle · **3 agents** |
| **W6** | 10, 11 | W5 | ⬜ | — | `bunx storybook build && test -d storybook-static` · `diff -r` on export goldens produces no output · **2 agents** |
| **W7** | 12, 13 | W6 | ⬜ | — | `bunx stylelint "src/**/*.css"` · zero numeric `z-index` · `bunx vitest run src/types/__tests__/` · `bunx tsc --noEmit` · **2 agents** |
| **W8** | 14 | W7 | ⬜ | — | `bunx vitest run && bunx tsc --noEmit && bun run build` · lighting settings persist across a reload |
| **W9** | 15 | W8 | ⬜ | — | `bunx vitest run src/api` · exactly one `fetch(` call site in the codebase |
| **W10** | 16 | W9 | ⬜ | — | a failed load produces **zero** `POST /api/project` · corpus snapshots unchanged |
| **W11** | 17, 18 | W10 | ⬜ | — | `bunx vitest run src/store/__tests__/` passes **unchanged** · the five CSS block-extraction greps return 0 · **2 agents** |
| **W12** | 19 | W11 | ⬜ | — | `bunx storybook build` · 18 primitives report 0 a11y violations (**advisory only**) · the boundary probe fails ESLint |
| **W13** | 20 | W12 | ⬜ | — | `node scripts/check-classes.mjs` 0/0 · every class in the 7 converted sheets matches the BEM regex |
| **W14** | 21, 22 | W13 | ⬜ | — | `bunx stylelint` on the converted sheets · zero `!important` in `Toolbar.css` · every class matches the regex · **2 agents** |
| **W15** | 23 | W14 | ⬜ | — | 100-pixel drag under 16 ms/frame · corpus snapshots unchanged |
| **W16** | 24 | W15 | ⬜ | — | the wire-format golden test · all 43 UI fields persist across a reload |
| **W17** | 25 | W16 | ⬜ | — | timeline matrix green · cross-project clipboard survives |
| **W18** | 26 | W17 | ⬜ | — | a 50-pixel stroke command < 5 kB · task 08's suite unchanged · 100-pixel drag under 16 ms |
| **W19** | 27 | W18 | ⬜ | — | all 9 lighting fields bump `persistedUIVersion` and persist |
| **W20** | 28 | W19 | ⬜ | — | no `src/stores` file imports from `components/` · variant matrix green |
| **W21** | 29 | W20 | ⬜ | — | `! grep -n ReferenceImageModal src/App.tsx` · zero `useEditorStore.getState()` remain |
| **W22** | 30 | W21 | ⬜ | — | golden-hash render tests per mode · one client copy of the offset fallback |
| **W23** | 31 | W22 | ⬜ | — | brushStamp mouse-vs-touch agreement test passes |
| **W24** | 32 | W23 | ⬜ | — | `Canvas.tsx` deleted · `CanvasSurface` stories render with **no** store provider |
| **W25** | 33, 34 | W24 | ⬜ | — | `LightingCanvas.tsx` deleted · `frameEncoding` byte-equality · nothing in `ui/` imports a store · **2 agents** |
| **W26** | 35 | W25 | ⬜ | — | the four splits are pure · 3 stories each |
| **W27** | 36 | W26 | ⬜ | — | the `ui/` boundary grep returns nothing |
| **W28** | 37 | W27 | ⬜ | — | `App.tsx` deleted · layout stories render with no store provider |
| **W29** | 38 | W28 | ⬜ | — | **`! grep -rl useEditorStore client/src`** and **`bun run verify` exits 0** |

---

## Rollback checkpoints

Waves worth stopping at if the refresh is paused or abandoned. From `MASTER.md` §12.

| After | State | Why it is a good place to stop |
| --- | --- | --- |
| **W1** (02) | Green typecheck, green build | The first state in this repo's history where `bun run build` succeeds. Valuable even if nothing else lands. |
| **W4** (06) | Lint + format + test harness | The toolchain is in place; the audits' claims become checkable. |
| **W5** (07) | Migration corpus frozen and pinned | **The single most valuable checkpoint.** Even if the whole refactor is abandoned, the owner's data is protected by tests. |
| **W7** (12) | Tokens, z-index scale, Storybook | The CSS is coherent and reviewable; the store is untouched. |
| **W10** (16) | The data-loss bug is closed | The highest-severity bug is fixed; the app still runs on Zustand for everything else. |
| **W14** (22) | All BEM conversion complete | The CSS goal is fully delivered; no component has been restructured. |
| **W24** (32) | `Canvas.tsx` is gone | The largest single risk in the plan has passed. |

---

## Session log

Newest first. One entry per session, however much or little it accomplished.
**An honest short entry beats an optimistic long one.**

### Session 1 — 2026-08-16 — scaffolding, no waves executed

**Did:** Read `MASTER.md` and the task specs. Re-verified baseline numbers by direct
measurement (29 client type errors, 22 flexible specifiers, 8,050 store LOC,
`client/tsconfig.tsbuildinfo` tracked, `server/bun.lock` tracked). Authored the handoff
infrastructure — `PROTOCOL.md`, this ledger, `CLAUDE.md`, `ARCHITECTURE.md`,
`.claude/settings.json`, and a `PreToolUse` guard hook — so waves can run across fresh
contexts.

**Executed:** No refresh waves. W0 has not started; the repo is at its measured baseline.

**Two corrections made during this session, both worth knowing:**

1. **`server/bun.lock` IS tracked in git.** An early check of mine suggested no lockfiles
   existed; that was wrong — the `git ls-files` half of a compound command had been
   swallowed by a non-zero exit earlier in the pipeline. Task 01's Context section is
   correct as written. The ledger's baseline row has been fixed.
2. **`bunx` regenerates the lockfile** — see the hazard box above. Found by running
   `bunx vitest run -u` (to test the guard hook), which printed `Saved lockfile` and
   recreated `server/bun.lock`. The file was restored with `git checkout` so the tree is
   pristine; **deleting it remains task 01's job, on task 01's branch.**

**Guard hook status:** `.claude/hooks/guard-data-safety.sh` blocks `vitest -u/--update`
and `--frozen-lockfile`. It was pipe-tested against 5 cases (2 that must fire, 3 that must
not) and all passed. It did **not** fire in this session's live test, because the settings
watcher only watches directories that had a settings file when the session started, and
`.claude/` was created mid-session. **It will be active in any new session.** The next
session should confirm this once — a rule that matches nothing looks exactly like a rule
that passes.

**For the next session:** Start at W0. Working tree is clean apart from the untracked
scaffolding listed above; commit that first, then branch for W0.

---

## Deviations and decisions made during execution

Anything an agent did differently from the task spec, and why. Empty until execution
starts. **A deviation recorded here is fine; an unrecorded one is a defect.**

| Wave | Task | Deviation | Reason |
| --- | --- | --- | --- |
| — | — | *(none yet)* | — |

### ⚠️ Two corrections to task 02's spec — verified by execution, trust these over the spec

A first attempt at W0/W1 was executed and then **deliberately discarded** (reset to
`c3a56b4`) to restart with subagent-per-wave execution. The code is gone; these findings
are not, because whoever runs task 02 will hit both.

**1. `client/src/utils/alphaBlend.ts:11` `alphaBlend` is NOT dead code.** Task 02's
Context table lists it as "exported, never imported" and instructs you to delete it. It is
called by `blendPixels` at `alphaBlend.ts:65`, and `store/layerActions.ts:3` imports
`blendPixels`. **Deleting the function breaks the build** — the opposite of task 02's
goal. The finding holds only for *external* imports; the correct minimal action is to drop
the `export` keyword and keep the function.

**2. The 5 `AIInterpolateModal` errors are a type-only fix, not a behaviour fix.** Step 5
says to fix "the value, not the annotation" and predicts frames "land malformed". Tracing
the values shows they are correct at every site. The one defect is that
`allPixelDataPairs` (line ~687) is annotated `PixelData[][][]` but holds rank 4:
`allGeneratedFrames: string[][]` → `pairFrames: string[]` → `base64ToPixelData` returns
`PixelData[][]` → `Promise.all(...)` yields `PixelData[][][]` → an array of those is
`PixelData[][][][]`. Correcting the annotation clears all 5 errors in one line with **no
runtime change** — `handleAccept` already wrote correctly-ranked grids.

**Also confirmed:** after step 3's hygiene deletions, removing `frame` in
`HeightMapModal.tsx` exposes a now-unused `getCurrentFrame` in the same destructure —
a 21st hygiene error appears mid-task. That is expected, not a mistake.

---

## New questions raised during execution

Questions that arose mid-execution and are not in `OPEN-QUESTIONS.md`. Add the Q-number
there too, marked BLOCKING or NON-BLOCKING.

| Q | Wave | Question | Status |
| --- | --- | --- | --- |
| — | — | *(none yet)* | — |
