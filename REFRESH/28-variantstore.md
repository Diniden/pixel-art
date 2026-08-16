# 28 — `VariantStore`: the largest module

**Wave:** W20 · **Depends on:** 27
**Touches:** `client/src/stores/domain/VariantStore.ts` (new) · `client/src/stores/ui/TimelineUIStore.ts` · `client/src/stores/{ApplicationStore,bridge/zustandBridge}.ts` · `client/src/store/variantActions.ts` · `client/src/components/{VariantSelectModal,AddVariantModal,ObjectLibrary}/*.tsx` · `client/src/components/FrameTimeline/VariantView.tsx` · `client/src/components/AnchorGrid/AnchorGrid.tsx` (extract `getAnchorPadding`) · `client/src/utils/variantHelpers.ts` (new) · `client/src/containers/{VariantSelectModalContainer,AddVariantModalContainer,ObjectLibraryContainer}.tsx` (new) · `client/src/stores/domain/__tests__/VariantStore.test.ts` (new)
**Effort:** L

## Objective

After this task the 1,412-line `variantActions.ts` — the largest single module in the store — is migrated to `VariantStore`, the store→UI-component layering violation is removed, and the last cross-module edge in the store graph becomes an injected callback.

## Context

`client/src/store/variantActions.ts` is **1,412 lines and 20 actions across 4 domains**. The three largest: `makeVariant` (lines 23-282, **259 lines**), `resizeVariant` (526-658), `setVariantOffset` (659-775).

### The 20 actions, and where each goes

**To `VariantStore` (17 — domain mutations):** `makeVariant`, `addVariant`, `deleteVariant`, `deleteVariantGroup`, `renameVariant`, `renameVariantGroup`, `resizeVariant`, `setVariantOffset`, `duplicateVariantFrame`, `deleteVariantFrame`, `addVariantFrameTag`, `removeVariantFrameTag`, `addVariantFrame`, `moveVariantFrame`, `reorderVariantFrame`, `addVariantLayerFromExisting`, `removeVariantLayer`.

**To `TimelineUIStore` (3 — they write UI state):** `selectVariant`, `selectVariantFrame`, `advanceVariantFrames` — all three write `variantFrameIndices` or layer selection.

### The layering violation to remove

`variantActions.ts:14` imports `getAnchorPadding` from `../components/AnchorGrid/AnchorGrid` — **the store depends on a UI component.** Extract that function (it lives at `AnchorGrid.tsx:160`) into `client/src/utils/variantHelpers.ts` together with the grid-resize math, and have both the store and the component import it from there.

Task 08 already unit-tested `getAnchorPadding` across all **9** anchor positions × grow and shrink × even and odd deltas, precisely so it could be moved safely. Those tests must keep passing after the move.

### The last cross-module edge

The store module graph is a **DAG with zero cycles** — verified by an exhaustive scan for `get().<name>` and destructured-`get()` calls across all 17 files. It has exactly **one** true cross-module call: `variantActions.ts:446` (inside `makeVariant`) and `variantActions.ts:1407` (inside `removeVariantLayer`) both call `layerActions.selectLayer`.

Task 25 moved `selectLayer` to `TimelineUIStore`. **`VariantStore` must call it through a callback injected by `ApplicationStore`, not by importing the UI store** — `stores/domain/**` may not import `stores/ui/**`, and task 05's ESLint rule enforces it.

### The 4-level variant-offset fallback

The rule below is duplicated **6×** in the codebase (`Canvas.tsx:541,663,1113,1390,1915` and `server/src/routes/export.ts:657`, the last of which task 11 moved into `server/src/export/`):

```ts
l.variantOffsets?.[l.selectedVariantId ?? ""] ?? l.variantOffset ??
  variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 }
```

Task 23 made the client-side resolution a `currentVariant` computed with all four branches tested. **Do not re-implement it inside `VariantStore`** — use the computed. Task 08 tested all four levels in priority order; getting the precedence wrong misplaces every variant on canvas.

### Variant data lives at project level since v1.1.0

`project.variants` is the source of truth; object-level `variantGroups` is the pre-migration form, hoisted by a migration. **Do not read or write `obj.variantGroups`** — it is set to `undefined` by the migration on load.

### The four consumers

| Consumer | LOC | Store members | Note |
| --- | ---: | ---: | --- |
| `VariantView` | 617 | 9 — **actions only**, all reads are props | Already prop-driven; only the action imports need lifting. Contains ~200 lines duplicated **against itself**. |
| `VariantSelectModal` | 295 | 5 — actions only, **zero state coupling** | The easiest of the four. |
| `AddVariantModal` | 283 | 4 | |
| `ObjectLibrary` | 643 | 8 | ⚠️ **`ObjectLibrary` threads `project` internals through custom `React.memo` comparators** (a 91-line comparator lives next door in `FramesView.tsx:15-163`). Those comparators must be **rewritten or removed** — getting them wrong causes **stale thumbnails**. It also holds 15 `useState` calls that are 5 inline dialogs; extracting those is the purification task's job, not this one. |

## Steps

1. Extract `getAnchorPadding` and the grid-resize math into `client/src/utils/variantHelpers.ts`; update both `AnchorGrid.tsx` and the store to import from there. Confirm task 08's `getAnchorPadding` tests still pass.
2. Create `VariantStore` with the 17 domain actions, taking `DomainStore` + `HistoryStore` + an injected `selectLayer` callback.
3. Move `selectVariant`, `selectVariantFrame` and `advanceVariantFrames` to `TimelineUIStore`.
4. Move the migrated actions from the bridge's Phase A list to Phase B in the same commit.
5. Create the three containers (`VariantView` already has one from task 25).
6. **Rewrite or remove `ObjectLibrary`'s custom `React.memo` comparators.** With `observer()` on the container and per-item containers reading their own item, a hand-written comparator threading `project` internals is both unnecessary and a stale-render hazard.

## Constraints

- **`VariantStore` must not import `stores/ui/**`** — `selectLayer` arrives as an injected callback.
- **Do not re-implement the 4-level variant-offset fallback** — use the `currentVariant` computed.
- **Do not read or write object-level `variantGroups`.**
- **Do not extract `ObjectLibrary`'s 5 inline dialogs** — later task.
- **Do not split `VariantView`.**
- `layer.pixels` and variant-frame grids stay `observable.ref`; variant resizes are **snapshot-family** commands.
- The save payload must stay byte-identical; corpus snapshots unchanged.
- Do not remove `zustand`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/stores/domain/__tests__/VariantStore.test.ts
bunx vitest run src/components/AnchorGrid/__tests__/    # getAnchorPadding still green after the move
# The layering violation is gone:
! grep -rn "components/AnchorGrid" src/stores src/store
```

Manual checks — the variant matrix:
1. Make a variant; add, delete and rename a variant and a variant group.
2. Resize a variant across **all 9 anchor positions**.
3. Set a variant offset for a single frame and for all frames; confirm clamping.
4. Add, duplicate, delete, move and reorder variant frames; add and remove variant frame tags.
5. Add and remove a variant layer.
6. **`ObjectLibrary` thumbnails must update when a variant frame changes** — this is the memo-comparator regression, and it is the check most likely to fail.
7. Variant offset precedence: a layer with `variantOffsets`, one with only a legacy `variantOffset`, and one with only `baseFrameOffsets` must all render where they did before.

## Definition of done

- [ ] `VariantStore` owns the 17 domain actions; the 3 selection actions live on `TimelineUIStore`.
- [ ] `getAnchorPadding` lives in `client/src/utils/variantHelpers.ts`; **no file under `src/store` or `src/stores` imports from `components/`**.
- [ ] `selectLayer` reaches `VariantStore` as an injected callback; `stores/domain/**` imports nothing from `stores/ui/**`.
- [ ] `ObjectLibrary`'s custom memo comparators are rewritten or removed, and thumbnails update on a variant-frame change.
- [ ] The 4-level offset fallback is resolved through the `currentVariant` computed, not re-implemented.
- [ ] Three containers exist; `ObjectLibrary`'s 5 inline dialogs were **not** extracted.
- [ ] The full variant matrix was exercised and recorded.
- [ ] Save payload and corpus snapshots unchanged.
