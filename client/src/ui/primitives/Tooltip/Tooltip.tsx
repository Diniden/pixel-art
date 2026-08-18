import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
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
 */

interface TriggerProps {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
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

  if (!isValidElement(children)) return children;
  const childProps = children.props;

  const trigger = cloneElement(children, {
    "aria-describedby": position ? id : childProps["aria-describedby"],
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show(e.currentTarget);
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      childProps.onKeyDown?.(e);
      // WCAG 1.4.13: dismissable without moving the pointer or focus.
      if (e.key === "Escape") hide();
    },
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
