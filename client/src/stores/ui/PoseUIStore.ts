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
 *  ⚠️ EXACTLY ONE FIELD IS PERSISTED: `posePresets`. NOTHING HERE MAY BE DEEP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **This paragraph changed on 2026-09-04 (plan 08 task 08, F12) and the
 * change is narrow.** It used to read "nothing here is persisted", and for
 * every field except {@link PoseUIStore.posePresets} it still does.
 *
 * - **The LIVE pose is session-only.** `meshId`, `rotation`, `scale`, `pan`,
 *   `edgeWidth`, `projection`, `cameraPreset`, `fov`, `cameraOverrides`,
 *   `lightDirection`, `lightColor` and `modelColor` are **not** read by
 *   `UIStore.toPersistedUIState()` (`stores/ui/UIStore.ts`). That builder is
 *   an explicit field-by-field list and ABSENCE FROM IT IS THE MECHANISM.
 *   The pose was never asked to be saved (MASTER D6) — the model is not part
 *   of the document until it is stamped.
 * - **`posePresets` IS persisted**, because the owner asked for it directly:
 *   *"I want a way to save ALL orientations of camera settings and model to a
 *   preset that I can reload easily"* — and "reload" means across a restart,
 *   which session state cannot do. It follows the `layoutPresets` precedent
 *   piece for piece (`LayoutUIStore.ts:500-570` + `UIStore.ts`).
 * - ⚠️ **The key is emitted CONDITIONALLY, and that is a data-safety
 *   mechanism, not a tidiness one** (plan 08 **F13**).
 *   {@link PoseUIStore.toPersistedPosePresets} returns `undefined` for an
 *   empty list and the builder emits it through `assign()`. Measured: writing
 *   `posePresets: undefined` instead would ADD the key — "present with value
 *   undefined" is still a key to `Object.keys()` and to the corpus digest —
 *   and that form changed all 11 of the owner's corpus digests. The
 *   conditional form leaves every one of the 151 snapshots byte-identical.
 * - **No migration, and none is needed** (**F14**). Absent keys are handled
 *   by `?? default` on read, and the wire type
 *   (`types/domain.ts` `PersistedPosePreset`) is wide and optional in both
 *   directions.
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
 * ⚠️ **`clear()` MUST NOT touch `posePresets`, AND THE ORDER IS WHY** (plan
 * 08 task 08). On a real project load the sequence is
 * `installTree()` → `host.installProject()` → `ApplicationStore.adoptProject()`
 * → `ui.hydrate(uiState)` → **then** `loadGeneration += 1` → this store's
 * `clear()`. The clear therefore runs **after** the hydrate, so resetting the
 * presets there would wipe the presets the load had just restored, every
 * single time, and the bug would present as *"my presets do not survive a
 * reload"* — the exact thing the feature exists to do. The presets are
 * project data and their lifetime is owned by
 * {@link PoseUIStore.hydratePosePresets}, which is assigned UNCONDITIONALLY
 * so absent-stays-absent and a project switch cannot carry one project's
 * presets into another. `fitGeneration` is excluded from `clear()` for a
 * different reason; see its own note.
 *
 * Construction order is unconstrained: no dependencies in either direction,
 * exactly like `ReflectionUIStore` and `CanvasViewsUIStore`.
 */
import { action, computed, makeObservable, observable, observableRef } from "mobx";
import type { Color, PersistedPosePreset } from "@/types/domain";

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

/**
 * The projection values the owner has typed **exactly** (owner item 8, **F16**;
 * closes **D08-16**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ A SPARSE OVERRIDE LAYER. ABSENT MEANS "LET THE FIT DERIVE IT".
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Structurally identical to `ui/canvas/pose/poseCamera.ts`'s
 * `PoseCameraOverrides`**, and declared here for the same boundary reason as
 * {@link PoseCameraPresetApplication} above: `stores/**` may not import from
 * `ui/`, type-only included. **If a field is added there, add it here in the
 * same commit** — the container hands this value straight to
 * `applyCameraOverrides` with no cast and no adapter, and only structural
 * typing makes that seam free.
 *
 * **Why a store field at all (the D08-16 story).** `near`, `far`, the ortho box
 * and the aspect ratio are **not** camera settings the way `fov` is — they are
 * *derived* by `fitCameraToMesh` on every run. Task 08 could therefore mount
 * the advanced panel but not honour it: four of its five keys were accepted and
 * silently dropped. This field is the missing seam. The fit still derives the
 * defaults; these are applied **on top of the fit's output**, which is exactly
 * what makes a typed value **survive a re-fit** — Fit to canvas, a resize, a
 * preset press and a projection change all recompute the derived numbers and
 * then re-apply these, so the owner's typed value stands until they clear it.
 * Reverting it silently would be worse than not accepting it at all.
 *
 * ⚠️ **`fov` is deliberately NOT here**: it is a real store field with its own
 * `setFov` and its own clamp, and it reaches the fit as an *input*. Two paths
 * to one number is how they drift. ⚠️ **`position` and `target` are not here
 * either**: they belong to the fit (F4 — the camera holds still) and to the pan
 * (F3 — a camera-space translation), and an override on either would be a third
 * writer of the camera's placement, fighting both.
 *
 * **Session-only**, like every pose field but `posePresets`. The persistence
 * path for an exact frustum is a **saved preset**, not this — see the panel's
 * "Save as preset" button, whose whole purpose is to make a hand-typed camera
 * outlive the session.
 */
export interface PoseCameraOverrideValues {
  near?: number;
  far?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  aspect?: number;
}

/** No overrides — every projection value comes from the fit. */
export const DEFAULT_POSE_CAMERA_OVERRIDES: PoseCameraOverrideValues =
  Object.freeze({});

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

/**
 * Per-axis scale range — a REAL range, unlike {@link POSE_SCALE_MIN_SAFE}.
 *
 * ⚠️ The asymmetry with `scale` is deliberate. `scale` is floored but never
 * capped (MASTER E11) because it answers *how big*; `axisScale` answers *what
 * shape* and the owner asked for `0.001 - 1`. A maximum of exactly 1 means an
 * axis can only ever squash, never stretch — so the model's largest dimension
 * stays governed by `scale` alone and the two controls cannot fight over size.
 *
 * The minimum matches `POSE_SCALE_MIN_SAFE` for the same reason it exists: an
 * axis at 0 collapses the model into a plane and makes its normal matrix
 * singular, which renders black rather than erroring.
 */
export const POSE_AXIS_SCALE_MIN = 1e-3;
export const POSE_AXIS_SCALE_MAX = 1;

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

/* ── preset validators (plan 08, F15) ───────────────────────────────────────
 *
 * ⚠️ These are the ONE narrowing point between the wide wire format and this
 * store's unions. `PersistedPosePreset` is deliberately wide and every field
 * but `id`/`name` is optional, because a file on disk may have been written
 * by a newer build, hand-edited, or truncated — `types/` must never assume
 * the data matches the current build. The narrowing is here rather than in
 * `types/` for the same reason `LayoutUIStore.narrowPresets` is.
 *
 * ⚠️ Every one of them must survive `null`, `undefined`, a primitive where an
 * object was expected, and an object with the wrong member types, WITHOUT
 * throwing. `typeof null === "object"` is the trap they all guard first.
 */

/**
 * The mesh ids this build knows. ⚠️ **Mirrors `PoseMeshId` above and must
 * change with it** — a member added to the union and not here is silently
 * unloadable from a preset, which fails as "that one preset does not restore
 * its model" long after the union changed.
 */
const POSE_MESH_IDS: readonly string[] = [
  "cube",
  "sphere",
  "cylinder",
  "mannequin",
  "head",
  "torso",
  "arm",
  "leg",
  "hand",
];

/** ⚠️ Mirrors `PoseCameraPreset` above and must change with it. */
const POSE_CAMERA_PRESET_IDS: readonly string[] = [
  "2d",
  "2.5d",
  "iso",
  "top-down",
  "oblique",
];

function isPoseMeshId(value: unknown): value is PoseMeshId {
  return typeof value === "string" && POSE_MESH_IDS.includes(value);
}

function isPoseCameraPreset(value: unknown): value is PoseCameraPreset {
  return typeof value === "string" && POSE_CAMERA_PRESET_IDS.includes(value);
}

/**
 * A usable 3-component vector: an object with three FINITE numbers.
 *
 * Finiteness rather than merely `typeof === "number"` because `NaN` and the
 * infinities are what a hand-edited or truncated file produces, and either
 * one reaching `rotation` or `lightDirection` poisons the whole render with
 * `NaN` matrices — a blank frame with no error, which is the failure mode
 * this whole validator layer exists to prevent.
 */
function isVector(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as { x?: unknown; y?: unknown; z?: unknown };
  return (
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.z === "number" &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

/** A usable RGBA colour: four finite numbers. Range is not enforced — the
 *  engine clamps, and rejecting a `300` would lose a preset over a rounding
 *  artefact rather than over anything the owner would notice. */
function isColor(
  value: unknown,
): value is { r: number; g: number; b: number; a: number } {
  if (!value || typeof value !== "object") return false;
  const c = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown };
  return (
    typeof c.r === "number" &&
    typeof c.g === "number" &&
    typeof c.b === "number" &&
    typeof c.a === "number" &&
    Number.isFinite(c.r) &&
    Number.isFinite(c.g) &&
    Number.isFinite(c.b) &&
    Number.isFinite(c.a)
  );
}

/**
 * Narrow a loaded project's presets — the hydrate-side validator (F15).
 *
 * ⚠️ **Same field-by-field spirit as `LayoutUIStore.narrowPresets`: an entry
 * without a usable `id` and `name` is DROPPED, and everything else is
 * KEPT AS IT IS.** An entry is unusable in a keyed list without those two,
 * but a preset whose `fov` is nonsense is still the preset the owner named —
 * {@link PoseUIStore.applyPosePreset} validates each field at the moment it
 * is used and simply skips what it cannot use, which loses one setting rather
 * than the whole entry.
 *
 * ⚠️ **Unknown fields are preserved, deliberately.** A preset written by a
 * newer build carrying a field this one does not know must still be that
 * preset after a round trip through this build — dropping it would silently
 * downgrade the owner's file the first time an older version opened it. The
 * entries are therefore passed through rather than reconstructed.
 */
function narrowPosePresets(
  persisted: PersistedPosePreset[] | undefined,
): PersistedPosePreset[] {
  if (!Array.isArray(persisted)) return [];
  return persisted.filter(
    (preset): preset is PersistedPosePreset =>
      !!preset &&
      typeof preset === "object" &&
      typeof preset.id === "string" &&
      typeof preset.name === "string",
  );
}

/**
 * The next unused `pose-N` id. Transcribed from `customPresetId`
 * (`ui/layout/layoutPresets.ts:371-376`) — start past the current length and
 * walk until the id is free, so deleting the middle of a list cannot produce
 * a duplicate.
 */
function nextPosePresetId(existing: readonly PersistedPosePreset[]): string {
  const taken = new Set(existing.map((preset) => preset.id));
  let n = existing.length + 1;
  while (taken.has(`pose-${n}`)) n += 1;
  return `pose-${n}`;
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

  /**
   * Per-axis scale, **composed on top of {@link scale}** — owner-requested
   * 2026-09-04.
   *
   * ⚠️ **This is a PROPORTION control, not a size control**, and that is why
   * its range is `POSE_AXIS_SCALE_MIN`..`1` while {@link scale} stays
   * unbounded above. The two answer different questions: `scale` is *how big
   * overall*, this is *what shape*. Folding them into one three-component
   * value would have put a ceiling of 1 back on the model's size — the exact
   * cap MASTER E11 removed after the owner reported the model capping out.
   *
   * The container writes the product per axis:
   * `root.scale.set(base * fit * scale * axis.x, ...y, ...z)`. At the default
   * `{1,1,1}` that is identical to the uniform `setScalar` it replaced, so a
   * model nobody has squashed renders exactly as before.
   *
   * `observableRef` and replaced **wholesale**, like `rotation` — a
   * per-component observable would make a slider drag notify three times.
   */
  axisScale: PoseVector = { x: 1, y: 1, z: 1 };

  /** Field of view in degrees; ignored while `projection` is orthographic. */
  fov = 50;

  /**
   * The projection values the owner typed **exactly** — the advanced camera
   * panel's other four keys (plan 08 task 09, closes **D08-16**).
   *
   * `observableRef` and **REPLACED WHOLESALE** on every edit, like `pan` and
   * `rotation`: it is a small plain record read as a unit by one effect, so
   * per-key proxies would buy nothing and a MobX proxy reaching
   * `applyCameraOverrides` would violate the same "pure numbers in" rule
   * `poseCamera.ts` is built on.
   *
   * ⚠️ **Sparse and additive: an absent key means "let the fit derive it",
   * never "reset it to zero".** {@link PoseUIStore.setCameraOverrides} merges
   * rather than replaces so the panel can send one key at a time, and
   * {@link PoseUIStore.clearCameraOverrides} is the only way back to the fitted
   * frustum — which is what the panel's "Reset to fitted" button calls.
   *
   * See {@link PoseCameraOverrideValues} for why this exists, why it survives a
   * re-fit, and why `fov`, `position` and `target` are deliberately absent.
   */
  cameraOverrides: PoseCameraOverrideValues = DEFAULT_POSE_CAMERA_OVERRIDES;

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

  /**
   * The owner's saved SCENE presets — **the one persisted field on this
   * store** (plan 08, **F12**; owner item 10).
   *
   * `observableRef` and REPLACED WHOLESALE on every edit, exactly like
   * `LayoutUIStore.layoutPresets`: per-entry proxies would buy nothing when
   * the array identity changes on every save and delete, and a `PoseVector`
   * inside a preset must never become a MobX proxy for the same reason the
   * live `rotation` must not.
   *
   * ⚠️ **Its wire key is CONDITIONAL and that is a data-safety mechanism**
   * (F13) — see {@link PoseUIStore.toPersistedPosePresets} and the file
   * header. ⚠️ **`clear()` does not reset it** — see the header's Lifetime
   * note for the load-order reason, which is not a nicety either.
   *
   * The stored entries are the WIDE wire type (`PersistedPosePreset`), not a
   * narrowed store type, so what is held is exactly what is written and a
   * preset from a newer build survives a round trip through an older one
   * unmangled. Narrowing happens where the values are USED
   * ({@link PoseUIStore.applyPosePreset}), never where they are stored.
   */
  posePresets: PersistedPosePreset[] = [];

  constructor() {
    makeObservable(this, {
      meshId: observable,
      edgeWidth: observable,
      rotation: observableRef,
      axisScale: observableRef,
      lightDirection: observableRef,
      lightColor: observableRef,
      modelColor: observableRef,
      projection: observable,
      cameraPreset: observable,
      scale: observable,
      fov: observable,
      cameraOverrides: observableRef,
      pan: observableRef,
      fitGeneration: observable,
      posePresets: observableRef,

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
      setAxisScale: action,
      setFov: action,
      setCameraOverrides: action,
      clearCameraOverrides: action,
      setPan: action,
      nudgePan: action,
      requestFit: action,
      saveCurrentAsPosePreset: action,
      deletePosePreset: action,
      applyPosePreset: action,
      hydratePosePresets: action,
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

  /**
   * Replace the per-axis scale **wholesale**, each component clamped into
   * `POSE_AXIS_SCALE_MIN`..`POSE_AXIS_SCALE_MAX`.
   *
   * `clamp`, not `sanitizeScale`: this one genuinely IS a range (see
   * {@link POSE_AXIS_SCALE_MIN}), so a value above 1 is the owner asking for
   * something the control does not offer and is pinned to the end of its
   * travel — where `scale` would have stored it verbatim. `clamp` maps `NaN`
   * to the minimum, which for a proportion means "flattest", so a `NaN`
   * reaching here is visible rather than silently rendering black.
   *
   * Wholesale replacement because the field is `observableRef` — a partial
   * write would leave the other two axes reading from a stale object.
   */
  setAxisScale(axisScale: PoseVector): void {
    this.axisScale = {
      x: clamp(axisScale.x, POSE_AXIS_SCALE_MIN, POSE_AXIS_SCALE_MAX),
      y: clamp(axisScale.y, POSE_AXIS_SCALE_MIN, POSE_AXIS_SCALE_MAX),
      z: clamp(axisScale.z, POSE_AXIS_SCALE_MIN, POSE_AXIS_SCALE_MAX),
    };
  }

  /** Clamped to `[POSE_FOV_MIN, POSE_FOV_MAX]` degrees. */
  setFov(fov: number): void {
    this.fov = clamp(fov, POSE_FOV_MIN, POSE_FOV_MAX);
  }

  /**
   * MERGE a sparse patch of exact projection values (D08-16).
   *
   * ⚠️ **Merge, not replace, and the difference is the whole contract.** The
   * advanced panel commits **one field at a time** (each `<input>` fires on its
   * own blur/enter), so a replacing setter would wipe the other five every time
   * a box was touched. A key present in `patch` wins; a key absent is left
   * exactly as it was.
   *
   * ⚠️ **A key set to `undefined` CLEARS that one field** back to the fit's
   * derived value — that is how a single box is emptied without disturbing its
   * neighbours. `Object.keys` on the patch is what distinguishes "absent" from
   * "explicitly undefined", so this cannot be simplified to a spread.
   *
   * **Non-finite values are rejected outright** rather than stored. A `NaN`
   * reaching a camera blanks the frame with no error and no console line; the
   * panel already refuses to emit one, and this is the belt to that braces.
   * `applyCameraOverrides` guards a third time, on read.
   *
   * ⚠️ **No clamping and no ordering repair happens here.** An inverted ortho
   * box is a legitimate request for a mirrored view, and `near`/`far` legality
   * depends on both values at once — repairing one against a stale other would
   * fight the owner's own typing. The invariants are restored where they are
   * consumed (`applyCameraOverrides`), which is also where a preset written by
   * a newer build (F15) arrives.
   */
  setCameraOverrides(patch: PoseCameraOverrideValues): void {
    const next: PoseCameraOverrideValues = { ...this.cameraOverrides };
    for (const key of Object.keys(patch) as (keyof PoseCameraOverrideValues)[]) {
      const value = patch[key];
      if (value === undefined) {
        delete next[key];
      } else if (Number.isFinite(value)) {
        next[key] = value;
      }
    }
    this.cameraOverrides = next;
  }

  /**
   * Drop every typed value and return to the fitted frustum — the panel's
   * "Reset to fitted" button (task 06's `onReset`).
   *
   * Restores the frozen default by identity as well as by value, so a `===`
   * check against {@link DEFAULT_POSE_CAMERA_OVERRIDES} is a valid "untouched"
   * test, exactly as `clear()` relies on for the other defaults.
   */
  clearCameraOverrides(): void {
    this.cameraOverrides = DEFAULT_POSE_CAMERA_OVERRIDES;
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

  /* ══════════════════════════════════════════════════════════════════════
   *  SAVED SCENE PRESETS (plan 08 task 08, F12/F13/F15) — the persisted half
   *
   *  Mirrors `LayoutUIStore`'s `layoutPresets` surface piece for piece:
   *  save (trims, no-ops on empty, snapshots BY VALUE) · delete (filters,
   *  early-returns when nothing changed) · hydrate (assigned
   *  UNCONDITIONALLY) · serialize (returns `undefined` when empty — the F13
   *  mechanism). `applyPosePreset` has no `layoutPresets` counterpart and is
   *  the one addition: a layout preset is applied by a `ui/` module, a scene
   *  preset is applied to these very fields.
   * ══════════════════════════════════════════════════════════════════════ */

  /**
   * Keep the CURRENT scene under a user-typed name.
   *
   * The name is trimmed and an empty one is a **no-op**, not an error — the
   * `saveCurrentAsPreset` precedent (`LayoutUIStore.ts:500-513`). A rail
   * cannot usefully report a failure here and an unnamed preset is unusable
   * in a keyed list, so refusing quietly is the whole contract.
   *
   * ⚠️ **Snapshotted BY VALUE, not by reference.** `rotation`,
   * `lightDirection` and `lightColor` are `observableRef` values that are
   * replaced wholesale; storing the held object would make the preset follow
   * every later edit, which is the opposite of what a preset is. Each is
   * copied component by component.
   *
   * ⚠️ **`pan` is deliberately absent** — see `PersistedPosePreset`'s header
   * in `types/domain.ts` for that decision (open question 4) and for why
   * `scale` IS included even though a *camera* preset leaves it alone.
   *
   * `meshId` is omitted rather than written as `null` when nothing is loaded:
   * the wire type's fields are optional, and an absent key round-trips
   * through `?? default` identically while keeping the file smaller and the
   * "absent means unknown" rule uniform.
   */
  saveCurrentAsPosePreset(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: PersistedPosePreset = {
      id: nextPosePresetId(this.posePresets),
      name: trimmed,
      rotation: { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z },
      projection: this.projection,
      cameraPreset: this.cameraPreset,
      fov: this.fov,
      scale: this.scale,
      // Proportions are part of "the setup I saved" (open question 4's
      // reasoning): restoring the size but not the shape would hand back a
      // model the owner never saved.
      axisScale: {
        x: this.axisScale.x,
        y: this.axisScale.y,
        z: this.axisScale.z,
      },
      lightDirection: {
        x: this.lightDirection.x,
        y: this.lightDirection.y,
        z: this.lightDirection.z,
      },
      lightColor: {
        r: this.lightColor.r,
        g: this.lightColor.g,
        b: this.lightColor.b,
        a: this.lightColor.a,
      },
      edgeWidth: this.edgeWidth,
    };
    if (this.meshId !== null) preset.meshId = this.meshId;
    this.posePresets = [...this.posePresets, preset];
  }

  /**
   * Forget one saved scene. Filters by id and **early-returns when nothing
   * changed**, so deleting an unknown id is a harmless no-op that does not
   * churn the array identity — `deleteLayoutPreset`'s exact shape. That
   * matters beyond tidiness: a new identity would bump `persistedUIVersion`
   * and schedule a save for a change that did not happen.
   */
  deletePosePreset(id: string): void {
    const next = this.posePresets.filter((preset) => preset.id !== id);
    if (next.length === this.posePresets.length) return;
    this.posePresets = next;
  }

  /**
   * Restore a saved scene — **every field it carries, as ONE action**.
   *
   * ⚠️ **One action for the same reason `applyCameraPreset` is one**: nine
   * writes in a single MobX transaction means every reaction and `observer`
   * sees the finished scene exactly once. Nine separate setter calls from a
   * container would be nine observable writes, and `CanvasContainer`'s fit
   * effect reads several of these together — a camera holding the new
   * projection with the old rotation is a real frame, not a theoretical one.
   *
   * ⚠️ **THE NARROWING HAPPENS HERE, not on hydrate, and every field is
   * validated against the SETTERS' OWN RULES** (F15). The wire type is
   * deliberately wide, so a file may carry `fov: 1e9`, `scale: -1`,
   * `projection: "isometric"` or a mesh id this build has never heard of. A
   * preset must never be able to put a value into the store that the setter
   * for that field would have rejected — otherwise applying a preset becomes
   * the one way to get illegal state in. Anything unrecognised or unusable
   * leaves the current value **untouched** rather than resetting it to a
   * default: a preset from a newer build should restore what it can and
   * quietly skip the rest, which is what "a newer file must not crash an
   * older build" means in practice.
   *
   * An unknown `id` is a no-op.
   */
  applyPosePreset(id: string): void {
    const preset = this.posePresets.find((entry) => entry.id === id);
    if (!preset) return;

    if (isPoseMeshId(preset.meshId)) {
      // ⚠️ NOT `setMesh()` — that resets `pan` (MASTER D7), and a preset that
      // silently re-centred the model would fight the pan the owner has set.
      // The preset carries no pan (open question 4), so it changes none.
      this.meshId = preset.meshId;
    }
    if (isVector(preset.rotation)) {
      this.rotation = {
        x: preset.rotation.x,
        y: preset.rotation.y,
        z: preset.rotation.z,
      };
    }
    if (preset.projection === "perspective" || preset.projection === "orthographic") {
      this.projection = preset.projection;
    }
    if (isPoseCameraPreset(preset.cameraPreset)) {
      this.cameraPreset = preset.cameraPreset;
    }
    if (typeof preset.fov === "number") {
      this.fov = clamp(preset.fov, POSE_FOV_MIN, POSE_FOV_MAX);
    }
    if (isVector(preset.axisScale)) {
      // Through the action's clamp, not written raw: a preset from a newer
      // build may carry a component outside this build's range (F15).
      this.setAxisScale(preset.axisScale);
    }
    if (typeof preset.scale === "number") {
      this.scale = sanitizeScale(preset.scale, POSE_SCALE_MIN_SAFE);
    }
    if (isVector(preset.lightDirection)) {
      // Re-normalised exactly as `setLightDirection` would, so a hand-edited
      // or drifted vector in a file cannot reach the shader un-normalised.
      this.lightDirection = normalizeVector(preset.lightDirection);
    }
    if (isColor(preset.lightColor)) {
      this.lightColor = {
        r: preset.lightColor.r,
        g: preset.lightColor.g,
        b: preset.lightColor.b,
        a: preset.lightColor.a,
      };
    }
    if (typeof preset.edgeWidth === "number") {
      this.edgeWidth = Math.round(
        clamp(preset.edgeWidth, POSE_EDGE_WIDTH_MIN, POSE_EDGE_WIDTH_MAX),
      );
    }
  }

  /**
   * Adopt a loaded project's saved presets.
   *
   * ⚠️ **Assigned UNCONDITIONALLY**, exactly like `LayoutUIStore.hydrate`, and
   * that is what makes "absent stays absent" survive a project switch: a
   * project with no `posePresets` must hydrate to `[]` and must NOT inherit
   * the previously-loaded project's presets, or the next autosave would write
   * one project's presets into another's file.
   *
   * ⚠️ Called from `UIStore.hydrate`'s fan-out, which runs BEFORE the
   * `loadGeneration` reaction calls {@link PoseUIStore.clear} — see the file
   * header's Lifetime note for why `clear()` must therefore leave the presets
   * alone.
   */
  hydratePosePresets(ui: { posePresets?: PersistedPosePreset[] }): void {
    this.posePresets = narrowPosePresets(ui.posePresets);
  }

  /**
   * The persisted record for `UIStore.toPersistedUIState()`.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ `undefined` UNTIL THE USER SAVES ONE — THIS IS THE F13 MECHANISM
   * ══════════════════════════════════════════════════════════════════════
   *
   * This return value is the entire reason the owner's 151 backup snapshots
   * stay byte-identical. `toPersistedUIState()` emits the key through
   * `assign()`, which writes nothing for `undefined`, so a project in which
   * nobody has saved a pose preset gains **no key at all** — as opposed to
   * gaining `posePresets: undefined`, which measurably changed all 11 corpus
   * digests, because "present with value undefined" is still a key to
   * `Object.keys()` and to the digest.
   *
   * ⚠️ **Do not "simplify" this to return the array directly.** An empty
   * array is a value and would be emitted, adding a key to every one of the
   * owner's real projects the moment it was next saved. The
   * `toPersistedLayoutPresets()` precedent is identical and identically
   * load-bearing.
   */
  toPersistedPosePresets(): PersistedPosePreset[] | undefined {
    return this.posePresets.length > 0 ? this.posePresets : undefined;
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
    this.axisScale = { x: 1, y: 1, z: 1 };
    this.fov = 50;
    this.cameraOverrides = DEFAULT_POSE_CAMERA_OVERRIDES;
    this.pan = DEFAULT_POSE_PAN;
  }
}
