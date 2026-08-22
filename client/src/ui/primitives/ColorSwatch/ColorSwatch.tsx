import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../classNames";
import "./ColorSwatch.css";

/**
 * ColorSwatch — the shared colour swatch button (task 19).
 *
 * BEM block: `swatch` (local stylesheet). Unifies the 3 measured
 * implementations: `LayerColors.tsx:270-278` and `ColorPicker.tsx:421-429`
 * share the `rgba(...)` background expression AND the hex-`title`
 * construction character-for-character; `PaletteManager.tsx:118-125` is a
 * third form. Both expressions now live here, once.
 *
 * Colour arrives as four plain channel numbers (0-255) — NOT a domain
 * `Pixel`/`Color` type, which a primitive may not import. The checkerboard
 * under the colour (`swatch__bg`, PaletteManager's idea) makes transparency
 * visible.
 *
 * A real `<button>` with an accessible name (the hex string, or `label`):
 * the legacy swatches were divs or nameless buttons.
 */

export interface ColorSwatchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "title"
> {
  /** Red channel, 0-255. */
  r: number;
  /** Green channel, 0-255. */
  g: number;
  /** Blue channel, 0-255. */
  b: number;
  /** Alpha channel, 0-255 (the codebase's measured convention). Default 255. */
  a?: number;
  /** Highlight as the active colour. */
  selected?: boolean;
  /** Swatch size in px. Default 20. */
  size?: number;
  /** Accessible name override; defaults to the hex string. */
  label?: string;
  className?: string;
}

function hex2(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

export function ColorSwatch({
  r,
  g,
  b,
  a = 255,
  selected = false,
  size = 20,
  label,
  type = "button",
  className,
  style,
  ...rest
}: ColorSwatchProps) {
  // The two verbatim-duplicated legacy expressions, centralised:
  const background = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  const hex = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const name = label ?? hex;

  return (
    <button
      type={type}
      className={classNames(
        "swatch",
        selected && "swatch--selected",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      title={name}
      aria-label={name}
      aria-pressed={selected}
      {...rest}
    >
      <span className="swatch__bg" aria-hidden="true" />
      <span
        className="swatch__color"
        style={{ background }}
        aria-hidden="true"
      />
    </button>
  );
}

export default ColorSwatch;
