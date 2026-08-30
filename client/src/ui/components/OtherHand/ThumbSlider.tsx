/**
 * ThumbSlider — a tall vertical slider sized for a thumb.
 *
 * ⚠️ NOT an `<input type="range">`. A vertical range input is `writing-mode`
 * dependent, inconsistently supported on iPadOS Safari, and its thumb is the
 * size the platform chooses. This is a plain track that reads the pointer's
 * Y and maps it to the range, which gives a 44px-wide target, a fat knob and
 * a fill the thumb can see from the corner of the eye. Keyboard arrows are
 * wired for parity with the range input it replaces.
 *
 * `touch-action: none` on the track (in the CSS) is required: without it the
 * first vertical move is claimed by the rail's scroll and the slider never
 * sees the drag.
 *
 * `ui/` boundary: React, `classNames`, and the sibling spec type.
 */
import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { classNames } from "../../classNames";
import { snapToStep, valueAtTrackY } from "./otherHandGeometry";
import type { ThumbSliderSpec } from "./thumbWidgets";

export type ThumbSliderProps = Omit<ThumbSliderSpec, "kind" | "id">;

const defaultFormat = (value: number, step: number): string =>
  Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(1);

export function ThumbSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onDragStart,
  onDragEnd,
  trackBackground,
  format,
}: ThumbSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const valueAt = useCallback(
    (clientY: number): number => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) return value;
      return valueAtTrackY(clientY, rect.top, rect.height, min, max, step);
    },
    [value, min, max, step],
  );

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // The primary button only: a two-finger tap must not start a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onDragStart?.();
    onChange(valueAt(e.clientY));
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onChange(valueAt(e.clientY));
  };

  const handlePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onDragEnd?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step;
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = value - step;
    if (e.key === "Home") next = min;
    if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    onDragStart?.();
    onChange(snapToStep(next, min, max, step));
    onDragEnd?.();
  };

  return (
    <div className="thumb-slider">
      <span className="thumb-slider__value" aria-hidden="true">
        {format ? format(value) : defaultFormat(value, step)}
      </span>
      <div
        ref={trackRef}
        className={classNames(
          "thumb-slider__track",
          trackBackground && "thumb-slider__track--tinted",
        )}
        style={trackBackground ? { background: trackBackground } : undefined}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {/* The fill is hidden on a tinted track — the tint IS the readout. */}
        {trackBackground ? null : (
          <div
            className="thumb-slider__fill"
            style={{ height: `${percent}%` }}
          />
        )}
        <div className="thumb-slider__knob" style={{ bottom: `${percent}%` }} />
      </div>
      <span className="thumb-slider__label">{label}</span>
    </div>
  );
}
