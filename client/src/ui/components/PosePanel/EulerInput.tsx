/**
 * EulerInput — exact numeric angle entry for the model's rotation and the key
 * light (plan 08 task 07; **F10**, **F11**).
 *
 * PURE. Like everything under `ui/`, this imports no store, no MobX, no API
 * and no `services/`: a `{x,y,z}` comes in as a prop and a new one leaves
 * through `onChange`. It holds **no state at all** — not even a draft — for
 * the reason under "Why there is no draft state" below.
 *
 * ## Three exports, and why the file is shaped this way
 *
 * - {@link EulerInput} — the primitive: *N labelled degree boxes*, and
 *   nothing more. It does not know what the angles mean.
 * - {@link RotationEulerInput} — the model's rotation: **three** boxes,
 *   `X`/`Y`/`Z`, radians in and radians out.
 * - {@link LightAnglesInput} — the light: **two** boxes, `Azimuth` and
 *   `Elevation`, a unit vector in and a unit vector out.
 *
 * The two wrappers exist as **components** rather than as exported helper
 * functions because `react-refresh/only-export-components` is an **error** for
 * new `ui/` code: a module may export components and constants, not
 * components and functions. Making the conversions the wrappers' own bodies
 * satisfies that and is better factoring anyway — `PoseSection` then reads as
 * two elements next to the two orbs, with no per-axis plumbing at the call
 * site, and `PoseSection.tsx` stays under the 400-line `ui/` ceiling it was
 * already six lines away from.
 *
 * ## F10 — DEGREES in the UI, RADIANS in the store
 *
 * The store stays the single source of truth in radians. Degrees exist only
 * between {@link RotationEulerInput}'s props and its boxes: it converts on the
 * way in and on the way back out, so nothing below this file ever sees one.
 * Degrees are what the owner thinks in and what every other angle in this rail
 * already displays.
 *
 * ## ⚠️ F11 — THE LIGHT GETS TWO FIELDS, NOT THREE. DECIDED 2026-09-04.
 *
 * The owner asked for *"the exact euler angles"* for the light as well as the
 * rotation. **The light is not a rotation.** It is a `PoseVector` that
 * `setLightDirection` **normalises on write**, and that the engine consumes as
 * a POSITION (`poseEngine.ts` sets `keyLight.position` with the target at the
 * origin). A direction has **two** degrees of freedom; Euler angles have
 * three. Vector → Euler is therefore one-to-many — roll is unconstrained, and
 * any value chosen for it is arbitrary.
 *
 * Two honest designs exist, and they differ in what the owner sees when they
 * look away and come back:
 *
 *  1. **Three boxes, the typed angles stored beside the vector.** Round-trips
 *     what was typed, at the cost of a second piece of state that DRIFTS the
 *     moment the light orb is dragged — the orb writes a vector and the stored
 *     angles do not know. It also needs a new field on `PoseUIStore`, which
 *     this task may not touch.
 *  2. **Two boxes, derived from the vector every time.** No new state, no
 *     drift, and the boxes cannot disagree with the orb because both are
 *     computed from the same vector.
 *
 * **This is design 2**, and the deciding argument is not the store constraint
 * — it is that design 1 ships a **roll box that does nothing**. Typing in it
 * would change the stored angles, leave the vector identical, and light the
 * model exactly as before. A control that accepts input and produces no effect
 * is worse than a control that is not offered, and no labelling rescues it.
 * Design 2 offers exactly the freedoms the light actually has.
 *
 * ### ⚠️ The exact round-trip the owner will experience
 *
 * Two boxes captioned **`Azimuth`** and **`Elevation`**, never `X`/`Y`/`Z`.
 * Type a number and the light moves. Drag the light orb and the two numbers
 * follow it live. Type, look away, come back — the **same two numbers** are
 * there, with one bounded exception, stated because it is the only surprise
 * available:
 *
 * **Elevation is reported in −90…90 and azimuth in −180…180.** `Math.asin`
 * cannot return anything outside ±90° and `Math.atan2` nothing outside ±180°,
 * so typing `elevation 100` puts the light 10° PAST the pole — which is
 * physically the same place as `elevation 80` with the azimuth flipped 180° —
 * and the boxes redisplay it in that canonical spelling. Likewise `azimuth
 * 370` comes back as `10`. **Nothing is lost: the light is exactly where the
 * typed numbers put it.** The numbers are re-expressed because they are read
 * back off a vector rather than remembered, and the vector genuinely does not
 * distinguish the two spellings.
 *
 * ⚠️ **This asymmetry with the model's rotation is deliberate.** The rotation's
 * yaw wraps freely and is **never** rewritten — `370` stays `370` — because
 * those three numbers ARE the stored state. The light's two are a *reading* of
 * the stored state, so they are canonical. That is the price of not keeping a
 * second copy, and it is the honest price: the alternative is a copy that goes
 * stale the first time the orb is touched.
 *
 * ## ⚠️ Why there is no draft state — the measured trap
 *
 * The obvious implementation keeps half-typed text in `useState` and emits on
 * blur. This one does not, and the naive alternative is actively harmful here.
 *
 * `<input type="number">` **sanitises anything unparseable to `""`**, and
 * `Number("")` is **`0`, not `NaN`** — so a bare `Number.isFinite(next)` guard
 * lets a real `0` through mid-keystroke. For the Scale box that collapses the
 * model; for an ANGLE box it is worse, because typing `-45` passes through
 * `"-"` (empty, to the input) on the way, so the model would snap to 0 and
 * then to −45. Every field here rejects the empty string BEFORE parsing and
 * emits nothing for it. This is the guard the Scale box already uses, copied
 * deliberately rather than re-derived.
 *
 * Rejecting rather than drafting is what makes the control safe to leave fully
 * controlled: an unparseable keystroke emits nothing, so the value fed back is
 * the last GOOD one, and the DOM keeps the owner's raw text until the next
 * parseable keystroke replaces it. They can type freely; the model simply does
 * not move until what they typed means something.
 *
 * ## Display: rounded to `DEGREE_DECIMALS`, never re-wrapped
 *
 * A displayed value is rounded to one decimal. Two things this deliberately
 * does NOT do:
 *
 * - **It does not wrap the rotation to −180…180.** Yaw wraps freely on the orb
 *   (tumbling a model through more than one revolution is normal), and a field
 *   that silently rewrote `370` as `10` while the owner was still typing
 *   `3705` would fight them.
 * - **It does not round the EMITTED number.** Rounding is a display concern;
 *   `onChange` carries exactly what was parsed, so `45.06` sets `45.06` even
 *   though the box shows `45.1` once it is fed back. Rounding on the way in
 *   would make the control lossy against its own round-trip test.
 *
 * ⚠️ One decimal is chosen so **degrees → radians → degrees round-trips
 * visibly exactly**: that conversion's error is ~1e-14 degrees, thirteen
 * orders of magnitude below what is shown. A test pins it across −360…360.
 *
 * ## The light's maths, and why it matches everything else
 *
 * Azimuth is measured in the XZ plane from **+Z** (so `{0,0,1}` — a light
 * straight at the viewer — is azimuth 0) and elevation is the angle out of
 * that plane. That is **exactly** `DirectionOrb`'s own `vectorToSpherical`,
 * which is why the boxes and the orb track each other with no conversion
 * between them at all.
 *
 * ⚠️ **A measured trap, recorded because it looks like a shortcut:** it is
 * tempting to build the vector as `applyEulerXYZ({0,0,1}, {x: -elev, y: azim,
 * z: 0})` in ONE call. **That is a different vector.** "XYZ" names the order
 * the angles are LISTED; the matrix is `Rz·Ry·Rx`, so a combined call applies
 * elevation about the world X axis and azimuth about the world Y axis as one
 * composed rotation, which is not "turn, then lift". Measured at azimuth 45° /
 * elevation 20°: the combined call gives `(0.707107, 0.241845, 0.664463)`
 * where the orb's mapping gives `(0.664463, 0.342020, 0.664463)` — the same z,
 * but x and y off by 0.043 and 0.100. ⚠️ It is a QUIET wrong answer: both are
 * unit length and both move the light in roughly the right direction, so it
 * would read as "the boxes and the orb disagree slightly" rather than as a
 * bug. A test pins the difference.
 * `anglesToVector` therefore composes **two** `applyEulerXYZ` calls — elevate
 * about X first, then yaw about Y — which reproduces the orb's spherical
 * mapping to the last bit, and is pinned by a test.
 */
import type { ReactElement } from "react";
import { applyEulerXYZ } from "../../canvas/pose/poseCamera";
import type { PoseVector } from "../../canvas/pose/poseTypes";

/**
 * How many decimals a displayed angle carries.
 *
 * See the header: one decimal is far coarser than the ~1e-14° error of a
 * degrees → radians → degrees trip, so display is stable; and it is fine
 * enough that dragging an orb produces visibly live motion in the boxes rather
 * than a value that sticks for several pixels of travel.
 */
export const DEGREE_DECIMALS = 1;

/** Multiply degrees by this for radians. */
export const DEG_TO_RAD = Math.PI / 180;

/** Multiply radians by this for degrees. */
export const RAD_TO_DEG = 180 / Math.PI;

/*
 * The box captions. ⚠️ NOT exported, and not for want of a use: the dom test
 * would happily read them, but `react-refresh/only-export-components` is an
 * `error` for new `ui/` code and it does not recognise an exported ARRAY as a
 * constant the way it recognises a number. The test therefore spells the four
 * captions out, which is no loss — a test that reads its expectations from the
 * component's own table cannot catch a caption changing.
 *
 * ⚠️ The light's are `Azimuth`/`Elevation`, never `X`/`Y`/`Z`. That is F11 in
 * two words: naming them after Euler axes would promise a third box and a
 * different meaning for the two that exist.
 */
const ROTATION_AXIS_LABELS = ["X", "Y", "Z"] as const;
const LIGHT_AXIS_LABELS = ["Azimuth", "Elevation"] as const;

/**
 * `value` rounded for DISPLAY only — never for emission (see the header).
 *
 * `-0` is normalised to `0`: `Math.round(-0.02 * 10) / 10` is `-0`, which
 * renders as the string `"-0"` and reads as a bug rather than as zero.
 */
function roundDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** DEGREE_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** One numeric field: what it is called, and what it currently reads. */
export interface EulerAxis {
  /**
   * A stable key AND the field's caption. Must be unique within one
   * `EulerInput`, since it is also how `onChange` says which box moved.
   */
  label: string;
  /** The angle, in DEGREES. */
  degrees: number;
  /** Optional lower bound, in degrees. The input's, not the emission's. */
  min?: number;
  /** Optional upper bound. ⚠️ Omit unless the axis truly has one. */
  max?: number;
  /** A longer explanation, shown as the field's `title`. */
  title?: string;
}

export interface EulerInputProps {
  /**
   * Two or three fields. ⚠️ The array's LENGTH is the control's shape — a
   * two-entry array renders two boxes, not three with one hidden.
   */
  axes: readonly EulerAxis[];
  /**
   * One field changed: its `label`, and the parsed DEGREES.
   *
   * ⚠️ Fires **only** for a parseable value. An emptied or half-typed box
   * (`""`, `"-"`, `"."`, `"1e"`) emits nothing at all — see the header.
   */
  onChange: (label: string, degrees: number) => void;
  /**
   * Prefix for each field's accessible name, so two `EulerInput`s in one panel
   * do not collide: the name is `` `${name} ${axis.label}` `` — e.g.
   * `"Rotation X"`, `"Light Azimuth"`.
   */
  name: string;
  /** Greys every field out and suppresses every `onChange`. */
  disabled?: boolean;
}

/**
 * The primitive: a row of degree boxes that knows nothing about what they mean.
 *
 * The markup reuses `pose-panel__slider-row` / `__slider-label` / `__number` —
 * the classes the Scale row already uses — deliberately, not as a shortcut:
 * these fields ARE the same kind of thing (a caption beside a monospace
 * numeric box) and they must line up with the Scale row in the same 240 px
 * rail. ⚠️ No new class is introduced, because `PosePanel.css` belongs to a
 * parallel task this wave and this component must not require an edit to it.
 */
export function EulerInput({
  axes,
  onChange,
  name,
  disabled = false,
}: EulerInputProps): ReactElement {
  return (
    <div className="pose-panel__slider-row">
      {axes.map((axis) => (
        <span key={axis.label} className="pose-panel__slider-row">
          <span className="pose-panel__slider-label">{axis.label}</span>
          <input
            type="number"
            className="pose-panel__number pose-panel__number--angle"
            aria-label={`${name} ${axis.label}`}
            min={axis.min}
            max={axis.max}
            /* Tenths, matching what is displayed, so the arrow keys and the
               stepper move by exactly the smallest visible increment. */
            step={0.1}
            value={roundDegrees(axis.degrees)}
            disabled={disabled}
            title={axis.title}
            onChange={(e) => {
              /* ⚠️ THE MEASURED TRAP, explained in the header: a number input
                 sanitises garbage to `""` and `Number("")` is `0`, so the
                 empty case must be rejected BEFORE parsing or a half-typed
                 `-45` snaps the model to 0 on its way through `"-"`. Emitting
                 nothing leaves the caller's last good value in place. */
              const raw = e.target.value.trim();
              if (raw === "") return;
              const next = Number(raw);
              if (Number.isFinite(next)) onChange(axis.label, next);
            }}
          />
        </span>
      ))}
    </div>
  );
}

export interface RotationEulerInputProps {
  /** The model's rotation, Euler XYZ **radians** — the store's own value. */
  rotation: PoseVector;
  /** A whole new rotation, in **radians**. Wholesale, like `setRotation`. */
  onChange: (rotation: PoseVector) => void;
  disabled?: boolean;
}

/**
 * The model's rotation as three degree boxes (**F10**).
 *
 * ⚠️ **`X`/`Y`/`Z` are the honest labels here**, unlike the light's, and the
 * difference is the whole of F11: the model's `rotation` genuinely IS an Euler
 * XYZ triple in radians (three's default order, applied verbatim as
 * `root.rotation.set(x, y, z)`), so three boxes map one-to-one onto three
 * stored numbers and round-trip exactly.
 *
 * No `min`/`max`: yaw wraps freely on the orb and the store clamps nothing, so
 * a bound here would be a cap the rest of the system does not have.
 */
export function RotationEulerInput({
  rotation,
  onChange,
  disabled,
}: RotationEulerInputProps): ReactElement {
  const titles = ["Pitch, in degrees", "Yaw, in degrees", "Roll, in degrees"];
  const values = [rotation.x, rotation.y, rotation.z];
  return (
    <EulerInput
      name="Rotation"
      disabled={disabled}
      axes={ROTATION_AXIS_LABELS.map((label, i) => ({
        label,
        title: titles[i],
        degrees: values[i] * RAD_TO_DEG,
      }))}
      onChange={(label, degrees) => {
        const radians = degrees * DEG_TO_RAD;
        onChange({
          x: label === "X" ? radians : rotation.x,
          y: label === "Y" ? radians : rotation.y,
          z: label === "Z" ? radians : rotation.z,
        });
      }}
    />
  );
}

/**
 * The light's two angles read off its vector — transcribed from
 * `DirectionOrb`'s `vectorToSpherical`, in degrees.
 *
 * A zero-length or non-finite vector has no direction, so it reads as dead
 * ahead (`0, 0`) rather than as `NaN` — the same fallback the orb makes.
 */
function vectorToAngles(v: PoseVector): { azimuth: number; elevation: number } {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length === 0) {
    return { azimuth: 0, elevation: 0 };
  }
  return {
    azimuth: Math.atan2(v.x, v.z) * RAD_TO_DEG,
    // `asin` of a value nudged past ±1 by float error is NaN — clamp first.
    elevation: Math.asin(Math.max(-1, Math.min(1, v.y / length))) * RAD_TO_DEG,
  };
}

/**
 * The inverse: two angles in degrees to a unit vector.
 *
 * ⚠️ **Two `applyEulerXYZ` calls, not one** — the header carries the
 * measurement showing the single combined call is a different rotation.
 * Elevation is applied as `-elevation` about X because a positive X rotation
 * tips +Z downward and the owner's "elevation" raises the light.
 *
 * The result is already unit length; `setLightDirection` normalises again on
 * write, which is harmless and is not relied on here.
 */
function anglesToVector(azimuth: number, elevation: number): PoseVector {
  const lifted = applyEulerXYZ(
    { x: 0, y: 0, z: 1 },
    { x: -elevation * DEG_TO_RAD, y: 0, z: 0 },
  );
  return applyEulerXYZ(lifted, { x: 0, y: azimuth * DEG_TO_RAD, z: 0 });
}

export interface LightAnglesInputProps {
  /** The key light's direction — a unit-ish vector, the store's own value. */
  lightDirection: PoseVector;
  /** A whole new direction, unit length. `setLightDirection` normalises. */
  onChange: (direction: PoseVector) => void;
  disabled?: boolean;
}

/**
 * The light as **two** boxes, `Azimuth` and `Elevation` (**F11**).
 *
 * See the file header for the full decision, the alternative that was rejected
 * and the exact round-trip behaviour — including the one place the numbers are
 * re-expressed (they are canonicalised into −180…180 and −90…90, because they
 * are read off a vector rather than remembered).
 */
export function LightAnglesInput({
  lightDirection,
  onChange,
  disabled,
}: LightAnglesInputProps): ReactElement {
  const { azimuth, elevation } = vectorToAngles(lightDirection);
  return (
    <EulerInput
      name="Light"
      disabled={disabled}
      axes={[
        {
          label: LIGHT_AXIS_LABELS[0],
          degrees: azimuth,
          title:
            "Degrees around the model from straight ahead; shown in -180 to 180",
        },
        {
          label: LIGHT_AXIS_LABELS[1],
          degrees: elevation,
          min: -90,
          max: 90,
          title:
            "Degrees above the horizon. A direction has only two degrees of freedom, so there is no third box",
        },
      ]}
      onChange={(label, degrees) =>
        onChange(
          label === LIGHT_AXIS_LABELS[0]
            ? anglesToVector(degrees, elevation)
            : anglesToVector(azimuth, degrees),
        )
      }
    />
  );
}
