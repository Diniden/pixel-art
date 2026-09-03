# 05 — Split the mannequin into real part meshes, and delete framing

**Wave:** W3 · **Depends on:** 02
**Touches:** `client/src/ui/canvas/pose/poseMeshes.ts` · `client/src/ui/canvas/pose/poseTypes.ts` · `client/src/ui/canvas/pose/poseCamera.ts` · `client/src/ui/canvas/pose/__tests__/poseMeshes.test.ts` · `client/src/ui/canvas/pose/__tests__/poseCamera.test.ts`
**Effort:** L

## Objective

Clicking **Head** loads *only the head*, as its own mesh, centred and auto-fitted exactly
like a cube or a sphere. Same for Torso, Arm, Leg, Hand, and Full. The camera-framing
approach (`PoseFraming`, `MANNEQUIN_REGIONS`, `getFramingBounds`) is **deleted**, not left
alongside.

## Context

**The owner's words:** *"Right now the poses let me place the full mannequin. Let's instead
break it down to just render the head, torso, arms etc as individual pieces, this would
replace the 'framing' feature you made."*

**Why this needs geometry surgery, not node selection — measured 2026-09-03.** The glTF at
`client/public/models/mannequin.gltf` (CC0, 380,956 bytes, sha256
`d936e4b7602147f05b4fe5a6d712eebf0a575be154e66834c9a9e0e0ebabef44`) has **only two nodes**:

| Node | Mesh | Verts | Bounds |
| --- | --- | --- | --- |
| `mannequin_joints` | `joints` | 1,270 | x `[-0.75, 0.75]`, y `[0.00, 1.56]` |
| `mannequin_body` | `body` | 5,738 | x `[-0.76, 0.76]`, y `[-0.00, 1.71]` |

**Both span the entire figure.** There is no per-limb node, no skeleton (0 skins, 0
animations) and no named sub-object. So a part mesh must be built by **selecting triangles
spatially and constructing a new `BufferGeometry`** from them.

**The measured anatomy — reuse it, do not re-derive it.** The mesh is a **T-pose** (width
1.519 × height 1.712, aspect 0.887; maximum |x| occurs at shoulder height). Pose-tool task 09
segmented it using the mesh's own structure, and those landmarks are recorded in the
`MANNEQUIN_REGIONS` comments in `poseMeshes.ts`:

- **crotch split** — two disjoint x-clusters below y ≈ 0.47
- **neck pinch** — |x| collapses below 0.06 at y ≈ 0.84
- **arm bar** — |x| > 0.25 occurs only in the band y ≈ 0.76–0.81

Those normalised fractions are your segmentation boundaries. ⚠️ **The region values are
normalised (0..1) fractions of the mesh bounds, while the raw glTF coordinates are in the
model's own units** — convert deliberately and test the conversion, because getting this
wrong produces a part that is empty or is the whole body.

**A part with zero triangles is the failure mode to guard against.** Task 09 found that the
*previous* estimates put Arm and Hand over empty space — because they assumed arms hanging at
the sides rather than a T-pose. **Every part you build must be asserted non-empty**, and the
test must fail loudly if a boundary is ever retuned into emptiness.

**The unions are duplicated on purpose.** `poseTypes.ts` (under `ui/`) and
`stores/ui/PoseUIStore.ts` both declare `PoseMeshId` / `PoseFraming` / etc., because the `ui/`
boundary forbids `ui/` importing from `stores/`. **Both headers say they must change
together.** ⚠️ **`PoseUIStore.ts` is NOT in your `Touches`** — task 06 makes the matching store
change. You change `poseTypes.ts`; task 06 changes `PoseUIStore.ts`. Say clearly in your
report what the store side must now look like, so task 06 can match it exactly.

**Deletion is as much of this task as addition.** `PoseFraming`, `MANNEQUIN_REGIONS` and
`getFramingBounds` must go. Files that reference them (measured 2026-09-03) — those in *your*
`Touches` you fix; the rest belong to task 06:

| File | Owner |
| --- | --- |
| `ui/canvas/pose/poseMeshes.ts`, `poseTypes.ts`, `poseCamera.ts` + their tests | **you** |
| `stores/ui/PoseUIStore.ts` + test, `containers/CanvasContainer.tsx`, `containers/PixelStudioPanelContainer.tsx`, `ui/components/PosePanel/*` | task 06 |

(`ApplicationStore.ts`, `poseEngine.ts`, `railVisibility.ts` and
`store/__tests__/helpers.test.ts` match only in **prose comments** — no code change needed,
though a stale comment mentioning framing may be worth a note.)

**Boundary:** everything you touch is under `client/src/ui/` — `three` is permitted (D15),
a store/API/`services/`/MobX/`useContext` import is not, type-only included. `three` arrives
as a **parameter** (`ThreeNamespace`), never a module-level runtime import (D2).

**Depends on task 02** because it changes the same file's material/segment code; running them
in one wave would collide.

## Steps

1. Read `poseMeshes.ts` end to end, then `poseTypes.ts`, then the two test files. Note every
   place `PoseFraming` appears.
2. **Redefine the type.** `PoseMeshId` becomes the union of the primitives *and* the parts:
   `"cube" | "sphere" | "cylinder" | "mannequin" | "head" | "torso" | "arm" | "leg" | "hand"`
   — or keep the mannequin parts under a clearly named subtype if that reads better. **Delete
   `PoseFraming`.** Whatever you choose, write it down precisely in your report: task 06 must
   mirror it in `PoseUIStore.ts` character for character.
3. **Write the segmentation as a pure, testable function**, e.g.
   `partTriangleFilter(part, meshBounds)` returning a predicate over a triangle's centroid,
   or a function from vertex positions → the indices belonging to a part. Keep the geometry
   *construction* thin and the *decision* pure — that is what makes it testable without GL
   (jsdom has no WebGL).
   - **Segment by triangle, not by vertex.** Selecting vertices alone leaves dangling indices
     and holes; a triangle is in a part if (say) its centroid is in the region. State the rule.
   - Decide what happens to triangles straddling a boundary and document it.
4. **Build the sub-geometry.** For the selected triangles, emit a new `BufferGeometry` with
   position and normal attributes (and index, if you keep it indexed). ⚠️ **Preserve the
   smooth vertex normals task 02 just enabled** — if you rebuild normals, call
   `computeVertexNormals()` so the part still shades smoothly; a part that reverts to flat
   facets undoes task 02.
5. **Re-centre each part.** A part must arrive centred and auto-fitted like a primitive, so
   normalise it into the unit box the same way `normalizeToUnitBox` does for the others.
   Reuse that function rather than writing a second one.
6. **Delete the framing machinery** from your files: `MANNEQUIN_REGIONS`, `getFramingBounds`,
   `PoseFraming`, and any framing parameter threaded through `poseCamera.ts`. Grep for each
   name afterwards and confirm the only remaining hits are in files owned by task 06.
7. **Rework the tests.** The existing `getFramingBounds` suite and the region-invariant suite
   both go away with the code they test. Replace them with tests that are *stronger*:
   - **every part is non-empty** — the anti-regression for task 09's T-pose bug;
   - parts are disjoint (no triangle in two parts) and their union is the whole mesh, or
     document deliberately why not (e.g. if `full` overlaps everything by design);
   - the anatomical invariants survive in a new form — the head is above the torso, the hand
     is at the outer end of the arm on the same side, the leg is in the bottom half;
   - each part normalises into the unit box;
   - segmentation is pure and deterministic.
   Follow the existing convention of **not constructing three geometries in the node lane** —
   test the pure filter against synthetic vertex arrays, and, where you need the real mesh,
   parse the glTF's vertex data directly as task 09 did.
8. Run the full gate, then commit.

## Constraints

- **Do not edit** `stores/ui/PoseUIStore.ts`, `containers/*`, `ui/components/PosePanel/*`,
  `poseStamp.ts` or `poseEngine.ts` — all task 06. If the build is red because those files
  still reference `PoseFraming`, that is **expected**: say so, and let task 06 finish it.
  ⚠️ **This means your task may legitimately leave `tsc` failing on files you do not own.**
  Report that honestly with the exact errors; do not reach outside `Touches` to silence it,
  and do not treat it as your failure.
- **Do not re-tune the anatomical landmarks by eye.** Use the measured ones; if you must
  adjust, measure against the real vertex data and show the numbers.
- Do not undo task 02's smooth normals or segment counts.
- Do not add a module-level runtime `three` import.
- Do not modify `client/public/models/mannequin.gltf` or its `LICENSE.md`.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # may FAIL on task-06-owned files; report the exact errors
bunx eslint .                     # 0 errors in files you own
bunx vitest run                   # your suites pass; report any failure you did not cause
bun run lint:boundaries           # OK — must hold regardless
```

Root: lockfile sweep after every `bunx`.

Also report, from the real mesh: **the triangle count of every part**, proving none is empty.

**Manual checks — all owed, list them:**

1. Each part button loads only that part, centred and fitted.
2. The head looks like a head; the arm like an arm (the T-pose makes "arm" a horizontal bar —
   confirm that reads correctly when framed alone).
3. A part rotates, lights, pans and stamps exactly like a primitive.
4. Parts still shade smoothly (task 02 not undone).
5. "Full" still loads the whole mannequin.

## Definition of done

- [ ] `PoseFraming`, `MANNEQUIN_REGIONS`, `getFramingBounds` deleted from your files.
- [ ] `PoseMeshId` (or equivalent) covers primitives + parts; the exact shape is in the report.
- [ ] Segmentation is a pure function, triangle-based, with the straddle rule documented.
- [ ] Each part builds a real sub-geometry, normalised into the unit box.
- [ ] Smooth vertex normals preserved on parts.
- [ ] **Every part proven non-empty, with triangle counts in the report.**
- [ ] Anatomical invariants re-expressed as tests.
- [ ] Any remaining `tsc` errors are only in task-06-owned files, and are listed exactly.
- [ ] Boundaries pass; no lockfile.
