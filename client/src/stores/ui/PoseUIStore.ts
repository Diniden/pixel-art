/**
 * PoseUIStore — the pose tool's 3D reference state (pose-tool 2026-09-02,
 * task 02).
 *
 * The pose tool renders a reference solid — a primitive or the CC0 mannequin —
 * into an offscreen render target sized exactly `cellWidth × cellHeight` and
 * blits it onto an overlay canvas above every layer. This store is the one home
 * for everything that render is a function of: which mesh is loaded (a
 * primitive, the whole mannequin, or one of its parts), its rotation, the key
 * light's direction and colour, the outline's thickness, the camera's
 * projection / preset / FOV, the model's **scale**, and the screen-space pan.
 *
 * ⚠️ **The model's and outline's COLOURS are not here.** They are the app's own
 * Fill and Edge slots on `ToolUIStore` (MASTER E8/E9), read by
 * `PixelStudioPanelContainer` / `CanvasContainer` through
 * `fillColorOrSelected` and `selectedColor`.
 *
 * ⚠️ `modelColor` below is therefore **no longer read by anything that
 * renders.** It is kept rather than deleted because removing an
 * `observableRef` field, its action and its `clear()` line is a store-shape
 * change with its own risk, and it is harmless dead state — but do not wire a
 * new reader to it. The model's colour is the Fill slot.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NOTHING HERE IS PERSISTED, AND NOTHING HERE MAY BE DEEP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * - **Session-only.** No field here is read by `UIStore.toPersistedUIState()`
 *   (`stores/ui/UIStore.ts`). That builder is an explicit field-by-field list
 *   and ABSENCE FROM IT IS THE MECHANISM: adding a key would extend the wire
 *   format across the owner's 151-snapshot backup corpus and change their
 *   digests. The pose was never asked to be saved (MASTER D6) — the model is
 *   never part of the document until it is stamped.
 * - **Never in history.** Loading a mesh, tumbling it, or moving the light is
 *   not a command and never opens a history stroke. Only the *stamp* (tasks
 *   05/08) is undoable, and it is undoable as a pixel write, not as pose state.
 * - **Never schedules a save.** Nothing here is reachable from the hosted
 *   project, so no mutation can dirty it or wake `AutoSaveController`.
 * - **`observableRef` contract.** `rotation`, `lightDirection`, `lightColor`,
 *   `modelColor` and `pan` are refs and are REPLACED WHOLESALE — never edited
 *   field by field. Readers may therefore compare identity to know whether the
 *   render needs to be re-issued, and no `PoseVector` or `Color` is ever a
 *   MobX proxy. The scalars (`scale`, `fov`, `fitGeneration`) and the string
 *   unions are plain `observable`, which is safe: they are primitives.
 * - **Scale and pan are free** (MASTER E11/E13, refinements 2026-09-03).
 *   `scale` has no upper bound and `pan` has no bound at all — the model may
 *   be blown up far past the canvas and dragged completely off it.
 *   `fitGeneration` is the seam that brings it back: the rail bumps it, the
 *   container re-frames.
 *
 * ── Lifetime (locked D6) ──────────────────────────────────────────────────
 * The pose outlives layer, frame, object and variant switches — switch to
 * another tool and back and the reference is still there — and is cleared only
 * when a DIFFERENT project is installed. There is no reset hook on UI stores,
 * so `ApplicationStore` wires a `reaction` on `DomainStore.loadGeneration`
 * (bumped once per fresh install: init / load / create / switch / delete) to
 * `clear()`. It deliberately does NOT hook `adoptProject()`, which also runs on
 * snapshot undo/redo and would wipe the pose on every undo.
 *
 * Construction order is unconstrained: no dependencies in either direction,
 * exactly like `ReflectionUIStore` and `CanvasViewsUIStore`.
 */
import { action, computed, makeObservable, observable, observableRef } from "mobx";
import type { Color } from "@/types/domain";

/* ── local type declarations ───────────────────────────────────────────────
 *
 * ⚠️ Declared here rather than imported: `ui/canvas/pose/poseTypes.ts`
 * declares structurally identical types, and `stores/**` may not depend on a
 * `ui/` module's landing order — nor may it import from `ui/` at all under the
 * boundary rule. The two sets are structurally identical, so no cast is ever
 * needed at the seam. `ReflectionUIStore` does exactly this for
 * `ReflectionLine`. `Color` IS imported: it is a domain type, not a `ui/` one.
 *
 * ⚠️ **THE DUPLICATION IS DELIBERATE AND THE TWO CHANGE TOGETHER** (MASTER
 * E20). A member added here and not there — or vice versa — compiles on one
 * side and fails at the container, far from either declaration.
 */

/**
 * One anatomical piece of the mannequin, built as its OWN geometry (E1).
 *
 * ⚠️ **Mirrors `ui/canvas/pose/poseTypes.ts` character for character (E20).**
 * These replaced the deleted `PoseFraming` union: framing pointed a camera at
 * a slice of the whole figure, so clicking **Head** still rendered — and lit,
 * and stamped — the entire mannequin. A part id now selects a real triangle
 * subset, re-centred and auto-fitted exactly like a cube.
 *
 * **No left/right variants (E1):** `"arm"` is *both* arms, `"hand"` both hands.
 */
export type PosePartId = "head" | "torso" | "arm" | "leg" | "hand";

/**
 * The reference solids the rail offers: the three primitives (MASTER D1), the
 * whole mannequin (D3), and each of its parts (E1).
 *
 * `"mannequin"` is the *whole* figure — the rail labels it **Full** — and is
 * what the old `PoseFraming` called `"full"`. The five part ids are spelled
 * identically to their old framing names, so a stale session value for a body
 * part still resolves to the same body part; only `"full"` has no counterpart.
 */
export type PoseMeshId =
  | "cube"
  | "sphere"
  | "cylinder"
  | "mannequin"
  | PosePartId;

/** Camera projection (MASTER D14). */
export type PoseProjection = "perspective" | "orthographic";

/** The named camera angles for common pixel-game perspectives (MASTER D14). */
export type PoseCameraPreset = "2d" | "2.5d" | "iso" | "top-down" | "oblique";

/** A 3-component vector: euler radians for rotation, a direction for light. */
export interface PoseVector {
  x: number;
  y: number;
  z: number;
}

/**
 * The resolved contents of a camera preset — **a whole scene state** (plan 08,
 * **F7**).
 *
 * ⚠️ **Structurally identical to `ui/canvas/pose/poseCamera.ts`'s
 * `PoseCameraPresetSpec`**, and declared here for the same boundary reason as
 * the unions above: `stores/**` may not import from `ui/`, type-only included.
 * `poseCamera.ts` owns the *values*; this declares only the *shape* the store
 * needs to apply them. The container reads the spec through `getCameraPreset()`
 * and hands it straight to {@link PoseUIStore.applyCameraPreset} with no cast
 * and no adapter — the two are assignable because TypeScript is structural.
 *
 * **If a field is added there, add it here in the same commit.** The spec
 * carries `label` too; it is deliberately absent from this shape because a
 * label is a rail concern and the store has no use for one — the wider type is
 * assignable to the narrower, so nothing breaks at the seam.
 */
export interface PoseCameraPresetApplication {
  id: PoseCameraPreset;
  projection: PoseProjection;
  pitch: number;
  yaw: number;
  fov: number;
  rotation: PoseVector;
  clipPolicy: "fit";
}

/** Screen-space pan of the model within the frame, in grid cells. */
export interface PosePan {
  x: number;
  y: number;
}

/* ── defaults ───────────────────────────────────────────────────────────────
 *
 * Frozen module constants, not factory functions: every field is replaced
 * wholesale and never mutated, so one shared immutable instance per default is
 * both safe and lets `clear()` restore identity as well as value.
 */

/** No rotation — the mesh sits in its authored orientation. */
export const DEFAULT_POSE_ROTATION: PoseVector = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * A conventional key light: up, to the left, and towards the viewer. Stored
 * normalised so the shader never has to renormalise a drifting vector.
 */
export const DEFAULT_POSE_LIGHT_DIRECTION: PoseVector = Object.freeze(
  normalizeVector({ x: -0.5, y: 0.7, z: 1 }),
);

/** White key light. */
export const DEFAULT_POSE_LIGHT_COLOR: Color = Object.freeze({
  r: 255,
  g: 255,
  b: 255,
  a: 255,
});

/** A mid grey model reads its own shading most legibly. */
export const DEFAULT_POSE_MODEL_COLOR: Color = Object.freeze({
  r: 160,
  g: 160,
  b: 160,
  a: 255,
});

/**
 * Centred. Reset by a mesh change, preserved across a resize (MASTER D7).
 *
 * ⚠️ **Pan is never clamped** (MASTER E13). The owner asked for "free movement
 * even off canvas", so a pan that carries the model entirely outside the frame
 * is INTENTIONAL and must not be bounded — not here, not in `setPan`, not in
 * `nudgePan`. The only thing that ever resets it is a new mesh.
 */
export const DEFAULT_POSE_PAN: PosePan = Object.freeze({ x: 0, y: 0 });

/**
 * Model-scale **safety floor** — deliberately NOT a range (MASTER E11).
 *
 * ⚠️ **Renamed AND re-meant on 2026-09-04 (plan 08, F6).** This was
 * `POSE_ZOOM_MIN_SAFE`, the floor on a *camera* multiplier that divided the
 * frustum. `scale` is now a multiplier on the **model's own transform about
 * its own origin** — `root.scale.setScalar(...)` in `CanvasContainer` — and
 * the camera holds still (F4). The number is unchanged; what it guards is not.
 *
 * There used to be a `POSE_ZOOM_MAX = 10` alongside it, and it was the thing
 * the owner hit: it capped how large the model could be drawn. It is gone, and
 * `scale` is unbounded above — any positive finite number is stored verbatim.
 *
 * A floor still exists, and the reason is categorically different from a cap. A
 * cap is a taste judgement about how big is useful; a floor is arithmetic. A
 * scale of `0` collapses the model to a point and makes its normal matrix
 * singular, and a negative value MIRRORS it, flipping the geometry and
 * inverting its normals so the lighting reads inside-out. Neither is a view the
 * owner could have asked for, so both are treated as bad input and floored
 * rather than honoured.
 *
 * `1e-3` is chosen to be far below any useful view (at 0.001x a 32-px sprite is
 * a fraction of one pixel) so it never acts as a limit in practice — it only
 * catches values that would break the render.
 */
export const POSE_SCALE_MIN_SAFE = 1e-3;

/** FOV clamp, in degrees. Outside this the perspective camera degenerates. */
export const POSE_FOV_MIN = 10;
export const POSE_FOV_MAX = 120;

/**
 * Outline thickness range, in **whole rendered pixels** (MASTER E4).
 *
 * ⚠️ **Mirrors `ui/components/PosePanel/PoseSection.tsx`'s
 * `POSE_EDGE_WIDTH_MIN` / `POSE_EDGE_WIDTH_MAX`**, which the rail's slider
 * uses as its `min`/`max`. They are duplicated for the same boundary reason
 * the unions are, and must change together.
 *
 * `0` **is** the off state rather than a separate toggle: one control cannot
 * disagree with itself, whereas a toggle plus a slider can be "on" at width 0.
 * The rail reads 0 as **"Off"**.
 *
 * The maximum is 4 because at the 1:1 render target (D5) the outline dilates
 * the silhouette by whole art pixels, and on a 32-px sprite a 5-px border is
 * already most of the model. `poseOutline.ts` keeps its own, far larger
 * `MAX_OUTLINE_WIDTH = 64` safety clamp; that is a hang guard, not the UI
 * range, and the two are deliberately different numbers.
 */
export const POSE_EDGE_WIDTH_MIN = 0;
export const POSE_EDGE_WIDTH_MAX = 4;

/**
 * The outline is **OFF by default** (MASTER E4) — and this specific `0` is
 * load-bearing.
 *
 * The pose tool shipped without an outline, so any non-zero default would put
 * an edge around the reference of every existing project the first time its
 * owner opened the tool after this change, unbidden and with no way to
 * attribute it. Zero means the tool behaves exactly as it did until the owner
 * drags the slider.
 */
export const DEFAULT_POSE_EDGE_WIDTH = 0;

/**
 * Unit-length copy of `v`, or the input's components unchanged when it has no
 * length (there is no meaningful direction to pick for a zero vector, and
 * dividing by zero would poison the render with `NaN`).
 */
function normalizeVector(v: PoseVector): PoseVector {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length === 0) return { x: v.x, y: v.y, z: v.z };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * `value` clamped into `[min, max]`. `NaN` falls back to `min` — it has no
 * ordering, so `Math.min`/`Math.max` would propagate it straight through into
 * the render and produce a blank frame. Infinities clamp normally.
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * `value` as a usable model-scale multiplier: any positive finite number is
 * returned UNCHANGED — there is no upper bound (MASTER E11) — and anything the
 * render cannot use falls back to `floor`.
 *
 * This replaces `clamp()` for scale, and the difference in how it treats
 * infinity is the point. `clamp()` deliberately lets `±Infinity` settle on
 * whichever bound it runs into and reserves the `min` fallback for `NaN`, which
 * has no ordering and would otherwise propagate straight through into the
 * render (that reasoning still stands, and `setFov` still relies on it — FOV
 * has a real maximum for `+Infinity` to land on). Scale no longer has an upper
 * bound for `+Infinity` to clamp to, so it cannot be handled by ordering at
 * all: `Infinity` must be rejected outright, because a non-finite transform
 * produces `NaN` matrices exactly as `NaN` itself would. Hence one predicate,
 * `Number.isFinite`, which rejects `NaN` and both infinities together, and a
 * separate `> 0` test for zero and negatives.
 */
function sanitizeScale(value: number, floor: number): number {
  if (!Number.isFinite(value) || value <= 0) return floor;
  return Math.max(floor, value);
}

export class PoseUIStore {
  /** Which reference solid is loaded, or `null` for "no model" (the default). */
  meshId: PoseMeshId | null = null;

  /**
   * Outline thickness in whole rendered pixels; `0` means **no outline**
   * (MASTER E4). Clamped to `[POSE_EDGE_WIDTH_MIN, POSE_EDGE_WIDTH_MAX]` and
   * rounded to an integer on write.
   *
   * ⚠️ Session-only like every other field here — see the header. The outline
   * is a *reference* affordance over the artwork, not part of the document,
   * and adding it to `toPersistedUIState()` would change the wire format
   * across the owner's 151-snapshot corpus (MASTER D6).
   */
  edgeWidth = DEFAULT_POSE_EDGE_WIDTH;

  /** Model orientation, euler radians. `observableRef`. */
  rotation: PoseVector = DEFAULT_POSE_ROTATION;

  /** Key-light direction, normalised on write. `observableRef`. */
  lightDirection: PoseVector = DEFAULT_POSE_LIGHT_DIRECTION;

  /** Key-light colour. `observableRef`. */
  lightColor: Color = DEFAULT_POSE_LIGHT_COLOR;

  /** Base colour of the model's material. `observableRef`. */
  modelColor: Color = DEFAULT_POSE_MODEL_COLOR;

  /** Perspective or orthographic. Set directly, or via a preset. */
  projection: PoseProjection = "perspective";

  /**
   * The named camera angle.
   *
   * ⚠️ Since plan 08 (**F7**) applying a preset sets **every camera field and
   * the model's `rotation`** — see {@link applyCameraPreset}. `scale` and `pan`
   * are the two deliberate exceptions.
   */
  cameraPreset: PoseCameraPreset = "2.5d";

  /**
   * The model's **own** scale multiplier, about its own origin (plan 08, F6).
   *
   * ⚠️ This is a MODEL transform, not a camera setting. The container writes it
   * as `root.scale.setScalar(...)`; the camera does not move for it (F4).
   * Unbounded above; only floored at `POSE_SCALE_MIN_SAFE` (MASTER E11).
   *
   * The auto-fit COMPOSES with it rather than replacing it: the container
   * multiplies this by the fit's solved scale, so a fit re-frames the model
   * while leaving the owner's own scaling intact.
   */
  scale = 1;

  /** Field of view in degrees; ignored while `projection` is orthographic. */
  fov = 50;

  /**
   * Screen-space offset of the model, in grid cells. `observableRef`.
   *
   * **Never clamped** — the model may be dragged completely off canvas
   * (MASTER E13). See `DEFAULT_POSE_PAN`.
   */
  pan: PosePan = DEFAULT_POSE_PAN;

  /**
   * Monotonic counter of "please re-fit the model to the canvas" requests
   * (MASTER E14) — the seam behind the rail's **Fit to canvas** button.
   *
   * The store only records THAT a fit was asked for; it holds no opinion on
   * what fitting means. The container watches this number and does the framing,
   * because the fit depends on the mesh's bounds and the render target's size,
   * neither of which lives here.
   *
   * A counter rather than a boolean or a flag so that two consecutive presses
   * are two distinguishable events: a boolean set twice is indistinguishable
   * from set once, and a MobX reaction on it would fire only for the first.
   * Never reset — see `clear()`.
   */
  fitGeneration = 0;

  constructor() {
    makeObservable(this, {
      meshId: observable,
      edgeWidth: observable,
      rotation: observableRef,
      lightDirection: observableRef,
      lightColor: observableRef,
      modelColor: observableRef,
      projection: observable,
      cameraPreset: observable,
      scale: observable,
      fov: observable,
      pan: observableRef,
      fitGeneration: observable,

      hasMesh: computed,

      setMesh: action,
      setEdgeWidth: action,
      setRotation: action,
      setLightDirection: action,
      setLightColor: action,
      setModelColor: action,
      setProjection: action,
      setCameraPreset: action,
      applyCameraPreset: action,
      setScale: action,
      setFov: action,
      setPan: action,
      nudgePan: action,
      requestFit: action,
      clear: action,
    });
  }

  /** Whether anything is loaded — the overlay paints nothing when false. */
  get hasMesh(): boolean {
    return this.meshId !== null;
  }

  /**
   * Load (or unload, with `null`) a reference solid.
   *
   * Resets `pan`: a different mesh has a different bounding box, so an
   * inherited pan would push it off-frame (MASTER D7). Rotation, light and
   * camera are deliberately KEPT — they are the owner's working setup.
   *
   * ⚠️ `edgeWidth` is also KEPT. It is an outline preference, not a property
   * of the mesh, and having it snap back to Off on every part button would
   * make comparing two parts with the same outline impossible.
   */
  setMesh(meshId: PoseMeshId | null): void {
    this.meshId = meshId;
    this.pan = DEFAULT_POSE_PAN;
  }

  /**
   * Outline thickness in whole pixels, clamped to
   * `[POSE_EDGE_WIDTH_MIN, POSE_EDGE_WIDTH_MAX]` and **rounded to an integer**
   * (MASTER E4). `0` turns the outline off.
   *
   * Rounded here as well as in the rail because the store is the guarantee and
   * the slider is only the affordance: `poseOutline.ts` floors whatever it is
   * given, so a stored `1.9` would silently draw a 1-px outline while every
   * readout said 2. `clamp()` sends `NaN` to the minimum, which is the off
   * state — the safe direction for a mis-parsed input.
   */
  setEdgeWidth(width: number): void {
    this.edgeWidth = Math.round(
      clamp(width, POSE_EDGE_WIDTH_MIN, POSE_EDGE_WIDTH_MAX),
    );
  }

  /** Replaces the vector wholesale — never edits the held object. */
  setRotation(rotation: PoseVector): void {
    this.rotation = { x: rotation.x, y: rotation.y, z: rotation.z };
  }

  /** Normalised on write, so readers never have to. Wholesale replacement. */
  setLightDirection(direction: PoseVector): void {
    this.lightDirection = normalizeVector(direction);
  }

  setLightColor(color: Color): void {
    this.lightColor = { r: color.r, g: color.g, b: color.b, a: color.a };
  }

  setModelColor(color: Color): void {
    this.modelColor = { r: color.r, g: color.g, b: color.b, a: color.a };
  }

  setProjection(projection: PoseProjection): void {
    this.projection = projection;
  }

  /**
   * Record the preset id and **nothing else**.
   *
   * ⚠️ **This is the low-level setter, and it is NOT what a preset button
   * calls** — see {@link applyCameraPreset}, which is the F7 action. This one
   * survives for the cases that genuinely only want the id: restoring a
   * session, and any future caller that has already written the other fields
   * itself. Calling this from a button would reproduce exactly the "the preset
   * only half-applies" behaviour F7 exists to remove.
   */
  setCameraPreset(preset: PoseCameraPreset): void {
    this.cameraPreset = preset;
  }

  /**
   * Apply a whole camera preset — **every camera field AND the model's
   * rotation — as ONE action** (plan 08, **F7**).
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ A PRESET OVERWRITES THE MODEL'S ROTATION. THAT IS THE FEATURE.
   * ══════════════════════════════════════════════════════════════════════
   *
   * **The owner's words:** *"The camera preset buttons: these should CHANGE
   * all of the other settings that can be used for the camera."* Pressing one
   * puts the scene into a fully known, reproducible state rather than into
   * "the preset's angle, on top of whatever the orb was left at".
   *
   * ⚠️ **F7 supersedes plan 06's D14** ("a preset overrides the projection").
   * D14 was kept by owner decision on 2026-09-03, *before* F7 existed; F7
   * subsumes it because a preset now owns projection **and** every other
   * camera field **and** the rotation. Recorded in plan 08's `HANDOFF.md` —
   * D14 was not dropped by accident.
   *
   * ## Why ONE action and not five setter calls
   *
   * Every write here is inside a single MobX action, so all six fields change
   * in **one** transaction: reactions and `observer` components see the
   * finished state exactly once. Five separate calls from the container would
   * be five observable writes, and any reaction reading two of them would run
   * against a torn intermediate — a camera briefly holding the new projection
   * with the old rotation is a real frame, not a theoretical one, and the
   * container's fit effect reads several of these together.
   *
   * ## ⚠️ `scale` and `pan` are deliberately NOT touched
   *
   * Decided 2026-09-04, plan 08 open question 1. Neither is a camera setting
   * after tasks 03/04 — `scale` is a **model** transform (F6) and `pan` is
   * *framing* rather than orientation — and a preset restores **which way the
   * scene points**, not where the owner has parked it or how close in they are
   * working. Losing your zoom on every angle change is hostile; losing your
   * angle is what you asked for. Full reasoning lives next to
   * `PoseCameraPresetSpec` in `ui/canvas/pose/poseCamera.ts`, with the
   * counter-argument stated in case this is ever revisited.
   *
   * `fov` is clamped and `rotation` is copied wholesale, exactly as the
   * individual setters do — a preset must not be able to store a value the
   * setters would have rejected, or a preset press would be the one way to get
   * an out-of-range FOV into the store.
   */
  applyCameraPreset(preset: PoseCameraPresetApplication): void {
    this.cameraPreset = preset.id;
    this.projection = preset.projection;
    this.fov = clamp(preset.fov, POSE_FOV_MIN, POSE_FOV_MAX);
    // ⚠️ Copied, never held by reference: `rotation` is an `observableRef`
    // whose contract is wholesale replacement with a plain object, and the
    // preset table's vectors are shared module constants. Storing one directly
    // would let any future in-place edit of the store's rotation corrupt the
    // preset table itself.
    this.rotation = {
      x: preset.rotation.x,
      y: preset.rotation.y,
      z: preset.rotation.z,
    };
    // `pitch`, `yaw` and `clipPolicy` are consumed by the CONTAINER's fit —
    // they are properties of the preset, not store fields, and re-declaring
    // them here would create a second source of truth for the camera's angles.
    // The container re-resolves them from `cameraPreset` (the id it just got),
    // which is why the id is written first.
  }

  /**
   * Store any positive finite scale verbatim — **there is no upper bound**
   * (MASTER E11). `NaN`, `±Infinity`, zero and negatives fall back to
   * `POSE_SCALE_MIN_SAFE`; see `sanitizeScale` for why that is a safety floor
   * and not the old range's `min`.
   *
   * ⚠️ **Plan 08 (F6) closed the loop this comment used to say was open.** The
   * refinements plan noted that unclamping here was "necessary but not
   * sufficient", because the container folded the multiplier into the fit's
   * padding and the fit kept re-normalising it. That fold is gone: `scale` is
   * now applied to the MODEL (`root.scale.setScalar`) and the camera holds
   * still, so what is stored here is what the owner sees.
   */
  setScale(scale: number): void {
    this.scale = sanitizeScale(scale, POSE_SCALE_MIN_SAFE);
  }

  /** Clamped to `[POSE_FOV_MIN, POSE_FOV_MAX]` degrees. */
  setFov(fov: number): void {
    this.fov = clamp(fov, POSE_FOV_MIN, POSE_FOV_MAX);
  }

  /**
   * Absolute pan, in grid cells. Wholesale replacement.
   *
   * Deliberately **unclamped** (MASTER E13): the model is allowed to sit
   * entirely off canvas, so no bound is applied to either axis. Do not add one.
   */
  setPan(pan: PosePan): void {
    this.pan = { x: pan.x, y: pan.y };
  }

  /**
   * Relative pan — the drag path's per-sample update. Wholesale replacement.
   *
   * Also **unclamped** (MASTER E13): a drag may carry the model off canvas and
   * keep going, and dragging back must retrace the same path — which a clamp
   * would break by discarding the overshoot.
   */
  nudgePan(dx: number, dy: number): void {
    this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
  }

  /**
   * Ask for the model to be re-fitted to the canvas at the **current** camera
   * settings (MASTER E14/E15) — the rail's "Fit to canvas" button.
   *
   * ⚠️ This bumps the counter and does **nothing else**. It must never touch
   * `scale`, `pan`, `rotation`, `projection`, `cameraPreset` or `fov`: the whole
   * point is to re-frame at whatever the owner has already set up, so resetting
   * any of them here would defeat the feature. The container observes
   * `fitGeneration` and performs the framing.
   */
  requestFit(): void {
    this.fitGeneration += 1;
  }

  /**
   * Return every field to its default, including unloading the mesh. Called by
   * `ApplicationStore`'s `loadGeneration` reaction when a DIFFERENT project is
   * installed, and available to the rail as a "reset" affordance.
   *
   * ⚠️ **`fitGeneration` is deliberately NOT reset.** It is a monotonic event
   * counter, not a piece of state, and it is read by a reaction that treats
   * *any* change as "fit now". Setting it back to 0 would be a change like any
   * other, so clearing the pose would spuriously fire a fit — at the exact
   * moment the mesh has just been unloaded and there is nothing to fit. Leaving
   * it alone is what makes "a fit was requested" mean only that. Everything
   * else, `scale` included, returns to its default.
   */
  clear(): void {
    this.meshId = null;
    this.edgeWidth = DEFAULT_POSE_EDGE_WIDTH;
    this.rotation = DEFAULT_POSE_ROTATION;
    this.lightDirection = DEFAULT_POSE_LIGHT_DIRECTION;
    this.lightColor = DEFAULT_POSE_LIGHT_COLOR;
    this.modelColor = DEFAULT_POSE_MODEL_COLOR;
    this.projection = "perspective";
    this.cameraPreset = "2.5d";
    this.scale = 1;
    this.fov = 50;
    this.pan = DEFAULT_POSE_PAN;
  }
}
