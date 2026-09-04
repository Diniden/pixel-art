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
 * | Model        | Cube · Sphere · Cylinder                        | `meshId`              |
 * | Mannequin    | Full · Head · Torso · Arm · Leg · Hand           | `meshId`              |
 * | Rotation     | orb + Front/Back/Left/Right/Top/Bottom/¾         | `rotation`            |
 * | Light        | orb + light tint presets                         | `lightDirection/Color`|
 * | Colours      | Fill swatch · Edge swatch (the APP's picker)     | `ui.tool` (E8/E9/E10) |
 * | Outline      | thickness 0–4 px                                 | `edgeWidth` (E4)      |
 * | Camera       | projection · 5 presets · scale · FOV · Fit       | `projection` …        |
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
 *
 * ## ⚠️ Two things changed meaning on 2026-09-04 (plan 08)
 *
 * - **A camera preset button applies a WHOLE SCENE STATE** (F7). It emits the
 *   resolved `PoseCameraPresetSpec` through `onApplyCameraPreset`, and the
 *   container writes projection, pitch, yaw, FOV, the clip policy **and the
 *   model's rotation** in one store action. `scale` and `pan` are deliberately
 *   left alone — see `PoseCameraPresetSpec`'s header for that decision.
 * - **`Left` and `Right` INVERTED** (F9). The owner's convention is
 *   model-centric: *"left means the model rotates to face the left"*, so
 *   pressing **Left** turns the model to its left and shows the viewer its
 *   RIGHT flank. `Top`/`Bottom` are viewer-centric ("I look at the top") and
 *   are unchanged. ⚠️ This rail renders `POSE_VIEWPOINT_ROTATIONS` verbatim
 *   and holds no angles of its own, so the inversion lives entirely in
 *   `poseCamera.ts` — do not "correct" a label here.
 */
import {
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
} from "../../canvas/pose/poseCamera";
import type { PoseCameraPresetSpec } from "../../canvas/pose/poseCamera";

import { MANNEQUIN_PART_ORDER } from "../../canvas/pose/poseMeshes";
import type {
  PoseColor,
  PoseMeshId,
  PoseProjection,
  PoseCameraPreset,
  PoseVector,
} from "../../canvas/pose/poseTypes";
import { DirectionOrb } from "./DirectionOrb";
import { LightAnglesInput, RotationEulerInput } from "./EulerInput";
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
 * The scale SLIDER's travel — an affordance, **not a limit** (MASTER E11).
 *
 * ⚠️ These are deliberately NOT a mirror of a store constant. `POSE_ZOOM_MAX`
 * was deleted by the refinements plan precisely because the owner reported the
 * model capping out, and re-introducing any ceiling on the store's value here
 * would undo that. An `<input type="range">` must have finite ends to place a
 * thumb, so the slider covers the comfortable range and the number box beside
 * it accepts anything the store does — which above `POSE_SCALE_MIN_SAFE` is
 * everything.
 *
 * ⚠️ Renamed from `POSE_ZOOM_SLIDER_*` on 2026-09-04 (plan 08, F6): the control
 * now scales the **model** about its own origin, not the camera's frustum.
 */
export const POSE_SCALE_SLIDER_MIN = 0.1;
export const POSE_SCALE_SLIDER_MAX = 40;

export interface PoseSectionProps {
  /** The loaded reference solid, or `null` for "no model". */
  meshId: PoseMeshId | null;
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
   * The MODEL's scale multiplier, about its own origin (plan 08, F6).
   * **Unbounded above** (MASTER E11): the store only floors it at
   * `POSE_SCALE_MIN_SAFE`, and this rail must not reintroduce the deleted cap.
   */
  scale: number;
  /** Field of view in degrees. The store clamps it to 10–120. */
  fov: number;

  /**
   * Load a reference solid — a primitive, the whole mannequin, or one of its
   * parts. ⚠️ **The part buttons route through THIS**, not a separate framing
   * callback: a part is its own geometry now (MASTER E1/E2), so picking Head
   * is picking a mesh in exactly the way picking Cube is.
   */
  onSelectMesh: (meshId: PoseMeshId) => void;
  onSetRotation: (rotation: PoseVector) => void;
  onSetLightDirection: (direction: PoseVector) => void;
  onSetLightColor: (color: PoseColor) => void;
  /** Point the app's picker at the **Fill** slot (the model colour). */
  onEditModelColor: () => void;
  /** Point the app's picker at the **Edge** slot (the outline colour). */
  onEditEdgeColor: () => void;
  onSetEdgeWidth: (width: number) => void;
  onSetProjection: (projection: PoseProjection) => void;
  /**
   * Apply a whole camera preset (plan 08, **F7**).
   *
   * ⚠️ **It receives the resolved SPEC, not just the id**, and that is the
   * shape of F7: a preset sets `projection`, `pitch`, `yaw`, `fov`, the
   * near/far policy **and the model's `rotation`**, so the id alone is not
   * enough for the container to write the state in one action. The rail
   * already maps `POSE_CAMERA_PRESETS` to render the buttons, so it hands over
   * the entry it rendered rather than making the container look up by id and
   * risk resolving a different table.
   *
   * ⚠️ Renamed from `onSelectCameraPreset` on 2026-09-04. The old name said
   * "record which one is chosen"; this one applies a state. The rename is
   * deliberate so a caller still wired to the old, partial behaviour fails to
   * compile rather than silently half-applying.
   */
  onApplyCameraPreset: (preset: PoseCameraPresetSpec) => void;
  onSetScale: (scale: number) => void;
  onSetFov: (fov: number) => void;
  /**
   * Re-frame the model (MASTER E14/E15). ⚠️ Since plan 08 (F4) a fit sets the
   * model's SCALE back to the fitted size instead of moving the camera; the
   * pan is still untouched.
   */
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

/** The three constructed primitives (MASTER D1). */
const MESHES: readonly { id: PoseMeshId; label: string }[] = [
  { id: "cube", label: "Cube" },
  { id: "sphere", label: "Sphere" },
  { id: "cylinder", label: "Cylinder" },
];

/**
 * The mannequin row: the whole figure, then each part (MASTER E1/E2).
 *
 * ⚠️ **These load a MESH, not a framing.** The old Framing row pointed the
 * camera at a slice of the whole figure, so pressing Head still rendered — and
 * lit, and stamped — the entire body. Each id here is real sub-geometry built
 * by `poseMeshes.ts`, re-centred and auto-fitted like a primitive, so the row
 * is never disabled and there is nothing for a primitive to "not have".
 *
 * ⚠️ **`"mannequin"` IS Full.** The label is "Full" because that is what the
 * button does next to five parts; the id is the whole-figure mesh id, and the
 * order is `MANNEQUIN_PART_ORDER` so the rail cannot drift from the geometry.
 * The old framing's `"full"` has no counterpart in `PoseMeshId` at all.
 */
const MANNEQUIN_PARTS: readonly { id: PoseMeshId; label: string }[] = [
  { id: "mannequin", label: "Full" },
  ...MANNEQUIN_PART_ORDER.map((id) => ({
    id: id as PoseMeshId,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  })),
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
const LIGHT_TINTS: readonly { id: string; label: string; color: PoseColor }[] =
  [
    {
      id: "neutral",
      label: "Neutral",
      color: { r: 255, g: 255, b: 255, a: 255 },
    },
    { id: "warm", label: "Warm", color: { r: 255, g: 226, b: 189, a: 255 } },
    { id: "cool", label: "Cool", color: { r: 201, g: 226, b: 255, a: 255 } },
    { id: "amber", label: "Amber", color: { r: 255, g: 183, b: 92, a: 255 } },
    { id: "moon", label: "Moon", color: { r: 150, g: 176, b: 255, a: 255 } },
  ];

/**
 * One row of the Colours group: which of the app's two slots it is, its
 * caption, the colour it shows, and what clicking it asks for (E8/E9/E10).
 *
 * Hoisted out of the JSX because the inline `satisfies` annotation it replaces
 * spanned eleven lines inside the render, which is a lot of type for two rows.
 */
type ColorSlotRow = readonly ["edge" | "fill", string, PoseColor, () => void];

/** `"three-quarter"` → `"3/4"`; everything else is its id, title-cased. */
function viewpointLabel(id: string): string {
  if (id === "three-quarter") return "3/4";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * The tooltip for one viewpoint button, spelling out **what the model does**
 * (plan 08, **F9**).
 *
 * ⚠️ These sentences are the user-facing half of the F9 semantic change, and
 * they exist because "Left" alone is exactly the ambiguity that got this table
 * inverted twice. `left`/`right` are **model-centric** — the model turns — so
 * their tooltips say which flank that turn presents. `top`/`bottom` are
 * **viewer-centric** — the owner said *"top means I look at the top of the
 * model"* — so theirs say what comes into view. The asymmetry in the wording
 * mirrors the asymmetry in the convention on purpose; flattening it would hide
 * the very distinction the next reader needs.
 */
const VIEWPOINT_TITLES: Readonly<Record<string, string>> = {
  left: "Turn the model to face left — you see its right side",
  right: "Turn the model to face right — you see its left side",
  top: "Look at the top of the model",
  bottom: "Look at the underside of the model",
  front: "Face the model toward you",
  back: "Turn the model away — you see its back",
};

function viewpointTitle(id: string): string {
  return (
    VIEWPOINT_TITLES[id] ??
    "Turn the model to the classic three-quarter reference pose"
  );
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
  rotation,
  lightDirection,
  lightColor,
  modelColor,
  edgeColor,
  colorTarget,
  edgeWidth,
  projection,
  cameraPreset,
  scale,
  fov,
  onSelectMesh,
  onSetRotation,
  onSetLightDirection,
  onSetLightColor,
  onEditModelColor,
  onEditEdgeColor,
  onSetEdgeWidth,
  onSetProjection,
  onApplyCameraPreset,
  onSetScale,
  onSetFov,
  onRequestFit,
  onClear,
}: PoseSectionProps) {
  const hasMesh = meshId !== null;
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

      {/* ── Mannequin ───────────────────────────────────────────────────────
          MASTER E1/E2. These REPLACE the Framing row: each button loads that
          piece as its own mesh, alone and centred, rather than aiming the
          camera at a region of the whole figure. They therefore route through
          `onSelectMesh` and are never disabled — every id is loadable from any
          state, exactly like Cube. */}
      <div className="pose-panel__group">
        <span className="pose-panel__group-label">Mannequin</span>
        <div className="pose-panel__buttons">
          {MANNEQUIN_PARTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={btn(meshId === id)}
              onClick={() => onSelectMesh(id)}
              title={
                id === "mannequin"
                  ? "Load the whole mannequin"
                  : `Load the ${label.toLowerCase()} on its own`
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
        {/* ── EXACT ANGLE ENTRY (plan 08 task 07, F10/F11) ──────────────────
            Two views of ONE value each, never two values: these read the same
            props the orbs above them do, so dragging an orb moves the numbers
            and typing a number moves the orb. Degrees here, radians in the
            store — the conversion is inside `EulerInput`, at this edge.
            ⚠️ The light gets TWO boxes, not three: it is a unit VECTOR the
            engine uses as a position, not a rotation, so a third box would be
            one the owner could type into to no effect. `EulerInput`'s header
            carries the F11 decision and the exact round-trip. */}
        <RotationEulerInput rotation={rotation} onChange={onSetRotation} />
        <LightAnglesInput
          lightDirection={lightDirection}
          onChange={onSetLightDirection}
        />
        <div className="pose-panel__buttons">
          {POSE_VIEWPOINT_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="pose-panel__btn"
              /* Feeding the orb a new `value` is what moves its handle — it
                 holds no direction of its own, precisely so this works. */
              onClick={() => onSetRotation(POSE_VIEWPOINT_ROTATIONS[id])}
              title={viewpointTitle(id)}
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
              ["fill", "Model", modelColor, onEditModelColor],
              ["edge", "Outline", edgeColor, onEditEdgeColor],
            ] satisfies readonly ColorSlotRow[]
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
      </div>

      {hasMesh ? (
        <button type="button" className="pose-panel__btn" onClick={onClear}>
          Clear pose
        </button>
      ) : null}
    </div>
  );
}
