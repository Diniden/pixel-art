/**
 * `usePencilDoubleTap` — the receiving end of the companion app's bridge.
 *
 * ⚠️ WebKit exposes no Apple Pencil double-tap event to JavaScript; the
 * gesture reaches the page only because `ios-companion`'s `WKWebView` attaches
 * a `UIPencilInteraction` and dispatches `pencil:doubletap` into it. These
 * tests pin the contract BOTH sides implement — the event name above all,
 * because a typo on either side fails silently and only on real hardware.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePencilDoubleTap,
  PENCIL_DOUBLE_TAP_EVENT,
} from "../usePencilDoubleTap";

/** Exactly what the Swift side evaluates in the page. */
const dispatchFromCompanion = () =>
  window.dispatchEvent(new CustomEvent("pencil:doubletap"));

describe("usePencilDoubleTap", () => {
  it("⭐ the event name matches what the companion app dispatches", () => {
    // The Swift side evaluates:
    //   window.dispatchEvent(new CustomEvent('pencil:doubletap'))
    // A rename on either side breaks the feature with no error anywhere.
    expect(PENCIL_DOUBLE_TAP_EVENT).toBe("pencil:doubletap");
  });

  it("runs the callback when the companion forwards a double-tap", () => {
    const onTap = vi.fn();
    renderHook(() => usePencilDoubleTap(onTap));

    act(() => void dispatchFromCompanion());
    expect(onTap).toHaveBeenCalledTimes(1);

    act(() => void dispatchFromCompanion());
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("calls the LATEST callback without re-binding on every render", () => {
    // The callback is read through a ref, so a caller passing an inline arrow
    // does not detach and reattach the listener each render.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePencilDoubleTap(cb), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => void dispatchFromCompanion());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount", () => {
    const onTap = vi.fn();
    const { unmount } = renderHook(() => usePencilDoubleTap(onTap));

    unmount();
    act(() => void dispatchFromCompanion());
    expect(onTap).not.toHaveBeenCalled();
  });

  it("is inert where no companion app exists — no event, no call", () => {
    // Desktop and plain Safari never deliver this, and that must degrade to
    // "the feature is absent", not to an error.
    const onTap = vi.fn();
    renderHook(() => usePencilDoubleTap(onTap));

    act(() => void window.dispatchEvent(new CustomEvent("some-other-event")));
    expect(onTap).not.toHaveBeenCalled();
  });
});
