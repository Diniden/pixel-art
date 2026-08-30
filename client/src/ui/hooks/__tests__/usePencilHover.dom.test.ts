/**
 * `usePencilHover` — the receiving end of the companion app's hover bridge.
 *
 * ⚠️ A `WKWebView` does not reliably deliver Apple Pencil hover to the page;
 * it arrives only because `ios-companion` attaches a
 * `UIHoverGestureRecognizer` and dispatches `pencil:hover` into it. These
 * tests pin the contract BOTH sides implement — the event name and the
 * payload shape above all, because a mismatch on either side fails silently
 * and only on real hardware.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePencilHover,
  parseHoverDetail,
  PENCIL_HOVER_EVENT,
} from "../usePencilHover";

/** Exactly what the Swift side evaluates in the page. */
const dispatchMove = (x: number, y: number) =>
  window.dispatchEvent(
    new CustomEvent("pencil:hover", { detail: { phase: "move", x, y } }),
  );

const dispatchEnd = () =>
  window.dispatchEvent(
    new CustomEvent("pencil:hover", { detail: { phase: "end" } }),
  );

describe("usePencilHover", () => {
  it("⭐ the event name matches what the companion app dispatches", () => {
    // The Swift side evaluates:
    //   window.dispatchEvent(new CustomEvent('pencil:hover', { detail: ... }))
    // A rename on either side breaks the feature with no error anywhere.
    expect(PENCIL_HOVER_EVENT).toBe("pencil:hover");
  });

  it("delivers a move sample as client coordinates", () => {
    const onHover = vi.fn();
    renderHook(() => usePencilHover(onHover));

    act(() => dispatchMove(120.5, 44));

    expect(onHover).toHaveBeenCalledWith({ x: 120.5, y: 44 });
  });

  it("delivers null when the pencil leaves hover range", () => {
    const onHover = vi.fn();
    renderHook(() => usePencilHover(onHover));

    act(() => dispatchEnd());

    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("calls the LATEST callback, so an inline arrow does not go stale", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePencilHover(cb), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => dispatchMove(1, 2));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ x: 1, y: 2 });
  });

  it("unsubscribes on unmount", () => {
    const onHover = vi.fn();
    const { unmount } = renderHook(() => usePencilHover(onHover));

    unmount();
    act(() => dispatchMove(5, 5));

    expect(onHover).not.toHaveBeenCalled();
  });

  describe("payload validation — the two codebases ship separately", () => {
    it("drops a sample with non-finite coordinates rather than marking NaN", () => {
      // A device-reported double can be NaN; interpolated into the Swift
      // template it would reach the page as `NaN`. Marking it would paint the
      // marker nowhere and never clear it.
      expect(parseHoverDetail({ phase: "move", x: NaN, y: 3 })).toBeUndefined();
      expect(
        parseHoverDetail({ phase: "move", x: 3, y: Infinity }),
      ).toBeUndefined();
    });

    it("drops a payload from an unrecognised companion version", () => {
      expect(parseHoverDetail({ phase: "hover-began" })).toBeUndefined();
      expect(parseHoverDetail({ x: 1, y: 2 })).toBeUndefined();
      expect(parseHoverDetail(null)).toBeUndefined();
      expect(parseHoverDetail("move")).toBeUndefined();
    });

    it("distinguishes 'end' (null) from 'unrecognised' (undefined)", () => {
      // The distinction is load-bearing: `null` CLEARS the marker, `undefined`
      // is dropped and leaves it alone. Collapsing them would make every
      // unknown payload clear the marker.
      expect(parseHoverDetail({ phase: "end" })).toBeNull();
      expect(parseHoverDetail({ phase: "wat" })).toBeUndefined();
    });

    it("an unrecognised payload never reaches the callback", () => {
      const onHover = vi.fn();
      renderHook(() => usePencilHover(onHover));

      act(() => {
        window.dispatchEvent(
          new CustomEvent("pencil:hover", { detail: { phase: "nope" } }),
        );
      });

      expect(onHover).not.toHaveBeenCalled();
    });
  });
});
