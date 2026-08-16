# 07 — Characterisation: freeze the corpus, pin serialization and all 8 migrations

**Wave:** W5 · **Depends on:** 06
**Touches:** `client/src/test/__fixtures__/corpus/` (new, incl. a `README.md`) · `client/src/test/fixtures/projects.ts` (new) · `client/src/types/__tests__/roundtrip.test.ts` (new) · `client/src/types/__tests__/migrations.test.ts` (new) · `client/src/types/__tests__/__snapshots__/` (new, committed) · `client/src/services/__tests__/loadProject.test.ts` (new) · `server/src/__tests__/normalizePixel.test.ts` (new) · `.prettierignore` (verify corpus exclusion)
**Effort:** L

## Objective

After this task every schema migration and the compact serializer are pinned by tests that assert **what the code does today, bugs included**, with committed golden snapshots for every surviving historical project file. This is the only thing standing between the owner's real art and a silent corruption during the store migration.

## Context

**This is the highest-value test file in the plan and it must land before anything restructures the serializer or the store.**

`server/src/data/Base Unit.json` is **1,129,965 bytes of the owner's actual work**, and `server/src/data/backups/` holds **9 gzipped archives** containing **149 snapshots** in total, spanning 01-31-2026 → 02-25-2026 plus a `07-28-2026` directory.

### ⚠️ MEASURED 2026-08-16 — no pre-migration data survives anywhere in this repo

All 9 archives were decompressed and classified before this task was written. **The answer, which contradicts the plan's earlier assumption, is that there is nothing pre-migration left to test against.**

| Signal | Result across all 149 snapshots |
| --- | --- |
| `"variantGroups"` | **0 occurrences** → M6 (object→project variants) already applied everywhere |
| `"variantOffset"` | **0 occurrences** → M5 already applied everywhere |
| Pixel encoding | `[color, normal, height]` **tuples throughout**. Verified non-zero samples: `[1883250943,8848702,1]` in `01-31-2026`, `[336530175,0,0]` in `02-25-2026` → M2 (legacy scalar → tuple) already applied everywhere |
| `"baseFrameOffsets"` | **present throughout** (1,315 occurrences in the oldest archive) → M4 already applied |
| `"version"` | **`"1.1.0"` in every archive** |

**The oldest surviving backup is already fully migrated.** Two consequences drive this task:

1. **This task does NOT begin by decompressing and classifying archives to find real pre-migration samples.** That work is done, and the answer is that none exist. Do not repeat it and do not spend time looking again.
2. **Every migration fixture for M1–M8 must be hand-authored synthetically, from the migration code itself.** Read each detector and transform, construct the minimal input that exercises it, and assert the observed output. There is no real-data corpus behind any of the migrations.

**The 149 real snapshots remain valuable — as a post-migration round-trip corpus, not a migration corpus.** Assert that `compactToProject(projectToCompact(p))` is stable across all 149. That is cheap, it is a genuine regression gate on the serializer, and it must be kept.

**Critical consequence for the four known migration bugs** (M2 not array-safe; M2 sampling one pixel; M4 hard-coding `10`; M5 dropping offsets silently): **they cannot be validated against real data, because no real pre-migration data exists.** The plan's "pin, don't fix" stance therefore **hardens** rather than softens. Pinning stays. **Any future fix requires a purpose-built hand-authored synthetic corpus first, plus explicit owner sign-off** — it is not something a later task may take on opportunistically.

Real user data did pass through every migration path below at some point; the older formats were live, not hypothetical. But no artifact of them survives.

**The round trip is load-bearing twice over.** `projectToCompact` → `compactToProject` is not only the save/load path — it is **also the deep-clone mechanism for undo**. `client/src/store/index.ts:63-64` and `:96-97` both do `compactToProject(projectToCompact(project))` to snapshot history, as do `projectActions.ts:182-183` and `:216-217`. **A field that does not survive the round trip is silently lost on undo, not just on reload.** One test file protects both subsystems.

### The governing principle

These tests encode **current** behaviour. Where a known bug exists, the test asserts the **buggy** behaviour and carries a `// BUG:` comment. A characterisation test that asserts the *desired* behaviour is just a failing test, and the first person who needs a green build will delete it.

Two kinds of `// BUG:` comment appear here and they say different things:

- **Bugs a later task fixes** — the comment names that task (e.g. R4 → task 13, L6 → task 14).
- **Migration bugs, which NO task in this plan fixes** — the comment must say so, and say why: no real pre-migration data survives to validate a fix against (measured 2026-08-16), so a fix needs a purpose-built synthetic corpus and owner sign-off first.

### The 8 migrations, with their exact locations

| # | Migration | Detector | Transform | Location |
| --- | --- | --- | --- | --- |
| **M1** | Expanded → compact detection | `isCompactFormat(data)` — checks `palettes[0].colors[0]` is a `number`, falling back to `typeof uiState.selectedColor === 'number'` | If false the payload is returned **as-is** as a runtime `Project` | `client/src/types/index.ts:1016-1035`, applied at `client/src/services/api.ts:194` |
| **M2** | Legacy pixel → tuple | `isLegacyCompactFormat(data)` | `migrateLegacyPixel`: `n → [n, 0, 1]` (**height defaults to 1, not 0**) | `types/index.ts:1039-1057` (detect), `:1060-1068` (transform), `:1071-1085` (`migrateLegacyLayer`), `api.ts:27-109` (`migrateLegacyProject`) |
| **M3** | Lighting-studio uiState defaults | none — unconditional `??` | ~20 field defaults | `api.ts:86-105` (bulk) **and** `types/index.ts:961-1007` (per-field) |
| **M4** | Variant frame `offset` → `baseFrameOffsets` | `!baseFrameOffsets \|\| Object.keys(...).length === 0` | back-fills indices `0..max(frames.length, 10)` | `types/index.ts:806-825` |
| **M5** | Layer `variantOffset` → `variantOffsets` | `layer.isVariant && layer.selectedVariantId && layer.variantOffset && !layer.variantOffsets` | `variantOffsets = {[selectedVariantId]: variantOffset}`, then `variantOffset = undefined` | `types/index.ts:843-864`, applied at `:951` |
| **M6** | Object-level `variantGroups` → project-level `variants` | `needsVariantMigration(data)` | hoist + de-dupe by `vg.id` | `api.ts:15-24` + `api.ts:112-145` **and, independently,** `types/index.ts:867-938` |
| **M7** | Server-side legacy pixel normalise | inline | `normalizePixel`: `number → [n,0,1]`, arrays returned unchanged | `server/src/routes/export.ts:412-418` |
| **M8** | Export-time `variantOffset` → `variantOffsets` | inline | keys on `layer.selectedVariantId ?? ""` | `server/src/routes/export.ts:576-580` |

### The four bugs that must be pinned, not fixed

1. **M2 is not array-safe.** Given an already-migrated `[c,n,h]`, `migrateLegacyPixel` hits `legacyPixel === 0` → false, then returns `[[c,n,h], 0, 1]` — a **nested array**. Re-running it corrupts data. Assert the nested-array output explicitly.
2. **M2's detection samples exactly one pixel** — the first non-zero pixel of `objects[0].frames[0].layers[0]`. A file where object 0 is migrated but object 3 is legacy is reported as non-legacy, so **object 3's pixels are never migrated**. Build a synthetic mixed fixture and assert `false`.
3. **M4 hard-codes `10`.** A project with 14 base frames and a 3-frame variant gets no entries for indices 10-13. Assert `Object.keys(map).length` is exactly what it is today.
4. **M6 has two divergent implementations.** `api.ts:112-145` is a pure re-parent; `types/index.ts:882-937` *additionally* rewrites each variant layer's `variantOffsets` from `baseFrameOffsets[frameIndex]` (line 917). Run **both** on the same fixture and assert their outputs differ in that documented way. Pinning the difference is what makes deleting one safe later. Also assert: two objects carrying variant groups with the **same `vg.id` but different content** → the second is silently discarded (`api.ts:54-57`, `:127-130`).
5. **M5 drops offsets silently.** A layer with `variantOffset` but **no** `selectedVariantId` is left unmigrated forever and its offset is ignored by the renderer. Assert that.
6. **M8 emits an empty-string key.** A layer with `variantOffset` and no `selectedVariantId` produces `{"": {x,y}}` in the exported JSON. Assert it.

### Three additional fields silently dropped on save

Present in `UIState` but absent from the `CompactUIState` interface (`types/index.ts:612-663`): `referenceImagePanelPosition` (`UIState:171`), `referenceImagePanelMinimized` (`UIState:172`), `layerSelectionCounter` (`UIState:153`). `projectToCompact` spreads `...project.uiState` (line 754), so they *are* written to JSON at runtime despite the type — but the type contract says they do not exist. `layerSelectionCounter` is read by `FrameTimeline.tsx`. (`lightGridMode` was the fourth; task 02 already declared it.)

## Steps

### Step 0 — freeze the round-trip corpus (do this first; it is not a test)

```sh
cd /Users/diniden/Desktop/self/pixel-art
mkdir -p client/src/test/__fixtures__/corpus
cp "server/src/data/Base Unit.json"  client/src/test/__fixtures__/corpus/base-unit.json
cp "server/src/data/Test Blend.json" client/src/test/__fixtures__/corpus/test-blend.json
for f in server/src/data/backups/*.gz; do
  gunzip -c "$f" > "client/src/test/__fixtures__/corpus/backup-$(basename "$f" .gz).json"
done
```

**These files are a POST-migration round-trip corpus, not a migration corpus.** The classification work is already done (see Context): all 149 snapshots across all 9 archives are fully migrated — no `variantGroups`, no `variantOffset`, `[c,n,h]` tuples throughout, `baseFrameOffsets` present, `"version":"1.1.0"` everywhere. **Do not re-derive this.**

Write `client/src/test/__fixtures__/corpus/README.md` recording exactly that, verbatim, so the next reader does not repeat the search — including the explicit statement that **no migration in M1–M8 has any real-file coverage** and that every migration fixture in this task is synthetic.

Their job here is the **round-trip stability assertion**: `compactToProject(projectToCompact(p))` must be stable across all 149 snapshots. That is cheap and is a real regression gate on the serializer.

### Step 0b — hand-author the synthetic migration fixtures (all of M1–M8)

Because no real pre-migration sample exists, **every migration fixture must be constructed by hand from the migration code itself.** For each of M1–M8: read its detector and transform at the locations in the table above, build the minimal input that exercises it, run it, record the actual output, and assert that.

Name them `synthetic-<migration>-<case>.json` (or build them inline in the test file where they are small — inline is preferred for anything under ~30 lines, so the input and the assertion are read together). Cover at minimum:

- **M1** compact vs expanded detection, including the `typeof uiState.selectedColor === 'number'` fallback
- **M2** legacy scalar pixels; **plus the already-migrated array input** that produces the nested-array corruption; **plus the mixed fixture** where object 0 is migrated and object 3 is legacy
- **M3** a payload missing every defaulted field
- **M4** a project with **14 base frames** and a 3-frame variant — the `>10` edge the hard-coded `10` truncates
- **M5** a variant layer with `variantOffset` **and** `selectedVariantId`; and one with `variantOffset` and **no** `selectedVariantId`
- **M6** object-level `variantGroups`, run through **both** implementations; plus two objects with the same `vg.id` and different content
- **M7** server-side: a scalar pixel and an already-array pixel
- **M8** a layer with `variantOffset` and no `selectedVariantId`

Confirm `.prettierignore` excludes `**/__fixtures__/**` (task 05 added this). The corpus must never be reformatted.

### Step 1 — `client/src/types/__tests__/roundtrip.test.ts`

| # | Assertion |
| --- | --- |
| R1 | `compactToProject(projectToCompact(p))` deep-equals `p` for `createDefaultProject()` |
| R2 | Same, for a **hand-built** fixture with ≥2 objects, ≥3 frames, ≥4 layers, a variant group with 2 variants, frame tags, and a `referenceImage`. Hand-built, not loaded — loaded fixtures have already been migrated. |
| R3 | **Field-census test.** `expect(Object.keys(rt.uiState).sort()).toEqual(Object.keys(p.uiState).sort())`, **plus** a hard-coded list of every `UIState` key transcribed from `types/index.ts:125-195`. This is the test that would have caught `lightGridMode`. Write it as an explicit key list so that adding a field to `UIState` without adding it to `CompactUIState` **fails**. |
| R4 | `referenceImagePanelPosition`, `referenceImagePanelMinimized`, `layerSelectionCounter`: set each, round-trip, and assert **what actually comes back**. Run it first, record the observed value, assert that. `// BUG: absent from CompactUIState (types/index.ts:612-663) — task 13 declares them` |
| R5 | `projectToCompact` output is JSON-stable: `JSON.parse(JSON.stringify(c))` deep-equals `c`. No `undefined`/`Map`/`Set`/`NaN` leaks. (`migrateLayerVariantOffset` sets `variantOffset: undefined` at `types/index.ts:843-864`; this asserts it drops cleanly.) |
| R6 | Idempotency: `projectToCompact(compactToProject(c))` deep-equals `c` for every corpus fixture, after one normalising pass |
| R7 | Pixel codec exhaustive: `compactToPixelData(pixelDataToCompact(pd))` for `pd ∈ {EMPTY_PIXEL_DATA, colour-only, normal-only, height-only, all three, a=0, a=255}` (`types/index.ts:519-543`) |
| R8 | `hexToRgba(rgbaToHex(c))` for all 4 channels at 0/1/127/128/254/255 (`:485-504`) |
| R9 | `packedToNormal(normalToPacked(n))` for `DEFAULT_NORMAL`, `{x:-128,y:-128,z:0}`, `{x:127,y:127,z:255}`, `{x:0,y:0,z:0}` (`:505-518`) |
| R10 | Size guard: `JSON.stringify(projectToCompact(baseUnit)).length` within ±2% of the on-disk `Base Unit.json` size (1,129,965 bytes). A cheap canary that compaction did not silently stop compacting. |

### Step 2 — `client/src/types/__tests__/migrations.test.ts`

One `describe` block per migration M1–M6 (M7 and M8 go to the server file in step 4), asserting the behaviour and the bugs listed in Context. Plus:

- **Corpus golden snapshots:** `it.each(corpus)` — for each of the 149 real snapshots, run the `loadProject`-equivalent migration pipeline and `expect(result).toMatchSnapshot()`. **Commit the `__snapshots__` directory.** These snapshots are the actual regression gate. Note that because every real snapshot is already fully migrated, the pipeline is effectively a **no-op pass-through** for them — which is exactly the property being pinned.
- **Round-trip stability across all 149 real snapshots:** `compactToProject(projectToCompact(p))` is stable for every one. This is the real corpus's primary job.
- **Synthetic idempotency:** for each **synthetic** fixture, `migrate(migrate(x))` deep-equals `migrate(x)` — except where it provably does not, which is M2's nested-array corruption; pin the corruption. This is where the idempotency question actually has teeth, since the real files never re-enter a migration.
- **M3 cross-module equality:** assert the 7 shared defaults are equal between `api.ts:90-104` and `types/index.ts:969-997` — `studioMode:"pixel"`, `eraserShape:"circle"`, `pencilBrushShape:"square"`, `pencilBrushMax:16`, `traceNudgeAmount:10`, `normalBrushShape:"circle"`, `heightScale:100`. Write it as a cross-module assertion so that extracting one copy and forgetting the other fails.

Add this header to the file verbatim:

```ts
// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.
```

### Step 3 — `client/src/services/__tests__/loadProject.test.ts`

The migration *chain*, not the individual steps. Mock `fetch`; assert order and side effects.

| # | Assertion |
| --- | --- |
| L1 | Legacy compact file → the backup POST to `/api/project/backup` fires **before** any migration (`api.ts:209-220`) |
| L2 | Backup POST rejects → **migration proceeds anyway** and the load succeeds. `// BUG: best-effort backup, pinned deliberately. No task in this plan makes it blocking — that is a product decision (a user with a full disk could then not open their project at all), filed as follow-up.` |
| L3 | Legacy pixel format → `migrateLegacyProject` runs and `migrateVariantsToProjectLevel` does **not** (`api.ts:223-229` is `if`/`else if`) |
| L4 | New pixel format + object-level variants → only `migrateVariantsToProjectLevel` runs |
| L5 | Neither → no backup POST at all |
| L6 | **`fetch` throws → `loadProject` returns `createDefaultProject()` and logs.** `// BUG: highest-severity — silent data loss via the auto-save chain; task 14 fixes it` |
| L7 | 404 → `createDefaultProject()` **without** a backup POST |
| L8 | `isCompactFormat === false` → data returned raw as `Project` (`api.ts:235`) with no conversion |

L6 is the assertion that makes the highest-severity bug in the repo *verifiable*: `loadProject` swallows every failure and returns a blank default, which the store then hands to auto-save, which overwrites the user's real 1.1 MB project file with the blank one.

### Step 4 — `server/src/__tests__/normalizePixel.test.ts`

- **M7:** `number → [n,0,1]`; **`[c,n,h] → [c,n,h]` unchanged** (array-safe). This is the reference implementation M2 should have been.
- **M8:** a layer with `variantOffset` and no `selectedVariantId` → `{"": {x,y}}`. Assert the empty-string key.

## Constraints

- **Assert observed behaviour, never desired behaviour.** For every bug listed in Context: run the code, record what it actually returns, assert that, and attach a `// BUG:` comment. ⚠️ **No task in this plan flips any of them**, so the comment must say `// BUG: pinned deliberately — no real pre-migration data exists to validate a fix against (measured 2026-08-16). Fixing this requires a purpose-built synthetic corpus and owner sign-off.`
- **Do not fix any migration in this task, or plan for one to be fixed later in this plan.** No detector, transform, ordering, or default value changes. Not one. Because **no pre-migration data survives anywhere in the repo**, a migration fix cannot be validated against reality, and "pin, don't fix" is now a hardened position rather than a temporary one.
- **Do not spend time hunting for pre-migration samples.** All 9 archives were decompressed and classified on 2026-08-16 and none exists. Every migration fixture is hand-authored.
- **Do not run `vitest -u`.** Review every committed snapshot by eye once; after that they are frozen.
- Do not reformat the corpus. Confirm `.prettierignore` protects it.
- The corpus files are **copies**. Do not read from, write to, or modify anything under `server/src/data/`.
- **Memory:** do not write a test that fills undo history to `MAX_HISTORY = 100` with a realistic project — a runtime `Project` snapshot of `Base Unit.json` measures **6.9 MB**, so 100 of them is ~680 MB and will OOM the worker. That constraint applies to task 09, but the corpus fixtures are large and the same caution applies to any test that clones them repeatedly.
- These tests are written against a workspace where `tsc` is green (task 02 landed) but they must not depend on any later refactor.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx vitest run src/types/__tests__/roundtrip.test.ts        # exit 0
bunx vitest run src/types/__tests__/migrations.test.ts       # exit 0
bunx vitest run src/services/__tests__/loadProject.test.ts   # exit 0
cd ../server && bunx vitest run src/__tests__/normalizePixel.test.ts   # exit 0
# Corpus is present and every file is valid JSON:
cd /Users/diniden/Desktop/self/pixel-art
test "$(ls client/src/test/__fixtures__/corpus/*.json | wc -l)" -ge 11
for f in client/src/test/__fixtures__/corpus/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || exit 1; done
# Corpus is protected from formatting:
bunx prettier --check client/src/test/__fixtures__/    # exit 0 because ignored
# Coverage threshold for the serialization surface is now met:
cd client && bunx vitest run --coverage
```

Manual checks:
- Read `client/src/test/__fixtures__/corpus/README.md`. It must record the measured finding — **all 149 snapshots are already fully migrated; no migration has real-file coverage; every migration fixture is synthetic** — so that no future reader repeats the search.
- Review every committed snapshot by eye, once. They are the contract afterwards.
- For M6, run both implementations and record the concrete diff **as a comment in the test**, not just as an assertion.
- Confirm every `// BUG:` comment is correctly categorised: bugs a later task fixes name that task number; **migration bugs state that no task in this plan fixes them** and why.

## Definition of done

- [ ] All 9 backup archives decompressed, plus `Base Unit.json` and `Test Blend.json` copied; ≥11 corpus files total, carrying 149 snapshots.
- [ ] `corpus/README.md` records the 2026-08-16 measurement verbatim: 149 snapshots, zero `variantGroups`, zero `variantOffset`, `[c,n,h]` tuples throughout, `baseFrameOffsets` present, `"version":"1.1.0"` — therefore **no real-file coverage for any migration**, and every migration fixture in this task is hand-authored synthetic.
- [ ] **Hand-authored synthetic fixtures exist for all of M1–M8**, including M4's `>10 base frames` edge and M2's mixed-object case.
- [ ] The round-trip stability assertion runs across **all 149** real snapshots and passes.
- [ ] `roundtrip.test.ts` implements R1–R10, including the explicit `UIState` key-list census.
- [ ] `migrations.test.ts` covers M1–M6 with the 5 bugs pinned as observed behaviour against synthetic fixtures, plus committed corpus snapshots and the synthetic idempotency assertion.
- [ ] The `DO NOT run vitest -u` header is present in `migrations.test.ts`.
- [ ] `loadProject.test.ts` implements L1–L8, with L6 pinning the blank-default data-loss path.
- [ ] `server/src/__tests__/normalizePixel.test.ts` covers M7 and M8.
- [ ] Every `// BUG:` comment states that the behaviour is **pinned deliberately and no task in this plan flips it**, and that a fix requires a synthetic corpus plus owner sign-off.
- [ ] `src/types/**` coverage meets 90% statements / 95% functions.
- [ ] **No migration was changed by this task.**
