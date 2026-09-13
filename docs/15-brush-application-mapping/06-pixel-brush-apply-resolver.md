# 06 — Pure resolver `pixelBrushApply.ts`

**Wave:** W2 · **Depends on:** 01, 02
**Touches:** `client/src/ui/canvas/tools/pixelBrushApply.ts` (new) · `client/src/ui/canvas/tools/__tests__/pixelBrushApply.test.ts` (new)
**Effort:** M

## Objective
A pure, exhaustively tested module turns (brush frames + layers with their defaults, the object's
override, the object's frame/layer id shape, the current indices) into the list of **target groups**
— which brush layers land on which `(frameId, layerId)` — applying MASTER D3's rules and culling. It
also declares the `PixelBrushPlan` / `PixelBrushPlanEntry` types the tool seam and the hook share.

## Context
- Sibling module to copy: `client/src/ui/canvas/tools/pixelBrushStamp.ts` (444 lines, pure; header
  explains the no-store, no-`brushCellToRgba` rules) and its test (1131 lines, node lane). Import from it
  the types `PixelBrushSourceLayer`, `PixelBrushStamp`, `PixelBrushFootprint`, `PixelBrushTarget`. Do
  **not** edit it (D4).
- Types from task 01 (`@/types`): `brushLayerApplyDelta`, `brushFrameApplyTo`, `normalizeDeltaList`.
  From task 02: `BrushApplicationOverride`, `BrushLayerTarget`, `isBrushLayerTarget`. `ui/` may import
  `types/**` (the boundary forbids stores/api/mobx only).
- The pixel object's layer ids differ per frame (`LayerStore.addLayerToAllFrames` generates one id per
  frame), which is why a `{ layerId }` target resolves to an **index** and applies by index in every
  target frame (D3 rule 2).
- Output ordering must be deterministic (frame index, then layer index) so the hook's memo produces stable
  plans and tests can assert arrays.

## Steps
1. Create `pixelBrushApply.ts` with the MASTER §3 type block (`PixelBrushApplyLayer`, `PixelBrushApplyFrame`,
   `PixelBrushObjectShape`, `PixelBrushApplyInput`, `PixelBrushApplyGroup`, `PixelBrushPlanEntry`,
   `PixelBrushPlan`) and a header in the sibling's voice: what it decides, what it never sees (grids),
   the id→index rule and why, the culling rules.
2. `resolveBrushLayerTarget(layer, override)`: `override?.layers?.[layer.id]` if `isBrushLayerTarget`,
   else `{ delta: brushLayerApplyDelta(layer) }`.
3. `resolveBrushFrameDeltas(frame, frameIndex, override)`: `override?.frames?.[frame.id]` if it is an
   array → `normalizeDeltaList(list)`; else `brushFrameApplyTo(frame, frameIndex)`.
4. `planPixelBrushTargets(input)`:
   - `current = { frameId: object.frames[currentFrameIndex]?.id, layerId: object.frames[currentFrameIndex]?.layers[currentLayerIndex]?.id }`
     (both may be undefined when the selection is broken → nothing is `current`).
   - for each brush frame `i`, for each delta `d` of `resolveBrushFrameDeltas`: `fi = currentFrameIndex + d`;
     skip unless `0 ≤ fi < object.frames.length`; for each brush layer (bottom → top) with `visible !== false`:
     target = `resolveBrushLayerTarget`; `li` = `currentLayerIndex + delta` or, for `{ layerId }`, the index
     of that id in `object.frames[currentFrameIndex].layers`, else in the first object frame containing it,
     else `currentLayerIndex + brushLayerApplyDelta(layer)`; skip unless `0 ≤ li < object.frames[fi].layers.length`
     and `!object.frames[fi].layers[li].isVariant`; push the layer into the group keyed `${frameId}/${layerId}`.
   - return groups sorted by `(fi, li)`, each `{ frameId, layerId, current, layers }` with `layers` in
     insertion order (frames ascending, then bottom → top).
   Commit after step 4: `brush-apply(06): pixelBrushApply resolver`.
5. Tests (`pixelBrushApply.test.ts`, node lane, small hand-built shapes — 1-cell layers are enough since
   grids are not read):
   - defaults: one frame, two layers, no override, 3-layer object, current (0, 1) → one group at
     `(f0, l1)` with both layers, `current: true`.
   - `applyDelta: -1` on the top layer → two groups `(f0,l0)` [top layer], `(f0,l1)` [bottom]; order by
     layer index.
   - delta below 0 / above the last layer → culled (that layer contributes nothing; a group with no layers
     is never emitted).
   - override `{ layerId }` naming a layer of the current frame → resolved by its index; naming a layer id
     that exists only in frame 2 → that index; naming an unknown id → falls back to the brush default delta.
   - override `{ delta }` beats the brush default; garbage override (`{}` / `{delta: 1.5}`) is ignored.
   - `visible: false` layers skipped; `isVariant` target layers culled.
   - frames: `applyTo: [0, 1, 2]` on brush frame 0, current frame 1 of a 3-frame object → groups in frames
     1 and 2 only (index 3 culled); `applyTo: []` → nothing; default `[i]` fans brush frame 1 to Δ+1.
   - override `frames[frame.id]` beats the brush default and is normalised (`[2, 0, 2]` → 0 and 2).
   - two brush frames landing on the same `(frame, layer)` fold into one group with layers in frame order.
   - `current` is true only for the exact current pair; broken selection (index out of range) → no group
     is `current` and nothing throws.
   - determinism: output equals itself on re-run and is sorted by frame then layer index.
   Commit: `brush-apply(06): resolver tests`.

## Constraints
- No imports from `stores/`, `api/`, `mobx`, React. No grid reads, no `pixels` access anywhere.
- `pixelBrushStamp.ts` is not edited. `toolHandlers.ts` is task 09's.
- Do not clamp or reinterpret deltas beyond `normalizeDeltaList`; culling is by range only.

## Verification
```sh
cd client && bunx vitest run src/ui/canvas/tools             # green
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas  # clean; no max-lines error
cd client && bun run lint:boundaries                         # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none.

## Definition of done
- [ ] Module exports the MASTER type block and the three functions; header documents the rules.
- [ ] Every D3 rule has at least one test; ordering and culling pinned.
- [ ] Boundaries 5/5; eslint clean under `src/ui/**`.
- [ ] Two commits `brush-apply(06):`; no lockfile.
