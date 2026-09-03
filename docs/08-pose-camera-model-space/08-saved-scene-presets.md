# 08 — Saved scene presets, persisted to the project

**Wave:** W6 · **Depends on:** 06, 07
**Touches:** `client/src/types/domain.ts` · `client/src/types/codecs/compactTypes.ts` · `client/src/stores/ui/PoseUIStore.ts` · `client/src/stores/ui/__tests__/PoseUIStore.test.ts` · `client/src/stores/ui/UIStore.ts` · `client/src/stores/ui/__tests__/persistedUIState.test.ts` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` · `client/src/ui/components/PosePanel/PoseSection.stories.tsx` · `client/src/ui/components/PosePanel/PosePanel.css`
**Effort:** L

## Objective

The owner saves the **entire pose scene** — camera settings *and* model orientation — as a named
preset, reloads the app, and selects it back. The advanced camera panel (task 06) and the Euler
inputs (task 07) get mounted and wired. And the confirmed iPad slider defect is fixed.

## Context

**The owner's words:** *"I want a way to save ALL orientations of camera settings and model to a
preset that I can reload easily."* (and the "save that matrix into a preset I can select" half of
the advanced-camera item).

### ⚠️ This is the only task in the plan that touches the persisted wire format. Read §4.6 of `MASTER.md` first.

**The good news, measured 2026-09-03 — and it overturns the obvious fear:** the 151 corpus
digests **do not run `toPersistedUIState()`**. The digest pipeline is
`digest(compactToProject(rawCorpusJSON))` (`migrations.test.ts:1009`), and
`grep -rn 'toPersistedUIState' client/src/types/__tests__/` returns **nothing**. So a
**conditionally-emitted** new key **cannot shift the digests** and needs **no migration** (F14).
Seven keys were added exactly this way: `railLayouts`, `theme`, `layoutPresets`, `viewZoom`,
`eyedropperMode`, `pencilOnly`, `hiddenRails`, plus `fillColor`.

**The bad news — three traps that WILL bite if ignored:**

1. ⚠️ **`key: undefined` is NOT the same as an absent key.** Measured and documented at
   `serialize.ts:103-112` and restated at `persistedUIState.test.ts:263-266`: the plain
   `key: undefined` form **changed all 11 corpus digests**; the conditional form left every
   snapshot byte-identical. **F13: emit through `assign()`, from a serializer that returns
   `undefined` when empty.**
2. ⚠️ **`persistedUIState.test.ts:613-643`** (`R3 — the builder against the real corpus`)
   hydrates **all 151 snapshots** and asserts the builder's **key set** exactly equals
   `projectToCompact()`'s. An **unconditional** key fails there 151 times. A conditional one
   passes, because neither side emits it.
3. ⚠️ **`persistedUIState.test.ts:267` asserts `expect(declared).toHaveLength(52)`**, reading
   `compactTypes.ts` from source at runtime. **Adding one field requires bumping it to 53** and
   adding the key to `fullyPopulatedProject()` (`:132-196`), or the test at `:276` fails.

**The analogue to copy — `layoutPresets`. Follow it piece for piece (F12/F15):**

| Piece | Location | What to mirror |
| --- | --- | --- |
| Wire type | `domain.ts:327-331` — `PersistedLayoutPreset {id, name, layout}` | **Wide** field types; a file may carry a preset from a newer build |
| Wire declaration | `compactTypes.ts:165` | optional (`?`) |
| Runtime declaration | `domain.ts:262` | with the "absent until the user saves one" rationale |
| Store field | `LayoutUIStore.ts:268`, `observableRef` `:285` | `observableRef`, replaced wholesale |
| Save | `saveCurrentAsPreset(name)` `:500-513` | trims the name, **no-ops on empty**, snapshots **by value** |
| Delete | `deleteLayoutPreset(id)` `:519-524` | filters; early-returns if nothing changed |
| Hydrate | `:534-542`, validator `narrowPresets` `:201-212` | assigned **unconditionally**, so absent-stays-absent survives a project switch |
| **Serialize** | **`toPersistedLayoutPresets()` `:564-570`** | **returns `undefined` unless non-empty — the F13 mechanism** |
| Builder line | `UIStore.ts:518-521` | one `assign(...)` call |

**The builder and the reader.** `toPersistedUIState()` is `UIStore.ts:349-557` (31 unconditional
keys `:377-417`; 21 conditional via `assign()` `:432-555`, helper `:656-664`). There is **no**
`fromPersistedUIState` — the reader is `UIStore.hydrate(ui)` at `:566-575`, fanning out to
`tool`/`viewport`/`layout` sub-stores. **A new key means editing the builder AND the owning
sub-store's `hydrate`.**

⚠️ **`PoseUIStore` is currently session-only (D6) and is not in that fan-out.** Adding pose
presets means pose state joins the persisted set for the first time. **Only the presets
persist** — the live `rotation`/`scale`/`pan`/`edgeWidth` stay session-only. Be explicit about
that boundary in the store's doc header, which currently states the opposite.

### What a preset contains

"ALL orientations of camera settings and model". At minimum: `projection`, `pitch`, `yaw`, `fov`,
`near`, `far`, the ortho box if present, the model's `rotation`, and `scale`. **Decide about
`pan`, `lightDirection`, `lightColor`, `edgeWidth` and `meshId`** — and document the choice.
Recommended: include light and mesh (they are part of "the scene"), exclude `pan` (it is framing,
not orientation). **Whatever you choose, a preset must restore a recognisable view.**

⚠️ **Version the preset shape loosely, not strictly** (F15): wide types on the wire, narrowed
once in `narrowPosePresets()`. A preset written by a newer build must not crash an older one —
that is what the `PersistedLayoutPreset` comment at `domain.ts:316-326` is about.

### Also in this task: the confirmed iPad fix

Plan 07 found, and deliberately did not fix, a real defect: **`.pose-panel__slider` has no
`touch-action: none`**, while `.direction-orb__sphere` (`PosePanel.css:257`) has it under a
comment calling it "THE TOUCH FIX, not a nicety". This plan adds more sliders and numeric fields,
so **fix it here**: add `touch-action: none` to the slider (and to any new draggable affordance).
⚠️ It remains **unverifiable without a device** — fix it, then list it as an owed check.

## Steps

1. **Read `MASTER.md` §4.6 in full**, then `LayoutUIStore.ts:200-215`, `:265-290`, `:495-575`, then
   `UIStore.ts:349-360`, `:432-440`, `:510-525`, `:556-575`, `:656-664`, then
   `persistedUIState.test.ts:230-280` and `:600-650`. **Do not write code until you have read the
   two tests that will fail if you get this wrong.**
2. **Read tasks 06 and 07's reports in `HANDOFF.md`** for the exact prop shapes you must mount.
3. **Define the preset type** in `domain.ts` — `PersistedPosePreset { id: string; name: string; … }`
   with **wide** field types — and declare it in `compactTypes.ts`. ⚠️ **Bump
   `expect(declared).toHaveLength(52)` → `53`** at `persistedUIState.test.ts:267` and extend
   `fullyPopulatedProject()` (`:132-196`).
4. **Add the store surface** to `PoseUIStore.ts`, mirroring `LayoutUIStore`:
   - `posePresets: PersistedPosePreset[] = []` (`observableRef`, replaced wholesale);
   - `saveCurrentAsPosePreset(name)` — trims, no-ops on empty, snapshots **by value**, generates
     an id;
   - `deletePosePreset(id)` — filters, early-returns if unchanged;
   - `applyPosePreset(id)` — restores every field the preset carries, as **one** coherent action;
   - `narrowPosePresets(raw)` — the validator, tolerant of unknown/newer fields;
   - `hydratePosePresets(ui)` — assigned **unconditionally** so absent-stays-absent;
   - **`toPersistedPosePresets(): PersistedPosePreset[] | undefined` — returns `undefined` when
     the list is empty.** ⚠️ This is F13 and the whole safety mechanism.
   Update the store's doc header: presets persist, live pose state does not.
5. **Wire it into `UIStore`** — one `assign(persisted, "posePresets", …)` line in the builder's
   conditional block, and a `hydrate` call in the fan-out at `:566-575`.
   ⚠️ **NEVER write `posePresets: undefined`.** Use `assign()`.
6. **Mount task 06's `CameraAdvanced`** in `PoseSection.tsx` and wire its `onChange` /
   `onSaveAsPreset` through `PixelStudioPanelContainer.tsx`. Mount task 07's Euler inputs if task
   07 did not already place them.
7. **Add the preset list UI** to the rail: a named list, select-to-apply, delete. Keep it pure —
   props in, callbacks out. The container reads `pose.posePresets` and calls the store actions.
8. **Fix the iPad slider**: add `touch-action: none` to `.pose-panel__slider` in `PosePanel.css`,
   with a comment pointing at the `direction-orb` precedent.
9. **Test, in this order of importance:**
   - ⚠️ **`toPersistedPosePresets()` returns `undefined` when empty** — the digest guard;
   - the key is **absent** from the built state when no preset exists;
   - the key **appears** once a preset is saved, and round-trips through hydrate;
   - `narrowPosePresets` tolerates unknown fields, wrong types and `null` without throwing;
   - save trims / no-ops on empty; delete is a no-op for an unknown id;
   - `applyPosePreset` restores every field, as one action;
   - hydrate assigns unconditionally so switching projects clears stale presets;
   - **the existing "not persisted" assertions for live pose state still pass unmodified.**
10. **Run the W6 gate below and read every line.** Then commit.

## Constraints

- ⚠️ **NEVER run `vitest -u`.** If a corpus snapshot changes, **STOP and report** — that is the
  owner's real work and a human must read the diff.
- **Do not add a migration**, do not bump a version, do not edit `client/src/services/migrations/`
  or `client/src/types/codecs/{serialize,deserialize,migrate}.ts` (F14). Absent keys are handled
  by `?? default` on read.
- **Do not make the live pose state persistent** — only `posePresets`.
- **Do not emit the key unconditionally**, and **never** as `key: undefined` (F13).
- **Do not import a store/MobX/API into `ui/`** — `PoseSection.tsx` stays pure; the container does
  the reading.
- No numeric `z-index`; stylelint stays at exactly 2 errors.
- Do not touch `server/src/data/`.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass — especially persistedUIState.test.ts
bun run lint:boundaries           # OK
bunx stylelint "src/**/*.css"     # EXACTLY 2 errors
bunx storybook build              # exit 0
```

⚠️ **The W6 data-safety gate — run these and read every line:**

```sh
git status --short -- '*__snapshots__*'                       # MUST be EMPTY
git diff -- client/src/types/__tests__/__snapshots__/          # MUST be EMPTY
git diff --stat -- server/                                     # MUST be EMPTY
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # MUST be EMPTY
```

**If any corpus snapshot changed, STOP and report.** Do not regenerate it. The fallback (F12's
alternative — a standalone preset store leaving the project wire format untouched) does **not**
require unwinding tasks 01-07.

**Report explicitly:** the exact diff of `UIStore.ts` (it will be non-empty this time — that is
expected and is the point), and proof that the built state has **no** `posePresets` key when no
preset exists.

**Manual checks — you cannot perform these; list them as owed:**

1. ⚠️ **Highest value: save a preset, reload the app, select it — the view is restored.**
2. A project saved **before** this change still opens, with no presets and no error.
3. Saving a preset then opening a **different** project does not carry presets across.
4. Deleting a preset removes it and it stays gone after a reload.
5. The advanced camera panel and Euler fields are mounted and actually drive the view.
6. ⚠️ **iPad: dragging a slider no longer scrolls the rail** (the `touch-action` fix — confirmed
   defect, now fixed but **unverified**).
7. Layout at 240 px with the preset list added.

## Definition of done

- [ ] `PersistedPosePreset` declared in `domain.ts` **and** `compactTypes.ts`, wide types.
- [ ] `toHaveLength(52)` → `53`, and `fullyPopulatedProject()` extended.
- [ ] Store surface complete: save / delete / apply / narrow / hydrate / serialize.
- [ ] ⚠️ **`toPersistedPosePresets()` returns `undefined` when empty**, emitted via `assign()`.
- [ ] The key is provably **absent** when no preset exists, and round-trips when one does.
- [ ] Live pose state is still session-only; its "not persisted" tests pass unmodified.
- [ ] Tasks 06 and 07's components are mounted and wired.
- [ ] Preset list UI: select-to-apply and delete, `ui/` stays pure.
- [ ] `.pose-panel__slider` has `touch-action: none`.
- [ ] **No corpus snapshot changed; no migration added; no version bumped.**
- [ ] Gate green, stylelint exactly 2 errors, no lockfile.
