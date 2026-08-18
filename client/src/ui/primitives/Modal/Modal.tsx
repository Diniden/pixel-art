import { useCallback, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "../IconButton/IconButton";
import { classNames } from "../../classNames";
import {
  useDialogFocus,
  DIALOG_MARKER_ATTR,
  DIALOG_ANCHOR_ATTR,
} from "../../hooks/useDialogFocus";

/**
 * Modal — the shared modal shell (task 19). The highest-value single
 * extraction in the refresh: 14 legacy modals share `backdrop > panel >
 * header` (~298 TSX + ~250 CSS lines), and the measured accessibility state
 * across all 14 was: 0 `role="dialog"`, 0 `aria-modal`, 0 focus traps, 12 of
 * 14 with no working Escape. Adopting this component fixes all of that at
 * every call site.
 *
 * BEM block: `modal` (`client/src/styles/blocks/modal.css`, task 18):
 *   modal__overlay > modal > modal__header (+h2, modal__close) >
 *   modal__body[--fill] > modal__footer[--end] > modal__actions
 * The component class supplied via `className` adds width/animation, exactly
 * as the block file's comment specifies.
 *
 * Behaviour decisions, each measured (task 19 spec):
 * - `isOpen` is OPTIONAL and defaults to `true`: 8 legacy modals early-return
 *   on `isOpen`, but 6 take no such prop and rely on conditional parent
 *   mounting; the default keeps those 6 working unchanged when they adopt.
 *   ⚠️ Migrating one of the 6 onto `isOpen` changes its unmount timing.
 * - `container` exists so the Storybook modal-host decorator (and any test)
 *   can constrain a `position: fixed` overlay to its canvas. `null`/omitted
 *   portals to `document.body`.
 * - Backdrop close tracks the MOUSEDOWN ORIGIN (the one correct legacy
 *   implementation, `AIInterpolateModal.tsx:863-874`): a drag that starts on
 *   the panel and releases over the overlay must NOT close the modal. The
 *   other 13 modals used `stopPropagation` and/or a target guard, 5 of them
 *   redundantly doubled.
 * - Escape / focus trap / focus restore come from `useDialogFocus`, which
 *   resolves "topmost" by DOM order of `[data-ui-dialog]` — no module state.
 *   See that hook for how this coexists with the app's window-level key
 *   handlers.
 */

export interface ModalProps {
  children: ReactNode;
  /**
   * Optional, DEFAULT `true` — see the header comment for why. When false
   * the modal renders nothing.
   */
  isOpen?: boolean;
  /**
   * Close request (Escape, the header close button, a backdrop click).
   * Omitting it removes the close button and disables Escape/backdrop close —
   * for flows that must resolve through an explicit action.
   */
  onClose?: (() => void) | undefined;
  /** Header title, rendered in the block's `h2`. */
  title?: ReactNode;
  /** Portal target; `document.body` when omitted or null. */
  container?: HTMLElement | null | undefined;
  /** Footer content (usually `modal__actions` buttons). */
  footer?: ReactNode;
  /** Right-align the footer (`modal__footer--end`). */
  footerEnd?: boolean;
  /** Non-scrolling flex-column body (`modal__body--fill`), for canvases. */
  bodyFill?: boolean;
  /** Component class on the dialog box (adds width/animation per the block). */
  className?: string;
  /** Close on a click that both started and ended on the overlay. Default true. */
  closeOnBackdrop?: boolean;
  /** Accessible name override when `title` is absent. */
  ariaLabel?: string;
}

export function Modal({
  children,
  isOpen = true,
  onClose,
  title,
  container,
  footer,
  footerEnd = false,
  bodyFill = false,
  className,
  closeOnBackdrop = true,
  ariaLabel,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropMouseDownRef = useRef(false);
  const titleId = useId();
  const dialogId = useId();

  useDialogFocus({ dialogRef, isOpen, onEscape: onClose });

  // The correct backdrop-close: track where the press STARTED, so a
  // drag-release outside the panel does not close the modal.
  const handleBackdropMouseDown = useCallback((e: React.MouseEvent) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        backdropMouseDownRef.current &&
        e.target === e.currentTarget &&
        closeOnBackdrop &&
        onClose
      ) {
        onClose();
      }
      backdropMouseDownRef.current = false;
    },
    [closeOnBackdrop, onClose],
  );

  if (!isOpen) return null;

  const hasTitle = title !== undefined && title !== null;
  const markerProps = { [DIALOG_MARKER_ATTR]: dialogId };
  // The anchor stays at this component's REACT position (not in the portal):
  // a dialog whose anchor sits inside another dialog's element is nested
  // above it — how useDialogFocus resolves "topmost" without shared state.
  const anchorProps = { [DIALOG_ANCHOR_ATTR]: dialogId };

  const portal = createPortal(
    <div
      className="modal__overlay"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        {...(hasTitle
          ? { "aria-labelledby": titleId }
          : { "aria-label": ariaLabel ?? "Dialog" })}
        tabIndex={-1}
        className={classNames("modal", className)}
        {...markerProps}
      >
        {(hasTitle || onClose) && (
          <div className="modal__header">
            {hasTitle && <h2 id={titleId}>{title}</h2>}
            {onClose && (
              <IconButton
                icon={X}
                label="Close"
                className="modal__close"
                onClick={onClose}
              />
            )}
          </div>
        )}
        <div
          className={classNames("modal__body", bodyFill && "modal__body--fill")}
        >
          {children}
        </div>
        {footer !== undefined && footer !== null && (
          <div
            className={classNames(
              "modal__footer",
              footerEnd && "modal__footer--end",
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    container ?? document.body,
  );

  return (
    <>
      <span hidden {...anchorProps} />
      {portal}
    </>
  );
}

export default Modal;
