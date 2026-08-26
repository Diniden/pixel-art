/**
 * useLongPress — press-and-hold as a secondary action.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY `onContextMenu` IS NOT ENOUGH ON IPAD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A long press on iOS Safari does fire `contextmenu` — eventually, and only
 * after the system has already begun its own callout (the copy/share bubble)
 * and, on a button, its touch-callout highlight. The web page gets the event
 * late and the user gets a system menu they did not ask for. `contextmenu` is
 * still wired by callers as the POINTER equivalent (right-click on a desktop,
 * where it is exactly right); this hook is the TOUCH path, and the two are
 * complementary rather than alternatives.
 *
 * The implementation is deliberately small: a timer started on `pointerdown`
 * and cancelled by movement, release, or cancellation. It uses Pointer Events
 * rather than Touch Events so one code path serves pen, touch and mouse — and
 * so a stylus press is treated as a press, which a touch-only handler would
 * miss.
 *
 * ⚠️ `onClick` MUST STILL BE SUPPRESSED BY THE CALLER when the long press
 * fires, or a tool button both assigns the alternate slot AND selects itself.
 * `firedRef` is exposed through the returned `didLongPress()` for exactly
 * that check — see `PixelStudioTools`.
 *
 * `ui/` boundary: React and DOM only. No store, no MobX.
 */
import { useCallback, useEffect, useRef } from "react";

/** How long a press must be held. 500 ms is the platform convention. */
const LONG_PRESS_MS = 500;

/**
 * How far the pointer may drift before the press is abandoned, in px. A
 * finger is never perfectly still; anything under this is still a "hold".
 */
const MOVE_TOLERANCE_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

export interface UseLongPress {
  handlers: LongPressHandlers;
  /**
   * True when the most recent gesture completed as a long press. Callers read
   * it in `onClick` to suppress the click that follows.
   */
  didLongPress: () => boolean;
}

export function useLongPress(onLongPress: () => void): UseLongPress {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  // Read through a ref so a caller passing an inline arrow does not have to
  // memoise it to keep these handlers stable.
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      firedRef.current = false;
      originRef.current = { x: e.clientX, y: e.clientY };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        callbackRef.current();
      }, LONG_PRESS_MS);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || !timerRef.current) return;
      if (
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >
        MOVE_TOLERANCE_PX
      ) {
        clear();
      }
    },
    [clear],
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      // Release, cancel and leave all abandon a press that has not yet fired.
      // They deliberately do NOT reset `firedRef`: the click that follows a
      // completed long press arrives after pointerup, and the caller has to
      // still see the flag when it does.
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
    didLongPress: () => firedRef.current,
  };
}
