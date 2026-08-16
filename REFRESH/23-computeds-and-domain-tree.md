# 23 — `DomainStore` tree, `PaletteStore`, `ObjectStore`, the 6 computeds, and the bridge pivot

**Wave:** W15 · **Depends on:** 17, 22
**Touches:** `client/src/stores/domain/DomainStore.ts` · `client/src/stores/domain/PaletteStore.ts` (new) · `client/src/stores/domain/ObjectStore.ts` (new) · `client/src/stores/ApplicationStore.ts` · `client/src/stores/bridge/zustandBridge.ts` · `client/src/store/{paletteActions,objectActions,helpers}.ts` · `client/src/containers/{PaletteManagerContainer,ObjectSelectModalContainer,ProjectSelectModalContainer,BrowseBackupsModalContainer,HeightMapModalContainer,CopyFromModalContainer,CanvasInfoContainer}.tsx` (new) · `client/src/stores/domain/__tests__/` · `client/src/stores/__tests__/computeds.test.ts` (new)
**Effort:** L

## Objective

After this task MobX owns the project tree — `objects`, `palettes`, `variants`, `referenceImage`, `version` — the bridge reverses direction so Zustand becomes a read-only mirror, the six `helpers.ts` derivations become `computed`s on `ApplicationStore`, and the two trivially-extractable action modules are migrated. This is the pivot point of the whole migration.

## Context

### The observable shape — non-negotiable

**The single largest performance risk in this refresh is deep-observing the pixel grid.** MobX's default `observable` is deep. Naively wrapping `Project` makes every `PixelData` and every nested `Pixel`/`Normal` an observable — **~1M proxies** on the owner's measured project (300,249 `PixelData` cells, each `{color: Pixel|0, normal: Normal|0, height: number}`). The app becomes unusable and it will look like "MobX is slow" rather than a modelling error.

The contract:

1. **`Layer.pixels: PixelData[][]` is `observable.ref`.** MobX never sees inside it.
2. Only a `PixelStore` (a later task) writes grids. Every write path ends with `domain.bumpPixelVersion()`.
3. `pixelVersion: number` is a plain `observable`. **Anything deriving from pixel content must read `pixelVersion`.**
4. `Canvas.tsx` and `LightingCanvas.tsx` are imperative `<canvas>` renderers: they use a single `reaction(() => [pixelVersion, zoom, panOffset, …], redraw)`, **not** `observer` on grid data.
5. Grid **replacement** (resize, flip, paste) assigns a new array — that is a `ref` write and it does propagate.

Add a lint rule (`no-restricted-syntax`) forbidding `makeAutoObservable` on any type whose name matches `/Pixel(Data)?|Normal$/`.

Field-by-field:

| Field | Kind | Note |
| --- | --- | --- |
| `version` | `observable` | carried verbatim |
| `objects` | `observable.shallow` array; each `PixelObject`/`Frame`/`Layer` is `makeAutoObservable` **except** `layer.pixels` | the grid rule above |
| `palettes` | `observable` array of `observable` palettes | small (a few hundred colours); deep observation is affordable and gives `PaletteManager` free granularity |
| `variants` | `observable.shallow`; `VariantFrame.layers[].pixels` is `observable.ref` | same grid rule |
| `referenceImage` | **`observable.ref`** | a whole base64 PNG. Never cloned, never in a history command — this alone removes up to 100 MB of duplicated PNG from history |

### Why sub-stores mutate one shared tree

`ObjectStore` does **not** hold `objects` — `DomainStore` does. The sub-stores are **behaviour modules over one observable tree**, each receiving `DomainStore` and `HistoryStore` by constructor injection.

The reason is measured: `variantActions.ts` mutates `project.objects` **and** `project.variants` in the same operation (`makeVariant` at `variantActions.ts:23` also calls `layerActions.selectLayer` at `:446`). Splitting the *data* across sub-stores would recreate that cross-module edge as a cross-store write. Splitting only the *behaviour* keeps one tree, one `pixelVersion`, and one serializer.

### Why `PaletteStore` and `ObjectStore` go first

They are the two trivially-extractable modules:
- `paletteActions.ts` is 70 lines and takes **no `get`** at all — only `updateProjectAndSave`.
- `objectActions.ts` is 233 lines and names its `get` parameter `_get`, **unused**.

Neither has any cross-module dependency, so they prove the pattern with minimal risk.

`PaletteStore`'s 5 actions (`addPalette`, `deletePalette`, `renamePalette`, `addColorToPalette`, `removeColorFromPalette`) **remain non-undoable** — all 5 pass `trackHistory=false` today and preserving that exactly is required (see task 17).

`ObjectStore` takes `addObject`, `deleteObject`, `renameObject`, `resizeObject`, `duplicateObject`, `setObjectOrigin`. Note two actions **do not** go here: `selectObject` is UI state and moves to a UI store later, and `setOriginColor` is a tool setting.

### The 6 computeds — the cheapest high-leverage slice

`client/src/store/helpers.ts` is 93 lines, pure, writes nothing, and is called **~120 times across 9 store modules and 8 components**. It is the only shared dependency in the whole store graph (which has **zero cycles** — verified by an exhaustive `get().<name>` scan).

| Computed | Inputs | Consumers |
| --- | --- | --- |
| `currentObject` | `domain.objects`, `selectedObjectId` | 12 containers, plus `currentFrame` |
| `currentFrame` | `currentObject`, `selectedFrameId` | 9 containers, plus `currentLayer` |
| `currentLayer` | `currentFrame`, `selectedLayerId` | 7 containers, plus `currentVariant` |
| `currentVariant` | `currentObject`, `currentLayer`, `domain.variants`, `variantFrameIndices`, `selectedFrameId` | `Canvas`, `LightingCanvas`, `LayerPanel`, `VariantView`, `CanvasInfo`, `HeightMapModal` — **replaces a 60-line scan (`helpers.ts:33-79`) run on every call today** |
| `selectedVariantLayer` | `currentVariant` | `LayerPanel`, the pixel write paths |
| `isEditingVariant` | `currentVariant` | several |

They live on **`ApplicationStore`**, not on `DomainStore` or a UI store, because they span both: they depend on `project` (domain) and on `selectedObjectId`/`selectedFrameId`/`selectedLayerId`/`variantFrameIndices` (UI). Until the UI store lands, read those selection ids through the bridge.

⚠️ **`currentVariant` has three fallback layers** at `helpers.ts:69-77`: `variantOffsets[selectedVariantId]` → `variantOffset` → `baseFrameOffsets[i]`, falling through to `{x:0,y:0}`. **Getting the precedence wrong misplaces every variant on canvas.** Task 08 pinned all four levels; unit-test each branch explicitly here.

### The bridge pivot — the highest-risk moment in the migration

Until now the bridge has been **Phase A**: MobX mirrors Zustand, Zustand is the source of truth. This task flips it to **Phase B**: MobX is the source of truth and Zustand is a read-only mirror for not-yet-migrated consumers.

```ts
// Phase B
const disposeM = reaction(
  () => app.migratedSnapshot(),
  (snap) => useEditorStore.setState(snap, false)   // shallow merge, no history side effects
);
```

Invariant, enforced by review: **a field is mirrored in exactly one direction at a time and never has two writers.** The bridge file's two explicit field lists are the migration's progress ledger, and this change moves `version`, `objects`, `palettes`, `variants`, `referenceImage` from list A to list B. Keep the dev-mode assertion that no field appears in both.

Mirror `project` and pixel grids **by reference only** — never cloned. Peak overhead is one shallow `setState` per change.

### Containers for the low-entanglement consumers

Seven consumers touched here, all low-entanglement. Per the taxonomy rules: **`observer()` lives only in `client/src/containers/`**, a container reads observables and renders exactly one presentational element with plain props, and `observer` goes on the **smallest** component that reads observables — do not wrap a page and read 20 fields, which just reproduces the current whole-store-destructure problem (33 of 34 consumers re-render on every store change today).

| Consumer | Store members today | Note |
| --- | ---: | --- |
| `PaletteManager` | 7 | confined to the palette slice |
| `ObjectSelectModal` | 1 (`project`) | **the single easiest purification in the codebase** |
| `ProjectSelectModal` | 6 | 4 are async project-lifecycle actions, now `flow`s on `DomainStore` |
| `BrowseBackupsModal` | 2 | plus direct API calls, already routed through `backupApi` by task 15 |
| `HeightMapModal` | 5 | read-only; 5 getters, results returned via `onConfirm` |
| `CopyFromModal` | 3 | |
| `CanvasInfo` | 7 | calls `useEditorStore()` **twice** (lines 12-19 and 51) — collapse to one container |

**Do not move these components into `ui/components/` in this task.** That is the purification task's job. Here they get a container that supplies props; the component file stays where it is and simply stops calling `useEditorStore` for the fields this task migrated.

## Steps

1. Extend `DomainStore` with `version`, `objects`, `palettes`, `variants`, `referenceImage` using the exact observable kinds in the table. Add `pixelVersion` and `bumpPixelVersion()`, plus `domainVersion` and `bumpDomainVersion()` wired to `AutoSaveController`'s trigger.
2. Add the `no-restricted-syntax` lint rule forbidding `makeAutoObservable` on `PixelData`/`Pixel`/`Normal`.
3. Add the 6 computeds to `ApplicationStore` and unit-test each of `currentVariant`'s fallback branches.
4. Create `PaletteStore` (5 actions, non-undoable) and `ObjectStore` (6 actions), each taking `DomainStore` + `HistoryStore` by injection.
5. **Flip the bridge to Phase B** and move the five fields between the lists in the same commit.
6. Create the seven containers and route those consumers' reads through them.
7. Delete the migrated actions from `client/src/store/paletteActions.ts` and `objectActions.ts`, leaving the Zustand store to receive them through the bridge.

## Constraints

- **Never make a pixel grid deeply observable.** `layer.pixels` and `variantFrame.layers[].pixels` are `observable.ref`, full stop.
- **`referenceImage` is `observable.ref` and enters no history command.**
- Palette edits stay non-undoable.
- **The saved bytes must not change.** `serialize()` must still emit exactly what `projectToCompact` emits, `uiState` included (still sourced through the bridge in this task).
- `DomainStore` and its sub-stores must import **nothing** from `client/src/stores/ui/`.
- `observer()` only under `client/src/containers/`.
- Do not move any component into `ui/`; do not split any component.
- Do not remove `zustand`.
- Do not convert any history command to an inverse patch.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/stores/__tests__/computeds.test.ts   # one test per currentVariant fallback branch
bunx vitest run src/store/__tests__/                     # task 08's suite still green
bunx vitest run src/types/__tests__/                     # corpus snapshots unchanged
```

Manual checks:
1. **Full project lifecycle:** create, switch, rename and delete a project; each must still autosave within ~1 s.
2. **Palettes:** add and delete a palette colour; confirm they are still **not** undoable.
3. **Objects:** add, rename, resize, duplicate and delete an object.
4. **Variant precedence:** select a variant layer with (a) `variantOffsets`, (b) a legacy `variantOffset`, and (c) only `baseFrameOffsets` — all three must render at the same position as before.
5. **Performance:** perform a 100-pixel drag and confirm frame time stays under 16 ms. If the grid was accidentally deep-observed this check fails immediately and dramatically.
6. **Wire format:** copy `Base Unit.json` aside, make one edit, wait for the save, diff — only the edited field may differ.

## Definition of done

- [ ] `DomainStore` holds the full tree with `layer.pixels` and `variantFrame.layers[].pixels` as `observable.ref`, and `referenceImage` as `observable.ref`.
- [ ] `pixelVersion` and `domainVersion` exist, are bumped in exactly one place each, and feed `AutoSaveController`'s trigger.
- [ ] The `no-restricted-syntax` rule forbidding `makeAutoObservable` on pixel types is in `eslint.config.js` and `bunx eslint .` exits 0.
- [ ] All 6 computeds live on `ApplicationStore`; each of `currentVariant`'s fallback branches has its own test.
- [ ] `PaletteStore` (non-undoable) and `ObjectStore` exist and take their collaborators by injection.
- [ ] The bridge is in **Phase B** and the five fields moved lists in the same commit.
- [ ] Seven containers exist; `observer()` appears only under `client/src/containers/`.
- [ ] The 100-pixel drag stays under 16 ms/frame.
- [ ] The saved bytes and the corpus snapshots are unchanged.
- [ ] `zustand` is still installed and no component was moved into `ui/`.
