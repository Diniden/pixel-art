# 03 — The camera holds still: fit solves for scale, and rotation stops pulsing

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/canvas/pose/poseCamera.ts` · `client/src/ui/canvas/pose/__tests__/poseCamera.test.ts` · `client/src/stores/ui/PoseUIStore.ts` · `client/src/stores/ui/__tests__/PoseUIStore.test.ts` · `client/src/containers/CanvasContainer.tsx` · `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` · `client/src/ui/components/PosePanel/PoseSection.stories.tsx`
**Effort:** L

## Objective

The camera is **placed once and holds still**. What the owner manipulates is the **model**:
`zoom` becomes `scale`, a multiplier on the model's own transform about its own origin. The fit
no longer moves the camera — it **solves for the scale factor** that makes the model fill the
frame. And because the fit no longer depends on the model's rotation, **the pulsing stops**.

This is the heart of the plan. Two owner items (4 and 6) are one fix seen from two angles.

## Context

**The owner's words:** *"There is a rotation oddity as well: if I rotate the models with the Orb
for rotation, the model pulses in size like the camera is getting closer and further to the model
as it goes around."* and *"Zoom -> this should be scale. I want the camera to hold still and have
the model scaled up and down from it's origin."*

**The pulsing, root cause — measured 2026-09-03.** `fitCameraToMesh` (`poseCamera.ts:293-437`)
measures the **rotated** projected extent: `:331-344` loops the 8 box corners through
`applyEulerXYZ(local, rotation)` (`:340`) then `worldToView(rotated, pitch, yaw)` (`:341`),
taking `max |view.x| / |view.y| / |view.z|` (`:342-344`). For a non-cubic model that extent
genuinely changes as it turns — a box is wider across its diagonal than across its face — so the
auto-fit re-frames on **every rotation step** and the model breathes. The rotation reaches the
fit from `CanvasContainer.tsx:2837` (dep at `:2876`).

**Locked decisions that govern this task:**

- **F4** — the camera is placed **once** and holds still. `fit()` solves for the **model scale
  factor**; it does **not** move the camera.
- **F5** — the fit **must not depend on the model's rotation**. This is the direct cure for the
  pulsing and follows from F4.
- **F6** — `zoom` → `scale`, renamed **and re-meant**: a multiplier on the **model's** transform
  about its own origin, not a frustum divisor. **`scaleCameraParams` is deleted.**

**How to make the fit rotation-invariant (F5).** Pick **one**, document it, and test it:

1. **Bounding sphere (recommended).** Fit the model's bounding *sphere*. A sphere's projected
   radius is rotation-invariant by construction, so framing provably cannot change with rotation.
   Cost: a long thin model is framed a little loosely at every angle.
2. **Unrotated box.** Fit the box with identity rotation. Framing is stable, but a rotated corner
   can overflow the frame slightly.

Option 1 is recommended because it is *provably* invariant with no "does it clip?" caveat — and
because every mesh is already normalised into `UNIT_BOUNDS`, so the sphere is a known quantity.

**What exists today:**

| Site | What |
| --- | --- |
| `poseCamera.ts:293-437` | `fitCameraToMesh`; `FitCameraParams` `:240-264`; `PoseCameraParams` `:223-238` |
| `poseCamera.ts:331-344` | ⚠️ the rotated-corner loop — **the pulsing** |
| `poseCamera.ts:396-400` | `position = centre + orbitDirection(pitch,yaw) * distance`; `target` is always the bounds centre |
| `poseCamera.ts:411-415` | `near`, then `far` derived from it so `far > near` by construction |
| `poseCamera.ts:476-497` | `applyCameraParams` — writes camera fields, `lookAt` `:495`, `updateProjectionMatrix()` `:496` |
| `CanvasContainer.tsx:403-432` | ⚠️ **`scaleCameraParams` — DELETE (F6).** The old "zoom": divides the ortho box, or `atan(tan(fov/2)/zoom)` |
| `CanvasContainer.tsx:2754-2760` | rotation applied as a mesh transform, `root.rotation.set(...)` at `:2758` |
| `CanvasContainer.tsx:2782-2879` | the auto-fit effect: `fitCameraToMesh` `:2832`, rotation passed `:2837`, `applyCameraParams` `:2866`, `engine.setCamera` `:2867`, deps `:2871-2879` |
| `PoseUIStore.ts` | `zoom` field, `setZoom`, `POSE_ZOOM_MIN_SAFE = 1e-3`, `fitGeneration`, `requestFit()` |
| `PoseSection.tsx` | the zoom slider + the uncapped zoom number box, `POSE_ZOOM_SLIDER_MIN/MAX` |

**The model root is `poseRootRef`** (`CanvasContainer.tsx:2754-2760` uses it for rotation). That
is where the scale belongs: `root.scale.setScalar(...)`.

⚠️ **`normalizeToUnitBox` (`poseMeshes.ts:889-903`) writes `object.scale.multiplyScalar(scale)`
and `object.position.sub(...)` on the object it normalises.** If you set scale on the *same*
object it normalised, you will fight it. Apply the user's scale to a **wrapper/root** that
`normalizeToUnitBox` does not touch, or set it multiplicatively from a known base — **decide,
document, and test that a mesh swap does not compound scale.**

**Boundary:** `poseCamera.ts` and `PoseSection.tsx` are under `client/src/ui/` — no store, API,
`services/`, MobX or `useContext`, type-only included. `poseCamera.ts` imports nothing from three
(`PoseCameraLike` at `:453-468` is structural). `observer()` only in `containers/`.

⚠️ `poseTypes.ts` and `PoseUIStore.ts` duplicate their unions **deliberately** and must change
together, character for character, if you touch one.

## Steps

1. Read, in order: `poseCamera.ts:223-437` (params + fit), `:476-497` (apply),
   `CanvasContainer.tsx:403-432` (`scaleCameraParams`), `:2754-2760` (rotation effect),
   `:2782-2879` (the fit effect), then `PoseUIStore.ts`'s zoom region and `PoseSection.tsx`'s
   zoom controls.
2. **Make the fit rotation-invariant.** Choose bounding-sphere or unrotated-box, implement it in
   `fitCameraToMesh`, and **write the reasoning next to the code**. Remove `rotation` from the
   framing computation. ⚠️ If `rotation` becomes unused in `FitCameraParams`, **remove it from
   the type** rather than leaving a lying parameter — and update every caller.
3. **Make the fit solve for scale (F4).** `fit()` must produce the **model scale factor** that
   fills `1 - padding` of the shorter canvas axis, at a **fixed** camera. Decide the shape:
   either `fitCameraToMesh` returns a scale alongside the camera params, or a new pure function
   `solveFitScale(...)` does it. **Name it clearly and test it directly.**
4. **Place the camera once.** The camera's position/target/frustum should now depend on
   `projection`, `pitch`, `yaw`, `fov`, `near`/`far` and the canvas — **not** on rotation and
   **not** on scale. Verify by test that changing rotation or scale leaves `PoseCameraParams`
   byte-identical.
5. **Rename `zoom` → `scale` throughout** (F6): the store field, its action, the constants, the
   panel props and labels. Keep a tiny positive **floor** (the safety guard, never a cap).
   ⚠️ Hold the names in MASTER §8: `scale`, `setScale`. Update the panel's label to **"Scale"**.
6. **Delete `scaleCameraParams`** (`CanvasContainer.tsx:403-432`) and every call to it. Its job
   is gone: scale no longer touches the frustum.
7. **Apply scale to the model root.** `root.scale.setScalar(fitScale * userScale)` — or whatever
   composition you designed in step 3 — in an effect alongside the rotation effect at `:2754`.
   ⚠️ Make sure a **mesh swap does not compound** scale (the `normalizeToUnitBox` trap above).
8. **Preserve the initial auto-fit and the Fit button.** `fitGeneration` / `requestFit()` keep
   their names and monotonic semantics. A fit now **sets the scale**; it must still not reset
   **pan**. Auto-fit still runs on mesh change, projection/preset change and
   `cellWidth`/`cellHeight` change.
9. **Test the invariance explicitly — this is the task's core evidence:**
   - sweep rotation through a **full revolution** (e.g. 24 steps about each axis, and a few
     compound angles) and assert the resulting **camera params are identical** and the **fit
     scale is identical**;
   - the same for a deliberately non-cubic bounds (a long thin box) — this is the case that
     pulsed;
   - changing `scale` does not change any camera param;
   - the fit scale makes the model fill `1 - padding` of the shorter axis, for square, wide and
     tall canvases;
   - the floor rejects 0, negatives, `NaN` and `±Infinity`; large scales are accepted verbatim.
10. **Update the panel, its DOM tests and its stories** for the rename. Keep the uncapped numeric
    entry — the owner values it.
11. Run the gate, then commit. Commit the store/camera change and the container/panel change
    separately if that keeps each commit coherent.

## Constraints

- **Do not add a key to `toPersistedUIState()`** — `git diff -- client/src/stores/ui/UIStore.ts`
  must be **empty**. Pose state is session-only until task 08.
- **Do not implement pan here** — task 04 owns it. Leave `pan` exactly as it is, including the
  fit's deliberate omission of it from the dependency array.
- **Do not change** `poseMeshes.ts` (task 01 just changed it), `poseStamp.ts`, `poseOutline.ts`
  or `poseEngine.ts`.
- **Do not change D12 gesture routing**, the overlay's own `useCanvasRender`, or add a `useState`
  on a pointer path.
- Do not deep-observe a pixel grid.
- Keep the render target at exactly `cellWidth × cellHeight`, 1:1.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
```

Root:

```sh
git diff -- client/src/stores/ui/UIStore.ts                    # MUST be empty
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # MUST be empty
```

**Report the rotation-sweep test output** — the numbers showing camera params and fit scale are
constant across a full revolution. That is the proof the pulsing is fixed.

**Manual checks — you cannot perform these; list them as owed:**

1. ⚠️ **Highest value: rotate the orb through a full circle — the model does NOT pulse.**
2. The **Scale** control grows/shrinks the model about its own centre while the camera visibly
   does not move.
3. Scale far past the old cap; nothing clamps it.
4. **Fit to canvas** still frames the model tidily, at the current rotation, without resetting pan.
5. Initial load still auto-fits with padding.
6. Resizing the object re-fits.
7. A part and a primitive both scale about their own centres (needs task 01).

## Definition of done

- [ ] The fit is provably rotation-invariant — tested across a full revolution, including a
      non-cubic bounds.
- [ ] `fit()` solves for the **model scale**; the camera does not move (F4).
- [ ] Camera params are proven independent of both rotation and scale.
- [ ] `zoom` is renamed and re-meant as `scale` everywhere, floor kept, no cap.
- [ ] `scaleCameraParams` is **deleted**, with no callers left.
- [ ] Scale is applied to the model root and does not compound across a mesh swap.
- [ ] Initial auto-fit and the Fit button still work; a fit does not reset pan.
- [ ] Panel, DOM tests and stories updated for the rename.
- [ ] `UIStore.ts` diff empty. Gate green, no lockfile.
