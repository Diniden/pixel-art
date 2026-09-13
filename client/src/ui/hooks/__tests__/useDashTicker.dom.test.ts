/**
 * `useDashTicker` — the reflection guides' animation clock.
 *
 * ⚠️ THE CASES THIS EXISTS TO PIN:
 * 1. A loop that keeps running when there is nothing to animate, or after
 *    unmount, is the 2026-08-28 class of bug where a canvas rAF loop starved
 *    touch drawing. `active=false` must request no frames at all, and unmount
 *    must cancel.
 * 2. StrictMode double-mounts the effect. Two live loops would tick twice as
 *    fast and leak a handle; the cleanup must leave exactly one.
 * 3. The phase must WRAP, or the caller's `lineDashOffset` grows without bound.
 *
 * rAF is stubbed rather than driven by real frames: `vi.stubGlobal` gives a
 * frame queue this test steps by hand, plus a virtual clock behind
 * `performance.now` so the 80 ms gate is deterministic.
 *
 * ⚠️ Deliberately NO `vi.useFakeTimers()`. The hook uses no timer — it gates on
 * `performance.now()` inside the rAF callback — and vitest's fake timers replace
 * `requestAnimationFrame` with their own, which silently CLOBBERS the stub above
 * and leaves every frame unqueued (measured: 11 of 12 tests failed that way).
 * The frame queue here IS the clock.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashTicker } from "../useDashTicker";

/** Pending rAF callbacks, keyed by handle. */
let frames: Map<number, FrameRequestCallback>;
let nextHandle: number;
let now: number;
/** Every handle ever cancelled — proof that cleanup actually ran. */
let cancelled: number[];

/** Advance the virtual clock and flush exactly one frame's worth of callbacks. */
function frame(deltaMs: number) {
  now += deltaMs;
  const due = [...frames.entries()];
  frames.clear();
  act(() => {
    for (const [, cb] of due) cb(now);
  });
}

/** Run `count` frames at ~16.67 ms each, the real browser cadence. */
function frames60(count: number) {
  for (let i = 0; i < count; i++) frame(50 / 3);
}

beforeEach(() => {
  frames = new Map();
  nextHandle = 1;
  now = 0;
  cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    frames.set(handle, cb);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    cancelled.push(handle);
    frames.delete(handle);
  });
  vi.stubGlobal("performance", { now: () => now });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDashTicker", () => {
  it("⭐ requests NO frames while inactive", () => {
    const onTick = vi.fn();
    renderHook(() => useDashTicker(false, onTick));

    expect(frames.size).toBe(0);
    frames60(20);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("starts a loop when active", () => {
    renderHook(() => useDashTicker(true, vi.fn()));
    expect(frames.size).toBe(1);
  });

  it("⭐ ticks once per stepMs, NOT once per frame", () => {
    // 12 fps, not 60. Repainting the overlay every frame to move a dash a fifth
    // of a pixel is exactly the waste this gate exists to prevent.
    const onTick = vi.fn();
    renderHook(() => useDashTicker(true, onTick));

    // Four frames ≈ 66 ms: under the 80 ms step, so no tick yet.
    frames60(4);
    expect(onTick).not.toHaveBeenCalled();

    // The fifth frame crosses 80 ms.
    frames60(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(1);
  });

  it("advances the phase by one per step", () => {
    const onTick = vi.fn();
    renderHook(() => useDashTicker(true, onTick));

    frames60(5);
    frames60(5);
    frames60(5);
    expect(onTick.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it("⭐ WRAPS the phase at the period", () => {
    const onTick = vi.fn();
    renderHook(() => useDashTicker(true, onTick, { stepMs: 10, period: 4 }));

    for (let i = 0; i < 6; i++) frame(10);
    expect(onTick.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 0, 1, 2]);
  });

  it("catches up after a stall instead of running slow afterwards", () => {
    // A backgrounded tab or a long paint delivers one frame covering many
    // steps; the dashes should be where they would have been, not 4 behind.
    const onTick = vi.fn();
    renderHook(() => useDashTicker(true, onTick, { stepMs: 10, period: 8 }));

    frame(35);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(3);
    // The 5 ms remainder is carried, so the next step lands at 40 ms, not 45.
    frame(5);
    expect(onTick).toHaveBeenLastCalledWith(4);
  });

  it("keeps requesting frames as long as it is active", () => {
    renderHook(() => useDashTicker(true, vi.fn()));
    for (let i = 0; i < 30; i++) {
      expect(frames.size).toBe(1);
      frame(50 / 3);
    }
  });

  it("⭐ cancels on unmount — no ticks afterwards, handle released", () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => useDashTicker(true, onTick));

    frames60(5);
    expect(onTick).toHaveBeenCalledTimes(1);

    unmount();
    expect(frames.size).toBe(0);
    expect(cancelled.length).toBeGreaterThan(0);

    frames60(20);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("⭐ stops when `active` goes false, and restarts when it comes back", () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useDashTicker(active, onTick),
      { initialProps: { active: true } },
    );

    frames60(5);
    expect(onTick).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    expect(frames.size).toBe(0);
    frames60(20);
    expect(onTick).toHaveBeenCalledTimes(1);

    rerender({ active: true });
    expect(frames.size).toBe(1);
    frames60(5);
    expect(onTick).toHaveBeenCalledTimes(2);
    // The phase RESUMES rather than snapping back to 0 — a guide that blinks
    // out and back does not jump.
    expect(onTick).toHaveBeenLastCalledWith(2);
  });

  it("⭐ StrictMode double mount leaves exactly ONE loop", () => {
    // Two live loops would tick twice per step and leak a handle. The effect's
    // cleanup cancels the first, so only the second survives.
    const onTick = vi.fn();
    renderHook(() => useDashTicker(true, onTick), {
      reactStrictMode: true,
    });

    expect(frames.size).toBe(1);
    frames60(5);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(1);

    frames60(5);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenLastCalledWith(2);
  });

  it("⭐ calls the LATEST callback without re-creating the loop", () => {
    // The ref discipline: a caller that passes a fresh closure every render
    // (which every non-memoising caller does) must not tear the loop down —
    // that would reset the step timing and churn rAF handles forever.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (p: number) => void }) => useDashTicker(true, cb),
      { initialProps: { cb: first as (p: number) => void } },
    );

    const handleBefore = [...frames.keys()][0];
    rerender({ cb: second as (p: number) => void });
    // Same pending frame — the effect did not re-run.
    expect([...frames.keys()][0]).toBe(handleBefore);
    expect(cancelled).toEqual([]);

    frames60(5);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the loop when the timing options change", () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(
      ({ stepMs }: { stepMs: number }) =>
        useDashTicker(true, onTick, { stepMs, period: 8 }),
      { initialProps: { stepMs: 80 } },
    );

    rerender({ stepMs: 10 });
    frame(10);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
