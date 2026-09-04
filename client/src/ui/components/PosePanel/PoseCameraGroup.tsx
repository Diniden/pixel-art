/**
 * PoseCameraGroup — the Pose rail's Camera controls (plan 08 task 08,
 * 2026-09-04).
 *
 * PURE. No store, no MobX, no API, no `services/` — not even as a type. Props
 * in, callbacks out, exactly like the `PoseSection` it was cut out of.
 *
 * ## ⚠️ Why this file exists: `PoseSection.tsx` ran out of budget
 *
 * `max-lines` is an **error** (not a warning) under `src/ui/**` at 400 code
 * lines, deliberately: *"a presentational component that needs 400 lines is
 * almost always several components"*. `PoseSection.tsx` sat at **399 of 400**
 * after plan 08 task 07 — measured, one line of headroom — and this task had
 * to mount two more surfaces into it (the advanced camera panel and the saved
 * scene presets). Padding comments to squeeze under the limit would have been
 * the letter of the rule against its point.
 *
 * ⚠️ **The cut is along a real seam, not an arbitrary line count.** Everything
 * here is a property of the CAMERA — projection, the named angles, the model's
 * scale relative to it, the lens, the fit, and the exact frustum values — and
 * nothing here reads the mesh, the light, the colours or the outline. The
 * group renders one `.pose-panel__group`, which is exactly what it replaced in
 * the parent, so the rail's markup is unchanged.
 *
 * ⚠️ **The one thing that IS shared with the parent** is
 * `POSE_SCALE_SLIDER_MIN` / `POSE_SCALE_SLIDER_MAX`. They stay exported from
 * `PoseSection.tsx` and are imported here rather than re-declared: the story
 * and the DOM tests already read them from there, and a second copy of the
 * scale travel is precisely the kind of drift the plan's alignment guide warns
 * about.
 *
 * ## The advanced panel is MOUNTED here, and FULLY wired — read this
 *
 * `CameraAdvanced` (task 06) is rendered at the bottom of this group. Its
 * `onSaveAsPreset` is live: it saves a whole scene preset, which is what the
 * owner asked the advanced panel to be able to do (*"save that matrix into a
 * preset I can select"*).
 *
 * ⚠️ **`onChange` reached only `fov` between tasks 08 and 09 (D08-16), and it
 * now reaches all six fields.** The history is worth keeping, because it
 * explains the shape: `near`, `far`, the orthographic box and the aspect ratio
 * are **not** store fields — `CanvasContainer` DERIVES all four inside its fit
 * effect on every run — so there was nowhere to write them. Task 09 added the
 * seam: `pose.cameraOverrides` holds what was typed, and it is applied **on
 * top of the fit's output** in both the container's effect and the panel
 * container's display mirror.
 *
 * **That ordering is the point.** Because the overrides go on last, a typed
 * value survives everything that re-runs the fit — Fit to canvas, a canvas
 * resize, a preset press, a projection change — instead of silently reverting
 * the moment the box lost focus. `onReset` is the deliberate way back to the
 * fitted frustum.
 */
import { POSE_CAMERA_PRESETS } from "../../canvas/pose/poseCamera";
import type { PoseCameraPresetSpec } from "../../canvas/pose/poseCamera";
import type {
  PoseCameraPreset,
  PoseProjection,
} from "../../canvas/pose/poseTypes";
import { CameraAdvanced } from "./CameraAdvanced";
import type {
  CameraAdvancedOrthographic,
  CameraAdvancedPatch,
  CameraAdvancedPerspective,
} from "./CameraAdvanced";
import {
  POSE_AXIS_SCALE_MAX,
  POSE_AXIS_SCALE_MIN,
  POSE_SCALE_SLIDER_MAX,
  POSE_SCALE_SLIDER_MIN,
} from "./PoseSection";

/**
 * The three proportion rows, as a table so the markup is written once.
 *
 * Labelled `X`/`Y`/`Z` to match the rotation orb's own axis labels — the
 * owner reads them as the same three axes, and they are.
 */
const AXIS_SCALE_ROWS = [
  { axis: "x", label: "X" },
  { axis: "y", label: "Y" },
  { axis: "z", label: "Z" },
] as const;
import "./PosePanel.css";

const PROJECTIONS: readonly { id: PoseProjection; label: string }[] = [
  { id: "perspective", label: "Perspective" },
  { id: "orthographic", label: "Orthographic" },
];

export interface PoseCameraGroupProps {
  projection: PoseProjection;
  cameraPreset: PoseCameraPreset;
  /**
   * The MODEL's scale multiplier, about its own origin (plan 08, F6).
   * **Unbounded above** (MASTER E11) — the store only floors it.
   */
  scale: number;
  /** Field of view in degrees. The store clamps it to 10–120. */
  fov: number;
  /** Whether anything is loaded — only Fit cares. */
  hasMesh: boolean;
  /** Near clip plane, for the advanced panel's display. */
  near: number;
  /** Far clip plane, for the advanced panel's display. */
  far: number;
  /** The orthographic frustum, when one is live. */
  orthographic?: CameraAdvancedOrthographic;
  /** The perspective lens, when one is live. */
  perspective?: CameraAdvancedPerspective;

  onSetProjection: (projection: PoseProjection) => void;
  /** ⚠️ Receives the resolved SPEC, not an id — plan 08 F7. */
  onApplyCameraPreset: (preset: PoseCameraPresetSpec) => void;
  onSetScale: (scale: number) => void;
  /** Per-axis proportions, each `0.001`..`1`. Replaced wholesale. */
  axisScale: { x: number; y: number; z: number };
  onSetAxisScale: (axisScale: { x: number; y: number; z: number }) => void;
  onSetFov: (fov: number) => void;
  onRequestFit: () => void;
  /** One advanced field edited to a finite, legal value. */
  onAdvancedChange: (patch: CameraAdvancedPatch) => void;
  /**
   * Discard every typed projection value and return to the fitted frustum.
   *
   * ⚠️ Optional because `CameraAdvanced` only renders its "Reset to fitted"
   * button when it is supplied — a button that cannot reset anything is worse
   * than no button. The container always supplies it.
   */
  onAdvancedReset?: () => void;
  /** Save the whole scene under a name — see the header. */
  onSaveAsPreset: (name: string) => void;
}

export function PoseCameraGroup({
  projection,
  cameraPreset,
  scale,
  axisScale,
  fov,
  hasMesh,
  near,
  far,
  orthographic,
  perspective,
  onSetProjection,
  onApplyCameraPreset,
  onSetScale,
  onSetAxisScale,
  onSetFov,
  onRequestFit,
  onAdvancedChange,
  onAdvancedReset,
  onSaveAsPreset,
}: PoseCameraGroupProps) {
  /* An orthographic camera has no field of view. */
  const fovEnabled = projection === "perspective";
  const btn = (active: boolean) =>
    `pose-panel__btn${active ? " pose-panel__btn--active" : ""}`;

  return (
    <div className="pose-panel__group">
      <span className="pose-panel__group-label">Camera</span>
      <div className="pose-panel__buttons">
        {PROJECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={btn(projection === id)}
            onClick={() => onSetProjection(id)}
            title={`Use a ${label.toLowerCase()} camera`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pose-panel__buttons">
        {POSE_CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={btn(cameraPreset === preset.id)}
            /* ⚠️ Hands over the WHOLE preset (F7), not its id: pressing
               this sets projection, pitch, yaw, FOV, the clip policy AND
               the model's rotation, in one action. */
            onClick={() => onApplyCameraPreset(preset)}
            title={`${preset.label} — ${preset.projection}; sets the camera and the model's rotation`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="pose-panel__slider-row">
        <span className="pose-panel__slider-label">Scale</span>
        <input
          type="range"
          className="pose-panel__slider"
          aria-label="Scale"
          /* ⚠️ THE OLD `max={10}` IS GONE. It mirrored `POSE_ZOOM_MAX`,
             deleted because the owner reported the model capping out;
             leaving it here would have kept exactly that cap in the one
             place they touch it. A range input cannot be literally
             unbounded — it needs finite ends to have a thumb position — so
             the TRAVEL is widened to `POSE_SCALE_SLIDER_MAX` for the common
             case, and the number box beside it takes any value the store
             accepts, which per MASTER E11 is anything above
             `POSE_SCALE_MIN_SAFE` with NO ceiling. The slider is an
             affordance; it is not the limit. */
          min={POSE_SCALE_SLIDER_MIN}
          max={POSE_SCALE_SLIDER_MAX}
          step={0.1}
          value={Math.min(scale, POSE_SCALE_SLIDER_MAX)}
          onChange={(e) => onSetScale(Number(e.target.value))}
        />
        <input
          type="number"
          className="pose-panel__number"
          aria-label="Scale value"
          /* No `max`: this is the unbounded path (E11). `min` is the store's
             safety floor, not a cap. */
          min={POSE_SCALE_SLIDER_MIN}
          step={0.1}
          value={scale}
          onChange={(e) => {
            /* ⚠️ An EMPTY box must send nothing at all. A number input
               sanitises anything unparseable to `""`, and `Number("")` is
               `0` — not `NaN` — so a bare `Number.isFinite` guard would let
               a half-typed value collapse the camera to the store's safety
               floor mid-keystroke. Both cases are rejected here. */
            const raw = e.target.value.trim();
            if (raw === "") return;
            const next = Number(raw);
            if (Number.isFinite(next)) onSetScale(next);
          }}
          title="Model scale multiplier — type any value; there is no upper limit"
        />
      </div>

      {/*
        Per-axis PROPORTIONS (owner-requested 2026-09-04).

        ⚠️ These are a genuine `0.001`..`1` range, unlike Scale above, and the
        asymmetry is the point: Scale answers *how big* and is uncapped (E11),
        these answer *what shape* and can only squash. Keeping the ceiling at
        exactly 1 means the model's largest dimension stays governed by Scale
        alone, so the two controls can never fight over size.

        `step` is 0.001 — the range's own minimum — so the arrow keys can
        reach every value the store will store rather than quantising to a
        coarser grid than the field displays.
      */}
      {AXIS_SCALE_ROWS.map(({ axis, label }) => (
        <div className="pose-panel__slider-row" key={axis}>
          <span className="pose-panel__slider-label">{label}</span>
          <input
            type="range"
            className="pose-panel__slider"
            aria-label={`Scale ${label}`}
            min={POSE_AXIS_SCALE_MIN}
            max={POSE_AXIS_SCALE_MAX}
            step={0.001}
            value={axisScale[axis]}
            disabled={!hasMesh}
            onChange={(e) =>
              onSetAxisScale({ ...axisScale, [axis]: Number(e.target.value) })
            }
          />
          <input
            type="number"
            className="pose-panel__number pose-panel__number--angle"
            aria-label={`Scale ${label} value`}
            min={POSE_AXIS_SCALE_MIN}
            max={POSE_AXIS_SCALE_MAX}
            step={0.001}
            value={axisScale[axis]}
            disabled={!hasMesh}
            onChange={(e) => {
              /* Empty sends nothing — `Number("")` is `0`, which the store
                 would clamp to the floor and flatten the model mid-keystroke.
                 Same guard as the Scale box above. */
              const raw = e.target.value.trim();
              if (raw === "") return;
              const next = Number(raw);
              if (Number.isFinite(next)) {
                onSetAxisScale({ ...axisScale, [axis]: next });
              }
            }}
            title={`Scale along ${label} — ${POSE_AXIS_SCALE_MIN} to ${POSE_AXIS_SCALE_MAX}, squash only`}
          />
        </div>
      ))}

      <div className="pose-panel__slider-row">
        <span className="pose-panel__slider-label">FOV</span>
        <input
          type="range"
          className="pose-panel__slider"
          aria-label="Field of view"
          min={10}
          max={120}
          step={1}
          value={fov}
          disabled={!fovEnabled}
          onChange={(e) => onSetFov(Number(e.target.value))}
          title={
            fovEnabled
              ? "Field of view, in degrees"
              : "An orthographic camera has no field of view"
          }
        />
        <span className="pose-panel__slider-value">{Math.round(fov)}°</span>
      </div>

      {/* MASTER E14/E15 — a REQUEST, not a computation. The container reacts
          to the store's `fitGeneration` counter and does the framing; this
          button only asks. ⚠️ Since plan 08 (F4) the fit sets the MODEL's
          scale rather than moving the camera, so a press returns Scale to
          the fitted size — but it still does NOT touch the pan. */}
      <button
        type="button"
        className="pose-panel__btn"
        onClick={onRequestFit}
        disabled={!hasMesh}
        title={
          hasMesh
            ? "Return the model to the fitted size; the pan is left alone"
            : "Load a reference solid first"
        }
      >
        Fit to canvas
      </button>

      {/* ── Advanced camera mode (task 06, mounted here by task 08) ──────────
          F16: these fields ARE the projection matrix; there is no 16-float
          box, and the component says so on screen. Collapsed by default —
          the rail is 240px. ⚠️ All six fields reach the camera since task 09
          (D08-16); see this file's header for how, and for why they survive a
          re-fit. */}
      <CameraAdvanced
        projection={projection}
        near={near}
        far={far}
        orthographic={orthographic}
        perspective={perspective}
        onChange={onAdvancedChange}
        onSaveAsPreset={onSaveAsPreset}
        onReset={onAdvancedReset}
      />
    </div>
  );
}
