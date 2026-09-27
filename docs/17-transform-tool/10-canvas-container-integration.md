# 10 — `CanvasContainer` integration

**Wave:** W4 · **Depends on:** 01, 07, 08, 09
**Touches:** `client/src/containers/CanvasContainer.tsx` · `client/src/containers/__tests__/transformTool.dom.test.tsx` (new) · `client/src/containers/__tests__/CanvasContainer.dom.test.tsx`
**Effort:** L

## Objective
The transform tool works end to end with mouse and touch: with no selection it selects; with one it
shows the frame and handles, drags scale / rotate / translate the lifted pixels with a live
bucketised preview and the right cursor, Enter / Escape / tool switch / new selection commit, and
pinch cancels the drag. The standard marching ants and mask fill are hidden while a session is
active; the hover marker is suppressed for the tool.

## Context
- `client/src/containers/CanvasContainer.tsx` (6193 lines; over `max-lines` already — the warning
  count must not rise, and every addition here is a binding, not logic). Sites (measured on
  `96e0284`; re-grep on your branch):
  - selection closures `beginSelectionAt :4567`, `updateSelectionAt :4643`, `commitSelection :4705`;
    their call sites test `currentTool === "selection"` in mouse down `:4777+`, move `:4941+`, the
    window mouseup `:5269-5281`, touch start `:5321+` (`:5409-5420` documents the selection branch
    being placed **before** the `isGestureTool` bail), move `:5575+`, end `:5675+`, cancel.
  - `isGestureTool :388-397`; window mousemove forwarder gated on `shapeDragOpenRef` `:5248-5267`;
    pinch reset `:5362-5367` / `:5491`; cursor IIFE `:5761-5774` → `cursor` prop `:6151`;
    hover marker suppression for reflection `:2277`; `renderChrome` mask fill `:2036-2052` and drag
    preview `:2056-2094`; chrome props `marchingAnts :5958-5976`, `originCross :5989-6007`; overlay
    scheduler precedent `:2732-2738` (`invalidatePoseRef`) and the pose canvas ref `:522` / `:6120`;
    `getCornerCoords :1219-1231` (wrapper shape); keyboard wiring `:4148-4194`; `combinedScale :6142`.
- From task 09: `useTransformGesture`, `liftTransformSource`. From task 07: `transformCanvasRef`,
  `transformChrome` props. From task 05: `transformFrameOverlay`, `transformPreviewCells`,
  `drawTransformPreview`. From task 02: `transformQuad`, `transformHandles`. From task 08:
  `app.commitTransform`, `app.transform`, keyboard options. From task 03: the `"float"` mode.
- Integration test rig: `client/src/containers/__tests__/selectionTouch.dom.test.tsx` (756) —
  **stub `getBoundingClientRect` to a `CELL_PX` box** (`:39-51`) or every event maps to `null` and
  the test passes vacuously; `createStubContext` from `@test/canvasStub`; real touch events; assert
  on stores and rendered SVG. `pixelBrushTool.dom.test.tsx` (600) for history assertions.

## Steps
1. Bindings: `getFloatCoords` wrapper (mode `"float"`, beside `getCornerCoords`); `transformCanvasRef`;
   `const transformGesture = useTransformGesture(useMemo(() => ({ app, getFloatCoords, getCombinedScale: () => combinedScaleRef.current, lift: () => liftTransformSource(app) }), [app, getFloatCoords]))`
   (keep `combinedScale` in a ref updated where it is computed so the deps object stays stable);
   `isGestureTool` gains `"transform"`; `isSelectionLikeTool(tool)` helper = `selection | transform`
   used wherever `currentTool === "selection"` gates the selection closures.
2. Arbitration (mouse down / move / window mouseup; touch start / move / end / cancel): for the
   transform tool call `transformGesture.pointerDown/Move/Up` **first** (touch: before the
   `isGestureTool` bail and the `!coords || !layer` guard; use the `drawingTouch` from
   `canvasTouchFilter` as the selection branch does); when it returns `false`, fall through to the
   selection-like branches. Mouse modifiers `{ uniform: e.shiftKey, snap: e.shiftKey }`; touch
   `{ uniform: false, snap: false }`. Window mousemove forwarder: also forward while
   `transformGesture.dragOpenRef.current`. Pinch start and touchcancel → `transformGesture.cancel()`.
   Tool change → `transformGesture.resetCursor()` (effect on `currentTool`).
   Commit: `transform(10): gesture arbitration (mouse + touch)`.
3. Rendering: cursor IIFE → `currentTool === "transform" ? transformGesture.cursor : …`; hover marker
   returns `[]` for `"transform"` (like reflection); `renderChrome` skips the mask fill and the
   move-pixels preview when `app.transform.session` (read via a ref updated by the reaction below,
   not observed in the render); `marchingAnts` prop is `undefined` while a session is active;
   `transformChrome = useMemo(() => session && params ? transformFrameOverlay(transformQuad(params, session.bounds), transformHandles(quad)) : undefined, [session, params])`
   where `session`/`params` are read from `app.transform` in the observer render (one `observable.ref`
   read each — the same cost class as `pixelDragOffset`).
   Preview: `useCanvasRender((scope) => { const ctx = transformCanvasRef.current?.getContext("2d"); … drawTransformPreview(ctx, transformPreviewCells(result, source, gridWidth), viewMinX, viewMinY, cellWidth, cellHeight) }, [])`
   stored in an `invalidateTransformRef`, driven by a MobX `reaction(() => [app.transform.session, app.transform.params], () => invalidate())`
   registered in an effect (disposed on unmount); when the session is null the painter just clears.
   Keyboard options: `transformActive: app.transform.isActive`, `commitTransform: () => app.commitTransform({ selectFollows: true })`,
   `nudgeTransform: (dx, dy) => app.transform.nudge(dx, dy)`.
   Commit: `transform(10): cursor, chrome, preview scheduler, keyboard`.
4. `transformTool.dom.test.tsx` (real `ApplicationStore` + `CanvasContainer`; 8×8 object with a
   coloured 2×2 block; rect stub; select the transform tool via the store):
   - no selection: mouse drag → a rect selection exists (the Selection tool's behaviour).
   - with a selection over the block: mousedown on the `se` handle's client position, move +20 px,
     mouseup → `app.transform.params.scaleX > 1`, session active, 8 `[data-handle]` rects rendered,
     the standard marching-ants paths absent; `Enter` keydown on window → grid shows a 4×4-ish block,
     history length +1, selection mask covers the new cells, session null.
   - rotate: mousedown just outside the `ne` corner, arc of moves → `rotation` non-zero; `Escape` →
     grid changed, history +1, `selection === null`.
   - inside drag → `cx` changes; then a mousedown far outside + drag + up → the pending transform
     committed (history +1) and the **new** rect selection stands.
   - touch: `touchstart` on the `e` handle, `touchmove` +15 px, `touchend` → `scaleX` changed (the R4
     pin: the branch runs before the gesture bail); a second finger during the drag → params restored
     to the drag's start.
   - cursor: after a mousemove over a handle the surface's `style.cursor` is a resize cursor; over the
     rotate band it starts with `url(`; inside it is `move`.
   - `CanvasContainer.dom.test.tsx`: the transform canvas mounts; nothing else regresses.
   Commit: `transform(10): integration tests`.

## Constraints
- No new logic in `CanvasContainer` beyond bindings and arbitration; geometry stays in
  `ui/canvas/model/transform.ts`, gesture logic in the hook.
- Do not edit `SelectionUIStore`, the selection closures' bodies, `useCanvasPointer`, `CanvasSurface`.
- Never call the main `render` for the preview; never allocate per-sample React state for the cursor.
- Eslint warning count ≤ 66 (paste it).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries   # full client gate; paste totals + warning count
cd client && bunx vitest run src/types                       # green, snapshots unchanged
git status --porcelain | grep __snapshots__                  # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
**Manual (required)** — `bun run dev`, a throwaway project (**not** "Base Unit"), pixel studio:
1. `T` with nothing selected: rect / flood / lasso / colour selections all work as with `0`.
2. Select a block: dashed frame + 8 handles; zoom in and out — handles stay 8 px, outline 1 px.
3. Corner drag scales both axes with the opposite corner fixed; edge drag one axis; Shift on a corner
   keeps the ratio; dragging an edge past the opposite edge flips the pixels.
4. Hover just outside a corner: curved-arrow cursor; drag: smooth rotation, preview re-bucketised
   every frame, no holes; Shift snaps to 15°.
5. Scale, rotate, scale back: the result is computed from the original (no accumulated blur / drift —
   compare with the pre-transform pixels after rotating back to 0°).
6. Enter: pixels land, marching ants outline them, ⌘Z once restores the original. Escape (new
   session): pixels land, selection gone. ⌘Z while a transform is pending: frame snaps back to
   identity, history unchanged.
7. Switch tool with a pending transform → committed (one ⌘Z reverts). Switch frame → committed on the
   original frame. Start a new rect selection outside → committed, new selection stands.
8. Select-all on a layer of a large project (≥ 100×100) and rotate: still interactive (Performance
   panel ≤ 16 ms/frame at the pointer rate).
9. Touch (iPad or DevTools emulation): handle drag, rotate, inside drag all work; pinch mid-drag
   cancels the drag and zooms; Pencil with a resting finger still transforms.
10. StrictMode (dev): one preview repaint per sample (no double painting), one reaction disposer.
11. Variant editing: the tool only selects; no frame appears.
12. Off-canvas: start a handle drag and leave the canvas — the drag continues; releasing outside ends it.
Record every observation, including anything you could not test (say why).

## Definition of done
- [ ] Bindings + arbitration per D17; cursor per D15; chrome / preview per D13–D14; keyboard wired.
- [ ] Integration tests listed above green; full client gate green; warnings ≤ 66.
- [ ] Manual checks 1–12 performed and recorded (or explicitly marked untestable with the reason).
- [ ] Three commits `transform(10):`; no lockfile.
