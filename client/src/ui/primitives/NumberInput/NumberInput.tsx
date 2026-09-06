import { useCallback, useState, type InputHTMLAttributes } from "react";
import { classNames } from "../../classNames";

/**
 * NumberInput — the shared clamped number input (task 19).
 *
 * BEM classes: `slider__input` and `slider__input--boxed`
 * (`client/src/styles/blocks/slider.css`, task 18 — the number-input styling
 * in this codebase belongs to the slider family; no separate block exists and
 * task 19 may not invent one for a look that already has a name).
 *
 * Replaces the 21 measured `<input type="number">`: the twin clamps at
 * `ResizeModal.tsx:65-85` and the IDENTICAL FPS clamp duplicated at
 * `PreviewModal.tsx:449-456` and `ExportPreviewModal.tsx:506-515`.
 *
 * **Commits on blur and Enter only. Keystrokes update a local draft and never
 * call `onChange`.** Escape reverts the draft to the incoming `value` and
 * blurs. Free typing is allowed while focused — including a transiently empty
 * or out-of-range field — and the draft is parsed and clamped to `[min, max]`
 * at commit time. A live-committing branch used to exist here (task 09/02); it
 * is what made a field with `min={1}` snap to `1` after the first keystroke of
 * `10`, so it must not come back.
 */

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className" | "onChange" | "value" | "min" | "max" | "step"
> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** LightControl's centered boxed variant (`slider__input--boxed`). */
  boxed?: boolean;
  /** Accessible name for the input. */
  label?: string;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function NumberInput({
  value,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  onChange,
  boxed = false,
  label,
  className,
  onBlur,
  onKeyDown,
  ...rest
}: NumberInputProps) {
  // The draft mirrors the field while typing; `value` remains the source of
  // truth. External changes re-sync the draft via the documented
  // adjust-state-during-render pattern (react.dev: "storing information from
  // previous renders") — an effect here would be a cascading render.
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number(raw);
      const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
      setDraft(String(next));
      if (next !== value) onChange(next);
    },
    [min, max, value, onChange],
  );

  // Draft only. Never calls `onChange` — see the module header.
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value);
    },
    [],
  );

  return (
    <input
      type="number"
      className={classNames(
        "slider__input",
        boxed && "slider__input--boxed",
        className,
      )}
      value={draft}
      min={min === Number.MIN_SAFE_INTEGER ? undefined : min}
      max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
      step={step}
      onChange={handleChange}
      onBlur={(e) => {
        commit(e.target.value);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") {
          // Revert, then blur. The DOM value is written directly as well as
          // through state because the blur handler fires synchronously, before
          // React has re-rendered with the reverted draft — reading the stale
          // DOM value there would commit exactly the entry Escape discards.
          const reverted = String(value);
          setDraft(reverted);
          e.currentTarget.value = reverted;
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
      {...(label ? { "aria-label": label } : {})}
      {...rest}
    />
  );
}

export default NumberInput;
