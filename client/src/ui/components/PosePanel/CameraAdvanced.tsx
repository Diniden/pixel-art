/**
 * CameraAdvanced — exact numeric entry for the camera's projection values
 * (pose-camera-model-space task 06, 2026-09-04; owner item 8).
 *
 * PURE. Like every module under `ui/` this imports no store, no MobX, no API
 * and no `services/` — not even as a type. Every value arrives as a prop and
 * every change leaves as a callback. Task 08 mounts it and owns the saving.
 *
 * ## ⚠️ F16 — "the projection matrix" IS these fields. There is no 16-float box.
 *
 * The owner asked for *"EXACT values for the camera's projection matrix"*.
 * This control gives exactly that, but as the frustum **fields** rather than
 * as sixteen raw floats, and the difference is not a simplification — it is
 * the only shape that can work:
 *
 * `applyCameraParams` (`ui/canvas/pose/poseCamera.ts`) writes the camera's
 * *fields* — `near`, `far`, and either `fov`/`aspect` or `left`/`right`/
 * `top`/`bottom` — and then calls `camera.updateProjectionMatrix()`, which
 * **rebuilds the matrix from those fields**. A matrix typed into a text box
 * would therefore be overwritten on the very next frame: the input would look
 * like it worked and silently do nothing, which is worse than not offering it.
 *
 * These six numbers ARE the projection matrix, in the only form that survives
 * a frame. The component says so on screen (see `MATRIX_NOTE`) so the owner is
 * not left wondering where the 4×4 grid went — and so the next reader does not
 * "add the missing feature".
 *
 * ## Which fields are shown
 *
 * Only the **current** projection's. `near`/`far` are shared; orthographic
 * adds `left`/`right`/`top`/`bottom`; perspective adds `fov` (DEGREES, as the
 * store and `PoseCameraParams` both hold it) and `aspect`. Showing a
 * perspective `fov` box while an orthographic camera is live would invite the
 * owner to type a value that `applyCameraParams` provably ignores.
 *
 * ## ⚠️ The emit rule: DRAFT LOCALLY, EMIT ONLY WHEN VALID. Never clamp.
 *
 * The task offered two legal rules — reject locally, or emit and let the
 * container reject — and forbade the third (silently clamping a typed value
 * into legality, which is indefensible in a control whose entire purpose is
 * "exact values"). **This component rejects locally**, for one reason: the
 * container's only way to "reject" is to hand the value straight back as a
 * prop, and a field that snaps back mid-keystroke is unusable.
 *
 * So every box holds its own **draft string** while focused. Typing updates
 * only the draft; `onChange` fires when — and only when — the draft parses to
 * a finite number AND the resulting parameter set is legal. An illegal draft
 * stays on screen, marked `aria-invalid` and `--invalid`, and emits nothing.
 *
 * ⚠️ **The draft is what makes an invalid INTERMEDIATE state survivable.**
 * Going from `near 0.1 / far 100` to `near 200 / far 500` has to pass through
 * `near 200 / far 100`, which is illegal. Without the draft the first edit
 * would be discarded and the second could never be typed.
 *
 * ⚠️ **A rejected draft is never auto-resubmitted.** Once `far` is accepted,
 * the still-illegal `near` draft is legal — but it stays un-emitted until the
 * owner touches that box again. Deliberate: silently sending a value the owner
 * typed some keystrokes ago, at a moment they did not choose, is exactly the
 * class of surprise a control called "exact values" must not have. Blurring
 * the box drops the draft and shows what the camera actually holds.
 *
 * ⚠️ **`Number("")` is `0`, not `NaN`** — the trap measured in plan 07 and
 * copied here verbatim from `PoseSection`'s scale box. An `<input
 * type="number">` sanitises anything unparseable (`"1e"`, `"--"`, `"abc"`) to
 * the empty string, so a bare `Number.isFinite` guard sends a silent **zero**
 * to the store on the way past. `parseNumber` rejects `""` FIRST, before it
 * ever calls `Number`. `CameraAdvanced.dom.test.tsx` pins that case directly.
 *
 * ## Legality, and why each rule exists
 *
 * | Rule | Why |
 * | --- | --- |
 * | `far > near` | a frustum with no depth has no projection at all |
 * | `near > 0` (perspective only) | three's `PerspectiveCamera` requires it; a zero or negative near divides by zero in the projection |
 * | `left < right`, `bottom < top` | an orthographic box with a zero or inverted axis collapses the image to a line |
 * | `fov` in (0, 180) | outside that the tangent term is not a frustum |
 * | `aspect > 0` | it divides the horizontal extent |
 *
 * `fitCameraToMesh` derives `far` from `near` precisely so the first of these
 * cannot break by accident; typing them by hand removes that guarantee, which
 * is why the rules are enforced here rather than assumed.
 *
 * ## Saving is TASK 08's
 *
 * `onSaveAsPreset(name)` is the entire saving surface here. This component
 * stores nothing, persists nothing and holds no preset list — it trims the
 * name and no-ops on empty (the `layoutPresets` `saveCurrentAsPreset`
 * precedent), then hands it over.
 */
import { useState } from "react";

import type { PoseProjection } from "../../canvas/pose/poseTypes";
import "./PosePanel.css";

/**
 * The on-screen statement of F16 — see the header for why it must be said.
 *
 * Exported so the DOM test asserts the caveat is actually rendered rather than
 * merely intended. A comment nobody reads is not a communication.
 */
export const MATRIX_NOTE =
  "These fields ARE the projection matrix. The camera rebuilds its matrix " +
  "from them every frame (updateProjectionMatrix), so a hand-typed 4×4 would " +
  "be overwritten — entering the frustum values is the only way to set it " +
  "exactly.";

/** The orthographic frustum's four side planes, mirroring `PoseCameraParams`. */
export interface CameraAdvancedOrthographic {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The perspective lens, mirroring `PoseCameraParams`. `fov` is in DEGREES. */
export interface CameraAdvancedPerspective {
  fov: number;
  aspect: number;
}

/**
 * One edit, as a sparse patch.
 *
 * Sparse rather than a whole `PoseCameraParams` because the component never
 * sees `position`/`target` — those are the fit's and the pan's, not the
 * frustum's — so it must not be able to imply it is setting them.
 */
export interface CameraAdvancedPatch {
  near?: number;
  far?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  fov?: number;
  aspect?: number;
}

export interface CameraAdvancedProps {
  /** Which projection is live. Only its fields are rendered. */
  projection: PoseProjection;
  /** Near clip plane. Shared by both projections. */
  near: number;
  /** Far clip plane. Shared by both projections. */
  far: number;
  /** Required when `projection === "orthographic"`; ignored otherwise. */
  orthographic?: CameraAdvancedOrthographic;
  /** Required when `projection === "perspective"`; ignored otherwise. */
  perspective?: CameraAdvancedPerspective;
  /**
   * Start expanded. Defaults to **collapsed**: "advanced" means not always on
   * screen, and the rail is 240px.
   */
  defaultOpen?: boolean;
  /**
   * One field changed to a value that is finite AND legal. ⚠️ Never fires for
   * an empty, unparseable or illegal entry — see the header's emit rule.
   */
  onChange: (patch: CameraAdvancedPatch) => void;
  /**
   * Save the current values as a named preset. The name is already trimmed and
   * is never empty. ⚠️ **Storage is task 08's** — this component keeps none.
   */
  onSaveAsPreset: (name: string) => void;
  /** Optional: restore the fitted frustum. Hidden when absent. */
  onReset?: () => void;
}

/** Every field this control can edit. Drives the draft map and the tests. */
type FieldName = keyof CameraAdvancedPatch;

/**
 * Parse one `<input type="number">` value.
 *
 * ⚠️ The empty check comes FIRST and is the whole point — see the header.
 * `Number("")` is `0`, so testing finiteness alone would emit a zero for every
 * unparseable keystroke.
 *
 * ⚠️ **Module-private on purpose.** Exporting a non-component from a component
 * module is a `react-refresh/only-export-components` ERROR under
 * `PosePanel/` (the rule is only downgraded to `warn` for a named list of
 * legacy directories, which this is not), so the guard is pinned through the
 * rendered component in `CameraAdvanced.dom.test.tsx` instead — which is the
 * stronger pin anyway: it proves the box wired to it rejects the empty string,
 * not merely that a helper does.
 */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Why `next` is illegal, or `null` if it is fine.
 *
 * Takes the WHOLE resulting field set, not the one field being edited: every
 * rule here is a relation between two fields, so a per-field check could not
 * express any of them.
 */
function describeInvalid(
  projection: PoseProjection,
  next: Required<Pick<CameraAdvancedPatch, "near" | "far">> & CameraAdvancedPatch,
): string | null {
  if (!(next.far > next.near)) return "Far must be greater than near";
  if (projection === "perspective") {
    if (!(next.near > 0)) return "A perspective camera needs near > 0";
    if (next.fov !== undefined && !(next.fov > 0 && next.fov < 180)) {
      return "Field of view must be between 0 and 180 degrees";
    }
    if (next.aspect !== undefined && !(next.aspect > 0)) {
      return "Aspect must be greater than 0";
    }
    return null;
  }
  if (next.left !== undefined && next.right !== undefined && !(next.left < next.right)) {
    return "Left must be less than right";
  }
  if (next.bottom !== undefined && next.top !== undefined && !(next.bottom < next.top)) {
    return "Bottom must be less than top";
  }
  return null;
}

interface NumberFieldProps {
  name: FieldName;
  label: string;
  value: number;
  step: number;
  draft: string | undefined;
  invalid: boolean;
  hint: string;
  onDraft: (name: FieldName, raw: string) => void;
  onBlur: (name: FieldName) => void;
}

/**
 * One labelled numeric box.
 *
 * Shows the draft while one exists and the prop otherwise, so a rejected entry
 * stays visible for correction instead of snapping back — the behaviour the
 * header's emit rule depends on.
 */
function NumberField({
  name,
  label,
  value,
  step,
  draft,
  invalid,
  hint,
  onDraft,
  onBlur,
}: NumberFieldProps) {
  return (
    <label className="pose-panel__field" title={hint}>
      <span className="pose-panel__field-label">{label}</span>
      <input
        type="number"
        className={`pose-panel__field-input${
          invalid ? " pose-panel__field-input--invalid" : ""
        }`}
        aria-label={label}
        aria-invalid={invalid}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => onDraft(name, e.target.value)}
        onBlur={() => onBlur(name)}
      />
    </label>
  );
}

export function CameraAdvanced({
  projection,
  near,
  far,
  orthographic,
  perspective,
  defaultOpen = false,
  onChange,
  onSaveAsPreset,
  onReset,
}: CameraAdvancedProps) {
  const [open, setOpen] = useState(defaultOpen);
  /* The in-flight text of each box. Absent means "show the prop". */
  const [drafts, setDrafts] = useState<Partial<Record<FieldName, string>>>({});
  const [invalid, setInvalid] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");

  /* The values as they stand, so a relational rule can be checked against the
     whole set rather than against the single box being typed into. */
  const current: CameraAdvancedPatch & { near: number; far: number } = {
    near,
    far,
    ...(projection === "orthographic" ? orthographic : perspective),
  };

  const handleDraft = (name: FieldName, raw: string) => {
    setDrafts((prev) => ({ ...prev, [name]: raw }));
    const parsed = parseNumber(raw);
    if (parsed === null) {
      /* ⚠️ Empty or unparseable: emit NOTHING. `Number("")` is 0. */
      setInvalid("Enter a number");
      return;
    }
    const reason = describeInvalid(projection, { ...current, [name]: parsed });
    setInvalid(reason);
    if (reason === null) onChange({ [name]: parsed });
  };

  /* Dropping the draft on blur re-syncs the box with the store: a value that
     was accepted may have been re-derived (a fit), and one that was rejected
     should not linger as a lie about what the camera is doing. */
  const handleBlur = (name: FieldName) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setInvalid(null);
  };

  const handleSave = () => {
    const name = presetName.trim();
    /* No-ops on empty, exactly as `saveCurrentAsPreset` does. */
    if (name === "") return;
    onSaveAsPreset(name);
    setPresetName("");
  };

  const field = (
    name: FieldName,
    label: string,
    value: number,
    step: number,
    hint: string,
  ) => (
    <NumberField
      key={name}
      name={name}
      label={label}
      value={value}
      step={step}
      draft={drafts[name]}
      invalid={invalid !== null && drafts[name] !== undefined}
      hint={hint}
      onDraft={handleDraft}
      onBlur={handleBlur}
    />
  );

  return (
    <div className="pose-panel__group">
      <button
        type="button"
        className="pose-panel__disclosure"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        title="Type the camera's exact projection values"
      >
        <span className="pose-panel__disclosure-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        Advanced camera
      </button>

      {open ? (
        <div className="pose-panel__advanced">
          {/* ⚠️ F16, said out loud. The owner asked for a projection MATRIX;
              this is the honest answer to why there is no 4×4 grid here. */}
          <p className="pose-panel__hint">{MATRIX_NOTE}</p>

          <div className="pose-panel__fields">
            {field("near", "Near", near, 0.01, "Near clip plane; must be less than far")}
            {field("far", "Far", far, 1, "Far clip plane; must be greater than near")}
            {projection === "orthographic" && orthographic
              ? [
                  field("left", "Left", orthographic.left, 0.01, "Left frustum plane"),
                  field("right", "Right", orthographic.right, 0.01, "Right frustum plane"),
                  field("bottom", "Bottom", orthographic.bottom, 0.01, "Bottom frustum plane"),
                  field("top", "Top", orthographic.top, 0.01, "Top frustum plane"),
                ]
              : null}
            {projection === "perspective" && perspective
              ? [
                  field("fov", "FOV°", perspective.fov, 1, "Vertical field of view, in degrees"),
                  field("aspect", "Aspect", perspective.aspect, 0.01, "Width divided by height"),
                ]
              : null}
          </div>

          {invalid === null ? null : (
            <p className="pose-panel__error" role="alert">
              {invalid} — not applied.
            </p>
          )}

          {/* Saving: the NAME and the button only. Task 08 owns the store. */}
          <div className="pose-panel__slider-row">
            <input
              type="text"
              className="pose-panel__preset-name"
              aria-label="Preset name"
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <button
              type="button"
              className="pose-panel__btn"
              onClick={handleSave}
              disabled={presetName.trim() === ""}
              title="Save these projection values as a named preset"
            >
              Save
            </button>
          </div>

          {onReset ? (
            <button
              type="button"
              className="pose-panel__btn"
              onClick={onReset}
              title="Discard these values and return to the fitted frustum"
            >
              Reset to fitted
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
