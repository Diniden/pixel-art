# 16 — BrushCanvasContainer

**Wave:** W6 · **Depends on:** 06, 11
**Touches:** `client/src/containers/BrushCanvasContainer.tsx` (new) · `client/src/containers/brush/brushToolContext.ts` (new) · `client/src/containers/brush/__tests__/brushToolContext.test.ts` (new)
**Effort:** L

## Objective
An `observer()` container renders the selected brush frame (colourised deltas over a
checkerboard, nearest-neighbour upscaled, grid lines) into `CanvasSurface`, shows the hover
marker, supports wheel/pinch zoom via `brushUI`, and drives the shared tool handlers for
**pixel, eraser, line, rectangle, ellipse, fill-square** on the selected brush layer, with each
stroke being one undo entry in the brush history. Flood-fill / eyedropper / move / selection
are wired in tasks 20–21 and must be *visibly inert* (no crash) until then.

## Context — read these before writing anything
- Structure analogue: `client/src/containers/LightingCanvasContainer.tsx` (714 lines) — refs
  `:171-175`, `useCanvasRender` usage `:509-514`, `renderNormalEdit` at `:435-444`. Copy its
  organisation (render callbacks → pointer handlers → JSX), not its lighting logic.
- Tool plumbing analogue: `client/src/containers/CanvasContainer.tsx` `getToolContext :1817-1887`
  (⚠️ `:1808-1810` — exactly one stroke-cursor ref, adopt the hook's `lastStrokePixelRef`),
  `actions.setPixels :464`, stroke begin/end via `:500-501` (there it is the shared
  `strokeControl`; here use `app.brushes.history.beginTransaction(label)` / `endTransaction()`
  directly), `finishDrawingStroke :2253-2271` (shape commit on release), `isGestureTool :277-284`.
- Hooks/ui pieces (all already pure):
  `ui/hooks/useCanvasPointer.ts:62-96` (`currentTool`, `getToolContext`, `getCoords`,
  `startDrawing`, `isDrawing`, `drawStartPoint` → `beginStroke/continueStroke/endStroke`),
  `ui/hooks/useCanvasRender.ts:49`, `ui/canvas/model/coords.ts:76 screenToPixel`,
  `ui/canvas/render/canvasBackground.ts` (`backgroundTheme`, `paintCheckerboard`, `gridLinePath`, `strokeGrid`),
  `ui/canvas/render/renderNormalEdit.ts:75` (upscale a `PixelBuffer`), `ui/canvas/render/renderHoverMarker.ts`,
  `ui/canvas/tools/toolFootprint.ts`, `ui/canvas/tools/toolHandlers.ts:51-125` (`ToolContext`,
  `getToolHandler`), `ui/canvas/tools/brushStamp.ts` (shape fns), geometry helpers in
  `components/Canvas/drawingUtils.ts` (`getLinePixels`, `getRectanglePixels`, `getEllipsePixels`, `getSquarePixels`, `getCirclePixels`).
- Surface: `ui/components/CanvasSurface/CanvasSurface.tsx:78-149` — five canvas refs, `containerRef`,
  size, `viewPanOffset/viewZoom`, cursor, overlay flags, seven pointer callbacks, `viewControls?`.
  Set the frame/trace overlay flags false.
- Renderer: `renderBrushFrame` / `createBrushBuffer` (task 06). Redraw deps: `app.brushes.pixelVersion`,
  `app.brushes.domainVersion`, `brushUI.selectedFrameId`, `brushUI.zoom`, `brushUI.panOffset`,
  `ui.viewport.lightGridMode`.
- Shared transient stroke state: `app.canvasInteraction` (`isDrawing`, `drawStartPoint`,
  `previewPixels`, `CanvasInteractionStore.ts`). Reuse it; do not add a second one.
- Tool settings: `app.ui.tool` (`selectedTool`, `brushSize`, `pencilBrushShape`, `eraserShape`,
  `shapeMode`, `borderRadiusOrZero`). Delta: `app.brushUI.selectedDelta`.
- D19: handlers receive a dummy `currentColor` (`{r:0,g:0,b:0,a:255}`); every `ToolPixelWrite`
  maps to `{ x, y, value: color === 0 ? 0 : delta }` where `delta` is a **copy** of
  `selectedDelta` (tuple literal) so later slider edits cannot alias painted cells.
- Boundaries: containers may import stores, `ui/**`, `utils/**`, `components/Canvas/drawingUtils`.

## Steps
1. `containers/brush/brushToolContext.ts` — pure helpers (no React, no MobX):
   ```ts
   export function mapWritesToBrushCells(writes: readonly ToolPixelWrite[], delta: BrushDelta): BrushCellWrite[]
   export function isBrushInertTool(tool: string): boolean   // "origin" | "reference-trace" | "flood-fill" | "gaussian-fill" | "eyedropper" | "move" | "selection" until tasks 20/21 remove entries
   export function buildBrushToolContext(args: {...}): ToolContext  // assembles the ToolContext from plain inputs (grid size, brush settings, delta, callbacks)
   ```
   Test `mapWritesToBrushCells` (erase → 0; paint → copy of delta, not the same reference) and `isBrushInertTool`.
2. `BrushCanvasContainer.tsx` (`observer`, no props needed beyond an optional `className`):
   - Derive `doc`, `frame`, `layer` from `app.brushes.document` + `brushUI` ids. If no document:
     render `CanvasSurface` with a zero-size canvas and an `EmptyState` overlay ("Create or select a brush").
   - `render` callback: size canvas to `width*zoom × height*zoom`; `paintCheckerboard`; build a
     `PixelBuffer` once per `(width,height)` in a ref and `renderBrushFrame` into it; upscale with
     `renderNormalEdit`; `strokeGrid` when zoom ≥ 8. Schedule via `useCanvasRender(render, [render, pixelVersion, domainVersion])`.
   - Hover marker on the hover canvas using `toolFootprint` + `renderHoverMarker` (copy the
     lighting container's approach); skip on touch.
   - `getCoords` via `screenToPixel` with the brush geometry (zoom, pan, container rect).
   - `useCanvasPointer` with `getToolContext = () => buildBrushToolContext({...})` whose
     `setPixels` = `app.brushPixels.setCells(mapWritesToBrushCells(writes, delta))`,
     `beginStroke` = `app.brushes.history.beginTransaction(label)`,
     `endDrawing` = `endTransaction()` + `canvasInteraction.endDrawing()` (mirror the names the
     store actually exposes — read `CanvasInteractionStore.ts`), `setPreviewPixels` →
     `canvasInteraction`, `linePreview/rectanglePreview/ellipsePreview` via `drawingUtils`,
     `squarePixelsAt` via `getSquarePixels`, and `floodFillAt/gaussianFillAt` returning `[]` (task 20).
   - Mouse + touch handlers: if `isBrushInertTool(tool)` do nothing; else `beginStroke/continueStroke/endStroke`;
     on release, if a shape tool has `previewPixels`, commit them (one transaction) like
     `finishDrawingStroke`. Pinch/wheel zoom: `brushUI.zoomBy`; pan with space/middle-drag is
     optional — if omitted, say so.
   - Cursor: crosshair for paint tools, default when inert.
3. Keep the container ≲ 400 lines; push pure math into `containers/brush/`.
4. Commit: `brush-studio(16): BrushCanvasContainer with stroke tools`.

## Constraints
- Do not edit `CanvasContainer.tsx`, `LightingCanvasContainer.tsx`, any `ui/**` file, or any store.
- Never read grid contents inside the observer render path — only in the rAF `render` callback (R2).
- Do not use the shared `editorHistory`/`strokeControl`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual is **not possible until task 19 mounts this container**. For this task, verify by
temporarily rendering `<BrushCanvasContainer />` inside the task-03 placeholder branch of
`AppContainer.tsx` **without committing that edit** (`git stash` it or revert before commit;
state in the report that you did), create a brush via `curl` (task 02) then reload, and check:
- Pencil paints mid-grey (127) cells at delta 0; set L=+255 in a quick console tweak
  (`app.brushUI.setDeltaChannel(2, 255)` via a temporary `window.__app` you also do not commit) → blue-ish 255 in B.
- Eraser clears; line/rect/ellipse preview then commit on release; ⌘Z undoes one whole stroke.
- 100-cell drag at zoom 16 is smooth (no visible lag); DevTools Performance shows frames < 16 ms.
- StrictMode (dev) does not double-record strokes.
Report each check with what you observed.

## Definition of done
- [ ] Container renders the brush frame and hover marker; six stroke tools work; one undo per stroke.
- [ ] Inert tools do nothing (no exceptions).
- [ ] Helper module + tests; container ≲ 400 lines.
- [ ] Manual checks performed via the temporary mount and reported; the temporary edit is not committed.
- [ ] Gate green; one commit with only Touches files.
