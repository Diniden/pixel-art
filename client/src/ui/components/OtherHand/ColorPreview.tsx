/**
 * ColorPreview — the resolved colour a section's sliders are currently
 * producing, shown as a square in the Other Hand bar.
 *
 * ## Why this exists
 *
 * Reported 2026-08-31: "other hand mode for color picking with any sliders:
 * there needs to be a preview of the actual color selected as a square
 * somewhere at the top of the rail."
 *
 * The colour sections drive three or four INDEPENDENT channel sliders (H/S/L
 * or R/G/B, optionally alpha). Each thumb shows its own channel, so the rail
 * could tell you every component of the colour without ever showing you the
 * colour. This closes that: one square, the composed result, always in view at
 * the top of the rail while the thumb works the sliders below.
 *
 * ## Why not `ColorSwatch`
 *
 * The `swatch` primitive is a real `<button>` with `aria-pressed`, a
 * `:hover` scale and a click affordance. This is a passive readout — nothing
 * happens when you touch it, and in Other Hand Mode a tempting-looking target
 * that does nothing is worse than no target. It is a `<div>` with
 * `role="img"`, so assistive tech announces the colour rather than offering a
 * control. The transparency checkerboard is the same idea as `swatch__bg`,
 * because alpha is an option here.
 *
 * `ui/` boundary: React types and the shared `OtherHand.css` only — colour
 * arrives as plain 0-255 channel numbers, never a domain `Color`.
 */
import type { ReactNode } from "react";
import "./OtherHand.css";

export interface ColorPreviewSpec {
  /** Red channel, 0-255. */
  r: number;
  /** Green channel, 0-255. */
  g: number;
  /** Blue channel, 0-255. */
  b: number;
  /** Alpha channel, 0-255 (the codebase's measured convention). Default 255. */
  a?: number;
  /**
   * Shown under the square. Omit for a section with ONE colour (the square is
   * unambiguous there); supply it where a section drives more than one, which
   * is what tells Light from Ambient at a glance.
   */
  label?: string;
}

export interface ColorPreviewProps {
  /** One entry per colour the section's sliders drive, in rail order. */
  colors: ColorPreviewSpec[];
}

function hex2(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

/* ⚠️ NOT exported. `react-refresh/only-export-components` allows a component
   file to export components only; a shared helper belongs in its own module.
   It is one line and has no other consumer, so it stays local. */
function previewHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function ColorPreview({ colors }: ColorPreviewProps): ReactNode {
  if (colors.length === 0) return null;

  return (
    <div className="other-hand__previews">
      {colors.map(({ r, g, b, a = 255, label }, i) => {
        const hex = previewHex(r, g, b);
        // Alpha is announced only when it is actually doing something, so the
        // common opaque case reads as a plain hex string.
        const name = label
          ? `${label}: ${hex}`
          : `Selected colour: ${hex}`;
        const announced = a < 255
          ? `${name}, ${Math.round((a / 255) * 100)}% opaque`
          : name;

        return (
          <div
            className="other-hand__preview"
            key={label ?? i}
            title={announced}
          >
            <div
              className="other-hand__preview-chip"
              role="img"
              aria-label={announced}
            >
              <span className="other-hand__preview-bg" aria-hidden="true" />
              <span
                className="other-hand__preview-color"
                style={{ background: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
                aria-hidden="true"
              />
            </div>
            {label ? (
              <span className="other-hand__preview-label">{label}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
