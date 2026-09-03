# 01 — Every mesh's geometry origin is its own bounding-box centre

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/pose/poseMeshes.ts` · `client/src/ui/canvas/pose/__tests__/poseMeshes.test.ts`
**Effort:** M

## Objective

After this task, **every** object handed to the pose engine has its **geometry** centred on its
own origin: the mesh's bounding-box centre is `(0,0,0)` in geometry space, not merely nudged
there by a transform. A head rotates about the head, not about the mannequin's pelvis.

This is the foundation for the rest of the plan. Task 03 makes the model scale about its origin
and the fit rotation-invariant; neither is meaningful — or testable — while a part's origin is
somewhere else entirely.

## Context

**The owner's words:** *"The model break down pieces are in the mannequins mdoels space still.
The head etc should have their geometry centered on the canvas"* and *"Make sure all models
loaded and utilized ALL have their origin set to the middle of the bounding volume of the
model"*.

**The root cause, measured 2026-09-03.** `normalizeToUnitBox` at `poseMeshes.ts:889-903`:

```ts
object.scale.multiplyScalar(scale);
object.position.sub(centre.multiplyScalar(scale));
```

It writes the **object transform**, not the geometry's vertex data. The part therefore *looks*
centred on screen while its **geometry origin is still the mannequin's origin** — so
`root.rotation.set(...)` (`CanvasContainer.tsx:2758`) spins it about the mannequin's centre, and
anything reading vertex positions sees model-space coordinates.

⚠️ **It also writes `object.position`.** Task 04 implements pan via the **camera**, precisely so
it does not collide with this. Do not introduce a second writer of `object.position`.

**The two call sites — the only ones in production:**

| Line | Object | Kind |
| --- | --- | --- |
| `poseMeshes.ts:521` | `scene`, inside `loadMannequin(three, url, normalize)`, guarded by the flag | the **full mannequin** glTF scene |
| `poseMeshes.ts:694` | `mesh`, in `buildPartMesh` | a **single segmented part** |

`buildPartMesh` calls `loadMannequin(..., false)` at `:692` — it deliberately segments on the
**raw** scene, because normalizing first would leave vertex buffers in asset units. That
reasoning stays valid; you are changing what happens *after* the segmentation.

**Primitives are a separate case.** `buildGeometry` (`:756-779`) uses literal unit-box
constructor args — `BoxGeometry(1,1,1)`, `SphereGeometry(0.5,…)`, `CylinderGeometry(0.5,0.5,1,…)`
— and the comment at `:743-747` claims "the constructor arguments ARE the normalisation".
⚠️ **The owner said *all* models. Assert that claim with a test rather than trusting the
comment.** three's primitives are origin-centred by construction, so this should pass — but a
test that proves it is what item 7 actually asks for.

**Everything reaching the engine is expected to be in `UNIT_BOUNDS`** (`:72`), which is why the
fit passes a constant `bounds: UNIT_BOUNDS` (`CanvasContainer.tsx:2833`). Keep that true.

**Boundary:** `poseMeshes.ts` is under `client/src/ui/` — it may take `three` as a
`ThreeNamespace` **parameter** (D15/D2) but must not import a store, the API, `services/`, MobX,
or use `useContext`, **type-only included**. No module-level runtime `three` import.

**Prior art for testing geometry without WebGL:** the existing suite parses the glTF's vertex
data directly and never constructs a three geometry in the node lane. Follow that — see
`describe("every part is non-empty")` in `__tests__/poseMeshes.test.ts`, which reads the real
vendored asset.

## Steps

1. Read `poseMeshes.ts:470-540` (`loadMannequin`), `:660-700` (`buildPartMesh`), `:725-780`
   (`buildMesh` / `buildGeometry`) and `:877-903` (`normalizeToUnitBox`) before changing
   anything.
2. **Add a geometry-centring step.** Write a small, pure, exported helper — e.g.
   `centerGeometryOnOrigin(three, geometry)` — that computes the geometry's bounding box and
   **translates its `position` attribute** so that box's centre is `(0,0,0)`.
   - Use `geometry.translate(-cx, -cy, -cz)` (three mutates the position attribute in place) or
     write the attribute directly — say which you chose.
   - ⚠️ **Recompute or invalidate `boundingBox`/`boundingSphere` afterwards**, or later callers
     read stale bounds.
   - ⚠️ **Do not touch the `normal` attribute.** Translation does not affect normals, and task 05
     of the previous plan established that the part **copies** its source normals; rebuilding
     them here would silently restore flat shading.
3. **Call it in `buildPartMesh`**, on the part's geometry, **before** `normalizeToUnitBox`.
   After this the mesh's `position` offset from `normalizeToUnitBox` should be ~zero, because the
   geometry is already centred — assert that rather than assuming it.
4. **Decide what `normalizeToUnitBox` should still do**, and document it. It is still needed for
   *scale* (fitting into the unit box). If its `position.sub(...)` line is now always a no-op for
   parts, say so in a comment; do **not** delete the line, because the full-mannequin path at
   `:521` still relies on it unless you centre that too (see step 5).
5. **Handle the full mannequin** (`loadMannequin`'s normalize path). The owner said *all* models.
   Decide whether to centre the whole scene's geometry the same way or to leave the transform
   approach for that one path, **and justify it**. ⚠️ A glTF scene is a node tree, not one
   geometry — centring it may mean baking node transforms. If that is disproportionate, say so
   plainly and record it as a deviation rather than half-doing it.
6. **Assert the primitives.** Add tests proving `BoxGeometry`, `SphereGeometry` and
   `CylinderGeometry` as constructed here are already origin-centred. If jsdom cannot construct
   them, assert on the **constructor arguments** instead and say that is what you did.
7. **Test the new helper exhaustively** — it is pure array maths, so this is cheap and valuable:
   - a geometry offset far from the origin comes back centred;
   - an already-centred geometry is unchanged (idempotent);
   - a single-vertex (degenerate) geometry does not divide by zero or produce `NaN`;
   - the vertex **count** and the `normal` attribute are untouched;
   - bounds are recomputed, not stale.
8. **Prove the real parts are centred.** Extend the existing real-asset suite: for each of the
   five parts, the segmented geometry's bounding-box centre is `(0,0,0)` within a small epsilon.
   ⚠️ This is the assertion that actually proves the owner's bug is fixed — do not omit it.
9. Run the gate, then commit.

## Constraints

- **Do not edit** `CanvasContainer.tsx` (task 02 owns it this wave), `poseCamera.ts`,
  `poseEngine.ts`, `poseStamp.ts`, `poseTypes.ts` or `PoseUIStore.ts`.
- **Do not change the segmentation landmarks or the part triangle counts.** The five parts must
  still be an exact partition of 9,636 triangles: head 336, torso 2,912, arm 1,062, leg 1,346,
  hand 3,980. Those counts are pinned by existing tests — **if they change, you have broken the
  segmentation** and must stop and report.
- **Do not undo smooth shading** — `POSE_MATERIAL_FLAT_SHADING = false` and the segment counts
  (sphere 48×32, cylinder radial 48, height 1) stay as they are, and the part must keep
  **copying** its source `NORMAL` attribute rather than recomputing it.
- Do not modify `client/public/models/mannequin.gltf` or its `LICENSE.md`.
- Do not add a module-level runtime `three` import.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors (65 warnings is the baseline)
bunx vitest run                   # all pass — the part-count assertions MUST be unchanged
bun run lint:boundaries           # OK — all 5 rules
```

Root: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` → empty (sweep after every
`bunx`).

**Report the measured bounding-box centre of each of the five parts** before and after your
change. That is the evidence the bug is fixed.

**Manual checks — you cannot perform these; list them as owed:**

1. Selecting **Head** shows a head centred in the frame.
2. Rotating a part with the orb spins it **about itself**, not about a point off-screen.
3. The full mannequin still loads and frames as it did.
4. Parts still shade smoothly (no flat facets).

## Definition of done

- [ ] A pure, exported geometry-centring helper exists and is exhaustively tested.
- [ ] `buildPartMesh` centres the part's **geometry**, not just its transform.
- [ ] Each of the five real parts is proven origin-centred within an epsilon, by test.
- [ ] Primitives proven (or argued, with the reason stated) to be origin-centred already.
- [ ] The full-mannequin path is either centred too, or the decision not to is justified.
- [ ] Part triangle counts unchanged: 336 / 2,912 / 1,062 / 1,346 / 3,980, summing to 9,636.
- [ ] Smooth normals preserved; `normal` attribute untouched by the centring.
- [ ] Gate green, no lockfile.
