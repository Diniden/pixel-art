# 04 — Pan becomes a camera-space translation

**Wave:** W3 · **Depends on:** 03
**Touches:** `client/src/ui/canvas/pose/poseCamera.ts` · `client/src/ui/canvas/pose/__tests__/poseCamera.test.ts` · `client/src/containers/CanvasContainer.tsx`
**Effort:** M

## Objective

Panning translates the view **parallel to the camera plane** — the camera and its target move
together — instead of sliding the finished picture around the canvas. The render target stays
exactly `cellWidth × cellHeight` and is blitted at a **fixed** origin, so the image stays
pixel-aligned and the model never clips against a moving rectangle's border.

## Context

**The owner's words:** *"Panning the pose is done wrong: right now it is moving the pose's canvas
completely so if I pan it down but the model goes above the top border, it looks clipped in the
rendering. We should be adjusting for the so the panning is just a parallel translation to the
camera so the canvas stays pixel aligned properly."*

**What it does today — measured 2026-09-03.** Pan is a **canvas-space blit offset**.
`CanvasContainer.tsx:2562-2566`:

```ts
const pan = posePanRef.current;
px = Math.round(pan.x) - ox;      // ox/oy = viewMinX/viewMinY when editing a variant
py = Math.round(pan.y) - oy;
ctx.putImageData(image, px, py);
```

The **whole render target** is drawn at an offset. Anything that would fall outside the target's
own `cellWidth × cellHeight` rectangle was never rendered in the first place, so it clips — which
is exactly the artefact the owner describes.

⚠️ **The comment at `CanvasContainer.tsx:2557-2561` explicitly justifies the current design**
("a camera pan would re-fit and re-rasterise"). **That justification is what this task reverses**
— and it is now safe to reverse, because **task 03 made the fit independent of the camera's
framing**: a pan no longer triggers a re-fit. Rewrite that comment; do not leave it contradicting
the code.

**Every `pose.pan` consumer** (this is the complete list):

| Line | Role | What happens to it |
| --- | --- | --- |
| `2448` | `posePanRef` — the pointer-rate mirror | stays |
| `2562-2566` | ⚠️ the **painter** blit offset | becomes `putImageData(image, -ox, -oy)` — a fixed origin |
| `2899-2903` | effect syncing `posePanRef.current = pose.pan` for non-drag writes | stays |
| `3186-3198` | the **stamp** reads pan → `offsetX`/`offsetY` into `buildStampCells` | becomes `-stampOx` / `-stampOy` |
| `3232-3247` | `posePointerMove` accumulates the drag, then `app.pose.setPan(next)` | stays (but see step 5 on units) |

Store: `pan: PosePan` at `PoseUIStore.ts:321` (`observableRef` `:351`), `setPan` `:470-472`,
`panBy` `:~482`, reset in `setMesh` `:391` and `clear()` `:523`. The type comment at `:121` says
"in **grid cells**"; it is explicitly unbounded (`:166`).

**Where the camera offset goes.** `PoseCameraParams` (`poseCamera.ts:223-238`) carries
`position` and `target`. `fitCameraToMesh` sets `target` to the bounds **centre** (`:396-400`)
and there is currently **no way to offset it**. `applyCameraParams` (`:476-497`) writes
`position` then `lookAt(target)`.

Two defensible implementations — **pick one, document it, test it**:

1. **Move `position` and `target` together** along the camera's right/up basis vectors. Simple,
   works for both projections, and keeps `lookAt` honest.
2. **Offset the frustum** — for orthographic, shift `left/right/top/bottom` symmetrically; for
   perspective this needs an off-axis projection, which `applyCameraParams` cannot express
   without writing a matrix.

⚠️ **Option 1 is strongly recommended** because option 2 does not generalise to the perspective
camera through the existing `applyCameraParams` shape (see F16 — it writes camera *fields* and
lets three build the matrix).

⚠️ **Do NOT implement pan via `object.position`.** `normalizeToUnitBox` (`poseMeshes.ts:889-903`)
already writes `object.position`, and a second writer would fight it. Move the **camera**.

**Pixel alignment is the point of the task.** For the picture to stay pixel-aligned, a pan of one
grid cell must translate the view by **exactly one render-target texel**. Derive that conversion
from the fitted frustum (for orthographic: world-units-per-texel is
`(right - left) / cellWidth`), and **round the pan in world units to whole texels** so the
rasterised image never lands on a half-texel. **Test this** — it is the difference between
"pans smoothly" and "shimmers while dragging".

**Boundary:** `poseCamera.ts` is under `client/src/ui/` and imports nothing from three
(`PoseCameraLike` at `:453-468` is structural). Keep it that way.

## Steps

1. Read `CanvasContainer.tsx:2456-2576` (the painter, including the comment at `2557-2561`),
   `:3168-3198` (the stamp's offset derivation — its reasoning about `variantOffset` vs `viewMin`
   is subtle and must survive), `:3232-3247` (the drag), then `poseCamera.ts:223-238` and
   `:476-497`.
2. **Add a pan offset to the camera params.** Extend `FitCameraParams` / `PoseCameraParams` (or
   add a pure `offsetCameraParams(params, panX, panY)` helper) so the camera and target translate
   together along the camera basis. **A pure function is preferred** — it is testable without GL,
   like `scaleCameraParams` was.
3. **Derive the world-units-per-texel conversion** from the fitted frustum and **snap the
   translation to whole texels**. Document the derivation next to the code.
4. **Rewrite the painter.** `putImageData` returns to a fixed origin — `(-ox, -oy)`, keeping only
   the variant-space correction. Delete the pan term. ⚠️ **Rewrite the stale comment at
   `2557-2561`** to explain the new design and why it is now safe (task 03 decoupled the fit).
5. **Fix the stamp offsets.** `CanvasContainer.tsx:3197-3198` currently adds
   `Math.round(pan.x) - stampOx`. With the pan now in the camera, the model is already in the
   right place in the rendered image, so the stamp's pan term goes away and only
   `-stampOx`/`-stampOy` remain. ⚠️ **Preserve the `variantOffset`-not-`viewMin` reasoning
   documented at `3168-3185`** — that distinction is a real bug fix and must not be lost.
6. **Check the drag units.** `poseScreenToCellDelta` (`:2925-2938`) converts pointer movement to
   cells. Confirm the sign and magnitude still produce 1:1 finger-to-model movement now that the
   camera moves instead of the image. **If a sign flips, say so** — dragging must still feel
   direct, not inverted.
7. **Add pan to the camera effect's dependencies.** The fit effect at `:2871-2879` deliberately
   omits pan today. Now that pan changes the camera, the camera must be re-applied when it
   changes. ⚠️ **A pan must NOT trigger a re-fit** (it must not change the scale) — only
   re-apply the camera. If those are the same effect, split them.
8. **Keep the pointer path cheap.** Drag state stays in refs; repaint via `invalidate()`. **No
   `useState` on a pointer path** (D11). Panning is a per-move operation — do not make it
   allocate a new mesh or re-run the fit.
9. **Test:**
   - a pan of *n* cells translates the camera **and** the target by the same world vector;
   - the model's rendered position shifts by exactly *n* texels (assert the arithmetic);
   - pan is **snapped to whole texels** — a fractional pan does not produce a fractional offset;
   - panning does **not** change the fit scale or any frustum dimension;
   - pan works identically for orthographic and perspective;
   - `pan = (0,0)` reproduces the pre-change camera exactly (**a regression pin**);
   - pan is unbounded — the model may leave the frame entirely;
   - a new mesh resets pan; a resize preserves it.
10. Run the gate, then commit.

## Constraints

- **Do not implement pan via `object.position`** (collides with `normalizeToUnitBox`).
- **Do not clamp pan.** The model may leave the canvas entirely — that is intended.
- **Do not change** `poseMeshes.ts`, `poseStamp.ts`, `poseOutline.ts`, `poseEngine.ts`,
  `PoseUIStore.ts` or the panel. The store's `pan` API is already right; you are changing what
  consumes it.
- **Do not add a key to `toPersistedUIState()`** — that diff must stay empty.
- **Do not re-fit on pan.** A pan changes the camera only, never the scale.
- Keep the render target at exactly `cellWidth × cellHeight`, 1:1. No scaling `drawImage`, no
  `antialias: true`, no `LinearFilter`. ⚠️ Setting `canvas.width` re-enables
  `imageSmoothingEnabled` — re-set it on every context acquisition.
- Keep D12 gesture routing unchanged; a pinch must still zoom the **view**, not drag the model
  (see the note at `:4856`).

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
```

Root: `git diff -- client/src/stores/ui/UIStore.ts` → empty; lockfile sweep after every `bunx`.

**Manual checks — you cannot perform these; list them as owed:**

1. ⚠️ **Highest value: pan the model toward a border — it does NOT clip.** It slides out of frame
   smoothly and can leave entirely.
2. The image stays **pixel-aligned** while dragging — no shimmer, no half-pixel crawl.
3. Dragging feels 1:1 with the finger/cursor and is not inverted.
4. Panning does not change the model's apparent size.
5. A stamp taken after panning lands where the model is **drawn**.
6. Touch/iPad: pan still works; a pinch still zooms the view rather than dragging the model.

## Definition of done

- [ ] Pan translates camera **and** target together; the picture is blitted at a fixed origin.
- [ ] The world-units-per-texel conversion is derived, documented and **snapped to whole texels**.
- [ ] The stale comment at `2557-2561` is rewritten, not left contradicting the code.
- [ ] The stamp's offsets are corrected, and the `variantOffset`-vs-`viewMin` reasoning survives.
- [ ] A pan re-applies the camera but **never** re-runs the fit.
- [ ] `pan = (0,0)` reproduces the previous camera exactly.
- [ ] Pan stays unbounded; no `useState` on the pointer path.
- [ ] Gate green, `UIStore.ts` diff empty, no lockfile.
