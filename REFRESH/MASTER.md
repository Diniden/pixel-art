# REFRESH — Master Execution Plan

**Authored:** 2026-08-16, from the eight completed audits in `REFRESH-PREP/findings/` (11,086 lines of measured evidence).

**38 tasks · 30 waves (W0-W29) · 38 agent-sessions.** Most waves are a single task, because the dependency chain genuinely is a chain — the store migration is incremental and each slice depends on the last. Parallelism is claimed only where the collision matrix proves it.

---

## 1. Executive summary

### Where the codebase is today

| | |
| --- | --- |
| **Client** | React 18.3 + Vite 5.4 + TypeScript 5.6, **Zustand 4.5** |
| **Store** | 17 files, ~8,050 lines, one flat `EditorState` from a single `create()` call. **34 files import `useEditorStore`; 33 of them destructure the whole store**, so every component re-renders on every change. |
| **Components** | 30 real component folders (one, `GaussianFillModal/`, is an empty orphan). **`Canvas.tsx` is 3,062 lines with 11 responsibilities and 47 store members in one destructure.** |
| **CSS** | 34 global stylesheets, 10,596 lines, no scoping. **31 critical class collisions**, 23 `!important`, `z-index` up to 99999, 172 colour literals, and **6 custom properties referenced 76 times but never defined**. |
| **Tests / stories / lint / CI** | **Zero. All four.** A `lint` script exists with no config file. |
| **The build** | **`bun run build` exits 1 and emits no `dist/`.** 29 type errors, 9 of them real. `vite build` alone passes only because esbuild strips types without checking them. |
| **Server** | Express 4 + sharp, 3 route files. `export.ts` is 927 lines with a 440-line handler. Typechecks clean. |
| **Data at risk** | `server/src/data/Base Unit.json` is **1,129,965 bytes of the owner's real work**, plus 9 gzipped backups (**149 snapshots**, 01-31-2026 → 02-25-2026 plus a 07-28-2026 directory). **Measured 2026-08-16: every one of them is already fully migrated** — no pre-migration format survives anywhere in the repo. **8 schema migrations** stand between the live files and corruption, and they can only be tested against hand-authored synthetic fixtures. |

### Three measured bugs that are live right now

1. **A blank project can overwrite the real one.** `loadProject()` catches every failure and returns `createDefaultProject()`; the store accepts it; the next edit auto-saves it over the user's 1.1 MB file. A transient network blip is enough. *(Closed by tasks 15 + 16.)*
2. **8 lighting setters never autosave.** `lightingActions.ts` does not import the autosave module at all — light colour, ambient colour, height scale and five more silently do not persist. *(Closed by task 14, made structural by task 27.)*
3. **76 CSS declarations render wrong** because 6 custom properties are used and never defined. *(Closed by task 09.)*

### What the refresh delivers

A green `bun run verify` gate; React 19 + Vite 7 + TS 5.9; a MobX `ApplicationStore` of `SessionStore` + `DomainStore` + `UIStore` with a command-based history that replaces ~680 MB of undo snapshots with a 64 MB byte budget; BEM CSS with stylelint enforcement; a `ui/` layer that ESLint forbids from importing any store; 18 primitives that fix a 14-modal accessibility hole at once; ~94 Storybook stories bubbling up to full-page layouts; and one typed API layer that is the only place in the client that calls `fetch`.

**And the wire format does not change — at all.** The owner decided (2026-08-16) that `uiState.aiServiceUrl` **stays** in the persisted project file, so there is now **no deliberate wire-format change anywhere in this plan**. The persisted bytes are identical end to end, which means task 07's golden fixtures never need re-blessing.

---

## 2. Locked decisions

Decided by the project owner up front. Tasks plan *around* these, not against them.

| Decision | Value |
| --- | --- |
| State library | **Migrate Zustand → MobX.** `ApplicationStore` composed of `SessionStore`, `DomainStore`, `UIStore`. |
| Tooling | **Storybook + Vitest + Testing Library + ESLint (flat) + Prettier.** Full harness. |
| CSS | **BEM** for every component. |
| UI/state coupling | UI components **fully divorced** from the store; containers wire them together. |
| Storybook scope | Stories bubble up: primitives → components → **full-page Layouts**. |
| API | A **single typed API layer**, isolated from both UI and store. |
| Runtime | **Bun.** `npm` and `node` are not on PATH — use `bun` / `bunx` in every command. |

---

## 3. Ground truth — the measured baseline

Every number below is reproducible today. Progress is checkable against them.

| Metric | Value | How measured |
| --- | ---: | --- |
| `bunx tsc --noEmit` errors in `client` | **29** (20 hygiene, 9 real) | `bunx tsc --noEmit`; `tsc -b` gives **byte-identical** output |
| `bun run build` | **exits 1, no `dist/`** | `bun run build` |
| `bunx tsc --noEmit` errors in `server` | **0** | as above |
| Files importing `useEditorStore` | **34** | `grep -rl useEditorStore --include='*.tsx' --include='*.ts' client/src` |
| …destructuring the whole store | **33 of 34** | consumer census |
| Store LOC / files | **8,050 / 17** | `wc -l client/src/store/*.ts` |
| `updateProjectAndSave` call sites | **129** (74 `true`, 47 `false`, 8 `!_strokeActive`) | brace-matching scan |
| Store module dependency cycles | **0** | exhaustive `get().<name>` scan |
| Heap per undo snapshot | **6.9 MB** | `Bun.gc(true)` + `heapUsed`, N=5 |
| Heap at `MAX_HISTORY = 100` | **~680 MB** | 6.9 MB × 100 |
| CPU per history-tracked mutation | **5.1 ms**, synchronous, main thread | 10× round trip |
| Pixel cells in the real project | **300,249** | structural census |
| Largest client file | `Canvas.tsx` **3,062** lines, 47 store members, 11 responsibilities | `wc -l` + read |
| Source files over 250 lines | **46** (31,635 total lines) | `find | xargs wc -l | awk '$1>250'` |
| Measured duplication | **~1,960 lines**, ~1,400 mechanically removable | 13 duplication clusters |
| Component folders | **30 real** (+1 empty orphan) | `ls` + `ls -la` |
| Modals | **14** | mount-site grep |
| Full-page layouts | **2** editor layouts + 1 loading state | full read of `App.tsx` |
| Stylesheets / lines / rules / classes | **34 / 10,596 / 1,455 / 796** | scripted |
| Critical class collisions | **31** (64 total) | bundle-order analysis |
| `!important` | **23** (15 in `Toolbar.css`) | grep |
| Distinct `z-index` values | **15**, from `-1` to `99999` | grep |
| Colour literals | **172 distinct, 585 occurrences** | scripted |
| Undefined custom properties | **6, referenced 76×** | scripted |
| `fetch` call sites / with a timeout | **17 / 0** | grep |
| Functions fabricating a success value on failure | **6** | read |
| Schema migrations | **8** (5 structural + 3 default families) | read |
| Tests / stories / ESLint configs / CI | **0 / 0 / 0 / 0** | `find` |

---

## 4. Wave table

A wave's tasks are independent: no unmet dependencies, **no file collisions** (§6), no semantic collisions, and one verifiable gate.

**Sequential waves are legitimate and most of these are.** The dependency chain is real; manufacturing parallelism the dependencies do not support is how a plan like this fails.

| Wave | Tasks | Agents | Depends on | Gate command |
| --- | --- | ---: | --- | --- |
| **W0** | 01 | 1 | — | zero flexible specifiers (`! grep -qE '"[^"]+": *"[~^><*]' package.json client/package.json server/package.json`); zero lockfiles anywhere; `bun install` clean in all 3 workspaces; `! git ls-files --error-unmatch client/tsconfig.tsbuildinfo`; client still reports exactly 29 errors |
| **W1** | 02 | 1 | W0 | `cd client && bunx tsc --noEmit && bun run build && test -d dist` · `cd server && bunx tsc --noEmit` |
| **W2a** | 03 | 1 | W1 | client: `bunx tsc --noEmit && bunx vite build`; server: `bunx tsc --noEmit` (TS is bumped in both workspaces here) |
| **W2b** | 04 | 1 | W2a | server: `bunx tsc --noEmit` + `diff -r` on the export goldens |
| **W3** | 05 | 1 | W2b | `bunx eslint .` in both workspaces · `bun run format:check` · the two boundary probes must **fail** ESLint |
| **W4** | 06 | 1 | W3 | `bunx vitest run --reporter=json \| grep -q '"numPassedTests":[1-9]'` · `--project unit` and `--project dom` both exit 0 |
| **W5** | 07, 08, 09 | **3** | W4 | `bunx vitest run` · `bunx vite build` · `node scripts/check-classes.mjs --dead` · no undefined custom property in the bundle |
| **W6** | 10, 11 | **2** | W5 | `bunx storybook build && test -d storybook-static` · `diff -r` on the export goldens produces no output |
| **W7** | 12, 13 | **2** | W6 | `bunx stylelint "src/**/*.css"` · zero numeric `z-index` · `bunx vitest run src/types/__tests__/` · `bunx tsc --noEmit` |
| **W8** | 14 | 1 | W7 | `bunx vitest run && bunx tsc --noEmit && bun run build` · lighting settings persist across a reload |
| **W9** | 15 | 1 | W8 | `bunx vitest run src/api` · exactly one `fetch(` call site in the codebase |
| **W10** | 16 | 1 | W9 | a failed load produces **zero** `POST /api/project` · corpus snapshots unchanged |
| **W11** | 17, 18 | **2** | W10 | `bunx vitest run src/store/__tests__/` passes **unchanged** · the five CSS block-extraction greps return 0 |
| **W12** | 19 | 1 | W11 | `bunx storybook build` · all 18 primitives report 0 a11y violations (**advisory** — the addon stays at `test: "todo"`; no gate fails a build on an a11y violation) · the boundary probe fails ESLint |
| **W13** | 20 | 1 | W12 | `node scripts/check-classes.mjs` 0/0 · every class in the 7 converted sheets matches the BEM regex |
| **W14** | 21, 22 | **2** | W13 | `bunx stylelint` on the converted sheets · zero `!important` in `Toolbar.css` · every class matches the regex |
| **W15** | 23 | 1 | W14 | 100-pixel drag under 16 ms/frame · corpus snapshots unchanged |
| **W16** | 24 | 1 | W15 | the wire-format golden test · all 43 UI fields persist across a reload |
| **W17** | 25 | 1 | W16 | timeline matrix green · cross-project clipboard survives |
| **W18** | 26 | 1 | W17 | a 50-pixel stroke command < 5 kB · task 08's suite unchanged · 100-pixel drag under 16 ms |
| **W19** | 27 | 1 | W18 | all 9 lighting fields bump `persistedUIVersion` and persist |
| **W20** | 28 | 1 | W19 | no `src/stores` file imports from `components/` · variant matrix green |
| **W21** | 29 | 1 | W20 | `! grep -n ReferenceImageModal src/App.tsx` · zero `useEditorStore.getState()` remain |
| **W22** | 30 | 1 | W21 | golden-hash render tests per mode · one client copy of the offset fallback |
| **W23** | 31 | 1 | W22 | brushStamp mouse-vs-touch agreement test passes |
| **W24** | 32 | 1 | W23 | `Canvas.tsx` deleted · `CanvasSurface` stories render with **no** store provider |
| **W25** | 33, 34 | **2** | W24 | `LightingCanvas.tsx` deleted · `frameEncoding` byte-equality · nothing in `ui/` imports a store |
| **W26** | 35 | 1 | W25 | the four splits are pure · 3 stories each |
| **W27** | 36 | 1 | W26 | the `ui/` boundary grep returns nothing |
| **W28** | 37 | 1 | W27 | `App.tsx` deleted · layout stories render with no store provider |
| **W29** | 38 | 1 | W28 | **`! grep -rl useEditorStore client/src`** and **`bun run verify` exits 0** |

**Totals: 38 tasks, 31 waves (W0-W29, with W2 split into W2a/W2b), 38 agent-sessions** — one session per task.

**Six waves run more than one agent** (W6, W7, W11, W14, W25 run 2; W5 runs 3). **The other 25 are single-task, and honestly so** — the store migration is a genuine chain in which each slice depends on the last, and manufacturing parallelism the dependencies do not support is how a plan like this fails.

**W2 was deliberately split (owner decision, 2026-08-16).** Tasks 03 and 04 were originally one parallel wave whose agents wrote disjoint *keys* of the same file (`server/package.json`), coordinated by a re-read-before-write instruction. Two agents writing one JSON file concurrently is a merge risk that depends on both complying, so the wave was split into **W2a (task 03)** and **W2b (task 04)**, which run sequentially. The cost is one extra wave in a 31-wave plan; the benefit is that **every wave's collision matrix is now provably empty with no coordination instruction to rely on.** Task 03 still owns the TypeScript bump in both workspaces, and because it now lands first, task 04 simply re-reads the file it inherits.

---

## 5. Dependency graph

```
01 ─ repo hygiene: exact version pinning, NO lockfiles, tsc -b misuse
│
02 ─ GREEN THE BASELINE (29 → 0 errors)     ← blocks literally everything
│
03 ─ React 19 / Vite 7 / TS 5.9  (also pins server TS — W2a)
│
04 ─ Express 5 / sharp 0.35 / dead deps  (W2b — sequential after 03:
│      both write server/package.json, so they must not run together)
│
05 ─ ESLint flat config + Prettier + Sweep A
│
06 ─ Vitest harness + canvasStub
│
├──────────────┬──────────────┐
07 corpus +    08 pure utils  09 CSS prereqs:
   migrations     + store        dead classes, 6 tokens,
   characterise   contract       keyframes, index manifest
│              │              │
│              │              ├──────────────┐
│              │              10 STORYBOOK   │  (before CSS-05 — the single
│              │              │              │   highest-leverage ordering
│              └──────────────┤              │   decision available)
│                             │              │
11 server export ─────────────┤              │
   decomposition              │              │
                              ├──────────────┴────┐
                              12 CSS tokens +     13 types/ split +
                                 z-index scale       CompactUIState
                              │                    │
                              └────────┬───────────┘
                                       │
   ┌───────────────────────────────────┴─── THE MOBX CHAIN (incremental, bridged) ───┐
   │                                                                                  │
   14 fix 3 store defects + install MobX + SessionStore + bridge Phase A              │
   │                                                                                  │
   15 typed API layer (one fetch site, typed errors, MSW)                             │
   │                                                                                  │
   16 DomainStore lifecycle + AutoSaveController + LOAD-STATE GATE  ← closes the      │
   │                                                                  data-loss bug   │
   ├──────────────────────┬───────────────────────────────────────────────────────────┘
   17 HistoryStore        18 CSS shared blocks (btn/modal/panel/slider/confirm-dialog)
      (snapshot + redo)   │
   │                      19 ui/ skeleton + 18 PRIMITIVES + stories
   │                      │
   │                      20 BEM groups A (Canvas/RefPanel · AddVariant/ObjLib · Sliders)
   │                      │
   │                      ├──────────────┐
   │                      21 BEM groups B  22 BEM independent (15 components)
   │                      └──────┬───────┘
   └─────────────────────────────┤
   23 DomainStore tree + Palette/Object stores + 6 computeds + BRIDGE PIVOT
   │
   24 UIStore + toPersistedUIState()  ← the Project.uiState split; wire-format gate
   │
   25 TimelineUIStore + FrameStore + LayerStore
   │
   26 SelectionUIStore + PixelStore + inverse-patch commands  ← the hot path
   │
   27 LightingUIStore + lighting PixelStore paths
   │
   28 VariantStore (the 1,412-line module)
   │
   29 ReferenceUIStore — kill the module-level state inside a modal
   │
   30 Canvas: pure models + background + render extraction (unify the 2 overlays)
   │
   31 Canvas: viewport + keyboard + tool handlers (collapse mouse/touch)
   │
   32 Canvas: CanvasSurface + CanvasInteractionStore + CanvasContainer  ← Canvas.tsx deleted
   │
   ├──────────────────────┐
   33 LightingSurface     34 AIInterpolateModal decomposition
   └──────────┬───────────┘
   35 split LayerPanel / RightSidebar / TimelineView / ObjectLibrary
   │
   36 purify + relocate every remaining component into ui/
   │
   37 LAYOUTS + AppShell + AppContainer + GlobalHotkeys  ← App.tsx deleted
   │
   38 retire Zustand, delete the bridge, stylelint BEM on, Sweep B, `bun run verify` GREEN
```

---

## 6. Collision matrix

**Condition 2 requires that no two tasks in a wave share any `Touches` entry, including directory overlap.** Every multi-task wave's matrix is below, computed mechanically by normalising each task's `Touches` list and intersecting them.

Reproduce with:
```sh
cd REFRESH
norm() { grep -m1 '^\*\*Touches:\*\*' "$1" | sed 's/\*\*Touches:\*\* //' | tr '·' '\n' \
       | sed 's/^ *//;s/ *$//;s/`//g;s/ (.*//' | grep -v '^$' | sort -u; }
comm -12 <(norm <taskA>) <(norm <taskB>)     # must print nothing
```

### W2a / W2b — tasks 03 and 04 — **split; no longer a shared wave**

**There is no matrix for these two, because they no longer share a wave.** Task 03 runs alone in **W2a**; task 04 runs alone in **W2b** and depends on W2a.

**Why the split (owner decision, 2026-08-16).** Task 03's step 4 upgrades TypeScript in **both** workspaces so the repo never carries two TS versions, which means it writes `devDependencies.typescript` in `server/package.json` — a file task 04 also edits (`express`, `@types/express`, `sharp`, `tsx`). This overlap was pre-existing; the exact-pinning policy merely made it visible in the `Touches` lists, because both tasks now write literal version strings. Earlier revisions hid it by omitting `server/package.json` from 03's `Touches`.

The earlier resolution kept the two parallel and relied on a "write only your keys, re-read before writing" instruction. **That was rejected:** two agents writing one JSON file concurrently is a merge risk that holds only as long as both agents comply, and a coordination rule is a weaker guarantee than a structural one.

**Resolution — sequential execution.** Task 03 lands first and writes `devDependencies.typescript`; task 04 then re-reads the file it inherits and writes `express`, `@types/express`, `sharp` and `tsx`. The key-ownership constraints remain stated in both task files as documentation of intent, but **nothing now depends on an agent honouring them mid-wave.** Cost: one extra wave out of 31. Benefit: **every remaining multi-task wave's `comm -12` intersection is empty, with no exceptions to justify.**

### W5 — tasks 07, 08, 09

| | 08 | 09 |
| --- | --- | --- |
| **07** | **∅** | **∅** |
| **08** | — | **∅** |

07 writes `client/src/types/__tests__/`, `client/src/services/__tests__/`, `client/src/test/__fixtures__/` and `server/src/__tests__/normalizePixel.test.ts`. 08 writes `client/src/utils/__tests__/`, `client/src/components/Canvas/__tests__/`, `client/src/components/AnchorGrid/__tests__/` and `client/src/store/__tests__/`. 09 writes `.css` files, `styles/`, `main.tsx` and `scripts/`. **All three write into disjoint directories. Verified empty.**

**Semantic check:** 09 edits `main.tsx`'s import order and deletes dead CSS classes; neither 07 nor 08 reads CSS or `main.tsx`. 07 and 08 both add tests but to different suites and neither modifies a source file. **No semantic collision.**

### W6 — tasks 10, 11

| | 11 |
| --- | --- |
| **10** | **∅** |

10 touches `client/.storybook/`, `client/package.json`, `client/eslint.config.js`, `client/src/fixtures/` and one story file. 11 touches only `server/src/**`. **Verified empty.**

**Semantic check:** disjoint packages. **No semantic collision.**

### W7 — tasks 12, 13

| | 13 |
| --- | --- |
| **12** | **∅** |

12 touches `client/src/styles/tokens.css`, every `.css` file under `client/src`, `client/.stylelintrc.json` and `client/package.json`. 13 touches only `client/src/types/*.ts` and `client/src/types/__tests__/`. **No `.css` file lives under `client/src/types/`. Verified empty.**

**Semantic check — deliberate:** 12 edits **CSS only**; 13 edits **TypeScript only**. This is the one place where the plan runs a CSS task beside a source task, and it is safe **precisely because 12 renames no class**. Task 12 is explicitly forbidden from BEM conversion; all `className` string edits are confined to tasks 20-22, which never share a wave with a CSS-authoring task. **No semantic collision.**

### W11 — tasks 17, 18

| | 18 |
| --- | --- |
| **17** | **∅** |

17 touches `client/src/stores/history/`, `client/src/store/{index,projectActions,drawingActions}.ts` and `ColorPicker.tsx`'s undo call site. 18 touches `client/src/styles/blocks/`, `client/src/index.css` and 16 component `.css` files. **17 touches one `.tsx` (ColorPicker) and 18 touches only `.css`. Verified empty.**

**Semantic check:** 18 is CSS-only plus the minimum `className` string edits in the consumer `.tsx` files it lists — and `ColorPicker.tsx` **is** in 18's list via `ColorPicker.css`'s slider extraction. ⚠️ **18's `className` edits to `ColorPicker.tsx` and 17's undo-call-site edit to the same file are in different regions but the same file.** Resolution: **task 17 must not edit `ColorPicker.tsx` beyond replacing the `saveCurrentStateToHistory` call with `history.snapshot()` — a one-line change — and task 18's `ColorPicker.css` work must not touch `ColorPicker.tsx` at all** (the slider block extraction is CSS-side; the component's className adoption happens in task 20's G3). Both task files state this. **With that constraint, no semantic collision.**

### W14 — tasks 21, 22

| | 22 |
| --- | --- |
| **21** | **∅** (file level) |

**Shared directory, different files:** `client/src/components/LightingStudioPanel/` — 21 touches `LightingStudioPanel.{tsx,css}`, 22 touches `NormalPicker.{tsx,css}`. **No file is shared. Verified empty at file level.**

**Semantic check — this is the one that needed real scrutiny.** 21's G4 group unwinds the 15 `!important` declarations in `Toolbar.css` that exist to beat `LightingStudioPanel.css`'s `.brush-size-control` and `.shape-btn`. Does 22 touch any class in that collision? **No** — `NormalPicker.css` declares 6 classes (`normal-picker*`), none shared with `LightingStudioPanel.css` or `Toolbar.css`, confirmed against the collision inventory. 22's `LayerPanel.css` shares `.header-btn` with `PaletteManager.css` — and `PaletteManager` is **not** in 21's list. 22's `LightingCanvas.css` shares `.separator` with `Canvas.css`, which task 20 already converted. **No semantic collision.**

### W25 — tasks 33, 34

| | 34 |
| --- | --- |
| **33** | **∅** |

33 touches `LightingCanvas.tsx`, `ui/components/{LightingSurface,LightingPreviewPanel}/`, two containers, three renderers and one hook. 34 touches `AIInterpolateModal`, `ui/components/AIInterpolate/`, one container, one container-hook, one util, one store action and the bridge file. **Verified empty.**

**Semantic check:** 34 edits `stores/bridge/zustandBridge.ts`; 33 does not. Both add files under `ui/components/` but in different subdirectories. Both add containers but with different names. **No semantic collision.**

### The CSS ↔ component ordering constraint — stated explicitly

The planning brief required proving that the CSS stream and the component-decomposition stream are ordered relative to each other, since **BEM conversion edits `className` strings while decomposition moves those same strings between files.**

**They are strictly sequential in this plan, and never share a wave:**

```
W7  → 12  CSS tokens (renames NO class)
W11 → 18  CSS shared blocks (minimal className edits, listed files only)
W13 → 20  BEM groups A  ─┐
W14 → 21, 22 BEM rest   ─┴─ ALL className renaming finishes here
W15..W24 → 23-32  store migration + Canvas decomposition (moves className strings)
W26 → 35  the four component splits
W27 → 36  purification and relocation
```

**Every BEM conversion (tasks 20, 21, 22) completes before the first task that moves a `className` string between files (task 30).** Tasks 23-29 are store work that does not restructure components; each explicitly forbids splitting or moving the components it touches. The file sets are therefore not merely disjoint — the streams are **temporally ordered**, which is the stronger guarantee.

---

## 7. Task index

| # | Title | Wave | Effort |
| ---: | --- | :---: | :---: |
| 01 | Repo hygiene: exact version pinning, no lockfiles, `tsc -b` misuse | W0 | S |
| 02 | **Green the typecheck baseline (29 → 0)** | W1 | M |
| 03 | Client foundation: React 19 · Vite 7 · TypeScript 5.9 | W2a | M |
| 04 | Server: Express 5, sharp 0.35, dead-dependency removal | W2b | M |
| 05 | ESLint flat config, Prettier, and the scoped sweep | W3 | M |
| 06 | Vitest + Testing Library harness | W4 | M |
| 07 | **Characterise serialization and all 8 migrations** | W5 | L |
| 08 | Characterise pure utilities and the store contract | W5 | L |
| 09 | CSS prerequisites: dead classes, tokens, keyframes, manifest | W5 | M |
| 10 | **Storybook 9 harness and the visual baseline** | W6 | M |
| 11 | Decompose `server/src/routes/export.ts` | W6 | L |
| 12 | Full token set + literal substitution + z-index scale | W7 | L |
| 13 | Split `types/index.ts`; complete `CompactUIState` | W7 | M |
| 14 | Fix 3 store defects; install MobX; `SessionStore` + bridge | W8 | L |
| 15 | The single typed API layer | W9 | L |
| 16 | **`DomainStore` lifecycle, `AutoSaveController`, load-state gate** | W10 | L |
| 17 | `HistoryStore`: commands, byte budget, transactions, redo | W11 | L |
| 18 | Extract the 5 shared CSS primitive blocks | W11 | L |
| 19 | The `ui/` skeleton and the 18 primitives | W12 | L |
| 20 | BEM groups A: Canvas/RefPanel · AddVariant/ObjLib · Sliders | W13 | L |
| 21 | BEM groups B: brush controls, modal chrome, pickers, App shell | W14 | L |
| 22 | BEM: the 15 independent components | W14 | L |
| 23 | `DomainStore` tree, `Palette`/`Object` stores, 6 computeds, bridge pivot | W15 | L |
| 24 | **`UIStore` + `toPersistedUIState()` — the `Project.uiState` split** | W16 | L |
| 25 | `TimelineUIStore`, `FrameStore`, `LayerStore` | W17 | L |
| 26 | `SelectionUIStore`, `PixelStore`, inverse-patch commands | W18 | L |
| 27 | `LightingUIStore` and the lighting write paths | W19 | L |
| 28 | `VariantStore` (the 1,412-line module) | W20 | L |
| 29 | `ReferenceUIStore` — eliminate the modal's module state | W21 | L |
| 30 | Canvas 1/3: pure models, background, render extraction | W22 | L |
| 31 | Canvas 2/3: viewport, keyboard, tool handlers | W23 | L |
| 32 | Canvas 3/3: `CanvasSurface` + container — `Canvas.tsx` deleted | W24 | L |
| 33 | `LightingSurface`, `LightingPreviewPanel`, containers | W25 | L |
| 34 | Decompose `AIInterpolateModal` | W25 | L |
| 35 | Split the four oversized components | W26 | L |
| 36 | Purify and relocate every remaining component | W27 | L |
| 37 | Layouts, `AppShell`, `AppContainer` — `App.tsx` deleted | W28 | L |
| 38 | **Retire Zustand, finalise the gates, `bun run verify` green** | W29 | L |

---

## 8. Goal traceability

Every goal the owner stated maps to at least one task.

| Owner's goal | Task(s) |
| --- | --- |
| **Update packages to latest** | **03** (React 19, Vite 7, TS 5.9), **04** (Express 5, sharp 0.35, dead-dep removal), **05** (ESLint 9, Prettier), **06** (Vitest 3, Testing Library), **10** (Storybook 9), **14** (MobX 7), **38** (Zustand removed) |
| **Break down oversized/sloppy files** | **11** (`export.ts` 927→~120), **13** (`types/index.ts` 1,086→8 modules), **30/31/32** (`Canvas.tsx` 3,062→deleted), **33** (`LightingCanvas.tsx` 937→deleted), **34** (`AIInterpolateModal` 1,252→shell+8), **35** (`LayerPanel`, `RightSidebarTopControls`, `TimelineView`, `ObjectLibrary`), **23/25/26/27/28** (the 8,050-line store → ~16 focused stores) |
| **MobX `ApplicationStore` + Session/Domain/UI** | **14** (skeleton + `SessionStore`), **16** (`DomainStore`), **17** (`HistoryStore`), **23** (domain tree + computeds), **24** (`UIStore`), **25/26/27/28/29** (the UI and domain sub-stores), **38** (Zustand retired) |
| **BEM CSS for all components** | **09** (prerequisites), **12** (tokens + z-index), **18** (5 shared blocks), **20/21/22** (every component converted), **38** (stylelint `selector-class-pattern` enforced) |
| **Break large components into organized substructures** | **19** (18 primitives), **30/31/32** (Canvas → surface + hooks + pure modules), **33**, **34**, **35**, **36** |
| **UI completely divorced from state** | **05** (the ESLint `ui/**` boundary rules), **19** (the `ui/` skeleton + boundary probes), **29** (the last module-level state removed), **36** (every component purified), **38** (`check-boundaries.mjs` as a CI gate) |
| **App assembled by joining UI components with the store** | **19** (`containers/` established), **23-29** (a container per consumer), **36** (containers for the rest), **37** (`AppContainer` + `PixelStudioContainer` + `LightingStudioContainer` + `GlobalHotkeys`) |
| **Well-defined, simple, isolated, typed API layer** | **15** (`client/src/api/` — one `fetch` site, typed `ApiError`, timeouts, MSW), **16** (migrations moved out of transport into the store), **11** (server-side route decomposition + shared validation) |
| **Storybook bubbling up to full-page Layouts** | **10** (harness + fixtures + modal-host decorator), **19** (18 primitive stories, a11y built in and reported advisory-only), **32/33/34** (surface and step stories), **35/36** (component stories), **37** (`PixelStudioLayout`, `LightingStudioLayout`, `LoadingLayout`, `AppShell` stories) |

---

## 9. Reconciled conflicts

Every overlap between the eight audits, and which task owns the work. **Every piece of work belongs to exactly one task.**

### 9.1 The typecheck error count: 29, not 56

Two audits disagreed. The later one **ran both commands** and found `bunx tsc --noEmit` and `bunx tsc -b` produce **byte-identical** output — 29 errors, `diff` returns nothing. The "56" is superseded; its most likely cause is the stale `client/tsconfig.tsbuildinfo` that is committed to git and not ignored.

**Resolution:** the plan uses **29** everywhere. **Task 01** untracks the buildinfo and switches `build` to `tsc --noEmit` so it cannot recur; **task 02** fixes exactly those 29. The *conclusion* both audits reached — that there is no green baseline — was correct either way, and it is why task 02 sits at W1, blocking everything.

### 9.2 Modal count, Canvas destructure count, store-importer count

A later audit corrected three earlier figures by direct measurement: there are **14** modals, not 15 (`GaussianFillModal/` is an empty directory — `ls -la` → `total 0`); `Canvas.tsx` destructures **47** store members, not 48; and **34** files import `useEditorStore`, not 35 (the 35th is the store's own definition).

**Resolution:** the corrected numbers are used throughout. **Task 02** deletes the empty directory.

### 9.3 There are 2 layouts, not 4

The planning brief proposed `PixelStudioLayout`, `LightingStudioLayout`, `ProjectSelectLayout` and `ObjectLibraryLayout`. A full read of `App.tsx` disproved the last two: `ProjectSelectModal` is mounted from `Header.tsx` and there is **no routing and no entry screen** — the app boots straight into the editor; `ObjectLibrary` is mounted once as the left sidebar's top half, a **region**, not a page.

**Resolution: task 37** authors exactly `PixelStudioLayout`, `LightingStudioLayout` and `LoadingLayout`, plus `AppShell` as a *component* (both layouts render it, so it does not decide what the page is).

### 9.4 `server/src/routes/export.ts` — one owner

Two audits proposed decomposing it: one on code-structure grounds (naming, compaction, raster, codegen), one on API-contract grounds (validation, error mapping, the duplicated schema).

**Resolution: task 11 owns the entire decomposition** and merges both proposals into one module set. No other task touches `server/src/routes/export.ts` or `server/src/export/`. Task 04 is explicitly forbidden from decomposing it while upgrading Express and sharp.

The API-contract *fixes* that task 11 adopts: shared `isValidProjectName`, and dropping the absolute server path from the response. The ones it **rejects**, each recorded as an open question: restoring frame tags (changes a **published** format consumed by downstream game code — needs a version bump and owner sign-off), fixing the M8 empty-string key (changes exported JSON), converting export to a job model (a feature), and creating a `shared/` workspace with Zod (a significant structural change adding a runtime dependency to a client with four production dependencies).

### 9.5 The store action modules — split, or replace? **Replace.**

One audit measured `variantActions.ts` (1,412), `lightingActions.ts` (1,036), `layerClipboardActions.ts` (837) and `layerActions.ts` (763) as oversized and proposed splitting each into a `store/<domain>/` folder. Another audit's MobX design **replaces all of them entirely** with `VariantStore`, `PixelStore`, `LightingUIStore`, `LayerStore` and so on.

**Resolution: the split proposals are DROPPED. Splitting a file that is about to be rewritten is wasted work.** Tasks 23, 25, 26, 27 and 28 migrate the behaviour directly from the current modules into the new stores, and task 38 deletes `client/src/store/` wholesale.

Three pieces of that proposal *were* worth keeping and are folded in: extracting the pure normal-from-height algorithm (**task 27**), extracting `getAnchorPadding` to remove the store→UI-component import (**task 28**), and collapsing the 7 `squash*`/`move*` **call-site** callbacks (**task 35** — the store actions themselves are ported faithfully in task 25, because task 08 pinned their differences).

### 9.6 `types/index.ts` — split it, or move the serializers out? **One task does both.**

One audit wanted it split by responsibility at its natural seam (line 519); another wanted the serializers extracted so migrations stop living in the transport layer.

**Resolution: task 13 owns both**, because they are the same cut and doing them separately means editing the same 1,086 lines twice. It also declares the three `UIState` fields missing from `CompactUIState` (`referenceImagePanelPosition`, `referenceImagePanelMinimized`, `layerSelectionCounter`; task 02 already declared `lightGridMode`).

The *other* half of the serializer concern — moving the **migration chain** out of `services/api.ts` into the store's load path — is **task 16**, because that is where `DomainStore.loadProject` exists to receive it. Both tasks move code **verbatim**, with task 07's corpus snapshots as the equivalence proof.

### 9.7 Modal chrome — CSS blocks first, then React primitives

One audit saw the duplication as a CSS problem (14 backdrop class names, `.modal-overlay` declared in one modal but consumed by two others, 6 z-indexes, 6 opacities); another planned a `Modal` React primitive. Both proposed the same five names: `btn`, `modal`, `panel`, `slider`, `confirm-dialog`.

**Resolution: CSS first (task 18), React second (task 19), same names.** Building `Modal.tsx` before `blocks/modal.css` exists means inventing class names twice; with this order the React extraction is strictly additive. Task 19 explicitly builds against the class names task 18 established.

### 9.8 MobX slices vs container purification — interleaved per file

One audit flagged this itself: its slices M7-M13 collide **by file** with the other audit's container work, and recommended interleaving per file so consumers are not edited twice.

**Resolution: adopted deliberately.** Tasks 23-29 each migrate a store slice **and** create the containers for the consumers that read it, in one session. The purely presentational work — physically relocating components into `ui/components/`, adopting primitives, and writing stories — is deferred to **tasks 35 and 36**, after every store slice has landed.

The cost is stated plainly: each of tasks 23-29 touches component files twice in the plan's lifetime (once for its container, once for relocation). The alternative — editing all 34 consumers for the store migration and then again for purification — costs more and risks more.

### 9.9 The ESLint glob: `src/ui/**`

One audit keyed its `no-restricted-imports` rule to `src/ui/**` and flagged that the rule **silently matches nothing** if the directory name differs — the worst possible failure mode for an architecture rule. Another audit owns that path name.

**Resolution: `src/ui/**` everywhere.** Task 05 writes the rule; task 19 creates the directory; **both include a mandatory boundary probe that must FAIL ESLint**, because a rule matching nothing looks exactly like a rule that passes. Task 38 adds `check-boundaries.mjs` as a second, cheaper gate.

### 9.10 Storybook before CSS-05 — and no visual-regression service

Two audits independently recommended scheduling Storybook **before** the CSS token substitution. A third **rejected** Chromatic and `@storybook/test-runner` on measured grounds: Chromatic needs a paid plan plus CI that does not exist; the test-runner needs a ~300 MB Playwright download for a repo that had zero tests.

**Resolution: both, and they are compatible.** **Task 10 lands Storybook at W6; task 12 does the substitution at W7.** No visual-regression service is installed. The verification story is coherent and threefold: **Storybook** for human review against a captured baseline (task 10), **primitive DOM snapshot tests** (task 19 — a BEM rename *is* a DOM structure change, and fixing one primitive fixes 14 modals), and **canvas pixel hashing** in plain Vitest (task 06's `canvasStub.ts`, used by tasks 30 and 33).

The ordering tension — `preview.tsx` imports `index.css`, whose shape task 09 changes — is resolved by making task 10 depend on **task 09 only** (the import manifest), not on task 12.

This is a **deliberate re-evaluation point**, not a permanent no: if the primitive set grows past ~15 components with multiple variants each, `@storybook/test-runner` becomes worth its ~3 hours.

### 9.11 Prettier runs twice, deliberately

**Resolution: task 05 runs Sweep A** (root config files, `client/src/types/**`, `services/api.ts`); **task 38 runs Sweep B** (everything else). Sweeping the components early would reformat ~1,400 lines that the decomposition tasks delete outright, and would destroy the `diff <(sed -n ...)` evidence that tasks 30 and 31 rely on to prove two blocks are byte-identical before unifying them. Each sweep is its own commit with its SHA in `.git-blame-ignore-revs`.

### 9.12 The two `alphaBlend` functions and the 4-level offset rule

Alpha compositing exists **5×** (two functions literally named `alphaBlend`); the variant-offset fallback exists **6×**.

**Resolution:** **task 08 pins each implementation's behaviour first** (they may not agree), **task 30** unifies the 5 client copies of both, and **task 11** keeps the server's copy with a cross-referencing comment. Sharing across the package boundary would need a `shared/` workspace, which is out of scope (§9.4) and recorded as an open question.

### 9.13 Migration bugs: pinned, not fixed

Four measured defects in the migration chain (M2 is not array-safe; M2's detection samples one pixel; M4 hard-codes `10`; M5 drops offsets when `selectedVariantId` is absent), plus M6 existing as **two divergent implementations**.

**Resolution: task 07 pins all of them as characterisation tests asserting the *current, buggy* behaviour**, each with a `// BUG:` comment. **No task in this plan fixes them.**

**Measured 2026-08-16 — the answer to "do real pre-migration files survive?" is NO.** All 9 backup archives were decompressed and classified: 149 snapshots, **zero** `variantGroups`, **zero** `variantOffset`, `[c,n,h]` pixel tuples throughout, `baseFrameOffsets` present, every archive `"version":"1.1.0"`. The oldest surviving backup is already fully migrated. Consequently the four bugs **cannot be validated against real data at all**, and the "pin, don't fix" stance **hardens**: pinning stays, and any future fix must first build a hand-authored synthetic corpus and obtain explicit owner sign-off.

---

## 10. Rules for every REFRESH agent

1. **Use `bun` / `bunx`. Never `npm` or `node`** — neither is on PATH. `which node` returns nothing.
2. **Pin exact versions; never create a lockfile.** Standing project policy (owner decision, 2026-08-16). `bunfig.toml`'s `[install.lockfile] save = false` is **deliberate and must stay** — the repo has no `bun.lock`, `bun.lockb`, `package-lock.json` or `yarn.lock` anywhere, and `.gitignore` blocks all four. Reproducibility comes from **exact version strings in `package.json`**: no `^`, no `~`, no ranges. Every `bun add` must use `--exact`, because plain `bun add x@1.2.3` writes `"^1.2.3"`. **`--frozen-lockfile` is meaningless in this repo and must never appear in any command.** Task 01 removed all 22 flexible specifiers and deleted the one stray `server/bun.lock`; any task that reintroduces a range or a lockfile has regressed the policy.
3. **Never break `bun run dev`.** If a change stops the app from starting, fix it or revert before finishing.
4. **Commit at task granularity**, and within a task commit each numbered step separately where the task says to. A Prettier sweep, a strictness flag, and a refactor are always three commits, never one.
5. **Run your wave's gate command and paste the output** into your completion report. "It passes" is not a report.
6. **Stay inside your `Touches` list.** If the work genuinely requires a file outside it, stop and report rather than expanding scope — the collision matrix in §6 is only valid if `Touches` is accurate.
7. **Report honestly, including partial completion.** A task that finished 6 of 8 steps with the reasons stated is far more useful than one claiming success. If a verification command fails and you cannot fix it, say so.
8. **Preserve the 8 schema migrations.** Any task touching `client/src/types/`, `client/src/services/`, `client/src/stores/domain/` or `server/src/export/` must confirm task 07's corpus snapshots still pass **unchanged**. Losing a migration silently corrupts the owner's real project files. ⚠️ **Measured 2026-08-16: no pre-migration data survives anywhere in this repo** — all 149 snapshots across the 9 gzipped backups are already fully migrated (zero `variantGroups`, zero `variantOffset`, `[c,n,h]` pixel tuples throughout, `baseFrameOffsets` present, `"version":"1.1.0"`). The migrations are therefore verifiable **only** against task 07's hand-authored synthetic fixtures; there is no real-data safety net behind them.
9. **Never run `vitest -u`** on the migration or corpus suites. Every snapshot diff there is a change to real user data and must be read by a human.
10. **Assert observed behaviour, not desired behaviour**, in any characterisation test. A test asserting what the code *should* do is just a failing test, and the first person who needs a green build will delete it.
11. **Never make a pixel grid deeply observable.** `layer.pixels` is `observable.ref`, always. The measured project has 300,249 cells; deep observation is ~1M proxies and it will look like "MobX is slow" rather than a modelling error.
12. **`observer()` only under `client/src/containers/`. Nothing under `client/src/ui/` may import a store, the API, or MobX.** ESLint enforces both; if the rule seems not to fire, run the boundary probe — a rule matching nothing looks exactly like a rule that passes.
13. **Do the manual checks.** Gesture behaviour, StrictMode semantics, stacking order and visual regressions are not automatable here. A task whose manual checks were skipped is not done.
14. **Read `OPEN-QUESTIONS.md` before starting.** As of 2026-08-16 the owner has answered every question that gated a scheduled task: **zero blocking questions remain against any task in this plan.** The one remaining blocking item, Q33 (`server/exports/lib/` is confirmed consumed by external game code), gates only an **unscheduled follow-up**, not any task here.

---

## 11. Risk register

| # | Risk | Severity | Mitigation |
| ---: | --- | --- | --- |
| R1 | **A migration regression corrupts the owner's real art.** 8 migrations, 2 of them duplicated with divergent behaviour, 4 with known bugs, zero tests before task 07. Irreversible: a bad refactor silently mangles pixels rather than erroring. ⚠️ **Aggravated by measurement (2026-08-16): no pre-migration data survives in the repo**, so the migrations have **no real-data test corpus at all**. | **Critical** | Task 07 pins every migration with golden snapshots **before anything moves**, using **hand-authored synthetic fixtures for all of M1-M8** (there is nothing real to test against). The 149 real snapshots are still used as a **post-migration round-trip corpus** — `compactToProject(projectToCompact(p))` must be stable across all of them. Every later task that touches the serializer re-runs both **unchanged**. Rule 9 forbids `vitest -u`. Tasks 13 and 16 move code **verbatim**. Because no real pre-migration sample exists, the "pin, don't fix" stance on the four known migration bugs **hardens**: any future fix needs a purpose-built synthetic corpus and explicit owner sign-off. |
| R2 | **Deep-observing the 300k-cell pixel grid.** MobX's default `observable` is deep; wrapping `Project` naively creates ~1M proxies. | **Critical** | `observable.ref` on every grid, mandated in tasks 23, 26 and 27; a `no-restricted-syntax` lint rule forbidding `makeAutoObservable` on `PixelData`/`Pixel`/`Normal`; canvases driven by `reaction` on `pixelVersion`, not `observer`. **Gate: a 100-pixel drag must stay under 16 ms/frame**, checked in tasks 23, 26 and 32. |
| R3 | **Wire-format drift from the `uiState` split.** All 44 fields move out of the serialized `Project` and must come back byte-identically. Months of backups depend on it. | **Critical** | `toPersistedUIState()` is an **explicit field-by-field builder**, never a spread (task 24). A key-for-key golden test gates the task, and it must be green **before** any consumer migrates. **There is no permitted difference**: the owner decided `aiServiceUrl` stays in the wire format (2026-08-16), so the payload must be byte-identical and **no fixture re-bless is allowed** — a diff means a defect. |
| R4 | **Undo/redo regression.** 129 call sites, 3 `trackHistory` semantics, and command correctness becomes per-action manual work. | **Critical** | Task 08 writes the characterisation suite against the **Zustand** store first — the only baseline that will ever exist. Task 17 ships **snapshot-only** commands so behaviour is provably identical, and the suite must pass **unchanged**. Task 26 converts one family at a time, re-running the suite after each. |
| R5 | **The blank-project overwrite stays live too long.** It is the highest-severity bug in the repo and the migration is 25 waves long. | **High** | It is closed **early**: task 15 stops the API fabricating a default, task 16 adds the load-state gate. Both are before any component decomposition. The regression test asserts **zero** `POST /api/project` after a failed load. |
| R6 | **The bridge develops two writers for one field**, so writes oscillate or are silently lost. | **High** | The bridge file's two explicit field lists are the migration's progress ledger; the task that flips a field moves it between lists **in the same change**; a dev-mode assertion fails if a field appears in both. Task 38 confirms the Phase A list is empty before deleting it. |
| R7 | **Render-count changes surface latent ordering bugs.** 33 of 34 consumers re-render on every change today; `observer` makes rendering granular everywhere at once. | **High** | Migrate in the 12-slice order, lowest entanglement first, `Canvas.tsx` last (task 32 of 38). Per-slice manual smoke matrix. Keep `observableRequiresReaction: true` on in dev — every warning marks an unmigrated component, a free progress meter. |
| R8 | **CSS token substitution changes pixels.** 585 colour literals, and several clusters deliberately collapse near-identical values. | **High** | Storybook lands **first** (task 10) so there is a real baseline. Task 12 splits into three sub-commits by property family. Each collapsed difference is accepted **individually**, not bulk-approved, and listed in the completion report. |
| R9 | **The z-index rewrite breaks stacking**, and no automated check covers it. | **High** | Task 12 mandates a manual pass opening every modal, both nested confirms, all three tooltips, the dropdown, and **the AI-config popover while a modal is open** — the one real ordering bug the scale fixes. |
| R10 | **Canvas decomposition breaks drawing.** 3,062 lines, the entire editing surface, and mouse/touch have already drifted. | **High** | Split into **three sequential tasks** (30, 31, 32), each independently shippable and typecheckable. Task 08 pre-writes the pure-function tests; task 30 adds golden-hash render tests per mode. The full drawing matrix is run manually on **both** a mouse and a touch device. |
| R11 | **React 19 StrictMode changes have no automated gate.** 111 `useRef` sites across 23 files, concentrated in canvas code; jsdom cannot exercise pinch-zoom or touch. | **Medium** | Task 03 mandates an explicit manual canvas smoke test as its acceptance criterion, and states plainly that this is the only gate. |
| R12 | **sharp's libvips upgrade silently changes PNG encoding.** For a pixel-art exporter, output drift does not throw — it corrupts sprites. | **Medium** | Task 04 captures goldens **before** the version changes and requires `diff -r` to produce **no output**. If any byte differs, the task stops and reports rather than re-blessing. |
| R13 | **Prettier Sweep B's ~65-file diff hides a semantic change.** | **Medium** | Own commit, nothing else in it; `.git-blame-ignore-revs` entry; `bunx tsc --noEmit` error count unchanged before and after; three files spot-checked by hand. |
| R14 | **Clipboards silently stop surviving a project switch.** Nothing clears them today and that cross-document lifetime is load-bearing, but `UIStore` **is** project-scoped. | **Medium** | They live on `SessionStore` by construction (task 14), task 08 adds the test that never existed, and tasks 14, 25 and 38 each re-verify it manually. |
| R15 | ~~**A blocking question is answered late**, stalling a wave.~~ **Closed 2026-08-16.** | **Closed** | The owner answered Q1, Q2, Q3, Q10, Q21, Q41 and Q44, and Q28 was answered by direct measurement of all 9 backup archives. **Zero blocking questions remain against any scheduled task.** Q33 is confirmed (`server/exports/lib/` **is** consumed externally) and gates only an unscheduled follow-up. |
| R16 | **Scope creep from the deferred items** — Zod, a `shared/` workspace, `noUncheckedIndexedAccess`, `ModalUIStore`, CI, frame tags in exports. | **Low** | Each is explicitly out of scope, with the reasoning recorded in `OPEN-QUESTIONS.md`, and the tasks that could absorb them are explicitly forbidden from doing so. |

---

## 12. Rollback

### Branch strategy

```
main
 └── refresh/w<N>-<slug>          one branch per WAVE
      ├── commit per task step
      └── merged to main only when the wave gate exits 0
```

- **One branch per wave, not per task.** A wave is the unit that has a gate, so it is the unit that can be proven good.
- **Never commit directly to `main`.**
- Merge with `--no-ff` so each wave is one revertable merge commit in `main`'s history.

### Abandoning a bad wave

```sh
git checkout main
git branch -D refresh/w<N>-<slug>        # nothing merged, nothing to undo
```

If already merged:
```sh
git revert -m 1 <merge-commit-sha>       # reverts the whole wave atomically
```

That is why waves merge as single `--no-ff` commits.

### Rollback points that matter most

| After | State | Why it is a good place to stop |
| --- | --- | --- |
| **W1 (task 02)** | Green typecheck, green build | The first state in this repo's history where `bun run build` succeeds. Valuable even if nothing else lands. |
| **W4 (task 06)** | Lint + format + test harness | The toolchain is in place; the audits' claims become checkable. |
| **W5 (task 07)** | The migration corpus is frozen and pinned | **The single most valuable checkpoint.** Even if the whole refactor is abandoned, the owner's data is now protected by tests. |
| **W7 (task 12)** | Tokens, z-index scale, Storybook | The CSS is coherent and reviewable; the store is untouched. |
| **W10 (task 16)** | The data-loss bug is closed | The highest-severity bug is fixed and the app still runs on Zustand for everything else. |
| **W14 (task 22)** | All BEM conversion complete | The CSS goal is fully delivered; no component has been restructured. |
| **W24 (task 32)** | `Canvas.tsx` is gone | The largest single risk in the plan has passed. |

### Within a wave

Every task lists its steps as separate commits precisely so a bisect lands on one. Tasks 30-32 (Canvas) and 20-22 (BEM) are the ones most likely to need it, and both mandate commit-per-step.

### The bridge is the migration's escape hatch

Tasks 14-38 keep Zustand and MobX running side by side. **Every slice ends with the app running, the bridge consistent, and `bunx vitest run && bunx tsc --noEmit && bun run build` green.** Any single slice can be reverted independently, because the bridge's two field lists are the only shared mutable state. The migration is only irreversible at task 38, which is why that task is last and why its definition of done includes a full 12-point manual regression pass.
