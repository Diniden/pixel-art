/**
 * useHslMirror — the fix for the 2026-08-31 "HSL drifts / gets stuck" report.
 *
 * Every case here was MEASURED against the old behaviour before being written,
 * and each fails without the mirror. The two symptoms the owner described:
 *
 *   "I can slide an HSL metric back and forth and watch the other values in H
 *    and L drift or move around. Things get really weird if I zero out any of
 *    the values then it gets kind of stuck."
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHslMirror } from "../useHslMirror";
import { hslToRgb, rgbToHsl } from "../../utils/colorMath";
import type { Color } from "../../../types";

const color = (r: number, g: number, b: number, a = 255): Color => ({
  r,
  g,
  b,
  a,
});

/**
 * Drive the hook the way the picker does: the user sets an HSL, the component
 * converts it to RGB and writes it to the store, and the store echoes that
 * colour straight back as the new prop.
 */
function slide(initial: Color, steps: Array<{ h: number; s: number; l: number }>) {
  const { result, rerender } = renderHook(({ c }) => useHslMirror(c), {
    initialProps: { c: initial },
  });
  const seen: Array<{ h: number; s: number; l: number }> = [];
  for (const next of steps) {
    act(() => result.current[1](next));
    const rgb = hslToRgb(next.h, next.s, next.l);
    // The store echo — the exact round trip that used to corrupt the hue.
    // ⚠️ Read `result.current` AFTER this rerender, not after the `act`:
    // `renderHook` surfaces the value from the last completed render, so
    // reading between the two lags one step behind and makes a correct hook
    // look like a drifting one.
    rerender({ c: color(rgb.r, rgb.g, rgb.b, initial.a) });
    seen.push(result.current[0]);
  }
  return seen;
}

describe("⭐ the reported DRIFT — H must not wander while S is dragged", () => {
  it("holds the hue exactly across a full saturation sweep", () => {
    // Measured on the old code: 200 → 199 → 198 → 196 → 197, because at low
    // saturation the RGB cube cannot encode 360 hues and each lossy echo fed
    // the next.
    const steps = [];
    for (let s = 90; s >= 0; s -= 3) steps.push({ h: 200, s, l: 50 });

    const seen = slide(color(25, 161, 230), steps);

    for (const hsl of seen) expect(hsl.h).toBe(200);
    expect(new Set(seen.map((x) => x.h))).toEqual(new Set([200]));
  });

  it("holds L steady while only S moves, and vice versa", () => {
    const sSweep = slide(color(25, 161, 230), [
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 40, l: 50 },
      { h: 200, s: 5, l: 50 },
    ]);
    expect(sSweep.map((x) => x.l)).toEqual([50, 50, 50]);

    const lSweep = slide(color(25, 161, 230), [
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 80, l: 20 },
      { h: 200, s: 80, l: 3 },
    ]);
    expect(lSweep.map((x) => x.s)).toEqual([80, 80, 80]);
    expect(lSweep.map((x) => x.h)).toEqual([200, 200, 200]);
  });
});

describe("⭐ the reported STUCK — zeroing a channel must be recoverable", () => {
  it("keeps the hue through S = 0, so raising S returns the SAME colour", () => {
    // The headline bug. Old behaviour: at S=0 every RGB triple is a grey, a
    // grey has no hue, so `rgbToHsl` reported h=0 — a blue came back RED and
    // there was no way to get the blue back.
    const seen = slide(color(25, 161, 230), [
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 0, l: 50 },
      { h: 200, s: 40, l: 50 },
      { h: 200, s: 80, l: 50 },
    ]);

    expect(seen.map((x) => x.h)).toEqual([200, 200, 200, 200]);
    expect(seen[3]).toEqual({ h: 200, s: 80, l: 50 });
  });

  it("keeps hue and saturation through L = 0 (black) and back", () => {
    const seen = slide(color(25, 161, 230), [
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 80, l: 0 },
      { h: 200, s: 80, l: 50 },
    ]);
    expect(seen).toEqual([
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 80, l: 0 },
      { h: 200, s: 80, l: 50 },
    ]);
  });

  it("keeps hue and saturation through L = 100 (white) and back", () => {
    const seen = slide(color(25, 161, 230), [
      { h: 200, s: 80, l: 50 },
      { h: 200, s: 80, l: 100 },
      { h: 200, s: 80, l: 50 },
    ]);
    expect(seen.map((x) => x.h)).toEqual([200, 200, 200]);
    expect(seen.map((x) => x.s)).toEqual([80, 80, 80]);
  });

  it("survives EVERY channel being zeroed in turn", () => {
    const seen = slide(color(25, 161, 230), [
      { h: 0, s: 80, l: 50 },
      { h: 0, s: 0, l: 50 },
      { h: 0, s: 0, l: 0 },
      { h: 200, s: 80, l: 50 },
    ]);
    // Nothing is trapped: the last set is honoured exactly.
    expect(seen[3]).toEqual({ h: 200, s: 80, l: 50 });
  });
});

describe("an OUTSIDE colour change still resyncs", () => {
  it("⭐ follows the eyedropper / palette / undo, which is the whole point", () => {
    // The mirror must ignore only the echo of its OWN output. A colour that
    // genuinely arrives from elsewhere has to win, or the picker would show a
    // stale colour after an eyedropper pick.
    const { result, rerender } = renderHook(({ c }) => useHslMirror(c), {
      initialProps: { c: color(25, 161, 230) },
    });
    act(() => result.current[1]({ h: 200, s: 80, l: 50 }));

    // Pure red arrives from outside — nothing this hook produced.
    rerender({ c: color(255, 0, 0) });

    expect(result.current[0]).toEqual(rgbToHsl(255, 0, 0, { h: 200, s: 80, l: 50 }));
    expect(result.current[0].h).toBe(0);
    expect(result.current[0].s).toBe(100);
  });

  it("does not resync on an echo that merely equals the produced colour", () => {
    const { result, rerender } = renderHook(({ c }) => useHslMirror(c), {
      initialProps: { c: color(128, 128, 128) },
    });
    act(() => result.current[1]({ h: 200, s: 0, l: 50 }));
    // hslToRgb(200, 0, 50) is rgb(128,128,128) — the SAME grey we started on.
    rerender({ c: color(128, 128, 128) });
    // Hue survives, even though the colour is a hueless grey.
    expect(result.current[0]).toEqual({ h: 200, s: 0, l: 50 });
  });
});
