import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

/**
 * A minimal styled button — the PROOF STORY's subject, not the real primitive.
 *
 * ⚠️ TASK 12 OWNS THE REAL `Button`. This exists only so task 10 can prove the
 * Storybook harness renders with the app's real tokens, reset and web fonts.
 * Keep it small; do not grow it, and do not migrate any existing component onto
 * it — the 25+ `<something>-btn` classes in `src/components/` are renamed by
 * tasks 20-22, not by anything here.
 *
 * It obeys the `ui/` boundary: no store, no API, no MobX, no context read. Data
 * in as props, effects out as callbacks. ESLint enforces this
 * (`src/ui/primitives/**` additionally forbids domain-type imports, which is
 * why this file imports nothing from `@/types`).
 */

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the label in `var(--font-mono)` — the JetBrains Mono harness proof. */
  mono?: boolean;
  /** Extra classes, appended after the block/modifier classes. */
  className?: string;
}

export function Button({
  children,
  variant = "default",
  size = "md",
  mono = false,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variant !== "default" ? `btn--${variant}` : null,
    size !== "md" ? `btn--${size}` : null,
    mono ? "btn--mono" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export default Button;
