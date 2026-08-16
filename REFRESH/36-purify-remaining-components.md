# 36 — Purify and relocate the remaining components into `ui/components/`

**Wave:** W27 · **Depends on:** 35
**Touches:** all remaining directories under `client/src/components/` (moved into `client/src/ui/components/`) · the corresponding files in `client/src/containers/` · `client/src/ui/utils/colorMath.ts` (new) · `client/src/ui/components/AiConfigPopover/` (new) · stories for each
**Effort:** L

## Objective

After this task every remaining component lives under `client/src/ui/components/`, is pure, has a container if it needs store data, and has stories. `client/src/components/` is empty apart from anything a later task deletes.

## Context

By this point tasks 23-35 have already given most of these components containers and moved the state they read into MobX. **This task finishes the job: physically relocate each into `ui/components/`, strip any residual store access, and write stories.**

### What "pure" means for this tier

Domain-aware but pure: every input arrives as a prop, every effect leaves as a callback. **No store hook, no `observer()`, no `fetch`, no module-level mutable state, no `useContext`.** Domain types **are** permitted here — that is what distinguishes a component from a primitive, which bans them. Banning `Layer`/`Frame` from `ui/components/` would force every component to re-declare structural clones of the domain types, which is strictly worse; the locked decision is about *state*, not *types*.

### The components, grouped by effort

**Already pure — move only** (no store access at all today):

`AnchorGrid` (202 lines, already props-in/callbacks-out), `ResizeModal` (110), `EdgeInterpolateModal` (150 — adopt `Modal` + `Slider`; it has 3 hand-rolled sliders), `PreviewModal` (473 — adopt `Modal` + `NumberInput`; it owns a rAF loop, which is fine in `ui/`), `ExportPreviewModal` (537 — **calls the API directly today**; task 15 routed it through `exportApi`, so here the call becomes a `loadExport` **prop** supplied by its container), `Icon` (already moved to `ui/primitives/` in task 19).

**S-effort purification:**

| Component | LOC | Store members | Note |
| --- | ---: | ---: | --- |
| `ObjectSelectModal` | 185 | 1 (`project`) | **The single easiest purification in the codebase** — use it as the reference conversion |
| `CanvasInfo` | 146 | 7 | already moved in task 32 — verify only |
| `NormalPicker` | 261 | 3 | ⚠️ two independent containers for `selectedNormal` and `lightDirection` |
| `LightControl` | 281 | 4 | 4× `SliderWithNumber` collapses ~120 lines |
| `LightingStudioPanel` | 90 | 4 | |
| `PixelStudioPanel` | 190 | 8 (two separate `useEditorStore()` calls) | collapse to one container |
| `PaletteManager` | 167 | 7 | confined to the palette slice |
| `Toolbar` | 166 | 5 | replace its bespoke portal tooltip with the `Tooltip` primitive |
| `PixelStudioTools` | 139 | 4 | |
| `CopyFromModal` | 233 | 3 | also has a bespoke portal tooltip → `Tooltip` |
| `AddVariantModal` | 283 | 4 | adopt `ConfirmDialog` |
| `VariantSelectModal` | 295 | 5 | actions only, **zero state coupling** |
| `FrameTagsModal` | 266 | 5 | **already uses selector-style subscriptions** — the reference example |
| `HeightMapModal` | 300 | 5 | read-only; results returned via `onConfirm` |

**M-effort purification:**

| Component | LOC | Note |
| --- | ---: | --- |
| `ColorPicker` | 673 | **Extract `client/src/ui/utils/colorMath.ts` first** (HSL math), then purify. It drives undo history from a debounce timer — **do not change that timing**. |
| `LayerColors` | 295 | Heavy pixel-scanning derivation currently in the component — move it to the container as a computed, and **watch the invalidation**: wrong invalidation gives stale swatches. Also **fix the 3 keyboard-inoperable toggles** (`LayerColors.tsx:169-180`, `:197-208`, `:254`) by adopting the `Toggle` primitive — task 22 was explicitly told not to. |
| `LightingStudioTools` | 308 | Task 27 moved its normal/height computation into `PixelStore` as a `flow`. Verify nothing heavy remains in the component. |
| `Header` | 319 | **14 `useState` calls.** Extract the AI-config popover into `ui/components/AiConfigPopover/` first. Two runtime-concatenated class families (task 22 converted them) — verify both status indicators still colour correctly. |
| `FrameReferencePanel` | 477 | Built on the `FloatingPanel` primitive; task 29 removed its local `minimized` mirror |
| `ReferenceImagePanel` | 434 | Same; task 29 removed its local `isMinimized`/`position` mirrors and rerouted its 16 nudge buttons |
| `ProjectSelectModal` | 188 | 4 of its 6 members are async project-lifecycle actions, now `flow`s on `DomainStore` |
| `BrowseBackupsModal` | 212 | Backup list and restore arrive as props via `backupApi` |
| `FrameTimeline` | 251 | Owns playback; the rAF/interval **stays in the component** — that is legitimate in `ui/` |
| `FramesView` | 684 | **Already prop-driven for reads** (8 members, actions only) — one of the cheapest |
| `VariantView` | 617 | Same (9 members, actions only) |
| `ReferenceImageModal` | 869 | Task 29 removed the module singleton. Split the cropper into `ui/components/ReferenceImageCropper/` and keep the shell on the `Modal` primitive. |

### Components that mirror store state into local `useState` — remove, do not carry over

Task 29 already handled `FrameReferencePanel`, `ReferenceImagePanel` and `App`. **Verify none remains**: a component holding a `useState` copy of a store value is a duplicate source of truth, and removing it changes update timing.

### Container rules

`observer()` only in `client/src/containers/`. One container per component (this yields roughly 41 containers overall; about 6 are trivial pass-throughs that exist purely so the `ui/` element never sees a store — that is the intended cost of a uniform rule). `observer` goes on the **smallest** component that reads observables. Never pass an observable array or a domain node; project to a flat view-model.

### Import-path churn

39 component files change location and every one is imported by path today. **Use a codemod or accept hundreds of `tsc` errors per step.** Move one component per commit and run `bunx tsc --noEmit` after each.

### Stories

At least **three** per component: *empty*, *typical*, *edge* (long names, many items, or the error state). Every callback prop wired to `fn()`. A story for each `--modifier` the component has. Use the shared fixtures.

For the 14 `position: fixed` modals, use the `withModalHost` decorator from task 10 — otherwise they escape the story canvas and cover the whole Storybook iframe.

MSW handlers (task 15) drive the loading / failed / conflict container states, which have no UI at all today.

## Steps

1. Start with `ObjectSelectModal` as the reference conversion (1 store member). Document the pattern in the commit message.
2. Move and purify the already-pure six, then the 14 S-effort ones, then the M-effort ones. **One component per commit.**
3. Extract `ui/utils/colorMath.ts` before purifying `ColorPicker`; extract `AiConfigPopover` before purifying `Header`; extract `ReferenceImageCropper` before purifying `ReferenceImageModal`.
4. Fix `LayerColors`' 3 keyboard-inoperable toggles via the `Toggle` primitive.
5. Adopt primitives where the component was hand-rolling one: `Modal`, `Button`, `IconButton`, `Slider`, `NumberInput`, `SliderWithNumber`, `Toggle`, `Tooltip`, `ColorSwatch`, `FloatingPanel`, `Panel`, `Dropdown`, `ThumbnailCanvas`, `EmptyState`, `Badge`, `ConfirmDialog`.
6. Write stories for each.

## Constraints

- **Nothing in `ui/` may import from `stores/`, `store/`, `api/`, `services/`, `mobx` or `mobx-react-lite`, or call `useContext`.** ESLint enforces it.
- **Do not change `ColorPicker`'s debounce timing** — it drives undo history.
- **Do not unify the three floating panels' persistence keys.**
- Do not restructure any component beyond the extractions named in step 3 — the big splits were task 35.
- Move one component per commit.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
# The boundary holds across all of ui/:
! grep -rn "useEditorStore\|from \"mobx\|from \"../stores\|from \"../api\|useContext" src/ui --include='*.tsx' --include='*.ts'
node scripts/check-classes.mjs      # 0 dead, 0 missing
```

Manual checks:
1. **`NormalPicker`:** change the selected normal and the light direction **independently** — wiring the wrong store field is the classic mistake here.
2. **`LayerColors`:** paint a new colour and confirm it appears in the list **immediately** (the extraction memo moved to the container). Tab to each of the 3 toggles and press Space — **all three must now respond**.
3. **`ColorPicker`:** drag across both the SV square and the hue strip; the store must be written on release, not on every mousemove.
4. **`Header`:** trigger a save and an export and confirm **both** status indicators colour correctly.
5. **`ExportPreviewModal`:** open the export preview and confirm it loads (its fetch moved to the container, which changes when it fires).
6. **The three floating panels:** drag, minimise and reload each; each must remember **its own** position, and dragging one must not move another.
7. **`ReferenceImageModal`:** load an image → close → reopen → switch project → reopen.
8. **`ResizeModal`:** resize an object with all 9 anchor positions.
9. Every story renders with **no store provider**.

## Definition of done

- [ ] Every remaining component lives under `client/src/ui/components/` and is pure.
- [ ] `ui/utils/colorMath.ts`, `ui/components/AiConfigPopover/` and `ui/components/ReferenceImageCropper/` are extracted.
- [ ] `LayerColors`' 3 keyboard-inoperable toggles are **fixed** via the `Toggle` primitive.
- [ ] Primitives are adopted wherever a component was hand-rolling one.
- [ ] Every component has a container if it needs store data; `observer()` appears only under `client/src/containers/`.
- [ ] No component holds a `useState` mirror of a store value.
- [ ] Every component has at least 3 stories plus its modifier stories; the 14 fixed-position modals use the modal-host decorator.
- [ ] The `ui/` boundary grep returns nothing.
- [ ] `ColorPicker`'s debounce timing and the three panel persistence keys are unchanged.
