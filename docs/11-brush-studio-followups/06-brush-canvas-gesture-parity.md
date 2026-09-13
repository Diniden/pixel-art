# 06 — Brush canvas: gesture, camera and view-control parity with the pixel canvas

**Wave:** W2 · **Depends on:** 03
**Touches:** `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/brush/useBrushCamera.ts` (rewritten) · `client/src/containers/brush/useBrushPointerHandlers.ts` · `client/src/containers/brush/__tests__/useBrushPointerHandlers.dom.test.ts` · `client/src/containers/brush/__tests__/useBrushCamera.dom.test.ts` (new)
**Effort:** L

## Objective
The brush canvas is driven by the **same** viewport engine as the pixel and lighting canvases:
two-finger pan + anchored pinch-zoom with the anchor lock and response curve, ctrl/⌘-wheel
zoom about the pointer, plain-wheel pan, middle-button / alt-drag pan, Pencil-vs-finger
arbitration and `pencilOnly` (a lone finger neither draws nor pans — measured, see Context),
a zoom-out floor, debounced pan commit, a re-sync key, and the floating view controls with
**Reset View**. Rendering stays 1:1 + one CSS transform, so blur behaviour is identical to the
pixel canvas by construction; the task also records a measured blur comparison.

## Context — read these before writing anything
- **The engine:** `ui/hooks/useCanvasViewport.ts` (677 lines). Options `:117-159`
  (`containerRef`, `contentWidth/Height` = **`cellWidth * zoom`, never the backing store** —
  `:120-132`; `panOffset`, `onCommitPan?`, `viewZoom?`, `onCommitViewZoom?`, `resyncKey?`),
  return `:161-190` (`viewZoom`, `setViewZoom`, `viewPanOffset`, `setViewPanOffset`, `viewPanRef`,
  `scheduleCommitPan`, `clampPanToViewport` (unused by design since 2026-08-31,
  `CanvasContainer.tsx:5495-5513`), `getTouchCenter`, `getTouchDistance`, `beginPinch`,
  `updatePinch`, `endPinch`, `isPinching`). It binds **native, non-passive** wheel (`:349-421`)
  and two-finger touch listeners (`:562-660`) on `containerRef` (the viewport div, not the
  canvas — `:576-586`), composes two-finger pan into `updatePinch` (`:512-534`), anchors zoom
  with `ZOOM_ANCHOR_MS` (`:67`), `PINCH_EXPONENT` (`:115`), `WHEEL_ZOOM_RATE` (`:109`), commits
  pan after `PAN_COMMIT_MS` (`:106`). `viewZoomFloor(contentWidth, contentHeight)` `:93-100`
  with `MIN_CANVAS_SCREEN_PX = 50`.
- **The small analogue to imitate:** `containers/LightingCanvasContainer.tsx` — hook call
  `:334-373` (`contentWidth = cellWidth * zoom`, `onCommitViewZoom: (z) => camera.setViewZoom(z, viewZoomFloor(...))`),
  `handleResetView` `:386-416` (centres against `contentWidth`, calls `camera.resetView`),
  touch bail `:797` (`if (e.touches.length >= 2 || isPinching()) return;`),
  `combinedScale={zoom * viewZoom}` `:943`, `viewControls={<CanvasViewControls onResetView=… />}` `:953`.
- **Touch arbitration:** `ui/canvas/model/canvasTouchFilter.ts` — `touchesInContainer :82-88`,
  `isStylus :91-93`, `pinchTouches :102-106` (drops the stylus), `drawingTouch(touches, pencilOnly) :148-160`.
  Pixel usage: `CanvasContainer.tsx:5279-5283` (`canvasTouches`), `:5320-5333` (two-finger
  bail cancels drafts), `:5448-5457` (move bails on pinch), `:648`
  `const pencilOnly = viewport.pencilOnly ?? isTouchDevice();`. **Measured: there is no
  single-finger touch pan on the pixel canvas.** `setIsPanning(true)` occurs only at `:4708`
  (mouse middle/alt), so the touch-move pan branch at `:5490-5524` is unreachable from touch
  alone; the comment at `:5335` ("a finger may pan and pinch") means two-finger pan through the
  hook. Do not build a single-finger pan. Middle/alt drag: `:4705-4711` (down), `:4884-4896`
  (move, `+dx/+dy`).
- **View controls:** `ui/components/CanvasViewControls/CanvasViewControls.tsx:59-72` props
  (`onResetView`, `modeButton?`, `onClose?`, `onNudgeOffset?`). Rendered by `CanvasSurface` as a
  sibling of the transformed layout (`CanvasSurface.tsx:456-463`). Task 09 adds `modeButton`/
  `onClose`; this task passes only `onResetView`.
- **Blur model (already at parity, keep it that way):** `CanvasSurface.tsx:298-314` — `cellWidth`
  is 1:1; `:666-677` the single transform; `CanvasSurface.css:131-132,215-216,293-294,386-387`
  `image-rendering: pixelated`; **`:53-72` the layer-promotion trap — never add `will-change`
  or any compositing hint.** `combinedScale` must be computed in exactly one place
  (`CanvasSurface.tsx:316-341`): here `zoom * (viewZoom ?? 1)`.
- **Brush side today:** `containers/BrushCanvasContainer.tsx` (498 lines) — `combinedScale={zoom}`
  `:483`; `containers/brush/useBrushCamera.ts` (78 lines) — own wheel listener, no pinch/pan;
  `containers/brush/useBrushPointerHandlers.ts` (170 lines) — React synthetic touch handlers on
  the canvas, `e.touches.length >= 2` → `zoomBy(d/last)` only (`:114-159`), no filtering, no
  stylus awareness. The 14-row gap table is in `MASTER.md` §4.
- **Store (task 03):** `BrushUIStore implements CanvasCamera` — `panOffset`, `viewZoom`,
  `setPanOffset`, `setViewZoom(z, floor)`, `resetView(centered)`; `zoom` stays px/cell.
- **`max-lines`:** the container is at 379 counted lines of 400. Everything new goes into the
  two `containers/brush/` hooks; the container only wires.
- Debug on device: the dev-only `/api/debug/log` sink exists for iPad-only bugs (owner memory);
  mention it in the manual-check notes rather than guessing at touch behaviour.

## Steps
1. **Measure first (blur).** Before changing code, write down in the report a side-by-side of the
   pixel and brush canvas surface chains as rendered today: the `CanvasSurface` props each
   passes (`cellWidth/Height`, `combinedScale`, `viewPanOffset`, `layerIds`), and a grep proving
   no `will-change`/`filter`/`backdrop-filter`/`transform` exists on any ancestor CSS the brush
   studio adds (`ui/components/Brush*/*.css`, `BrushStudioLayout` has no CSS). Note that today's
   pinch produces a **non-integer `zoom`** (`zoomBy(d/last)`), whereas the pixel canvas keeps
   `zoom` integer and puts the continuous factor in `viewZoom`. After this task the brush does
   the same — that is the most likely visible "blur" (uneven cell edges at e.g. 11.83 px/cell).
2. Rewrite `useBrushCamera.ts` as a thin adapter over `useCanvasViewport`:
   `useBrushCamera({ containerRef, width, height, zoom, camera: brushUI, resyncKey })` →
   returns the hook's result plus `combinedScale = zoom * viewZoom`, `viewZoomFloor`, and
   `handleResetView` (copy `LightingCanvasContainer.tsx:386-416`). Pass
   `panOffset: camera.panOffset`, `onCommitPan: camera.setPanOffset`, `viewZoom: camera.viewZoom`,
   `onCommitViewZoom: (z) => camera.setViewZoom(z, viewZoomFloor(contentWidth, contentHeight))`,
   `resyncKey = `${brushName}:${selectedFrameId}``. Delete the hand-rolled wheel listener —
   the hook owns wheel now (ctrl/⌘ zoom, plain pan). `zoomBy` from pinch is gone: pinch now
   changes `viewZoom`; `brushUI.zoom` is only changed by explicit zoom controls (keep whatever
   sets it today, e.g. none — say so).
3. `useBrushPointerHandlers.ts`: replace the touch block with the pixel model —
   `canvasTouches = touchesInContainer(Array.from(e.touches), containerRef.current)`; on start,
   `if (pinchTouches(startTouches).length >= 2) { abort open stroke; return; }` (the hook's
   native listener runs the pinch); `const touch = drawingTouch(startTouches, pencilOnly)`,
   `pencilOnly = viewport.pencilOnly ?? isTouchDevice()` (read `app.ui.viewport` via the args, not
   inside the hook); on move, bail on `pinchTouches(...).length >= 2 || isPinching()`; when
   `drawingTouch` returns null (lone finger under `pencilOnly`) do nothing. Mouse: middle button
   or alt+left → pan with `+dx/+dy` through `viewPanRef`/`setViewPanOffset`/`scheduleCommitPan`
   (copy `CanvasContainer.tsx:4884-4896`). Remove the `touchDistance` pinch code. Keep the
   existing mouse stroke lifecycle, window `mouseup`, and hover-marker rules.
4. `BrushCanvasContainer.tsx`: `viewPanOffset={viewPanOffset}`, `combinedScale={combinedScale}`,
   `viewControls={<CanvasViewControls onResetView={handleResetView} />}`; the touch listeners
   the hook needs are on `containerRef` (CanvasSurface's container) — confirm which ref
   `CanvasSurface` exposes as the viewport element and pass that one. Cursor: `grab`/`grabbing`
   while panning (copy the pixel container's cursor rule).
5. Tests: `useBrushCamera.dom.test.ts` (hook mounts; ctrl-wheel on the container changes
   `viewZoom` via the camera after the commit debounce (fake timers); plain wheel commits pan;
   reset centres and sets viewZoom 1). `useBrushPointerHandlers.dom.test.ts`: update the pinch
   tests — a two-finger start aborts an open stroke and does NOT call `zoomBy`; a stylus +
   resting finger is a stroke, not a pinch; under `pencilOnly` a lone finger opens no stroke and
   writes nothing; middle/alt drag pans and never opens a stroke.
6. Commit: `brush-followups(06): brush canvas uses useCanvasViewport — pinch/pan/reset parity`.

## Constraints
- Do not edit `useCanvasViewport.ts`, `canvasTouchFilter.ts`, `CanvasSurface/**`, any store,
  `CanvasContainer.tsx`, `LightingCanvasContainer.tsx`. Never add `will-change` anywhere.
- `brushToolContext.ts` is **task 08's** file: do not touch it (leave `touchDistance` exported
  and unused; task 08 or 10 may remove it).
- Keep every tool/selection behaviour exactly as it is; this task changes only camera/gesture.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers            # max-lines must NOT fire on BrushCanvasContainer.tsx
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, desktop + iPad, brush mode) — list each as performed / not performed:
1. Two fingers pan the brush canvas; pinch zooms about the finger midpoint without drift.
2. Pencil + a resting finger keeps drawing (no pinch); with Pencil-only on, a lone finger does nothing (same as the pixel canvas).
3. ctrl/⌘-wheel zooms about the pointer; plain wheel pans; middle-drag / alt-drag pans.
4. Reset View recentres and returns view zoom to 1.
5. Zoom-out floor: the brush cannot be shrunk below ~50 screen px on its long side.
6. **Blur:** at the same on-screen magnification the brush cells are as crisp as pixel-studio
   cells, at integer and non-integer view zoom, on the iPad; if not, capture `combinedScale`,
   `zoom`, `viewZoom` and `devicePixelRatio` through the debug log sink before touching CSS.
7. Switching brush or frame re-seats the view (`resyncKey`).

## Definition of done
- [ ] `useCanvasViewport` drives the brush canvas; hand-rolled wheel/pinch code removed.
- [ ] Touch arbitration via `canvasTouchFilter`; `pencilOnly` honoured; middle/alt/single-finger pan.
- [ ] View controls with Reset View; `combinedScale = zoom * viewZoom` computed once.
- [ ] Blur comparison recorded in the report; tests updated; gate green; one commit.
