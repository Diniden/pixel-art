/**
 * colorSliders — the colour half of Other Hand Mode.
 *
 * ── HSL is mirrored locally, like the picker does ─────────────────────────
 *
 * Pure black and white have no hue or saturation, so a lightness slider
 * dragged to 0 and back would lose the hue if HSL were recomputed from RGB
 * each render. `useHslMirror` keeps the last HSL and feeds it to `rgbToHsl`
 * as the `prevHsl` fallback — the same preservation `ColorPicker` and
 * `LightControl` perform, done once here for all three colour sources.
 *
 * ── The colour sliders keep the ColorPicker's undo contract ───────────────
 *
 * `ColorPicker`'s header documents the store contract its 300ms debounce
 * preserves: `onSaveStateToHistory()` with no label when a drag STARTS (the
 * pre-image), `"Adjust color"` 300ms after it ENDS, and `adjustColor(color,
 * trackHistory)` while an adjustment is active / `setColorAndAddToHistory`
 * otherwise. `useColorSliderHistory` speaks that contract through the thumb
 * sliders' `onDragStart` / `onDragEnd` hooks, so a colour adjusted by thumb
 * undoes exactly like one adjusted by mouse.
 */
import { useCallback, useEffect, useRef } from "react";
import type { ThumbSliderSpec } from "../../ui/components/OtherHand/thumbWidgets";
import type { OtherHandColorModel } from "../../ui/layout/railLayout";
import type { Color } from "../../types";
import type { Hsl } from "../../ui/hooks/useHslMirror";

/* ⚠️ `useHslMirror` MOVED to `ui/hooks/useHslMirror.ts` on 2026-08-31, and is
   re-exported here so this module's existing importers are unchanged.

   It moved because the NORMAL `ColorPicker` needed it: that picker re-derived
   its HSL from RGB on every store echo, which made the hue drift while S was
   dragged and collapse to 0 at S = 0 — the bug the owner reported as "watch
   the other values drift around ... zero out any of the values then it gets
   kind of stuck". Other Hand Mode never had either symptom precisely because
   of this hook, so the fix was to share it rather than write a second one.
   `ColorPicker` lives under `ui/`, which may not import from `containers/`,
   so `ui/hooks/` is where a hook both layers use has to live. */
export type { Hsl };
export { useHslMirror } from "../../ui/hooks/useHslMirror";

/** The `ColorPicker` undo lifecycle, as a pair of drag hooks. */
export function useColorSliderHistory(
  colorAdjustment: boolean,
  saveStateToHistory: (label?: string) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedPreImage = useRef(false);
  const draggingRef = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onDragStart = useCallback(() => {
    draggingRef.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    savedPreImage.current = false;
    if (colorAdjustment) {
      saveStateToHistory();
      savedPreImage.current = true;
    }
  }, [colorAdjustment, saveStateToHistory]);

  const onDragEnd = useCallback(() => {
    draggingRef.current = false;
    if (!colorAdjustment || !savedPreImage.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveStateToHistory("Adjust color");
      savedPreImage.current = false;
      timer.current = null;
    }, 300);
  }, [colorAdjustment, saveStateToHistory]);

  return { onDragStart, onDragEnd, draggingRef };
}

const hueTrack =
  "linear-gradient(to top, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";

/**
 * The colour channel sliders for one `Color`, in the chosen model. Shared by
 * the colour section and both light colours — a colour is a colour.
 */
export function colorChannelSliders(opts: {
  idPrefix: string;
  labelPrefix?: string;
  color: Color;
  hsl: Hsl;
  model: OtherHandColorModel;
  includeAlpha: boolean;
  onHsl: (next: Hsl) => void;
  onRgb: (next: Color) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}): ThumbSliderSpec[] {
  const {
    idPrefix,
    labelPrefix = "",
    color,
    hsl,
    model,
    includeAlpha,
    onHsl,
    onRgb,
    onDragStart,
    onDragEnd,
  } = opts;
  const common = { kind: "slider" as const, onDragStart, onDragEnd };
  const sliders: ThumbSliderSpec[] =
    model === "hsl"
      ? [
          {
            ...common,
            id: `${idPrefix}h`,
            label: `${labelPrefix}H`,
            value: hsl.h,
            min: 0,
            max: 360,
            trackBackground: hueTrack,
            onChange: (h) => onHsl({ ...hsl, h }),
          },
          {
            ...common,
            id: `${idPrefix}s`,
            label: `${labelPrefix}S`,
            value: hsl.s,
            min: 0,
            max: 100,
            trackBackground: `linear-gradient(to top, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`,
            onChange: (s) => onHsl({ ...hsl, s }),
          },
          {
            ...common,
            id: `${idPrefix}l`,
            label: `${labelPrefix}L`,
            value: hsl.l,
            min: 0,
            max: 100,
            trackBackground: `linear-gradient(to top, hsl(${hsl.h}, ${hsl.s}%, 0%), hsl(${hsl.h}, ${hsl.s}%, 50%), hsl(${hsl.h}, ${hsl.s}%, 100%))`,
            onChange: (l) => onHsl({ ...hsl, l }),
          },
        ]
      : (["r", "g", "b"] as const).map((channel) => ({
          ...common,
          id: `${idPrefix}${channel}`,
          label: `${labelPrefix}${channel.toUpperCase()}`,
          value: color[channel],
          min: 0,
          max: 255,
          trackBackground: `linear-gradient(to top, rgb(${channel === "r" ? 0 : color.r}, ${channel === "g" ? 0 : color.g}, ${channel === "b" ? 0 : color.b}), rgb(${channel === "r" ? 255 : color.r}, ${channel === "g" ? 255 : color.g}, ${channel === "b" ? 255 : color.b}))`,
          onChange: (value: number) => onRgb({ ...color, [channel]: value }),
        }));

  if (includeAlpha) {
    sliders.push({
      ...common,
      id: `${idPrefix}a`,
      label: `${labelPrefix}A`,
      value: color.a,
      min: 0,
      max: 255,
      trackBackground: `linear-gradient(to top, rgba(${color.r}, ${color.g}, ${color.b}, 0), rgba(${color.r}, ${color.g}, ${color.b}, 1))`,
      onChange: (a) => onRgb({ ...color, a }),
    });
  }
  return sliders;
}
