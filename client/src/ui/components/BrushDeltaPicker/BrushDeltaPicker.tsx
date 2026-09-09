/**
 * BrushDeltaPicker — PURE (Brush Studio plan, `docs/01-brush-studio`, task 14;
 * edge/fill tabs from `docs/11-brush-studio-followups`, task 05).
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
 * Edge / Fill (follow-ups task 05, MASTER D10): like the colour picker, the
 * brush studio keeps TWO delta slots — edge (pencil, line, a shape's outline)
 * and fill (bucket, gaussian fill, a shape's interior). When a caller supplies
 * `target` and `onTargetChange` the picker renders a tab row above the sliders
 * whose swatches preview each slot, and the sliders edit whichever slot the
 * container resolved into `value`. Without them the row is absent and the
 * picker behaves exactly as before (the W1 caller passes neither).
 *
 * Composed from the `Slider` and `NumberInput` primitives directly rather than
 * `SliderWithNumber`: the zero tick needs a positioned wrapper around the
 * track alone, and the row must forward `disabled` to both inputs.
 *
 * `touch-action: none` on the sliders is the CSS half of the two-part iPad
 * touch fix documented in `ColorPicker.css` — without it iPadOS hands the
 * first Pencil movement to the rail's scroll.
 */
import { useCallback, type KeyboardEvent } from "react";
import { ArrowLeftRight } from "lucide-react";
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

/**
 * Which of the two delta slots the picker is editing. Declared here, not
 * imported: `ui/` may not import stores. `BrushUIStore.deltaTarget` declares
 * the structurally identical union (as `ColorPicker.ColorTarget` does for
 * `ToolUIStore`).
 */
export type BrushDeltaTarget = "edge" | "fill";

export interface BrushDeltaPickerProps {
  /** `null` when no layer is selected → an empty state, no sliders. */
  channelType: BrushChannelType | null;
  /**
   * The delta the sliders edit — whichever slot `target` names. The container
   * resolves it (as `ColorPickerContainer` does for `selectedColor`); this
   * component never picks between `edgeValue` and `fillValue` itself.
   */
  value: BrushDelta;
  onChange(index: number, value: number): void;
  onReset(): void;
  /**
   * The slot being edited. OPTIONAL, AND THAT IS LOAD-BEARING: the tab row
   * renders only when BOTH `target` and `onTargetChange` are supplied, so a
   * caller that knows nothing of slots (the plan-01 container during W1) gets
   * exactly the old single-slot picker.
   */
  target?: BrushDeltaTarget;
  onTargetChange?(target: BrushDeltaTarget): void;
  /**
   * Each slot's delta, for the swatch on its tab. Optional; each defaults to
   * `value`, so a caller without slots still gets a coherent (if redundant)
   * preview should it pass `target` alone.
   */
  edgeValue?: BrushDelta;
  fillValue?: BrushDelta;
  /**
   * Exchange the edge and fill deltas. Optional: the swap button renders only
   * when a caller supplies this (and the tab row is shown), so it can never
   * half-exist as a visible dead control. Not an undo step — deltas are UI
   * state.
   */
  onSwap?(): void;
  disabled?: boolean;
  className?: string;
}

function hex2(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

/** Mid-grey: a zero delta, and the swatch colour when no layer is selected. */
const GREY_RGBA = { r: 127, g: 127, b: 127, a: 255 } as const;

/**
 * A slot's swatch colour. `value` is a tuple, never `0`, so `brushCellToRgba`
 * never returns `null` here — the fallback only satisfies its `BrushCell`
 * signature. With no channel type there is nothing to colourise: grey.
 */
function swatchRgba(value: BrushDelta, channelType: BrushChannelType | null) {
  if (channelType === null) return GREY_RGBA;
  return brushCellToRgba(value, channelType) ?? GREY_RGBA;
}

function rgbaCss(rgba: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a / 255})`;
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

interface TargetRowProps {
  channelType: BrushChannelType | null;
  target: BrushDeltaTarget;
  onTargetChange(target: BrushDeltaTarget): void;
  edgeValue: BrushDelta;
  fillValue: BrushDelta;
  onSwap?(): void;
  disabled: boolean;
}

/**
 * Which slot is being edited — structure copied from `ColorPicker.tsx`'s
 * target row. Two tabs whose swatches show BOTH slots at once, so the pair is
 * readable without switching, and the swap button BESIDE the tablist, not
 * inside it: a third non-tab child would make a screen reader announce
 * "3 tabs". Left/Right arrows move between the tabs (roving tabindex).
 */
function TargetRow({
  channelType,
  target,
  onTargetChange,
  edgeValue,
  fillValue,
  onSwap,
  disabled,
}: TargetRowProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const next: BrushDeltaTarget = target === "edge" ? "fill" : "edge";
      onTargetChange(next);
      e.currentTarget
        .querySelector<HTMLButtonElement>(`[data-target="${next}"]`)
        ?.focus();
    },
    [target, onTargetChange],
  );

  return (
    <div className="brush-delta-picker__target-row">
      <div
        className="brush-delta-picker__targets"
        role="tablist"
        aria-label="Delta slot"
        onKeyDown={handleKeyDown}
      >
        {(
          [
            ["edge", "Edge", edgeValue],
            ["fill", "Fill", fillValue],
          ] as const
        ).map(([id, label, slot]) => {
          const active = target === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-target={id}
              className={classNames(
                "brush-delta-picker__target",
                active && "brush-delta-picker__target--active",
              )}
              onClick={() => onTargetChange(id)}
              disabled={disabled}
            >
              <span
                className="brush-delta-picker__target-swatch"
                aria-hidden="true"
                data-testid={`brush-delta-target-swatch-${id}`}
                style={{
                  backgroundColor: rgbaCss(swatchRgba(slot, channelType)),
                }}
              />
              {label}
            </button>
          );
        })}
      </div>
      {onSwap ? (
        <button
          type="button"
          className="brush-delta-picker__swap"
          title="Swap edge and fill deltas"
          aria-label="Swap edge and fill deltas"
          onClick={onSwap}
          disabled={disabled}
        >
          <ArrowLeftRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function BrushDeltaPicker({
  channelType,
  value,
  onChange,
  onReset,
  target,
  onTargetChange,
  edgeValue = value,
  fillValue = value,
  onSwap,
  disabled = false,
  className,
}: BrushDeltaPickerProps) {
  const rootClass = classNames(
    "brush-delta-picker",
    disabled && "brush-delta-picker--disabled",
    className,
  );

  const targetRow =
    target !== undefined && onTargetChange !== undefined ? (
      <TargetRow
        channelType={channelType}
        target={target}
        onTargetChange={onTargetChange}
        edgeValue={edgeValue}
        fillValue={fillValue}
        onSwap={onSwap}
        disabled={disabled}
      />
    ) : null;

  if (channelType === null) {
    return (
      <div className={rootClass}>
        {targetRow}
        <EmptyState>Select a layer</EmptyState>
      </div>
    );
  }

  const channels = BRUSH_CHANNELS[channelType];
  const rgba = swatchRgba(value, channelType);
  const hex = `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`;
  const swatchName = `${hex} alpha ${rgba.a}`;
  const isZero = channels.every((_, i) => value[i] === 0);

  return (
    <div className={rootClass}>
      {targetRow}
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
            style={{ background: rgbaCss(rgba) }}
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
