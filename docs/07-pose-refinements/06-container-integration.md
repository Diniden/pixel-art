# 06 — Wire it together: store, container, free zoom, fit, outline, parts

**Wave:** W4 · **Depends on:** 01, 02, 03, 04, 05
**Touches:** `client/src/stores/ui/PoseUIStore.ts` · `client/src/stores/ui/__tests__/PoseUIStore.test.ts` · `client/src/containers/CanvasContainer.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` · `client/src/ui/components/PosePanel/PoseSection.stories.tsx`
**Effort:** L

## Objective

Everything the previous five tasks built becomes the working feature: the mannequin part
buttons replace the framing buttons end to end, the model colour follows the app's Fill slot
and the outline follows Edge, the thickness slider drives a real outline, the Fit button
re-frames at the current rotation, and zoom/pan move freely with the model allowed off canvas.
`tsc` is green again.

This is the integration task and is **alone in its wave** — it owns `CanvasContainer.tsx`
(4,300+ lines) and closes the type hole task 05 deliberately left open.

## Context

Read `docs/07-pose-refinements/HANDOFF.md` before starting — tasks 01–05 record exactly what
they shipped, and **task 05's report contains the precise `PoseMeshId` shape you must mirror**
in `PoseUIStore.ts`.

**What lands in your lap:**

| From | What you must finish |
| --- | --- |
| 01 | `fitGeneration` + `requestFit()` exist on the store. **You add the container reaction** that performs the fit. |
| 02 | Smooth normals, more segments. Nothing to wire — but see the stamp note below. |
| 03 | The panel ships `onRequestFit`, `edgeWidth`/`onSetEdgeWidth`, and Fill/Edge swatch callbacks. **You add the store field `edgeWidth` + its action**, and the container wiring for all of them. |
| 04 | `applyOutline()` is pure and tested. **You call it** on the read-back RGBA before it reaches the overlay `ImageData`. |
| 05 | `PoseFraming` is gone from `ui/canvas/pose/`. **You delete it from the store, the container and the panel**, and add the part buttons. |

**⚠️ Expect a red `tsc` when you start.** Task 05 deliberately left `PoseUIStore.ts`,
`CanvasContainer.tsx`, `PixelStudioPanelContainer.tsx` and `PosePanel/*` still referencing
`PoseFraming`. Closing that is your first job, not a bug you discovered.

**The duplicated unions must be re-synced.** `poseTypes.ts` (task 05) and `PoseUIStore.ts`
(you) declare the same unions separately because `ui/` cannot import `stores/`. Both headers
say they change together. **Copy task 05's shape exactly** — a mismatch here compiles on one
side and fails on the other.

**The zoom fold is the actual fix for the owner's complaint.** Pose-tool task 08 folded zoom
into `fitCameraToMesh`'s padding, making the fit the sole owner of framing — which is *why*
zoom caps out. Task 01 removed the clamp; **you must separate the concerns**:

- **Auto-fit** runs on mesh change, projection/preset change, and on `cellWidth`/`cellHeight`
  change (the resize requirement — resize notifies via `domainVersion`, **not**
  `pixelVersion`), **and** whenever `fitGeneration` increments.
- **Zoom** becomes a free multiplier applied *after* the fit, not folded into its padding.
- **Pan** is a free screen-space translation, never clamped — the model may go fully off
  canvas.
- **A fit must not reset zoom or pan** unless a new mesh is loaded. "Fit at the current
  rotation and camera properties" means exactly that.

**Locked decisions that still bind:**

- **D5** — the render target stays exactly `cellWidth × cellHeight`, 1:1. No scaling
  `drawImage`, no `antialias: true`, no `LinearFilter`. **The outline runs at this 1:1
  resolution**, on the read-back buffer, before `putImageData`. Setting `canvas.width` resets
  `imageSmoothingEnabled` to `true` — re-set it on every context acquisition.
- **D11** — the pose overlay keeps its **own** `useCanvasRender`. Drag state in **refs**;
  repaint via `invalidate()`. **Never `useState` per pointer sample.** (There is one existing
  `useState` in the pose region, `poseEngineTick`, set once at engine creation — that is fine;
  do not add another on a pointer path.)
- **D12** — gesture routing unchanged: `pose` stays in `isGestureTool`, its branches stay
  **ahead of the touch `isGestureTool` bails**, double-click stays 400 ms / 2 cells in a ref.
- **D6** — pose state stays session-only. **No key may be added to `toPersistedUIState()`.**
  `git diff -- client/src/stores/ui/UIStore.ts` must remain empty. `edgeWidth` is session
  state like everything else here.
- **D14** — preset-overrides-projection **stays as written**. The owner decided this
  explicitly on 2026-09-03. Do not "fix" it as a side effect.
- **Fresh objects per cell** — `setPixelCells` does not deep-copy, so the stamp must pass a
  new `color`/`normal` object per cell. This already holds in `buildStampCells`; do not
  regress it.
- The colour convention: project is **Y-DOWN**, three is **Y-UP**, the normal decode
  **negates Y**; scales 127 for x/y, 255 for z; height 1–255 with **0 as "no data"**.

**⚠️ The outline and the stamp.** Decide and document: **does the outline get stamped?** The
owner asked for an outline "around the model" as a *reference* affordance. Stamping it would
write edge-coloured pixels with no meaningful normal or height. **Recommended: the outline is
display-only and is NOT stamped**, so `buildStampCells` keeps reading the pre-outline buffer.
If you implement it otherwise, say why and make sure the normals/heights for outline pixels
are defined. Either way this must be an explicit, documented choice — and it is a question
worth surfacing to the owner in the ledger.

**⚠️ Unverified ground beneath you.** 30 manual checks from the pose-tool plan
(`docs/06-pose-tool/HANDOFF.md` §7) have **never been performed** — nobody has seen the GL
path run. In particular the depth-derived heights were reasoned from three's shader source,
never executed on a GPU, and they share the readback path you are now adding the outline to.
Do not assume that path is proven. If you can add a cheap guard (e.g. the outline never
touching the depth read), do.

## Steps

1. Read the HANDOFF entries for 01–05 first, then `PoseUIStore.ts`, then the pose region of
   `CanvasContainer.tsx` (search for `renderPose` / `poseEngineRef` / concern #14).
2. **Re-sync the store's unions with task 05's `poseTypes.ts`.** Delete `framing` and
   `setFraming`. Add `edgeWidth` (integer, default whatever task 03's slider expects — 0 for
   "no outline" if that is what 03 shipped) and `setEdgeWidth`, clamped to the documented
   integer range. Update `clear()`.
3. **Fix the container and panel compile errors** from the framing deletion. The part buttons
   replace the framing buttons in `PoseSection.tsx`; they select a *mesh*, so they route
   through the existing `onSelectMesh` path rather than a separate framing callback.
4. **Wire the Fill/Edge colours** in `PixelStudioPanelContainer.tsx`: model colour from
   `ui.tool.fillColorOrSelected`, outline colour from `ui.tool.selectedColor`, and the "edit
   this slot" callbacks to `ui.tool.setColorTarget(...)`. Convert `Color` ⇄ `PoseColor` at the
   container boundary — **never** import a store type into `ui/`.
   ⚠️ **Do not seed a default `fillColor`** — always read through `fillColorOrSelected`.
5. **Separate zoom from the fit** in the container's camera code, per the Context section.
   Auto-fit on mesh/projection/preset/`cellWidth`/`cellHeight`/`fitGeneration`; apply zoom as
   a free multiplier afterwards; leave pan unclamped.
6. **Add the `fitGeneration` reaction** so the Fit button re-frames at the current rotation
   and camera settings without disturbing zoom or pan.
7. **Call `applyOutline()`** on the read-back RGBA before writing the overlay `ImageData`,
   using `edgeWidth` and the Edge colour. Skip the call entirely when width is 0 — a per-frame
   no-op should cost nothing. Keep it at 1:1; no scaling anywhere.
8. **Decide the outline-vs-stamp question** (see Context), implement it, and document it in
   code *and* in your report.
9. **Update the store tests, the panel DOM tests and the stories** for the new surface: part
   buttons, `edgeWidth`, no framing. Keep the "not persisted" assertions intact.
10. Run the **full** gate including `bun run verify` from the root, then commit.

## Constraints

- **Do not add a key to `toPersistedUIState()`**; `git diff -- UIStore.ts` must be empty.
- **Do not change D14's preset/projection behaviour.**
- **Do not deep-observe a pixel grid**; pixel grids stay `observable.ref`.
- **Do not route pose repaints through the main `render`** — its own `useCanvasRender` only.
- **Do not add a `useState` on any pointer path.**
- No numeric `z-index` in any CSS you touch; stylelint stays at **exactly 2 errors**.
- `observer()` only in `containers/`; nothing under `ui/` imports a store/API/MobX/`services/`.
- **Never run `vitest -u`.** The 151 corpus digests must be unchanged.
- Do not modify the vendored mannequin asset.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0 — the hole task 05 left is now CLOSED
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass; corpus digests unchanged
bun run lint:boundaries           # OK
bunx stylelint "src/**/*.css"     # EXACTLY 2 errors
```

From the root:

```sh
bun run verify                                                 # exit 0
git diff -- client/src/stores/ui/UIStore.ts                    # EMPTY
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # EMPTY
git status --short -- '*__snapshots__*'                        # EMPTY
```

**Manual checks — you will not be able to perform these. List every one as owed:**

1. **Zoom past the old cap**: the model can be made much larger than the canvas, and keeps
   going. Nothing clamps it.
2. **Pan fully off canvas** in every direction; the model is allowed to leave entirely.
3. **Fit to canvas** re-frames at the *current* rotation, without resetting zoom or pan
   afterwards; pressing it twice is idempotent.
4. **Initial load still auto-fits** with padding — the behaviour the owner liked.
5. **Resize the object**: the render target follows and the model re-fits.
6. Model colour follows the **Fill** slot; changing Fill in the main picker recolours it live.
7. Outline colour follows the **Edge** slot.
8. Thickness slider 1→4 produces a visibly thicker, **hard-edged** outline with no soft
   fringing, and 0 (or the off state) removes it.
9. The outline hugs the silhouette exactly — no gap, no overlap onto the model.
10. **Each part button** (Head/Torso/Arm/Leg/Hand/Full) loads that part alone, centred.
11. A part rotates/lights/pans/stamps like a primitive.
12. Smooth shading is visible on sphere, cylinder and the mannequin parts.
13. **Stamp**: still one undo entry; outline behaviour matches your documented decision.
14. **Touch/iPad**: pan and double-tap still work; the slider is usable; the rail does not
    scroll while dragging it.
15. **WebGL**: switch tools and meshes ~20× — no `Too many active WebGL contexts`.

## Definition of done

- [ ] `tsc` exits 0 — task 05's deliberate hole is closed.
- [ ] `PoseFraming` is gone from the entire repo (grep proves it).
- [ ] Store unions match `poseTypes.ts` exactly.
- [ ] `edgeWidth` + `setEdgeWidth` on the store, session-only, clamped, tested.
- [ ] Zoom is a free multiplier applied after the fit; pan unclamped; neither reset by a fit.
- [ ] `fitGeneration` reaction re-frames at current rotation/camera.
- [ ] Initial auto-fit preserved.
- [ ] `applyOutline()` called at 1:1 on the read-back buffer; skipped when width is 0.
- [ ] The outline-vs-stamp decision is implemented and documented in code and report.
- [ ] Part buttons replace framing buttons throughout.
- [ ] `bun run verify` exits 0; `UIStore.ts` diff empty; no lockfile; no snapshot changed.
