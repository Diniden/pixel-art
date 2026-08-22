import { useCallback, type InputHTMLAttributes } from "react";
import { classNames } from "../../classNames";

/**
 * Slider — the shared range input (task 19).
 *
 * BEM block: `slider` (`client/src/styles/blocks/slider.css`, task 18):
 *
 *   slider            base 4px track (legacy alias `.compact-slider`)
 *   slider--thick     8px bordered track, grab thumb (compound
 *                     `.slider.slider--thick`, LightControl's variant)
 *   slider__hue       rainbow hue track (compound `.slider.slider__hue`)
 *
 * Replaces the 27 measured `<input type="range">` (three consecutive 20-line
 * copies in EdgeInterpolateModal, LightControl ×4, ColorPicker ×5, …).
 *
 * `onChange` receives the parsed NUMBER — every legacy call site began with
 * `parseInt(e.target.value)` / `parseFloat(...)`; that parse lives here now.
 * `label` (when given) becomes `aria-label`: a bare range input has no
 * accessible name, which was the norm across all 27.
 */

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className" | "onChange" | "value" | "min" | "max" | "step"
> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** LightControl's chunky variant (`slider--thick`). */
  thick?: boolean;
  /** Rainbow hue track (`slider__hue`). */
  hue?: boolean;
  /** Accessible name for the input. */
  label?: string;
  className?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  thick = false,
  hue = false,
  label,
  className,
  ...rest
}: SliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <input
      type="range"
      className={classNames(
        "slider",
        thick && "slider--thick",
        hue && "slider__hue",
        className,
      )}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={handleChange}
      {...(label ? { "aria-label": label } : {})}
      {...rest}
    />
  );
}

export default Slider;
