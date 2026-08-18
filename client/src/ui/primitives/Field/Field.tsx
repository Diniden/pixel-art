import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { classNames } from "../../classNames";
import "./Field.css";

/**
 * Field — the shared label + control row (task 19).
 *
 * BEM block: `field` (local stylesheet). Replaces the ~30 measured ad-hoc
 * label+control sites, each of which invented its own wrapper markup — and
 * almost none of which associated the label with its control.
 *
 * When the child is a single element without an `id`, one is generated and
 * wired to the `<label htmlFor>`, so clicking the label focuses the control
 * and screen readers announce the pairing — the association the legacy sites
 * were missing.
 */

interface ControlProps {
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export interface FieldProps {
  label: ReactNode;
  /** The control (input, Slider, NumberInput, Dropdown, …). */
  children: ReactNode;
  /** Muted helper text under the control. */
  hint?: ReactNode;
  /** Error text; also flags the control `aria-invalid`. */
  error?: ReactNode;
  /** Lay label and control on one row. */
  inline?: boolean;
  className?: string;
}

export function Field({
  label,
  children,
  hint,
  error,
  inline = false,
  className,
}: FieldProps) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;

  let control = children;
  let controlId: string | undefined;

  if (isValidElement<ControlProps>(children)) {
    controlId = children.props.id ?? generatedId;
    control = cloneElement(children, {
      id: controlId,
      ...(error != null ? { "aria-invalid": true } : {}),
      ...(hint != null || error != null
        ? { "aria-describedby": hintId }
        : {}),
    });
  }

  return (
    <div
      className={classNames("field", inline && "field--inline", className)}
    >
      <label className="field__label" htmlFor={controlId}>
        {label}
      </label>
      <div className="field__control">{control}</div>
      {(error ?? hint) != null && (
        <div
          id={hintId}
          className={classNames("field__hint", error != null && "field__hint--error")}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}

export default Field;
