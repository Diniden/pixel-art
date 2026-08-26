/**
 * `useLongPress` — the touch route to the second tool slot.
 *
 * ⚠️ THE CASE THIS EXISTS TO PIN: a completed long press is followed by a
 * CLICK. Without the `didLongPress()` guard the caller acts twice — assigning
 * the alternate slot and then selecting the tool — so the gesture appears to
 * do the opposite of what the user intended.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "../useLongPress";

/** A pointer event with just the fields the hook reads. */
const at = (x: number, y: number) =>
  ({ clientX: x, clientY: y }) as React.PointerEvent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLongPress", () => {
  it("⭐ fires after the hold, and reports it so the click is suppressed", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.didLongPress()).toBe(false);

    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);

    // The flag must still read true when the trailing click arrives, which
    // happens AFTER pointerup — so pointerup must not clear it.
    act(() => result.current.handlers.onPointerUp());
    expect(result.current.didLongPress()).toBe(true);
  });

  it("does not fire on a quick tap, and leaves the click alone", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    act(() => void vi.advanceTimersByTime(120));
    act(() => result.current.handlers.onPointerUp());
    act(() => void vi.advanceTimersByTime(1000));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.didLongPress()).toBe(false);
  });

  it("⭐ abandons the press when the pointer drifts too far", () => {
    // A press that turns into a drag is not a long press — otherwise
    // scrolling the toolbar would reassign tools.
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    act(() => result.current.handlers.onPointerMove(at(60, 10)));
    act(() => void vi.advanceTimersByTime(1000));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tolerates the small drift of a real finger", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    act(() => result.current.handlers.onPointerMove(at(14, 13)));
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels on pointercancel — the gesture the system steals", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    act(() => result.current.handlers.onPointerCancel());
    act(() => void vi.advanceTimersByTime(1000));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("resets the flag on the NEXT press, so one guard is not permanent", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    act(() => void vi.advanceTimersByTime(500));
    act(() => result.current.handlers.onPointerUp());
    expect(result.current.didLongPress()).toBe(true);

    // A following quick tap must be treated as a normal click.
    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    expect(result.current.didLongPress()).toBe(false);
  });

  it("does not fire after unmount", () => {
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.handlers.onPointerDown(at(10, 10)));
    unmount();
    act(() => void vi.advanceTimersByTime(1000));

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
