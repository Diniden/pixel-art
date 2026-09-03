/**
 * Pose tool — camera presets, viewpoint rotations, and the auto-fit maths.
 *
 * This module is **pure numbers in, pure numbers out**. It builds no three
 * objects, touches no GL context and imports nothing from three (not even a
 * type). That is deliberate and load-bearing: jsdom has no WebGL (MASTER risk
 * register), so the only way the framing maths gets tested at all is by
 * keeping it separable from the renderer. {@link applyCameraParams} is the
 * single seam where the numbers meet a three camera, and it is written against
 * a structural interface rather than against three's classes so that even it
 * needs no import.
 *
 * ## Coordinate conventions
 *
 * Right-handed, three's own: **+X right, +Y up, +Z toward the viewer**. A
 * camera at the default (pitch 0, yaw 0) sits on +Z looking down −Z at the
 * origin.
 *
 * - **yaw** rotates about +Y. Positive yaw swings the camera toward +X, i.e.
 *   the viewer orbits to the model's right and sees more of its right side.
 * - **pitch** raises the camera above the horizon. Positive pitch means
 *   looking DOWN at the model from above — the direction every pixel-game
 *   preset wants. Pitch 90° is straight down; pitch −90° is straight up.
 *
 * These are camera-orbit angles, NOT the model's rotation. The two are
 * separate user settings: presets move the camera, the viewpoint buttons and
 * the rotation orb move the model (see {@link POSE_VIEWPOINT_ROTATIONS}).
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/` (MASTER D15).
 */
import type {
  PoseCameraPreset,
  PoseProjection,
  PoseVector,
} from "@/ui/canvas/pose/poseTypes";

/* ── the five presets (MASTER D14) ────────────────────────────────────────── */

/**
 * The true-isometric pitch, **derived not guessed**.
 *
 * A "true" isometric view is the one in which the three world axes project to
 * screen directions 120° apart and all three foreshorten equally. Looking down
 * a cube's body diagonal does exactly that. With yaw at 45° the camera's
 * horizontal distance from the origin covers two unit axes, giving a ground
 * run of `√2` for every 1 unit of rise, so
 *
 * ```
 * pitch = atan(1 / √2) = 35.264389682754654°
 * ```
 *
 * (Not to be confused with the 30° of "pixel isometric" 2:1 dimetric, which is
 * `atan(1/2) ≈ 26.565°` and is a DIFFERENT projection. This is the true one,
 * as D14 specifies.)
 */
export const TRUE_ISOMETRIC_PITCH_RADIANS = Math.atan(1 / Math.SQRT2);

/** Degrees → radians. Local so the module keeps its zero-dependency promise. */
function deg(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Radians → degrees. Exported for the panel's readouts and for tests. */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** One named camera angle: a projection plus an orbit, in radians. */
export interface PoseCameraPresetSpec {
  /** Stable id, matching {@link PoseCameraPreset}. */
  id: PoseCameraPreset;
  /** Human label for the rail button (task 07 renders it). */
  label: string;
  /** Orthographic for every flat pixel-game view; perspective for oblique. */
  projection: PoseProjection;
  /** Orbit elevation in radians. Positive looks DOWN at the model. */
  pitch: number;
  /** Orbit azimuth in radians. Positive swings toward +X. */
  yaw: number;
}

/**
 * The five camera presets, **defined once, as data** (MASTER D14).
 *
 * Applying a preset sets projection + angles and leaves **zoom and pan
 * untouched** — those are independent user settings, and stomping them on
 * every preset click would make the buttons feel destructive.
 *
 * Why orthographic dominates: every classic pixel-game view (2D side-on, 2.5D,
 * isometric, top-down) is a parallel projection. Perspective introduces
 * vanishing points, which at 32 px wide read as wobble rather than as depth.
 * `"oblique"` is the one perspective preset, offered because a mild
 * perspective 3/4 is genuinely useful as a *reference* even when the final art
 * is orthographic.
 */
export const POSE_CAMERA_PRESETS: readonly PoseCameraPresetSpec[] = [
  {
    id: "2d",
    label: "2D",
    projection: "orthographic",
    pitch: 0,
    yaw: 0,
  },
  {
    id: "2.5d",
    label: "2.5D",
    projection: "orthographic",
    // 30° is the conventional 2.5D "three-quarter overhead" tilt — high enough
    // to reveal the top faces, shallow enough that the front stays dominant.
    pitch: deg(30),
    yaw: 0,
  },
  {
    id: "iso",
    label: "Isometric",
    projection: "orthographic",
    pitch: TRUE_ISOMETRIC_PITCH_RADIANS,
    yaw: deg(45),
  },
  {
    id: "top-down",
    label: "Top-down",
    projection: "orthographic",
    pitch: deg(90),
    yaw: 0,
  },
  {
    id: "oblique",
    label: "Oblique",
    projection: "perspective",
    pitch: deg(20),
    yaw: deg(45),
  },
] as const;

/** Look one preset up by id. Returns `undefined` for an unknown id. */
export function getCameraPreset(
  id: PoseCameraPreset,
): PoseCameraPresetSpec | undefined {
  return POSE_CAMERA_PRESETS.find((preset) => preset.id === id);
}

/* ── the viewpoint buttons (model rotation, NOT camera) ───────────────────── */

/**
 * The seven viewpoint buttons, as **model** euler rotations in radians
 * (XYZ order, three's default).
 *
 * ⚠️ These rotate the MODEL, not the camera — the request asks for "buttons
 * for common view points", and rotating the subject rather than orbiting the
 * observer keeps the camera preset (2D / iso / …) independent of which side
 * you are looking at. The two compose: iso + Left shows the model's left side
 * in isometric.
 *
 * With the default camera on +Z looking down −Z:
 *
 * - `front` — identity; the model's +Z face is toward the viewer.
 * - `back` — yaw 180°, showing the −Z face.
 * - `left` / `right` — yaw ±90°. `left` yaws the model **+90°**, which by
 *   three's XYZ convention takes `(-1,0,0)` to `(0,0,1)` — i.e. the model's
 *   **left** side (−X face) swings toward the viewer. `right` is the mirror.
 * - `top` / `bottom` — pitch about X. `top` is **+90°**, which takes `(0,1,0)`
 *   to `(0,0,1)`: the model's crown rotates to face the camera.
 * - `three-quarter` — the classic reference pose, yaw 45° with a slight 15°
 *   tip about +X, so two faces and a hint of the top are all visible.
 *
 * ⚠️ Every sign here was **verified against three 0.185.1's own
 * `Vector3.applyEuler`**, not derived on paper — the first draft had `left`,
 * `right`, `top` and `bottom` all inverted, and each one is the kind of error
 * that looks merely like "the buttons are mislabelled" rather than like a
 * maths bug. {@link applyEulerXYZ} is pinned against the same convention.
 *
 * Exported as a `Record` so task 07's buttons and task 08's wiring share ONE
 * definition and cannot drift.
 */
export const POSE_VIEWPOINT_ROTATIONS: Record<string, PoseVector> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: deg(180), z: 0 },
  left: { x: 0, y: deg(90), z: 0 },
  right: { x: 0, y: deg(-90), z: 0 },
  top: { x: deg(90), y: 0, z: 0 },
  bottom: { x: deg(-90), y: 0, z: 0 },
  "three-quarter": { x: deg(15), y: deg(45), z: 0 },
};

/** The viewpoint ids in the order the rail should render them (task 07). */
export const POSE_VIEWPOINT_ORDER: readonly string[] = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "three-quarter",
];

/* ── auto-fit (MASTER D7) ─────────────────────────────────────────────────── */

/** An axis-aligned box in model space. */
export interface PoseBounds {
  min: PoseVector;
  max: PoseVector;
}

/** Orthographic frustum half-extents, in world units. */
export interface PoseOrthographicFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Everything a caller needs to configure a camera, as plain numbers.
 *
 * Exactly one of `orthographic` / `perspective` is populated, matching
 * `projection`. Both are optional rather than a discriminated union of two
 * interfaces so a caller can narrow on `projection` (which it already has) and
 * read the field, without a cast.
 */
export interface PoseCameraParams {
  projection: PoseProjection;
  /** Where to put the camera, in world space. */
  position: PoseVector;
  /** What it looks at — the centre of the framed region. */
  target: PoseVector;
  /** Near clip plane. Always > 0. */
  near: number;
  /** Far clip plane. Always > `near`. */
  far: number;
  /** Populated iff `projection === "orthographic"`. */
  orthographic?: PoseOrthographicFrustum;
  /** Populated iff `projection === "perspective"`. */
  perspective?: { fov: number; aspect: number };
}

/** Arguments to {@link fitCameraToMesh}. */
export interface FitCameraParams {
  /** The region to frame, in model space. Usually a unit box or a sub-box. */
  bounds: PoseBounds;
  /** Render-target width in texels — `cellWidth`. */
  canvasWidth: number;
  /** Render-target height in texels — `cellHeight`. */
  canvasHeight: number;
  projection: PoseProjection;
  /** The MODEL's euler rotation (XYZ radians) — the box is fitted as rotated. */
  rotation: PoseVector;
  /** Vertical field of view in DEGREES. Ignored when orthographic. */
  fov: number;
  /** Camera orbit pitch in radians. Default 0. */
  pitch?: number;
  /** Camera orbit yaw in radians. Default 0. */
  yaw?: number;
  /**
   * Fraction of the frame left empty, total across both edges. `0.1` (the
   * default) means the model occupies **90% of the shorter canvas axis**
   * (MASTER D7). Clamped to `[0, 0.95)` — 100% padding would divide by zero.
   */
  padding?: number;
}

/** The default 10% total padding — a 90% fill (MASTER D7). */
export const DEFAULT_FIT_PADDING = 0.1;

/** Guard against a degenerate frustum when the bounds are a single point. */
const MIN_HALF_EXTENT = 1e-4;

/**
 * Frame `bounds` so its **rotated** projection occupies 90% of the shorter
 * canvas axis, centred (MASTER D7).
 *
 * Three things this gets right that a naive implementation does not:
 *
 * 1. **It fits the box AS ROTATED.** Fitting the axis-aligned box and then
 *    rotating the model makes a cube clip at its corners the moment you reach
 *    45°, because a unit cube's silhouette is `√2` wide there. The eight
 *    corners are transformed into VIEW space and the extents measured on the
 *    result, so every orientation frames correctly.
 * 2. **It handles non-square canvases.** The art grid is frequently not
 *    square. The fill target is the SHORTER axis, and the longer axis is given
 *    the slack — so the model never overflows either edge and the padding
 *    reads the same on the tight axis regardless of aspect.
 * 3. **It is pure.** Numbers in, numbers out, no three objects — which is what
 *    lets it be tested at all in a lane with no WebGL.
 *
 * The camera is placed along the orbit direction at a distance chosen from the
 * view-space depth of the box, so the box always sits comfortably inside
 * `[near, far]` — for an orthographic camera the distance does not affect the
 * framing at all, but clipping planes still have to contain the geometry.
 */
export function fitCameraToMesh(params: FitCameraParams): PoseCameraParams {
  const {
    bounds,
    canvasWidth,
    canvasHeight,
    projection,
    rotation,
    fov,
    pitch = 0,
    yaw = 0,
  } = params;

  // Padding is clamped rather than validated: a caller that computes it from a
  // slider should get a sane frame, not an exception mid-render.
  const padding = clamp(
    Number.isFinite(params.padding) ? (params.padding as number) : DEFAULT_FIT_PADDING,
    0,
    0.95,
  );
  const fill = 1 - padding;

  // A zero-area canvas has no frame to fit into; fall back to square so the
  // caller still gets usable numbers instead of NaN.
  const width = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1;
  const height = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1;
  const aspect = width / height;

  const centre: PoseVector = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };

  // The eight corners, taken into view space: first the MODEL's rotation, then
  // the inverse of the camera's orbit (equivalently: rotate the world by −yaw
  // then −pitch, which is what looking from (pitch, yaw) does).
  let halfW = MIN_HALF_EXTENT;
  let halfH = MIN_HALF_EXTENT;
  let halfD = MIN_HALF_EXTENT;

  for (const corner of boxCorners(bounds)) {
    // Model space, relative to the centre we will aim at.
    const local: PoseVector = {
      x: corner.x - centre.x,
      y: corner.y - centre.y,
      z: corner.z - centre.z,
    };
    const rotated = applyEulerXYZ(local, rotation);
    const view = worldToView(rotated, pitch, yaw);
    halfW = Math.max(halfW, Math.abs(view.x));
    halfH = Math.max(halfH, Math.abs(view.y));
    halfD = Math.max(halfD, Math.abs(view.z));
  }

  // ── The limiting axis ──────────────────────────────────────────────────
  //
  // The model must fit `fill` of the SHORTER canvas axis. Working in
  // normalised device coordinates (−1..1 on both axes), the shorter axis has
  // no extra room while the longer one is stretched by `aspect`. A box of
  // view half-extents (halfW, halfH) fills the frame when
  //
  //     halfW / frustumHalfWidth  ≤ fill   and   halfH / frustumHalfHeight ≤ fill
  //
  // so the frustum half-height that satisfies BOTH is the larger of the two
  // requirements. Expressing everything in half-heights (half-width is
  // `aspect × half-height`) makes the comparison one line.
  const halfHeightForVertical = halfH / fill;
  const halfHeightForHorizontal = halfW / fill / aspect;
  const frustumHalfHeight = Math.max(
    halfHeightForVertical,
    halfHeightForHorizontal,
    MIN_HALF_EXTENT,
  );
  const frustumHalfWidth = frustumHalfHeight * aspect;

  // ── Camera placement ───────────────────────────────────────────────────
  //
  // The orbit direction, from the target toward the camera. At pitch 0/yaw 0
  // this is +Z, i.e. the default "in front of the model" position.
  const dir = orbitDirection(pitch, yaw);

  // Distance. For orthographic this only has to clear the geometry; for
  // perspective it is what actually sets the framing, from the frustum
  // half-height and the vertical FOV.
  const fovRadians = clamp(
    Number.isFinite(fov) ? fov : 45,
    1,
    179,
  ) * (Math.PI / 180);

  const perspectiveDistance = frustumHalfHeight / Math.tan(fovRadians / 2);
  // Two model-depths of headroom keeps the whole box in front of the camera
  // even when it is long and thin along the view axis.
  const orthographicDistance = halfD * 2 + Math.max(frustumHalfHeight, halfD) * 2;

  // A floor on the distance keeps a degenerate (point-sized) box from putting
  // the camera on top of its own target, where `near` would overrun `far`.
  const MIN_DISTANCE = 1e-2;
  const distance = Math.max(
    projection === "perspective" ? perspectiveDistance + halfD : orthographicDistance,
    MIN_DISTANCE,
  );

  const position: PoseVector = {
    x: centre.x + dir.x * distance,
    y: centre.y + dir.y * distance,
    z: centre.z + dir.z * distance,
  };

  // Clip planes bracket the box with room to spare.
  //
  // `near` is kept strictly positive — a zero or negative near plane is
  // undefined for perspective and produces a degenerate projection matrix for
  // orthographic. `far` is then derived FROM `near` rather than computed
  // independently, so `far > near` holds by construction: computing the two
  // separately let a point-sized box produce `near > far`, which silently
  // renders nothing at all.
  const near = Math.max(distance - halfD * 2, distance * 0.01, 1e-3);
  const far = Math.max(
    distance + halfD * 2 + frustumHalfHeight * 2,
    near + Math.max(halfD * 4, frustumHalfHeight * 4, 1e-2),
  );

  if (projection === "perspective") {
    return {
      projection,
      position,
      target: centre,
      near,
      far,
      perspective: { fov: radiansToDegrees(fovRadians), aspect },
    };
  }

  return {
    projection,
    position,
    target: centre,
    near,
    far,
    orthographic: {
      left: -frustumHalfWidth,
      right: frustumHalfWidth,
      top: frustumHalfHeight,
      bottom: -frustumHalfHeight,
    },
  };
}

/* ── the one seam that touches a camera object ────────────────────────────── */

/**
 * The subset of a three camera {@link applyCameraParams} writes.
 *
 * Declared structurally so this module still imports nothing from three.
 * `THREE.PerspectiveCamera` and `THREE.OrthographicCamera` both satisfy it
 * (each carries the fields of its own projection plus the shared
 * `position`/`lookAt`/`updateProjectionMatrix`), and the optionality means
 * neither has to carry the other's.
 */
export interface PoseCameraLike {
  position: { set(x: number, y: number, z: number): void };
  near: number;
  far: number;
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
  fov?: number;
  aspect?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/**
 * Write `params` onto a three camera.
 *
 * The only function in this module that touches an object rather than a
 * number, kept deliberately tiny and free of decisions so that everything
 * worth testing lives in {@link fitCameraToMesh} instead. It writes only the
 * fields belonging to `params.projection`, so handing it the wrong camera type
 * leaves the other projection's fields alone rather than corrupting them.
 */
export function applyCameraParams(
  camera: PoseCameraLike,
  params: PoseCameraParams,
): void {
  camera.position.set(params.position.x, params.position.y, params.position.z);
  camera.near = params.near;
  camera.far = params.far;

  if (params.projection === "perspective" && params.perspective) {
    camera.fov = params.perspective.fov;
    camera.aspect = params.perspective.aspect;
  } else if (params.orthographic) {
    camera.left = params.orthographic.left;
    camera.right = params.orthographic.right;
    camera.top = params.orthographic.top;
    camera.bottom = params.orthographic.bottom;
  }

  camera.lookAt(params.target.x, params.target.y, params.target.z);
  camera.updateProjectionMatrix();
}

/* ── pure helpers, exported for the tests that pin them ───────────────────── */

/** The eight corners of `bounds`, in a stable order. */
export function boxCorners(bounds: PoseBounds): PoseVector[] {
  const { min, max } = bounds;
  const xs = [min.x, max.x];
  const ys = [min.y, max.y];
  const zs = [min.z, max.z];
  const out: PoseVector[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push({ x, y, z });
  return out;
}

/**
 * Rotate `v` by the euler angles `e` in **XYZ order** — three's default, and
 * therefore the order the model's `rotation` property will be interpreted in.
 * Getting the order wrong is invisible for single-axis rotations and wrong for
 * every combined one, so it is pinned by a test.
 *
 * Verified 2026-09-02 against three 0.185.1's `Vector3.applyEuler` for the
 * single-axis cases AND for the combined `XYZ(90°, 90°, 0)` case, which is the
 * one that distinguishes XYZ from every other order.
 */
export function applyEulerXYZ(v: PoseVector, e: PoseVector): PoseVector {
  // ⚠️ Transcribed from three's own `Matrix4.makeRotationFromEuler`, XYZ
  // branch (`three/src/math/Matrix4.js:347-361`), rather than composed from
  // three sequential axis rotations. The sequential form is where the first
  // draft went wrong: "XYZ" names the order the angles are LISTED, and the
  // resulting matrix is `Rz · Ry · Rx`, so a naive left-to-right composition
  // produces a different rotation for any combined angle. Building the matrix
  // entries directly removes the ambiguity, and a test pins the result
  // against three for the combined case that distinguishes the orders.
  const a = Math.cos(e.x);
  const b = Math.sin(e.x);
  const c = Math.cos(e.y);
  const d = Math.sin(e.y);
  const f2 = Math.cos(e.z);
  const g = Math.sin(e.z);

  const ae = a * f2;
  const af = a * g;
  const be = b * f2;
  const bf = b * g;

  // Column-major in three; written here as plain row dot products.
  const m00 = c * f2;
  const m01 = -c * g;
  const m02 = d;

  const m10 = af + be * d;
  const m11 = ae - bf * d;
  const m12 = -b * c;

  const m20 = bf - ae * d;
  const m21 = be + af * d;
  const m22 = a * c;

  return {
    x: m00 * v.x + m01 * v.y + m02 * v.z,
    y: m10 * v.x + m11 * v.y + m12 * v.z,
    z: m20 * v.x + m21 * v.y + m22 * v.z,
  };
}

/**
 * The unit vector from the target toward a camera orbiting at `pitch`/`yaw`.
 *
 * At (0, 0) this is `+Z` — directly in front. Positive pitch lifts the camera
 * to `+Y` (looking down); positive yaw swings it toward `+X`.
 */
export function orbitDirection(pitch: number, yaw: number): PoseVector {
  const cp = Math.cos(pitch);
  return {
    x: cp * Math.sin(yaw),
    y: Math.sin(pitch),
    z: cp * Math.cos(yaw),
  };
}

/**
 * Take a world-space offset into the view space of a camera orbiting at
 * `pitch`/`yaw` and looking at the origin.
 *
 * This is the inverse of the orbit: undo the yaw about +Y, then undo the pitch
 * about the camera's own +X. The result's `x`/`y` are screen right/up and `z`
 * is depth toward the viewer, which is exactly what the fit needs to measure.
 */
export function worldToView(
  v: PoseVector,
  pitch: number,
  yaw: number,
): PoseVector {
  // Undo yaw (rotate by −yaw about Y).
  const cy = Math.cos(-yaw);
  const sy = Math.sin(-yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;

  // Undo pitch (rotate by +pitch about X: a camera raised by `pitch` sees the
  // world tipped back down by the same amount).
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = v.y * cp - z1 * sp;
  const z2 = v.y * sp + z1 * cp;

  return { x: x1, y: y2, z: z2 };
}

/** `value` clamped to `[lo, hi]`; a non-finite value falls back to `lo`. */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}
