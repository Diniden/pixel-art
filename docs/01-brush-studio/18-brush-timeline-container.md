# 18 — BrushTimelineContainer

**Wave:** W6 · **Depends on:** 06, 11
**Touches:** `client/src/containers/BrushTimelineContainer.tsx` (new) · `client/src/containers/hooks/brushCellThumbnail.ts` (new)
**Effort:** M

## Objective
The brush studio's bottom rail: the existing pure `TimelineView` shows frames × layers with
per-cell thumbnails, click selects frame+layer, layer headers rename/move up/down (uniform
across frames), frame add/duplicate/delete/reorder, and a play button cycling frames every
200 ms. No frames-view, no variant view, no per-frame layer drag.

## Context
- Pure component: `ui/components/TimelineView/TimelineView.tsx:57-105` (`grid`, `frameIds`,
  `maxLayers`, `selectedFrameIndex`, `layerHeaders`, `isPlaying`/`onTogglePlayback`/`onOpenPreview`,
  `viewModeDropdown: ReactNode`, `onAddLayer`, `canMoveUp/Down`, `onMoveLayerUp/Down`, header
  click/hover/rename props, `renderCell`, `renderEmptyCell`, `previewModal?`), `TimelineCell.tsx`
  (`TimelineCellProps`, `:52 rowIndex`), `timelineTypes.ts:18-48` (`TimelineCellData`,
  `TimelineLayerHeader`). Read the whole of `TimelineView.tsx` to see what is required vs optional.
- Existing container to mine: `containers/TimelineViewContainer.tsx` (583 lines) — grid
  construction, `:304-335` the across-all-frames move (the semantics you keep), `:451-477` the
  per-frame drag (the semantics you **omit** — do not pass drag handlers), `containers/TimelineCellContainer.tsx`
  (`ThumbnailCanvas` with `draw` + `pixelVersion` revision), `containers/hooks/timelineCellThumbnail.ts:32,73`.
- Playback precedent: `ui/components/FrameTimeline/FrameTimeline.tsx:226-256` — a 200 ms
  `window.setInterval`, cleared on unmount and on toggle. Here the flag lives in
  `brushUI.isPlaying`; the container owns the interval in a `useEffect` keyed on it and calls
  `brushUI.selectFrame(nextId)`.
- Frame ops: `brushStructure.addFrame/duplicateFrame/deleteFrame/renameFrame/reorderFrame`;
  layer ops: `addLayer`, `renameLayer`, `moveLayer(id, "up"|"down")`.
- `viewModeDropdown`: pass a static label element ("Timeline") — there is only one view mode.
- Thumbnails: `renderBrushLayer` (task 06) into a `PixelBuffer`, then draw scaled into the
  thumbnail `ctx` (copy the scaling maths from `timelineCellThumbnail.ts:32-70`, using
  `Math.min` of both ratios so non-square brushes fit).

## Steps
1. `containers/hooks/brushCellThumbnail.ts`:
   `makeBrushCellThumbnailDraw(layer: BrushLayer, width, height): (ctx, size) => void` — pure
   apart from canvas APIs; cache one `PixelBuffer` per call site if cheap, else allocate.
2. `BrushTimelineContainer` (`observer`): build `grid[frameIndex][rowIndex]` from the document
   (row 0 = **bottom** layer, matching `TimelineCellData.rowIndex` semantics — read
   `timelineTypes.ts` comment), `layerHeaders` from frame 0's layers, `selectedFrameIndex` from
   `brushUI`, `renderCell` → `<TimelineCell …>` with `ThumbnailCanvas` (revision =
   `brushes.pixelVersion`), `renderEmptyCell` → a plain empty cell (cannot happen with the
   uniform invariant, but the prop is required). Frame toolbar callbacks → `brushStructure`.
   Playback effect as above. `onOpenPreview` → no-op with a tooltip "Preview arrives later"
   (or omit if optional).
3. Commit: `brush-studio(18): BrushTimelineContainer with 200ms playback`.

## Constraints
- Do not edit `TimelineView/**`, `TimelineViewContainer.tsx`, `TimelineCellContainer.tsx`, or stores.
- No per-frame layer reordering handlers; no variant props.
- Interval must be cleared on unmount, on `isPlaying=false`, and when the document changes.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual deferred to task 19 (not mounted yet) — state it. Include a unit test only if
`TimelineViewContainer` has one to copy; otherwise none is required for this wave.

## Definition of done
- [ ] Container renders `TimelineView` from the brush document with thumbnails and frame/layer ops.
- [ ] Playback effect implemented with cleanup.
- [ ] Gate green; one commit with only Touches files.
