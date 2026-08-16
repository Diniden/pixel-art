# REFRESH — Handoff Ledger

**This file is the single source of truth for what is done.** Not git log, not memory,
not the task files. Every session updates it before finishing. Read
[`PROTOCOL.md`](./PROTOCOL.md) first if you are a fresh session.

---

## Current position

> **Next wave: W3 — task 05 (ESLint flat config, Prettier, scoped sweep)**
>
> **Status:** W0 ✅ · W1 ⚠️ · W2a ⚠️ · W2b ⚠️ merged. Subagent-per-wave.
> **Last commit on `main`:** `a26f41f` — *Merge W2b: Express 5 + dead deps*
> **Working tree at last handoff:** clean.
>
> ### Current stack
> React **19.2.8** · Vite **7.3.6** · TypeScript **5.9.3** · Express **5.2.1** ·
> sharp **0.33.5** (upgrade deferred, see Q45) · zustand 4.5.2.
> Both workspaces typecheck **0 errors**; `bun run build` emits `dist/`.
>
> 🔴 **One blocking question is open: Q45 (sharp).** It blocks nothing scheduled — W3
> onward can proceed. See "New questions" at the foot of this file.
>
> **Next action:** dispatch a subagent with `REFRESH/05-eslint-prettier-and-scoped-sweep.md`
> on branch `refresh/w3-eslint-prettier`.
>
> ⚠️ **Task 05 writes the `src/ui/**` boundary rule, which is load-bearing for the whole
> architecture.** The directory does not exist yet (task 19 creates it), so the rule can
> silently match nothing — the worst failure mode for an architecture rule. The spec
> requires TWO boundary probes that must **FAIL** ESLint. A rule matching nothing looks
> exactly like a rule that passes.
>
> ⚠️ **Prettier Sweep A only** — root config files, `client/src/types/**`,
> `services/api.ts`. Sweeping components now would reformat ~1,400 lines that later waves
> delete, and would destroy the byte-identity evidence tasks 30/31 rely on. Sweep B is
> task 38.
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

## ⚠️ Manual checks owed

Verifications a wave's spec requires that a subagent **cannot** perform (they need a
running app and a human). A wave with outstanding entries here is marked `⚠️ PARTIAL`,
never `✅ DONE`. **Work through this before trusting any PARTIAL wave.**

| Wave | Task | Unperformed check | Risk left unverified |
| --- | --- | --- | --- |
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
