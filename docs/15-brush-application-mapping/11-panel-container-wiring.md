# 11 — Panel container wiring

**Wave:** W3 · **Depends on:** 04, 05, 07, 08
**Touches:** `client/src/containers/pixelBrush/buildBrushApplication.ts` (new) · `client/src/containers/pixelBrush/__tests__/buildBrushApplication.dom.test.ts` (new) · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx`
**Effort:** M

## Objective
The rail's Application block is live: `buildBrushApplication(app)` resolves scope, rows, options and
callbacks from the stores and `PixelStudioPanelContainer` passes it as `pixelBrush.application`. Picking a
target writes an object override (object scope) or a brush default (brush scope); the frame field and
reset button write frame deltas the same way.

## Context
- `client/src/containers/PixelStudioPanelContainer.tsx` (425 raw lines — near the 400-code-line
  `max-lines` **warning**; the warning count must not rise, so the builder lives in its own file). The
  `pixelBrush` block `:158-216` builds `PixelStudioBrushInfo` with `size` spread conditionally (`:215`);
  after plan 14 it also resolves `brush = app.brushUI.selectedBrushIn(doc)` and the brush picker props.
  Add **one** line: `...(application ? { application } : {})` where `application = buildBrushApplication(app)`.
- UI contract (task 05): `PixelStudioBrushApplication`, `PixelStudioBrushLayerMapping`,
  `PixelStudioBrushFrameMapping`, `PixelStudioBrushApplyScope` from `@/ui/components/PixelStudioPanel/PixelStudioPanel`;
  helpers from `@/ui/components/PixelStudioPanel/brushApplicationValue` (`BRUSH_APPLY_DEFAULT`,
  `encodeDeltaTarget`, `encodeLayerTarget`, `decodeBrushApplyValue`). `DropdownOption` from the primitive.
- Stores: `app.ui.pixelBrush.applyScope/setApplyScope` (task 04); `app.objects.setBrushLayerTarget/setBrushFrameTargets`
  (task 07); `app.brushStructure.setLayerApplyDelta/setFrameApplyTo` (task 08); `app.brushes.document/projectName/loadState`;
  `app.brushUI.selectedBrushIn(doc)`; `app.currentObject`, `app.currentFrame`. Types: `brushApplicationKey`,
  `brushLayerApplyDelta`, `brushFrameApplyTo`, `isBrushLayerTarget`.
- The container is `observer`; a plain function called during its render has its reads tracked, so
  `buildBrushApplication` needs no MobX of its own. It reads `brush.frames[0].layers` (ids, names,
  `applyDelta`) and `brush.frames` (ids, names, `applyTo`) — never `pixels`.
- Test rigs: `__tests__/PixelStudioPanelContainer.dom.test.tsx` (313 lines; real `ApplicationStore`,
  fake brush api, renders the container, selects the brush tool).

## Steps
1. `buildBrushApplication(app: ApplicationStore): PixelStudioBrushApplication | undefined`:
   - `undefined` unless `brushes.loadState === "loaded"`, a brush is selected, and `app.currentObject` exists.
   - `scope = app.ui.pixelBrush.applyScope`; `key = brushApplicationKey(app.brushes.projectName, brush.id)`;
     `override = object.brushApplication?.[key]`; `L = app.currentFrame?.layers.length ?? 1`.
   - **layers** (reverse of `brush.frames[0].layers`): `value` = in object scope: the override entry if
     `isBrushLayerTarget` (`encodeDeltaTarget` / `encodeLayerTarget`) else `BRUSH_APPLY_DEFAULT`; in brush
     scope: `encodeDeltaTarget(brushLayerApplyDelta(layer))`.
   - **layerOptions**: object scope → `{ value: BRUSH_APPLY_DEFAULT, label: "Brush default (Δ…)" }` is not
     per-row-aware (one option list for all rows), so label it `"Brush default"`; then deltas
     `-(L-1)…+(L-1)` (at least `-1…+1`) plus any stored delta outside that range, labelled
     `Δ0 · current layer` / `Δ-1 · below` / `Δ+1 · above` / `Δ±n`; a `disabled` separator; then the current
     frame's layers **top → bottom** (`encodeLayerTarget(id)`, label = layer name). Brush scope → deltas only.
   - `onLayerTargetChange(brushLayerId, value)`: `decodeBrushApplyValue` → object scope: `default` →
     `setBrushLayerTarget(obj.id, key, brushLayerId, null)`, `delta` → `{ delta }`, `layer` → `{ layerId }`;
     brush scope: `setLayerApplyDelta(brushLayerId, delta)` (`default`/`layer` never occur here; ignore).
   - **frames** (brush order): object scope → `deltas = override?.frames?.[frame.id] ?? brushFrameApplyTo(frame, i)`,
     `isDefault = override?.frames?.[frame.id] === undefined`; brush scope → `deltas = brushFrameApplyTo(frame, i)`,
     `isDefault = frame.applyTo === undefined`.
   - `onFrameDeltasChange(frameId, list | null)`: object scope → `setBrushFrameTargets(obj.id, key, frameId, list)`;
     brush scope → `setFrameApplyTo(frameId, list)`.
   - `onScopeChange` → `app.ui.pixelBrush.setApplyScope`.
   Commit: `brush-apply(11): buildBrushApplication`.
2. `PixelStudioPanelContainer.tsx`: import and spread (one line each). Commit:
   `brush-apply(11): panel container passes pixelBrush.application`.
3. Tests:
   - `buildBrushApplication.dom.test.ts` (dom lane, real `ApplicationStore` with a two-layer, two-frame
     brush and a three-layer, two-frame object): `undefined` before the brush loads / with no object; rows
     reversed for layers, in order for frames; object scope values `default`/`d:-1`/`l:<id>` from an
     installed override; options contain the default row, `Δ-2…Δ+2` for `L = 3`, a disabled separator, and
     three layer options top → bottom; brush scope options have no default row and no layer rows;
     `onLayerTargetChange` writes to the object (assert `object.brushApplication`) in object scope and to
     the brush document (`applyDelta`) in brush scope; `onFrameDeltasChange` likewise; `null` removes;
     `onScopeChange` flips `applyScope`.
   - `PixelStudioPanelContainer.dom.test.tsx`: with the brush tool selected and a brush loaded the
     Application block renders (query the `brush-application` root); choosing a dropdown option updates
     the object's `brushApplication`.
   Commit: `brush-apply(11): builder + container tests`.

## Constraints
- `PixelStudioPanelContainer.tsx` gains at most the import and the spread; nothing else moves.
- No Other Hand Mode changes (`toolWidgets.ts`, `pixelBrushWidgets.ts` untouched).
- No edits under `ui/`, `types/`, `stores/`.
- Never read `layer.pixels` in the builder.

## Verification
```sh
cd client && bunx vitest run src/containers                  # green
cd client && bunx tsc --noEmit && bunx eslint src/containers # clean; warning count ≤ baseline (paste it)
cd client && bun run lint:boundaries                         # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
**Manual (required)** — `bun run dev`, pixel studio, Brush tool, a brush project loaded:
1. The Application block appears under the size controls; layers listed top → bottom, frames in order.
2. Object scope: pick `Δ-1` for a layer → the row shows it; switch to another object → the row shows
   "Brush default"; switch back → `Δ-1` again; reload the page → still `Δ-1` (autosaved).
3. Pick a named layer → the row shows the name; delete that layer in the layer panel → the row falls back
   to "Brush default" (dangling id).
4. Frames: type `0, 1, 2` + Enter → field shows `0, +1, +2`, reset enabled; click reset → default shown,
   reset disabled. Type `abc` → field reverts.
5. Brush scope: set a layer to `Δ+1`, switch to the Brush Studio and press ⌘Z → the value reverts (brush
   history); the header save dot cycles (brush autosave).
Record each observation in the report.

## Definition of done
- [ ] `buildBrushApplication` implements D13; container spreads it; both scopes write to the right store.
- [ ] Dom tests for the builder and the container green.
- [ ] eslint warning count ≤ baseline (state it); boundaries 5/5.
- [ ] Manual checks 1–5 performed and recorded.
- [ ] Three commits `brush-apply(11):`; no lockfile.
