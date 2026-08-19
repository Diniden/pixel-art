/**
 * rAF-coalesced render scheduling for a canvas.
 *
 * ## What this replaces
 *
 * `Canvas.tsx` scheduled its main render with a `useEffect` that cancelled any
 * in-flight frame, requested a new one, and cancelled again on cleanup — with a
 * 19-entry dependency array acting as the invalidation signal. The mechanism and
 * the signal were tangled together in one effect.
 *
 * This hook keeps the mechanism and lets the caller supply the signal as a
 * `deps` array, so "when do we redraw" stays readable at the call site while
 * "how do we redraw at most once per frame" lives here once.
 *
 * ## Why the render function goes through a ref
 *
 * The scheduled callback must call the LATEST render function, not the one that
 * existed when the frame was requested — otherwise a redraw paints with stale
 * closure values. `Canvas.tsx` solved this with a `renderRef` that it reassigned
 * every render; that structure is preserved rather than adding `render` to the
 * dependency array, which would re-schedule on every render and defeat the
 * coalescing.
 *
 * ## StrictMode
 *
 * React 19 double-invokes effects in development. The cleanup cancels the
 * pending frame and clears the handle, so a double mount schedules, cancels,
 * and re-schedules — one paint, no leaked handle. This matches the behaviour
 * W2a's R11 audit confirmed was already correct in `Canvas.tsx:1524-1562`.
 *
 * Pure: no store, no MobX, no API.
 */

import { useEffect, useRef, useCallback } from "react";

export interface CanvasRenderScheduler {
  /** Request a redraw on the next animation frame, coalescing repeats. */
  invalidate: () => void;
  /** Cancel any pending frame without drawing. */
  cancel: () => void;
}

/**
 * Schedule `render` on the next animation frame whenever `deps` change.
 *
 * @param render The draw function. Re-read on every frame, never captured.
 * @param deps   The invalidation signal, compared like any effect dependency.
 */
export function useCanvasRender(
  render: () => void,
  deps: React.DependencyList,
): CanvasRenderScheduler {
  const renderRef = useRef(render);
  // Deliberate render-phase write (see the module comment): the scheduled frame
  // must call the LATEST render function, and adding `render` to the effect's
  // dependencies would re-schedule every render and defeat the coalescing.
  // eslint-disable-next-line react-hooks/refs
  renderRef.current = render;

  const frameRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const invalidate = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderRef.current();
    });
  }, []);

  useEffect(() => {
    invalidate();
    return cancel;
    // `deps` IS the invalidation signal — spreading it is the point of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { invalidate, cancel };
}
