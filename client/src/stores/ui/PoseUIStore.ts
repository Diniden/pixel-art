/**
 * PoseUIStore — the pose tool's 3D reference state (pose-tool 2026-09-02,
 * task 02).
 *
 * The pose tool renders a reference solid — a primitive or the CC0 mannequin —
 * into an offscreen render target sized exactly `cellWidth × cellHeight` and
 * blits it onto an overlay canvas above every layer. This store is the one home
 * for everything that render is a function of: which mesh is loaded, how it is
 * framed, its rotation, the key light's direction and colour, the model colour,
 * the camera's projection / preset / zoom / FOV, and the screen-space pan.
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
 *   MobX proxy. The scalars (`zoom`, `fov`, `fitGeneration`) and the string
 *   unions are plain `observable`, which is safe: they are primitives.
 * - **Zoom and pan are free** (MASTER E11/E13, refinements 2026-09-03). `zoom`
 *   has no upper bound and `pan` has no bound at all — the model may be blown
 *   up far past the canvas and dragged completely off it. `fitGeneration` is
 *   the seam that brings it back: the rail bumps it, the container re-frames.
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
 * (task 03) declares structurally identical types, and `stores/**` may not
 * depend on a `ui/` module's landing order — nor may it import from `ui/` at
 * all under the boundary rule. The two sets are structurally identical, so no
 * cast is ever needed at the seam. `ReflectionUIStore` does exactly this for
 * `ReflectionLine`. `Color` IS imported: it is a domain type, not a `ui/` one.
 */

/** The reference solids the rail offers (MASTER D1/D3). */
export type PoseMeshId = "cube" | "sphere" | "cylinder" | "mannequin";

/**
 * Which region of the mannequin the camera frames (MASTER D4). The asset is
 * unrigged, so the "body part" buttons are framing presets over one mesh
 * rather than separate meshes. Primitives only ever use `"full"`.
 */
export type PoseFraming = "full" | "head" | "torso" | "arm" | "leg" | "hand";

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
 * Zoom **safety floor** — deliberately NOT a range (MASTER E11).
 *
 * There used to be a `POSE_ZOOM_MAX = 10` alongside this, and it was the thing
 * the owner hit: it capped how large the model could be drawn. It is gone, and
 * `zoom` is now unbounded above — any positive finite number is stored verbatim.
 *
 * A floor still exists, and the reason is categorically different from a cap. A
 * cap is a taste judgement about how big is useful; a floor is arithmetic. Zoom
 * multiplies a camera scale, so `0` collapses the projection to a point (a
 * degenerate frustum / zero-extent orthographic box, which renders nothing and
 * can divide by zero downstream) and a negative value MIRRORS it, flipping the
 * model and inverting its normals. Neither is a view the owner could have asked
 * for, so both are treated as bad input and floored rather than honoured.
 *
 * `1e-3` is chosen to be far below any useful view (at 0.001× a 32-px sprite is
 * a fraction of one pixel) so it never acts as a limit in practice — it only
 * catches values that would break the camera.
 */
export const POSE_ZOOM_MIN_SAFE = 1e-3;

/** FOV clamp, in degrees. Outside this the perspective camera degenerates. */
export const POSE_FOV_MIN = 10;
export const POSE_FOV_MAX = 120;

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
 * `value` as a usable zoom multiplier: any positive finite number is returned
 * UNCHANGED — there is no upper bound (MASTER E11) — and anything the camera
 * cannot use falls back to `floor`.
 *
 * This replaces `clamp()` for zoom, and the difference in how it treats
 * infinity is the point. `clamp()` deliberately lets `±Infinity` settle on
 * whichever bound it runs into and reserves the `min` fallback for `NaN`, which
 * has no ordering and would otherwise propagate straight through into the
 * render (that reasoning still stands, and `setFov` still relies on it — FOV
 * has a real maximum for `+Infinity` to land on). Zoom no longer has an upper
 * bound for `+Infinity` to clamp to, so it cannot be handled by ordering at
 * all: `Infinity` must be rejected outright, because a non-finite camera scale
 * produces `NaN` matrices exactly as `NaN` itself would. Hence one predicate,
 * `Number.isFinite`, which rejects `NaN` and both infinities together, and a
 * separate `> 0` test for zero and negatives.
 */
function sanitizeZoom(value: number, floor: number): number {
  if (!Number.isFinite(value) || value <= 0) return floor;
  return Math.max(floor, value);
}

export class PoseUIStore {
  /** Which reference solid is loaded, or `null` for "no model" (the default). */
  meshId: PoseMeshId | null = null;

  /** Which region the camera frames. Only meaningful for the mannequin. */
  framing: PoseFraming = "full";

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

  /** The named camera angle. A preset sets projection + angles, not zoom/pan. */
  cameraPreset: PoseCameraPreset = "2.5d";

  /**
   * Free scale multiplier applied on top of the auto-fit. Unbounded above;
   * only floored at `POSE_ZOOM_MIN_SAFE` (MASTER E11).
   */
  zoom = 1;

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
      framing: observable,
      rotation: observableRef,
      lightDirection: observableRef,
      lightColor: observableRef,
      modelColor: observableRef,
      projection: observable,
      cameraPreset: observable,
      zoom: observable,
      fov: observable,
      pan: observableRef,
      fitGeneration: observable,

      hasMesh: computed,

      setMesh: action,
      setFraming: action,
      setRotation: action,
      setLightDirection: action,
      setLightColor: action,
      setModelColor: action,
      setProjection: action,
      setCameraPreset: action,
      setZoom: action,
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
   * Resets `pan` and `framing`: a different mesh has a different bounding box,
   * so an inherited pan would push it off-frame and an inherited body-part
   * framing would be meaningless on a primitive (MASTER D7). Rotation, light
   * and camera are deliberately KEPT — they are the owner's working setup.
   */
  setMesh(meshId: PoseMeshId | null): void {
    this.meshId = meshId;
    this.framing = "full";
    this.pan = DEFAULT_POSE_PAN;
  }

  setFraming(framing: PoseFraming): void {
    this.framing = framing;
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
   * Pick a named angle. Only the id is stored — resolving it to a projection
   * and euler angles is `poseCamera.ts`'s job (task 06), which is pure and
   * lives under `ui/`. Zoom and pan are untouched (MASTER D14).
   */
  setCameraPreset(preset: PoseCameraPreset): void {
    this.cameraPreset = preset;
  }

  /**
   * Store any positive finite zoom verbatim — **there is no upper bound**
   * (MASTER E11). `NaN`, `±Infinity`, zero and negatives fall back to
   * `POSE_ZOOM_MIN_SAFE`; see `sanitizeZoom` for why that is a safety floor and
   * not the old range's `min`.
   *
   * ⚠️ Unclamping here is **necessary but not sufficient** for the owner's
   * complaint. Pose-tool task 08 folded zoom into `fitCameraToMesh`'s padding
   * instead of applying it as a separate camera scale, so the fit keeps
   * re-normalising whatever multiplier this stores. Separating the two is
   * MASTER E12, owned by task 06 in `poseCamera.ts` / `CanvasContainer.tsx` —
   * NOT fixable from this file.
   */
  setZoom(zoom: number): void {
    this.zoom = sanitizeZoom(zoom, POSE_ZOOM_MIN_SAFE);
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
   * `zoom`, `pan`, `rotation`, `projection`, `cameraPreset` or `fov`: the whole
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
   * else, `zoom` included, returns to its default.
   */
  clear(): void {
    this.meshId = null;
    this.framing = "full";
    this.rotation = DEFAULT_POSE_ROTATION;
    this.lightDirection = DEFAULT_POSE_LIGHT_DIRECTION;
    this.lightColor = DEFAULT_POSE_LIGHT_COLOR;
    this.modelColor = DEFAULT_POSE_MODEL_COLOR;
    this.projection = "perspective";
    this.cameraPreset = "2.5d";
    this.zoom = 1;
    this.fov = 50;
    this.pan = DEFAULT_POSE_PAN;
  }
}
