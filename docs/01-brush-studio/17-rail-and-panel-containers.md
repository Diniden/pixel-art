# 17 — Rail & panel containers

**Wave:** W6 · **Depends on:** 11, 12, 13, 14
**Touches:** `client/src/containers/BrushLibraryContainer.tsx` (new) · `client/src/containers/BrushSelectModalContainer.tsx` (new) · `client/src/containers/BrushLayerPanelContainer.tsx` (new) · `client/src/containers/BrushStudioPanelContainer.tsx` (new)
**Effort:** M

## Objective
Four `observer()` containers wire the W2 pure components to the W3–W5 stores: the brush file
list (load on click, inline create), the Header modal (switch/create/rename/delete/refresh), the
layer panel (every callback → `brushStructure`, selection → `brushUI`), and the studio panel
(delta picker → `brushUI.selectedDelta`, plus the existing brush-size control).

## Context
- Container analogues: `containers/ObjectLibraryContainer.tsx` (126 lines; `:97-103` row-model
  projection, thumbnail `draw` + `pixelVersion` revision — **no `React.memo` comparator**, see
  its header), `containers/ProjectSelectModalContainer.tsx` (38 lines; `flowResult(domain.switchProject(name))`),
  `containers/LayerPanelContainer.tsx` (376 lines; read `:11-21` for the callback mapping
  style), `containers/PixelStudioPanelContainer.tsx` (66 lines; injects the colour picker
  element into `PixelStudioPanel`).
- Stores: `app.brushes` (`brushList`, `brushName`, `document`, `isLoading`, `pixelVersion`,
  flows), `app.brushStructure` (task 08 API), `app.brushUI` (ids, delta, `channelTypeIn(doc)`),
  `app.ui.tool` (`brushSize`, `setBrushSize`, `pencilBrushShape`…).
- Components: `BrushLibraryProps` (13), `BrushSelectModalProps` (13), `BrushLayerPanelProps` (12),
  `BrushDeltaPickerProps` (14). `flowResult` from `mobx`; `useStores` from `stores/context.tsx`.
- Thumbnail for the loaded brush: build a `draw(ctx, size)` that calls `createBrushBuffer` +
  `renderBrushFrame` (task 06) for the **selected frame**, then draws the buffer scaled with
  `ctx.imageSmoothingEnabled = false` via an offscreen `canvas`/`putImageData` — put this in a
  small local helper inside `BrushLibraryContainer.tsx` (task 18 makes a per-cell version in
  `containers/hooks/brushCellThumbnail.ts`; do not create that file here).
- Studio panel: render a `Panel` with the `BrushDeltaPicker` on top and, below it, the pencil
  size/shape controls. Read `ui/components/PixelStudioPanel/PixelStudioPanel.tsx:70-105` to see
  which controls exist; reuse the same primitives rather than the whole component (it carries
  origin-colour and gaussian settings that do not apply).

## Steps
1. `BrushLibraryContainer`: `brushes={brushes.brushList.slice()}`, `currentBrush`,
   `currentSize`, `thumbnailDraw` (null when no document), `thumbnailRevision = brushes.pixelVersion + brushes.domainVersion`,
   `isLoading`, `onSelectBrush → flowResult(brushes.switchBrush(name))`,
   `onCreateBrush → flowResult(brushes.createBrush(name, w, h))`.
2. `BrushSelectModalContainer({ onClose })` → props from the flows; `onRenameBrush` →
   `brushes.renameBrush`, `onDeleteBrush` → `brushes.deleteBrush`.
3. `BrushLayerPanelContainer`: rows projected from `document.frames[selectedFrameIndex].layers`
   **reversed** (display top-first), `appliedGroupName` looked up from `document.appliedGroups`;
   every callback to `brushStructure.*`; `onSelectLayer → brushUI.selectLayer`;
   `onCreateAppliedGroup(layerId, name)` = `addAppliedGroup(name)` then `setLayerAppliedGroup(layerId, id)`.
4. `BrushStudioPanelContainer`: `channelType = brushUI.channelTypeIn(brushes.document)`,
   `value = brushUI.selectedDelta`, `onChange → setDeltaChannel`, `onReset → resetDelta`; brush size controls.
5. Commit: `brush-studio(17): brush rail and panel containers`.

## Constraints
- No new `ui/` components; no edits to existing containers or stores.
- No `React.memo` comparators around thumbnail components.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual is deferred to task 19 (these containers are not mounted yet). State that explicitly.

## Definition of done
- [ ] Four containers compile and wire every prop of their components.
- [ ] Gate green; one commit with only Touches files.
