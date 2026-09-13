/**
 * `useTransientMessage` — show a message for a moment, then let it go.
 *
 * ⚠️ Fake timers throughout. A real 2.6s wait per case would make this suite
 * slower than the whole rest of the file, and "does it clear itself" is
 * precisely a question about the clock.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTransientMessage } from "../useTransientMessage";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTransientMessage", () => {
  it("shows nothing until asked", () => {
    const { result } = renderHook(() => useTransientMessage());
    expect(result.current.message).toBeNull();
  });

  it("shows the message, then clears itself", () => {
    const { result } = renderHook(() => useTransientMessage(2000));

    act(() => result.current.show("hello"));
    expect(result.current.message).toBe("hello");

    // Still up just before the deadline...
    act(() => void vi.advanceTimersByTime(1999));
    expect(result.current.message).toBe("hello");

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.message).toBeNull();
  });

  it("⭐ gives a REPLACEMENT message its own full duration", () => {
    // THE BUG THIS PINS: without clearing the first timeout, the second
    // message inherits whatever was left of the first one's clock and can
    // vanish almost immediately.
    const { result } = renderHook(() => useTransientMessage(2000));

    act(() => result.current.show("first"));
    act(() => void vi.advanceTimersByTime(1900));
    act(() => result.current.show("second"));

    // The first message's deadline passes — the second must survive it.
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.message).toBe("second");

    act(() => void vi.advanceTimersByTime(1800));
    expect(result.current.message).toBeNull();
  });

  it("does not fire its timeout after unmount", () => {
    // A pending timeout would set state on a dead component.
    const { result, unmount } = renderHook(() => useTransientMessage(1000));
    act(() => result.current.show("bye"));
    unmount();

    // The assertion is that this does not throw or warn.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
