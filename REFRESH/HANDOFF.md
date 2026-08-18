# REFRESH — Handoff Ledger

**This file is the single source of truth for what is done.** Not git log, not memory,
not the task files. Every session updates it before finishing. Read
[`PROTOCOL.md`](./PROTOCOL.md) first if you are a fresh session.

---

## Current position

> **Next wave: W10 — task 16 (DomainStore lifecycle, AutoSaveController, THE LOAD-STATE GATE)**
>
> **Status:** W0–W9 all merged (see wave table). MobX chain in progress.
> **Last commit on `main`:** `a023531` — *Merge W9: typed API layer*
> **Working tree at last handoff:** clean.
>
> ### Current stack
> React 19.2.8 · Vite 7.3.6 · TS 5.9.3 · Express 5.2.1 · sharp 0.33.5 (Q45) ·
> zustand 4.5.2 + MobX 7.0.0 (bridged) · ESLint 9 · stylelint 17 ·
> Vitest (**701 client + 48 server**) · Storybook 9 · MSW 2.15.0.
> tsc 0 / eslint 0 / stylelint 0. **Exactly one `fetch(` site** (`api/client/httpClient.ts`).
> Bridge ledger: Phase A = 5 fields, Phase B = empty.
>
> ### 🎯 W10 CLOSES R5 — the highest-severity bug in the repo
> The API half landed in W9 (no more fabricated successes). What remains: `initProject`'s
> own catch still installs a blank default store-side. Task 16 builds `DomainStore`'s
> load lifecycle, the `AutoSaveController`, and the **load-state gate** — after it, a
> failed load produces **zero** `POST /api/project`. Task 16 also dissolves W9's
> `services/api.ts` facade into `DomainStore` (migration chain moves VERBATIM; §9.6) and
> flips the FIRST bridge fields to Phase B.
>
> ⚠️ The corpus digests remain the serialization gate. The App.tsx:65 StrictMode
> double-invocation risk (W2a's R11 list, site 1) is the same code path — task 16's gate
> must make the double-fire harmless.
>
> ⚠️ **Reproducibility gap OBSERVED in W9:** a fresh install re-resolved transitive
> `@types/node` to 26.2.0 and broke pure-HEAD tsc. Exact pinning does not pin transitives.
> If a wave fails tsc in code it never touched, suspect dependency drift first.
>
> **After any `bun install` or `bunx`, sweep regenerated lockfiles:**
> `rm -f server/bun.lock client/bun.lock bun.lock bun.lockb` — confirmed every install.

---

## Baseline — measured 2026-08-16, re-verified at scaffolding time

These are the numbers every later wave is checked against. Two were re-confirmed by
direct measurement when this ledger was created; the rest come from the eight audits in
`REFRESH-PREP/findings/`.

| Metric | Value | Re-verified |
| --- | ---: | :---: |
| `bunx tsc --noEmit` errors in `client` | ~~29~~ → **0** as of W1 | ✅ measured |
| `bunx tsc --noEmit` errors in `server` | **0** | — |
| `bun run build` | ~~exits 1~~ → **exits 0, emits `dist/`** as of W1 | ✅ measured |
| Flexible version specifiers across 3 manifests | **22** | ✅ measured |
| Tracked build artifacts | `client/tsconfig.tsbuildinfo` | ✅ measured |
| Tracked lockfiles | **1** — `server/bun.lock` **is tracked in HEAD** | ✅ measured |
| Files importing `useEditorStore` | **34** (33 destructure the whole store) | — |
| Store LOC / files | **8,050 / 17** | ✅ measured (8,050) |
| Largest client file | `Canvas.tsx` **3,062** lines | — |
| Stylesheets / lines | **34 / 10,596** | — |
| Undefined CSS custom properties | **6, referenced 76×** | — |
| Tests / stories / ESLint configs / CI | **0 / 0 / 0 / 0** | — |

### 🔴 RUN GATES FROM `client/`, NEVER THE REPO ROOT (coordinator error, W15)

Verifying W15 from the repo root instead of `client/` produced a **completely false
failure**: `bunx tsc` resolved a fresh **TypeScript 7.0.2 from the network** instead of the
pinned local 5.9.3, vitest picked up the wrong config and reported *68 failures across 50
files*, and the stray `bunx` **regenerated a lockfile**. Re-run from `client/`: tsc 0,
eslint 0, build 0, **901/901 pass**.

Two lessons: a wrong-directory `bunx` silently downloads a **major version** of a pinned
tool, and it is the fastest way to violate the no-lockfile policy. Always `cd client`
first, and sweep lockfiles afterwards.

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
| **W0** | 01 | — | ✅ | `afd93cd` | `! grep -qE '"[^"]+": *"[~^><*]' package.json client/package.json server/package.json` · no lockfiles anywhere · `bun install` clean in all 3 workspaces · `! git ls-files --error-unmatch client/tsconfig.tsbuildinfo` · client still reports **exactly 29** errors |
| **W1** | 02 | W0 | ⚠️ | `2cfa756` | `cd client && bunx tsc --noEmit && bun run build && test -d dist` · `cd server && bunx tsc --noEmit` |
| **W2a** | 03 | W1 | ⚠️ | `ebaca8b` | client: `bunx tsc --noEmit && bunx vite build`; server: `bunx tsc --noEmit` |
| **W2b** | 04 | W2a | ⚠️ | `a26f41f` | server: `bunx tsc --noEmit` + `diff -r` on the export goldens |
| **W3** | 05 | W2b | ✅ | `fa22107` | `bunx eslint .` in both workspaces · `bun run format:check` · the two boundary probes must **fail** ESLint |
| **W4** | 06 | W3 | ✅ | `47c14bb` | `bunx vitest run --reporter=json \| grep -q '"numPassedTests":[1-9]'` · `--project unit` and `--project dom` both exit 0 |
| **W5** | 07, 08, 09 | W4 | ⚠️ | `53cc953` | `bunx vitest run` · `bunx vite build` · `node scripts/check-classes.mjs --dead` · no undefined custom property in the bundle · **3 agents** |
| **W6** | 10, 11 | W5 | ⚠️ | `3e81bc4` | `bunx storybook build && test -d storybook-static` · `diff -r` on export goldens produces no output · **2 agents** |
| **W7** | 12, 13 | W6 | ⚠️ | `989f754` | `bunx stylelint "src/**/*.css"` · zero numeric `z-index` · `bunx vitest run src/types/__tests__/` · `bunx tsc --noEmit` · **2 agents** |
| **W8** | 14 | W7 | ⚠️ | `d97e5fb` | `bunx vitest run && bunx tsc --noEmit && bun run build` · lighting settings persist across a reload |
| **W9** | 15 | W8 | ⚠️ | `a023531` | `bunx vitest run src/api` · exactly one `fetch(` call site in the codebase |
| **W10** | 16 | W9 | ⚠️ | `47ca6bf` | a failed load produces **zero** `POST /api/project` · corpus snapshots unchanged |
| **W11** | 17, 18 | W10 | ⚠️ | `95adfa8` | `bunx vitest run src/store/__tests__/` passes **unchanged** · the five CSS block-extraction greps return 0 · **2 agents** |
| **W12** | 19 | W11 | ⚠️ | `e512d60` | `bunx storybook build` · 18 primitives report 0 a11y violations (**advisory only**) · the boundary probe fails ESLint |
| **W13** | 20 | W12 | ⚠️ | `c1f0711` | `node scripts/check-classes.mjs` 0/0 · every class in the 7 converted sheets matches the BEM regex |
| **W14** | 21, 22 | W13 | ⚠️ | `c333d78` | `bunx stylelint` on the converted sheets · zero `!important` in `Toolbar.css` · every class matches the regex · **2 agents** |
| **W15** | 23 | W14 | ⚠️ | `e88860a` | 100-pixel drag under 16 ms/frame · corpus snapshots unchanged |
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

## ⚠️ Manual checks owed

Verifications a wave's spec requires that a subagent **cannot** perform (they need a
running app and a human). A wave with outstanding entries here is marked `⚠️ PARTIAL`,
never `✅ DONE`. **Work through this before trusting any PARTIAL wave.**

| Wave | Task | Unperformed check | Risk left unverified |
| --- | --- | --- | --- |
| ~~W6~~ | ~~10~~ | ~~**Open the Storybook and look at it.**~~ ✅ **CLEARED BY THE OWNER (2026-08-16)** — reviewed before W7 was dispatched, per §9.10's ordering. The baseline is now human-captured; task 12's substitution can be compared against it. | — |
| W7 | 12 | ⭐⭐ **The R9 manual stacking pass.** Open every one of the 14 modals, both nested confirms (VariantSelect resize, BrowseBackups restore), all three tooltips, the view-mode dropdown, and **the AI-config popover while a modal is open** (the one real ordering bug this wave fixes — it moved from 1000 to `--z-popover`). | All 49 z-index sites moved onto the semantic scale and **no automated check covers stacking**. The full old→new table is in the family-3 commit message (`9892e85`) and the task 12 report. |
| W7 | 12 | ⭐ **Visual pass against the reviewed Storybook baseline + the app itself.** The biggest deliberate shifts: AnchorGrid's expand/shrink semantic colours, AddVariantModal's confirm-button gradient flattening to one violet, the gray-ramp collapses (`#d0d0d0`/`#888`, up to 48/channel — the spec understated these as "1–6"), two `'Courier New'` → JetBrains Mono sites, and `FrameReferencePanel:117`'s greenish label mapped to `--text-tertiary` (the weakest fit in the whole substitution). | 585+ declarations changed value. Every collapse is listed with per-channel deltas in the task 12 report; `roundtrip-final.txt` (scratchpad) has the per-selector inventory. |
| W7 | 12 | **Font-size mapping decision.** ~24 non-scale sizes (0.7/0.8/0.85/0.9rem, 13px, …) were left literal. | The spec says "30 sizes → 7 tokens" but gives no mapping, and e.g. 0.8rem is equidistant between two tokens. Collapsing app-wide text sizes without an owner mapping would be a bigger visual change than everything else in W7 combined. Needs an owner decision; not lint-enforced, so the gate stays green. |
| W6 | 11 | **Visually inspect exported sprites**, and run the generated `index.ts` against real downstream game code. | Byte-identity is proven (`diff -r` exit 0, verified twice), so this is confirmation rather than a test. The agent compiled the generated code under `--strict` against `exports/lib/` but did not execute it in a consuming project. |
| W5 | 07 | ⭐ **Review the 11 committed SHA-256 digests and sign off.** They are the frozen contract afterwards — every later wave that touches serialization is checked against them. | The agent reviewed them and verified the snapshot counts (50+18+10+41+12+6+2+6+4 = 149 ✓), but task 07's spec requires owner review before they are treated as canonical. |
| W5 | 09 | ⭐ **Visual review of the 6 newly-defined tokens** — see the table below. **76 declarations change appearance by design**, since these properties were referenced but never defined. | Three of the six values are the agent's judgement calls, not spec-supplied. Each is a one-line change in `client/src/styles/tokens.css`. |
| W5 | 09 | ⭐ **The `main.tsx` import-order reversal** — confirm nothing regressed visually. | The single change most likely to break something visually, and exactly what static analysis misses. Static check says tokens now emit at byte 6 vs `.layer-panel` at 55574, and component overrides win on specificity either way. |
| W5 | 09 | **The 5 modal fade/slide animations** (`app-fade-in`, `app-pulse`, `app-slide-in`) still play. | Six animations were silently depending on the CSS collision this task removed. Now explicitly defined in `reset.css`, but unverified at runtime. |
| W5 | 09 | **The 12 dynamically-constructed classes still style correctly** — especially AI generation status (`ai-gen-pair ${status}`) and preview items (`ai-preview-item ${type}`). | These are the runtime-interpolated names the spec's parser missed. Worth confirming the AI status UI actually renders styled. |
| W5 | 09 | **`<input type="range">` styling survives the move to `reset.css`.** | Slider appearance across ColorPicker, brush controls, and lighting panels. |
| W1 | 02 | **`lightGridMode` persistence** — toggle the light grid, wait 2 s for autosave, hard-reload; the setting must survive. | ⭐ The one check with a **real behaviour delta**. This was a live data-loss bug — the field was dropped on undo as well as on reload. Do this one first. |
| W1 | 02 | **Canvas smoke** — draw, erase, undo, switch layers, open lighting studio, scrub the timeline. | ⭐ Widest blast radius in W1. `TimelineView.tsx` lost `moveLayer`/`getCurrentObject` from its store destructure and had `handleDragOver`'s signature changed (2 call sites); `ColorPicker.tsx` had `saveFinalStateToHistory`'s signature changed (6 call sites). |
| W1 | 02 | **AI accept** end-to-end against a live `ai-service`. | **No delta expected.** The array-rank fix was annotation-only; `handleAccept` already wrote correctly-ranked grids. Confirms pre-existing behaviour. |
| W1 | 02 | **Flood fill** on transparent and on solid regions (`drawingUtils.ts:438`). | **No delta expected** — proven behaviour-preserving: `!c` already covered the `0` sentinel, so the dropped clause was unreachable. |
| W1 | 02 | **Reference panel** nudge/resize with an image loaded (`ReferenceImagePanel.tsx:116`). | **No delta expected** — same reasoning as flood fill. |

| W2a | 03 | ⭐⭐ **StrictMode canvas smoke test** — the **sole gate for R11**. Stroke / undo / redo, layer visibility toggle, lighting-studio normals, timeline scrub, trackpad-pinch and ctrl+wheel zoom, on **both** `Canvas` and `LightingCanvas`. Watch for doubled listeners (one drag producing two strokes) or early cleanup. | React 19's StrictMode double-invocation has **no automated gate at all**. See the 4-site risk list below — start there rather than clicking around. |

**Priority:** of W1's five, only the two starred can plausibly surface a regression. The
other three cover edits proven behaviour-preserving at the type level, so they are
confirmations rather than tests. The `bun run dev` smoke check (both servers serve HTTP
200 after 19 files changed) **was** performed by the coordinator and passed.

**Cleared by the coordinator:** W2a's dev-server proxy check — Vite 7 serves the client
(200) and proxies `/api/projects` to the server (200); direct `/health` also 200.

### 🎨 The 6 token values chosen in W5 — three are judgement calls

These properties were **referenced 76 times and defined nowhere**, one of the three live
bugs in `MASTER.md` §1. Defining them necessarily changes rendering. Each is one line in
`client/src/styles/tokens.css`.

| Token | Uses | Value | Basis |
| --- | ---: | --- | --- |
| `--text-tertiary` | 28× | `#808098` | ⭐ **Agent's call.** Exact per-channel midpoint of `--text-secondary` `#a0a0b8` and `--text-muted` `#606078`, keeping the ramp evenly spaced. |
| `--border-secondary` | 28× | `#23232f` | ⭐ **Agent's call.** Between `--border-primary` `#2d2d3d` and `--bg-elevated` `#22222f`, so the edge reads present but recessive. Fixes ProjectSelectModal's currently-borderless `.cancel-btn`. |
| `--accent-hover` | 8× | `#4de6ff` | ⭐ **Agent's call.** Lighter `--accent-primary` `#00d9ff`; raises the red channel to brighten toward white without a hue shift. |
| `--bg-active` | 5× | `#3a3a4a` | Spec-supplied, and this literal already appears 4× in the codebase — the measured house value. |
| `--text-on-accent` | 2× | `#000` | Spec-supplied. The accent is bright cyan; black is the legible foreground. |
| `--danger` | 1× | `var(--accent-danger)` | Spec-supplied alias. |

### Follow-ups filed by W5 task 09 (not blocking)

- **`--r`, `--g`, `--b` are never set anywhere in the TSX.** ColorPicker's RGB slider
  gradients fall back to `0`. **Pre-existing, not introduced** — out of task 09's scope
  because fixing it changes appearance. Worth a look during the CSS waves (12, 20–22).
- **`eslint.config.js` scopes `globals.node` to `files: ["*.{js,ts}"]`**, which matches
  only the workspace root, so `scripts/*.mjs` lints as browser code and fails `no-undef`.
  Task 09 declared the globals in its own file and left the config alone (outside its
  `Touches`). **Recommend widening the block to `["*.{js,ts}", "scripts/**"]`** in a task
  that owns `eslint.config.js`.
- See also W3's deferred unused `ensureDir` import in `server/src/routes/project.ts:6`,
  which task 11 owns.

**W3 owes nothing** — its gate is fully automated and was verified in both directions.
One small item was deliberately deferred rather than fixed: `server/src/routes/project.ts:6`
has an unused `ensureDir` import. It is a genuine one-line fix, but that file is **not in
task 05's `Touches` list**, so per §10 rule 6 the agent demoted `no-unused-vars` to `warn`
for `src/routes/**` and left the code alone rather than widening scope. Task 11 owns that
file and should clear it.

### 🎯 R11 static risk list — where to look during the W2a canvas smoke test

Produced by static analysis during W2a. **Compile-level React 19 breakages are confirmed
absent** — zero hits for `forwardRef`, `defaultProps`, `propTypes`, string refs,
`findDOMNode`, `createFactory`, or argument-less `useRef`. Both inline ref callbacks
(`VariantView.tsx:372,500`) use block bodies returning `undefined`, so React 19's
ref-cleanup change is a no-op there. **The remaining risk is StrictMode double-invocation,
not types.** Four sites, highest first:

1. **`client/src/App.tsx:65-67`** — ⭐ highest risk, and it touches the data-loss path.
   `useEffect(() => { initProject() }, [initProject])` has no cleanup and no abort.
   `initProject` (`store/projectActions.ts:21-53`) runs `getConfig` → `listProjects` →
   `loadProject` then `set(...)`. StrictMode fires it twice, racing two loads; the loser's
   `set` can land last, and its catch branch installs `createDefaultProject()` — **this is
   R5's blank-project overwrite path.** Task 16 closes it properly; until then this is the
   single most important thing to watch.
2. **`client/src/App.tsx:42,72-73`** — `hasRestoredReferenceRef = useRef(false)` is set
   `true` before the async restore and **never reset in cleanup**. Under double-mount the
   surviving mount early-returns, so the reference image may silently fail to restore.
3. **`ReferenceImageModal.tsx:303,312-336`** — `hasRestoredRef` resets only when `isOpen`
   goes false, not on unmount. A StrictMode remount while open skips the restore, leaving
   the modal blank.
4. **`ReferenceImageModal.tsx:302,313-328`** — `isRestoringRef` is cleared inside a
   `requestAnimationFrame` that is never cancelled. If unmount lands before that frame,
   the flag stays `true` and the sync effect at `:339-354` stops writing `persistentState`.

**The canvas files came out cleaner than the spec predicted.** `Canvas.tsx:2625-2686`
(ctrl+wheel zoom) and `LightingCanvas.tsx:379-439` both remove their wheel listener and
clear the zoom-anchor timeout; `Canvas.tsx:1524-1562` cancels its RAF. Unbalanced
timer set/clear counts elsewhere were each read and found to be intentional
fire-and-forget (e.g. `Header.tsx:253,266`); both real intervals (`Header.tsx:52`,
`AIInterpolateModal.tsx:266`) are cleared.

**Benign, noted:** every install warns that `use-sync-external-store` (transitive via
zustand 4.x) peers `react ^16.8||^17||^18`. Harmless — React 19 ships
`useSyncExternalStore` natively, and zustand is removed by task 38.

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

### ⚠️ `storybook dev` CANNOT RUN in this repo — a permanent consequence of the no-lockfile policy

**Not a misconfiguration, and not fixable without violating project policy.** Diagnosed in
W6 by reading the shipped `node_modules/storybook/dist/common/index.cjs`:

`storybook dev` calls `getPackageManagerType()`, which detects the package manager
**lockfile-first**. It returns `"bun"` **only** if `bun.lock`/`bun.lockb` exists. This repo
deliberately has none. It then falls back to `inferPackageManagerFromUserAgent()` (which
recognises pnpm/npm/yarn — **never bun**), then `hasNPM()` (npm is not on PATH), then
throws:

```
Error: Unable to find a usable package manager within NPM, PNPM, Yarn and Yarn 2
```

`--preview-only` fails identically. **`bunx storybook init` cannot run at all** — it shells
out to `npx`.

**The agent did NOT create a lockfile to work around this**, which was the right call:
trading the highest-standing project policy for a dev-server convenience. Instead
`bun run storybook` **builds** and serves the static output — verified serving the manager,
iframe, `index.json` (all 7 stories) and the `staticDirs` favicon at HTTP 200. **The only
loss is hot-reload, not fidelity.** A `storybook:dev` script is retained in case upstream
fixes bun detection.

**Every later Storybook wave (12, 19, 32–37) must use the build-and-serve path.** Do not
"fix" this by adding a lockfile.

### ⚠️ The replace-not-merge hazard bit again in W6 — this time in `parserOptions`

W3 found it in rule options. W6 hit it in **`parserOptions`**: a separate `.storybook/**`
block with its own `projectService` **dropped** the root's
`allowDefaultProject: ["*.ts","*.js"]`, turning `aliases.ts`, `vite.config.ts` and
`vitest.config.ts` into three hard parse errors. Fixed by extending the existing list
rather than redeclaring it; the hazard is now commented at that site.

**Generalised rule for anyone editing `client/eslint.config.js`: a later flat-config block
REPLACES whatever it redeclares — rules AND parser options. Extend, do not redeclare, and
re-run the boundary probes afterwards.** (Coordinator re-verified after W6: `ui/` importing
a store still exits 1.)

### 🔴 Task 11's spec was wrong about the `path` response field (found in W6)

The spec states that only `kebabName` is consumed (by `ExportPreviewModal.tsx:407`) and
that the absolute server path should be dropped from the export response. **False.**
`client/src/components/Header/Header.tsx:97` reads it:

```ts
setExportMessage(`Exported to ${result.path}`);
```

Removing it would have silently broken the export toast. **`path` was retained**; the new
fields (`frameCount`, `textureCount`, `bytes`) are purely additive. Verified by the
coordinator with a live export:

```json
{"success":true,"path":"…/exports/base-unit","kebabName":"base-unit",
 "frameCount":54,"textureCount":214,"bytes":72893}
```

**Lesson, now twice-proven** (this and task 09's dead-class list): a "nothing consumes
this" claim in a spec must be re-verified by grep before acting on it.

### ✅ Task 07's source-fidelity guards were STRENGTHENED by W6

Task 07 could not import `normalizePixel` or the M8 logic — they were module-private
inside `export.ts` — so it transcribed them and added guards that re-read the source and
fail if the originals drift. **Decomposition made both genuine exports, so the tests now
import the real production code.** A transcription can drift; an import cannot. The guard
asserting `normalizePixel` was *private* was inverted to pin the new arrangement (exactly
what task 07's comment asked a later task to do), and a new guard was added asserting the
array-safety branch still precedes the number branch. 17 → 18 tests, no behaviour
assertion altered.

### 📦 Corpus storage — OWNER DECISION (2026-08-16)

Task 07 decompressed **149 MB** of real artwork into
`client/src/test/__fixtures__/corpus/` and staged it. The owner chose to **gitignore the
corpus JSON and keep the SHA-256 digests as the committed gate.** Rationale: the repo's
entire history was ~8 MB and git history is effectively permanent.

Result: `.git` grew only 7.9 MB → 8.4 MB.

**Consequences every later wave must know:**

- The **digests in `client/src/types/__tests__/__snapshots__/` ARE the regression gate.**
  A digest change means the serialization layer changed. **Read the diff. Never `vitest -u`.**
- **A fresh clone cannot run the corpus suites** until the corpus is regenerated from
  `server/src/data/backups/*.gz`. Instructions are in
  `client/src/test/__fixtures__/corpus/README.md`; the coordinator verified those commands
  produce the exact expected filenames.
- **`corpusFiles()` THROWS when the corpus is absent** rather than returning `[]`.
  Without that guard every corpus suite would iterate zero files and report PASS — a green
  gate that verifies nothing, the same failure class as the W3 boundary-rule bug.
  Coordinator verified the guard fires by hiding the corpus and re-running.

### 📋 Task 07's snapshot strategy was not implementable as specified

The spec calls for `toMatchSnapshot()` over 149 runtime snapshots. **Measured:** the
*smallest* corpus file expands 29,922 B → **780,687 B of `.snap` (26×)**; the full corpus
would be **~4.1 GB** — which defeats the spec's own requirement that a human review every
snapshot by eye.

Replaced with **SHA-256 digests**: same gate, **3,359 bytes**, actually reviewable.

Two further task-07 premises were wrong and are now pinned as observed behaviour:
**R1** (the round trip is *not* identity — it adds `lightGridMode`, adds an
`originColor: undefined` key, and turns `variants: []` into `undefined`) and **R4** (the
three fields absent from `CompactUIState` **do** survive via the `...uiState` spread, so
the type and the runtime disagree).

### 🔴 Task 09's "60 dead classes" list is WRONG — 18 of them are LIVE (found in W5)

**Deleting them as specified would have silently broken working UI.** Verified
independently by the coordinator. The spec's own parser missed two patterns:

**8 applied conditionally inside template literals** — `.all-visible`
(`LayerPanel.tsx:200`), `.has-reference` (`PixelStudioTools.tsx:114`),
`.light-grid-active` (`Toolbar.tsx:69`), `.empty-selected` (`TimelineView.tsx:769`),
`.highlighted` (`TimelineView.tsx:787`), `.playing` (3 files), `.has-error`
(`Header.tsx:196`), `.different-object` (`FrameReferencePanel.tsx:343`), plus
`.disabled`, `.between`, `.keyframe`.

**6 built by whole-name interpolation** — the dangerous ones. `AIInterpolateModal.tsx`
line 1060 is ``className={`ai-gen-pair ${pj.status}`}`` and line 1152 is
``className={`ai-preview-item ${item.type}`}``. The class name does not exist as a literal
anywhere, so **no static search for `className="queued"` can find it.** Deleting
`queued`/`processing`/`completed`/`failed`/`generated` would have silently killed the AI
generation status UI. Coordinator confirmed both interpolation sites by direct read.

**Lesson for tasks 20–22 (BEM conversion), which rename every class:** a class-name
audit must grep the **bare name** across `.ts`/`.tsx`, never just `className="x"`, and
must look for interpolation into a class string. The spec's substring-trap warning *was*
correct and useful (`.mode-btn` matching `studio-mode-btn`, etc.) — the gap is
runtime-constructed names.

Only the 42 independently-verified classes were deleted. Final audit: **0 dead, 0
keyframe collisions**, confirmed by the coordinator.

### ⚠️ Task 09 also found 6 animations depending on the collision it was removing

Four files (`App.css`, `ObjectLibrary.css`, `PaletteManager.css`, `BrowseBackupsModal.css`)
**consume `fadeIn` but define it nowhere** — they resolved to `index.css`'s copy purely
because it was emitted last. Naively prefixing the keyframes would have killed all six
animations silently. Resolved by promoting `app-fade-in` / `app-pulse` / `app-slide-in`
into `reset.css` as genuinely shared definitions, copying `slideIn`'s `-20px` verbatim.

### 🔴 Task 05's boundary blocks silently enforced NOTHING as specified (found in W3)

**The most important spec bug found so far.** Task 05 lists the four `no-restricted-imports`
blocks with the `observer()` block (`files: ["src/**/*.{ts,tsx}"]`) **after** the two
`src/ui/**` blocks. **In ESLint flat config a later block REPLACES a rule's entire options
object — options do not merge.** So the `src/**` block matched every `ui/` file and
overwrote the purity patterns with only its own `mobx-react-lite` entry.

Confirmed by `--print-config`, and **both boundary probes PASSED lint** under the spec's
ordering. This is exactly the failure `MASTER.md` §9.9 exists to prevent: it would have
looked green for sixteen waves, until task 19 created `src/ui/` and someone discovered the
rule had never enforced anything.

**The mandatory probe requirement is the only reason this was caught.** Keep it.

**Fix, now in `client/eslint.config.js`:** broadest block first, narrower blocks after,
and every narrower block re-states the `mobx-react-lite` ban so the override loses nothing.
The file carries a load-bearing-order warning comment. **Any future edit to those blocks
must re-run the probes.**

Two further task-05 spec bugs, both fixed in W3:
- `reactHooks.configs["recommended-latest"]` is the **legacy eslintrc shape** in
  `eslint-plugin-react-hooks@7.1.1` and hard-crashes flat config. The flat entry is
  `configs.flat["recommended-latest"]`.
- Root `"format:check": "prettier --check ."` **cannot exit 0** — 154 component files are
  deliberately outside Sweep A. The spec's own Verification annotates this "exit 0 *on
  swept paths*", contradicting itself. `format`/`format:check` are now scoped to Sweep A;
  `format:all`/`format:check:all` added as task 38's target.

**Both corrections were independently CONFIRMED by the W1 subagent.** It found a third:

**3. Neither `TS2367` was an always-false live bug.** Task 02 step 7 frames both as
always-false comparisons whose fixes "change runtime behaviour", and requires a written
note for each. In fact both were **correct guards with a redundant second clause** that
TypeScript's narrowing had already made unreachable:
- `drawingUtils.ts:438` — `if (!c || c === 0)`. `PixelData.color` is `Pixel | 0`, so `!c`
  already covers the `0` sentinel *and* the `undefined` from the optional index.
- `ReferenceImagePanel.tsx:116` — `if (pixel && pixel !== 0)`. Same shape, same conclusion.

Both reduced to the falsy check alone. `0` is falsy in JS, so runtime semantics are
bit-identical. **Consequence: manual checks 3 and 4 have no behaviour delta to detect.**

**4. `client/lib/versions/v1.ts:210` was a NAME COLLISION, not a plain type mismatch.**
`ExportedVariantLayer` was declared twice — a texture-pair at `:32` and a variant-group at
`:50`. TypeScript declaration-merged them into a type demanding all five properties, which
nothing could satisfy. Consumers use the **group** meaning (`parse-pixel-project.ts`
aliases it as `ExportedVariantGroup`), so the group shape kept the existing name and the
texture-pair was renamed `ExportedVariantFrameLayer`. **Additive only** — no existing
exported name changed meaning and no wire key changed, so `server/exports/lib/`'s external
game-code consumers (Q33) are unaffected. Verified: `server/src/routes/export.ts` has its
own independent declarations and was not touched.

---

## New questions raised during execution

Questions that arose mid-execution and are not in `OPEN-QUESTIONS.md`. Add the Q-number
there too, marked BLOCKING or NON-BLOCKING.

| Q | Wave | Question | Status |
| --- | --- | --- | --- |
| **Q45** | W2b | **May sharp be upgraded to 0.35.x if PNG output is pixel-identical but not byte-identical?** | 🔴 **BLOCKING — needs the owner.** Blocks only the sharp half of task 04. Everything else in W2b landed. |

### Q45 — the sharp upgrade decision (raised by W2b, 2026-08-16)

**What happened.** Task 04's R12 gate requires `diff -r` on the export goldens to produce
**no output**. Under sharp 0.35.3, **214 of 232 PNGs differed**. The agent stopped and
reverted sharp to 0.33.5 rather than re-blessing, exactly as the spec demands.

**What the difference actually is.** Analysed across all 232 files:

| Property | Result |
| --- | --- |
| Decoded pixels | **bit-identical in all 232 files** |
| Inflated raw PNG scanlines | **identical in all 214 differing files** |
| Non-IDAT chunks (IHDR, PLTE, tRNS, pHYs) | **zero differences** |
| Total size | **identical** — 48,584 bytes before and after |
| The delta | zlib CMF header `78da` → `08d7` (×139) / `18d3` (×19), plus equivalent-length deflate re-encoding in 56 files |

Cause: libvips **8.15.3 → 8.18.3** re-emits the zlib stream. **This is encoder-internal
re-emission, not sprite corruption.** Filenames are content-hashes of the raw buffer and
none changed, independently confirming the source pixels are unchanged.

**Why it is still your call.** `server/exports/lib/` is consumed by external game code
(Q33). Any consumer that hashes or diffs PNG assets sees **214 changed files**, even
though every pixel is the same. Whether that is acceptable depends on facts about the
downstream pipeline that only you have.

**The options:**

1. **Keep sharp at 0.33.5** (current state). Zero risk; the dependency stays a minor
   version behind. Everything else in W2b has landed and nothing downstream is blocked.
2. **Accept pixel-identity as the criterion and upgrade.** The evidence above is strong —
   pixels are provably unchanged. Re-running the upgrade takes minutes. Requires
   re-blessing the goldens and accepting that 214 asset files change bytes once.

**Recommendation: option 1 for now.** No scheduled wave depends on sharp 0.35, so
deferring costs nothing, and this decision is cheap to revisit at any point.

**A control worth adopting into the spec:** the agent ran a second export on the
*unchanged* sharp 0.33.5 and diffed it against the goldens — exit 0. This proves the
exporter is deterministic and the golden diff is a valid instrument. Without it, a failing
diff is ambiguous between "the upgrade changed output" and "the exporter is
nondeterministic". Task 11 and any future export work should run this control first.
