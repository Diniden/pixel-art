import { useId, type ReactNode } from "react";
import { classNames } from "../../classNames";
import "./Toggle.css";

/**
 * Toggle — the shared switch control (task 19).
 *
 * BEM block: `toggle` (local stylesheet — the design is
 * RightSidebarTopControls' measured `.compact-toggle` pill, renamed because
 * task 20's G3 splits that legacy name into per-component blocks):
 *
 *   toggle > toggle__input (real checkbox, visually hidden) +
 *   toggle__track (pill; ::before is the thumb) + toggle__label
 *
 * Replaces the 9 measured sites in 3 incompatible idioms — the custom-slider
 * span (`RightSidebarTopControls.tsx:309-319`), label-wrapped checkboxes
 * (`EdgeInterpolateModal.tsx:118-126`, `FramesView.tsx:571`,
 * `VariantView.tsx:457`), and the KEYBOARD-INACCESSIBLE no-op `onChange` +
 * div `onClick` pattern (`LayerColors.tsx:169-180`, `:197-208`, `:254`).
 *
 * Accessibility is structural: the control IS a real `<input type="checkbox"
 * role="switch">` inside its `<label>`, so Tab reaches it and Space flips it
 * with no JavaScript at all — which is exactly what the three LayerColors
 * toggles cannot do today (manual check 5, fixed at adoption in task 36).
 */

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label text, rendered after the track. */
  label?: ReactNode;
  disabled?: boolean;
  /** Accessible name when no visible `label` is given. */
  ariaLabel?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  ariaLabel,
  className,
}: ToggleProps) {
  const id = useId();

  return (
    <label
      className={classNames(
        "toggle",
        disabled && "toggle--disabled",
        className,
      )}
      htmlFor={id}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...(label == null && ariaLabel ? { "aria-label": ariaLabel } : {})}
      />
      <span className="toggle__track" aria-hidden="true" />
      {label != null && <span className="toggle__label">{label}</span>}
    </label>
  );
}

export default Toggle;
