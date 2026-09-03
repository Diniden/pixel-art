# 06 — Mesh library, camera presets, auto-fit and stamp mapping

**Wave:** W2 · **Depends on:** 03
**Touches:** `client/src/ui/canvas/pose/poseMeshes.ts` (new) · `client/src/ui/canvas/pose/poseCamera.ts` (new) · `client/src/ui/canvas/pose/poseStamp.ts` (new) · `client/src/ui/canvas/pose/__tests__/poseMeshes.test.ts` (new) · `client/src/ui/canvas/pose/__tests__/poseCamera.test.ts` (new) · `client/src/ui/canvas/pose/__tests__/poseStamp.test.ts` (new)
**Effort:** L

## Objective

Three pure modules complete the engine's brain: `poseMeshes.ts` builds the primitive
geometries and declares the mannequin framing regions; `poseCamera.ts` owns the five camera
presets, the viewpoint rotations and the auto-fit maths; `poseStamp.ts` converts the
engine's raw RGBA/normal/depth buffers into `PixelStampCell[]`. All three are unit-tested in
the **node** lane, with the GL-dependent parts kept behind seams so no test needs a WebGL
context.

## Context

**This module must stay pure `ui/`**: no store, no MobX, no React, no API. `three` is
permitted (MASTER D15) but — as in task 03 — must be reached **only via the lazily-loaded
namespace**, never a module-level runtime `import * as THREE from "three"`. Type-only three
imports are erased and are fine.

**Design the modules so the maths is testable without GL.** jsdom has no WebGL. So:

- Geometry *construction* needs three (untestable in-lane) — keep it thin.
- Camera *maths* (angles, fit computation, projection parameters) must be **plain number
  functions over plain data**, taking a bounding box in and returning camera parameters out.
  These are the ones you test.
- Stamp *mapping* (RGBA → cell, normal decode, depth → height) is pure buffer arithmetic and
  must be fully tested.

### `poseMeshes.ts`

Builds the three primitives — **cube, sphere, cylinder** — as three geometries. Two rules:

1. **Low-poly on purpose.** The output is a handful of pixels wide. A 64-segment sphere and
   an 8-segment sphere are indistinguishable after rasterising to a 32×32 grid, and the
   low-poly one reads better as pose reference. Choose modest segment counts (a sphere
   around 16×12, a cylinder around 16 radial) and say why in a comment.
2. **Normalised size.** Every mesh is built to fit a **unit bounding box centred on the
   origin**, so `fitCameraToMesh` (below) has one job and not four special cases.

Also declare the **mannequin framing regions** (MASTER D4). The CC0 mannequin is a single
**unrigged** mesh, so "head / torso / arm / leg / hand" buttons are *camera framing presets
over one mesh*, not separate meshes. Express each as a **normalised sub-box** of the
mannequin's bounding box:

```ts
export const MANNEQUIN_REGIONS: Record<PoseFraming, { min: PoseVector; max: PoseVector }>
```

with `"full"` being the unit box. Values are approximate human proportions in normalised
model space (head ≈ top 12%, torso ≈ 40–70%, etc.) — document them as approximations tuned
by eye, to be adjusted in task 09 once the real asset is on disk.

⚠️ **Task 09 supplies the mannequin `.gltf`.** This task must define the **loading seam** —
an async `loadMannequin(three, url)` that returns an `Object3D` — but must **not** download
the asset, and must degrade gracefully: if the file is missing, the loader rejects and the
caller falls back to a primitive. Make the mannequin button's absence a runtime condition,
not a compile error.

Provide `buildMesh(three, id, color)` returning an `Object3D` for `"cube" | "sphere" |
"cylinder"` and delegating `"mannequin"` to the loader. The material should be a simple
Lambert/Phong-style material in the given model colour — flat enough to read as pixel
reference, not a PBR showcase.

### `poseCamera.ts`

**The five presets (MASTER D14)**, as data:

| Preset | Projection | Angles |
| --- | --- | --- |
| `"2d"` | orthographic | front-on: pitch 0°, yaw 0° |
| `"2.5d"` | orthographic | pitch ≈ 30°, yaw 0° |
| `"iso"` | orthographic | **true isometric**: pitch `atan(1/√2)` ≈ 35.264°, yaw 45° |
| `"top-down"` | orthographic | pitch 90°, yaw 0° |
| `"oblique"` | perspective | pitch ≈ 20°, yaw 45° |

Applying a preset sets projection + angles and **leaves zoom and pan untouched** — those are
independent user settings.

**The viewpoint buttons** (Front / Back / Left / Right / Top / Bottom / 3-quarter) set the
**model rotation**, not the camera. Export them as a `Record<string, PoseVector>` of euler
angles so task 07's buttons and task 08's wiring share one definition.

**`fitCameraToMesh()` — the auto-fit (MASTER D7).** This is the most important function in
the task and the one the request calls out explicitly ("centred… sized appropriately to fit
within the borders with some extra padding"). Signature roughly:

```ts
export function fitCameraToMesh(params: {
  bounds: { min: PoseVector; max: PoseVector };   // the region to frame
  canvasWidth: number;                            // cellWidth
  canvasHeight: number;                           // cellHeight
  projection: PoseProjection;
  rotation: PoseVector;
  fov: number;
  padding?: number;                               // default 0.1 → 90% fill
}): PoseCameraParams
```

Returns the camera parameters (position, target, and either `{left,right,top,bottom}` for
orthographic or `{fov, aspect}` for perspective) such that the **rotated** bounding box's
projection occupies **90% of the shorter canvas axis**, centred.

Requirements:
- Fit against the bounds **as rotated** — fitting the axis-aligned box then rotating makes
  the model clip at 45°.
- Handle **non-square canvases** correctly (the grid is often not square) — fit the limiting
  axis.
- Be **pure**: numbers in, numbers out, no three objects. This is what makes it testable.

### `poseStamp.ts`

Converts engine output into cells (MASTER D8). Signature roughly:

```ts
export function buildStampCells(params: {
  color: Uint8Array;      // RGBA, top-left origin, w*h*4
  normal: Uint8Array;     // RGBA from MeshNormalMaterial pass
  depth: Float32Array | Uint8Array | null;   // null → heights are 0
  width: number;
  height: number;
  alphaThreshold?: number;  // default 128
  heightRange: { near: number; far: number };
}): PoseStampCell[]
```

Rules, locked by D8:

- A texel is included **iff `alpha >= alphaThreshold`** (default 128). There is no partial
  alpha in the stamp — a pixel is either drawn or it is not.
- **Colour** is the lit RGB, with `a: 255` on the output cell.
- **Normal** is decoded from the normal pass: `n = rgb / 255 * 2 - 1`, then normalised.
  ⚠️ Confirm the handedness/axis convention matches what this project's lighting expects —
  read `client/src/utils/normalCompute.ts` and the `Normal` type in `types/domain.ts` first,
  and **match the existing convention**, documenting which one it is. Getting the Y axis
  flipped produces sprites lit from the wrong vertical direction, which looks plausible and
  is therefore easy to ship by accident.
- **Height** is the linearised depth normalised across `heightRange` into the project's
  height scale — again, read how `height` is used in `PixelData` and `setHeightPixels`
  before choosing the range and direction (nearer should mean *taller*).
- **If `depth` is `null`, every cell's height is `0`** — the documented fallback for
  hardware where depth readback is unavailable (MASTER risk register). This must be a clean,
  tested path, not a crash.

## Steps

1. Read `client/src/utils/normalCompute.ts`, the `Normal` and `PixelData` types in
   `types/domain.ts`, and `PixelStore.setHeightPixels` (`:1351`) to pin down the project's
   normal convention and height scale **before** writing `poseStamp.ts`.
2. Write `poseCamera.ts`: the preset table, the viewpoint rotation table, and
   `fitCameraToMesh()` as pure number maths. Document the isometric angle derivation.
3. Write `poseCamera.test.ts` (unit lane). Cover: each preset's projection and angles; a
   centred unit box fits with the expected padding; a non-square canvas fits the limiting
   axis; a 45°-rotated box does not exceed the frame; perspective and orthographic both
   produce sane parameters; the padding parameter changes the fit monotonically.
4. Write `poseStamp.ts`: `buildStampCells` plus any decode helpers.
5. Write `poseStamp.test.ts`. Cover: alpha threshold inclusion/exclusion at the boundary
   (127/128); colour passthrough with `a: 255`; normal decode round-trip for known values
   (a flat +Z normal must decode to the project's "facing viewer" normal); depth → height
   mapping at near, far and midpoint; **`depth: null` yields height 0 for every cell**; an
   all-transparent buffer yields an empty array.
6. Write `poseMeshes.ts`: `buildMesh`, `MANNEQUIN_REGIONS`, and the `loadMannequin` seam
   that fails gracefully when the asset is absent.
7. Write `poseMeshes.test.ts`. Test what is testable without GL: the region table's shape
   and invariants (every region inside the unit box, `min < max` on every axis, `"full"`
   equals the unit box). Do **not** construct three geometries in a test.
8. Run the full verification. **Commit after step 8**:
   `feat(pose): mesh library, camera presets, auto-fit and stamp mapping`.

## Constraints

- **No store, MobX, React, API or `services/` imports.** Pure `ui/`.
- **No module-level runtime `import` of `three`** — take the lazily-loaded namespace as a
  parameter, or import types only.
- **Do not download the mannequin asset** — task 09 owns that. Define the seam only.
- Do not touch `poseEngine.ts` or `poseTypes.ts` (task 03's files) — if you need a change
  there, record it in `HANDOFF.md` and work around it, or stop as BLOCKED.
- Do not touch `CanvasContainer.tsx` (task 08) or any panel file (task 07).
- No test may require a WebGL context.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass, incl. 3 new test files
bun run lint:boundaries                             # OK
bunx stylelint "src/**/*.css"                       # exactly 2 errors (unchanged)
bun run build                                       # succeeds
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # nothing
```

**Manual checks:**

1. `bun run dev` still starts (nothing is wired yet; this is a regression check).
2. Confirm the three chunk is still **not** fetched on page load — these modules must not
   have introduced a static three import.

## Definition of done

- [ ] `poseMeshes.ts` builds cube, sphere and cylinder normalised to a unit box, low-poly
      with the reasoning documented.
- [ ] `MANNEQUIN_REGIONS` declares all six framings as normalised sub-boxes, marked as
      approximations to be tuned in task 09.
- [ ] `loadMannequin` is a seam that **fails gracefully** when the asset is absent.
- [ ] `poseCamera.ts` declares all five presets with the true isometric angle derived and
      documented, plus the seven viewpoint rotations.
- [ ] `fitCameraToMesh()` is pure, handles rotation and non-square canvases, and defaults to
      10% padding.
- [ ] `poseStamp.ts` implements the alpha threshold, colour passthrough, normal decode
      **matching the project's existing convention (verified, and named in a comment)**,
      depth→height mapping, and the `depth: null` → height 0 fallback.
- [ ] All three test files pass, covering every case listed in the Steps.
- [ ] No test requires WebGL; no runtime three import at module level.
- [ ] Full gate green; no lockfile.
- [ ] One commit, containing only this task's hunks.
