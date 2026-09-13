/**
 * `useSuppressBrowserZoom` — the app-wide iOS page-zoom suppression.
 *
 * ⚠️ WHAT THESE TESTS CAN AND CANNOT PROVE. They assert that each gesture is
 * `preventDefault`ed and that every listener is released on unmount. They
 * CANNOT prove the fix works on an iPad, because the half that matters most
 * there is invisible to jsdom:
 *
 *   - `{ passive: false }`. jsdom honours `preventDefault()` on a passive
 *     listener; Safari silently discards it. A regression that dropped the
 *     option would keep these tests green and break the feature entirely.
 *   - `touch-action: none` in `styles/reset.css`, the other half of the fix.
 *     No stylesheet is applied here at all.
 *
 * So these are a contract pin, not a proof. The proof is the manual checks on
 * the device, recorded in the plan's HANDOFF.md.
 *
 * jsdom implements neither `gesturestart` (a Safari-only, non-standard event)
 * nor `TouchEvent` with a populated `touches` list, so both are constructed by
 * hand below — which is also exactly how the real events reach the listener.
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSuppressBrowserZoom } from "../useSuppressBrowserZoom";

/**
 * Safari's pinch event. Non-standard and absent from jsdom, so a bare
 * `Event` with the same type is a faithful stand-in — the handler reads
 * nothing off it but `preventDefault`.
 */
const gestureEvent = (type: string) => new Event(type, { cancelable: true });

/**
 * A `touchmove`/`touchend` carrying a given number of touches. jsdom has no
 * `TouchEvent` constructor, so `touches` is attached directly; the handler
 * only ever reads `.length`.
 */
const touchEvent = (type: string, touchCount: number) => {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, "touches", {
    value: Array.from({ length: touchCount }, () => ({})),
  });
  return e;
};

describe("useSuppressBrowserZoom", () => {
  it("⭐ prevents Safari's gesture events — the standard iOS pinch-zoom lever", () => {
    renderHook(() => useSuppressBrowserZoom());

    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const e = gestureEvent(type);
      document.dispatchEvent(e);
      expect(e.defaultPrevented, `${type} must be prevented`).toBe(true);
    }
  });

  it("⭐ prevents dblclick, which iOS synthesises after a double-tap", () => {
    renderHook(() => useSuppressBrowserZoom());

    const e = new MouseEvent("dblclick", { cancelable: true, bubbles: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("prevents a MULTI-touch touchmove but never a single-touch one", () => {
    renderHook(() => useSuppressBrowserZoom());

    const pinch = touchEvent("touchmove", 2);
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    // ⚠️ The load-bearing half of this test. A one-finger move is a stroke, a
    // pan, a slider drag or a rail scroll. Claiming it would break the whole
    // app rather than just its zoom.
    const stroke = touchEvent("touchmove", 1);
    document.dispatchEvent(stroke);
    expect(stroke.defaultPrevented).toBe(false);
  });

  it("prevents the SECOND touchend of a double-tap, but not the first", () => {
    renderHook(() => useSuppressBrowserZoom());

    // iOS zooms on the second tap and only afterwards synthesises `dblclick`,
    // so the interval has to be measured here to catch it in time.
    const first = touchEvent("touchend", 0);
    document.dispatchEvent(first);
    expect(first.defaultPrevented, "a single tap must pass through").toBe(
      false,
    );

    const second = touchEvent("touchend", 0);
    document.dispatchEvent(second);
    expect(second.defaultPrevented, "the double-tap must be claimed").toBe(
      true,
    );
  });

  it("⭐ removes every listener on unmount", () => {
    const { unmount } = renderHook(() => useSuppressBrowserZoom());
    unmount();

    // Each of the four listener kinds, after teardown. A leaked one would go
    // on eating gestures for the rest of the document's life.
    const gesture = gestureEvent("gesturestart");
    document.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(false);

    const dbl = new MouseEvent("dblclick", { cancelable: true });
    document.dispatchEvent(dbl);
    expect(dbl.defaultPrevented).toBe(false);

    const move = touchEvent("touchmove", 2);
    document.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);

    document.dispatchEvent(touchEvent("touchend", 0));
    const end = touchEvent("touchend", 0);
    document.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(false);
  });
});
