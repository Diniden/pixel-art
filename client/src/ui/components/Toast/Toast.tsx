/**
 * Toast — a brief, self-dismissing message over the workspace.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ IT ANNOUNCES, IT DOES NOT ASK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is deliberately no dismiss button, no action link and no `onClose`.
 * A toast that can be interacted with is a dialog with a timer attached — it
 * competes for the pointer at the exact moment the user is doing something
 * else, and it raises the question of what happens if they ignore it. This
 * one states a fact the user can act on later, at their leisure, using a
 * control that is already on screen.
 *
 * `pointer-events: none` in the CSS is the structural version of that claim:
 * the toast cannot be clicked at all, so it can never swallow a click meant
 * for the canvas underneath it.
 *
 * ── The timer is the CALLER's, not this component's ───────────────────────
 *
 * This renders whenever it is mounted and disappears when it is not. It holds
 * no timeout, which keeps it a pure function of its props and means a story
 * can show one indefinitely. `useTransientMessage` owns the clock — see that
 * hook for why the timing belongs there.
 *
 * `ui/` boundary: React, `classNames`, own CSS. No store, no MobX, no timers.
 */
import { classNames } from "../../classNames";
import "./Toast.css";

export interface ToastProps {
  /** The message. One short sentence, or two at most — see the CSS width. */
  children: React.ReactNode;
  /**
   * Where it sits over the workspace. `bottom` is the default and the right
   * answer for a status announcement: the top of this app is header and
   * toolbar, and a toast there covers the very controls a message is most
   * likely to be about.
   */
  position?: "bottom" | "top";
}

export function Toast({ children, position = "bottom" }: ToastProps) {
  return (
    <div
      className={classNames("toast", `toast--${position}`)}
      // `status`, not `alert`: this is advisory, and `alert` interrupts a
      // screen-reader user mid-sentence for something that does not need it.
      role="status"
      aria-live="polite"
    >
      <div className="toast__body">{children}</div>
    </div>
  );
}
