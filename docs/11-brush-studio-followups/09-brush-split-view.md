# 09 — Brush split view: Full (composite) and Layer panes

**Wave:** W4 · **Depends on:** 04, 06, 08
**Touches:** `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/BrushStudioContainer.tsx` · `client/src/containers/brush/useBrushSelection.ts` · `client/src/containers/__tests__/BrushStudioContainer.dom.test.tsx` · `client/src/containers/brush/__tests__/useBrushSelection.dom.test.ts`
**Effort:** M

## Objective
The brush studio can show one or two canvas panes exactly like the pixel studio: **Full**
composites every visible layer of the selected frame; **Layer** shows only the selected layer.
Each pane has its own camera, its own "Open Layer view / Swap views / Close" controls, and only
the keyboard-owning pane handles Escape/Delete. Panes swap without remounting.

## Context
- Pixel precedent: `containers/PixelStudioContainer.tsx:156-166` builds
  `panes = app.canvasViews.openModes.map((mode) => ({ key: mode, node: <CanvasContainer renderMode={mode} … /> }))`
  and renders `canvas={<CanvasSplit panes={panes} />}` (`:209`); the key IS the mode string so a
  swap is a reorder, not a remount (`:54-65`). `ui/components/CanvasSplit/CanvasSplit.tsx:27-38`
  (`{ key, node }[]`, 1 or 2, left→right; 50/50, no divider, portrait stacks — `CanvasSplit.css:20-49`).
- Per-pane controls: `CanvasContainer.tsx:5789-5806` — `otherMode`, `modeButton` (`"open"` when
  one pane, `"swap"` when both), `onClose` only when both; passed through `viewControls`
  (`:6147-6154`; props at `CanvasViewControls.tsx:59-72`).
- Per-pane camera: `CanvasContainer.tsx:588-590`
  `const camera: CanvasCamera = layerMode ? views.layerCamera : viewport;` — `zoom` (px/cell) is
  shared across panes (`CanvasCameraStore.ts:23-26`); only pan/viewZoom differ.
- Layer mode = others **hidden**, not dimmed (`CanvasContainer.tsx:1409-1432`: the plan holds
  only the selected layer). Keyboard ownership: `enabled: views.keyboardOwner === renderMode`
  (`:4151`) — otherwise every key fires twice. `renderMode` is part of `resyncKey` (`:1129`).
- Brush side: `BrushStudioContainer.tsx:92` renders a bare `<BrushCanvasContainer />`;
  `BrushCanvasContainer` composites `frame.layers` via `renderBrushFrame` (`:402-406`), one
  layer canvas `FRAME_LAYER_ID` (`:85-86`), `registerLayerCanvas` ignores its id (`:457-462`);
  after task 06 it takes its camera from `brushUI` through `useBrushCamera({ camera })`.
  `useBrushSelection.ts:219-236` binds a window `keydown` (Escape/Delete/Backspace) — needs an
  `enabled` flag. Selection state is per-container `useState`; two panes would each hold their
  own mask (acceptable for v1 — document it; the pixel studio shares one mask via the store).
- Store (task 04): `app.brushViews: CanvasViewsUIStore` (`openModes`, `bothOpen`, `keyboardOwner`,
  `layerCamera`, `openMode`, `closeMode`, `swap`). Full camera = `app.brushUI`.

## Steps
1. `BrushCanvasContainer.tsx`: add `renderMode?: CanvasRenderMode` (default `"full"`);
   `const layerMode = renderMode === "layer"; const camera: CanvasCamera = layerMode ? views.layerCamera : brushUI;`
   and hand `camera` to `useBrushCamera`. In layer mode the render uses
   `[selectedLayer]` (from `brushUI.selectedLayerIn(doc)`, visible or not) instead of `frame.layers`;
   include `renderMode` in `resyncKey`. `viewControls`: `onResetView` + `modeButton`/`onClose`
   built exactly as `CanvasContainer.tsx:5789-5806` against `app.brushViews`. Pass
   `enabled: views.keyboardOwner === renderMode` to `useBrushSelection`.
2. `useBrushSelection.ts`: accept `enabled: boolean`; when false, do not bind the keydown
   listener (gestures still work — a click in the non-owning pane still selects there).
3. `BrushStudioContainer.tsx`: build `panes` from `app.brushViews.openModes` with
   `key: mode` and `node: <BrushCanvasContainer renderMode={mode} />`; render
   `canvas={<CanvasSplit panes={panes} />}`.
4. Tests: `BrushStudioContainer.dom.test.tsx` — one pane by default; `brushViews.openMode("layer")`
   → two `.canvas` roots in left→right order Full, Layer; `swap()` reorders without remounting
   (assert the same DOM node identity survives); `closeMode("layer")` back to one.
   `useBrushSelection.dom.test.ts` — `enabled: false` binds no keydown handler.
5. Commit: `brush-followups(09): brush split view — Full and Layer panes with per-pane cameras`.

## Constraints
- Do not edit `CanvasSplit/**`, `CanvasViewsUIStore.ts`, `CanvasContainer.tsx`, `PixelStudioContainer.tsx`,
  any store, or any `ui/` file. `max-lines` must not fire on the container — extract pane
  helpers into `containers/brush/` if needed (report any new file there as a deviation).
- Nothing persisted; a reload comes back to a single Full pane (matches the pixel studio).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd client && bunx stylelint "src/**/*.css"          # no new errors
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, brush mode): "Open Layer view" splits 50/50; Layer pane shows only the selected
layer and follows layer selection; each pane pans/zooms independently; Swap reorders without a
flash; Close returns to one pane; Escape/Delete act once; portrait iPad stacks the panes;
painting in either pane updates both.

## Definition of done
- [ ] `renderMode` prop, per-pane camera, layer-only render, per-pane controls, keyboard owner.
- [ ] `BrushStudioContainer` renders `CanvasSplit`; tests added; gate green; one commit.
