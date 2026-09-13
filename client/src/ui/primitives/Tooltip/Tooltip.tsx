import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

/**
 * Tooltip — the ONE shared tooltip mechanism (task 19).
 *
 * BEM block: `tooltip` (local stylesheet; the skin is Toolbar's measured
 * `.toolbar-fixed-tooltip` portal bubble, the best of the three incompatible
 * mechanisms it unifies: 142 bare `title=` attributes plus the two bespoke
 * portal tooltips at `CopyFromModal.tsx:72-88` and `Toolbar.tsx:38-45`).
 *
 * Why not `title=`: a `title` attribute never appears on keyboard focus and
 * cannot be styled. This tooltip shows on BOTH hover and focus (manual check
 * 6: focus a tool button with the keyboard — the tooltip must appear), hides
 * on Escape per WCAG 1.4.13, and names the trigger via `aria-describedby`.
 *
 * The single child element is cloned; its existing mouse/focus handlers are
 * preserved and called before the tooltip's own.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TOUCH: LONG-PRESS TO SHOW, RELEASE TO DISMISS (2026-08-31)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Reported: "Long hold on ipad should make them show up and release should
 * immediately dismiss. Getting weird feedback with lingering tooltips and they
 * show up at the wrong times."
 *
 * Both halves of that were the SAME missing piece: this component listened
 * only for mouse and focus. On iOS a tap synthesises `mouseenter` — with no
 * matching `mouseleave`, because a finger that has lifted is nowhere — so a
 * tapped tooltip appeared unbidden and then stayed on screen until something
 * else happened to move focus. That is the "lingering" and the "wrong times".
 *
 * The fix is to handle POINTER events for touch and pen explicitly:
 *
 *   - `pointerdown` from a finger or stylus starts a {@link LONG_PRESS_MS}
 *     timer; the bubble appears only when it completes;
 *   - `pointerup`, `pointercancel` and `pointerleave` dismiss IMMEDIATELY and
 *     cancel a pending timer, so a tap shows nothing at all and a release is
 *     instant;
 *   - movement past {@link MOVE_TOLERANCE_PX} abandons the press, so a scroll
 *     or a drag that begins on a button never raises a tooltip.
 *
 * ⚠️ MOUSE ENTER/LEAVE IS IGNORED FOR NON-MOUSE POINTERS. `pointerType` is
 * recorded on the way down and the synthetic mouse events a touch generates
 * are dropped, which is what stops a tap from showing the bubble through the
 * hover path. Without that check the touch handling below would be additive
 * rather than corrective and the lingering bubble would survive.
 */

/** How long a touch must be held before the bubble appears. */
const LONG_PRESS_MS = 500;

/** How far a held pointer may drift before the press is abandoned, in px. */
const MOVE_TOLERANCE_PX = 10;

interface TriggerProps {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  "aria-describedby"?: string;
}

export interface TooltipProps {
  /** Tooltip text/content. */
  content: ReactNode;
  /** A single element that acts as the trigger. */
  children: ReactElement<TriggerProps>;
  /** Gap between trigger and bubble in px. Default 10 (the Toolbar value). */
  offset?: number;
  /** Portal target; `document.body` when omitted or null. */
  container?: HTMLElement | null | undefined;
}

interface BubblePosition {
  x: number;
  y: number;
}

export function Tooltip({
  content,
  children,
  offset = 10,
  container,
}: TooltipProps) {
  const [position, setPosition] = useState<BubblePosition | null>(null);
  const id = useId();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  /** The pointer type of the gesture in flight — "touch", "pen" or "mouse". */
  const pointerTypeRef = useRef<string>("mouse");

  const show = useCallback(
    (target: Element) => {
      const rect = target.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + offset,
      });
    },
    [offset],
  );

  const hide = useCallback(() => {
    setPosition(null);
  }, []);

  /** Cancel a pending long press without touching what is on screen. */
  const cancelPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  // A tooltip must never outlive its trigger — an unmount mid-press would
  // otherwise fire the timer into a dead component.
  useEffect(() => cancelPress, [cancelPress]);

  /* ⚠️ NO EARLY RETURN ABOVE THIS POINT — every hook has already run by here,
     and the invalid-child guard is below, where it cannot change hook order.

     The child's own handlers are read through a ref so the callbacks below can
     have EMPTY dependency arrays. Depending on `childProps` directly would
     rebuild all ten on every render (it is a fresh object each time), which
     defeats the point of memoising them at all — and `react-hooks/refs`
     objects to ref-reading closures being handed to `cloneElement` inline. */
  const childProps = (
    isValidElement(children) ? children.props : {}
  ) as TriggerProps;
  const childPropsRef = useRef<TriggerProps>(childProps);
  useEffect(() => {
    childPropsRef.current = childProps;
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      childPropsRef.current.onMouseEnter?.(e);
      // ⚠️ Only a real mouse hovers. iOS synthesises `mouseenter` after a tap
      // and never sends the matching `mouseleave`, which is precisely how the
      // bubble used to appear unasked and then linger.
      if (pointerTypeRef.current === "mouse") show(e.currentTarget);
    },
    [show],
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      childPropsRef.current.onMouseLeave?.(e);
      hide();
    },
    [hide],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      childPropsRef.current.onPointerDown?.(e);
      pointerTypeRef.current = e.pointerType;
      if (e.pointerType === "mouse") return;
      // Touch and pen: hold to reveal.
      const target = e.currentTarget;
      // ⚠️ `cancelPress()` FIRST — it nulls `originRef` as well as the timer,
      // so recording the origin before this call would immediately wipe it and
      // the move-tolerance check below would never have an origin to compare
      // against (a drag would then never abandon the press).
      cancelPress();
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        show(target);
      }, LONG_PRESS_MS);
    },
    [cancelPress, show],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      childPropsRef.current.onPointerMove?.(e);
      const origin = originRef.current;
      if (!origin || !timerRef.current) return;
      // A press that wanders is a scroll or a drag, not a hold.
      if (
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >
        MOVE_TOLERANCE_PX
      ) {
        cancelPress();
      }
    },
    [cancelPress],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      childPropsRef.current.onPointerUp?.(e);
      // "release should immediately dismiss" — and a release BEFORE the timer
      // completes shows nothing at all, so an ordinary tap is silent.
      cancelPress();
      if (e.pointerType !== "mouse") hide();
    },
    [cancelPress, hide],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      childPropsRef.current.onPointerCancel?.(e);
      cancelPress();
      hide();
    },
    [cancelPress, hide],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      childPropsRef.current.onPointerLeave?.(e);
      cancelPress();
      if (e.pointerType !== "mouse") hide();
    },
    [cancelPress, hide],
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent) => {
      childPropsRef.current.onFocus?.(e);
      show(e.currentTarget);
    },
    [show],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      childPropsRef.current.onBlur?.(e);
      hide();
    },
    [hide],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      childPropsRef.current.onKeyDown?.(e);
      // WCAG 1.4.13: dismissable without moving the pointer or focus.
      if (e.key === "Escape") hide();
    },
    [hide],
  );

  // The guard, in its hook-safe place: every hook above has already run.
  if (!isValidElement(children)) return children;

  /* eslint-disable-next-line react-hooks/refs -- The handlers below are
     `useCallback`s that read refs only inside their bodies, and a body runs
     only in response to a DOM event, never during render. The rule cannot see
     through `cloneElement` to prove that, so it assumes the worst; the timer,
     origin and pointer-type refs are all event-lifetime state (a half-finished
     long press), which is exactly what a ref is for and what render state is
     not. Verified by `Tooltip.dom.test.tsx`'s touch suite. */
  const trigger = cloneElement(children, {
    "aria-describedby": position ? id : childProps["aria-describedby"],
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  });

  return (
    <>
      {trigger}
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="tooltip"
            style={{ left: position.x, top: position.y }}
          >
            {content}
          </div>,
          container ?? document.body,
        )}
    </>
  );
}

export default Tooltip;
