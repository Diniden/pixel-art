import type { ReactNode } from "react";
import { classNames } from "../../classNames";
import "./Badge.css";

/**
 * Badge — the shared status badge (task 19).
 *
 * BEM block: `badge` (local stylesheet), with the two measured intents:
 *
 *   badge--selected   the 20px circular check badge (`.selected-badge` ×3 —
 *                     three DIFFERENT fill colours today, `#8b5cf6`/`#6366f1`/
 *                     `#10b981`, with the green winning everywhere by cascade
 *                     accident; the primitive takes the colour as a modifier
 *                     so task 21's G7 can pick each component's colour
 *                     deliberately)
 *   badge--current    the "current" pill (`.current-badge` ×3, three designs;
 *                     the primitive ships ObjectSelectModal's blue pill, the
 *                     one that currently renders everywhere)
 *
 * Colour override for `--selected` via `badge--violet` (default green — the
 * value that renders today). The measured indigo `#6366f1` is NOT a tone
 * here: task 12 collapsed it onto `--accent-variant` (violet), so indigo ≡
 * violet in the token vocabulary.
 */

export type BadgeVariant = "selected" | "current";
export type BadgeTone = "green" | "violet";

export interface BadgeProps {
  variant: BadgeVariant;
  /** Fill for `--selected` (G7's per-component decision). Default green. */
  tone?: BadgeTone;
  /** Content: a check icon for `selected`, text for `current`. */
  children?: ReactNode;
  /** Accessible name (badges are usually purely visual duplications). */
  ariaLabel?: string;
  className?: string;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  selected: "badge--selected",
  current: "badge--current",
};

const TONE_CLASS: Record<BadgeTone, string | null> = {
  green: null, // the default fill on badge--selected itself
  violet: "badge--violet",
};

export function Badge({
  variant,
  tone = "green",
  children,
  ariaLabel,
  className,
}: BadgeProps) {
  const toneClass = variant === "selected" ? TONE_CLASS[tone] : null;
  return (
    <span
      className={classNames(
        "badge",
        VARIANT_CLASS[variant],
        toneClass,
        className,
      )}
      {...(ariaLabel ? { "aria-label": ariaLabel } : { "aria-hidden": "true" })}
    >
      {children}
    </span>
  );
}

export default Badge;
