import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Color } from "../../../types";
// Task 36: the LIGHT DIRECTION half of `NormalPicker` arrives as the
// `lightDirectionPicker` ELEMENT prop rather than an import — it is
// `LightDirectionPickerContainer`, and `ui/` may not import a container. The
// other half (`selectedNormal`) is `SelectedNormalPickerContainer`, injected
// into `LightingStudioPanel` the same way. The two fields are independent and
// must stay so — see `NormalPickerContainer`.
// Task 36: `hslToRgb`/`rgbToHsl` were duplicated here VERBATIM from
// `ColorPicker.tsx` (verified byte-identical by diff). Both now come from the
// single extracted module, so the two copies cannot drift.
import { hslToRgb, rgbToHsl } from "../../utils/colorMath";
// Task 02: the four number boxes here ARE `NumberInput` — that adoption is
// about commit semantics only (a keystroke is a draft; the value applies on
// blur or Enter) and is unrelated to the `SliderWithNumber` rejection noted
// below, which is about the ROW WRAPPER and the sliders' inline gradients.
// `boxed` renders exactly the `slider__input slider__input--boxed` pair these
// rows spelled by hand, so nothing about the look changes.
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import "./LightControl.css";

interface ColorSliderProps {
  label: string;
  color: Color;
  onChange: (color: Color) => void;
}

function ColorSlider({ label, color, onChange }: ColorSliderProps) {
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  // Store last known H and S values to preserve them when L is 0 or 100
  const lastValidHsRef = useRef<{ h: number; s: number } | null>(null);

  useEffect(() => {
    // Use last valid H/S as fallback when converting from RGB
    const prevHsl = lastValidHsRef.current
      ? { ...lastValidHsRef.current, l: 0 }
      : hsl;
    const newHsl = rgbToHsl(color.r, color.g, color.b, prevHsl);
    setHsl(newHsl);
    // Update last valid H and S if L is not 0 or 100
    if (newHsl.l > 0 && newHsl.l < 100) {
      lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
    }
  }, [color]);

  const updateColor = useCallback(
    (newHsl: { h: number; s: number; l: number }) => {
      // Preserve H and S when L is 0 or 100
      let finalHsl = { ...newHsl };
      if (newHsl.l === 0 || newHsl.l === 100) {
        // Use last valid H and S if available, otherwise keep current values
        if (lastValidHsRef.current) {
          finalHsl = { ...lastValidHsRef.current, l: newHsl.l };
        } else {
          // If we don't have a last valid value, preserve current H and S
          finalHsl = { h: hsl.h, s: hsl.s, l: newHsl.l };
        }
      } else {
        // Update last valid H and S when L is not 0 or 100
        lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
      }

      setHsl(finalHsl);
      const rgb = hslToRgb(finalHsl.h, finalHsl.s, finalHsl.l);
      onChange({ ...rgb, a: 255 });
    },
    [onChange, hsl],
  );

  const getColorPreview = () => {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  return (
    <div className="light-control__color-section">
      <div className="light-control__color-header">
        <span className="light-control__color-label">{label}</span>
        <div
          className="light-control__color-preview"
          style={{ backgroundColor: getColorPreview() }}
        />
      </div>

      {/*
        ══════════════════════════════════════════════════════════════════
         ⚠️ `SliderWithNumber` DELIBERATELY NOT ADOPTED FOR THESE 3 ROWS
        ══════════════════════════════════════════════════════════════════

        The task-36 spec suggests `4× SliderWithNumber` here, and the
        primitive's own header names `LightControl.tsx:149-167` as its source.
        W27 measured the swap and rejected it — this is exactly the "phantom
        styling bug" W26 warned about.

        The INPUT classes do match: the primitive renders
        `slider slider--thick [slider__hue]` and `slider__input
        slider__input--boxed`, which is what these rows spell by hand.

        The ROW WRAPPER does not. `SliderWithNumber` hard-codes its container
        as `slider__row`:

            .slider__row      { gap: var(--space-1-5); height: 22px; }
            .light-control__row { gap: var(--space-2); margin-bottom: var(--space-1-5); }

        Adopting would (a) tighten the gap, (b) impose a fixed 22px height,
        and (c) LOSE the 6px inter-row margin — collapsing H/S/L against each
        other while the Shadow Height Scale row below kept its spacing. The
        primitive exposes `className` but appends it to `slider__row`; it
        cannot opt out of that class, so there is no way to keep this
        geometry through it.

        Additionally, the S and L sliders carry an inline `style` GRADIENT
        track (saturation and lightness ramps computed from the current hue).
        `SliderWithNumber` accepts no `style` prop and forwards none to
        `Slider`, so adopting would silently render both as plain grey tracks.

        Both problems are fixable — by giving the primitive a row-less variant
        and a `sliderStyle` passthrough — but that is a change to a shared
        primitive with 8 call sites, which is not this task's scope. Left as
        hand-rolled markup, with the reason recorded.
      */}
      <div className="light-control__row">
        <label className="slider__label slider__label--muted">H</label>
        <input
          type="range"
          className="slider slider--thick slider__hue"
          min="0"
          max="360"
          value={hsl.h}
          onChange={(e) => updateColor({ ...hsl, h: parseInt(e.target.value) })}
        />
        <NumberInput
          boxed
          label="H"
          min={0}
          max={360}
          value={hsl.h}
          onChange={(next) => updateColor({ ...hsl, h: next })}
        />
      </div>

      <div className="light-control__row">
        <label className="slider__label slider__label--muted">S</label>
        <input
          type="range"
          className="slider slider--thick"
          min="0"
          max="100"
          value={hsl.s}
          onChange={(e) => updateColor({ ...hsl, s: parseInt(e.target.value) })}
          style={{
            background: `linear-gradient(to right,
              hsl(${hsl.h}, 0%, ${hsl.l}%),
              hsl(${hsl.h}, 100%, ${hsl.l}%))`,
          }}
        />
        <NumberInput
          boxed
          label="S"
          min={0}
          max={100}
          value={hsl.s}
          onChange={(next) => updateColor({ ...hsl, s: next })}
        />
      </div>

      <div className="light-control__row">
        <label className="slider__label slider__label--muted">L</label>
        <input
          type="range"
          className="slider slider--thick"
          min="0"
          max="100"
          value={hsl.l}
          onChange={(e) => updateColor({ ...hsl, l: parseInt(e.target.value) })}
          style={{
            background: `linear-gradient(to right,
              hsl(${hsl.h}, ${hsl.s}%, 0%),
              hsl(${hsl.h}, ${hsl.s}%, 50%),
              hsl(${hsl.h}, ${hsl.s}%, 100%))`,
          }}
        />
        <NumberInput
          boxed
          label="L"
          min={0}
          max={100}
          value={hsl.l}
          onChange={(next) => updateColor({ ...hsl, l: next })}
        />
      </div>
    </div>
  );
}

/**
 * LightControl — PURE (REFRESH task 36, W27).
 *
 * The 4 store members are props now. `lightDirectionPicker` is injected as an
 * ELEMENT (it is `LightDirectionPickerContainer`, and `ui/` may not import a
 * container — MobX would cross the purity boundary transitively).
 *
 * See the long note on the H/S/L rows for why `SliderWithNumber` was measured
 * and deliberately NOT adopted here.
 */
interface LightControlProps {
  lightColor: Color;
  ambientColor: Color;
  heightScale: number;
  onLightColorChange: (color: Color) => void;
  onAmbientColorChange: (color: Color) => void;
  onHeightScaleChange: (scale: number) => void;
  /** `LightDirectionPickerContainer` element. */
  lightDirectionPicker: ReactNode;
}

export function LightControl({
  lightColor,
  ambientColor,
  heightScale,
  onLightColorChange,
  onAmbientColorChange,
  onHeightScaleChange,
  lightDirectionPicker,
}: LightControlProps) {
  return (
    <div className="light-control">
      <div className="light-control__section">{lightDirectionPicker}</div>

      <div className="light-control__section">
        <ColorSlider
          label="Light Color"
          color={lightColor}
          onChange={onLightColorChange}
        />
      </div>

      <div className="light-control__section">
        <ColorSlider
          label="Ambient Color"
          color={ambientColor}
          onChange={onAmbientColorChange}
        />
      </div>

      <div className="light-control__section">
        <div className="light-control__color-section">
          <div className="light-control__color-header">
            <span className="light-control__color-label">
              Shadow Height Scale
            </span>
          </div>
          <div className="light-control__row">
            <label className="slider__label slider__label--muted">Scale</label>
            <input
              type="range"
              className="slider slider--thick"
              min="1"
              max="500"
              value={heightScale}
              onChange={(e) => onHeightScaleChange(parseInt(e.target.value))}
            />
            <NumberInput
              boxed
              label="Scale"
              min={1}
              max={500}
              value={heightScale}
              onChange={onHeightScaleChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
