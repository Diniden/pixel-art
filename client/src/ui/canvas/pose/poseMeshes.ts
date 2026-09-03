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
 * ## Low-poly on purpose
 *
 * The output is a handful of pixels wide. Rasterised to a 32×32 grid a
 * 64-segment sphere and an 8-segment sphere are indistinguishable — you are
 * paying for vertices that never survive the first texel. Worse, a very smooth
 * sphere shades as a continuous gradient, which is precisely the thing pixel
 * art has to break into bands by hand; a faceted one already reads as discrete
 * planes and is a BETTER reference. So: sphere 16×12, cylinder 16 radial. Low
 * enough to face, high enough that the silhouette is not visibly a polygon.
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

/* ── low-poly segment counts, and why ─────────────────────────────────────── */

/**
 * Sphere tessellation: 16 around, 12 top-to-bottom.
 *
 * At the target resolution the silhouette is a few texels of arc, so segments
 * beyond this buy nothing visible. 16×12 also lands the seams off the cardinal
 * axes, which keeps the front-on view from showing a single flat facet
 * straight at the camera.
 */
export const SPHERE_WIDTH_SEGMENTS = 16;
export const SPHERE_HEIGHT_SEGMENTS = 12;

/**
 * Cylinder tessellation: 16 radial segments, 1 along the height.
 *
 * 16 matches the sphere so the two read as the same "resolution" of solid when
 * placed side by side. One height segment is all a straight tube needs —
 * subdividing it adds vertices no shader here looks at.
 */
export const CYLINDER_RADIAL_SEGMENTS = 16;
export const CYLINDER_HEIGHT_SEGMENTS = 1;

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
 * ⚠️ **APPROXIMATIONS, TUNED BY EYE from standard human proportions** — head
 * ≈ the top 12%, torso ≈ 40–72%, and so on, on the 7.5-head canon. They are
 * deliberately a little generous, because a region that crops a limb looks
 * broken while one with a bit of slack merely looks like a wider shot.
 *
 * **Task 09 must re-tune these against the real asset** once `mannequin.gltf`
 * is on disk and its actual proportions and rest pose can be measured. Until
 * then they are the best guess available, and every one of them is a fraction
 * so re-tuning is a data edit and not a code change.
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
   * Head: the top ~12% of the figure, narrow in x. Widened to the middle 40%
   * of the width so the shot is a portrait rather than a tight crop on the
   * skull.
   */
  head: {
    min: { x: 0.3, y: 0.86, z: 0 },
    max: { x: 0.7, y: 1, z: 1 },
  },
  /**
   * Torso: shoulders down to hips, roughly 40–72% of the height. Full width,
   * because the shoulders are the figure's widest point.
   */
  torso: {
    min: { x: 0.1, y: 0.4, z: 0 },
    max: { x: 0.9, y: 0.72, z: 1 },
  },
  /**
   * Arm: one arm, shoulder to wrist. Taken on the figure's LEFT side as the
   * viewer sees it (low x), spanning shoulder height down to about hip level,
   * which is where a relaxed arm's wrist falls.
   */
  arm: {
    min: { x: 0, y: 0.4, z: 0 },
    max: { x: 0.3, y: 0.75, z: 1 },
  },
  /**
   * Leg: hip to foot — the bottom ~42%. One leg's worth of width, on the same
   * side as `arm` so switching between the two does not jump across the body.
   */
  leg: {
    min: { x: 0.2, y: 0, z: 0 },
    max: { x: 0.5, y: 0.42, z: 1 },
  },
  /**
   * Hand: the smallest region, at the end of the `arm` span. A tight box
   * around where a relaxed hand sits — the one most likely to need re-tuning
   * in task 09, because it has the least slack.
   */
  hand: {
    min: { x: 0, y: 0.38, z: 0 },
    max: { x: 0.18, y: 0.5, z: 1 },
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

/* ── the mannequin loading seam (task 09 supplies the asset) ──────────────── */

/**
 * Where task 09 will vendor the CC0 mannequin (MASTER D3).
 *
 * ⚠️ **This task does NOT download it.** The constant exists so the path is
 * declared in exactly one place and task 09 has an obvious target; until that
 * task lands, fetching this URL 404s and {@link loadMannequin} rejects.
 */
export const MANNEQUIN_URL = "/models/mannequin.gltf";

/**
 * Thrown when the mannequin cannot be loaded — most often because task 09 has
 * not vendored it yet.
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
 * ⚠️ **This is a SEAM, deliberately.** Task 09 owns the asset; this task's job
 * is to make the mannequin button's absence a **runtime condition rather than
 * a compile error**, so the primitives ship whether or not task 09 succeeds
 * (it is explicitly allowed to end BLOCKED).
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
      `the mannequin asset at ${url} could not be loaded — task 09 vendors it`,
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
 * A flat, readable material in `color`.
 *
 * `MeshLambertMaterial`, not a PBR one: this is pose *reference*, and what
 * helps is a clean diffuse falloff whose bands you can read off and copy.
 * Roughness, metalness and specular highlights would add exactly the kind of
 * detail that does not survive being rasterised to a handful of texels, at the
 * cost of a shader that is harder to reason about.
 *
 * `flatShading` is on so each facet is one tone — with the low-poly counts
 * above, that turns the sphere into a readable set of discrete planes rather
 * than a smooth gradient, which is the form pixel art actually wants.
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
    flatShading: true,
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
