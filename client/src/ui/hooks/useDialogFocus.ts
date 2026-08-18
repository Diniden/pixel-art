import { useEffect, type RefObject } from "react";

/**
 * useDialogFocus — the shared Escape + focus-trap behaviour behind `Modal`
 * and `ConfirmDialog` (task 19).
 *
 * Measured baseline this replaces: across the 14 legacy modals, 0 had
 * `role="dialog"`, 0 had `aria-modal`, 0 trapped focus, and 12 of 14 could
 * not be closed with Escape at all.
 *
 * ## How "topmost" works without shared state
 *
 * `ui/` may hold no module-level mutable state (task 19 constraint), so there
 * is no dialog-stack registry. Every open dialog element carries
 * `data-ui-dialog="<id>"` + `aria-modal="true"`, and leaves a hidden ANCHOR
 * (`data-ui-dialog-anchor="<id>"`) at its position in the React tree. The
 * topmost dialog is resolved from the DOM alone:
 *
 *   1. NESTING DEPTH — a dialog whose anchor sits inside another dialog's
 *      element is logically above it (a ConfirmDialog rendered from inside a
 *      Modal anchors inside that Modal's dialog).
 *   2. DOCUMENT ORDER of the dialog elements breaks depth ties — portals
 *      appended later overlay earlier ones.
 *
 * Plain portal DOM order alone is NOT sufficient: measured in this task's
 * tests, when a Modal and its nested ConfirmDialog mount in the SAME commit,
 * React completes child portals before parent portals, so the confirm's
 * backdrop lands in the DOM BEFORE the modal overlay. The anchor depth rule
 * resolves that case correctly.
 *
 * Each open dialog installs its own document-level listeners; only the one
 * that finds itself topmost acts. That gives the Escape-precedence matrix
 * its checks 3 and 4: Escape closes only the topmost dialog, and Tab cycles
 * only within it.
 *
 * ## Cooperation with the app's global key handlers
 *
 * - `App.tsx` clears `colorAdjustment` on a window-level BUBBLE keydown.
 *   This hook listens on `document` (earlier in the bubble path) and calls
 *   `stopPropagation()` when it handles Escape, so an open dialog's Escape
 *   never reaches that handler.
 * - `Canvas.tsx:1797` registers a window-level CAPTURE keydown that clears an
 *   active selection on Escape. Capture on `window` runs before anything a
 *   later-mounted component can install, so this hook CANNOT outrank it —
 *   see the Modal completion notes. The dialog element's `aria-modal="true"` /
 *   `data-ui-dialog` markers exist precisely so that handler (rewritten by
 *   tasks 30-32) can yield with a one-line
 *   `e.target.closest('[aria-modal="true"]')` guard.
 */

/** Attribute marking every open dialog rendered by the `ui/` primitives. */
export const DIALOG_MARKER_ATTR = "data-ui-dialog";

/** Attribute marking a dialog's anchor at its React-tree position. */
export const DIALOG_ANCHOR_ATTR = "data-ui-dialog-anchor";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** How many open dialogs contain this dialog's anchor — its logical depth. */
function dialogDepth(dialog: Element): number {
  const id = dialog.getAttribute(DIALOG_MARKER_ATTR);
  const anchor = id
    ? document.querySelector(`[${DIALOG_ANCHOR_ATTR}="${id}"]`)
    : null;
  let depth = 0;
  let parent = anchor?.parentElement ?? null;
  while (parent) {
    if (parent.hasAttribute(DIALOG_MARKER_ATTR)) depth += 1;
    parent = parent.parentElement;
  }
  return depth;
}

function isTopmostDialog(node: HTMLElement): boolean {
  const dialogs = Array.from(
    document.querySelectorAll(`[${DIALOG_MARKER_ATTR}]`),
  );
  if (dialogs.length === 0) return false;
  let topmost: Element = dialogs[0] as Element;
  let topmostDepth = dialogDepth(topmost);
  for (let i = 1; i < dialogs.length; i++) {
    const candidate = dialogs[i] as Element;
    const depth = dialogDepth(candidate);
    // `>=` so document order (portal append order) breaks depth ties in
    // favour of the later-mounted dialog.
    if (depth >= topmostDepth) {
      topmost = candidate;
      topmostDepth = depth;
    }
  }
  return topmost === node;
}

function focusablesWithin(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface UseDialogFocusOptions {
  /** The dialog element (must render `data-ui-dialog` and `tabIndex={-1}`). */
  dialogRef: RefObject<HTMLElement | null>;
  /** Whether the dialog is currently open. Listeners exist only while true. */
  isOpen: boolean;
  /** Called when Escape is pressed while this dialog is topmost. */
  onEscape?: (() => void) | undefined;
}

export function useDialogFocus({
  dialogRef,
  isOpen,
  onEscape,
}: UseDialogFocusOptions): void {
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Initial focus goes to the dialog itself (tabIndex=-1): predictable, and
    // it never auto-triggers a destructive default button.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostDialog(dialog)) return;

      if (e.key === "Escape") {
        // Stop before the window-level bubble handlers (App.tsx's
        // colorAdjustment clear); see the header comment.
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
        return;
      }

      if (e.key === "Tab") {
        const focusables = focusablesWithin(dialog);
        if (focusables.length === 0) {
          e.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && dialog.contains(active);

        if (!inside) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    // If focus lands anywhere outside the TOPMOST dialog — the page behind
    // the overlay, or a lower dialog in the stack — the topmost dialog
    // reclaims it. Only the topmost dialog's guard acts, so nothing fights.
    const handleFocusIn = (e: FocusEvent) => {
      if (!isTopmostDialog(dialog)) return;
      const target = e.target;
      if (target instanceof Node && dialog.contains(target)) return;
      dialog.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      // Restore focus to wherever it was before the dialog opened, if that
      // element is still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef, isOpen, onEscape]);
}

export default useDialogFocus;
