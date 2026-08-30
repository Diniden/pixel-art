/**
 * useTransientMessage — show a message for a moment, then let it go.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE CLOCK LIVES HERE AND NOT IN THE STORE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A toast is not application state. Nothing else in the app branches on
 * whether one is showing, it must never be persisted, and two tabs looking at
 * the same project should each get their own. Putting it in a MobX store
 * would make a piece of view ephemera into shared, observable state that
 * every `observer` in its subtree has to re-render for.
 *
 * It is not in the `ui/` component either, for the opposite reason: a
 * component that owns a timeout cannot be rendered in a story without the
 * story racing it, and cannot be tested without fake timers. `Toast` renders
 * whenever it is mounted; this hook decides when that is.
 *
 * ── ⚠️ IT FIRES ON A TRANSITION, NOT ON A VALUE ───────────────────────────
 *
 * `show(message)` is called from an effect watching a boolean EDGE — the
 * moment the first rail is hidden, not the whole time any rail is hidden.
 * Watching the value instead would re-fire the toast on every unrelated
 * re-render while the condition held, which is the classic version of this
 * bug and is invisible until someone dismisses a second rail.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface TransientMessage {
  /** The message to render, or `null` when nothing should show. */
  message: string | null;
  /** Show `text` for `durationMs`, replacing anything already showing. */
  show: (text: string) => void;
}

/**
 * @param durationMs How long the message stays up. The default is a "very
 *   quick" toast (owner, 2026-08-30) — long enough to read one short
 *   sentence, short enough not to sit over the canvas.
 */
export function useTransientMessage(durationMs = 2600): TransientMessage {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string) => {
      // ⚠️ Clear the previous timeout before starting a new one. Without
      // this, a second `show()` inherits the FIRST message's remaining time
      // and can vanish almost immediately.
      if (timer.current !== null) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => {
        setMessage(null);
        timer.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  // A pending timeout that fires after unmount would set state on a dead
  // component. Cleared on unmount, and only there — re-running this on every
  // `show` would cancel the very timer it just set.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}
