# 05 — `CanvasContainer` takes a `renderMode` and a per-mode camera

**Wave:** W2 · **Depends on:** 01, 02, 04
**Touches:** `client/src/containers/CanvasContainer.tsx`
**Effort:** L

## Objective
`CanvasContainer` renders either the **Full Render Mode** (today's view, unchanged) or the
**Layer Render Mode** (just the editable canvas — the variant's own grid, or the current layer's
grid — at origin, own size, no offset, no dimming) depending on a `renderMode` prop, and drives
its pan/pinch/zoom through the **camera for that mode** (`app.ui.viewport` for Full,
`app.canvasViews.layerCamera` for Layer). Each instance renders its own `CanvasViewControls` with
the mode/close/reset buttons derived from `app.canvasViews`, and the Full instance adds the
variant-offset arrows when a variant is being edited. Both instances edit the same pixel data
through the same `PixelStore` actions, and both redraw from `pixelVersion`, so an edit in one
appears in the other on the next animation frame.

## Context
This is a 2,634-line file. Change it surgically; every section below names the lines.

- **Props** `:286-290` `CanvasContainerProps { referenceImage?, onReferenceImageChange?,
  overlayFrameIndex? }`. Add `renderMode?: CanvasRenderMode` (default `"full"`) — import the type
  from `../stores/ui/CanvasViewsUIStore`.
- **Store reads** `:361-408`. `viewport = app.ui.viewport` (`:369`); `zoom = viewport.zoom`
  (`:383`, the shared pixel scale — stays); `panOffset = viewport.panOffset` (`:384`) — becomes
  `camera.panOffset`. Add:
  ```ts
  const views = app.canvasViews;
  const layerMode = renderMode === "layer";
  const camera: CanvasCamera = layerMode ? views.layerCamera : viewport;
  ```
- **Geometry** `:533-564`. Today: `isEditingVariantResolved = Boolean(editingVariant && variantData)`
  and `useCanvasGeometry({ objWidth, objHeight, gridWidth, gridHeight, editingVariant:
  isEditingVariantResolved, variantOffset, zoom, lightGridMode })`. In Layer mode the view IS the
  editable grid, so:
  ```ts
  const isEditingVariantResolved = !layerMode && Boolean(editingVariant && variantData);
  const geomObjWidth  = layerMode ? gridWidth  : objWidth;
  const geomObjHeight = layerMode ? gridHeight : objHeight;
  // pass geomObjWidth/geomObjHeight as objWidth/objHeight; variantOffset stays memoised on the
  // raw scalars but `editingVariant: isEditingVariantResolved` is now false in layer mode, so
  // useCanvasGeometry collapses the view to the grid at (0,0) — no new geometry code needed.
  ```
  Everything downstream keys off `isEditingVariantResolved` (`screenToPixel` via `coordGeom`,
  `bgGeom`, the selection/preview `offsetX/offsetY` at `:978-979`, the overlays' `ox/oy`), so
  the Layer view's coordinate mapping, checkerboard, selection and preview all land at origin
  automatically. **Verify this claim by reading each `isEditingVariantResolved` use before you
  rely on it** (`grep -n isEditingVariantResolved`).
- **Viewport engine** `:583-614`: replace `panOffset` → `camera.panOffset`, `onCommitPan: (pan)
  => camera.setPanOffset(pan)`, `viewZoom: camera.viewZoom`, `onCommitViewZoom: (z) =>
  camera.setViewZoom(z)`, and append `|${renderMode}` to `resyncKey`.
- **Main render** `:708-1130`. The branch structure is: variant-edit branch `:734-894`, `} else {`
  at `:895` (normal branch to `:976`), then the shared tail (selection mask, lasso, marching
  ants `:978-1070`, origin cross `:1069-1078`, variant frame outlines `if
  (isEditingVariantResolved)` `:1080+`). Insert a **third, first** branch:
  ```ts
  if (layerMode) {
    drawLayerView(ctx, {
      layers: editingVariant && variantData ? variantData.variantFrame.layers : layer ? [layer] : [],
      gridWidth, gridHeight, zoom, getPixelColor,
      moveDx, moveDy, movesWithDrag,     // the same move-preview inputs as `:721-725`
    });
    // then the grid lines exactly as the normal branch draws them (the `ensureGridCanvas()`
    // blit at `:974` — reuse it).
  } else if (isEditingVariantResolved && variantData) { …existing… } else { …existing… }
  ```
  `drawLayerView` is `client/src/ui/canvas/render/renderLayerView.ts` (task 04). Note
  `variantFrame.layers` — the variant's OWN layers (`ApplicationStore.currentVariant`
  `:1013-1049`); `editableGrid` (`:1099`) writes `variantFrame.layers[0]`, so drawing all of
  them matches what the Full view composites for that variant.
- **Origin cross** `:1069-1078` and the origin-tool click at `:1925`: object-space. In Layer mode
  skip both **when editing a variant** (`layerMode && editingVariant`); when not editing a
  variant the grid equals the object grid and they are correct as-is.
- **Overlays**: `renderOverlay` `:1354` (reference trace), `drawOverlayCanvas` `:1422`,
  `renderFrameOverlay` / `renderFrameTraceOverlay` `:1510-1535`, and the `CanvasSurface` props
  `showReferenceOverlay` / `showFrameOverlay` / `showFrameTraceOverlay` (`:2616-2623`). They are
  object-space reference aids. In Layer mode: pass `false` for all three `show*` props and make
  the three painters early-return (clear the canvas) when `layerMode`. Also
  `isReferenceTraceActive` must be `false` in layer mode so the trace tool paints nothing there.
- **Keyboard** `:1588-1625` `useCanvasKeyboard({...})`: add `enabled: views.keyboardOwner ===
  renderMode` (task 01 computed; task 04 option).
- **Reset** `:2582-2601` `handleResetView`: `viewport.resetView(centered)` → `camera.resetView(centered)`;
  update the deps array.
- **View controls** `:2631`: build the props from `views`:
  ```ts
  const otherMode: CanvasRenderMode = layerMode ? "full" : "layer";
  const modeButton = views.bothOpen
    ? { kind: "swap", label: "Swap pane sides", onClick: () => views.swap() }
    : { kind: "open", label: layerMode ? "Open Full view" : "Open Layer view", onClick: () => views.openMode(otherMode) };
  const onClose = views.bothOpen ? { label: layerMode ? "Close Layer view" : "Close Full view", onClick: () => views.closeMode(renderMode) } : undefined;
  const onNudgeOffset = !layerMode && editingVariant ? (dx, dy, all) => actions.setVariantOffset(dx, dy, all) : undefined;
  ```
  (`actions.setVariantOffset` `:515-516` is the same action WASD uses — `VariantStore.
  setVariantOffset(dx, dy, allFrames)`, undoable, one history entry per press.)
- **Transient gesture state is shared.** `app.canvasInteraction` (`isDrawing`, `previewPixels`)
  is one instance for both panes. That is *desired* for the preview (a shape being dragged in
  one pane previews in the other, since preview points are grid-space) and harmless for
  `isDrawing` because only one pointer is down at a time. Do not duplicate the store.
- **Hover marker**: `applyMarker` `:1195` and `usePencilHover` `:1323` are per instance; the
  pencil-hover bridge will feed both, and `getPixelCoords` returns `null` for samples outside
  each pane's canvas rect — so each pane marks only its own cell. No change needed; verify
  manually on the iPad if available, else on desktop with the mouse.
- ESLint `max-lines` is a **warning** outside `src/ui/**`; this file already carries it. Do not
  suppress anything new.

## Steps
1. Add the prop, `views`, `layerMode`, `camera`; repoint the viewport-engine call and
   `handleResetView`. Run `tsc`. **Commit** (`refactor(canvas): CanvasContainer drives its
   camera through a CanvasCamera`) — at this point behaviour is identical (`renderMode` defaults
   to `"full"`).
2. Geometry: `isEditingVariantResolved`, `geomObjWidth/Height`. Render: the `layerMode` branch
   with `drawLayerView` + grid blit. Origin-cross / origin-tool guards. Overlay guards and
   `show*` props. Keyboard `enabled`. **Commit** (`feat(canvas): Layer Render Mode branch`).
3. View controls wiring (mode/close/reset/arrows). **Commit** (`feat(canvas): per-pane view
   controls and variant-offset arrows`).
4. Temporarily verify the Layer mode by hand: in `PixelStudioContainer.tsx` (NOT committed —
   revert before finishing; task 06 does the real wiring) pass `renderMode="layer"` and confirm
   the canvas shows just the variant/layer grid and that drawing writes to the same data as
   before. Revert the file (`git checkout -- client/src/containers/PixelStudioContainer.tsx`).

## Constraints
- Only `CanvasContainer.tsx` is touched. If something needs a change elsewhere, stop and report.
- With `renderMode` omitted, **every** existing behaviour is byte-identical: same render, same
  persisted `panOffset`/`viewZoom` writes to `ViewportUIStore`, same keyboard map, same reset.
- Never read `layer.pixels` in an observer path in a way that deep-observes it — the existing
  reads are by reference and go through `pixelVersion`; keep it that way.
- No new persisted keys; no change to `UIStore`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers/CanvasContainer.tsx        # no NEW warnings vs. baseline
cd client && bunx vitest run                                        # 113 files / 1948 tests + W1's; corpus unchanged
cd client && bun run lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (with `bun run dev`, default `renderMode`): draw, pan (mouse drag + touch), ctrl+wheel
zoom, pinch on a touch device if available, press reset — all identical to before; reload → pan
and view zoom restored as before. Step 4's temporary layer-mode check: variant layer selected →
the canvas is `variant.gridSize` at zoom, no orange object outline, no offset; pencil at cell
(0,0) writes the variant's top-left cell (confirm by switching back to full mode — the pixel
sits at `variantOffset`). WASD still nudges the variant (Full mode), only once per press.

## Definition of done
- [ ] `renderMode` prop with default `"full"`; camera selected per mode; keyboard gated.
- [ ] Layer-mode branch renders via `drawLayerView`; overlays/origin suppressed appropriately.
- [ ] View controls receive mode/close/reset/arrow props derived from `app.canvasViews`.
- [ ] Three commits as listed; `PixelStudioContainer.tsx` left untouched in git.
- [ ] Full gate output pasted in the report; manual checks listed above performed and reported.
