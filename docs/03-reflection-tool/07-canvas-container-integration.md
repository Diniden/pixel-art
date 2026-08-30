# 07 — `CanvasContainer` integration: gesture, mirroring, animated overlay

**Wave:** W2 · **Depends on:** 01, 02, 03, 04, 05
**Touches:** `client/src/containers/CanvasContainer.tsx`
**Effort:** L

## Objective
With the Reflection tool selected, press-drag-release on the canvas (mouse **and** touch)
draws a guide line snapped to cell corners and commits it to `app.reflection`. Every
committed line is rendered as an animated dotted line on the dedicated overlay canvas,
regardless of the selected tool or layer. Every pixel write from any drawing tool is
mirrored across all lines, and shape previews show their mirrored cells too.

## Context
`CanvasContainer.tsx` is 2634 lines; read its header (`:1-60`) first. The seams:

| Concern | Where | What to do |
| --- | --- | --- |
| Gesture arbitration | `isGestureTool` `:277-284`; `handleMouseDown` `:1915` (origin branch `:1925-1929`); `handleMouseMove` `:2092`; `handleMouseUp` `:2273`; `handleTouchStart` `:2371` (gesture-tool bail `:2431`); `handleTouchMove` `:2436`; `handleTouchEnd` `:2525` (bail `:2520`) | Add `"reflection"` to `isGestureTool`. Handle it **ahead of the table** like `origin`: down → `getCornerCoords` → `app.reflection.beginDraft`; move (while draft) → `updateDraft`; up/leave → `commitDraft`. Must never call `pointer.beginStroke`, `strokeControl`, or `startDrawing` — a reflection gesture is not a history stroke. Touch: the gesture-tool bail at `:2431`/`:2520` currently returns early for gesture tools; add the reflection branch **before** that bail on all three touch handlers (single-touch only; a pinch must cancel the draft via `cancelDraft`). |
| Corner coords | `getPixelCoords` `:621-635`, `getOriginCoords` `:637-651` | Add `getCornerCoords` using `screenToPixel(..., "corner")` (task 02). |
| Write mirroring | `actions.setPixels` `:464-465` | `app.pixels.setPixels(expandWrites(pixels, app.reflection.lines, w, h), app.selectionUI.writeOptions)`. `w`/`h` = the editable grid dims used elsewhere in this memo (`app.editableGrid?.dims` or the same `gridWidth/gridHeight` the tool context uses — pick the one available inside the `useMemo` and add it to the deps; `app.reflection.lines` is read at call time, not captured). Mirror-then-mask is the locked order (D5): images outside an `editMask` selection are dropped by `PixelStore.allows`. |
| Preview mirroring | `actions.setPreviewPixels` `:506-508` | Wrap with `expandWrites(points, lines, w, h)` so line/rect/ellipse previews show images. |
| Overlay render | hover-canvas pattern: `hoverCanvasRef`, `renderHover` `:1252-1296`, `useCanvasRender(renderHover, [renderHover])` `:1297-1302`; `renderOverlay` `:1354-1414` for view-origin math | Add `reflectionCanvasRef`, a `renderReflection` `useCallback` that clears the canvas and, when `lines.length || draft`, computes `reflectionSegments(lines, draft, zoom, ox, oy)` and calls `drawReflectionLines(ctx, segs, phaseRef.current)`. Schedule with `useCanvasRender(renderReflection, [renderReflection])`; `renderReflection` deps include `app.reflection.lines`, `app.reflection.draft` (both observableRef → identity changes), `zoom`, `canvasWidth/Height`, `isEditingVariantResolved`, `viewMinX/Y`. Drive animation with `useDashTicker(hasLines || Boolean(draft), (p) => { phaseRef.current = p; invalidateReflection(); })` — phase in a **ref**, never state (see the 2026-08-28 "unable to slide and draw" note at `:1141-1180`). |
| Surface prop | JSX `:2603-2631` | Pass `reflectionCanvasRef` to `CanvasSurface`. |
| Cursor | `:2555-2565` | `"reflection"` → `"crosshair"` (falls through already; add an explicit branch for documentation). |
| Hover marker | `toolFootprint` class 3 gives a 1-cell marker | Suppress the marker while the reflection tool is active (find where `applyMarker` decides; simplest: treat like `origin` if origin is suppressed, else leave it — record the choice). |

Types: `app.reflection.lines` (store `ReflectionLine`) and `ui/canvas/model/reflection.ts`'s
`ReflectionLine` are structurally identical; pass through without casts. If task 03
declared its own interface, this is where you may replace the local declaration with a
`type` import **only if** the boundary rules allow `stores/ → ui/` type imports (they do
for type-only imports — `ToolUIStore` imports from `../../types`; check `lint:boundaries`
output). Otherwise keep both.

## Steps
1. Corner coords + gesture handling (mouse), then touch. Commit:
   `feat(canvas): reflection gesture draws corner-snapped guide lines`.
2. Overlay canvas + painter + ticker. Commit: `feat(canvas): animated reflection guides`.
3. Write + preview mirroring. Commit: `feat(canvas): mirror pixel writes across reflection lines`.
4. Run the full verification and all manual checks; record results in HANDOFF.

## Constraints
- Only `CanvasContainer.tsx` may change. If a needed export is missing from a W1 module,
  stop and record it in HANDOFF as BLOCKED rather than editing that module.
- Never route the reflection overlay through the main `render` (`:708`) or add anything
  to `[render, pixelVersion]`.
- Never call `beginStroke`/`endStroke` for a reflection gesture; never add reflection
  lines to history.
- `moveLayerPixels`, `moveSelectedPixels`, `deleteSelectionPixels` are **not** mirrored
  (locked D5). Lighting studio is untouched.
- No `useState` per pointer sample.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint . 2>&1 | tail -3        # 0 errors
cd client && bunx vitest run 2>&1 | tail -6      # all green, no snapshot updates
cd client && bun run lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # empty
```
Manual (all required, `bun run dev`, a throwaway project — **not** "Base Unit"):
1. Mouse: R, drag from left edge to right edge across the middle → dotted line appears
   *between* rows, animates, stays after releasing.
2. Switch to Pencil, draw on one side → identical pixels appear mirrored. Eraser, Fill,
   Line, Rectangle, Ellipse, Square brush each mirror. Rect preview shows mirrored cells
   while dragging.
3. Undo once → both the original and the mirrored pixels revert together (one entry).
4. Two lines (vertical + horizontal presets from the panel) → one pencil dot yields 4.
5. Switch layer, switch frame → lines still shown and still mirror. Switch project → lines gone.
6. Touch (iPad or DevTools touch emulation): drag draws a line; pinch during a drag
   cancels the draft, no stray line; drawing still slides smoothly (the 2026-08-28 regression).
7. Zoom/pan → lines stay glued to the grid; variant-edit mode → lines offset correctly.
8. Delete every line → animation stops (check no rAF in the Performance panel), pixels no
   longer mirror.
9. StrictMode (dev) → exactly one ticker (no double-speed ants).
10. Selection in `editMask` behaviour with a line crossing the selection → images outside
    the mask are dropped (documented asymmetry), no crash.
11. 100-pixel pencil drag with 2 lines: still ≤ 16 ms/frame in the Performance panel.

## Definition of done
- [ ] All three commits landed; gate output pasted into HANDOFF.
- [ ] All 11 manual checks performed and their results written down (pass/fail each).
- [ ] No history entry for adding/removing lines; one entry per mirrored stroke.
