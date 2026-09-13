/**
 * useHslMirror — an HSL view of a colour that does not drift.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS: RGB CANNOT FAITHFULLY HOLD AN HSL TRIPLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Reported 2026-08-31: "I can slide an HSL metric back and forth and watch the
 * other values in H and L drift or move around. Things get really weird if I
 * zero out any of the values then it gets kind of stuck."
 *
 * Both are the same root cause, and both were measured before this was
 * written rather than reasoned about:
 *
 * 1. DRIFT. Dragging S at H=200, L=50 and re-deriving HSL from the resulting
 *    RGB each step walks the hue 200 → 199 → 198 → 196 → 197. At low
 *    saturation the RGB cube simply has too few distinct triples to encode
 *    360 hues, so the round trip is lossy — and the loss compounds, because
 *    each echo becomes the input to the next.
 *
 * 2. STUCK AT ZERO. At S = 0 every RGB triple is a grey, and a grey has NO
 *    hue at all. `rgbToHsl` reports h = 0, so a blue dragged to S = 0 comes
 *    back as red: raise S again and you get red, not the blue you had. The
 *    `prevHsl` guard in `colorMath` covers only the L = 0 / L = 100
 *    singularity, never this one.
 *
 * ── The fix: HSL is authoritative while the user is in it ─────────────────
 *
 * The colour the user is editing lives here as HSL, and RGB is treated as an
 * OUTPUT. When this hook produces a colour it records what the store is about
 * to echo back, so that echo is recognised and ignored rather than being
 * converted back into a slightly different HSL. Only a colour arriving from
 * genuinely OUTSIDE — the eyedropper, a palette click, undo, another device —
 * resyncs the mirror.
 *
 * That is why the hue no longer wanders while S is dragged, and why S = 0 is
 * no longer a trapdoor: the hue was never round-tripped through a grey.
 *
 * ── Provenance ───────────────────────────────────────────────────────────
 *
 * This is Other Hand Mode's `useHslMirror`, moved here VERBATIM in behaviour
 * from `containers/otherHand/colorSliders.ts` (2026-08-31) so the normal
 * `ColorPicker` can share the one implementation instead of carrying the
 * `useEffect([selectedColor])` resync that caused the report. Other Hand Mode
 * has always been immune to both symptoms for exactly this reason, which is
 * what the owner observed: "the color sliders in other hand mode work great".
 *
 * `ui/` boundary: React and the pure colour maths only. No store, no MobX.
 */
import { useCallback, useState } from "react";
import type { Color } from "../../types";
import { hslToRgb, rgbToHsl } from "../utils/colorMath";

export type Hsl = { h: number; s: number; l: number };

const sameColor = (a: Color, b: Color) =>
  a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

/**
 * An HSL view of `color` that survives the round trip through greys, black
 * and white.
 *
 * Returns the current HSL and a setter. Call the setter with the HSL the user
 * asked for — never with HSL re-derived from the colour it produced.
 */
export function useHslMirror(color: Color): [Hsl, (next: Hsl) => void] {
  /* ⚠️ ONE piece of state holding THREE things that must move together.

     `hsl` is what the user is editing. `applied` is the prop value the hook
     has reconciled against. `pending` is the colour the hook has PRODUCED and
     is still waiting for the store to echo back — `null` when it is not
     waiting for anything.

     They are one `useState` rather than three refs so this is real render
     state, reconciled the React way (`react-hooks/refs` correctly rejects
     reading or writing refs during render, and doing so is unsafe under
     concurrent rendering anyway).

     ── Why `pending` has to exist, measured while building this ────────────

     Calling the setter runs `setHsl`, which re-renders IMMEDIATELY — before
     the store has echoed anything. That render still carries the OLD prop, so
     a guard comparing "last produced" against the current prop fires on that
     intermediate render, throws away the HSL the user just chose, and then
     resyncs a second time when the real echo lands — losing the hue exactly as
     if there were no mirror at all. The measured trace:

       SET    {h:200,s:12,l:50} -> produced rgb(112,133,143)
       RENDER prop=rgb(25,161,230)    <- STALE, the echo has not arrived
              -> resync, hsl reverts to {200,80,50}
       RENDER prop=rgb(112,133,143)   <- the real echo, now unguarded
              -> resync, hsl becomes {199,12,50}   ← the drift, restored

     Holding the produced colour in `pending` and clearing it only when that
     exact colour arrives makes the intermediate render a no-op, which is what
     the mirror always intended. Anything else arriving is a genuine outside
     change and still resyncs. */
  const [state, setState] = useState<{
    hsl: Hsl;
    applied: Color;
    pending: Color | null;
  }>(() => ({
    hsl: rgbToHsl(color.r, color.g, color.b),
    applied: color,
    pending: null,
  }));

  // Derive-from-props, React's sanctioned in-render form. `setState` during
  // render re-runs this component before children see the stale value; it is
  // not an effect and does not cascade.
  if (state.pending && sameColor(state.pending, color)) {
    // The echo of our own output: reconciled, and the HSL is left ALONE.
    setState((prev) => ({ ...prev, applied: color, pending: null }));
  } else if (!state.pending && !sameColor(state.applied, color)) {
    // A colour from OUTSIDE — eyedropper, palette, undo, another device.
    // `state.hsl` is passed as `prevHsl` so the L = 0 / L = 100 singularity
    // keeps its hue on this path too.
    setState((prev) => ({
      hsl: rgbToHsl(color.r, color.g, color.b, prev.hsl),
      applied: color,
      pending: null,
    }));
  }

  const set = useCallback((next: Hsl) => {
    setState((prev) => ({
      hsl: next,
      applied: prev.applied,
      // ⚠️ THE LINE THAT FIXES THE DRIFT. Record the colour this HSL produces
      // so the store's echo of it is recognised and never round-tripped back
      // into a slightly different HSL. Alpha comes from the reconciled colour
      // inside the updater, so the callback is stable and never captures a
      // stale alpha.
      pending: { ...hslToRgb(next.h, next.s, next.l), a: prev.applied.a },
    }));
  }, []);

  return [state.hsl, set];
}
