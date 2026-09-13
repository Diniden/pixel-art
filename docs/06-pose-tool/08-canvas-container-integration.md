# 08 — `CanvasContainer` integration: render, pan, stamp, resize

**Wave:** W3 · **Depends on:** 01, 02, 03, 04, 05, 06, 07
**Touches:** `client/src/containers/CanvasContainer.tsx`
**Effort:** L

## Objective

The pose tool works. Selecting it and choosing a mesh renders a pixelated 3D reference above
every layer, auto-fitted and centred. The orbs, colours and camera controls drive it live.
Dragging on the canvas pans the model. Double-clicking stamps its colour, normal and height
into the current layer as one undoable entry. Resizing the object resizes the render target
and re-fits. Deselecting the tool hides it; unmounting disposes every GPU resource.

This is the integration task. It is alone in its wave because it owns a 4,327-line file.

## Context

`client/src/containers/CanvasContainer.tsx` is the only `observer()` in the canvas stack
(declared `:399`). Its header (`:20-42`) maps the 11 original responsibilities to their
homes. You are adding a twelfth concern; keep it in **one contiguous, clearly-commented
region** rather than scattered edits, so the next reader can find it.

### 1. The overlay render loop (MASTER D5, D11)

**Copy the hover overlay, which is the precedent for an independently-scheduled overlay:**
`renderHover` at `:2069-2093`, its own `useCanvasRender` at `:2099`, and — critically —
pointer moves that write `hoverPixelRef` (`:1941`) and call `invalidateHoverRef.current()`
(`:1955-1962`), **never React state**.

Why: the main `render` repaints every visible cell of every visible layer. Orb drags and
pans are pointer-rate. Routing them through `render` re-rasterises a 300k-cell sprite per
sample — the measured 2026-08-28 class of bug. So:

- The pose overlay gets **its own `useCanvasRender(renderPose, [...])`**.
- Drag state lives in **refs**; repaint is `invalidate()`.
- **Never** add pose to the main `render`, `renderLayers` or `renderChrome`.

The painter follows the established overlay recipe (from `renderOverlay`, `:2226-2295`):

```ts
const canvas = poseCanvasRef.current;
const ctx = canvas?.getContext("2d");
if (!canvas || !ctx || !poseActive) { if (canvas && ctx) ctx.clearRect(0,0,canvas.width,canvas.height); return; }
canvas.width = cellWidth; canvas.height = cellHeight;   // 1:1 — NEVER * zoom
ctx.imageSmoothingEnabled = false;                      // reset by assigning .width
ctx.clearRect(0, 0, cellWidth, cellHeight);
// engine.render() → Uint8Array → new ImageData(new Uint8ClampedArray(buf), w, h) → putImageData
```

⚠️ **`putImageData` only** — no `drawImage`, no scaling, ever. Magnification is the existing
CSS transform plus `image-rendering: pixelated`. Assigning `canvas.width` clears the backing
store **and resets `imageSmoothingEnabled` to `true`** (`:1436` does this for the same
reason).

⚠️ Handle the variant-edit view-space shift like the other overlays do (`ox`/`oy` from
`viewMinX`/`viewMinY` when `isEditingVariantResolved`).

### 2. Engine lifecycle (MASTER risk: WebGL leak)

- Create the `PoseEngine` **lazily**, on first activation of the tool — not on mount. It
  pulls in three's ~600 kB chunk (task 03's dynamic import), and a user who never opens the
  tool must never pay for it.
- Hold it in a **ref**, not state.
- `dispose()` it on unmount. Also dispose the previous mesh's geometry/material on every
  mesh change.
- ⚠️ **StrictMode double-invokes effects.** Creation must be idempotent and the cleanup must
  actually release the context, or two renderers leak per mount. Test this explicitly (see
  manual checks).
- WebGL contexts are a limited browser resource; churning them crashes the tab.

### 3. Resize response (the explicit request)

⚠️ **A grid resize notifies through `domainVersion`, not `pixelVersion`**
(`DomainStore.ts:224/272/308`; explained at `CanvasContainer.tsx:2512-2516`). Do not try to
observe the resize — instead **key the render target's size directly off `cellWidth` /
`cellHeight`**, which already flow as values (`:4270-4271`) and change when the object is
resized. On change: `engine.resize(cellWidth, cellHeight)` and **re-run the auto-fit**
(MASTER D7) so the model still fits the new bounds. **Preserve the pan offset** across a
resize (only a mesh change resets it).

### 4. Gestures (MASTER D12)

- Add `"pose"` to **`isGestureTool()`** (`:285-292`) so it never opens a history stroke and
  never writes pixels through the tool table.
- Arbitrate pose **ahead of the tool table**, exactly as `origin` (`:1925-1929`) and
  `reflection` do.
- ⚠️ **Touch:** the pose branch must be placed **before** the `isGestureTool` bails in the
  touch handlers (reflection's are at `:3678`, `:3693-3704`, `:3742`, `:3826`, ahead of the
  bails at `:3724` and `:3870`). The owner uses an iPad — a mouse-only implementation is a
  failed task.
- **Drag = pan.** Track the pointer delta in a ref, convert screen delta to cell delta via
  the canvas rect (the same rect-based reasoning `coords.ts` uses — **never** divide by
  `zoom`; the CSS transform means only the rect is correct during a pinch), update
  `app.pose.setPan`, and `invalidate()` the pose overlay. **No new `coords.ts` snap mode is
  needed.**
- **Double-click = stamp.** Detect it as two pointer-downs within **400 ms** and **within 2
  cells**, tracked in a ref. `dblclick` alone is unreliable on touch, which is why this is
  explicit.

### 5. The stamp (MASTER D8, D9)

On double-click:

1. Render the colour pass, the normal pass (`MeshNormalMaterial`) and read the depth buffer.
2. `buildStampCells(...)` from `ui/canvas/pose/poseStamp.ts` (task 06) → `PoseStampCell[]`.
3. Offset the cells by the current pan so they land where the model appears.
4. Call **`app.pixels.setPixelCells(cells, app.selectionUI.writeOptions)`** (task 05).

⚠️ **Do NOT route the stamp through `actions.setPixels`** (`:648-661`). That closure applies
the reflection mirror and is for *drawing*; a stamp is a placement, in the same category as
`moveLayerPixels` and the lighting studio, which are also deliberately excluded. Pass
`app.selectionUI.writeOptions` so an active selection still masks the stamp.

⚠️ If depth readback is unavailable, pass `depth: null` — heights become 0, colour and normal
still land (documented fallback). Record it as a deviation if you hit it.

### 6. Wiring the panel and the store

- Pass `poseCanvasRef` to `<CanvasSurface>` (task 04 made the prop optional; now supply it).
- Read `app.pose` for every render input. Reading observables inside the `observer` is what
  makes the overlay follow the rail's controls.
- ⚠️ Reading `app.pose` fields in the component body means a store change re-renders the
  container. That is correct for *discrete* changes (mesh, preset, projection). For
  *continuous* ones (orb drags, pan) the value still comes from the store, so keep the
  render path cheap and let the dedicated `useCanvasRender` absorb the repaint — do **not**
  add pose to the main `render`'s deps.

## Steps

1. Read the reflection integration seams in this file first (`isGestureTool` `:285-292`,
   store reads `:556-557`, hover overlay `:2069-2099`, mouse `:3000-3002`/`:3202-3205`/
   `:3472-3473`, touch `:3678`/`:3693-3704`/`:3742`/`:3826`). They are your map.
2. Add the engine ref, lazy creation on tool activation, and disposal on unmount.
3. Add `renderPose` and its dedicated `useCanvasRender`; pass `poseCanvasRef` to
   `CanvasSurface`.
4. Wire mesh / rotation / light / colours / camera / zoom / fov from `app.pose` into the
   engine, invalidating the pose overlay on change.
5. Implement auto-fit on mesh change, framing change, projection change, preset change and
   **`cellWidth`/`cellHeight` change**, preserving pan on resize and resetting it on mesh
   change.
6. Add `"pose"` to `isGestureTool`, and the pose branches to the mouse handlers ahead of the
   tool table.
7. Add the touch branches, **before** the `isGestureTool` bails.
8. Implement drag-to-pan via a ref + `invalidate()`.
9. Implement double-click detection and the stamp through `setPixelCells`.
10. Build the panel prop object if any part is still owed by the container (task 07 wires
    `PixelStudioPanelContainer`, so this should be nothing — verify).
11. Run the full verification and **every** manual check. **Commit after step 11**:
    `feat(pose): render the 3D reference, pan it, and stamp it into the layer`.

## Constraints

- **Never route the pose overlay through the main `render`/`renderLayers`/`renderChrome`.**
- **Never `drawImage`-scale.** `putImageData` at 1:1 only.
- **Never divide by `zoom`** for pointer maths — use the rect.
- **Never route the stamp through `actions.setPixels`** (the reflection mirror seam).
- Do not add a key to `toPersistedUIState()`; do not change the wire format.
- Do not modify the reflection, hover, selection, origin or trace code paths. If a shared
  helper needs a change, record it in `HANDOFF.md`.
- Do not touch any file outside `CanvasContainer.tsx`. If you need one, **stop and record
  BLOCKED** with what you needed and why.
- Do not touch `LightingCanvasContainer.tsx` (out of scope, MASTER D16).
- The tool must be inert when not selected: no engine created, no overlay painted, no
  gesture captured.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # ALL pass, no snapshot updates
bun run lint:boundaries                             # OK
bunx stylelint "src/**/*.css"                       # exactly 2 errors
bun run build                                       # succeeds
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules       # nothing
git status --short -- '*__snapshots__*'                            # empty — no -u, ever
```

### Manual checks — ALL are required, record each result in `HANDOFF.md`

**Rendering**
1. Select Pose, click **Cube**. It appears **centred**, filling ~90% of the shorter axis,
   with visible padding. Same for Sphere and Cylinder.
2. The render is **visibly pixelated** — hard blocky edges at the artwork's resolution, no
   smooth anti-aliased silhouette, no blur at any zoom level. **This is the feature; if it
   looks smooth, the pipeline is wrong.**
3. Zoom the canvas view in and out — the model stays crisp and stays aligned to the pixel
   grid.
4. It renders **above every layer** but **below** the selection marching ants, the origin
   cross and the reflection guides.

**Controls**
5. Dragging the **light orb** moves the shading in real time, with no visible lag.
6. Dragging the **rotation orb** tumbles the model smoothly.
7. Each viewpoint button (Front/Back/Left/Right/Top/Bottom/¾) snaps the model correctly.
8. Each camera preset (2D / 2.5D / Iso / Top-down / Oblique) changes the projection
   visibly and correctly; **Iso reads as true isometric**.
9. Perspective ↔ Orthographic toggles visibly; the zoom slider scales; FOV affects only
   perspective.
10. Light colour and model colour both change the render.

**Gestures**
11. **Mouse**: drag on the canvas pans the model; it does **not** rotate and does **not**
    draw.
12. **Touch**: the same drag works on a touch device / touch emulation, and does not scroll
    or draw.
13. Double-click stamps. **Touch double-tap also stamps.**

**Stamp correctness**
14. The stamped pixels land **exactly where the model was drawn** — no offset.
15. **One** Ctrl+Z removes the entire stamp. One Ctrl+Y restores it.
16. With a selection active, the stamp is **masked** to the selection.
17. In the lighting studio, the stamped pixels carry **sensible normals** (the lit preview
    shows the model's shading) and heights. If the depth fallback was used, say so.

**Resize & lifecycle**
18. Resize the object (Resize modal). The overlay resizes with it, stays 1:1, and the model
    **re-fits** to the new bounds. No stretching, no blur.
19. Pan the model, then resize — the pan is preserved. Change mesh — the pan resets.
20. Switch to another tool: the overlay disappears. Switch back: the pose is still there.
21. Switch projects: the pose is cleared.
22. **Switch tools 20 times and change mesh 20 times**, then check the console for WebGL
    warnings (`WARNING: Too many active WebGL contexts`). There must be none. **This is the
    leak check.**
23. **StrictMode**: the app runs in dev StrictMode; confirm no doubled renderer, no doubled
    overlay, no console error on mount/unmount.
24. Drawing performance with a large sprite is unchanged while the pose tool is **not**
    selected.

**Report the wall-clock time of a full-canvas stamp** on the largest object available.

## Definition of done

- [ ] The pose overlay renders via its **own** `useCanvasRender`, never the main `render`.
- [ ] `putImageData` at 1:1; no scaling blit anywhere; `imageSmoothingEnabled` re-disabled
      after every `canvas.width` assignment.
- [ ] The engine is created lazily on activation, held in a ref, and **disposed** on unmount
      and on mesh change.
- [ ] Auto-fit runs on mesh, framing, projection, preset **and `cellWidth`/`cellHeight`**
      change; pan is preserved on resize, reset on mesh change.
- [ ] `"pose"` is in `isGestureTool`; branches are ahead of the tool table on mouse **and**
      ahead of the bails on touch.
- [ ] Drag pans (rect-based, never `zoom`-based); double-click/double-tap stamps.
- [ ] The stamp calls **`setPixelCells`** with `selectionUI.writeOptions`, **not**
      `actions.setPixels`.
- [ ] All 24 manual checks performed, with results — including failures — recorded in
      `HANDOFF.md`.
- [ ] The WebGL leak check (22) and the StrictMode check (23) both pass.
- [ ] Full gate green; no snapshots updated; no lockfile.
- [ ] One commit, containing only this task's hunks.
