/**
 * `useDashTicker` — the animation clock for the reflection guides.
 *
 * This is the codebase's FIRST continuous overlay animation loop.
 * `useCanvasRender` is one-shot per `invalidate()`, and the marching ants are
 * static (`renderSelectionOverlay.ts`); the only other rAF loops are the modal
 * players in `PreviewModal.tsx`, whose `performance.now()` gating is imitated
 * here.
 *
 * ## Why a loop is dangerous here, and what keeps it safe
 *
 * A permanently-running rAF loop on the canvas is a known regression class in
 * this project: it competes with pointer handling and shows up as touch drawing
 * dropping samples. Three properties keep this one honest.
 *
 * 1. **It only runs when there is something to animate.** `active` is false
 *    whenever there are no lines and no draft, and the effect requests no frame
 *    at all in that state.
 * 2. **It ticks at ~12 fps, not 60.** The rAF callback fires every frame but
 *    only advances the phase and calls back once `stepMs` (default 80 ms) has
 *    elapsed — so a repaint is scheduled roughly every 5th frame. Dashes
 *    crawling one pixel every 80 ms is the marching-ants speed; repainting the
 *    overlay 60 times a second to move a dash 1/5 of a pixel would be pure
 *    waste.
 * 3. **Nothing here touches React state.** The phase lives in a ref and is
 *    handed to `onTick`, whose job is to write a ref and `invalidate()` a
 *    canvas. A `useState` per tick would re-render the container 12 times a
 *    second forever.
 *
 * ## Why `onTick` goes through a ref
 *
 * Same discipline as `useCanvasRender`'s `renderRef`. The loop must call the
 * LATEST callback, not the one that existed when the loop started — but putting
 * `onTick` in the effect's dependencies would tear down and rebuild the loop on
 * every render of the caller (callers rarely memoise), which both resets the
 * phase timing and churns rAF handles. The ref gives freshness without
 * re-creation: the effect depends only on `active` and the two numeric options.
 *
 * ## StrictMode
 *
 * React 19 double-invokes effects in development. The cleanup cancels the
 * pending frame and clears the handle, and the loop's only state outside the
 * handle is a phase ref that survives — so a double mount schedules, cancels,
 * and re-schedules, leaving exactly ONE live loop and no leaked handle. Same
 * shape `useCanvasRender` uses.
 *
 * Pure: no store, no MobX, no API.
 */

import { useEffect, useRef } from "react";

/** Milliseconds between phase steps. ≈12 fps, the marching-ants speed. */
const DEFAULT_STEP_MS = 80;

/** Phase wrap. One full dash cycle of `renderReflectionLines`' `[4,4]` dash. */
const DEFAULT_PERIOD = 8;

export interface DashTickerOptions {
  /** Milliseconds between phase increments. Default 80. */
  stepMs?: number;
  /** Phase wraps modulo this. Default 8 (`REFLECTION_DASH_PERIOD`). */
  period?: number;
}

/**
 * Run a dash-phase animation loop while `active`.
 *
 * Every `stepMs` the phase advances by 1 modulo `period` and `onTick(phase)` is
 * called. When `active` goes false — or on unmount — the loop is cancelled and
 * no further ticks arrive.
 *
 * The phase is deliberately NOT reset when the loop stops: a guide that
 * disappears and comes back resumes its crawl rather than snapping, and callers
 * that keep a phase ref see it stay put.
 *
 * @param active Whether there is anything to animate.
 * @param onTick Called with the new phase. Re-read every tick, never captured.
 */
export function useDashTicker(
  active: boolean,
  onTick: (phase: number) => void,
  options?: DashTickerOptions,
): void {
  const stepMs = options?.stepMs ?? DEFAULT_STEP_MS;
  const period = options?.period ?? DEFAULT_PERIOD;

  const onTickRef = useRef(onTick);
  // Deliberate render-phase write (see the module comment): the loop must call
  // the LATEST callback, and depending on `onTick` would rebuild the loop on
  // every render of the caller.
  // eslint-disable-next-line react-hooks/refs
  onTickRef.current = onTick;

  const phaseRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    let last = performance.now();

    const step = (now: number) => {
      // Re-request FIRST so an exception in the callback cannot silently kill
      // the loop, and so the handle is always the live one.
      frameRef.current = requestAnimationFrame(step);

      const elapsed = now - last;
      if (elapsed < stepMs) return;

      // Advance by however many steps actually elapsed rather than exactly one,
      // so a stall (a big paint, a backgrounded tab) does not leave the dashes
      // running slow afterwards. `PreviewModal`'s player carries the remainder
      // forward the same way.
      const steps = Math.floor(elapsed / stepMs);
      last = now - (elapsed % stepMs);

      phaseRef.current = (phaseRef.current + steps) % period;
      onTickRef.current(phaseRef.current);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [active, stepMs, period]);
}
