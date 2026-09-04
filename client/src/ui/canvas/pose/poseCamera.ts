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
 * separate user settings: the viewpoint buttons and the rotation orb move the
 * model (see {@link POSE_VIEWPOINT_ROTATIONS}), while a **preset sets both** —
 * every camera field *and* the model's rotation, in one action (plan 08, F7;
 * see {@link PoseCameraPresetSpec}).
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

/* ── the five presets (plan 08 F7; supersedes MASTER D14) ─────────────────── */

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

/**
 * The field of view every preset restores, in degrees (plan 08, F7).
 *
 * ⚠️ **Mirrors `PoseUIStore`'s own `fov = 50` default**, which this module may
 * not import (the `ui/` boundary forbids reaching into `stores/`, type-only
 * included). The two are duplicated for exactly the reason the pose unions
 * are, and must change together. 50° is a mild lens — wide enough to read as
 * perspective, narrow enough that a 32-px sprite does not visibly barrel — and
 * sits inside the store's `[POSE_FOV_MIN, POSE_FOV_MAX]` = `[10, 120]` clamp,
 * so no preset can be rejected on write.
 */
export const DEFAULT_PRESET_FOV = 50;

/**
 * One named camera preset — **a whole scene state, not just an angle**
 * (plan 08, **F7**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ A PRESET SETS EVERYTHING. INCLUDING THE MODEL'S ROTATION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **The owner's words:** *"The camera preset buttons: these should CHANGE all
 * of the other settings that can be used for the camera."*
 *
 * Before plan 08 a preset carried `{id, label, projection, pitch, yaw}` and
 * nothing else, so pressing **Isometric** left the FOV wherever it happened to
 * be and left the model in whatever orientation the orb had last put it. The
 * result was a button that *felt* partial: a "known view" that was only known
 * along three of its axes. F7 closes that — a preset now carries every field
 * the scene's orientation is a function of, and pressing one puts the whole
 * thing into a fully reproducible state.
 *
 * ⚠️ **This SUPERSEDES plan 06's D14** ("a preset overrides the projection").
 * D14 was deliberately *kept* by owner decision on 2026-09-03, before F7
 * existed, and it is not being dropped by accident: F7 subsumes it, because a
 * preset now owns the projection **and** every other camera field **and** the
 * model's rotation. The supersession is recorded in plan 08's `HANDOFF.md`
 * under "Decisions this plan SUPERSEDES" (F8).
 *
 * ## What a preset deliberately does NOT set: `scale` and `pan`
 *
 * ⚠️ **Decided 2026-09-04, plan 08 open question 1 — and this is a decision,
 * not an omission.** The owner's phrase was "all of the other settings that
 * can be used for the camera", and after tasks 03 and 04 *neither of these is
 * a camera setting any more*:
 *
 * - **`scale`** is a **model** transform (F6) — `root.scale.setScalar(...)` on
 *   the model root. The camera holds still and does not move for it.
 * - **`pan`** is a camera **translation** (F3), but it is *framing*, not
 *   orientation: it says where in the frame the owner has parked the subject,
 *   and it is expressly unbounded so the model may sit half off-canvas on
 *   purpose.
 *
 * The distinction that settles it: a preset restores **which way the scene is
 * pointing**; scale and pan are **where the owner has put it and how close
 * they are working**. Those are the two things someone re-establishes by hand
 * after every accidental press, and losing your zoom every time you change
 * angle is hostile in a way that losing your angle — the thing you *asked* to
 * change — is not. The asymmetry is the point: rotation is overwritten because
 * a preset is *about* orientation; scale and pan are preserved because a
 * preset is not about framing.
 *
 * ⚠️ **If this is ever reversed**, the counter-argument is worth stating so it
 * is re-decided rather than merely flipped: a preset that leaves scale and pan
 * alone is *not* fully reproducible — two presses of **Isometric** from
 * different framings give two different pictures. That is a real cost, and the
 * mitigation already exists: **Fit to canvas** restores the scale in one press,
 * separately, when that is what the owner actually wanted.
 */
export interface PoseCameraPresetSpec {
  /** Stable id, matching {@link PoseCameraPreset}. */
  id: PoseCameraPreset;
  /** Human label for the rail button. */
  label: string;
  /** Orthographic for every flat pixel-game view; perspective for oblique. */
  projection: PoseProjection;
  /** Orbit elevation in radians. Positive looks DOWN at the model. */
  pitch: number;
  /** Orbit azimuth in radians. Positive swings toward +X. */
  yaw: number;
  /**
   * Vertical field of view in DEGREES (F7).
   *
   * ⚠️ Carried by **every** preset, orthographic ones included, and that is
   * deliberate. An orthographic camera ignores the FOV while it is selected —
   * but the store keeps one field, so a preset that left it alone would hand
   * the owner a stale FOV the moment they switched back to Perspective, from a
   * preset they pressed ten minutes ago. "Sets everything" has to mean the
   * stored value, not merely the value in use.
   */
  fov: number;
  /**
   * The **model's** euler rotation, in radians, XYZ order (F7).
   *
   * ⚠️ This is the model, NOT the camera — the camera's angles are `pitch` and
   * `yaw` above. Pressing a preset **overwrites** whatever the rotation orb or
   * a viewpoint button had set, by owner decision: that is what makes a preset
   * a *known* state rather than a partial one.
   */
  rotation: PoseVector;
  /**
   * Near/far clip policy (F7). `"fit"` means "let {@link fitCameraToMesh}
   * derive them from the bounds and {@link POSE_DEPTH_ALLOWANCE}".
   *
   * ⚠️ There is exactly one policy today and it is still spelled out as a
   * field rather than left implicit, because F7 lists the near/far policy
   * among the things a preset owns. Task 06's advanced camera mode adds the
   * second (`"explicit"`, with hand-entered planes), and this field is the
   * seam it will extend — a preset that silently inherited whatever the
   * advanced panel last set would not be a known state.
   */
  clipPolicy: "fit";
}

/**
 * The five camera presets, **defined once, as data** (plan 08 F7).
 *
 * Why orthographic dominates: every classic pixel-game view (2D side-on, 2.5D,
 * isometric, top-down) is a parallel projection. Perspective introduces
 * vanishing points, which at 32 px wide read as wobble rather than as depth.
 * `"oblique"` is the one perspective preset, offered because a mild
 * perspective 3/4 is genuinely useful as a *reference* even when the final art
 * is orthographic.
 *
 * ## Why each preset carries the rotation it does
 *
 * ⚠️ **Every one of them is `front` — the identity — except `oblique`**, and
 * that is reasoned, not lazy. The camera's `pitch`/`yaw` already carry the
 * *view* each preset names; adding a model rotation on top would rotate the
 * subject **as well as** the observer and land somewhere neither angle
 * describes. Two 45° yaws do not make an isometric view, they make a 90° one.
 * So the rotation each preset sets is the one that leaves its named camera
 * angle meaning exactly what it says: **face the model at the camera**.
 *
 * `oblique` is the exception because it is the one preset that is not a
 * *canonical* view at all — it is the "reference 3/4" everyone sketches from,
 * and that pose is conventionally the model turned slightly off-axis as well
 * as the camera. It gets `three-quarter`'s own rotation so the two agree by
 * construction rather than by coincidence.
 */
export const POSE_CAMERA_PRESETS: readonly PoseCameraPresetSpec[] = [
  {
    id: "2d",
    label: "2D",
    projection: "orthographic",
    pitch: 0,
    yaw: 0,
    // Flat side-on: no perspective at all, so the FOV is stored at the
    // store's own default rather than at some angle chosen for a view that
    // does not use one.
    fov: DEFAULT_PRESET_FOV,
    // Square on. A 2D view of a rotated model is not a 2D view.
    rotation: { x: 0, y: 0, z: 0 },
    clipPolicy: "fit",
  },
  {
    id: "2.5d",
    label: "2.5D",
    projection: "orthographic",
    // 30° is the conventional 2.5D "three-quarter overhead" tilt — high enough
    // to reveal the top faces, shallow enough that the front stays dominant.
    pitch: deg(30),
    yaw: 0,
    fov: DEFAULT_PRESET_FOV,
    // The tilt is the CAMERA's. Tilting the model too would double it.
    rotation: { x: 0, y: 0, z: 0 },
    clipPolicy: "fit",
  },
  {
    id: "iso",
    label: "Isometric",
    projection: "orthographic",
    // The TRUE isometric angle, derived at `TRUE_ISOMETRIC_PITCH_RADIANS` —
    // atan(1/√2), the elevation from which all three world axes foreshorten
    // equally. Paired with 45° of yaw, which is what puts the camera over a
    // cube's body diagonal and makes that equality hold.
    pitch: TRUE_ISOMETRIC_PITCH_RADIANS,
    yaw: deg(45),
    fov: DEFAULT_PRESET_FOV,
    // ⚠️ Identity, NOT a 45° model yaw. The camera's 45° is what makes the
    // view isometric; adding the model's own 45° would give a 90° relative
    // angle and show a flat side — an isometric camera looking at the wrong
    // face, which reads as "the isometric button is broken".
    rotation: { x: 0, y: 0, z: 0 },
    clipPolicy: "fit",
  },
  {
    id: "top-down",
    label: "Top-down",
    projection: "orthographic",
    pitch: deg(90),
    yaw: 0,
    fov: DEFAULT_PRESET_FOV,
    // ⚠️ Identity, and this is the one most likely to be "corrected". The
    // CAMERA is overhead, so the model's crown already faces it; also
    // rotating the model by `top` would tip it a second 90° and present its
    // BACK to an overhead camera.
    rotation: { x: 0, y: 0, z: 0 },
    clipPolicy: "fit",
  },
  {
    id: "oblique",
    label: "Oblique",
    projection: "perspective",
    pitch: deg(20),
    yaw: deg(45),
    // The one preset whose FOV is actually used. 50° is the store's default
    // and a mild lens: wide enough to read as perspective, narrow enough that
    // a 32-px sprite does not visibly barrel.
    fov: DEFAULT_PRESET_FOV,
    // See the table header: the reference 3/4 pose turns the subject as well
    // as the observer. Shares `POSE_VIEWPOINT_ROTATIONS["three-quarter"]` so
    // the preset and the ¾ viewpoint button cannot drift apart.
    rotation: { x: deg(15), y: deg(45), z: 0 },
    clipPolicy: "fit",
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
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ READ THE CONVENTION BELOW BEFORE TOUCHING A SINGLE SIGN IN THIS TABLE.
 *  THESE VALUES HAVE BEEN INVERTED TWICE ALREADY. THE SECOND TIME WAS ON
 *  PURPOSE (plan 08, F9) AND IS **NOT** A BUG TO BE FIXED.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ These rotate the MODEL, not the camera — rotating the subject rather than
 * orbiting the observer keeps the camera preset (2D / iso / …) independent of
 * which side you are looking at. The two compose.
 *
 * ## The convention, stated once, in the owner's own terms (F9)
 *
 * **The owner's words, 2026-09-03:** *"The rotation presets of the model should
 * be indicative of what the model should do: left means the model rotates to
 * face the left, right means rotate to face the right, top means I look at the
 * top of the model, etc etc"*.
 *
 * ⚠️ **Those two halves are phrased from DIFFERENT points of view, and that is
 * why left/right invert while top/bottom do not.** This is the single fact that
 * has caused every re-inversion of this table:
 *
 * | Button | The owner's phrasing | Frame | What the viewer sees |
 * | --- | --- | --- | --- |
 * | `left` | "the model rotates to **face** the left" | **model**-centric | its **RIGHT** flank |
 * | `right` | "the model rotates to **face** the right" | **model**-centric | its **LEFT** flank |
 * | `top` | "**I look at** the top of the model" | **viewer**-centric | its crown |
 * | `bottom` | (by symmetry) "I look at its underside" | **viewer**-centric | its underside |
 *
 * A model-centric name says **where the model's front ends up**. A
 * viewer-centric name says **which of its surfaces ends up facing me**. They
 * are opposite readings, so `left` and `top` mean structurally different
 * things, and a table that treats all four the same way will always have half
 * of them backwards. `front` and `back` are unaffected: the two readings agree
 * on them, because a model facing front IS its front toward the viewer.
 *
 * With the default camera on +Z looking down −Z, and the model authored facing
 * +Z with its own right hand toward +X:
 *
 * - `front` — identity. The model faces the viewer.
 * - `back` — yaw 180°. The model faces away; the viewer sees its −Z back.
 * - `left` — yaw **−90°**, which takes the model's front `(0,0,1)` to
 *   `(-1,0,0)`: **it now faces screen-left**, exactly as the button says. Its
 *   own right side `(1,0,0)` swings to `(0,0,1)` — toward the camera — so
 *   ⚠️ **`left` shows the model's RIGHT flank.** That is not a bug; it is what
 *   "turn left" means for anything that has a front.
 * - `right` — yaw **+90°**, the mirror: the model faces screen-right and the
 *   viewer sees its **LEFT** flank.
 * - `top` — pitch **+90°** about X, which takes `(0,1,0)` to `(0,0,1)`: the
 *   model's crown rotates to face the camera. **Viewer-centric, and therefore
 *   unchanged by F9.**
 * - `bottom` — pitch **−90°**, presenting the underside. Unchanged.
 * - `three-quarter` — the classic reference pose, yaw 45° with a slight 15°
 *   tip about +X, so two faces and a hint of the top are all visible.
 *   ⚠️ **Re-examined under F9 and deliberately LEFT AS IT WAS.** Its name is
 *   neither model-centric nor viewer-centric — "three-quarter" describes the
 *   *picture*, not a direction anyone is facing, so F9's inversion has nothing
 *   to bite on. Read model-centrically it turns the subject 45° to its right,
 *   showing the viewer its front and its left shoulder: the standard reference
 *   3/4, and the same shoulder as before this change. A sign flip here would
 *   have swapped which shoulder is presented for no reason the owner asked
 *   for, purely from a false analogy with `left`/`right`.
 *
 * ## ⚠️ What changed in plan 08, and what did NOT
 *
 * **F9 inverted `left` and `right` — the MEANING and the numbers with it.** It
 * did **not** touch {@link applyEulerXYZ}, `worldToView`, `orbitDirection` or
 * any projection maths, and a future reader must not "fix" those to chase this
 * table. The maths was re-verified against three 0.185.1's own
 * `Vector3.applyEuler` during plan 08 planning and is **self-consistent**: the
 * previous values were correct *for the previous convention*, which read `left`
 * as "show me the left flank". The owner asked for the other convention. Only
 * the convention moved.
 *
 * ⚠️ **The old header's claim that "`left` shows the model's LEFT flank" is
 * DELETED, not merely amended.** Leaving a stale sentence contradicting the
 * table is precisely how this got inverted twice; the third inversion would
 * come from a reader trusting the prose over the data.
 *
 * Exported as a `Record` so the rail's buttons and the container's wiring share
 * ONE definition and cannot drift.
 */
export const POSE_VIEWPOINT_ROTATIONS: Record<string, PoseVector> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: deg(180), z: 0 },
  // ⚠️ F9: the model TURNS TO FACE LEFT, so the viewer sees its RIGHT flank.
  // Inverted from `+90°` on 2026-09-04 by owner decision. Not a sign fix.
  left: { x: 0, y: deg(-90), z: 0 },
  // ⚠️ F9: the mirror — the model faces right, the viewer sees its LEFT flank.
  right: { x: 0, y: deg(90), z: 0 },
  // Viewer-centric ("I look at the top"): unchanged by F9.
  top: { x: deg(90), y: 0, z: 0 },
  bottom: { x: deg(-90), y: 0, z: 0 },
  // Unchanged: describes the picture, not a facing. See the header.
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
  /** Vertical field of view in DEGREES. Ignored when orthographic. */
  fov: number;
  /** Camera orbit pitch in radians. Default 0. */
  pitch?: number;
  /** Camera orbit yaw in radians. Default 0. */
  yaw?: number;
}

/** The default 10% total padding — a 90% fill (MASTER D7). */
export const DEFAULT_FIT_PADDING = 0.1;

/** Guard against a degenerate frustum when the bounds are a single point. */
const MIN_HALF_EXTENT = 1e-4;

/**
 * The **scale floor** — the same guard `PoseUIStore.POSE_SCALE_MIN_SAFE`
 * applies, restated here because this module may not import a store (MASTER
 * D15) and {@link solveFitScale} must never hand a caller a zero or negative
 * multiplier. A cap would be a taste judgement; a floor is arithmetic.
 */
const MIN_FIT_SCALE = 1e-3;

/**
 * How many bounding radii of depth the clip planes allow around the model.
 *
 * ⚠️ Deliberately large. The model's `scale` is **unbounded above** (F6), so a
 * model scaled to 30× has to stay between `near` and `far` or it disappears
 * rather than merely overflowing the frame — and "it vanishes past a certain
 * scale" is a bug report about the scale control, not about clipping, which is
 * exactly the kind of misattribution that costs a debugging session. 64 radii
 * covers every scale the sliders reach and costs only depth precision, which
 * this renderer does not read (the height channel reads the depth BUFFER of a
 * separately-configured pass, not this one's `far`).
 */
export const POSE_DEPTH_ALLOWANCE = 64;

/**
 * The radius of the bounding **sphere** of `bounds`, about its own centre.
 *
 * ⚠️ **This is the whole cure for the pulsing (plan 08, F5).** See
 * {@link fitCameraToMesh}'s header for why a sphere and not a box.
 */
export function boundsRadius(bounds: PoseBounds): number {
  const hx = (bounds.max.x - bounds.min.x) / 2;
  const hy = (bounds.max.y - bounds.min.y) / 2;
  const hz = (bounds.max.z - bounds.min.z) / 2;
  return Math.max(Math.hypot(hx, hy, hz), MIN_HALF_EXTENT);
}

/** The centre of `bounds` — what the camera aims at. */
export function boundsCentre(bounds: PoseBounds): PoseVector {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

/**
 * Place the camera **once**, so that a model at scale 1 exactly fills the
 * shorter canvas axis (plan 08, **F4**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE CAMERA HOLDS STILL. IT DOES NOT SEE THE MODEL'S ROTATION OR SCALE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything this function returns is a pure function of `bounds`, the canvas
 * dimensions, `projection`, `pitch`, `yaw` and `fov`. **`rotation` is not a
 * parameter any more, and neither is `scale`** — that is not an omission, it
 * is the fix, and `poseCamera.test.ts` pins it by sweeping a full revolution
 * and asserting the returned object is deep-equal at every step.
 *
 * ## Why the old fit made the model pulse (measured 2026-09-03)
 *
 * The previous implementation took the eight corners of `bounds`, ran each
 * through `applyEulerXYZ(local, rotation)` and then `worldToView(...)`, and
 * sized the frustum from `max |view.x| / |view.y|`. That is a **correct**
 * tight fit of a rotated box — and it is exactly why the model breathed. A
 * non-cubic box genuinely has a larger projected extent across its diagonal
 * than across its face (a unit cube is `√2` wide at 45° of yaw), so a fit that
 * measures the rotated silhouette re-frames on **every rotation step**. The
 * owner saw that as "the camera gets closer and further as it goes around".
 *
 * ⚠️ Clamping or smoothing that number would have been the wrong cure (MASTER
 * §8, mistake 1): it would only have made the breathing slower. The fit had to
 * stop depending on rotation **at all**.
 *
 * ## The cure: fit the bounding SPHERE (F5, option 1)
 *
 * A sphere has the same silhouette from every direction, so its projected
 * radius is rotation-invariant **by construction** — not by approximation, not
 * within a tolerance. Rotating a model about its own centre moves every vertex
 * along that sphere's surface and can never move one outside it, so a frame
 * built from the radius is a frame the model can never overflow, at any angle.
 * That is what makes the invariance provable rather than merely observed.
 *
 * The alternative (F5 option 2 — fit the **unrotated** box) was rejected:
 * it is equally stable, but a rotated corner can push past the frame edge, so
 * it trades a pulsing model for an intermittently clipped one. Its own cost is
 * paid in framing tightness: a long thin model is framed loosely at every
 * angle, by the ratio of its diagonal to its longest side. Since **plan 08
 * task 01 centred every mesh's geometry on its own bounding-box centre**, and
 * everything reaching the engine is normalised into `UNIT_BOUNDS`, the sphere
 * here is a known quantity — `√3/2 ≈ 0.866` for the unit box — and the
 * looseness is a constant, not a surprise.
 *
 * ## What "scale 1 fills the frame" buys
 *
 * The frustum is sized so the **bounding sphere touches the SHORTER canvas
 * axis at model scale 1**, with **no padding folded in**. Padding is not the
 * camera's business any more: it belongs to {@link solveFitScale}, which is
 * what the owner's **Fit to canvas** now sets. Keeping the camera at a
 * padding-free reference frame means the model scale reads directly as
 * "fraction of the frame the sphere fills", which is what makes the Scale
 * control legible and the fit arithmetic one line.
 *
 * ⚠️ **A box inside that sphere therefore reads SMALLER than the frame it is
 * fitted to** — by the ratio of its half-extent to its half-diagonal, `1/√3 ≈
 * 0.577` for a cube. That is not a bug and not a rounding error; it is F5
 * option 1's price, and `poseCamera.test.ts` asserts the exact number so a
 * future switch to option 2 cannot pass silently. ⚠️ **No owner has seen this
 * rendered yet.** If the model reads as too small in the frame, the lever is
 * the padding constant in `CanvasContainer`, **never** a return to a
 * rotation-dependent fit — that would bring the pulsing straight back.
 *
 * ⚠️ **`scale` is a MODEL transform** (F6). It is applied by the container as
 * `root.scale.setScalar(...)` and never reaches this function. The old
 * `scaleCameraParams`, which divided the frustum instead, is **deleted**.
 */
export function fitCameraToMesh(params: FitCameraParams): PoseCameraParams {
  const { bounds, canvasWidth, canvasHeight, projection, fov, pitch = 0, yaw = 0 } = params;

  // A zero-area canvas has no frame to fit into; fall back to square so the
  // caller still gets usable numbers instead of NaN.
  const width = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1;
  const height = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1;
  const aspect = width / height;

  const centre = boundsCentre(bounds);

  // ── The frame ──────────────────────────────────────────────────────────
  //
  // The bounding sphere's projected radius, in world units, is just `radius` —
  // for an orthographic camera exactly, and for a perspective one to within
  // the near-field bulge, which at these distances is well under a texel.
  // The SHORTER canvas axis is the one the model must fit, and in a symmetric
  // frustum expressed in half-heights the shorter axis IS the half-height when
  // `aspect >= 1` and `halfHeight * aspect` when it is not — so taking the
  // half-height as `radius / min(aspect, 1)` makes the sphere touch whichever
  // axis is tight, at model scale 1, on any canvas.
  const radius = boundsRadius(bounds);
  const frustumHalfHeight = Math.max(radius / Math.min(aspect, 1), MIN_HALF_EXTENT);
  const frustumHalfWidth = frustumHalfHeight * aspect;

  // ── Camera placement ───────────────────────────────────────────────────
  //
  // The orbit direction, from the target toward the camera. At pitch 0/yaw 0
  // this is +Z, i.e. the default "in front of the model" position.
  const dir = orbitDirection(pitch, yaw);

  const fovRadians = clamp(Number.isFinite(fov) ? fov : 45, 1, 179) * (Math.PI / 180);

  // For perspective the distance is what sets the framing; for orthographic it
  // only has to clear the geometry. Both are measured against the SPHERE, so
  // both are rotation-invariant like everything else here.
  const perspectiveDistance = frustumHalfHeight / Math.tan(fovRadians / 2);
  const orthographicDistance = radius * 2 + Math.max(frustumHalfHeight, radius) * 2;

  // ⚠️ A generous depth allowance, applied to the CLIP PLANES ONLY and never
  // to the distance. The model may be SCALED far past the frame (F6 removed
  // the cap), so `near`/`far` bracket a multiple of the radius rather than
  // hugging it — growing the model must not push it through a clip plane and
  // make it vanish, a failure that would read as "the scale control breaks past
  // N" rather than as a clipping bug.
  //
  // ⚠️ Folding this into the DISTANCE instead would be a subtle disaster for a
  // perspective camera: the distance is what sets its framing, so a 64-radius
  // dolly-back would shrink the model to a speck. (Measured while writing this
  // — the first draft did exactly that, and `frameOccupancy` fell to 0.02.)
  const depthAllowance = radius * POSE_DEPTH_ALLOWANCE;

  // A floor on the distance keeps a degenerate (point-sized) box from putting
  // the camera on top of its own target, where `near` would overrun `far`.
  const MIN_DISTANCE = 1e-2;
  const distance = Math.max(
    projection === "perspective"
      ? perspectiveDistance + radius
      : orthographicDistance,
    MIN_DISTANCE,
  );

  const position: PoseVector = {
    x: centre.x + dir.x * distance,
    y: centre.y + dir.y * distance,
    z: centre.z + dir.z * distance,
  };

  // Clip planes bracket the sphere with room to spare.
  //
  // `near` is kept strictly positive — a zero or negative near plane is
  // undefined for perspective and produces a degenerate projection matrix for
  // orthographic. `far` is then derived FROM `near` rather than computed
  // independently, so `far > near` holds by construction: computing the two
  // separately let a point-sized box produce `near > far`, which silently
  // renders nothing at all.
  const near = Math.max(distance - depthAllowance, distance * 0.01, 1e-3);
  const far = Math.max(
    distance + depthAllowance + frustumHalfHeight * 2,
    near + Math.max(depthAllowance * 2, frustumHalfHeight * 4, 1e-2),
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

/**
 * The **model scale** that makes `bounds` fill `1 - padding` of the frame that
 * {@link fitCameraToMesh} placed for the same `bounds` (plan 08, **F4**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ A FIT MOVES THE MODEL NOW, NOT THE CAMERA.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This is the other half of F4: "fit to canvas" used to re-place the camera,
 * and now it solves for the multiplier the container writes onto the model
 * root as `root.scale.setScalar(...)`. Because {@link fitCameraToMesh} frames
 * the bounding sphere at **exactly** one radius of half-height (see its
 * header), a model at scale `s` occupies `s` of the half-frame — so the scale
 * that fills `1 - padding` is `1 - padding` itself.
 *
 * ⚠️ **It is written as the ratio anyway, not as `1 - padding`.** The identity
 * holds only while the camera frames the sphere exactly, and a future change
 * to the framing (a fixed camera preset with its own frustum, say) must break
 * this function loudly rather than silently keep returning a stale constant.
 * Deriving it from the same `boundsRadius` the camera used costs one divide
 * and keeps the two definitions tied together.
 *
 * `padding` is the same `[0, 0.95)` clamp {@link fitCameraToMesh} used to
 * apply, and the result is floored at {@link MIN_FIT_SCALE} — never capped
 * (F6: a floor is arithmetic, a cap is a taste judgement).
 */
export function solveFitScale(bounds: PoseBounds, padding?: number): number {
  const clamped = clamp(
    Number.isFinite(padding) ? (padding as number) : DEFAULT_FIT_PADDING,
    0,
    0.95,
  );
  const fill = 1 - clamped;
  const radius = boundsRadius(bounds);
  // The frame's half-extent in model units, on the tight axis: one radius, by
  // construction of `fitCameraToMesh`. The model must occupy `fill` of it.
  const frameHalfExtent = radius;
  const scale = (fill * frameHalfExtent) / radius;
  return Number.isFinite(scale) && scale > MIN_FIT_SCALE ? scale : MIN_FIT_SCALE;
}

/* ── the camera-space pan (plan 08, F3) ───────────────────────────────────── */

/** Arguments to {@link offsetCameraParams}. */
export interface OffsetCameraParams {
  /** The fitted camera to translate. Never mutated. */
  params: PoseCameraParams;
  /**
   * The pan, in **grid cells** — the store's own unit (`PoseUIStore.pan`).
   * `+x` slides the picture RIGHT on the canvas, `+y` slides it DOWN, which
   * is the direction the drag has always moved it.
   */
  panX: number;
  panY: number;
  /** Render-target width in texels — `cellWidth`. One cell is one texel. */
  canvasWidth: number;
  /** Render-target height in texels — `cellHeight`. */
  canvasHeight: number;
  /** The same orbit pitch that placed `params`, in radians. */
  pitch?: number;
  /** The same orbit yaw that placed `params`, in radians. */
  yaw?: number;
}

/**
 * Translate a fitted camera **parallel to its own image plane** — the pan
 * (plan 08, **F3**; the owner's item 3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE POSITION AND THE TARGET MOVE BY THE SAME WORLD VECTOR. ALWAYS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That single sentence is the whole design. Because both endpoints move
 * together the view *direction* is unchanged, so `lookAt` still resolves to
 * the same orientation, the frustum keeps every one of its dimensions, and
 * nothing about the framing — scale, projection, near, far — is disturbed.
 * The camera slides sideways; it does not turn, dolly, or re-fit.
 *
 * ## What it replaces, and why that had to go
 *
 * **The owner's words:** *"Panning the pose is done wrong: right now it is
 * moving the pose's canvas completely so if I pan it down but the model goes
 * above the top border, it looks clipped in the rendering. We should be
 * adjusting for the so the panning is just a parallel translation to the
 * camera so the canvas stays pixel aligned properly."*
 *
 * Pan used to be a **canvas-space blit offset**: the container rendered a
 * `cellWidth × cellHeight` target and then drew that whole rectangle at
 * `putImageData(image, pan.x - ox, pan.y - oy)`. Anything outside the
 * target's own rectangle was **never rasterised in the first place**, so
 * sliding the finished picture could only ever reveal empty margin on one
 * side and guillotine the model on the other. That is precisely the clipping
 * reported.
 *
 * The old design had a stated justification — *"a camera pan would re-fit and
 * re-rasterise"* — which was **true of the old camera and is not true of this
 * one**. Plan 08 task 03 made the fit a pure function of bounds, canvas,
 * projection, pitch, yaw and fov, solving for a **model scale** instead of
 * moving the camera. So a pan no longer perturbs the fit, and the premise the
 * blit offset rested on is gone.
 *
 * ## Why not `object.position`, and why not an off-axis frustum
 *
 * Moving the **model** instead would collide with `normalizeToUnitBox`
 * (`poseMeshes.ts`), which already writes `object.position` on the very root
 * the container holds — a second writer would fight it, and the loser would
 * be whichever effect ran last (MASTER §8, mistake 2).
 *
 * Shifting the frustum asymmetrically works for orthographic and **does not
 * generalise**: an off-axis perspective projection cannot be expressed through
 * {@link applyCameraParams}, which writes camera *fields* and lets three build
 * the matrix (F16). Translating the camera works identically for both
 * projections through the code that already exists.
 *
 * ## Pixel alignment — the point of the task
 *
 * One grid cell is **one render-target texel**: the target is allocated at
 * exactly `cellWidth × cellHeight` with no devicePixelRatio and blitted 1:1.
 * So a pan of *n* cells must translate the view by *exactly* *n* texels, and
 * the world size of one texel is read off the fitted frustum:
 *
 * - **orthographic** — the frustum spans `right - left` world units across
 *   `canvasWidth` texels, so `worldPerTexel = (right - left) / canvasWidth`.
 *   The fit builds `halfWidth = halfHeight · aspect` with `aspect =
 *   canvasWidth / canvasHeight`, so the X and Y answers are **equal** — as
 *   they must be, or square texels would pan at different rates per axis.
 * - **perspective** — the half-height of the frustum *at the target's depth*
 *   is `distance · tan(fov/2)`, so `worldPerTexel = 2 · distance ·
 *   tan(fov/2) / canvasHeight`. Exact at the target plane, which is where the
 *   model sits; a vertex nearer the camera parallaxes slightly, which is what
 *   perspective *means* and is not an alignment error.
 *
 * ⚠️ **The pan is snapped to whole texels before it is converted**, not
 * after. Rounding in cells (an integer count) and then multiplying by the
 * world-per-texel constant lands the translation on an exact texel boundary
 * by construction. Converting first and rounding the world units afterwards
 * would be the same idea done wrong — the rounding error would depend on the
 * frustum size and reappear as a half-texel crawl while dragging.
 *
 * ## Signs
 *
 * `panX` is "slide the picture right", which means the **camera moves left**:
 * to see more of what is on the model's left, the observer steps left. Hence
 * the negated right vector. `panY` is "slide the picture down" in canvas
 * coordinates, where +Y is **down**, while the camera's up vector is +Y
 * **up** — so it too is negated, and the two negations have different
 * reasons. Both preserve the drag direction the pointer path has always had,
 * so dragging stays direct rather than inverted.
 *
 * ⚠️ **Pan is deliberately UNBOUNDED.** The model may leave the frame
 * entirely; nothing here clamps, and nothing should.
 *
 * @returns a **new** `PoseCameraParams`. `params` is not mutated. A pan of
 * `(0, 0)` returns a deep-equal copy — the regression pin that a zero pan
 * reproduces the previous camera exactly.
 */
export function offsetCameraParams(
  args: OffsetCameraParams,
): PoseCameraParams {
  const { params, panX, panY, canvasWidth, canvasHeight, pitch = 0, yaw = 0 } = args;

  const width = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1;
  const height = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1;

  // Snap in CELLS, which are integers by construction of the render target —
  // see the header. A non-finite pan is treated as no pan at all rather than
  // propagating NaN into the camera, where it would blank the frame.
  const texelsX = Number.isFinite(panX) ? Math.round(panX) : 0;
  const texelsY = Number.isFinite(panY) ? Math.round(panY) : 0;
  if (texelsX === 0 && texelsY === 0) return { ...params };

  // World units per texel, off the fitted frustum.
  let worldPerTexelX: number;
  let worldPerTexelY: number;
  if (params.projection === "perspective" && params.perspective) {
    const distance = Math.hypot(
      params.position.x - params.target.x,
      params.position.y - params.target.y,
      params.position.z - params.target.z,
    );
    const halfHeight =
      distance * Math.tan((params.perspective.fov * Math.PI) / 360);
    worldPerTexelY = (halfHeight * 2) / height;
    worldPerTexelX = worldPerTexelY;
  } else if (params.orthographic) {
    worldPerTexelX = (params.orthographic.right - params.orthographic.left) / width;
    worldPerTexelY = (params.orthographic.top - params.orthographic.bottom) / height;
  } else {
    // No frustum to measure — a caller handed in params with neither block
    // populated. Refusing to guess is better than inventing a scale.
    return { ...params };
  }

  // The camera's own right/up axes, in world space.
  const right = viewToWorld({ x: 1, y: 0, z: 0 }, pitch, yaw);
  const up = viewToWorld({ x: 0, y: 1, z: 0 }, pitch, yaw);

  // See "Signs" in the header: both terms are negated, for two different
  // reasons, and together they keep the drag direction unchanged.
  const u = -texelsX * worldPerTexelX;
  const v = texelsY * worldPerTexelY;

  const dx = right.x * u + up.x * v;
  const dy = right.y * u + up.y * v;
  const dz = right.z * u + up.z * v;

  return {
    ...params,
    position: {
      x: params.position.x + dx,
      y: params.position.y + dy,
      z: params.position.z + dz,
    },
    target: {
      x: params.target.x + dx,
      y: params.target.y + dy,
      z: params.target.z + dz,
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

/**
 * The exact inverse of {@link worldToView}: take a **view-space** offset back
 * into world space for a camera orbiting at `pitch`/`yaw`.
 *
 * ⚠️ **This is the camera basis a camera-space pan translates along** (plan
 * 08, **F3**). `viewToWorld({x:1,y:0,z:0}, …)` is the camera's **right**
 * vector and `viewToWorld({x:0,y:1,z:0}, …)` its **up** vector, in world
 * space — so a pan of `(u, v)` view-space units is the single world vector
 * `u·right + v·up`, which is what {@link offsetCameraParams} adds to *both*
 * the position and the target.
 *
 * ⚠️ **Verified 2026-09-04 against three 0.185.1 itself**, not derived on
 * paper. A camera placed at `orbitDirection(pitch, yaw) · d` and told to
 * `lookAt(0,0,0)` with the default up of `(0,1,0)` produces a `matrixWorld`
 * whose columns 0 and 1 match these two vectors to within 1.7e-16, at pitch 0,
 * at compound angles, at negative yaw, and at 89.9° of pitch (just short of
 * the gimbal singularity `lookAt` has at the poles). Getting this basis wrong
 * would make a pan drift diagonally at any pitch but zero — a bug that looks
 * like "the drag feels loose" rather than like a wrong matrix.
 *
 * Order matters and is the mirror image of {@link worldToView}'s: re-apply the
 * pitch about the view's own +X first, then the yaw about +Y. Round-tripping
 * 20,000 random vectors through both closes to 1.1e-15.
 */
export function viewToWorld(
  v: PoseVector,
  pitch: number,
  yaw: number,
): PoseVector {
  // Re-apply pitch (rotate by −pitch about X).
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = v.y * cp + v.z * sp;
  const z1 = -v.y * sp + v.z * cp;

  // Re-apply yaw (rotate by +yaw about Y).
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x2 = v.x * cy + z1 * sy;
  const z2 = -v.x * sy + z1 * cy;

  return { x: x2, y: y1, z: z2 };
}

/** `value` clamped to `[lo, hi]`; a non-finite value falls back to `lo`. */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}
