import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, type ButtonVariant } from "../Button/Button";
import { classNames } from "../../classNames";
import {
  useDialogFocus,
  DIALOG_MARKER_ATTR,
  DIALOG_ANCHOR_ATTR,
} from "../../hooks/useDialogFocus";
import "./ConfirmDialog.css";

/**
 * ConfirmDialog — the shared nested confirmation dialog (task 19).
 *
 * BEM block: `confirm-dialog` (`client/src/styles/blocks/confirm-dialog.css`,
 * task 18). Replaces the three measured implementations at
 * `ObjectLibrary.tsx:608`, `AddVariantModal.tsx:248` and
 * `BrowseBackupsModal.tsx:181`.
 *
 * Two skins, straight from the block file:
 * - **neutral** (default) — BrowseBackupsModal's padded dialog: `h3` + `p` +
 *   optional `__undo` + `__actions`.
 * - **danger** (`danger` prop) — the structured gradient dialog from the old
 *   delete-confirm twins: `__header (h4)` + `__body (p / __warning / __undo)`
 *   + `__actions`.
 *
 * `confirm-dialog__warning--callout` is the amber callout task 18's record
 * preserved from LayerPanel's deleted confirm dialog (declared in this
 * primitive's local stylesheet because a class with zero consumers fails the
 * dead-class gate; surfacing it here is exactly what the record asks for).
 *
 * Buttons are `btn` modifiers, not dialog-specific classes: danger defaults
 * to `btn--muted` cancel / `btn--danger` confirm; neutral defaults to
 * `btn--ghost` cancel / `btn--gradient` confirm.
 *
 * Escape closes only THIS dialog when it is topmost (`useDialogFocus` —
 * a ConfirmDialog opened from inside a Modal never closes the Modal), and
 * `role="alertdialog"` + `aria-modal` + a focus trap are built in.
 */

export interface ConfirmDialogProps {
  /** Dialog heading (`h3` neutral, `__header h4` danger). */
  title: ReactNode;
  /** Body copy. Strings render in the block's `p`; nodes render verbatim. */
  message?: ReactNode;
  /** Emphasized warning line (`confirm-dialog__warning`). */
  warning?: ReactNode;
  /** Render the warning as the amber callout (`__warning--callout`). */
  warningCallout?: boolean;
  /** De-emphasized "you can undo" line (`confirm-dialog__undo`). */
  undoNote?: ReactNode;
  /** The danger skin (`confirm-dialog--danger`). */
  danger?: boolean;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Override the confirm button's `btn` modifier. */
  confirmVariant?: ButtonVariant;
  /** Override the cancel button's `btn` modifier. */
  cancelVariant?: ButtonVariant;
  onConfirm: () => void;
  /** Cancel request (Escape, the cancel button, a backdrop click). */
  onCancel: () => void;
  /** Portal target; `document.body` when omitted or null. */
  container?: HTMLElement | null | undefined;
  /** Close on backdrop click. Default true. */
  closeOnBackdrop?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  warning,
  warningCallout = false,
  undoNote,
  danger = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant,
  cancelVariant,
  onConfirm,
  onCancel,
  container,
  closeOnBackdrop = true,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropMouseDownRef = useRef(false);
  const dialogId = useId();

  useDialogFocus({ dialogRef, isOpen: true, onEscape: onCancel });

  const resolvedConfirm: ButtonVariant =
    confirmVariant ?? (danger ? "danger" : "gradient");
  const resolvedCancel: ButtonVariant =
    cancelVariant ?? (danger ? "muted" : "ghost");

  const actions = (
    <div className="confirm-dialog__actions">
      <Button variant={resolvedCancel} onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button variant={resolvedConfirm} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  );

  const markerProps = { [DIALOG_MARKER_ATTR]: dialogId };
  // See Modal: the anchor marks this dialog's React-tree position so
  // useDialogFocus can resolve nesting depth ("topmost") from the DOM alone.
  const anchorProps = { [DIALOG_ANCHOR_ATTR]: dialogId };

  const portal = createPortal(
    <div
      className="confirm-dialog__backdrop"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          backdropMouseDownRef.current &&
          e.target === e.currentTarget &&
          closeOnBackdrop
        ) {
          onCancel();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        className={classNames(
          "confirm-dialog",
          danger && "confirm-dialog--danger",
        )}
        {...markerProps}
      >
        {danger ? (
          <>
            <div className="confirm-dialog__header">
              <h4>{title}</h4>
            </div>
            <div className="confirm-dialog__body">
              {typeof message === "string" ? <p>{message}</p> : message}
              {warning != null && (
                <p
                  className={classNames(
                    "confirm-dialog__warning",
                    warningCallout && "confirm-dialog__warning--callout",
                  )}
                >
                  {warning}
                </p>
              )}
              {undoNote != null && (
                <p className="confirm-dialog__undo">{undoNote}</p>
              )}
            </div>
            {actions}
          </>
        ) : (
          <>
            <h3>{title}</h3>
            {typeof message === "string" ? <p>{message}</p> : message}
            {warning != null && (
              <p
                className={classNames(
                  "confirm-dialog__warning",
                  warningCallout && "confirm-dialog__warning--callout",
                )}
              >
                {warning}
              </p>
            )}
            {undoNote != null && (
              <p className="confirm-dialog__undo">{undoNote}</p>
            )}
            {actions}
          </>
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

export default ConfirmDialog;
