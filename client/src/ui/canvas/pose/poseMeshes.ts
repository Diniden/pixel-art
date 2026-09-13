/**
 * Pose tool — the reference-solid library and the mannequin part segmentation.
 *
 * Two halves, split along the line jsdom draws:
 *
 * - **Pure data and maths** — {@link MANNEQUIN_LANDMARKS},
 *   {@link classifyMannequinTriangle}, {@link selectPartTriangles},
 *   {@link UNIT_BOUNDS} — plain numbers, fully unit-tested in the node lane.
 * - **Geometry construction** — {@link buildMesh}, {@link loadMannequin},
 *   {@link buildPartGeometry} — needs three, and therefore cannot run where
 *   there is no WebGL (MASTER risk register). Kept deliberately THIN, with
 *   every decision that could be wrong pushed into the pure half above it.
 *
 * three is never imported at module level as a runtime value (MASTER D2): the
 * namespace arrives as a **parameter**, resolved once by `poseEngine.loadThree()`
 * and threaded through. The `import type` below is erased at build time and
 * pulls in nothing, so the lazy chunk split survives.
 *
 * ## Smoothly shaded, and tessellated enough to earn it
 *
 * ⚠️ **This file used to argue the opposite.** The original reasoning was that
 * a faceted low-poly solid reads as discrete planes and is therefore a *better*
 * pixel-art reference than a smooth gradient, so `flatShading` was on and the
 * segment counts were held down (sphere 16×12, cylinder 16 radial) on the
 * grounds that extra segments are invisible once rasterised.
 *
 * **The owner overruled that on 2026-09-03:** *"it's rendering the normals for
 * the faces orthogonal to the face: we need to do normal blending at the
 * vertices so the light blends better. Also, you can up the polys for the
 * rounded primitives. We're dealing with barely any pixels."*
 *
 * So the reference now shades from **interpolated per-vertex normals**
 * ({@link buildMaterial}) and carries enough geometry to make that
 * interpolation smooth ({@link SPHERE_WIDTH_SEGMENTS} and friends). The old
 * "invisible after rasterising" argument was an argument about *silhouettes*
 * under *flat* shading; with smooth shading the segment count also controls how
 * finely the light **gradient** is sampled, which survives rasterising even at
 * 32×32 because it lands in the pixel *values*, not the outline. Reading bands
 * off the render is the artist's job again, which is what was asked for.
 *
 * ## Normalised size, and origin-centred GEOMETRY
 *
 * Every primitive is built to fit the **unit bounding box centred on the
 * origin** — `[-0.5, 0.5]` on all three axes. So is each mannequin part, via
 * the same {@link normalizeToUnitBox}. `fitCameraToMesh` therefore has ONE job
 * instead of a special case per mesh, and a head arrives framed exactly like a
 * cube.
 *
 * ⚠️ **Size and origin are two different promises, and only one of them used
 * to be kept.** {@link normalizeToUnitBox} writes the object *transform*, so a
 * part looked centred while its **vertices** still carried the mannequin's
 * origin — the head's own geometry centre measured `y = 1.5666`. It therefore
 * rotated about the figure's pelvis rather than about itself. Plan 08 task 01
 * adds {@link centerGeometryOnOrigin}, which translates the **vertex
 * positions**, and {@link buildPartMesh} runs it before normalising.
 *
 * The invariant now is: **every object handed to the engine has its
 * bounding-box centre at `(0,0,0)` in its own geometry space.** The primitives
 * satisfy it by construction (three's `BoxGeometry`/`SphereGeometry`/
 * `CylinderGeometry` are origin-centred), a part satisfies it by the explicit
 * translation, and the full mannequin scene is the one documented exception —
 * see {@link normalizeToUnitBox}.
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/` (MASTER D15). `three` is
 * permitted here and is the only third-party dependency.
 */
import type { BufferGeometry, Material, Object3D } from "three";
import type {
  PoseColor,
  PoseMeshId,
  PosePartId,
  PoseVector,
} from "@/ui/canvas/pose/poseTypes";

/** The three module namespace, as `poseEngine.loadThree()` resolves it. */
export type ThreeNamespace = typeof import("three");

/** An axis-aligned box, structurally identical to `poseCamera`'s `PoseBounds`. */
export interface PoseMeshBounds {
  min: PoseVector;
  max: PoseVector;
}

/** The unit box every primitive is normalised into: `[-0.5, 0.5]` on each axis. */
export const UNIT_BOUNDS: PoseMeshBounds = {
  min: { x: -0.5, y: -0.5, z: -0.5 },
  max: { x: 0.5, y: 0.5, z: 0.5 },
};

/* ── segment counts, and why they are what they are ───────────────────────── */

/**
 * Sphere tessellation: 48 around, 32 top-to-bottom (was 16×12).
 *
 * Raised on the owner's instruction of 2026-09-03 (*"you can up the polys for
 * the rounded primitives. We're dealing with barely any pixels."*), together
 * with turning `flatShading` off in {@link buildMaterial}.
 *
 * **Why the old ceiling no longer applies.** The previous comment argued that
 * segments beyond ~16 are "invisible after rasterising". That was true of the
 * *silhouette* — and only under *flat* shading, where each facet is one flat
 * tone and the segment count is purely a silhouette knob. With smooth shading
 * the segment count is also the sampling rate of the light **gradient**: the
 * facet boundaries stop being invisible and start being visible *banding* in
 * the terminator, because a Lambert term interpolated across a 22.5°-wide
 * facet changes in visible steps. At 16×12 a sphere's terminator bands even at
 * 32×32; the banding lands in pixel *values*, which is exactly what does
 * survive rasterising.
 *
 * **Why 48×32 and not more.** 48 around is 7.5° per segment, below the point
 * where a Lambert falloff shows a seam, and 32 rows keeps the poles from
 * pinching into a visible star. It is 2,976 triangles (measured) — versus 352
 * before, and versus the mannequin's 9,636 — rendered once per frame into a
 * target that is at most a few thousand pixels. This is deliberately **not** a
 * performance trade-off at this scale, so the values are chosen for how the
 * gradient reads and nothing else.
 *
 * 48 and 32 are both multiples of 4, which keeps a seam on each cardinal axis
 * rather than a facet centred on it — the front-on view therefore shows a
 * vertex, not a flat plate aimed at the camera.
 *
 * An upper bound is still asserted in the tests. Smooth normals remove the
 * reason to stay low, not the reason to stay finite: nothing here would *look*
 * wrong at 512 segments, so only a test stops someone shipping it by accident.
 */
export const SPHERE_WIDTH_SEGMENTS = 48;
export const SPHERE_HEIGHT_SEGMENTS = 32;

/**
 * Cylinder tessellation: 48 radial segments, 1 along the height.
 *
 * 48 radial matches the sphere's 48 around, so the two still read as the same
 * "resolution" of solid side by side, and for the same reason: with smooth
 * shading, radial segments sample the gradient that wraps around the curved
 * side. 192 triangles (measured).
 *
 * **`CYLINDER_HEIGHT_SEGMENTS` stays 1 — measured, not assumed.** The task
 * asked whether a vertical light component needs vertical subdivision to
 * produce a vertical gradient. It does not, for two compounding reasons:
 *
 * 1. This cylinder is **straight** (both radii 0.5), so its side normal is
 *    purely radial — `(sinθ, slope=0, cosθ)` in three's `CylinderGeometry` —
 *    and therefore **independent of y**. Measured directly against three
 *    0.185.1: at 8 radial segments, height segments of 1, 2 and 4 all produce
 *    exactly **9 distinct side-normal directions**. Subdividing the height
 *    adds vertices (52 → 61 → 79) and **zero** new normal directions.
 * 2. Lambert is evaluated **per fragment** from the interpolated normal, and
 *    interpolating between two identical normals is that same normal. So the
 *    side is uniform along its length no matter what the light does, and no
 *    number of height segments changes that.
 *
 * A vertical gradient on a straight tube's side would require a normal that
 * varies with y, which only a taper or a bend produces. Raising this constant
 * would cost vertices and buy nothing observable — so it stays 1, and the test
 * pins it at 1 with this measurement as the reason.
 */
export const CYLINDER_RADIAL_SEGMENTS = 48;
export const CYLINDER_HEIGHT_SEGMENTS = 1;

/**
 * Whether {@link buildMaterial} flat-shades. **Always `false`** — see that
 * function's comment for the owner decision behind it (2026-09-03).
 *
 * Exported as a named constant purely so it can be *tested*. jsdom has no
 * WebGL and this suite deliberately constructs no three objects, so a guard
 * test cannot build a material and read `material.flatShading` back off it.
 * Asserting the constant is the next best thing: it cannot catch someone
 * hardcoding `flatShading: true` in the constructor call, but it does make the
 * intended value a stated, single-sourced fact that a reviewer of any future
 * diff has to consciously change.
 *
 * ⚠️ Do not "simplify" this by inlining it — a bare `false` literal in the
 * material constructor is exactly the thing a refactor flips back without
 * anyone noticing, which is the regression this constant exists to make loud.
 */
export const POSE_MATERIAL_FLAT_SHADING = false;

/* ── the mannequin part segmentation (MASTER E1/E2) ───────────────────────── */

/**
 * The anatomical landmarks the part segmentation cuts on, as **fractions of
 * the mannequin's own bounding box**: `0` is min on that axis, `1` is max.
 *
 * ⚠️ **These are fractions, not model units.** The raw glTF is authored in its
 * own scale — measured bounds x `[-0.7597, 0.7597]`, y `[-0.0039, 1.7083]`,
 * z `[-0.0686, 0.1609]`, i.e. a span of `1.5193 × 1.7122 × 0.2296`. Comparing
 * a fraction against a raw coordinate is the single easiest way to produce a
 * part that is either empty or the whole body, so the conversion happens in
 * exactly one place — {@link normalizeTriangleCentroid} — and every threshold
 * below is consumed only after it.
 *
 * ✅ **MEASURED against the real asset, twice.** These are pose-tool task 09's
 * landmarks, re-derived from the vertex buffer on 2026-09-03 for this task and
 * found to agree. `AX` below means `|x - 0.5|`: the *normalised* distance from
 * the figure's centreline, so `0` is the spine and `0.5` is a fingertip.
 *
 * ## Why this asset needs landmarks at all
 *
 * The mesh is a **T-POSE** (aspect 0.887 — arms-down would be ≈0.3) with only
 * two nodes, `mannequin_joints` (1,544 tris) and `mannequin_body` (8,092 tris),
 * **both of which span the entire figure**. There is no skeleton, no per-limb
 * node and no named sub-object, so a part can only be cut out spatially.
 *
 * ⚠️ **Task 09's first estimates put Arm and Hand over empty space**, because
 * they assumed a relaxed figure with the arms hanging at the sides. On a
 * T-pose the arms are a horizontal bar at shoulder height and the maximum
 * `|x|` occurs *there*, not at the hips. That bug is why every part is
 * asserted non-empty in the tests, with the real triangle counts pinned.
 */
export const MANNEQUIN_LANDMARKS = {
  /**
   * **Neck pinch — head starts here.** `y = 0.838`.
   *
   * Measured: `AX` collapses across this line. Immediately below it the body
   * still reaches `AX 0.083` (y 0.82–0.83) and `0.062` (0.83–0.84); above it
   * nothing exceeds `AX 0.048` all the way to the crown. That collapse is the
   * neck, and it is the sharpest horizontal feature on the figure.
   */
  neckY: 0.838,

  /**
   * **Crotch split — legs start below here.** `y = 0.472`.
   *
   * Measured by the widening gap around the centreline: scanning the largest
   * x-gap per y-band gives 0.011 at y 0.47–0.50 (one solid pelvis), 0.042 at
   * 0.45–0.47, 0.059 at 0.30–0.40 and 0.148 below y 0.10 — two disjoint
   * clusters that get further apart the lower you go. 0.472 is where the
   * single column becomes two.
   */
  crotchY: 0.472,

  /**
   * **Shoulder — arm starts outboard of here.** `AX = 0.105`.
   *
   * Measured: the torso column's own half-width. Outside the arm band the mesh
   * never exceeds `AX 0.128` (the feet, which splay), and within the shoulder
   * band the triangle count per `AX` bin drops to a thin, even trickle beyond
   * 0.105 — that trickle is the arm tube. Below this the triangle is torso.
   */
  shoulderAX: 0.105,

  /**
   * **Wrist — hand starts outboard of here.** `AX = 0.395`.
   *
   * Measured from where the arm bar *stops being a tube and becomes a hand*,
   * on two independent signals that agree:
   *
   * - **The bar thins.** Its y-span per `AX` bin runs ≈0.042 from the shoulder
   *   out to `AX 0.32`, then tapers: 0.029 (0.34–0.36), 0.023 (0.36–0.38),
   *   0.018 (0.38–0.40) and stays ≈0.012–0.018 to the fingertips.
   * - **The mesh densifies and spreads in z.** Triangles per bin go 36 → 64 →
   *   152 → 254 → 344 → 1,010 → 1,398 across `AX 0.34…0.48`, and the z-span
   *   jumps from 0.21 to 0.44 at `AX 0.40` — fingers, which spread front-to-back
   *   as an arm tube does not.
   *
   * 0.395 sits in the middle of that transition. It is by far the largest part
   * by triangle count (3,980 of 9,636) because the hands carry the asset's
   * finest detail.
   */
  wristAX: 0.395,

  /**
   * **The arm bar's vertical extent** — `y ∈ [0.740, 0.840]`.
   *
   * ⚠️ **Load-bearing, not decorative.** `AX >= shoulderAX` on its own also
   * catches the **feet**, which splay outward to `AX 0.128` at y ≈ 0. Without
   * this band the "arm" part quietly acquires two feet and the "leg" part
   * loses them — measured: leg 876 tris and arm 1,538 without the band,
   * versus leg 1,346 and arm 1,062 with it.
   *
   * Measured extent of the bar itself: `AX > 0.25` occurs **only** in
   * y 0.764–0.811, and the shoulder's own attachment reaches y 0.761–0.815.
   * The band is padded to 0.740–0.840 so the whole shoulder joint travels with
   * the arm rather than being sliced off at the socket.
   */
  armYMin: 0.74,
  armYMax: 0.84,
} as const;

/** The part ids in the order the rail should render them. */
export const MANNEQUIN_PART_ORDER: readonly PosePartId[] = [
  "head",
  "torso",
  "arm",
  "leg",
  "hand",
];

/** Every mesh the rail can load, in rail order. `"mannequin"` is **Full**. */
export const POSE_MESH_ORDER: readonly PoseMeshId[] = [
  "cube",
  "sphere",
  "cylinder",
  "mannequin",
  ...MANNEQUIN_PART_ORDER,
];

/** Type guard: is `id` one of the five mannequin parts? */
export function isPosePartId(id: PoseMeshId): id is PosePartId {
  return (MANNEQUIN_PART_ORDER as readonly string[]).includes(id);
}

/**
 * A triangle's centroid expressed as a fraction of `bounds` on each axis.
 *
 * ⚠️ **This is the ONE place raw model units become normalised fractions**, and
 * it is deliberately not inlined: the landmark table above is in fractions and
 * the glTF is in model units, so anywhere those two meet without this call is
 * a bug that presents as an empty part or as the whole body (MASTER §9).
 *
 * A zero-extent axis yields `0.5` for that axis rather than `NaN` or
 * `Infinity`. A flat mesh has no meaningful fraction along its flat axis, and
 * a `NaN` centroid would silently fail every comparison and drop the triangle
 * out of *every* part — turning a degenerate asset into a blank screen instead
 * of a squashed one.
 */
export function normalizeTriangleCentroid(
  centroid: PoseVector,
  bounds: PoseMeshBounds,
): PoseVector {
  const frac = (v: number, min: number, max: number): number => {
    const span = max - min;
    if (!Number.isFinite(span) || span <= 0) return 0.5;
    return (v - min) / span;
  };
  return {
    x: frac(centroid.x, bounds.min.x, bounds.max.x),
    y: frac(centroid.y, bounds.min.y, bounds.max.y),
    z: frac(centroid.z, bounds.min.z, bounds.max.z),
  };
}

/**
 * Which part a triangle belongs to, from its centroid and the mesh's bounds.
 *
 * ## The segmentation rule: **by triangle, by centroid, exactly once**
 *
 * ⚠️ **Segmentation is per TRIANGLE, never per vertex.** Selecting vertices
 * and keeping the indices that survive leaves dangling indices and tears holes
 * along every seam, because a triangle whose three corners land in three
 * different parts belongs to none of them. Here the *triangle* is the atom:
 * its three positions are averaged into a centroid, the centroid is normalised
 * once by {@link normalizeTriangleCentroid}, and the resulting fraction is
 * tested against {@link MANNEQUIN_LANDMARKS}.
 *
 * ## Straddling triangles
 *
 * **A triangle that crosses a boundary goes wholly to the part its centroid
 * falls in, and is never duplicated or dropped.** The consequences are worth
 * stating plainly, because they are the design and not an oversight:
 *
 * - Each part's cut edge is **ragged by up to one triangle**, following the
 *   tessellation rather than the mathematical plane. At this asset's density
 *   that is well under a pixel once rasterised to a 32×32 target, and the
 *   alternative — clipping each triangle against the plane — would generate
 *   new vertices whose normals must be interpolated, for a seam nobody sees.
 * - Each part is therefore **open at the cut**: a head has no cap where the
 *   neck was. `buildMaterial` already renders `DoubleSide`, so the interior
 *   reads as surface rather than as a hole.
 * - The parts form an **exact partition**: every one of the 9,636 triangles
 *   lands in exactly one part, so they are disjoint and their union is the
 *   whole mannequin. That is a much stronger property than "roughly right",
 *   and the tests assert both halves of it.
 *
 * ## Order of tests, and why arm/hand are checked first
 *
 * The arm band is tested **before** the head/leg split so that the outstretched
 * limb is claimed by `arm`/`hand` rather than by whatever vertical slice it
 * happens to sit in. On this T-pose the arm bar (y 0.74–0.84) straddles the
 * neck line (0.838), so testing `head` first would hand the outer shoulders to
 * the head. Everything not claimed is `torso`, which makes `torso` the
 * remainder and guarantees the partition is total by construction.
 *
 * ## No left/right variants (E1)
 *
 * `AX` is `|x - 0.5|`, so both arms and both hands are one part, as are both
 * legs. The asset is a symmetric T-pose; two mirror images of the same tube
 * are not two references.
 */
export function classifyMannequinTriangle(
  centroid: PoseVector,
  bounds: PoseMeshBounds,
): PosePartId {
  const n = normalizeTriangleCentroid(centroid, bounds);
  const ax = Math.abs(n.x - 0.5);
  const L = MANNEQUIN_LANDMARKS;

  const inArmBar = n.y >= L.armYMin && n.y <= L.armYMax;
  if (inArmBar && ax >= L.wristAX) return "hand";
  if (inArmBar && ax >= L.shoulderAX) return "arm";
  if (n.y >= L.neckY) return "head";
  if (n.y < L.crotchY) return "leg";
  return "torso";
}

/**
 * Indices of the triangles belonging to `part`, as offsets into `triangles`.
 *
 * Returns triangle indices — `0` is the first triangle, not the first vertex —
 * so a caller multiplies by 3 to reach the index buffer. Pure: no three, no
 * allocation beyond the result, deterministic for a given input.
 */
export function selectPartTriangles(
  part: PosePartId,
  triangles: readonly PoseVector[],
  bounds: PoseMeshBounds,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < triangles.length; i++) {
    if (classifyMannequinTriangle(triangles[i], bounds) === part) out.push(i);
  }
  return out;
}

/** The average of three positions — a triangle's centroid. */
export function triangleCentroid(
  a: PoseVector,
  b: PoseVector,
  c: PoseVector,
): PoseVector {
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
}

/* ── the mannequin loading path (asset vendored by task 09) ──────────────── */

/**
 * The vendored CC0 mannequin (MASTER D3), served statically by Vite from
 * `client/public/models/mannequin.gltf`.
 *
 * ✅ **The asset is present** as of task 09 (2026-09-03): "Prototyping
 * Mannequin" by burning_barb, CC0 1.0 Universal, 380,956 bytes, 9,636 tris,
 * unrigged, self-contained (its buffer is an embedded data URI, so there are
 * no `.bin` or texture sidecars to 404).
 *
 * Provenance, checksums and the licence re-verification are recorded in
 * `client/public/models/LICENSE.md`. {@link loadMannequin} still rejects
 * cleanly if the file is removed.
 */
export const MANNEQUIN_URL = "/models/mannequin.gltf";

/**
 * Thrown when the mannequin cannot be loaded — the asset file missing or
 * unreadable, or the loader itself failing to import.
 *
 * A distinct class rather than a bare `Error` so the caller can tell "the
 * asset is missing, fall back to a primitive and grey the button out" apart
 * from a genuine bug in the loader.
 */
export class MannequinUnavailableError extends Error {
  /**
   * The underlying failure, if there was one.
   *
   * ⚠️ Declared as an own field and assigned by hand rather than passed to
   * `super(message, { cause })`. The project targets **ES2020**
   * (`tsconfig.json:3`), whose `Error` type takes no options argument — the
   * two-argument form is a `tsc` error here even though every runtime the app
   * ships to supports it. Assigning the property keeps the same observable
   * shape without touching the compiler target, which is not this task's file.
   */
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MannequinUnavailableError";
    this.cause = options?.cause;
  }
}

/**
 * Load the mannequin asset, or reject with {@link MannequinUnavailableError}.
 *
 * ⚠️ **Every failure is a runtime condition, never a compile error.** The
 * asset is vendored (task 09) but a deployment could still be missing it, so
 * the primitives must keep working when this rejects — the caller falls back
 * rather than the tool breaking.
 *
 * `GLTFLoader` lives in `three/examples/jsm/`, which is a separate entry point
 * from the main `three` namespace, so it gets its own dynamic import. That is
 * a second lazy chunk and is fine — it is only ever fetched when someone
 * actually clicks Mannequin.
 *
 * Failure modes all funnel into the same rejection: the loader module missing,
 * the file 404ing, the file being malformed, or the parsed scene being empty.
 * None of them should crash the tool; the caller falls back to a primitive.
 *
 * ⚠️ **`normalize` must be `false` when a part is about to be cut out of the
 * result.** {@link normalizeToUnitBox} writes a scale and a position onto the
 * scene's *transform*, leaving the vertex buffers in the asset's own units, so
 * a part cut afterwards would be measured in raw units and then re-normalised
 * a second time by its own fit. Segmenting the raw scene and normalising only
 * the finished part keeps exactly one normalisation on the path.
 * {@link buildPartMesh} passes `false`; everything else takes the default.
 */
export async function loadMannequin(
  three: ThreeNamespace,
  url: string = MANNEQUIN_URL,
  normalize = true,
): Promise<Object3D> {
  let LoaderCtor: new () => {
    loadAsync(url: string): Promise<{ scene?: Object3D }>;
  };

  try {
    const mod = await import("three/examples/jsm/loaders/GLTFLoader.js");
    LoaderCtor = mod.GLTFLoader as unknown as typeof LoaderCtor;
  } catch (cause) {
    throw new MannequinUnavailableError(
      "three's GLTFLoader could not be loaded",
      { cause },
    );
  }

  let scene: Object3D | undefined;
  try {
    const gltf = await new LoaderCtor().loadAsync(url);
    scene = gltf.scene;
  } catch (cause) {
    throw new MannequinUnavailableError(
      `the mannequin asset at ${url} could not be loaded`,
      { cause },
    );
  }

  if (!scene) {
    throw new MannequinUnavailableError(
      `the mannequin asset at ${url} parsed to an empty scene`,
    );
  }

  if (normalize) {
    // Plan 08 F2 / open question 3: the whole figure gets an origin-centred
    // GEOMETRY too, not just each part. Vertices first, then scale — the same
    // order `buildPartMesh` uses, for the same reason.
    centerSceneGeometryOnOrigin(three, scene);
    normalizeToUnitBox(three, scene);
  }
  return scene;
}

/* ── part construction (E1) ───────────────────────────────────────────────── */

/**
 * Cut `part` out of an already-loaded mannequin scene, as its own mesh.
 *
 * The thin construction half of the segmentation: every decision lives in
 * {@link classifyMannequinTriangle} above, and this walks the scene applying
 * it. jsdom has no WebGL, so what is testable is the pure classifier — this is
 * kept as close to mechanical as it can be.
 *
 * ## What it does, in order
 *
 * 1. **Measure the whole figure's bounds** from `scene`, in the asset's own
 *    units. This is the box the normalised landmark fractions are relative to,
 *    so it must be the box of the *whole* mannequin, never of one part.
 * 2. **Walk every mesh under the scene**, and for each triangle compute its
 *    world-space centroid and classify it. Positions are transformed by the
 *    node's world matrix first, so a scene with nested transforms segments in
 *    the same space its bounds were measured in.
 * 3. **Emit the kept triangles as a new non-indexed `BufferGeometry`.** Going
 *    non-indexed is what makes the extraction total: an indexed part would have
 *    to renumber every index and prune the unreferenced vertices, and a
 *    mistake there is exactly the "dangling index" hole this task exists to
 *    avoid. The cost is duplicated shared vertices in a part of at most a few
 *    thousand triangles, which is nothing at this scale.
 * 4. **Copy the source normals across** rather than recomputing them — see
 *    below.
 * 5. **Centre the finished geometry on its own origin** with
 *    {@link centerGeometryOnOrigin}, then **normalise the mesh into the unit
 *    box** with the same {@link normalizeToUnitBox} every primitive uses, so a
 *    head arrives centred and auto-fitted exactly like a cube. ⚠️ Steps 5a and
 *    5b are not interchangeable and 5a is not optional — see
 *    {@link buildPartMesh}.
 *
 * ⚠️ **This function returns the part in the MANNEQUIN's space**, deliberately:
 * its bounding box is where the part sits on the figure, which is what makes
 * the segmentation debuggable and what the anatomical tests assert against.
 * The origin move happens one level up in {@link buildPartMesh}, on the path
 * that actually reaches the engine.
 *
 * ## ⚠️ Smooth normals are PRESERVED, not recomputed
 *
 * The source `NORMAL` attribute is copied through triangle by triangle. That
 * is deliberate and is the point of the change: plan 07 task 02 turned
 * `flatShading` off so three interpolates per-vertex normals, and the glTF
 * already carries smooth authored normals. Copying them keeps a part shading
 * exactly as the whole figure did.
 *
 * `computeVertexNormals()` is called **only as a fallback**, when a source
 * primitive has no `normal` attribute at all — without it such a part would
 * render black. It is not the normal path, because on a non-indexed geometry
 * `computeVertexNormals()` assigns each vertex its own *face* normal: it would
 * silently reintroduce exactly the flat faceting task 02 removed. The fallback
 * therefore takes the flat result only where the alternative is no shading at
 * all.
 */
export function buildPartGeometry(
  three: ThreeNamespace,
  scene: Object3D,
  part: PosePartId,
): BufferGeometry {
  const box = new three.Box3().setFromObject(scene);
  const bounds: PoseMeshBounds = {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };

  const positions: number[] = [];
  const normals: number[] = [];
  let sawNormals = true;

  scene.updateWorldMatrix(true, true);
  const v = new three.Vector3();
  const n = new three.Vector3();
  const normalMatrix = new three.Matrix3();

  scene.traverse((node) => {
    const mesh = node as Object3D & { isMesh?: boolean; geometry?: BufferGeometry };
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const normal = geometry.getAttribute("normal");
    if (!normal) sawNormals = false;

    const index = geometry.getIndex();
    const triangleCount = index ? index.count / 3 : position.count / 3;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    // Three vertex slots reused per triangle, so the hot loop allocates nothing.
    const px = [0, 0, 0];
    const py = [0, 0, 0];
    const pz = [0, 0, 0];
    const nx = [0, 0, 0];
    const ny = [0, 0, 0];
    const nz = [0, 0, 0];

    for (let t = 0; t < triangleCount; t++) {
      for (let c = 0; c < 3; c++) {
        const vi = index ? index.getX(t * 3 + c) : t * 3 + c;
        v.fromBufferAttribute(position, vi).applyMatrix4(mesh.matrixWorld);
        px[c] = v.x;
        py[c] = v.y;
        pz[c] = v.z;
        if (normal) {
          n.fromBufferAttribute(normal, vi).applyMatrix3(normalMatrix).normalize();
          nx[c] = n.x;
          ny[c] = n.y;
          nz[c] = n.z;
        }
      }

      const centroid = triangleCentroid(
        { x: px[0], y: py[0], z: pz[0] },
        { x: px[1], y: py[1], z: pz[1] },
        { x: px[2], y: py[2], z: pz[2] },
      );
      if (classifyMannequinTriangle(centroid, bounds) !== part) continue;

      for (let c = 0; c < 3; c++) {
        positions.push(px[c], py[c], pz[c]);
        if (normal) normals.push(nx[c], ny[c], nz[c]);
      }
    }
  });

  const geometry = new three.BufferGeometry();
  geometry.setAttribute(
    "position",
    new three.Float32BufferAttribute(positions, 3),
  );
  if (sawNormals && normals.length === positions.length) {
    geometry.setAttribute("normal", new three.Float32BufferAttribute(normals, 3));
  } else {
    // Fallback only — see the header. Flat, but visible.
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Load the mannequin and return `part` alone, in `color`, in the unit box.
 *
 * Inherits {@link loadMannequin}'s rejection — the asset can be missing at
 * runtime — and additionally rejects with {@link MannequinUnavailableError} if
 * the segmentation yields **no triangles at all**.
 *
 * ⚠️ **That empty check is the guard for this task's headline failure mode.**
 * Pose-tool task 09 shipped landmark estimates that put Arm and Hand over
 * empty space, because they assumed a figure with its arms at its sides rather
 * than this asset's T-pose. An empty part renders as a blank canvas with no
 * error anywhere, which reads as "the tool is broken" rather than as "the
 * numbers are wrong". Rejecting turns a silent blank into the same
 * asset-unavailable path the missing-file case already takes, where the caller
 * falls back rather than showing nothing. The *real* defence is the test suite,
 * which pins every part's triangle count against the vendored asset — this is
 * the belt to that suite's braces.
 */
export async function buildPartMesh(
  three: ThreeNamespace,
  part: PosePartId,
  color: PoseColor,
  url: string = MANNEQUIN_URL,
): Promise<Object3D> {
  const scene = await loadMannequin(three, url, false);
  const geometry = buildPartGeometry(three, scene, part);

  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) {
    geometry.dispose();
    throw new MannequinUnavailableError(
      `the mannequin part "${part}" segmented to zero triangles`,
    );
  }

  // ⚠️ ORDER MATTERS, and this is the fix for plan 08 item 2/7 (F2).
  //
  // The part is cut out of the mannequin in the mannequin's own space, so its
  // vertices carry the figure's origin with them — measured, the head's box
  // centre sat at y = 1.5666, the height of a head on a standing figure.
  // Centring the GEOMETRY here, before the mesh is normalised, is what makes
  // the part rotate about itself instead of orbiting the mannequin's pelvis.
  // Doing it by transform instead (`mesh.position.set(...)`) reproduces exactly
  // the bug: `rotation` is applied before `position`, so the offset becomes an
  // orbit radius.
  centerGeometryOnOrigin(three, geometry);

  const mesh = new three.Mesh(geometry, buildMaterial(three, color));
  // Scale only, now: the centre subtraction below is a no-op because the
  // geometry above is already origin-centred. Pinned by test rather than
  // assumed — see `describe("buildPartMesh")`.
  normalizeToUnitBox(three, mesh);
  return mesh;
}

/* ── primitive construction ───────────────────────────────────────────────── */

/**
 * Build the reference solid for `id`, in `color`.
 *
 * Three routes, one contract:
 *
 * - the three **primitives** are constructed synchronously and always resolve;
 * - `"mannequin"` — the rail's **Full** — delegates to {@link loadMannequin};
 * - a **part id** delegates to {@link buildPartMesh}, which loads the same
 *   asset and cuts the part out of it (E1).
 *
 * Both mannequin routes therefore inherit {@link MannequinUnavailableError}
 * and the caller must fall back rather than break.
 *
 * Every result is already normalised to {@link UNIT_BOUNDS} — a part just as
 * much as a cube — so the caller hands it straight to `fitCameraToMesh` with
 * `UNIT_BOUNDS` as the bounds, with no per-part special case anywhere. That
 * uniformity is what replaced the framing feature (E2): a part is centred and
 * fitted because it *is* the whole scene, not because a camera was aimed at a
 * slice of a larger one.
 *
 * ⚠️ The caller takes ownership of the returned object's GPU resources.
 * `PoseEngine.setObject3D()` disposes whatever it replaces, so routing every
 * mesh through the engine is what keeps contexts from leaking (MASTER risk
 * register).
 */
export async function buildMesh(
  three: ThreeNamespace,
  id: PoseMeshId,
  color: PoseColor,
): Promise<Object3D> {
  if (id === "mannequin") {
    const object = await loadMannequin(three, MANNEQUIN_URL);
    applyMaterial(three, object, color);
    return object;
  }
  if (isPosePartId(id)) return buildPartMesh(three, id, color);
  return new three.Mesh(buildGeometry(three, id), buildMaterial(three, color));
}

/** The ids {@link buildGeometry} can construct: the primitives, and only those. */
export type PosePrimitiveId = Exclude<PoseMeshId, "mannequin" | PosePartId>;

/**
 * The geometry for one primitive, sized into the unit box.
 *
 * `BoxGeometry(1,1,1)`, `SphereGeometry(0.5)` and `CylinderGeometry(0.5, 0.5,
 * 1)` are each already centred on the origin and exactly 1 unit across their
 * widest axis, so no rescale is needed — the constructor arguments ARE the
 * normalisation, which is why they are written as literals rather than derived
 * from a bounding-box pass.
 *
 * ⚠️ Every mannequin id is excluded from the parameter type, parts included:
 * they come from the asset and cannot be constructed. `tsc` therefore rejects
 * `buildGeometry(three, "head")` at the call site rather than falling out of
 * the switch as `undefined`.
 */
export function buildGeometry(
  three: ThreeNamespace,
  id: PosePrimitiveId,
): BufferGeometry {
  switch (id) {
    case "cube":
      return new three.BoxGeometry(1, 1, 1);
    case "sphere":
      return new three.SphereGeometry(
        0.5,
        SPHERE_WIDTH_SEGMENTS,
        SPHERE_HEIGHT_SEGMENTS,
      );
    case "cylinder":
      return new three.CylinderGeometry(
        0.5,
        0.5,
        1,
        CYLINDER_RADIAL_SEGMENTS,
        CYLINDER_HEIGHT_SEGMENTS,
      );
  }
}

/**
 * A smoothly shaded, readable material in `color`.
 *
 * `MeshLambertMaterial`, not a PBR one: this is pose *reference*, and what
 * helps is a clean diffuse falloff whose bands you can read off and copy.
 * Roughness, metalness and specular highlights would add exactly the kind of
 * detail that does not survive being rasterised to a handful of texels, at the
 * cost of a shader that is harder to reason about.
 *
 * ## `flatShading: false` — the shading decision (owner, 2026-09-03)
 *
 * ⚠️ **This used to be `true`, and the comment used to argue for it** ("each
 * facet is one tone… which is the form pixel art actually wants"). The owner
 * overruled that: *"it's rendering the normals for the faces orthogonal to the
 * face: we need to do normal blending at the vertices so the light blends
 * better."*
 *
 * With `flatShading: true` three discards the geometry's per-vertex normals and
 * derives a single face normal per triangle in the fragment shader — the
 * "orthogonal to the face" look. With it **off**, three interpolates the
 * per-vertex normals across each triangle, and the Lambert term is evaluated
 * per fragment from that blended normal. That interpolation *is* the requested
 * vertex normal blending; there is no separate switch for it.
 *
 * **The flag is written explicitly as `false` rather than omitted.** `false` is
 * already three's default (verified against three 0.185.1), so omitting it
 * would behave identically — but this is a line someone has now flipped once
 * in each direction, and a stated `false` next to this comment is a much
 * clearer "we chose this" than an absence. It also gives the guard test in
 * `__tests__/poseMeshes.test.ts` something unambiguous to assert.
 *
 * **No `computeVertexNormals()` is needed anywhere.** Verified against three
 * 0.185.1 rather than assumed: `SphereGeometry` writes an analytic
 * `normal` attribute (`normal.copy(vertex).normalize()`) and `CylinderGeometry`
 * writes `(sinθ, slope, cosθ).normalize()` for the side and `(0, ±1, 0)` for
 * the caps. Measured on the shipped tessellation: the sphere has 1,521
 * distinct unit normals across 1,617 vertices and the three corners of a given
 * triangle carry *different* normals, which is what makes the interpolation
 * meaningful. Calling `computeVertexNormals()` would only *degrade* these — it
 * area-averages adjacent faces and would round off the cylinder's cap rims.
 *
 * **The cube is unaffected, and that is by design.** `BoxGeometry` does not
 * share vertices between faces: it emits 24 vertices with 6 distinct normals,
 * so all three corners of each triangle already carry the same face normal.
 * Smooth shading of an already-hard normal set is still hard, so the cube's
 * edges stay crisp with no special case here.
 */
export function buildMaterial(
  three: ThreeNamespace,
  color: PoseColor,
): Material {
  return new three.MeshLambertMaterial({
    color: new three.Color(
      clamp01(color.r / 255),
      clamp01(color.g / 255),
      clamp01(color.b / 255),
    ),
    flatShading: POSE_MATERIAL_FLAT_SHADING,
    // Both sides: a low-poly mesh viewed from inside (or a mannequin with
    // single-sided sleeves) should not show holes in a reference render.
    side: three.DoubleSide,
  });
}

/**
 * Replace every material under `object` with a flat one in `color`.
 *
 * Used for the mannequin, whose glTF materials are whatever the artist
 * authored (2 slots, D3) — for pose reference we want the user's chosen model
 * colour, uniformly. The outgoing materials are disposed here rather than left
 * to the engine, because the engine only disposes objects it is *replacing*
 * and these are being swapped out of an object it is about to be handed.
 */
export function applyMaterial(
  three: ThreeNamespace,
  object: Object3D,
  color: PoseColor,
): void {
  object.traverse((node) => {
    const holder = node as Object3D & {
      material?: { dispose?: () => void } | { dispose?: () => void }[];
      isMesh?: boolean;
    };
    if (!holder.material) return;
    const outgoing = holder.material;
    if (Array.isArray(outgoing)) {
      for (const m of outgoing) m?.dispose?.();
    } else {
      outgoing.dispose?.();
    }
    holder.material = buildMaterial(three, color) as unknown as {
      dispose?: () => void;
    };
  });
}

/**
 * Translate `geometry`'s **vertices** so its bounding-box centre is the origin.
 *
 * ## ⚠️ Why this exists — the bug it fixes (plan 08, F2)
 *
 * {@link normalizeToUnitBox} writes the **object transform**
 * (`object.scale` / `object.position`). That makes a part *look* centred on
 * screen while its **geometry origin is still the mannequin's origin**:
 * measured 2026-09-03 on the vendored asset, the head's own geometry centre
 * sat at `y = 1.5666` in model space — the height of a head on a standing
 * figure, not the centre of a head. Consequences:
 *
 * - `root.rotation.set(...)` spins the part about the **mannequin's** pelvis,
 *   not about the part, so the head swings off-screen instead of turning; and
 * - anything reading vertex positions (a stamp, a fit, a future exporter) sees
 *   model-space coordinates rather than part-space ones.
 *
 * A transform cannot fix either: `Object3D.rotation` is applied **before**
 * `position` in the local matrix, so an offset written into `position` rotates
 * *with* the mesh and becomes an orbit radius. The vertices themselves have to
 * move. The owner's instruction was unqualified — *"Make sure all models loaded
 * and utilized ALL have their origin set to the middle of the bounding volume
 * of the model"*.
 *
 * ## What it touches, and what it deliberately does not
 *
 * - **`position` only**, written by hand through the attribute's `setXYZ`.
 *
 * - ⚠️ **`BufferGeometry.translate()` IS NOT USED, and must not be
 *   reintroduced.** It looks like the obvious tool and it is the wrong one.
 *   **Measured 2026-09-03** against three 0.185.1: `translate()` delegates to
 *   `applyMatrix4()`, which does *not* stop at `position` — it also takes the
 *   normal matrix of the translation and calls `normal.applyNormalMatrix()`,
 *   whose final step is `.normalize()` on **every normal in the buffer**.
 *
 *   For a pure translation the normal matrix is the identity, so no normal
 *   changes *direction*. But the asset's authored normals are not exactly unit
 *   length, so re-normalising rewrites them: a hand-built `(0.1, 0.2, 0.3)`
 *   came back as `(0.267, 0.535, 0.802)`, and the real torso's normals moved
 *   in their last float digits (`0.4748470187` → `0.4748469889`). That is a
 *   silent mutation of the exact data plan 07 task 05 went out of its way to
 *   **copy** rather than recompute — the same class of regression as calling
 *   `computeVertexNormals()`, arriving through a function whose name promises
 *   it only moves vertices.
 *
 *   Writing `position` directly is therefore not a micro-optimisation; it is
 *   the only way to keep the "normals are untouched" promise. The tests assert
 *   the normal attribute is the **same object** and **byte-identical**, so a
 *   future edit back to `translate()` fails loudly.
 * - **Bounds are recomputed whenever vertices move**, never left stale:
 *   {@link buildPartGeometry} promises its caller a computed box, and three's
 *   culling and raycasting read the sphere. Recomputing costs one pass over an
 *   array that was just written and removes a whole class of "the bounds say
 *   one thing and the vertices another" bug. When nothing moves — the
 *   already-centred case — the caches are correct as they stand and are left
 *   alone.
 *
 * A geometry with no `position` attribute, or one whose box centre is not
 * usable, is left **exactly** as it was — see {@link usableCentre} for which
 * cases those are and why bailing is the right answer for each. A *single*
 * vertex is not one of them: its box centre is the vertex itself, so it
 * translates to the origin like anything else.
 *
 * Pure, exported and exhaustively tested — it is array maths with no WebGL in
 * it, so the node lane can prove it rather than owing it as a manual check.
 */
export function centerGeometryOnOrigin(
  three: ThreeNamespace,
  geometry: BufferGeometry,
): void {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return;

  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;
  const centre = usableCentre(geometry.boundingBox.getCenter(new three.Vector3()));
  // A zero centre skips the write entirely, which is what makes the helper
  // idempotent on the exact float values rather than merely "close enough".
  if (!centre) return;

  translatePositions(geometry, -centre.x, -centre.y, -centre.z);
}

/**
 * `centre` if it is finite and not already the origin, otherwise `null`.
 *
 * The shared bail for both centring helpers, and the reason each one is a
 * no-op rather than a hazard on its degenerate inputs:
 *
 * - **Non-finite** — `x - NaN` is `NaN`, so subtracting a poisoned centre
 *   turns the *whole* buffer into `NaN` and blanks the render with no error
 *   anywhere. Leaving the damage where it already was is strictly better.
 * - **Already the origin** — writing `x + 0` back over every vertex would be a
 *   float round-trip per call, so a helper run repeatedly (a future re-fit,
 *   say) could walk a mesh off the origin one epsilon at a time.
 */
function usableCentre<T extends { x: number; y: number; z: number }>(
  centre: T,
): T | null {
  const { x, y, z } = centre;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return x === 0 && y === 0 && z === 0 ? null : centre;
}

/**
 * Add `(dx, dy, dz)` to every vertex of `geometry`'s `position` attribute, and
 * refresh its cached bounds.
 *
 * ⚠️ **The whole point is what it does NOT touch.** See
 * {@link centerGeometryOnOrigin} for the measurement: three's own
 * `BufferGeometry.translate()` re-normalises the `normal` attribute as a side
 * effect, which silently rewrites the smooth authored normals a part is
 * careful to copy. This writes `position` and nothing else.
 *
 * `needsUpdate` is set because the buffer may already be uploaded to the GPU
 * when this runs; without it a re-centred mesh would render at its old
 * vertices until something else happened to dirty the attribute.
 */
function translatePositions(
  geometry: BufferGeometry,
  dx: number,
  dy: number,
  dz: number,
): void {
  const position = geometry.getAttribute("position");
  if (!position) return;

  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + dx,
      position.getY(i) + dy,
      position.getZ(i) + dz,
    );
  }
  position.needsUpdate = true;

  // ⚠️ Moving vertices invalidates both caches, and callers read them —
  // `buildPartGeometry` promises a computed box, and three's raycasting and
  // frustum culling read the sphere.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * Translate every geometry under `object` so the **scene's** bounding-box
 * centre is the origin, in world space.
 *
 * The node-tree counterpart of {@link centerGeometryOnOrigin}, and the answer
 * to plan 08's open question 3: *is the full mannequin's geometry centred too,
 * or only the parts?* It is, and this is how — the owner's instruction (*"ALL
 * have their origin set to the middle of the bounding volume"*) does not carve
 * out the whole figure, and the whole figure is exactly the mesh whose
 * rotation the orb drives most often.
 *
 * ## ⚠️ Why this is not just `centerGeometryOnOrigin` in a `traverse`
 *
 * A glTF scene is a **node tree**. Each mesh's vertices are in its own local
 * space and reach world space through its ancestors' matrices, so centring
 * each geometry on *its own* centre would explode the figure into five
 * separately-centred pieces stacked on the origin. The figure has exactly one
 * centre, and every geometry must be shifted by that **same world-space
 * vector**.
 *
 * A world vector is not a local vector, though. So the shift is converted per
 * node: the inverse of the node's world matrix maps the world offset into that
 * node's local frame, and only the **rotation/scale** part of that inverse
 * applies to a *direction* — hence `transformDirection`-style handling via a
 * pair of point transforms rather than `applyMatrix4` on the offset itself.
 * That is exact for arbitrary nesting, rotation and non-uniform scale.
 *
 * ## What it deliberately does NOT do
 *
 * - It does **not** bake node transforms flat. The tree keeps its shape,
 *   `applyMaterial`'s traverse still finds the same nodes, and nothing that
 *   depends on node names or ordering moves.
 * - It does **not** touch `normal` attributes. Same mechanism as
 *   {@link centerGeometryOnOrigin}: it goes through
 *   {@link translatePositions} rather than `BufferGeometry.translate()`,
 *   because the latter re-normalises the normal buffer as a side effect.
 * - It does **not** run on the segmentation path.
 *   {@link buildPartMesh} calls `loadMannequin(..., false)`, so the raw scene a
 *   part is cut from is untouched and every landmark fraction still measures
 *   against the same box it was derived from. ⚠️ Do not "simplify" by moving
 *   this above the `normalize` guard.
 *
 * A shared geometry reached through two nodes with **different** world
 * matrices would be translated twice. That cannot occur in this asset (two
 * nodes, two distinct meshes, no transforms) and cannot occur in any glTF
 * where instancing implies distinct nodes over one mesh — but the visited set
 * makes it structurally impossible rather than merely unlikely.
 */
export function centerSceneGeometryOnOrigin(
  three: ThreeNamespace,
  object: Object3D,
): void {
  object.updateWorldMatrix(true, true);

  const box = new three.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const centre = usableCentre(box.getCenter(new three.Vector3()));
  if (!centre) return;

  const inverse = new three.Matrix4();
  const origin = new three.Vector3();
  const shifted = new three.Vector3();
  const visited = new Set<BufferGeometry>();

  object.traverse((node) => {
    const holder = node as Object3D & {
      isMesh?: boolean;
      geometry?: BufferGeometry;
    };
    const geometry = holder.geometry;
    if (!holder.isMesh || !geometry) return;
    if (!geometry.getAttribute("position")) return;
    if (visited.has(geometry)) return;
    visited.add(geometry);

    // The world offset `-centre`, expressed in this node's local frame: map
    // both the world origin and the world origin displaced by `-centre` into
    // local space, and take the difference. Differencing two mapped POINTS is
    // what strips the inverse's translation column, leaving only the
    // rotation/scale acting on the direction — which is the correct treatment
    // for an offset and the reason this is not a bare `applyMatrix4`.
    inverse.copy(node.matrixWorld).invert();
    origin.set(0, 0, 0).applyMatrix4(inverse);
    shifted.set(-centre.x, -centre.y, -centre.z).applyMatrix4(inverse);
    shifted.sub(origin);

    // ⚠️ Not `geometry.translate()` — it rewrites the normal attribute. See
    // {@link translatePositions}.
    translatePositions(geometry, shifted.x, shifted.y, shifted.z);
  });
}

/**
 * Scale and recentre `object` so its bounding box is {@link UNIT_BOUNDS}.
 *
 * The primitives do not need this — their constructors already produce it —
 * but an arbitrary glTF is authored at whatever scale and origin its artist
 * chose, and `fitCameraToMesh` is written on the promise that the bounds it is
 * given are the bounds the mesh occupies. Normalising here keeps that promise
 * in one place instead of making every caller re-measure.
 *
 * A zero-extent object (an empty scene, or one whose geometry failed to load)
 * is left alone: there is no finite scale that maps a point onto a unit box,
 * and dividing by zero would push it to infinity and blank the render.
 *
 * ## What this still does after plan 08 task 01, and what it no longer does
 *
 * **Scale is its remaining job**, and the only one that matters on the part
 * path. {@link buildPartMesh} now runs {@link centerGeometryOnOrigin} on the
 * part's geometry *first*, so by the time this sees the mesh the box centre is
 * already `(0,0,0)` and `position.sub(centre·scale)` subtracts a zero vector —
 * a measured no-op, pinned by test.
 *
 * The full-mannequin path is the same: {@link loadMannequin}'s `normalize`
 * branch runs {@link centerSceneGeometryOnOrigin} first, so the subtraction is
 * a no-op there too. **Both production call sites now pre-centre**, which means
 * the line is measurably dead on both.
 *
 * ⚠️ **It is kept anyway, deliberately** — it is the general contract of the
 * function, which is "make this object's bounds `UNIT_BOUNDS`". Deleting it
 * would make that contract conditional on the caller having centred first, and
 * a future third call site would silently inherit an off-centre mesh with no
 * error anywhere. A no-op subtraction of a zero vector costs nothing; a
 * missing one costs a bug of exactly the kind this task exists to fix.
 *
 * ⚠️ It writes `object.position`, so it is **the** writer of that property on
 * this path. Plan 08 F3 implements pan through the **camera** precisely so a
 * second writer never appears; do not introduce one.
 */
export function normalizeToUnitBox(
  three: ThreeNamespace,
  object: Object3D,
): void {
  const box = new three.Box3().setFromObject(object);
  const size = box.getSize(new three.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largest) || largest <= 0) return;

  const centre = box.getCenter(new three.Vector3());
  const scale = 1 / largest;

  object.scale.multiplyScalar(scale);
  // A no-op for a part (its geometry is already origin-centred); load-bearing
  // for the full mannequin scene. See the header.
  object.position.sub(centre.multiplyScalar(scale));
}

/** `value` clamped to `[0, 1]`; `NaN` becomes 0 rather than propagating. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
