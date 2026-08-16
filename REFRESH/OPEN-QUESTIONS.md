# REFRESH — Open Questions

Every unresolved question raised by the eight REFRESH-PREP audits, grouped by topic.

- **BLOCKING** — a named task cannot start until the owner answers.
- **NON-BLOCKING** — work proceeds under an explicitly stated assumption. **If an assumption turns out wrong, the affected task is identified here**, which is the whole point of writing it down.

**As of 2026-08-16 the owner has answered every question that gated a scheduled task. ZERO blocking questions remain against any task in this plan — it is ready to execute.**

Answered on 2026-08-16: **Q1** (danger red), **Q2** (`aiServiceUrl` stays), **Q3** (unify canvas grid), **Q10** (no lockfiles, pin exact versions — this **inverted** the plan's assumption), **Q21** (undo save), **Q41** (a11y gate stays advisory — this **differs** from the plan's assumption), **Q44** (touch eraser). **Q28** was answered empirically by decompressing and classifying all 9 backup archives, and its answer **contradicts** the plan's assumption.

**Q33 is confirmed and remains the only BLOCKING item — but it blocks nothing that is scheduled.** `server/exports/lib/` **is** consumed by external game code, so task 11 stays forbidden from restoring frame tags; the fix needs a coordinated 2.0.0 version bump and is filed as an unscheduled follow-up requiring owner sign-off.

---

## 1. Design decisions the owner must make

### Q1 — Two incompatible reds are in production. Which is intended? **ANSWERED — task 12 UNBLOCKED**

`--accent-danger: #ff3366` (the declared token) and the literal `#ef4444` (12 uses across `AddVariantModal`, `FrameTagsModal`, `Header`, `LayerPanel`, `ObjectLibrary`, `ResizeModal`) **appear in the same modals**. This is a design decision, not a technical one, and it changes 12 visible declarations.

**OWNER DECISION (2026-08-16):** `#ff3366` — the token — is correct. The 12 `#ef4444` literals are drift and are rewritten to `var(--accent-danger)` (`--accent-danger: #ff3366`). This matches the plan's assumption. **Task 12 is unblocked** and now states this as a settled decision rather than an assumption; it must still list the 12 converted declarations in its completion report.

### Q2 — Should `aiServiceUrl` leave the saved project file? **ANSWERED — task 24 UNBLOCKED**

`uiState.aiServiceUrl` (`types/index.ts:193`, written by `toolActions.ts:488`) is app-level configuration for an external service endpoint, but it is persisted **per project** — so switching projects silently repoints the AI service.

**OWNER DECISION (2026-08-16): keep it in the project file.** This is the opposite of the plan's assumed removal.

Consequences, all now applied to the plan:

- `uiState.aiServiceUrl` **stays** in the persisted project/wire format. `toPersistedUIState()` emits `session.aiServiceUrl` (per findings 06); `SessionStore` remains the single **read** source, but the value round-trips to the project file exactly as today.
- **There is now NO deliberate wire-format change anywhere in this plan.** The persisted format is byte-identical throughout — which *simplifies* things: **task 07's golden fixtures need no re-blessing**, and task 24's byte test permits **zero** differences rather than one.
- **Known consequence, accepted and preserved deliberately:** switching projects still repoints the AI endpoint. That is **existing behaviour, not a bug this plan fixes**. It is filed as a follow-up note in task 24.

Applied to tasks **14, 15, 16, 24, 38** and MASTER.md.

### Q3 — Should the two canvases' grid appearance be unified? **ANSWERED — task 30 UNBLOCKED**

`Canvas.tsx` draws the grid at alpha `0.05` and honours `lightGridMode`. `LightingCanvas.tsx:322` hard-codes `0.08` and **ignores `lightGridMode` entirely**. The two canvases visibly disagree today.

**OWNER DECISION (2026-08-16): unify onto `Canvas`'s behaviour.** Both canvases use alpha `0.05` and both honour `lightGridMode`; `LightingCanvas.tsx:322`'s hard-coded `0.08` goes away. This matches the plan's assumption. **Task 30 is unblocked** and states it as settled — it must still **screenshot both canvases in both grid states**, because `LightingCanvas`'s appearance changes visibly.

### Q4 — Should the three `--selected` badges keep three different colours? **NON-BLOCKING — task 21**

`AddVariantModal`, `ObjectSelectModal` and `VariantSelectModal` each define a 20px circular `.selected-badge` with a **different fill**: `#8b5cf6` (violet), `#6366f1` (indigo), `#10b981` (green). ObjectSelectModal's green currently wins for all three by bundle order.

*Assumption:* each component keeps its **own authored colour**. Task 21 records the three decisions explicitly rather than inheriting the accident.

### Q5 — Should `.delete` / `.cancel` / `.confirm` be renamed to `--danger` / `--neutral` / `--primary`? **NON-BLOCKING — tasks 20-22**

The rename decouples appearance from handler name but makes the mapping less obvious to someone grepping.

*Assumption:* proceed with the rename. It is in the canonical state-word table in task 20, so the conversion is mechanical, and it prevents `.delete` (in 4 files today) from being re-introduced as a generic name.

### Q6 — Should the near-identical dark palettes be collapsed onto the tokens? **NON-BLOCKING — task 12**

`FrameReferencePanel`, `LightingCanvas` and `ReferenceImagePanel` share a private palette that shadows the token set with slightly-off values: `#0a0a15` vs `--bg-primary` `#0a0a0f`; `#e0e0ff` vs `--text-primary` `#e8e8f0`; `#a0a0b0` vs `--text-secondary` `#a0a0b8`. Differences are 1-6 in a channel.

*Assumption:* collapse them onto the tokens — below the perceptual threshold on a dark UI. Flagged in task 12's review for visual sign-off.

### Q7 — Are the 9 "missing CSS" gaps intentional or bugs? **NON-BLOCKING — filed, not fixed**

`origin-controls-panel`, `brush-max-control`, `focus-mode-section`, `ai-step-layer`, `alpha-slider`, `sat-slider`, `light-slider`, `frame-drop-indicator-variant`, `expanded` (plus the minor `odd`). Each is referenced in TSX with no rule anywhere. **`frame-drop-indicator-variant` (`VariantView.tsx:490`) is the highest-confidence real bug** — the variant view's drop indicator renders unstyled.

*Assumption:* preserve current behaviour exactly during the conversions — convert the className to its BEM name and add no rule. **Tasks 20, 21 and 22 are all explicitly forbidden from filling them**, because inventing styles mid-conversion makes "nothing changed" unverifiable. File them as a separate follow-up.

### Q8 — Should colour-alpha ramps be literal tokens or `color-mix()`? **NON-BLOCKING — task 12**

The cyan ramp (`rgba(0,217,255,0.05…0.4)`, 7 values, 64 uses) is entirely derivable from `--accent-primary`.

*Assumption:* explicit literal tokens (`--accent-primary-10`, …). Simpler to grep, simpler to lint, no browser-support caveats. There is no theming today (`grep -rn 'prefers-color-scheme|data-theme' src/*.css` → 0 hits). Revisit if the palette is ever themed.

---

## 2. Dependency and toolchain choices

### Q9 — React 19: upgrade now or defer? **NON-BLOCKING — task 03. Recommendation: upgrade, and early.**

*(Named in the planning brief as a question the owner should see.)*

**Evidence for upgrading now:** every React 19 removal grepped **clean** across `client/src` — no `defaultProps`, no `propTypes`, no string refs, no legacy context, no `createFactory`, no `ReactDOM.render`, no `findDOMNode`, no `react-test-renderer`, no argument-less `useRef`, no global `JSX.*` usage, and **no `forwardRef` anywhere** (the single largest React 19 refactor category simply does not exist here). `main.tsx:6` already uses `createRoot`. `lucide-react`'s peer range is React-19-safe at both its current and latest version. Everything the plan adds — `@testing-library/react@16.3.2`, `mobx-react-lite@5.0.0`, `@storybook/react-vite@9.1.20` — is React-19-ready.

**Timing argument:** the refresh rewrites the store layer and adds a Storybook + Vitest harness from scratch. Doing React 19 *after* means re-validating every new story and test against a new React; doing it *first* means the harness is authored once against its final target.

**The one caveat:** React 19 tightens StrictMode double-invocation and ref-cleanup semantics. `main.tsx:7` wraps the app in `<StrictMode>` and there are **111 `useRef` sites across 23 files**, concentrated in canvas code. This is a **runtime** risk, not a compile risk, and it is **not detectable by grep or by the typechecker**.

*Assumption:* upgrade in task 03, gated on the manual canvas smoke test in that task rather than on further static analysis.

### Q10 — Was `bunfig.toml`'s `[install.lockfile] save = false` deliberate? **ANSWERED — task 01 UNBLOCKED. This INVERTED the plan's assumption.**

**OWNER DECISION (2026-08-16): never use lockfiles for bun or npm anywhere in this project. Version locking happens in `package.json` itself — no flexible versions.**

This is a **standing project policy**, not merely a task-01 decision. The plan assumed `save = false` was a hack to be undone; that assumption was **wrong** and every trace of "re-enable lockfile writing", "regenerate lockfiles" and "commit `bun.lock`" has been removed from the plan.

What now holds everywhere:

- `bunfig.toml`'s `[install.lockfile] save = false` is **deliberate and must stay**. No task may edit it.
- **All dependency versions are pinned EXACTLY in `package.json`** — no `^`, no `~`, no ranges. **22 flexible specifiers were measured** and task 01 removes all of them: root `mprocs ^0.8.3`; client `lucide-react ^0.575.0`, `react ^18.3.1`, `react-dom ^18.3.1`, `zustand ^4.5.2`, `@eslint/js ^9.13.0`, `@types/react ^18.3.12`, `@types/react-dom ^18.3.1`, `@vitejs/plugin-react ^4.3.3`, `eslint ^9.13.0`, `eslint-plugin-react-hooks ^5.0.0`, `eslint-plugin-react-refresh ^0.4.14`, `globals ^15.11.0`, `typescript ~5.6.2`, `typescript-eslint ^8.11.0`, `vite ^5.4.10`; server `cors ^2.8.5`, `dotenv ^17.3.1`, `express ^4.21.0`, `sharp ^0.33.5`, `@types/cors ^2.8.17`, `@types/express ^4.17.21`, `@types/node ^22.9.0`, `tsx ^4.19.2`, `typescript ~5.6.2`.
- A stray **`server/bun.lock` exists** and contradicts the policy: task 01 `git rm --cached`s it (if tracked), deletes it, and adds `bun.lock`, `bun.lockb`, `package-lock.json` and `yarn.lock` to `.gitignore`.
- **Every `bun add` in every task must use `--exact`**, because plain `bun add x@1.2.3` writes `"^1.2.3"`.
- **`--frozen-lockfile` is now meaningless and has been deleted everywhere it appeared** in the plan.

Task 01 was rewritten around this (its H1 and objective changed; the filename is unchanged so cross-references keep resolving). Its job is now: pin every version exactly, delete the stray lockfile, gitignore lockfiles, **keep `bunfig.toml` as-is**, plus its existing tsbuildinfo/gitignore/start-script work. Tasks **03, 04, 05** and MASTER.md (ground truth, rules-for-agents — new standing rule #2 — and the W0 gate) were updated to match.

### Q11 — ESLint 9 or 10? **NON-BLOCKING — task 05**

ESLint 10 is latest; the `maintenance` tag is 9.39.5. `typescript-eslint@8.67.0` does accept `^10`.

*Assumption:* pin **9.39.5** — the settled target for `eslint-plugin-react-refresh` and the wider plugin ecosystem. Revisit after the refresh ships.

### Q12 — Vite 7 or Vite 8? **NON-BLOCKING — task 03**

*Assumption:* **Vite 7.3.6**. Vite 8 is the rolldown rewrite and drags in `@vitejs/plugin-react@6` (whose peer is `vite ^8.0.0` **only**), Vitest 4, Storybook 10, and a Playwright download. The Vite 7 combination was **dry-run-verified to resolve cleanly** (exit 0, no peer warnings). Migrating a 69-file, zero-test client onto three simultaneous ecosystem rewrites maximises the chance that a failure is a *tooling* failure rather than a *migration* failure. Vite 8 is a clean follow-up once tests exist.

### Q13 — Is production Node or Bun? **NON-BLOCKING — task 01**

`node` is not on PATH (`which node` → not found) yet `server/package.json` declares `"start": "node dist/index.js"`. This determines whether `vite@7`'s `node ^20.19 || >=22.12` engine constraint and Vitest's `node ^20 || ^22 || >=24` matter at all.

*Assumption:* development is Bun-only and `start` is a stale production script. Task 01 changes it to `bun dist/index.js`.

### Q14 — Does root `sharp@0.34.5` have an off-repo consumer? **NON-BLOCKING — task 04**

Verified unreferenced by any code or script; the only hit outside `server/` is the declaration itself. It is an unused, exactly-pinned, ~100 MB-class native dependency.

*Assumption:* dead — remove it. Trivially reversible.

### Q15 — Are `lucide-react` icon names stable across 0.575 → 1.31? **NON-BLOCKING — deferred**

The peer range is React-19-safe at both versions, but renamed or removed icon exports are a real 1.0 hazard.

*Assumption:* **defer the upgrade** until after the tree is green, so any missing export surfaces as an unambiguous compile error. It is not scheduled in this plan; file it as follow-up.

### Q16 — Should `ai-service`'s Python dependencies be pinned? **NON-BLOCKING — deferred out of scope**

`ai-service/requirements.txt` has 9 dependencies and `requirements-proxy.txt` has 4, **all completely unpinned — not one `==`, `>=` or `~=`**. `torch`/`torchvision` unpinned is the highest single risk (~2 GB CUDA-linked wheels with a strict compatibility table). `numpy` + `opencv-python` + `torch` unpinned is the classic ABI-mismatch triangle. `gdown` is installed imperatively by `setup.sh:10` and declared nowhere.

**The GPU path cannot be exercised on this machine** — `setup.sh:8` branches on `nvidia-smi` and this is Darwin/arm64, so it always takes the proxy branch and **never installs `torch` at all**.

*Assumption:* **defer.** Authoring pins that cannot be tested is worse than none. Minimum viable action, for whenever a GPU host is available: `pip freeze` the working GPU environment into a `requirements.lock` so the working combination is recoverable. `ai-service/` has its own lifecycle.

### Q17 — Does the owner want CI? **NON-BLOCKING — not scheduled**

There is no `.github/` and no CI config anywhere. For a solo repo with a `bun run verify` habit, skipping CI is defensible.

*Assumption:* **not scheduled in this plan.** Every wave gate works locally. If wanted, it should be Bun-based (no `node` on PATH, so a Node-based CI would test a runtime nobody uses) and report-only rather than merge-blocking at first. Note that per Q10 there are **no lockfiles**, so a CI job must never use `--frozen-lockfile`; reproducibility comes from the exact versions pinned in `package.json`.

### Q18 — Was `client/tsconfig.tsbuildinfo` committed deliberately? **NON-BLOCKING — task 01**

It is tracked by git and not gitignored. It is very likely why one audit measured 56 type errors where a clean run measures 29.

*Assumption:* accidental. `git rm --cached` plus gitignore. Trivially reversible.

---

## 3. Store architecture

### Q19 — `SessionStore`: build it now, or defer? **NON-BLOCKING — task 14. Recommendation: build it now.**

*(Named in the planning brief as a question the owner should see.)*

**The measured facts:** there is **no auth, no user, no profile, no login, no session token and no multi-user concept** anywhere in `client/`, `server/` or `ai-service/`. The server is a local Express app writing JSON files.

**But "none today" is not "nothing to hold."** `SessionStore` has **five real tenants on day one**:

| Tenant | Currently | Why SESSION |
| --- | --- | --- |
| `saveStatus` | `EditorState` (`storeTypes.ts:80`), read **only** by `Header.tsx` | the state of the app's link to its backend — not domain data, not view state |
| `aiServiceUrl` | inside the **serialized** `Project` | app-level config, so `SessionStore` is the right **read** source. Per Q2 it **stays** in the serialized `Project` — only the read source moves. |
| `layerClipboard`, `timelineCellClipboard` | `EditorState` | they **deliberately outlive the project** — nothing in `projectActions` clears them, and `copyLayerFromObject` exists precisely to move layers between objects. Because this design's `UIStore` **is** project-scoped, leaving them there would silently break cross-project copy |
| `colorHistory` | `EditorState`, capped at 10 | a cross-project preference trail, meaningless to any single view |

*Assumption:* create it now, as a thin but **non-empty** store (task 14). An empty placeholder would be a smell; this one is not empty. (Note: per the owner's Q2 decision, `aiServiceUrl` does **not** move out of `Project` — `SessionStore` becomes its read source while the value keeps round-tripping to the project file. The other four tenants are unaffected.)

**Explicitly deferred — do NOT build:** auth, user, profile, permissions, tokens, multi-user, or a connection/online model. There is no requirement and no evidence one is coming. The auth seam is designed (it would add `user` + `authStatus` to `SessionStore`, a `reaction` calling `domain.reset()` on logout, an auth-header injector in `httpClient`, and an `"unauthorized"` `ApiErrorKind` reusing the existing `saveSuspended` mechanism) — **but not built.**

*If the owner prefers to defer:* proceed with `ApplicationStore = { DomainStore, UIStore }`, but the clipboards **must** be documented as "never reset on project switch" — that is a correctness issue independent of where `SessionStore` lands. (`aiServiceUrl` stays in the persisted `Project` either way, per Q2.)

### Q20 — Should palette edits become undoable? **NON-BLOCKING — preserved as-is**

All 5 `paletteActions` pass `trackHistory=false`, so creating, renaming or deleting a palette, and adding or removing a colour, **cannot be undone**. Palettes are user-authored content, unlike everything else in the non-undoable bucket (tool, zoom, panel toggles). It looks like an oversight, but it is long-standing behaviour.

*Assumption:* **preserve exactly** during the migration (tasks 17, 23). Changing it mid-migration would make undo regressions ambiguous. The command architecture makes it a ~5-line change afterwards.

### Q21 — Should `undo` still trigger an immediate save? **ANSWERED — task 17. Deliberate, accepted behaviour change.**

Today it does (`projectActions.ts:224`). Under `HistoryStore`, `isReplaying` blocks the save reaction during replay, so the **next real edit** saves instead.

**OWNER DECISION (2026-08-16): accepted.** No immediate save on undo; `isReplaying` guards the save reaction; the next real edit saves. This matches the plan's assumption. Task 17 now states it as a **settled, deliberate, user-visible behaviour change** rather than an assumption, and must call it out in its completion report. The reversal remains a one-line change if it is ever wanted: clear `isReplaying` before the final version bump in `undo()`.

### Q22 — What is the correct history byte budget? **NON-BLOCKING — task 17**

`MAX_HISTORY = 100` counts entries, but measured entry cost ranges from ~40 bytes (one pixel via an inverse patch) to **6.9 MB** (a full snapshot for `resizeObject`). A count cap is meaningless across that range — today it means **~680 MB** at cap.

*Assumption:* **64 MB**, configurable through `ApplicationStore`'s options. That allows roughly 50,000 pixel-level undos or 9 full snapshots. Expose `historyBytes` in dev to gather real numbers.

### Q23 — Should the 4 mis-declared `CompactUIState` fields start persisting? **NON-BLOCKING — resolved by tasks 02 and 13**

`lightGridMode`, `layerSelectionCounter`, `referenceImagePanelPosition` and `referenceImagePanelMinimized` are present in `UIState` but were absent from `CompactUIState`. They survived only via `projectToCompact`'s `...spread`.

*Assumption:* they **should** persist — clearly the intent, since `lightGridMode` is even read back at `types/index.ts:967` and `layerSelectionCounter` is read by `FrameTimeline.tsx`. Task 02 declared `lightGridMode`; task 13 declares the other three. Task 24's explicit builder makes hiding them impossible going forward.

### Q24 — Are `Project.uiState` and `EditorState`'s UI fields split by persistence or by nature? **NON-BLOCKING — informs task 24**

There is **no discernible principle**. `zoom`, `panOffset` and `focusMode` live in the saved `Project`; `referenceOverlayOffset`, `frameOverlayOffset` and `colorHistory` do not — despite being the same kind of thing. `uiState.bitDepth` is written by `setBitDepth` and read by **nobody**.

*Assumption:* preserve the current persistence behaviour **field for field** (the wire format must not change) and treat rationalising it as separate follow-up. `UIStore` therefore needs an explicit "persisted" vs "ephemeral" partition, because the current boundary is arbitrary but load-bearing.

### Q25 — Do domain sub-stores mutating one shared tree feel right? **NON-BLOCKING — task 23**

`ObjectStore`, `FrameStore`, `LayerStore`, `VariantStore`, `PixelStore` and `PaletteStore` are behaviour modules over `DomainStore`'s tree, not owners of their own slices.

*Assumption:* proceed. The alternative was rejected because `variantActions` mutates `objects` **and** `variants` in the same operation, so splitting the data would recreate the cross-module edge as a cross-store write. The shared tree keeps one `pixelVersion`, one serializer and no cross-store writes. Revisit only if a sub-store starts needing its own lifecycle.

### Q26 — Is `mobx-utils` acceptable as a dependency? **NON-BLOCKING**

`computedFn` would be useful for parameterised computeds (`compositedFrame`, `layerThumbnail`, `layerColors`). The client currently has four production dependencies and is clearly kept lean; the migration already adds `mobx` + `mobx-react-lite`.

*Assumption:* **not installed in this plan.** No task requires it. If a later task wants it (~3 kB gz), it can be added then, or a `Map`-keyed memo hand-rolled with explicit invalidation on `pixelVersion` — more code, same result, and it must then be unit-tested for leaks (a `layerThumbnail` cache is 360 keys on the measured project and would accumulate across project switches without an explicit `clearCache()`).

### Q27 — Is `ModalUIStore` wanted at all? **NON-BLOCKING — not scheduled**

No modal state exists in the store today; it is roughly 31 local `useState` calls across 31 component folders.

*Assumption:* **defer past this plan.** It is new scope inside a refactor, and container/presentational separation may prefer modal state to stay component-local. The lint-rule half of that proposal is **not** deferred — task 05 installs the boundary rules.

---

## 4. API and persistence

### Q28 — Do the backups actually contain pre-migration formats? **ANSWERED BY MEASUREMENT (2026-08-16) — task 07 UNBLOCKED. The answer CONTRADICTS the plan's assumption.**

All 9 gzipped archives under `server/src/data/backups/` were decompressed and classified directly.

**MEASURED FINDINGS:**

| Signal | Result |
| --- | --- |
| Total snapshots | **149**, across all 9 archives (01-31-2026 → 02-25-2026, plus the 07-28-2026 directory) |
| `"variantGroups"` | **0 occurrences** → M6 (object→project variants) already applied everywhere |
| `"variantOffset"` | **0 occurrences** → M5 already applied everywhere |
| Pixel encoding | `[color, normal, height]` **tuples throughout**; verified non-zero samples `[1883250943,8848702,1]` (01-31-2026) and `[336530175,0,0]` (02-25-2026) → M2 (legacy scalar → tuple) already applied everywhere |
| `"baseFrameOffsets"` | **present throughout** (1,315 in the oldest archive) → M4 already applied |
| `"version"` | **`"1.1.0"` in every archive** |

**CONCLUSION: no pre-migration data survives anywhere in this repo. The oldest backup is already fully migrated.**

**Consequences, all written into task 07:**

- Task 07 **can no longer "decompress and classify to find real pre-migration samples" as its first act** — that work is done and the answer is *none exist*. It must not be repeated.
- Task 07 must **hand-author synthetic fixtures for ALL of M1–M8, from the migration code itself.**
- The real archives remain useful **only as a post-migration round-trip corpus**: assert `compactToProject(projectToCompact(p))` is stable across all 149 snapshots. That is genuinely valuable and cheap — **keep it.**
- **Critical knock-on for Q31**, recorded there.

### Q29 — Should the pre-migration backup be blocking rather than best-effort? **NON-BLOCKING — task 16**

`api.ts:211-219` POSTs a backup before any migration but wraps it in its own try/catch, so **the migration proceeds even if the backup fails**. The one safety net before a destructive schema migration is best-effort.

*Assumption:* **keep it best-effort**, matching today. Making it blocking means a user with a full disk or a down server cannot open their project at all — a product decision, not a refactor. Recorded as follow-up.

### Q30 — Should the two divergent implementations of the object→project variant migration be reconciled? **NON-BLOCKING — deliberately deferred**

Migration M6 exists twice: `api.ts:112-145` is a pure re-parent, while the copy inside `compactToProject` (`types/index.ts:882-937`) **additionally** rewrites each variant layer's `variantOffsets` from `baseFrameOffsets[frameIndex]` (line 917). Which runs depends on the entry point. During a normal load `api.ts` runs first and strips `variantGroups`, so the `types/index.ts` branch is dead — **but `compactToProject` is also the clone primitive for undo**, so on a project loaded by some other path the two could diverge.

*Assumption:* **both stay.** Task 07 pinned the difference with a test; tasks 13 and 16 move both verbatim. Reconciling is a semantic change to migration code and belongs in its own task, after the corpus tests are green.

### Q31 — Should the known migration bugs be fixed? **ANSWERED (via Q28) — pinned, not fixed, and hardened**

Four measured defects, all currently pinned as characterisation tests by task 07:

- **M2 is not array-safe** — given an already-migrated `[c,n,h]`, `migrateLegacyPixel` returns `[[c,n,h], 0, 1]`, a nested array. Re-running corrupts data. (The server's `normalizePixel` **is** array-safe and is the reference implementation.)
- **M2's detection samples exactly one pixel** — the first non-zero pixel of `objects[0].frames[0].layers[0]`. A file where object 0 is migrated but object 3 is legacy reports non-legacy, so **object 3's pixels are never migrated**.
- **M4 hard-codes `10`** — a project with more than 10 base frames gets no `baseFrameOffsets` entries beyond index 9, silently falling back to `{0,0}`.
- **M5 drops offsets silently** — a layer with `variantOffset` but no `selectedVariantId` is left unmigrated forever and its offset is ignored by the renderer.

**HARDENED BY Q28's MEASUREMENT (2026-08-16): pin them, do not fix them — and the bar for any future fix is now higher.**

Because **no real pre-migration data exists anywhere in the repo** (Q28), these four bugs **cannot be validated against real data at all**. The "pin, don't fix" stance therefore hardens rather than softens:

- **Pinning stays.** No task in this plan fixes any of them, and task 07's `// BUG:` comments must say so explicitly rather than naming a task that will flip them.
- **Any future fix requires a hand-authored synthetic corpus first, plus explicit owner sign-off.** It is not something a later task may take on opportunistically.

Stated explicitly in task 07 and in MASTER.md §9.13 and R1.

### Q32 — Is `zod` (or any runtime schema validator) acceptable on the client? **NON-BLOCKING — not adopted**

A `shared/` Bun workspace exporting Zod schemas was proposed as the single source of truth for the 9 project-schema types duplicated between client and server, the 14 export-format types duplicated between the server and its published `lib/`, and the 3 AI-job schemas defined in 3 places across 2 languages. It would have caught two measured runtime shape bugs that types alone cannot.

*Assumption:* **not in this plan.** The client has exactly four production dependencies and is clearly kept lean; adding a runtime dependency plus a new workspace package is a significant structural change. Task 15 builds the typed API layer **without** runtime validation, which captures most of the benefit (one `fetch` site, typed errors, timeouts, no fabricated values). The duplication is documented in task 11 with cross-referencing comments. Revisit as its own initiative.

### Q33 — Is `server/exports/lib/` consumed by an external repo? **CONFIRMED (2026-08-16) — blocks only an unscheduled follow-up, not any task in this plan**

The export generates a typed `index.ts` for downstream game code. **The server's `CompactFrame` omits `tags?: string[]` that the client's has, so exported `frames.json` loses all frame tags** — and `Base Unit.json`'s frames **do** carry tags.

**OWNER CONFIRMATION (2026-08-16): `server/exports/lib/` IS consumed by external game code.**

Therefore:

- **Task 11 stays explicitly forbidden from restoring frame tags.** Doing so would change a published format that external code parses.
- The fix needs a **coordinated 2.0.0 version bump keeping the v1 parser registered** at `parse-pixel-project.ts:47` (which already supports multi-version dispatch).
- **Filed as a follow-up requiring owner sign-off. It is not scheduled in this plan, so it blocks no task here.** This is the only remaining blocking item, and what it blocks is unscheduled work.

### Q34 — Is multi-tab editing a supported scenario? **NON-BLOCKING — not addressed**

`POST /api/project` has no ETag, no `If-Match` and no version check. Two browser tabs on the same project silently clobber each other; the loser's work is recoverable only from a ≤5-minute-granularity backup.

*Assumption:* single-tab. **Do not build optimistic concurrency in this refresh.** If it becomes a requirement, the cheapest fix is an `ETag`/`If-Match` using the md5 the server already computes for backup deduplication.

### Q35 — Should `POST /api/project/backup` overwrite, number, or refuse on a second migration? **NON-BLOCKING — not addressed**

It writes `<name>.migration-backup.json` **only if absent**, so a *second* migration finds the file present and **does not back up** — the pre-second-migration state is never captured.

*Assumption:* a numbered series (`<name>.migration-backup.<schemaVersion>.json`) would be right, but no task implements it. File as follow-up.

### Q36 — Should the AI health check stop lying? **NON-BLOCKING — partially addressed**

In proxy mode with `AI_REMOTE_URL` unset, the Python service returns `{"status":"ok","mode":"proxy","remote_configured":false}` at HTTP 200. Express forwards it and the header shows **"Connected"** — then every job fails. `remote_configured` is never read anywhere in the client.

*Assumption:* task 15 **surfaces `remote_configured`** in `AiHealthResult` so a consumer can distinguish, but **does not change the Python service**. Fully fixing the honesty problem (returning real status codes from the proxy) is server-side work outside this plan's client focus. File as follow-up.

### Q37 — Should `DELETE /api/ai/jobs/:jobId` and `GET /api/ai/dashboard` be proxied? **NON-BLOCKING — not scheduled**

Both exist on the Python side but Express exposes neither, so **the client cannot cancel a job.** Task 15's `aiApi.pollJob` bounds the client-side poll with a required `AbortSignal`, which stops the *polling* — but the server-side job is orphaned and keeps running.

*Assumption:* the abort is sufficient for now. File the proxy routes as follow-up.

---

## 5. Component architecture

### Q38 — Should `ui/` be forbidden from importing domain types entirely? **NON-BLOCKING — task 05/19**

This plan bans domain types in `ui/primitives/` but allows them in `ui/components/` and `ui/layouts/` — that is what makes the Components tier "domain-aware but pure."

*Assumption:* proceed as written. Banning `Layer`/`Frame` from `ui/components/` would force every component to re-declare structural clones of the domain types, which is strictly worse. **The locked decision is about *state*, not *types*.**

### Q39 — Should layouts take regions as `ReactNode` or as data? **NON-BLOCKING — task 37**

*Assumption:* `ReactNode` injection — 14 props for `PixelStudioLayout` instead of ~40, and it preserves MobX's per-region `observer()` granularity so each region re-renders independently. The cost is that a layout story shows stubs rather than the real thing, which is correct: a layout story verifies *arrangement*, not every child.

### Q40 — Should the `Modal` primitive mandate `isOpen`? **NON-BLOCKING — task 19**

Measured: 8 modals early-return on `isOpen`; **6 take no `isOpen` prop at all** and rely on conditional parent mounting (`AddVariantModal`, `CopyFromModal`, `ObjectSelectModal`, `VariantSelectModal`, `BrowseBackupsModal`, `ProjectSelectModal`).

*Assumption:* `isOpen` optional, defaulting to `true`, so all 6 keep working unchanged. ⚠️ **Migrating any of those 6 to `isOpen` changes its unmount timing** — state it currently discards on unmount would persist. Each migration must be reviewed individually.

### Q41 — Is accessibility in scope? **ANSWERED — built into the primitives; the build GATE is cancelled**

Measured today: **0 of 14 modals have `role="dialog"`, 0 have `aria-modal`, 0 trap focus, 12 ignore Escape.** The only `aria-label` in the set is at `FrameTagsModal.tsx:177`. Three toggles in `LayerColors` are keyboard-inoperable (`:169-180`, `:197-208`, `:254`).

**OWNER DECISION (2026-08-16): keep the a11y addon advisory (`test: "todo"`) INDEFINITELY. This DIFFERS from the plan's assumption**, which was to promote it to `test: "error"` once the primitives landed in task 19. **That promotion is CANCELLED.**

What this changes:

- **Task 10:** the Storybook a11y addon stays at `test: "todo"` **permanently**.
- **Task 19:** the step promoting it to `"error"` is **removed**. The primitives still **build in** accessibility — `role="dialog"`, `aria-modal`, focus trap, Escape handling — and that work is **unchanged**, still fixing **14 modals, 9 toggles and 142 tooltips** as they are adopted. Only the build-failing **gate** is dropped. Task 19 still runs the checks and reports zero violations as information.
- **Task 36** still fixes the keyboard-inoperable `LayerColors` toggles (`:169-180`, `:197-208`, `:254`).
- **Task 38 and MASTER.md:** verified — **no wave gate anywhere depends on a11y violations failing a build.** MASTER's W12 gate was reworded accordingly, and `bun run verify` has no a11y component.

### Q42 — Is the 94-story target realistic? **NON-BLOCKING**

*Assumption:* treat the **primitives** (task 19, 18 stories) as the only mandatory wave — that is where stories pay for themselves, since one `Button` story replaces 197 call sites' worth of visual review. Component and layout stories are valuable but individually droppable if a wave runs long. **Do not drop the primitives.**

### Q43 — Should containers be one-per-component? **NON-BLOCKING — task 36**

*Assumption:* one per component (roughly 41 total, about 6 of them trivial pass-throughs). MobX's `observer()` granularity is the whole performance argument for the migration; coarse containers throw it away. The 6 trivial ones cost ~10 lines each and keep the rule uniform — "every store-coupled component has exactly one container" needs no exceptions.

### Q44 — Is the touch/mouse eraser drift a bug or a deliberate shortcut? **ANSWERED — task 31 fixes it**

`Canvas.tsx`'s `handleTouchStart` eraser path (lines 2766-2772) **omits the bounds `.filter()`** that the mouse path applies (lines 2217-2222) — a latent out-of-bounds write on touch.

**OWNER DECISION (2026-08-16): fix it — unify onto mouse behaviour.** This matches the plan's assumption. Task 31 applies the bounds `.filter()` from the mouse path (`Canvas.tsx:2217-2222`) to the touch path (`Canvas.tsx:2766-2772`), closing the latent out-of-bounds write. **Touch behaviour changes**, so task 31 must call this out explicitly in its verification as a **manual check on a touch device**, and state it in its completion report.

### Q45 — Should the client and server share the 4-level variant-offset rule? **NON-BLOCKING — task 11/30**

The rule is duplicated **6×**: `Canvas.tsx:541,663,1113,1390,1915` and once in the server export path.

*Assumption:* duplication across the package boundary is acceptable for now — no shared package exists (see Q32). Task 30 unifies the **five client copies** into one module; task 11 keeps the server copy and adds a comment pointing at the client. A shared `packages/domain` is a possible future item.

### Q46 — Should the 4 `squash*` variants be collapsed? **NON-BLOCKING — deferred within tasks 25/35**

*Assumption:* task 25 ports all four **faithfully** (so task 08's pinned differences hold), and task 35 collapses only the **call-site** callbacks into 2 parameterised by scope. Collapsing the store actions themselves is follow-up.

### Q47 — Should `flipHorizontal` and `flipVertical` be unified? **NON-BLOCKING — task 27**

They are 280 lines of mirror-image copies of each other.

*Assumption:* **do not unify in this plan.** Task 08 pinned `flipH ∘ flipH = identity` and that H and V agree modulo transpose; task 27 ports both faithfully. Unifying into one `flipAxis(axis)` is follow-up.

---

## 6. Testing and verification

### Q48 — Is a canvas-rendering dependency acceptable? **NON-BLOCKING — tasks 06/08/30**

jsdom has no canvas, so `ctx`-taking renderers cannot be unit-tested without one (`@napi-rs/canvas` or `canvas`), and neither is in the verified dependency matrix.

*Assumption:* **no new dependency.** Structure the extracted renderers to take and return **`ImageData`-like buffers** rather than a `ctx`, and assert on a hash of the `Uint8ClampedArray`. Chrome-drawing renderers (marching ants, lasso, origin cross) fall back to manual review. Revisit if that proves too restrictive.

### Q49 — Is Storybook + manual review sufficient instead of visual-regression tooling? **NON-BLOCKING — resolved**

Two audits recommended Storybook **before** the CSS token substitution; a third rejected Chromatic and `@storybook/test-runner` on measured grounds (a hosted subscription plus CI that does not exist; a ~300 MB Playwright download for a repo with zero tests). **This plan does both:** task 10 schedules Storybook before task 12's substitution, and no visual-regression service is installed.

*Assumption:* the substitutes are sufficient — Storybook for human review, primitive DOM snapshot tests (task 19), and canvas pixel hashing (task 06). **This is a deliberate re-evaluation point:** if the primitive set grows past ~15 components with multiple variants each, `@storybook/test-runner` becomes worth its ~3 hours.

### Q50 — Should `noUncheckedIndexedAccess` be enabled? **NON-BLOCKING — explicitly deferred, task 38**

This codebase indexes `pixels[y][x]` end to end — every renderer, `drawingUtils.ts`, `previewRenderer.ts`, `lightingRenderer.ts`, `edgeInterpolate.ts`, and the canvas pointer code. Enabling it makes every one of those `PixelData | undefined`: realistically **several hundred** new errors, concentrated in exactly the files being split.

*Assumption:* **do not enable in this plan.** Task 38 explicitly forbids it. It should be enabled **per directory** as its own sequence of tasks — `src/types/` and `src/stores/` first (cheap and most valuable), canvas render code last — with a stop rule of "if a directory produces >100 errors, split it further."

### Q51 — Should `exactOptionalPropertyTypes` be enabled? **NON-BLOCKING — recommend never, during this refresh**

It interacts badly with this specific codebase: `migrateLayerVariantOffset` (`types/index.ts:843-864`) **deliberately sets `variantOffset: undefined`** as its migration signal, and `layerToCompact` relies on `if (layer.variantOffset)` dropping it. Under the flag that becomes a type error and the migration must be rewritten to `delete` the key — **a behaviour-affecting change to migration code.** The `Compact*` interfaces are optional-property-heavy for the same reason.

*Assumption:* **do not adopt.** Task 38 forbids it. Revisit only once the migrations have full corpus coverage and a dedicated task.

### Q52 — Should `max-lines` become an error? **NON-BLOCKING — task 38**

*Assumption:* `warn` at 400 globally, `error` inside `ui/`. Task 38 records the current finding count as a budget so a future task can ratchet it down. **Do not flip it to a global error** while any file is legitimately over.

### Q53 — Does `server/` need a full test harness? **NON-BLOCKING — tasks 06/11**

*Assumption:* **minimal only.** Task 06 adds a bare `server/vitest.config.ts` (node environment) solely to host the server-side migration test (task 07) and the export unit tests (task 11). Do not build out a server test harness beyond that in this refresh.

### Q54 — Should pre-commit hooks be added? **NON-BLOCKING — not scheduled**

*Assumption:* **no.** For a solo repo mid-refactor, a hook that reformats or lints on every commit fights the deliberately-staged Prettier sweeps. Revisit if a second developer joins — at that point husky + lint-staged becomes right, and the sweeps will be long done.

### Q55 — Is `client/lib/` public API? **NON-BLOCKING — treated as yes**

It holds 12 exported types unused within the repo and is copied **verbatim** into every export.

*Assumption:* **yes, public API.** Task 02 is forbidden from deleting anything under it, task 05 excludes it from Prettier, and task 38 re-states the prohibition.

---

## Summary of blocking items

**ZERO blocking questions remain against any scheduled task. The plan is ready to execute.**

| # | Question | Blocked | Status |
| --- | --- | --- | --- |
| Q1 | Which red — `#ff3366` or `#ef4444`? | task 12 | ✅ **ANSWERED 2026-08-16** — `#ff3366` (the token); the 12 `#ef4444` literals are drift. Matches the assumption. Task 12 unblocked. |
| Q2 | Remove `aiServiceUrl` from the wire format? | task 24 | ✅ **ANSWERED 2026-08-16** — **no, keep it in the project file.** *Inverts* the assumption. No deliberate wire-format change remains anywhere in the plan; task 07's fixtures need no re-bless. Task 24 unblocked. |
| Q3 | Unify the two canvases' grid alpha? | task 30 | ✅ **ANSWERED 2026-08-16** — unify onto `Canvas` (alpha `0.05`, `lightGridMode` honoured). Matches the assumption. Task 30 unblocked; screenshots still required. |
| Q10 | Was `bunfig.toml`'s lockfile disabling deliberate? | task 01 | ✅ **ANSWERED 2026-08-16** — **yes, and it is now standing policy: no lockfiles anywhere, exact versions pinned in `package.json`.** *Inverts* the assumption; task 01 was rewritten. Task 01 unblocked. |
| Q28 | Do the backups contain pre-migration formats? | task 07 | ✅ **ANSWERED BY MEASUREMENT 2026-08-16** — **no.** All 149 snapshots across 9 archives are already fully migrated. *Contradicts* the assumption; task 07 now hand-authors all M1–M8 fixtures and uses the archives as a round-trip corpus only. Task 07 unblocked. |
| Q33 | Is `server/exports/lib/` consumed externally? | *an unscheduled follow-up only* | ⚠️ **CONFIRMED 2026-08-16 — yes, external game code consumes it.** Task 11 stays forbidden from restoring frame tags. The fix needs a coordinated 2.0.0 bump keeping the v1 parser registered at `parse-pixel-project.ts:47`, filed as a follow-up requiring owner sign-off. **It blocks no task in this plan.** |

Also answered on 2026-08-16, though never blocking: **Q21** (undo save — accepted, matches the assumption), **Q41** (a11y gate stays advisory *indefinitely* — **differs** from the assumption, which was promotion to `test: "error"`; that promotion is cancelled), **Q44** (touch eraser — fix it, matches the assumption).
