# 33 — `LightingSurface`, `LightingPreviewPanel`, and the lighting container

**Wave:** W25 · **Depends on:** 32, 27
**Touches:** `client/src/components/Canvas/LightingCanvas.tsx` (deleted at the end) · `client/src/ui/components/LightingSurface/` (new) + stories · `client/src/ui/components/LightingPreviewPanel/` (new) + stories · `client/src/containers/{LightingCanvasContainer,LightingPreviewPanelContainer}.tsx` (new) · `client/src/ui/canvas/render/{renderLightingPreview,renderNormalEdit,renderBrushOverlay}.ts` (new) · `client/src/ui/hooks/useLightingPaint.ts` (new) · `client/src/ui/canvas/render/__tests__/`
**Effort:** L

## Objective

After this task `LightingCanvas.tsx` no longer exists: it is a pure `LightingSurface`, an extracted `LightingPreviewPanel` (the third clone of the draggable floating panel), three pure renderers, a paint hook, and two containers. Three measured latent bugs in the file are fixed here.

## Context

⚠️ **This task must NOT run in parallel with the Canvas tasks.** Both touch `client/src/components/Canvas/`. The order is fixed: tasks 30 → 31 → 32 → 33.

`client/src/components/Canvas/LightingCanvas.tsx` is 937 lines with 5 fused responsibilities:

| Concern | Lines | Status |
| --- | --- | --- |
| (a) Viewport pan/zoom — a duplicate of `Canvas.tsx`'s | 24-56, 127-161, 379-478, 504-546, 581-585, 855-861 | **already replaced** by `useCanvasViewport` in task 31 |
| (b) Three renderers: `renderPreview` (214-286), `renderEdit` (287-343), `renderBrushOverlay` (344-368) | 214-368 | this task |
| (c) Normal/height painting | 588-662 | this task → `useLightingPaint` |
| (d) Keyboard | 665-710 | this task |
| (e) **A draggable floating preview panel** | 713-835 | this task → `LightingPreviewPanel`, using the `FloatingPanel` primitive from task 19 |

### The three latent bugs to fix here

Recorded by task 27 and deliberately deferred to this task:

1. **No rAF coalescing.** `grep -c renderRequestRef LightingCanvas.tsx` → **0**. Renders fire **synchronously from effects** at lines 369-376. `Canvas.tsx` uses rAF scheduling; adopt `useCanvasRender` (task 31) here.
2. **Each render redraws an uncached O(w·h) `fillRect` checkerboard** (lines 298-305) — the implementation `Canvas.tsx` abandoned for a cached `ImageData` version at lines 387-423. Task 30 extracted the good one into `render/canvasBackground.ts`; use it.
3. **`lastPaintPixel` is React state** (line 25), not a ref → **a re-render per pixel during a stroke.** `Canvas.tsx` correctly uses `lastStrokePixelRef` (line 38). Convert it to a ref.

A fourth difference — grid alpha hard-coded `0.08` vs Canvas's `lightGridMode`-aware `0.05` — was resolved in task 30 as a **design decision with owner sign-off**. Confirm the decision landed and that both canvases now agree.

### The floating panel — third clone

`LightingCanvas.tsx:713-835` is the third copy of the drag + minimise + %-position-persist pattern, alongside `FrameReferencePanel.tsx:32-102,272-323` and `ReferenceImagePanel.tsx:32-94,130-191` (~120 duplicated lines across the three). Task 19 built the `FloatingPanel` primitive and `useFloatingPanel` hook.

⚠️ **The three panels persist to three DIFFERENT `uiState` keys** — `frameReferencePanelPosition`, `referenceImagePanelPosition`, `lightingPreviewPanelPosition` (`types/index.ts:166-175`). `useFloatingPanel` takes the key as a parameter. **Unifying them is a bug.**

### The renderers take buffers

As in task 30: structure `renderLightingPreview`, `renderNormalEdit` and `renderBrushOverlay` to take and return `ImageData`-like buffers rather than a `ctx`, so they can be hash-tested with `canvasStub.ts` without a canvas dependency.

Fixed inputs matter for the hash tests: `DEFAULT_LIGHT_DIRECTION` is `{x:-64, y:-64, z:180}` (`types/index.ts:242`). Task 08 already hash-tested `lightingRenderer.ts`'s `composeLayers`, `renderWithLighting`, `renderNormalAsRGB` and `renderHeightAsGrayscale` under fixed light direction, colour and ambient — reuse those fixtures.

### The container reads 14 `uiState` sub-fields

`LightingCanvas` destructures 14 store members. As with `Canvas`, the container must be driven by an explicit `reaction(() => [pixelVersion, …], redraw)`, **not** `observer` on grid data. Regression signature: the lighting preview stops updating, or updates on every unrelated store write.

## Steps

1. Extract the three renderers into `client/src/ui/canvas/render/` as buffer-taking pure functions; write golden-hash tests under a fixed light direction.
2. Extract `useLightingPaint` (normal and height brush application, lines 588-662) into `client/src/ui/hooks/`.
3. Extract `LightingPreviewPanel` from lines 713-835 into `ui/components/`, built on the `FloatingPanel` primitive, taking `lightingPreviewPanelPosition`/`Minimized` as its persistence key.
4. **Apply the three fixes:** adopt `useCanvasRender`'s rAF scheduling; use `render/canvasBackground.ts`; convert `lastPaintPixel` from state to a ref.
5. Create `client/src/ui/components/LightingSurface/LightingSurface.tsx` — purely presentational: the canvas stack plus transform. Props only.
6. Create `LightingCanvasContainer` and `LightingPreviewPanelContainer`.
7. **Delete `client/src/components/Canvas/LightingCanvas.tsx`.**
8. Write stories for `LightingSurface` and `LightingPreviewPanel`.

## Constraints

- **`LightingSurface` must import nothing from `stores/`, `store/`, `api/`, `services/` or `mobx`**, and must not call `useContext`.
- **The container redraws via `reaction`, not `observer` on grid data.**
- **Do not unify the three floating panels' persistence keys.**
- Do not change the normal-computation algorithm — task 27 already moved it to `PixelStore` as a `flow`.
- Do not add a canvas native dependency.
- The save payload must stay byte-identical.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
test ! -f src/components/Canvas/LightingCanvas.tsx
! grep -rn "useEditorStore\|from \"mobx\|stores/" src/ui/components/LightingSurface
bunx vitest run src/ui/canvas/render      # golden-hash tests incl. the three new renderers
```

Manual checks:
1. **Full paint session in the lighting studio — confirm NO dropped strokes** after the rAF change. This is the main risk of fix 1.
2. Normal paint and height paint both round-trip.
3. Paint a long continuous stroke and confirm there is **no per-pixel re-render** (fix 3) — the stroke should feel smooth.
4. **Compare the `Default` and `LightGridMode` stories of `CanvasSurface` and `LightingSurface` side by side — the grids must now AGREE** (they do not today: `0.05` + `lightGridMode`-aware vs a hard-coded `0.08`).
5. Drag, minimise and reload the lighting preview panel; it must remember **its own** position, and dragging it must not move the other two panels.
6. Switch between the pixel and lighting studios repeatedly and confirm neither canvas leaks a listener or stops updating.

## Definition of done

- [ ] `client/src/components/Canvas/LightingCanvas.tsx` is **deleted**.
- [ ] `LightingSurface` is pure and imports no store/API/MobX; `LightingPreviewPanel` is extracted and built on the `FloatingPanel` primitive.
- [ ] The three renderers are pure buffer functions with golden-hash tests.
- [ ] **All three latent bugs are fixed:** rAF coalescing adopted, the cached `canvasBackground` used, and `lastPaintPixel` converted to a ref.
- [ ] The grid-alpha decision from task 30 is confirmed landed and both canvases agree.
- [ ] The three floating panels still use three distinct persistence keys.
- [ ] Both containers redraw via `reaction`, not `observer`.
- [ ] Stories exist for `LightingSurface` and `LightingPreviewPanel` and render with no store provider.
- [ ] The full paint session shows no dropped strokes.
