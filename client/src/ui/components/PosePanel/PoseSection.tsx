/**
 * PoseSection — the Pose tool's right-rail controls (pose-tool 2026-09-02,
 * task 07).
 *
 * PURE. Like every other module under `ui/`, this imports no store, no MobX
 * and no API: every value arrives as a prop and every interaction leaves as a
 * callback. `PixelStudioPanelContainer` is the single `observer()` seam that
 * reads `app.pose` and feeds this section, exactly as it already does for
 * `ReflectionLinesSection`.
 *
 * ## Six control groups, matching the request
 *
 * | Group        | Controls                                        | Store field           |
 * | ------------ | ----------------------------------------------- | --------------------- |
 * | Model        | Cube · Sphere · Cylinder · Mannequin             | `meshId`              |
 * | Framing      | Full · Head · Torso · Arm · Leg · Hand           | `framing`             |
 * | Rotation     | orb + Front/Back/Left/Right/Top/Bottom/¾         | `rotation`            |
 * | Light        | orb + colour                                     | `lightDirection/Color`|
 * | Model colour | colour                                           | `modelColor`          |
 * | Camera       | projection · 5 presets · zoom · FOV              | `projection` …        |
 *
 * ## Two disabled states, deliberately not hidden
 *
 * - **Framing is only meaningful for the mannequin** (MASTER D4: the asset is
 *   unrigged, so the "body part" buttons are camera framing over one mesh).
 *   For a primitive the six buttons are DISABLED rather than removed, so
 *   picking Cube after Mannequin does not make the rail jump by a row.
 * - **FOV is only meaningful in perspective.** Same reasoning; an orthographic
 *   camera has no field of view, and hiding the slider would shuffle the
 *   camera group every time the projection toggles.
 *
 * ## The angle tables are IMPORTED, never re-declared
 *
 * `POSE_CAMERA_PRESETS`, `POSE_VIEWPOINT_ROTATIONS` and `POSE_VIEWPOINT_ORDER`
 * come from `ui/canvas/pose/poseCamera.ts` (task 06). Two sources of truth for
 * the isometric angle is a guaranteed drift, and the buttons here and the
 * camera maths in task 08 must agree by construction, not by coincidence.
 * `poseCamera.ts` is itself under `ui/`, so importing it crosses no boundary.
 */
import {
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
} from "../../canvas/pose/poseCamera";
import type {
  PoseColor,
  PoseFraming,
  PoseMeshId,
  PoseProjection,
  PoseCameraPreset,
  PoseVector,
} from "../../canvas/pose/poseTypes";
import { DirectionOrb } from "./DirectionOrb";
import "./PosePanel.css";

export interface PoseSectionProps {
  /** The loaded reference solid, or `null` for "no model". */
  meshId: PoseMeshId | null;
  /** Which region the camera frames. Only meaningful for the mannequin. */
  framing: PoseFraming;
  /** Model orientation, euler radians. */
  rotation: PoseVector;
  /** Key-light direction, a unit-ish vector. */
  lightDirection: PoseVector;
  lightColor: PoseColor;
  modelColor: PoseColor;
  projection: PoseProjection;
  cameraPreset: PoseCameraPreset;
  /** Scale multiplier over the auto-fit. The store clamps it to 0.1–10. */
  zoom: number;
  /** Field of view in degrees. The store clamps it to 10–120. */
  fov: number;

  onSelectMesh: (meshId: PoseMeshId) => void;
  onSelectFraming: (framing: PoseFraming) => void;
  onSetRotation: (rotation: PoseVector) => void;
  onSetLightDirection: (direction: PoseVector) => void;
  onSetLightColor: (color: PoseColor) => void;
  onSetModelColor: (color: PoseColor) => void;
  onSetProjection: (projection: PoseProjection) => void;
  onSelectCameraPreset: (preset: PoseCameraPreset) => void;
  onSetZoom: (zoom: number) => void;
  onSetFov: (fov: number) => void;
  /** Unloads the mesh and returns every setting to its default. */
  onClear: () => void;
}

/* ── button tables ─────────────────────────────────────────────────────────
 *
 * Module constants, so the story, the dom test and the rows all read the same
 * source. The CAMERA preset and VIEWPOINT tables are NOT here — they are
 * imported from `poseCamera.ts`, which owns the angles.
 */

const MESHES: readonly { id: PoseMeshId; label: string }[] = [
  { id: "cube", label: "Cube" },
  { id: "sphere", label: "Sphere" },
  { id: "cylinder", label: "Cylinder" },
  { id: "mannequin", label: "Mannequin" },
];

const FRAMINGS: readonly { id: PoseFraming; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "head", label: "Head" },
  { id: "torso", label: "Torso" },
  { id: "arm", label: "Arm" },
  { id: "leg", label: "Leg" },
  { id: "hand", label: "Hand" },
];

const PROJECTIONS: readonly { id: PoseProjection; label: string }[] = [
  { id: "perspective", label: "Perspective" },
  { id: "orthographic", label: "Orthographic" },
];

/** `"three-quarter"` → `"3/4"`; everything else is its id, title-cased. */
function viewpointLabel(id: string): string {
  if (id === "three-quarter") return "3/4";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/* ── colour <-> hex ────────────────────────────────────────────────────────
 *
 * `<input type="color">` speaks `#rrggbb` only. Transcribed from
 * `PixelStudioPanel`'s `OriginColorPicker`, which does exactly this — the
 * alpha channel is not editable there either, and the pose's light and model
 * colours are both fully opaque by construction.
 */

function toHex(c: PoseColor): string {
  return (
    "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}

function fromHex(hex: string): PoseColor {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255,
  };
}

export function PoseSection({
  meshId,
  framing,
  rotation,
  lightDirection,
  lightColor,
  modelColor,
  projection,
  cameraPreset,
  zoom,
  fov,
  onSelectMesh,
  onSelectFraming,
  onSetRotation,
  onSetLightDirection,
  onSetLightColor,
  onSetModelColor,
  onSetProjection,
  onSelectCameraPreset,
  onSetZoom,
  onSetFov,
  onClear,
}: PoseSectionProps) {
  const hasMesh = meshId !== null;
  /* MASTER D4 — framing frames a REGION of the unrigged mannequin. A cube has
     no head, so the row is disabled rather than removed (see the header). */
  const framingEnabled = meshId === "mannequin";
  /* An orthographic camera has no field of view. */
  const fovEnabled = projection === "perspective";

  const btn = (active: boolean) =>
    `pose-panel__btn${active ? " pose-panel__btn--active" : ""}`;

  return (
    <div className="pose-panel">
      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Model</span>
        <div className="pose-panel__buttons">
          {MESHES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={btn(meshId === id)}
              onClick={() => onSelectMesh(id)}
              title={`Load the ${label.toLowerCase()} reference`}
            >
              {label}
            </button>
          ))}
        </div>
        {hasMesh ? null : (
          <p className="pose-panel__hint">
            Pick a reference solid to show it above the artwork.
          </p>
        )}
      </div>

      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Framing</span>
        <div className="pose-panel__buttons">
          {FRAMINGS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={btn(framing === id)}
              onClick={() => onSelectFraming(id)}
              disabled={!framingEnabled}
              title={
                framingEnabled
                  ? `Frame the ${label.toLowerCase()}`
                  : "Framing regions apply to the mannequin only"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Rotation &amp; light</span>
        <div className="pose-panel__orbs">
          {/* ONE component, used twice (MASTER D13). The two differ only in
              what their vector means, which `mode` says. */}
          <DirectionOrb
            value={rotation}
            onChange={onSetRotation}
            label="Rotation"
            mode="euler"
          />
          <DirectionOrb
            value={lightDirection}
            onChange={onSetLightDirection}
            label="Light"
            mode="direction"
          />
        </div>
        <div className="pose-panel__buttons">
          {POSE_VIEWPOINT_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="pose-panel__btn"
              /* Feeding the orb a new `value` is what moves its handle — it
                 holds no direction of its own, precisely so this works. */
              onClick={() => onSetRotation(POSE_VIEWPOINT_ROTATIONS[id])}
              title={`Snap the model to the ${viewpointLabel(id)} view`}
            >
              {viewpointLabel(id)}
            </button>
          ))}
        </div>
      </div>

      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Colours</span>
        <div className="pose-panel__color-row">
          <span className="pose-panel__color-label">Light</span>
          <input
            type="color"
            className="pose-panel__color-input"
            aria-label="Light colour"
            value={toHex(lightColor)}
            onChange={(e) => onSetLightColor(fromHex(e.target.value))}
          />
        </div>
        <div className="pose-panel__color-row">
          <span className="pose-panel__color-label">Model</span>
          <input
            type="color"
            className="pose-panel__color-input"
            aria-label="Model colour"
            value={toHex(modelColor)}
            onChange={(e) => onSetModelColor(fromHex(e.target.value))}
          />
        </div>
      </div>

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
              onClick={() => onSelectCameraPreset(preset.id)}
              title={`${preset.label} — ${preset.projection}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="pose-panel__slider-row">
          <span className="pose-panel__slider-label">Zoom</span>
          <input
            type="range"
            className="pose-panel__slider"
            aria-label="Zoom"
            /* The bounds mirror `POSE_ZOOM_MIN`/`MAX`; the store re-clamps, so
               a stale bound here can never produce an out-of-range value. */
            min={0.1}
            max={10}
            step={0.1}
            value={zoom}
            onChange={(e) => onSetZoom(Number(e.target.value))}
          />
          <span className="pose-panel__slider-value">{zoom.toFixed(1)}×</span>
        </div>

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
      </div>

      {hasMesh ? (
        <button type="button" className="pose-panel__btn" onClick={onClear}>
          Clear pose
        </button>
      ) : null}
    </div>
  );
}
