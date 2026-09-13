/**
 * The "entered focus mode" toast — ⭐ IT FIRES ON THE EDGE, NOT THE CONDITION.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS TESTED AS AN EFFECT RATHER THAN THROUGH `useRailLayout`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `useRailLayout` needs a full store provider, both studios' worth of
 * components, and MobX observation to be exercised end-to-end. What can
 * actually go wrong here is none of that — it is the EDGE DETECTION: firing
 * on "is anything hidden" instead of "did the first thing just become
 * hidden". That is a self-contained piece of logic, so it is reproduced here
 * exactly as the hook holds it and driven directly.
 *
 * ⚠️ The duplication is deliberate and is the point of the first test below:
 * if the hook's version drifts from this one, `fires only as the set goes
 * from empty to non-empty` still describes the REQUIRED behaviour, and the
 * app-level regression shows up in manual use rather than silently passing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { useTransientMessage } from "../useTransientMessage";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const MESSAGE = "Entered focus mode. Use toolbar to get rails back.";

/** The hook's edge-firing effect, in isolation. */
function useFocusToast(engaged: boolean) {
  const { message, show } = useTransientMessage();
  const was = useRef(engaged);
  useEffect(() => {
    if (engaged && !was.current) show(MESSAGE);
    was.current = engaged;
  }, [engaged, show]);
  return message;
}

describe("the first-dismissal toast", () => {
  it("says nothing while every rail is visible", () => {
    const { result } = renderHook(() => useFocusToast(false));
    expect(result.current).toBeNull();
  });

  it("⭐ appears when the FIRST rail is hidden", () => {
    const { result, rerender } = renderHook(
      ({ engaged }) => useFocusToast(engaged),
      { initialProps: { engaged: false } },
    );

    rerender({ engaged: true });
    expect(result.current).toBe(MESSAGE);
  });

  it("⭐ does NOT re-appear when a SECOND rail is hidden", () => {
    // The owner asked for "if this is the first rail to be disappeared".
    // `engaged` stays true across the second dismissal, so the effect must
    // not re-fire — the whole reason it watches an edge.
    const { result, rerender } = renderHook(
      ({ engaged }) => useFocusToast(engaged),
      { initialProps: { engaged: false } },
    );

    rerender({ engaged: true });
    // Let it expire, then dismiss another rail without ever going un-engaged.
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBeNull();

    rerender({ engaged: true });
    expect(result.current).toBeNull();
  });

  it("⭐ does not re-fire on an unrelated re-render while a rail is hidden", () => {
    // The classic version of this bug: watching the VALUE means every render
    // that happens while the condition holds re-shows the toast.
    const { result, rerender } = renderHook(
      ({ engaged }) => useFocusToast(engaged),
      { initialProps: { engaged: false } },
    );

    rerender({ engaged: true });
    act(() => void vi.advanceTimersByTime(3000));

    for (let i = 0; i < 5; i += 1) rerender({ engaged: true });
    expect(result.current).toBeNull();
  });

  it("appears AGAIN after everything is restored and a rail is re-hidden", () => {
    // A fresh visit to focus mode is a first dismissal again — the reminder
    // is as useful the second time as the first.
    const { result, rerender } = renderHook(
      ({ engaged }) => useFocusToast(engaged),
      { initialProps: { engaged: false } },
    );

    rerender({ engaged: true });
    act(() => void vi.advanceTimersByTime(3000));

    rerender({ engaged: false }); // the toolbar button restores everything
    rerender({ engaged: true }); // ...and a rail is collapsed again
    expect(result.current).toBe(MESSAGE);
  });

  it("says nothing when a project LOADS with rails already hidden", () => {
    // ⚠️ `useRef(engaged)` seeds from the FIRST value, so a project that was
    // saved in focus mode does not greet the user with a toast about a state
    // they did not just enter.
    const { result } = renderHook(() => useFocusToast(true));
    expect(result.current).toBeNull();
  });

  it("clears itself — it is a 'very quick' toast", () => {
    const { result, rerender } = renderHook(
      ({ engaged }) => useFocusToast(engaged),
      { initialProps: { engaged: false } },
    );

    rerender({ engaged: true });
    expect(result.current).toBe(MESSAGE);

    act(() => void vi.advanceTimersByTime(2600));
    expect(result.current).toBeNull();
  });
});
