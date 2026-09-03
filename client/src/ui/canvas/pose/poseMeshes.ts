/**
 * Pose tool — the reference-solid library and the mannequin framing regions.
 *
 * Two halves, split along the line jsdom draws:
 *
 * - **Pure data and maths** — {@link MANNEQUIN_REGIONS}, {@link getFramingBounds},
 *   {@link UNIT_BOUNDS} — plain numbers, fully unit-tested in the node lane.
 * - **Geometry construction** — {@link buildMesh}, {@link loadMannequin} — needs
 *   three, and therefore cannot run where there is no WebGL (MASTER risk
 *   register). Kept deliberately THIN, with every decision that could be wrong
 *   pushed into the pure half above it.
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
 * ## Normalised size
 *
 * Every primitive is built to fit the **unit bounding box centred on the
 * origin** — `[-0.5, 0.5]` on all three axes. `fitCameraToMesh` then has ONE
 * job instead of four special cases, and the framing regions below can be
 * expressed as fractions that mean the same thing for every mesh.
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/` (MASTER D15). `three` is
 * permitted here and is the only third-party dependency.
 */
import type { BufferGeometry, Material, Object3D } from "three";
import type {
  PoseColor,
  PoseFraming,
  PoseMeshId,
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

/* ── the mannequin framing regions (MASTER D4) ────────────────────────────── */

/**
 * Which slice of the mannequin each "body part" button frames.
 *
 * ⚠️ **These are camera framing presets over ONE mesh, not separate meshes.**
 * The CC0 asset (MASTER D3) is a single *unrigged* mesh, so there is no way to
 * isolate a limb as geometry. Framing the region the limb occupies delivers
 * the buttons the request asked for without inventing a rigged asset.
 *
 * Each region is a **normalised sub-box of the mannequin's own bounding box**:
 * `0` is min on that axis, `1` is max. `y` is up, so `y: 1` is the crown of
 * the head and `y: 0` the soles. `x` is left-right (`0.5` is the centreline)
 * and `z` is front-back.
 *
 * ✅ **MEASURED against the real asset (task 09, 2026-09-03)**, not estimated.
 * The vendored `mannequin.gltf` was parsed and its vertex buffer decoded, and
 * each region below is the actual bounding box of that body part's vertices,
 * expressed as a fraction of the whole mesh's bounds, plus a small margin.
 * See `client/public/models/LICENSE.md` for the mesh's raw dimensions.
 *
 * ⚠️ **The asset is in a T-POSE, and that changed almost every region.** The
 * earlier estimates assumed a relaxed figure with the arms hanging at the
 * sides, so `arm` and `hand` were placed low and to the side — where this mesh
 * has nothing but empty space. The arms are in fact a horizontal bar at
 * shoulder height (y 0.76–0.81) reaching the full width of the mesh, and the
 * hands are at the far outer ends of it. The T-pose also makes the mesh nearly
 * as wide as it is tall (1.52 × 1.71), so the figure's own torso is much
 * narrower relative to the total width than a hanging-arms figure would be —
 * which is why `torso` and `leg` are far tighter in x than the estimates.
 *
 * How the numbers were derived: vertices were segmented into parts using the
 * mesh's own structure — the crotch split (two disjoint x-clusters below
 * y 0.47), the neck pinch (|x| collapses to < 0.06 at y 0.84), and the arm bar
 * (|x| > 0.25, which only occurs at y 0.76–0.81) — then each part's min/max was
 * normalised against the full bounds. A margin of 5–10% of the part's own span
 * is added so a region reads as a framed shot rather than a tight crop.
 *
 * Note these stack with `fitCameraToMesh`'s own 10% padding (MASTER D7); the
 * margin here is a second, smaller one that keeps a thin region such as `hand`
 * off the edge of the frame.
 *
 * `"full"` is exactly the whole box, which is what a primitive always uses.
 */
export const MANNEQUIN_REGIONS: Record<PoseFraming, PoseMeshBounds> = {
  /** The whole mesh — the unit-normalised bounding box, unchanged. */
  full: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
  },
  /**
   * Head: measured y 0.864–1.000, x 0.452–0.548 — the crown down to the neck
   * pinch. Genuinely narrow: the head is under 10% of this T-posed mesh's
   * total width, so framing it needs a much tighter x than a hanging-arms
   * figure would.
   */
  head: {
    min: { x: 0.443, y: 0.856, z: 0 },
    max: { x: 0.557, y: 1, z: 1 },
  },
  /**
   * Torso: measured y 0.472–0.839, x 0.343–0.657 — shoulders down to the
   * crotch split. The x span is the torso column only; the arms are excluded
   * deliberately, because including them would make this identical to `full`
   * on a T-pose.
   */
  torso: {
    min: { x: 0.325, y: 0.454, z: 0 },
    max: { x: 0.675, y: 0.858, z: 1 },
  },
  /**
   * Arm: measured y 0.761–0.812, x 0.642–1.000 — the figure's outstretched
   * RIGHT arm as the model faces us, from where it leaves the shoulder out to
   * the fingertips. A wide, short region, because a T-posed arm is horizontal.
   */
  arm: {
    min: { x: 0.624, y: 0.744, z: 0 },
    max: { x: 1, y: 0.83, z: 1 },
  },
  /**
   * Leg: measured y 0.000–0.480, x 0.517–0.629 — the sole up to the crotch,
   * one leg's width, taken on the same side as `arm` so switching between the
   * two does not jump across the body.
   *
   * The top is left at the measured crotch (0.48) rather than padded upward:
   * the margin is only there to avoid a tight crop, and above the crotch there
   * is no leg to crop — padding into the torso would just frame the hips. It
   * also keeps the leg strictly in the bottom half of the figure, which the
   * region invariants assert.
   */
  leg: {
    min: { x: 0.493, y: 0, z: 0 },
    max: { x: 0.653, y: 0.48, z: 1 },
  },
  /**
   * Hand: measured y 0.775–0.796, x 0.879–1.000 — the outer end of the `arm`
   * bar. The smallest and thinnest region by a wide margin, so it carries the
   * largest relative margin (10%) to keep it off the edge of the frame.
   */
  hand: {
    min: { x: 0.867, y: 0.762, z: 0 },
    max: { x: 1, y: 0.808, z: 1 },
  },
};

/**
 * The world-space bounds of `framing` within `meshBounds`.
 *
 * Maps the normalised sub-box above onto whatever box the mesh actually
 * occupies, so the same table works for the mannequin, a primitive, or a
 * future asset of any size. `"full"` returns `meshBounds` unchanged (to within
 * floating point), and an unknown framing falls back to `"full"` rather than
 * producing a degenerate frame.
 *
 * Pure — this is the function {@link fitCameraToMesh}'s `bounds` argument comes
 * from, and it is what makes the framing buttons testable without GL.
 */
export function getFramingBounds(
  framing: PoseFraming,
  meshBounds: PoseMeshBounds = UNIT_BOUNDS,
): PoseMeshBounds {
  const region = MANNEQUIN_REGIONS[framing] ?? MANNEQUIN_REGIONS.full;
  const span: PoseVector = {
    x: meshBounds.max.x - meshBounds.min.x,
    y: meshBounds.max.y - meshBounds.min.y,
    z: meshBounds.max.z - meshBounds.min.z,
  };
  return {
    min: {
      x: meshBounds.min.x + region.min.x * span.x,
      y: meshBounds.min.y + region.min.y * span.y,
      z: meshBounds.min.z + region.min.z * span.z,
    },
    max: {
      x: meshBounds.min.x + region.max.x * span.x,
      y: meshBounds.min.y + region.max.y * span.y,
      z: meshBounds.min.z + region.max.z * span.z,
    },
  };
}

/** The framing ids in the order the rail should render them (task 07). */
export const POSE_FRAMING_ORDER: readonly PoseFraming[] = [
  "full",
  "head",
  "torso",
  "arm",
  "leg",
  "hand",
];

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
 */
export async function loadMannequin(
  three: ThreeNamespace,
  url: string = MANNEQUIN_URL,
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

  normalizeToUnitBox(three, scene);
  return scene;
}

/* ── primitive construction ───────────────────────────────────────────────── */

/**
 * Build the reference solid for `id`, in `color`.
 *
 * `"mannequin"` delegates to {@link loadMannequin} and therefore inherits its
 * rejection; the three primitives always resolve. Every result is already
 * normalised to {@link UNIT_BOUNDS}, so the caller can hand it straight to
 * `fitCameraToMesh` with `UNIT_BOUNDS` as the bounds.
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
  return new three.Mesh(buildGeometry(three, id), buildMaterial(three, color));
}

/**
 * The geometry for one primitive, sized into the unit box.
 *
 * `BoxGeometry(1,1,1)`, `SphereGeometry(0.5)` and `CylinderGeometry(0.5, 0.5,
 * 1)` are each already centred on the origin and exactly 1 unit across their
 * widest axis, so no rescale is needed — the constructor arguments ARE the
 * normalisation, which is why they are written as literals rather than derived
 * from a bounding-box pass.
 */
export function buildGeometry(
  three: ThreeNamespace,
  id: Exclude<PoseMeshId, "mannequin">,
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
  object.position.sub(centre.multiplyScalar(scale));
}

/** `value` clamped to `[0, 1]`; `NaN` becomes 0 rather than propagating. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
