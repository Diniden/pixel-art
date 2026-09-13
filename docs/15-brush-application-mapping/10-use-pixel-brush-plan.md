# 10 — Hook: plan builder and target binder

**Wave:** W3 · **Depends on:** 01, 02, 06
**Touches:** `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/containers/pixelBrush/pixelBrushPlan.ts` (new) · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `client/src/containers/pixelBrush/__tests__/pixelBrushPlan.test.ts` (new)
**Effort:** M

## Objective
`usePixelBrush` returns a `plan: PixelBrushPlan | null` built from the selected brush (all frames, scaled),
the current object's frame/layer **ids**, the object's override for this brush and the current indices —
with `footprint` now the plan's union footprint. A small container-tier module reads the object shape
and binds per-entry samplers. The legacy `stamp` member is still returned (task 12 removes it).

## Context
- `client/src/containers/pixelBrush/usePixelBrush.ts` (207 lines pre-14; after plan 14 it resolves
  `brush = app.brushUI.selectedBrushIn(doc)` and returns `projectName`). Reads `:139-146` (`doc`, `frameId`,
  `pixelVersion`, `domainVersion`, `loadState`, name, the four `ui.pixelBrush` scalars); init effect
  `:133-135`; reset effect keyed on native size `:153-155`; `scaled` memo `:157-176` (`selectedFrameIn(doc)`,
  `scalePixelBrushLayers(frame.layers, …)` — identity requests return the **same** array); `footprint`
  `:178-181`; `stamp` `:184-192` (base colour spread into four scalars); returns `:200-206`. Its header
  explains the memo discipline: grids are read inside memos, never observed, never at pointer rate.
- Test rig: `__tests__/usePixelBrush.dom.test.ts` (457 lines): real `ApplicationStore` with a fake brush
  api, `renderHook`, asserts memo identity across pixel writes and size changes.
- From task 06: `planPixelBrushTargets`, `PixelBrushPlan`, `PixelBrushPlanEntry`, `PixelBrushApplyInput`,
  `PixelBrushObjectShape`. From `pixelBrushStamp.ts`: `pixelBrushFootprint`, `resolvePixelBrushStamp`,
  `PixelBrushTarget`, `PixelBrushSourceLayer`. From `@/types`: `brushApplicationKey`.
- App reads (all computed/observable at scalar or reference level): `app.currentObject` (`ApplicationStore
  :1259`), `app.currentFrame :1265`, `app.currentLayer :1273`, `app.isEditingVariant :1350`,
  `app.ui.timeline.selectedObjectId/FrameId/LayerId`, `app.domain.domainVersion`. `domain.objects` is
  `observableShallow` — frames/layers are plain objects; reading `frame.layers.map(l => l.id)` inside a
  memo keyed on `domainVersion` is the sanctioned pattern.
- Variant editing (MASTER §1): when `app.isEditingVariant`, produce a single legacy group — the selected
  brush frame's visible layers, `current: true`, ids = the current frame/layer ids.

## Steps
1. `pixelBrushPlan.ts` (container tier, may import stores' types but is a plain module):
   - `readObjectShape(object: PixelObject | null): PixelBrushObjectShape | null` — ids and `isVariant`
     only; never touches `pixels`.
   - `currentIndices(object, frameId, layerId): { frameIndex; layerIndex } | null` via `findIndex`.
   - `buildPixelBrushPlan(args: { groups: PixelBrushApplyGroup[]; width; height; base: StampColor }): PixelBrushPlan`
     — `footprint = pixelBrushFootprint(groups.flatMap(g => g.layers), w, h)` (or `null` when no group),
     one `resolvePixelBrushStamp(g.layers, w, h, base)` per group, entries `{ key: `${frameId}/${layerId}`,
     frameId, layerId, current, stamp, target: null }`.
   - `bindPixelBrushTargets(plan, lookup: (frameId, layerId) => PixelData[][] | null, currentTarget: PixelBrushTarget | null, getPixelColor): PixelBrushPlan`
     — returns a new plan whose `current` entry gets `currentTarget` and every other entry gets
     `{ sample: (x, y) => getPixelColor(lookup(frameId, layerId)?.[y]?.[x]), touched: new Set() }`. Pure
     w.r.t. its inputs; `lookup` is called lazily inside `sample`.
   - `legacyGroup(frameLayers, frameId, layerId): PixelBrushApplyGroup[]` for the variant case.
   Unit tests in `__tests__/pixelBrushPlan.test.ts` (node lane): shape reading ignores grids and carries
   `isVariant`; indices; `buildPixelBrushPlan` produces one entry per group with union footprint and the
   right `current`; `bindPixelBrushTargets` gives the current entry the supplied target object (same
   reference) and non-current entries samplers that read **their own** layer via `lookup` (fake lookup
   returning distinct grids per id; assert `sample(0,0)` differs per entry) and independent `touched` sets.
   Commit: `brush-apply(10): pixelBrushPlan helpers + tests`.
2. `usePixelBrush.ts`:
   - new reads: `object = app.currentObject`, `selectedObjectId/FrameId/LayerId`, `isEditingVariant`,
     `objectDomainVersion = app.domain.domainVersion`, `projectName`.
   - `scaled` memo now scales **every** brush frame (`frames.map(f => ({ id: f.id, applyTo: f.applyTo, layers: scalePixelBrushLayers(f.layers, …).map((l, i) => ({ ...l, id: f.layers[i].id, applyDelta: f.layers[i].applyDelta })) }))`
     — keep `id`/`applyDelta`/`colorSource`/`visible`/`channelType` alongside the scaled `pixels`; identity
     scaling keeps the same layer arrays as today).
   - `groups` memo: `shape = readObjectShape(object)`, indices from the selection; if `!shape || !indices`
     → `[]`; if `isEditingVariant` → `legacyGroup(selectedFrame.layers, currentFrameId, currentLayerId)`;
     else `planPixelBrushTargets({ brush: scaled, override: object.brushApplication?.[brushApplicationKey(projectName, brush.id)], object: shape, currentFrameIndex, currentLayerIndex })`.
     Keys: `[scaled, object, objectDomainVersion, selectedObjectId, selectedFrameId, selectedLayerId, isEditingVariant, projectName, brush?.id]`.
   - `plan` memo: `buildPixelBrushPlan({ groups, width, height, base: { r, g, b, a } })`; keys `[enabled, groups, scaled, r, g, b, a]`.
   - `footprint` = `plan?.footprint ?? null` (replace the old memo). Keep `stamp` (legacy: the selected
     frame's fold, as today) until task 12.
   - return `{ footprint, stamp, plan, size, loadState, projectName }`.
   Commit: `brush-apply(10): usePixelBrush builds a PixelBrushPlan`.
3. Dom tests (`usePixelBrush.dom.test.ts`):
   - default brush, 3-layer object, current layer 1 → `plan.entries` has one `current` entry; footprint
     equals the legacy footprint.
   - set `applyDelta: -1` on the brush's top layer (via the brush store / document install) → two entries,
     the non-current one at the layer below; footprint unchanged (same cells).
   - object override `{ layerId }` for a brush layer (install a project object with `brushApplication`
     via `app.domain` fixtures) → the entry targets that layer id; switching `selectedObjectId` to an
     object without the override → back to one entry.
   - two-frame brush, default `applyTo` → entries in the current and next frame; on the last frame → only
     the current frame (culled).
   - memo discipline: a pixel write to the current layer (`app.pixels.setPixels`) leaves `plan` **the same
     reference** when `domainVersion` did not change; adding a layer (`app.layers.addLayer`) produces a
     new plan; changing the colour produces a new plan but the same `groups`… (assert via `plan.entries[0].stamp !== prev`).
   - variant editing: select a variant layer → exactly one entry, `current: true`.
   Commit: `brush-apply(10): hook plan tests`.

## Constraints
- Do not remove `stamp` or change `PixelBrushState`'s existing members (task 12). `CanvasContainer.tsx`
  is not touched.
- Never observe a grid: `pixels` is read only inside `scalePixelBrushLayers`/`resolvePixelBrushStamp`
  calls within memos; no grid in a dependency array as content.
- The reset-size effect stays keyed on the brush's native `width`/`height` (plan 13/14 rule).
- No file under `ui/` is edited.

## Verification
```sh
cd client && bunx vitest run src/containers/pixelBrush       # green
cd client && bunx tsc --noEmit && bunx eslint src/containers/pixelBrush   # clean; usePixelBrush.ts under 400 code lines (or move a helper to pixelBrushPlan.ts)
cd client && bun run lint:boundaries                         # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none (bound in task 12).

## Definition of done
- [ ] `pixelBrushPlan.ts` helpers with unit tests; `usePixelBrush` returns `plan` and a plan-derived `footprint`, `stamp` still present.
- [ ] Dom tests cover default/delta/override/frames/culling/memo identity/variant.
- [ ] eslint warning count unchanged (no new `max-lines` warning); boundaries 5/5.
- [ ] Three commits `brush-apply(10):`; no lockfile.
