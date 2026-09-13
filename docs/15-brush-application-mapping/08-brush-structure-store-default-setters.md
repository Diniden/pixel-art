# 08 — `BrushStructureStore` default setters

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/stores/domain/BrushStructureStore.ts` · `client/src/stores/domain/__tests__/BrushStructureStore.test.ts`
**Effort:** S

## Objective
`app.brushStructure.setLayerApplyDelta(layerId, delta)` and `app.brushStructure.setFrameApplyTo(frameId, deltas | null)`
edit the selected brush's default mapping as **snapshot commits in the brush history** (undoable, autosaved,
no pixel bump), dropping the key whenever the value equals the default so an untouched brush stays
byte-identical. Duplicating a layer or frame carries an explicit value; moving a frame keeps an explicit
`applyTo` and lets a default one follow its new index.

## Context
- `client/src/stores/domain/BrushStructureStore.ts` (681 lines pre-14; after plan 14 every op resolves
  the selected brush through a private `commitBrush(label, mutate, bumpPixels)` and the helpers
  `mapFrames`/`mapLayers`/`mapLayer` are typed over `Brush`). The template is `setLayerColorSource(id, source)`
  (`:555-571` pre-14): `layerIndexOf`, early return when unchanged, `commit(label, d => mapLayer(d, id, l => …), false)`,
  with `withoutColorSource(l)` removing the key for the default. Frames: `addFrame :223`, `duplicateFrame :261`
  (check whether it spreads the source frame or rebuilds `{ id, name, layers }` — if it rebuilds, add
  `...(src.applyTo ? { applyTo: [...src.applyTo] } : {})`), `moveFrame :329`.
- From task 01 (`@/types`): `BRUSH_APPLY_DELTA_MAX`, `normalizeDeltaList`, `isDefaultApplyTo`,
  `brushLayerApplyDelta`, `brushFrameApplyTo`.
- `assertUniformLayers` runs on every commit — `applyDelta` must be written to the layer in **every**
  frame (`mapLayer` does that), like `colorSource`.
- Tests: `client/src/stores/domain/__tests__/BrushStructureStore.test.ts` (46 tests pre-14; plan 14 moved
  its fixtures to brush-2). Find the `setLayerColorSource` tests and mirror them.

## Steps
1. `setLayerApplyDelta(id: string, delta: number)`: `d = clamp(Math.trunc(delta), -64, 64)`; early return
   when `brushLayerApplyDelta(currentLayer) === d`; commit `"Change layer target"` mapping the layer in
   every frame to `d === 0 ? withoutApplyDelta(l) : { ...l, applyDelta: d }`; `bumpPixels = false`.
2. `setFrameApplyTo(frameId: string, deltas: readonly number[] | null)`: resolve the frame index; `next =
   deltas === null ? null : normalizeDeltaList(deltas)`; drop the key when `next === null || isDefaultApplyTo(next, index)`;
   early return when the stored `applyTo` (or its absence) already equals the request; commit
   `"Change frame targets"` mapping only that frame; `bumpPixels = false`.
3. Verify `duplicateLayer` spreads the layer (it does for `colorSource`) and make `duplicateFrame` carry
   `applyTo` by spread/copy; `moveFrame` needs no change (explicit lists ride with the frame object).
   Commit: `brush-apply(08): BrushStructureStore apply-default setters`.
4. Tests:
   - `setLayerApplyDelta(id, -1)` writes `applyDelta: -1` on that layer in **every** frame; `0` removes the
     key in every frame; `70` clamps to `64`; `1.7` truncs to `1`; same value twice → one history entry.
   - `setFrameApplyTo(f0, [0, 1, 2])` stores it; `setFrameApplyTo(f1, [1])` on frame index 1 stores
     **nothing** (default); `null` removes; `[]` is stored as `[]`; `[2, 0, 2]` → `[0, 2]`.
   - no pixel bump: `pixelVersion` unchanged, `domainVersion` bumped; undo restores the previous key state
     (including absence — assert `"applyDelta" in layer === false` after undo of a first set).
   - `duplicateLayer` carries `applyDelta`; `duplicateFrame` carries an explicit `applyTo`; a defaulted
     frame duplicated has **no** key; `moveFrame` keeps an explicit `applyTo` on the moved frame.
   - `assertUniformLayers` still holds after every op (the commit would throw otherwise — one explicit
     assertion is enough).
   Commit: `brush-apply(08): setter tests`.

## Constraints
- Only the two files. No `types/**`, no `BrushPixelStore`, no `BrushUIStore`, no containers.
- Snapshot commits only, `bumpPixels = false`.
- Never write `applyDelta: 0`, `applyDelta: undefined`, `applyTo: undefined`, or a default `applyTo`.

## Verification
```sh
cd client && bunx vitest run src/stores/domain               # green
cd client && bunx vitest run src/types                       # green, snapshots unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores/domain   # clean; BrushStructureStore.ts already carries a max-lines warning — no new warning kind
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none (the rail wires it in task 11; the Brush Studio has no control for it in this plan).

## Definition of done
- [ ] Both setters with D12 semantics; duplicate/move carry pinned.
- [ ] Tests listed above green; undo restores key absence.
- [ ] Corpus suites unchanged.
- [ ] Two commits `brush-apply(08):`; no lockfile.
