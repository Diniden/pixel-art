import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../../classNames";

/**
 * Button — the shared button primitive (task 19).
 *
 * BEM block: `btn` (`client/src/styles/blocks/btn.css`, task 18). The CSS is
 * loaded globally via `src/index.css`; this component owns no stylesheet.
 * Task 10's proof-of-harness `Button.css` (with its dead `.btn--sm`) is
 * deleted — the vocabulary below is the block file's, exactly:
 *
 *   btn
 *   btn--lg                  larger padding (modal footer actions)
 *   btn--primary | --neutral | --ghost | --muted | --danger |
 *   btn--danger-outline | --gradient
 *
 * Replaces the measured duplication of 197 raw `<button>` elements
 * (LayerPanel's 13-line twins, ReferenceImagePanel's 2×8 clone buttons, the
 * play/preview triplet in FramesView/VariantView/TimelineView, …).
 *
 * Pure: props in, callbacks out. `type` defaults to `"button"` so a Button
 * inside a form never submits by accident.
 */

export type ButtonVariant =
  | "default"
  | "primary"
  | "neutral"
  | "ghost"
  | "muted"
  | "danger"
  | "danger-outline"
  | "gradient";

export type ButtonSize = "md" | "lg";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  children: ReactNode;
  /** Skin modifier (`btn--<variant>`). `"default"` renders the bare block. */
  variant?: ButtonVariant;
  /** `"lg"` adds `btn--lg`. */
  size?: ButtonSize;
  /** Extra classes, appended after the block/modifier classes. */
  className?: string;
}

/**
 * Explicit variant → class map (immutable). Written as literals rather than
 * `btn--${variant}` so scripts/check-classes.mjs sees every modifier as a
 * real reference (interpolation would mark the whole `btn--` stem live and
 * mask genuinely dead modifiers).
 */
const VARIANT_CLASS: Record<ButtonVariant, string | null> = {
  default: null,
  primary: "btn--primary",
  neutral: "btn--neutral",
  ghost: "btn--ghost",
  muted: "btn--muted",
  danger: "btn--danger",
  "danger-outline": "btn--danger-outline",
  gradient: "btn--gradient",
};

const SIZE_CLASS: Record<ButtonSize, string | null> = {
  md: null,
  lg: "btn--lg",
};

export function Button({
  children,
  variant = "default",
  size = "md",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        "btn",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
