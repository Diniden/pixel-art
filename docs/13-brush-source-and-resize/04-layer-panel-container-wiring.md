# 04 — Containers: project `colorSource` into the rows and route the callbacks

**Wave:** W3 · **Depends on:** 02, 03
**Touches:** `client/src/containers/BrushLayerPanelContainer.tsx` · `client/src/containers/BrushTimelineContainer.tsx` · `client/src/containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` (new)
**Effort:** S

## Objective
The Brush Studio's layer panel creates layers with the chosen colour source, shows each
layer's source badge, and changes it through `setLayerColorSource`. The timeline's
add-layer button inherits the selected layer's source, as it already inherits its channel.

## Context
- `BrushLayerPanelContainer.tsx` (134 lines): row projection `:75-93` (add
  `colorSource: brushLayerColorSource(layer)`); `onAddLayer` `:103-106` (now receives
  `(channelType, colorSource)` → `brushStructure.addLayer(name, channelType, colorSource)`);
  add `onSetColorSource={(id, s) => brushStructure.setLayerColorSource(id, s)}`.
- **Second `addLayer` call site:** `BrushTimelineContainer.tsx:255-263` — pass
  `brushUI.selectedLayerIn(doc)`'s source via `brushLayerColorSource(selected ?? {})`
  falling back to `"selected"`, mirroring the channel inheritance on `:261`.
- No container DOM test exists for the layer panel today. Harness to copy:
  `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx:44-70` (real
  `ApplicationStore({ autoSaveEnabled: false })`, `StoreProvider`, `runInAction`) and the
  brush installer from `containers/__tests__/pixelBrushTool.dom.test.tsx:187-193`
  (`app.brushes.installDocument(doc)`, `loadState = "loaded"`, `brushName`).

## Steps
1. Wire the two containers as described. Keep the `useStores()` reads at the layer-count
   level — never read a grid in render.
2. New `BrushLayerPanelContainer.dom.test.tsx`: install a 2-layer brush document (one
   `"target"`); assert both badges render (`getByLabelText("Colour source: TGT")`), that
   clicking the `SEL` badge → "Target pixel" calls through to the store (the document's
   layer gains the key in every frame, `brushes.history` has one more entry), and that the
   "+" flow with "Target pixel" then "RGB" produces a new layer with `colorSource: "target"`.
3. Commit: `brush-source(04): layer panel + timeline containers pass the colour source`.

## Constraints
- Only the three files above. No `observer()` outside containers; no store import in UI.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/containers && bunx vitest run src/containers/__tests__/BrushLayerPanelContainer.dom.test.tsx src/containers/brush
```
Manual (`bun run dev`, Brush Studio): create a layer via "+" with Target pixel; its row
shows `TGT`; ⌘Z removes the layer; change a layer's source from the badge; ⌘Z reverts the
badge; the timeline's add-layer button gives the new layer the selected layer's source.

## Definition of done
- [ ] Rows show the source badge from the document; both callbacks reach the store.
- [ ] Timeline add-layer inherits the selected layer's source.
- [ ] New container test green; manual checks performed and listed.
