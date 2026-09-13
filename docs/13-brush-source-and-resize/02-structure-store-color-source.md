# 02 — `BrushStructureStore`: create with a colour source, change it undoably

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/stores/domain/BrushStructureStore.ts` · `client/src/stores/domain/__tests__/BrushStructureStore.test.ts`
**Effort:** S

## Objective
`addLayer` takes the colour source the new layer is born with, and a new
`setLayerColorSource(id, source)` changes it in every frame as one undoable snapshot
commit. Duplicating a layer carries the field. No UI reaches these yet (tasks 03/04).

## Context
- `client/src/stores/domain/BrushStructureStore.ts`: `addLayer(name, channelType)` `:365-395`
  builds the layer with `createBrushLayer(layerId, name, current.width, current.height, channelType)`
  inside `mapFrames` and commits `"Add layer"` with `bumpPixels = true`.
- The template for the setter is `setLayerChannelType` `:512-529` (three guards: no doc,
  unknown id, unchanged → no-op; `mapLayer` spine copy; `commit(label, mutate, bumpPixels)`).
  The template for an **optional key that is dropped rather than set** is
  `setLayerAppliedGroup` `:531-556` with `withoutAppliedGroup` `:134-138`.
- History: the snapshot command family (`stores/history/brushCommands.ts:88-107`) retains the
  whole pre-mutation document by reference — **never mutate a layer in place**; always a
  spine copy through `mapLayer`. No change to `brushCommands.ts` is needed.
- `duplicateLayer` `:486-510` spreads `...source`, so the field is carried for free — pin it.
- `commit`'s third argument: `false` for pure relabels. A colour-source change alters future
  strokes, not the rendered grid → `bumpPixels = false` (MASTER D2). `domainVersion` still
  bumps (that is what `usePixelBrush` keys its memo on).
- Tests: `BrushStructureStore.test.ts` — rig helper `:88` (uses `createBrushLayer(id, id, W, H, channelType)`),
  `addLayer` describe `:395-433`, `setLayerChannelType` describe `:615-645` (the block to
  mirror), `setLayerAppliedGroup` `:664`, `duplicateLayer` carry test `:562`, the
  **table-driven "one history entry per op" list `:778-852`** (add the new setter), and the
  "no op records anything without a document" list `:910`.

## Steps
1. `addLayer(name: string, channelType: BrushChannelType, colorSource: BrushColorSource = "selected"): string`
   — pass it through to `createBrushLayer`. Existing two-argument callers keep compiling.
2. Add `withoutColorSource(layer)` next to `withoutAppliedGroup` (drop the key). Add:
   ```ts
   /** Relabel: every frame's copy of the layer gets the source; `"selected"` drops the key. */
   setLayerColorSource(id: string, source: BrushColorSource): void
   ```
   guards as `setLayerChannelType`; compare against `brushLayerColorSource(layer)`; commit
   label `"Change colour source"`, `bumpPixels = false`; `mapLayer(d, id, l => source === "target" ? { ...l, colorSource: "target" } : withoutColorSource(l))`.
3. Register the new method as a MobX `action` wherever the class registers its other
   structural actions (find the `makeObservable` block / action list at the top of the class
   and add it beside `setLayerChannelType`).
4. Tests: `describe("setLayerColorSource")` mirroring `:615-645` — relabels in every frame,
   grid references untouched, `"selected"` removes the key (assert `"colorSource" in layer === false`),
   no-op when unchanged / unknown id / no document; `addLayer("x", "rgb", "target")` births
   the key in every frame; `duplicateLayer` carries `"target"`; add the setter to the
   history table `:778-852` and the no-document list `:910`.
5. Commit: `brush-source(02): addLayer colour source + setLayerColorSource`.

## Constraints
- Do not touch `brushCommands.ts`, `BrushStore.ts`, any container or UI file.
- Keep `assertUniformLayers` on every commit (it is inside `commit`; do not bypass).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx vitest run src/stores/domain src/stores/history
```
Expected: green; `BrushStructureStore.test.ts` shows the new describe block and the history
table with one more row.

## Definition of done
- [ ] `addLayer` third parameter defaults to `"selected"`; `setLayerColorSource` exists and is a registered action.
- [ ] Setting `"selected"` removes the key; setting `"target"` adds it; one history entry per call; undo restores the previous document reference.
- [ ] Tests in step 4 present and green.
