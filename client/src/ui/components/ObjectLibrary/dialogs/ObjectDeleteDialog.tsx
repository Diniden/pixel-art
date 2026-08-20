/**
 * ObjectDeleteDialog — the delete confirmation (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE DIALOG THE `ConfirmDialog` PRIMITIVE WAS EXTRACTED FROM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ConfirmDialog`'s own header names `ObjectLibrary.tsx:608` as one of the
 * three hand-rolled copies it replaced (with `AddVariantModal.tsx:248` and
 * `BrowseBackupsModal.tsx:181`). Task 35's spec directs the dialogs onto the
 * primitive, so this is spec-directed adoption rather than the wholesale
 * sweep task 36 owns.
 *
 * The primitive reproduces the old markup exactly — `confirm-dialog--danger`,
 * the `__header h4` with the warning triangle, `__body` with `__warning` and
 * `__undo`, and `btn--muted` / `btn--danger` actions — so the 35 lines of
 * hand-written `createPortal` this replaces were a duplicate, not a variant.
 *
 * What the primitive ADDS, and what the hand-rolled copy did not have:
 * `role="alertdialog"`, `aria-modal`, a focus trap, and an Escape handler
 * that closes only the topmost dialog. The last one matters here: the task's
 * manual check requires the delete-confirm to render **above** the object
 * library, and `useDialogFocus` resolves "topmost" by DOM order rather than
 * module state.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: the `ConfirmDialog` and `Icon` primitives plus the `lucide-react`
 * glyph, and nothing else. No store, no MobX, no API, no domain type, and no
 * stylesheet — the primitive owns its own.
 *
 * ⚠️ The warning triangle is passed IN as part of `title`. The primitive
 * renders `title` verbatim inside its `__header h4` and does not supply an
 * icon of its own, so omitting it here would silently drop the glyph the
 * pre-split dialog had.
 */
import { ConfirmDialog } from "../../../primitives/ConfirmDialog/ConfirmDialog";
import { Icon } from "../../../primitives/Icon/Icon";
import { AlertTriangle } from "lucide-react";

export interface ObjectDeleteDialogProps {
  /** Name of the object being deleted, shown in the prompt. */
  objectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ObjectDeleteDialog({
  objectName,
  onConfirm,
  onCancel,
}: ObjectDeleteDialogProps) {
  return (
    <ConfirmDialog
      danger
      title={
        <>
          <Icon icon={AlertTriangle} size={14} /> Delete Object
        </>
      }
      message={
        <>
          Are you sure you want to delete <strong>"{objectName}"</strong>?
        </>
      }
      warning="This will permanently delete the object and all its frames and layers."
      undoNote="You can undo this action with Cmd+Z."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
