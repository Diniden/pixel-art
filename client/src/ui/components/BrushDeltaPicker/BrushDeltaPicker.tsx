/**
 * BrushDeltaPicker — PURE (Brush Studio plan, `docs/01-brush-studio`, task 14).
 *
 * The brush studio's replacement for `ColorPicker`: one slider-with-number per
 * channel of the selected layer's channel type (`BRUSH_CHANNELS[type]`), each
 * in `BRUSH_DELTA_MIN..BRUSH_DELTA_MAX` (−255..255), a live swatch showing the
 * colourised result (`brushCellToRgba`, MASTER D5), and a Reset button.
 *
 * ⚠️ UNLIKE `ColorPicker` THERE IS NO 300 ms UNDO DEBOUNCE HERE, and none may
 * be added. The delta is UI state (`brushUI.selectedDelta`, MASTER D17), not
 * document data: editing it is not undoable, so every slider move goes
 * straight out through `onChange(index, value)`.
 *
 * `value` is always the full 4-slot `BrushDelta`; only the first
 * `BRUSH_CHANNELS[type].length` slots are shown (normal: 3, heightmap: 1).
 * Unused slots are never read or written by this component.
 *
 * Composed from the `Slider` and `NumberInput` primitives directly rather than
 * `SliderWithNumber`: the zero tick needs a positioned wrapper around the
 * track alone, and the row must forward `disabled` to both inputs.
 *
 * `touch-action: none` on the sliders is the CSS half of the two-part iPad
 * touch fix documented in `ColorPicker.css` — without it iPadOS hands the
 * first Pencil movement to the rail's scroll.
 */
import { useCallback } from "react";
import {
  BRUSH_CHANNELS,
  BRUSH_DELTA_MAX,
  BRUSH_DELTA_MIN,
  brushCellToRgba,
  type BrushChannelType,
  type BrushDelta,
} from "../../../types";
import { Slider } from "../../primitives/Slider/Slider";
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import { Button } from "../../primitives/Button/Button";
import { EmptyState } from "../../primitives/EmptyState/EmptyState";
import { classNames } from "../../classNames";
import "./BrushDeltaPicker.css";

export interface BrushDeltaPickerProps {
  /** `null` when no layer is selected → an empty state, no sliders. */
  channelType: BrushChannelType | null;
  value: BrushDelta;
  onChange(index: number, value: number): void;
  onReset(): void;
  disabled?: boolean;
  className?: string;
}

function hex2(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

interface ChannelRowProps {
  index: number;
  label: string;
  value: number;
  disabled: boolean;
  onChange(index: number, value: number): void;
}

function ChannelRow({
  index,
  label,
  value,
  disabled,
  onChange,
}: ChannelRowProps) {
  const handleChange = useCallback(
    (next: number) => onChange(index, next),
    [index, onChange],
  );
  const name = `${label} delta`;

  return (
    <div className="brush-delta-picker__row">
      <span className="brush-delta-picker__label">{label}</span>
      <div className="brush-delta-picker__track">
        <Slider
          className="brush-delta-picker__slider"
          value={value}
          min={BRUSH_DELTA_MIN}
          max={BRUSH_DELTA_MAX}
          step={1}
          onChange={handleChange}
          disabled={disabled}
          label={name}
        />
      </div>
      <NumberInput
        value={value}
        min={BRUSH_DELTA_MIN}
        max={BRUSH_DELTA_MAX}
        step={1}
        onChange={handleChange}
        disabled={disabled}
        label={name}
      />
    </div>
  );
}

export function BrushDeltaPicker({
  channelType,
  value,
  onChange,
  onReset,
  disabled = false,
  className,
}: BrushDeltaPickerProps) {
  const rootClass = classNames(
    "brush-delta-picker",
    disabled && "brush-delta-picker--disabled",
    className,
  );

  if (channelType === null) {
    return (
      <div className={rootClass}>
        <EmptyState>Select a layer</EmptyState>
      </div>
    );
  }

  const channels = BRUSH_CHANNELS[channelType];
  // `value` is a tuple, never `0`, so this is never `null` — the fallback only
  // satisfies the `BrushCell` signature.
  const rgba = brushCellToRgba(value, channelType) ?? {
    r: 127,
    g: 127,
    b: 127,
    a: 255,
  };
  const hex = `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`;
  const swatchName = `${hex} alpha ${rgba.a}`;
  const isZero = channels.every((_, i) => value[i] === 0);

  return (
    <div className={rootClass}>
      <div className="brush-delta-picker__preview">
        <div
          className="brush-delta-picker__swatch"
          role="img"
          aria-label={swatchName}
          title={swatchName}
          data-testid="brush-delta-swatch"
        >
          <span className="brush-delta-picker__swatch-bg" aria-hidden="true" />
          <span
            className="brush-delta-picker__swatch-color"
            aria-hidden="true"
            style={{
              background: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a / 255})`,
            }}
          />
        </div>
        <div className="brush-delta-picker__readout">
          <span className="brush-delta-picker__hex">{hex}</span>
          <span className="brush-delta-picker__alpha">α {rgba.a}</span>
        </div>
        <Button
          variant="ghost"
          className="brush-delta-picker__reset"
          onClick={onReset}
          disabled={disabled || isZero}
        >
          Reset
        </Button>
      </div>
      <div className="brush-delta-picker__channels">
        {channels.map((label, i) => (
          <ChannelRow
            key={label}
            index={i}
            label={label}
            value={value[i]}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

export default BrushDeltaPicker;
