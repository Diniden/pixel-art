# 04 — `LightingCanvasContainer` takes a `renderMode` and a per-pane camera

**Wave:** W2 · **Depends on:** 01, 02, 03, 04
**Touches:** `client/src/containers/LightingCanvasContainer.tsx`
**Effort:** L

## Objective
`LightingCanvasContainer` renders either the **Edit** mode (today's normal/height painting canvas,
unchanged) or the **Preview** mode (the lit composite, **read-only**, at a real camera scale
instead of the fixed 200 px thumbnail) depending on a `renderMode` prop, and drives its
pan/pinch/zoom through that mode's camera from `app.lightingViews`. Each instance renders its own
`CanvasViewControls` (mode / close / reset) into `LightingSurface`'s new `viewControls` slot. The
Edit pane's strokes now collapse to one undo entry each, via task 02's callbacks.

## Context
This is a 714-line file. Change it surgically; every section below names the lines (measured
2026-08-29, before W1 — grep the anchors rather than trusting the numbers blindly).

- **Props today: none.** `observer(function LightingCanvasContainer() {...})` at `:166-167`. Add:
  ```ts
  export interface LightingCanvasContainerProps {
    /** Which mode this instance shows. `"edit"` (default) is today's painting canvas. */
    renderMode?: LightingRenderMode;
  }
  ```
  importing the type from `../stores/ui/LightingViewsUIStore`. Default `"edit"`.
- **Store reads** `:181-216`. Add:
  ```ts
  const views = app.lightingViews;
  const previewMode = renderMode === "preview";
  const camera: CanvasCamera = views.cameraFor(renderMode);
  ```
  `viewport.zoom` (`:191`) stays the shared pixel scale — do **not** move it into the camera (D4).
- **Camera** `:241-252`. Today: `useCanvasViewport({ containerRef, canvasWidth, canvasHeight,
  panOffset: { x: 0, y: 0 } })` — a fresh literal every render, no commit sinks, no `resyncKey`.
  Replace with the `CanvasContainer` shape (`containers/CanvasContainer.tsx:631-645` is the
  model):
  ```ts
  panOffset: camera.panOffset,
  onCommitPan: (pan) => camera.setPanOffset(pan),
  viewZoom: camera.viewZoom,
  onCommitViewZoom: (z) => camera.setViewZoom(z),
  resyncKey: `${app.timelineUI.selectedObjectId ?? ""}|${app.timelineUI.selectedFrameId ?? ""}|${renderMode}`,
  ```
  ⚠️ This makes the store the source of truth for the lighting view transform where it was
  previously hook-local. That is the point — a camera you cannot address cannot be reset or kept
  per pane. It is still **session-only** (task 01's cameras are not persisted), so a reload
  behaves exactly as today: view back to 1× at the origin.
- **Geometry** `:221-233` is hand-rolled (`objWidth/objHeight` from `obj?.gridSize`,
  `gridWidth/gridHeight` from the variant when editing one, `canvasWidth = gridWidth * zoom`).
  **Leave it hand-rolled** — do not adopt `useCanvasGeometry` here; that is a separate refactor
  and out of scope. In Preview mode the pane shows the **whole object** composite, so it uses
  `objWidth/objHeight`, not `gridWidth/gridHeight`:
  ```ts
  const viewCellsX = previewMode ? objWidth : gridWidth;
  const viewCellsY = previewMode ? objHeight : gridHeight;
  const canvasWidth  = viewCellsX * zoom;
  const canvasHeight = viewCellsY * zoom;
  ```
- **Render — three painters today,** all rAF-scheduled at `:509-514`:
  - `renderPreview` `:359-415` → paints `previewCanvasRef` at `PREVIEW_THUMB_SIZE` (200×200) via
    `composeLayers` `:369-376` → `renderWithLighting` `:377-382` → `renderLightingPreview`
    `:388-395` → `putImageData` `:396` → border stroke `:401-403`.
  - `renderEdit` `:423-474` → `editCanvasRef`; height/normal branch `:433-436`, `renderNormalEdit`
    `:444-450`, `strokeGrid` `:464`.
  - `renderBrushOverlay` `:477-497` → `overlayCanvasRef`.

  **In Preview mode:** paint the lit composite into `editCanvasRef` (the pane's main canvas) at
  `canvasWidth × canvasHeight` — the same `composeLayers` → `renderWithLighting` pipeline, then a
  nearest-neighbour upscale to `zoom` × the camera's view scale. **Do not reuse
  `renderLightingPreview`'s `previewPlacement`** — its integer fit
  (`renderLightingPreview.ts:80-98`) exists to letterbox a sprite into a fixed 200 px thumb, and
  crops anything bigger. This pane is not a thumbnail. Task 04 provides the painter
  (`drawLitComposite`); call it. Skip `renderEdit`'s normal/height visualisation and skip
  `renderBrushOverlay` entirely (no hover marker on a read-only pane).
- **Read-only means read-only.** In Preview mode pass **no** pointer handlers to
  `LightingSurface` (or pass no-ops — prefer omitting, and make the props optional if the type
  requires it; if `LightingSurface`'s props make them required, stop and report rather than
  editing that file — it belongs to task 03). Do not call `useLightingPaint`'s stroke methods, do
  not resolve brush cells, do not set `hoverPixel`.
- **Stroke undo (task 02).** In Edit mode pass the new callbacks into `useLightingPaint`
  (`:322-334`):
  ```ts
  onStrokeStart: (label) => app.history.beginTransaction(label),
  onStrokeEnd: () => app.history.endTransaction(),
  ```
  Confirm the accessor name by reading `stores/history/HistoryStore.ts` and how `PixelStore`
  reaches it (`PixelStore.ts:1201`, `:1446`, `:1594`); use the same path from `ApplicationStore`.
  ⚠️ Never open a transaction in Preview mode.
- **Keyboard** `:625-665` — a raw `window.addEventListener("keydown", …)` (bubble phase, **not**
  `useCanvasKeyboard`), with ⌘Z → `app.undo()` `:633-640` and `.`/`,` frame nav `:641-661`. With
  two panes mounted this listener would register twice and every ⌘Z would undo twice. Gate it:
  ```ts
  if (views.keyboardOwner !== renderMode) return;   // inside the effect, before addEventListener
  ```
  and add `views.keyboardOwner`, `renderMode` to the dep array. Do **not** adopt
  `useCanvasKeyboard` here — the non-reuse is deliberate and documented at `:76-83`.
- **View controls.** Build them from `views` and pass into `LightingSurface`'s new `viewControls`
  slot (task 03). Copy the shape from `CanvasContainer.tsx:2694-2722`:
  ```ts
  const otherMode: LightingRenderMode = previewMode ? "edit" : "preview";
  const modeButton = views.bothOpen
    ? { kind: "swap" as const, label: "Swap pane sides", onClick: () => views.swap() }
    : { kind: "open" as const,
        label: previewMode ? "Open Edit view" : "Open Preview view",
        onClick: () => views.openMode(otherMode) };
  const onClose = views.bothOpen
    ? { label: previewMode ? "Close Preview view" : "Close Edit view",
        onClick: () => views.closeMode(renderMode) }
    : undefined;
  ```
  **No `onNudgeOffset`** — variant-offset arrows are a pixel-studio feature; the lighting studio
  has never had them and this plan does not add them.
- **Reset.** There is no reset handler in this file today. Add one modelled on
  `CanvasContainer.tsx:2673-2692`: measure the untransformed viewport from `containerRef`, compute
  the centred pan, then `setViewZoom(1)`, `setViewPanOffset(centered)`, `camera.resetView(centered)`.
  ⚠️ The centring **must be measured from the DOM**, never assumed — see that comment block.
- **The floating preview panel is retired in task 06, not here.** For this task keep passing
  `previewPanel={…}` exactly as today (`:697-703`) so Edit mode is unchanged; task 06 removes it.
  ⚠️ Do not let both panes mount the floating panel: pass `previewPanel` **only when
  `renderMode === "edit"`**. Two mounted copies would fight over the same panel position state.
- `invalidatePreview` / `handlePanelMinimizedChange` (`:509-512`, `:673-678`) exist to repaint the
  floating panel's canvas when it is un-minimised. Keep them wired for Edit mode this task.

## Steps
1. Add the prop, `views`, `previewMode`, `camera`; repoint `useCanvasViewport`; add
   `handleResetView`. Run `tsc`. **Commit** (`refactor(lighting): drive the lighting camera
   through a CanvasCamera`) — with `renderMode` defaulting to `"edit"`, behaviour is unchanged
   except that pan/zoom now live in a store.
2. Preview branch: `viewCellsX/Y`, the `drawLitComposite` render path, skip the edit/overlay
   painters, no pointer handlers, `previewPanel` only in Edit mode. Keyboard gate. **Commit**
   (`feat(lighting): read-only Preview render mode`).
3. Stroke-undo callbacks into `useLightingPaint`; view-controls props into the new slot.
   **Commit** (`feat(lighting): per-pane view controls and single-entry strokes`).
4. Temporarily verify Preview by hand: in `LightingStudioContainer.tsx` (**not committed** —
   revert before finishing; task 06 does the real wiring) pass `renderMode="preview"` and confirm
   the pane shows the lit composite at the shared `zoom`, pans and zooms independently, and that
   clicking it paints **nothing**. Revert:
   `git checkout -- client/src/containers/LightingStudioContainer.tsx`.

## Constraints
- Only `LightingCanvasContainer.tsx` is touched. If something needs a change elsewhere — including
  `LightingSurface`'s prop types — **stop and report**.
- With `renderMode` omitted, Edit mode behaves exactly as today apart from (a) the camera living
  in a store and (b) one undo entry per stroke, which is task 02's intended fix.
- Never deep-observe a pixel grid; the composite painters read grids by reference and redraw from
  `pixelVersion` (`:216`, `:509-513`). Keep it that way.
- No new persisted keys; no change to `UIStore` or any codec.
- `observer()` stays; `max-lines` is a warning outside `src/ui/**` — do not suppress anything new.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers/LightingCanvasContainer.tsx   # no NEW warnings vs baseline
cd client && bunx vitest run                                          # all pass; corpus unchanged
cd client && bun run lint:boundaries
cd client && bunx prettier --check src/containers/LightingCanvasContainer.tsx
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
**Manual** (default `renderMode`, lighting studio): paint normals and heights — identical to
before; **drag across ~10 cells and press ⌘Z once → the whole stroke disappears** (the task-02
fix, first observable here); pan, ctrl+wheel, reset; `.`/`,` step frames; ⌘Z undoes once.
Step 4's temporary preview check: lit composite visible, independent camera, clicking paints
nothing.
⚠️ **Never paint against the owner's real data.** Run the client against a **copy** of
`server/src` and its `data/` in the scratchpad (the plan-02 executors' method: copy the tree,
serve on port 3002 with `DISABLE_BONJOUR=1`, point `VITE_API_URL` at it). `server/src/data/` must
not be written.

## Definition of done
- [ ] `renderMode` prop with default `"edit"`; camera per pane; keyboard gated to one owner.
- [ ] Preview branch paints the lit composite, is read-only, and mounts no floating panel.
- [ ] Stroke callbacks wired; view controls (mode/close/reset) rendered into the new slot.
- [ ] Three commits; `LightingStudioContainer.tsx` left untouched in git.
- [ ] Gate output pasted; manual checks performed and reported individually.
