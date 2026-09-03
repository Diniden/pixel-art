/**
 * PoseSection — the Pose tool's right-rail controls (pose-tool 2026-09-02,
 * task 07; reworked by pose-refinements task 03, 2026-09-03).
 *
 * PURE. Like every other module under `ui/`, this imports no store, no MobX
 * and no API: every value arrives as a prop and every interaction leaves as a
 * callback. `PixelStudioPanelContainer` is the single `observer()` seam that
 * reads `app.pose` and `ui.tool` and feeds this section, exactly as it already
 * does for `ReflectionLinesSection`.
 *
 * ## Seven control groups
 *
 * | Group        | Controls                                        | Source                |
 * | ------------ | ----------------------------------------------- | --------------------- |
 * | Model        | Cube · Sphere · Cylinder · Mannequin             | `meshId`              |
 * | Framing      | Full · Head · Torso · Arm · Leg · Hand           | `framing`             |
 * | Rotation     | orb + Front/Back/Left/Right/Top/Bottom/¾         | `rotation`            |
 * | Light        | orb + light tint presets                         | `lightDirection/Color`|
 * | Colours      | Fill swatch · Edge swatch (the APP's picker)     | `ui.tool` (E8/E9/E10) |
 * | Outline      | thickness 0–4 px                                 | `edgeWidth` (E4)      |
 * | Camera       | projection · 5 presets · zoom · FOV · Fit        | `projection` …        |
 *
 * ## ⚠️ There is NO native colour input here any more (task 03)
 *
 * The rail used to render two `<input type="color">` elements with local
 * `toHex`/`fromHex` helpers. The owner asked for the app's own picker instead,
 * so **MASTER E10** applies: the rail shows **swatches** for the app's two
 * colour slots and switches which one the main picker is editing. It embeds no
 * second picker. Per **E8** the model colour is the **Fill** slot (always read
 * through `fillColorOrSelected` — never seed a default, it is tri-state and a
 * default would add a key to all 151 corpus snapshots) and per **E9** the
 * outline colour is the **Edge** slot.
 *
 * The swatches are therefore DISPLAY-ONLY here: `modelColor` and `edgeColor`
 * come in as values, and clicking one emits `onEditModelColor` /
 * `onEditEdgeColor` so the container can point the main picker at that slot.
 * There is no `onSetModelColor` any more — the picker sets the colour.
 *
 * ## The light colour is a LIGHT RIG property, not an artwork colour
 *
 * Fill and Edge describe the artwork. The key light's tint describes the
 * *studio*, and pointing the artwork picker at it would mean either inventing
 * a third slot (which E10 forbids) or making "set the fill colour" sometimes
 * mean "set the lamp", which is worse than the native input it replaces. It
 * is kept as its own control, but as a small row of TINT PRESETS rather than a
 * native swatch: a light tint is a choice from a handful of studio whites, not
 * an arbitrary 24-bit colour, and the presets are reachable by touch on the
 * iPad in a way the OS colour sheet is not. See `LIGHT_TINTS`.
 *
 * ## Outline thickness is 0–4, with 0 meaning "no outline"
 *
 * **MASTER E4** fixes whole pixels 1–4 "plus an off state (0 or a toggle —
 * task 03 decides and documents)". This is the 0 form: one control, no
 * checkbox that can disagree with the slider, and dragging to the left end is
 * the fastest possible way to turn the outline off and back on at the width
 * you had. The slider reads `0 px` as **"Off"** so the state is legible.
 *
 * ## The angle tables are IMPORTED, never re-declared
 *
 * `POSE_CAMERA_PRESETS`, `POSE_VIEWPOINT_ROTATIONS` and `POSE_VIEWPOINT_ORDER`
 * come from `ui/canvas/pose/poseCamera.ts` (task 06). Two sources of truth for
 * the isometric angle is a guaranteed drift, and the buttons here and the
 * camera maths must agree by construction, not by coincidence.
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

/**
 * Outline thickness, in whole rendered pixels (MASTER E4).
 *
 * `0` is the off state — see the header for why it is a slider position rather
 * than a separate toggle. The store re-clamps, so these bounds are the
 * affordance and not the guarantee. ⚠️ Task 06 mirrors these when it adds
 * `edgeWidth` to `PoseUIStore`.
 */
export const POSE_EDGE_WIDTH_MIN = 0;
export const POSE_EDGE_WIDTH_MAX = 4;

/**
 * The zoom SLIDER's travel — an affordance, **not a limit** (MASTER E11).
 *
 * ⚠️ These are deliberately NOT a mirror of a store constant. `POSE_ZOOM_MAX`
 * was deleted by task 01 precisely because the owner reported the model
 * capping out, and re-introducing any ceiling on the store's value here would
 * undo that. An `<input type="range">` must have finite ends to place a thumb,
 * so the slider covers the comfortable range and the number box beside it
 * accepts anything the store does — which above `POSE_ZOOM_MIN_SAFE` is
 * everything.
 */
export const POSE_ZOOM_SLIDER_MIN = 0.1;
export const POSE_ZOOM_SLIDER_MAX = 40;

export interface PoseSectionProps {
  /** The loaded reference solid, or `null` for "no model". */
  meshId: PoseMeshId | null;
  /** Which region the camera frames. Only meaningful for the mannequin. */
  framing: PoseFraming;
  /** Model orientation, euler radians. */
  rotation: PoseVector;
  /** Key-light direction, a unit-ish vector. */
  lightDirection: PoseVector;
  /** Key-light tint. Its own concept — NOT the Fill/Edge slots. */
  lightColor: PoseColor;
  /**
   * The model's colour: the app's **Fill** slot, read through
   * `fillColorOrSelected` by the container (MASTER E8). DISPLAY ONLY — the
   * main colour picker is what changes it.
   */
  modelColor: PoseColor;
  /**
   * The outline's colour: the app's **Edge** slot, `ui.tool.selectedColor`
   * (MASTER E9). DISPLAY ONLY, same as `modelColor`.
   */
  edgeColor: PoseColor;
  /**
   * Which slot the app's picker is currently editing, so the rail can mark
   * the matching swatch — `"edge" | "fill"`, mirroring `ui.tool.colorTarget`.
   */
  colorTarget: "edge" | "fill";
  /** Outline thickness in whole pixels; `0` means no outline (E4). */
  edgeWidth: number;
  projection: PoseProjection;
  cameraPreset: PoseCameraPreset;
  /**
   * Scale multiplier over the auto-fit. **Unbounded above** (MASTER E11): the
   * store only floors it at `POSE_ZOOM_MIN_SAFE`, and this rail must not
   * reintroduce the cap that task 01 deleted.
   */
  zoom: number;
  /** Field of view in degrees. The store clamps it to 10–120. */
  fov: number;

  onSelectMesh: (meshId: PoseMeshId) => void;
  onSelectFraming: (framing: PoseFraming) => void;
  onSetRotation: (rotation: PoseVector) => void;
  onSetLightDirection: (direction: PoseVector) => void;
  onSetLightColor: (color: PoseColor) => void;
  /** Point the app's picker at the **Fill** slot (the model colour). */
  onEditModelColor: () => void;
  /** Point the app's picker at the **Edge** slot (the outline colour). */
  onEditEdgeColor: () => void;
  onSetEdgeWidth: (width: number) => void;
  onSetProjection: (projection: PoseProjection) => void;
  onSelectCameraPreset: (preset: PoseCameraPreset) => void;
  onSetZoom: (zoom: number) => void;
  onSetFov: (fov: number) => void;
  /** Re-frame the model at its CURRENT rotation and camera (MASTER E14/E15). */
  onRequestFit: () => void;
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

/**
 * Key-light tints (see the header for why the light keeps its own control).
 *
 * Five studio whites rather than a full picker: `Neutral` is the store's
 * default, and the other four are the conventional key colours — a warm sun, a
 * cool skylight, a sodium/amber lamp and a moonlit blue. All fully opaque, as
 * the pose light has always been.
 */
const LIGHT_TINTS: readonly { id: string; label: string; color: PoseColor }[] = [
  { id: "neutral", label: "Neutral", color: { r: 255, g: 255, b: 255, a: 255 } },
  { id: "warm", label: "Warm", color: { r: 255, g: 226, b: 189, a: 255 } },
  { id: "cool", label: "Cool", color: { r: 201, g: 226, b: 255, a: 255 } },
  { id: "amber", label: "Amber", color: { r: 255, g: 183, b: 92, a: 255 } },
  { id: "moon", label: "Moon", color: { r: 150, g: 176, b: 255, a: 255 } },
];

/** `"three-quarter"` → `"3/4"`; everything else is its id, title-cased. */
function viewpointLabel(id: string): string {
  if (id === "three-quarter") return "3/4";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * A `PoseColor` as a CSS colour. Transcribed from `ColorPicker`'s target-tab
 * swatch, which renders its two slot colours exactly this way — the rail is
 * showing the same two colours, so it shows them the same way.
 */
function toCss(c: PoseColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
}

/** Two colours equal component-wise — used only to mark a tint preset active. */
function sameColor(a: PoseColor, b: PoseColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

export function PoseSection({
  meshId,
  framing,
  rotation,
  lightDirection,
  lightColor,
  modelColor,
  edgeColor,
  colorTarget,
  edgeWidth,
  projection,
  cameraPreset,
  zoom,
  fov,
  onSelectMesh,
  onSelectFraming,
  onSetRotation,
  onSetLightDirection,
  onSetLightColor,
  onEditModelColor,
  onEditEdgeColor,
  onSetEdgeWidth,
  onSetProjection,
  onSelectCameraPreset,
  onSetZoom,
  onSetFov,
  onRequestFit,
  onClear,
}: PoseSectionProps) {
  const hasMesh = meshId !== null;
  /* MASTER D4 — framing frames a REGION of the unrigged mannequin. A cube has
     no head, so the row is disabled rather than removed (see the header). */
  const framingEnabled = meshId === "mannequin";
  /* An orthographic camera has no field of view. */
  const fovEnabled = projection === "perspective";
  /* Rounded because the store holds a number and a fractional width has no
     meaning at 1:1 — the outline dilates by whole pixels (E4). */
  const outlineWidth = Math.round(edgeWidth);
  const outlineOff = outlineWidth <= POSE_EDGE_WIDTH_MIN;

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
        {/* The light's TINT. Its own control, deliberately — see the header:
            a lamp colour is not the artwork's Fill or Edge, and E10 forbids a
            third picker, so it is a short preset row instead. */}
        <div className="pose-panel__buttons">
          {LIGHT_TINTS.map(({ id, label, color }) => (
            <button
              key={id}
              type="button"
              className={btn(sameColor(lightColor, color))}
              onClick={() => onSetLightColor(color)}
              title={`Tint the key light ${label.toLowerCase()}`}
            >
              <span
                className="pose-panel__tint"
                style={{ backgroundColor: toCss(color) }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Colours ─────────────────────────────────────────────────────────
          MASTER E8/E9/E10. These are the APP's two colour slots, shown here
          and edited in the app's own picker: clicking a swatch switches
          `ui.tool.colorTarget` so the picker below is pointed at that slot.
          No native `<input type="color">`, and no second picker. */}
      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Colours</span>
        <div className="pose-panel__slots" role="group">
          {(
            [
              ["fill", "Model", modelColor, onEditModelColor] as const,
              ["edge", "Outline", edgeColor, onEditEdgeColor] as const,
            ] satisfies readonly (readonly [
              "edge" | "fill",
              string,
              PoseColor,
              () => void,
            ])[]
          ).map(([slot, label, color, onEdit]) => (
            <button
              key={slot}
              type="button"
              aria-label={`${label} colour`}
              aria-pressed={colorTarget === slot}
              className={`pose-panel__slot${
                colorTarget === slot ? " pose-panel__slot--active" : ""
              }`}
              onClick={onEdit}
              title={
                slot === "fill"
                  ? "Edit the model colour in the Fill slot of the colour picker"
                  : "Edit the outline colour in the Edge slot of the colour picker"
              }
            >
              <span
                className="pose-panel__slot-swatch"
                style={{ backgroundColor: toCss(color) }}
              />
              {label}
            </button>
          ))}
        </div>
        <p className="pose-panel__hint">
          The model uses the <strong>Fill</strong> colour and the outline uses{" "}
          <strong>Edge</strong>. Pick one here, then set it in the colour
          picker.
        </p>
      </div>

      {/* ── Outline ─────────────────────────────────────────────────────────
          MASTER E4: whole pixels, 0–4, where 0 IS the off state. One control,
          so a toggle can never disagree with a width. */}
      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Outline</span>
        <div className="pose-panel__slider-row">
          <span className="pose-panel__slider-label">Width</span>
          <input
            type="range"
            className="pose-panel__slider"
            aria-label="Outline width"
            min={POSE_EDGE_WIDTH_MIN}
            max={POSE_EDGE_WIDTH_MAX}
            /* Integer steps: the outline dilates the silhouette by whole
               pixels at the 1:1 render target, so a half is not a state. */
            step={1}
            value={outlineWidth}
            onChange={(e) => onSetEdgeWidth(Math.round(Number(e.target.value)))}
            title="Outline thickness in pixels; 0 turns the outline off"
          />
          <span className="pose-panel__slider-value">
            {outlineOff ? "Off" : `${outlineWidth} px`}
          </span>
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
            /* ⚠️ THE OLD `max={10}` IS GONE. It mirrored `POSE_ZOOM_MAX`,
               which task 01 deleted because the owner reported the model
               capping out; leaving it here would have kept exactly that cap in
               the one place they touch it. A range input cannot be literally
               unbounded — it needs finite ends to have a thumb position — so
               the TRAVEL is widened to `POSE_ZOOM_SLIDER_MAX` for the common
               case, and the number box beside it takes any value the store
               accepts, which per MASTER E11 is anything above
               `POSE_ZOOM_MIN_SAFE` with NO ceiling. The slider is an
               affordance; it is not the limit. */
            min={POSE_ZOOM_SLIDER_MIN}
            max={POSE_ZOOM_SLIDER_MAX}
            step={0.1}
            value={Math.min(zoom, POSE_ZOOM_SLIDER_MAX)}
            onChange={(e) => onSetZoom(Number(e.target.value))}
          />
          <input
            type="number"
            className="pose-panel__number"
            aria-label="Zoom value"
            /* No `max`: this is the unbounded path (E11). `min` is the store's
               safety floor, not a cap. */
            min={POSE_ZOOM_SLIDER_MIN}
            step={0.1}
            value={zoom}
            onChange={(e) => {
              /* ⚠️ An EMPTY box must send nothing at all. A number input
                 sanitises anything unparseable to `""`, and `Number("")` is
                 `0` — not `NaN` — so a bare `Number.isFinite` guard would let
                 a half-typed value collapse the camera to the store's safety
                 floor mid-keystroke. Both cases are rejected here. */
              const raw = e.target.value.trim();
              if (raw === "") return;
              const next = Number(raw);
              if (Number.isFinite(next)) onSetZoom(next);
            }}
            title="Zoom multiplier — type any value; there is no upper limit"
          />
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

        {/* MASTER E14/E15 — a REQUEST, not a computation. The container reacts
            to the store's `fitGeneration` counter and does the framing; this
            button only asks. It sits with the camera controls because that is
            what it re-frames, and it does NOT reset zoom or pan. */}
        <button
          type="button"
          className="pose-panel__btn"
          onClick={onRequestFit}
          disabled={!hasMesh}
          title={
            hasMesh
              ? "Re-frame the model to the canvas at its current rotation"
              : "Load a reference solid first"
          }
        >
          Fit to canvas
        </button>
      </div>

      {hasMesh ? (
        <button type="button" className="pose-panel__btn" onClick={onClear}>
          Clear pose
        </button>
      ) : null}
    </div>
  );
}
