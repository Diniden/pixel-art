import type { ReactNode } from "react";
import { Slider } from "../Slider/Slider";
import { NumberInput } from "../NumberInput/NumberInput";
import { classNames } from "../../classNames";
import "./SliderWithNumber.css";

/**
 * SliderWithNumber — a labelled slider + number-input row (task 19).
 *
 * BEM classes: `slider__row` (RESERVED by task 18's block file for this task
 * — declared in this primitive's local stylesheet, see SliderWithNumber.css),
 * `slider__label` / `slider__label--muted`, and the `slider` / `slider__input`
 * family via the `Slider` and `NumberInput` primitives.
 *
 * Replaces the 8 measured range+number rows: `LightControl.tsx:149-167` ×4
 * and `ColorPicker.tsx:538-661` ×5 are the same row.
 *
 * One value, one callback: the slider and the number input are two views of
 * the same number, so a single `onChange` serves both (every legacy row wired
 * the two controls to the same setter by hand).
 */

export interface SliderWithNumberProps {
  /** Short label rendered in `slider__label` (e.g. `R`, `G`, `B`, `H`). */
  label?: ReactNode;
  /** LightControl's larger muted label (`slider__label--muted`). */
  labelMuted?: boolean;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** LightControl's chunky slider + boxed input pair. */
  thick?: boolean;
  /** Rainbow hue track on the slider. */
  hue?: boolean;
  /** Accessible name shared by both inputs. */
  name?: string;
  className?: string;
}

export function SliderWithNumber({
  label,
  labelMuted = false,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  thick = false,
  hue = false,
  name,
  className,
}: SliderWithNumberProps) {
  const accessibleName =
    name ?? (typeof label === "string" ? label : undefined);

  return (
    <div className={classNames("slider__row", className)}>
      {label != null && (
        <span
          className={classNames(
            "slider__label",
            labelMuted && "slider__label--muted",
          )}
        >
          {label}
        </span>
      )}
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        thick={thick}
        hue={hue}
        {...(accessibleName ? { label: accessibleName } : {})}
      />
      <NumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        boxed={thick}
        {...(accessibleName ? { label: accessibleName } : {})}
      />
    </div>
  );
}

export default SliderWithNumber;
