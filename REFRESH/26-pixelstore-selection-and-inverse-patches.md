# 26 — `SelectionUIStore`, `PixelStore`, and inverse-patch pixel commands

**Wave:** W18 · **Depends on:** 25, 17
**Touches:** `client/src/stores/ui/SelectionUIStore.ts` (new) · `client/src/stores/domain/PixelStore.ts` (new) · `client/src/stores/history/commands.ts` · `client/src/stores/{ApplicationStore,bridge/zustandBridge}.ts` · `client/src/store/{selectionActions,drawingActions,colorAdjustmentActions}.ts` · `client/src/components/Canvas/Canvas.tsx` (drawing + selection paths only) · `client/src/containers/CanvasSelectionContainer.tsx` (new) · `client/src/stores/domain/__tests__/PixelStore.test.ts` (new)
**Effort:** L

## Objective

After this task `PixelStore` is the sole writer of pixel grids, the selection mask reaches it as an argument rather than a cross-store read, and pixel mutations record **inverse-patch** commands instead of full snapshots. This is the hot path and the single biggest memory win in the refresh.

## Context

### The measured win

| Scenario | Today | After |
| --- | --- | --- |
| 100 pencil strokes, 50 px each | 100 × 6.9 MB = **690 MB** | 100 × ~1.2 kB = **120 kB** |
| CPU per history-tracked pixel mutation | **5.1 ms blocking** (`projectToCompact` → `compactToProject` round trip) | **< 0.1 ms** |

An inverse-patch entry records `(gridRef, [{x, y, before, after}])` at roughly **24 bytes per changed pixel**, so a 50-pixel stroke is ~1.2 kB against the 64 MB budget task 17 established.

### The rule that keeps the boundary one-directional

Three UI values gate domain writes and are consulted on **every** `setPixel`/`setPixels`:

- `selection.mask` (a `Set<number>`) and `uiState.selectionBehavior` — `drawingActions.ts:11-24` (`isEditMaskActiveFor`) consults them on every call when `selectionBehavior === "editMask"`
- `uiState.variantFrameIndices` — read in 6 modules' pixel-write paths

**They are passed as ARGUMENTS:**

```ts
PixelStore.setPixels(pixels, { mask?, behavior?, variantFrameIndex? })
```

`stores/domain/**` must not import `stores/ui/**`. Task 05's ESLint rule enforces it mechanically — this is not a convention, it is a check.

### `SelectionUIStore`

| Field | Kind | Note |
| --- | --- | --- |
| `selection` | **`observable.ref`** on the `SelectionState`; its `mask: Set<number>` is **non-observable** | The `Set` is replaced wholesale on every selection change, so `observable.ref` is exactly right — and it dodges the `Set`-serialization hazard entirely. Nothing here is persisted. |
| `mode` (`selectionMode`) | `observable`, **persisted** | default `"rect"` |
| `behavior` (`selectionBehavior`) | `observable`, **persisted** | default `"movePixels"`; `"editMask"` gates all pixel writes |

Actions (9, from `selectionActions.ts`, 651 lines): `setSelection`, `setSelectionMask`, `clearSelection`, `expandSelection`, `shrinkSelection`, `selectFloodFillAt`, `selectAllByColorAt`, `selectLasso`, `moveSelection`. The three pixel-sampling selects receive the **layer grid as an argument**.

`moveSelectedPixels` and `deleteSelectionPixels` are **domain** mutations and go to `PixelStore` with the mask passed in. (Note `moveSelectedPixels` calls `moveSelection` intra-module at `selectionActions.ts:577,648` — preserve that.)

`mode` and `behavior` join `toPersistedUIState()`; the payload must stay byte-identical.

### `PixelStore` — the sole grid writer

Actions in this task: `setPixel`, `setPixels`, `moveSelectedPixels`, `deleteSelectionPixels`, `adjustColor`. (Normals, height, flips and normal computation arrive in the lighting task.)

Every write path **must end with `domain.bumpPixelVersion()`**. Anything deriving from pixel content must read `pixelVersion` — a missed bump means a stale canvas, and a missed bump on the save trigger means silent data loss.

`Layer.pixels` remains **`observable.ref`**; MobX never sees inside it. `Canvas` and `LightingCanvas` are imperative renderers driven by a `reaction(() => [pixelVersion, zoom, panOffset, …], redraw)`, **not** by `observer` on grid data.

### Transactions replace the stroke closure

Task 17 promoted `drawingActions.ts:10`'s module closure `let _strokeActive = false` to `HistoryStore.beginTransaction()` / `endTransaction()`. `beginStroke` opens a transaction; every `setPixel` during the drag records an inverse patch into it; `endStroke` collapses them into **one** `CompositeCommand`. **One drag = one undo entry** — that invariant is pinned by task 08 and must not change.

`colorAdjustmentActions` passes its own `trackHistory` parameter through from the caller; `ColorPicker.tsx` passes `true` only on debounce settle. **Do not change that timing.**

The three gesture fields (`isDrawing`, `drawStartPoint`, `previewPixels`) do **not** move here — they belong to a `CanvasInteractionStore` in the Canvas task. `previewPixels` in particular is rewritten on **every mousemove**, so when it moves it must be `observable.ref` with whole-array replacement; a deep observable array there is a per-frame allocation storm.

### Convert one command family at a time

Task 17 shipped snapshot-only commands so behaviour was provably identical. This task converts the **pixel** family to inverse patches — the biggest win — and **nothing else**. The structural family (add/delete layer, add/delete frame, …) and the snapshot family (`resizeObject`, `flipHorizontal`, the 4 `squash*`, …) stay as they are.

**Re-run task 08's characterisation suite after each family conversion.** It is the only proof that the inverse patch and the snapshot it replaced are equivalent.

## Steps

1. Create `SelectionUIStore` with the three fields and the 9 actions; add `mode` and `behavior` to `toPersistedUIState()`; confirm the wire-format golden test is still green.
2. Create `PixelStore` with `setPixel`, `setPixels`, `moveSelectedPixels`, `deleteSelectionPixels`, `adjustColor`, each taking mask/behaviour/variant-frame-index as **arguments** and each ending with `bumpPixelVersion()`.
3. Ship the pixel actions **still recording snapshot commands** and confirm task 08's suite passes unchanged.
4. **Then** add the inverse-patch `PixelCommand` to `commands.ts` and switch the pixel actions to it. Re-run the suite; it must still pass unchanged.
5. Wire `beginStroke`/`endStroke` to `HistoryStore.beginTransaction`/`endTransaction`.
6. Move the migrated fields and actions from the bridge's Phase A list to Phase B.
7. Update `Canvas.tsx`'s drawing and selection call sites **only** — do not restructure the file.

## Constraints

- **`stores/domain/**` must not import `stores/ui/**`.** Mask, behaviour and variant frame index are arguments.
- **`layer.pixels` stays `observable.ref`.** Never `makeAutoObservable` a `PixelData`, `Pixel` or `Normal` — the lint rule from task 23 enforces it.
- **Convert only the pixel command family.** Leave structural and snapshot families alone.
- **One drag must remain exactly one history entry.**
- Do not change `ColorPicker`'s debounce timing.
- Do not restructure `Canvas.tsx` — that is the Canvas decomposition task. Touch only the drawing and selection call sites.
- The save payload must stay byte-identical; corpus snapshots unchanged.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build
bunx vitest run src/stores/domain/PixelStore.test.ts src/stores/history
bunx vitest run src/store/__tests__/     # task 08's characterisation suite — UNCHANGED
```

The `PixelStore` suite must assert:
- a 50-pixel stroke command reports `cmd.bytes < 5 kB`
- 1,000 strokes stay under the 64 MB budget
- undo of a stroke restores the exact prior pixels
- a masked write with `behavior === "editMask"` does **not** write outside the mask
- a write lands on the correct variant frame when `variantFrameIndex` is supplied
- `bumpPixelVersion()` fires exactly once per write action

Manual checks — the **full drawing matrix**:
1. Pencil, eraser, line, rect, ellipse, flood fill, gaussian fill.
2. All 4 selection modes; all 3 `selectionBehavior` values; move tool; eyedropper revert; origin tool; both trace modes.
3. Brush size 1 and > 1, circle and square.
4. Undo a 50-pixel stroke — the whole stroke disappears in one undo.
5. **Performance: a 100-pixel drag measured in the browser's performance panel must stay under 16 ms/frame**, matching the pre-migration baseline. This is the check that catches an accidentally deep-observed grid.

## Definition of done

- [ ] `SelectionUIStore` owns `selection` (`observable.ref`, non-observable `Set`), `mode` and `behavior`; the last two persist and the payload is byte-identical.
- [ ] `PixelStore` is the **sole** grid writer; every action ends with `bumpPixelVersion()`.
- [ ] Mask, behaviour and variant frame index arrive as **arguments**; `stores/domain/**` imports nothing from `stores/ui/**`.
- [ ] Pixel commands are inverse patches; a 50-pixel stroke is under 5 kB; the structural and snapshot families are unchanged.
- [ ] Task 08's characterisation suite passes **unchanged**, both after step 3 and after step 4.
- [ ] One drag is exactly one history entry.
- [ ] The 100-pixel drag stays under 16 ms/frame.
- [ ] The full drawing matrix was exercised and recorded.
- [ ] `Canvas.tsx` was not restructured.
