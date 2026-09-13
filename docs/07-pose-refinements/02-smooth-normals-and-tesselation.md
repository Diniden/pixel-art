# 02 — Smooth vertex normals, and more polys on the rounded primitives

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/pose/poseMeshes.ts` · `client/src/ui/canvas/pose/__tests__/poseMeshes.test.ts`
**Effort:** S

## Objective

The reference solids shade smoothly instead of facet-by-facet. Lighting sweeps across a
sphere as a gradient rather than as a ring of flat tones, and the rounded primitives carry
enough geometry that the silhouette is round rather than polygonal at the resolutions the
owner actually draws at.

## Context

**The owner's words:** *"it's rendering the normals for the faces orthogonal to the face: we
need to do normal blending at the vertices so the light blends better. Also, you can up the
polys for the rounded primitives. We're dealing with barely any pixels."*

**The cause is one line.** `client/src/ui/canvas/pose/poseMeshes.ts:422` sets
`flatShading: true` on the `MeshLambertMaterial` built at `:416`. With `flatShading` on,
three ignores per-vertex normals and uses the face normal, which is exactly the
"orthogonal to the face" look described. Turning it off makes three interpolate the
per-vertex normals across each triangle — which is the requested vertex blending.

The material comment at `:402-408` currently *argues for* flat shading ("each facet is one
tone — with the low-poly counts…"). **That reasoning is now superseded by the owner's
instruction. Rewrite the comment; do not leave it contradicting the code.**

**Current tesselation** (`poseMeshes.ts:73-84`):

| Constant | Value |
| --- | --- |
| `SPHERE_WIDTH_SEGMENTS` | 16 |
| `SPHERE_HEIGHT_SEGMENTS` | 12 |
| `CYLINDER_RADIAL_SEGMENTS` | 16 |
| `CYLINDER_HEIGHT_SEGMENTS` | 1 |

⚠️ **These are pinned by tests** in `__tests__/poseMeshes.test.ts` under
`describe("segment counts")`: `<= 24` for the three rounded counts, `>= 8/6/8`, and
`CYLINDER_HEIGHT_SEGMENTS === 1`. The `<= 24` bound has a comment arguing that more segments
are invisible after rasterising. **The owner has overruled that.** You must raise both the
constants and the test bound **deliberately, with the new reasoning written down** — never
by quietly deleting an assertion.

**Why more segments genuinely helps now:** with `flatShading` off, segment count controls how
smooth the *gradient* is, not just the silhouette. At 16×12 a sphere's terminator is visibly
banded. Cylinder height segments matter less for a Lambert term (the side is uniform along
its length) but a value of 1 prevents any vertical gradient at all if the light has a
vertical component — consider raising it modestly and say what you chose and why.

**Cost check:** these meshes are rendered once per frame into a tiny render target. Going
from 16×12 to e.g. 48×32 is a few thousand triangles — negligible next to the mannequin's
9,636. Do not treat this as a performance trade-off; it is not one at this scale.

**Boundary:** `poseMeshes.ts` is under `client/src/ui/` — it may import `three` (D15) but
**must not** import a store, the API, `services/`, MobX, or use `useContext`, type-only
imports included. `three` arrives as a **parameter** (`ThreeNamespace`), never a
module-level runtime import — keep it that way (D2).

## Steps

1. Read `poseMeshes.ts:60-100` (the constants and their comments) and `:395-430` (the
   material builder) before changing anything.
2. **Set `flatShading: false`** (or remove the property — say which you chose and why).
   Rewrite the surrounding comment so it explains the *current* choice: vertex-interpolated
   normals, requested by the owner 2026-09-03, for a smoother light falloff at low pixel
   counts.
3. **Raise the rounded-primitive segment counts.** Suggested starting point: sphere 48×32,
   cylinder radial 48. Choose your own values if you can justify them, but state the
   reasoning in a comment next to the constants — including that the previous "invisible
   after rasterising" argument applied to *flat* shading and no longer holds.
4. **Consider `CYLINDER_HEIGHT_SEGMENTS`.** If you raise it, say why; if you leave it at 1,
   say why (a Lambert term on a straight side genuinely may not need it). Either is
   acceptable — an unexplained choice is not.
5. **Verify three actually computes vertex normals** for these geometries. `SphereGeometry`
   and `CylinderGeometry` ship correct per-vertex normals, so no `computeVertexNormals()`
   call should be needed — **confirm that rather than assuming it**, and if you find a
   geometry that lacks them, call `computeVertexNormals()` and note it.
6. **Update `describe("segment counts")`** in the test file: raise the upper bound, keep a
   meaningful lower bound, and **rewrite the test names and comments** so they assert the new
   intent ("high enough for a smooth gradient", not "stays low-poly on purpose"). Keep an
   upper bound of some kind — an unbounded constant is how someone later ships 512 segments
   by accident.
7. Add a test asserting the material is **not** flat-shaded, so a future refactor cannot
   silently restore the facets. If the material builder needs `three` injected, follow the
   existing test's approach to faking the namespace; if the existing tests deliberately avoid
   constructing three objects (they do — see the pose-tool task 06 note), assert on the
   **constant/flag** rather than building a real material, and say so.
8. Commit.

## Constraints

- **Do not touch the mannequin loading path or `MANNEQUIN_REGIONS`.** Task 05 rewrites those.
  If your change to the material builder would affect the mannequin's material too, that is
  fine and expected — but do not edit the region data or `getFramingBounds`.
- **Do not change the normal-decode convention.** The project is **Y-DOWN**, three is
  **Y-UP**, so the stamp's decode negates Y; byte scales are 127 for x/y, 255 for z. That
  lives in `poseStamp.ts`, which you do not own. ⚠️ **Smoothing normals changes what the
  normal pass writes** (interpolated instead of faceted) — this is desirable and is the
  point, but **state it in your report** so the owner knows stamped normals will differ from
  what a pre-change stamp produced.
- Do not add a runtime module-level `import` of `three`.
- Do not touch `poseEngine.ts`, `poseCamera.ts` or `poseStamp.ts`.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
```

Root: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` → empty (sweep after
every `bunx`).

**Manual checks — you almost certainly cannot perform these; list them as owed:**

1. A sphere shades as a **smooth gradient**, not a ring of flat facets.
2. Its silhouette reads as round, not polygonal, on a small grid (32×32).
3. The cylinder's curved side shades smoothly around its circumference.
4. Dragging the light orb sweeps the gradient continuously with no visible banding.
5. A stamp taken after this change writes **smoothly varying** normals — open the lighting
   studio and confirm the stamped pixels shade like a curved surface, not a faceted one.

## Definition of done

- [ ] `flatShading` no longer produces faceted shading, and the comment explains the choice.
- [ ] Rounded-primitive segment counts raised, with the reasoning written next to them.
- [ ] `CYLINDER_HEIGHT_SEGMENTS` decision made and justified either way.
- [ ] Per-vertex normals confirmed present (or computed, and noted).
- [ ] `describe("segment counts")` updated with new bounds **and** rewritten intent.
- [ ] A test guards against flat shading being restored.
- [ ] Report states that stamped normals will now differ from pre-change stamps.
- [ ] Gate green, no lockfile.
