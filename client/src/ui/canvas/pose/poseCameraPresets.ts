/**
 * Pose tool — the camera PRESETS and the viewpoint rotation table.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ SPLIT OUT OF `poseCamera.ts` (plan 08 task 09). PURELY MECHANICAL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `poseCamera.ts` crossed the `ui/` 400-code-line `max-lines` **error** ceiling
 * when task 09 added the advanced-camera override layer, so this file was cut
 * along a **real seam**: everything here is a **named table** — the five camera
 * presets and the seven viewpoint rotations — and nothing here does any
 * geometry. The fit, the frustum, the pan offset and the Euler maths stayed
 * behind. Neither half calls the other.
 *
 * ⚠️ **Every symbol is RE-EXPORTED from `poseCamera.ts`**, so both import paths
 * work and no consumer moved. Import from wherever reads better; they are the
 * same binding. The split changed **no value and no signature** — the
 * `poseCamera.test.ts` viewpoint and preset assertions still import from
 * `poseCamera.ts` and still pass unchanged, which is the pin that this was a
 * move rather than an edit.
 *
 * Same purity rule as its parent: pure numbers, no three, no store, no MobX,
 * no React, no API, no `services/` (MASTER D15).
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
