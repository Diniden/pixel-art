/**
 * ObjectRenameDialog — the inline name editor (REFRESH task 35).
 *
 * ⚠️ **"Dialog" is the spec's name for it, not a description of its
 * behaviour.** Renaming in this panel has never been an overlay: it is an
 * `<input>` that replaces the name span in place, on double-click. Promoting
 * it to a `Modal` would turn a one-keystroke rename into a two-click modal
 * flow — a UX regression, and not what "extract the 5 dialogs" asked for. It
 * is extracted as a component because that is what removes the state (two of
 * `ObjectLibrary`'s 15 `useState` calls, `editingId` and `editingName`) and
 * because both list layouts rendered a near-identical copy of this input.
 *
 * ── The two class names are NOT interchangeable ───────────────────────────
 *
 * The normal list uses `object-library__name-input`; the small-rows list uses
 * `object-library__name-input-small`. Both are live BEM elements with
 * different sizing, so the variant is a prop rather than something this
 * component decides. (W13/W14 finished the BEM renaming — no class here may
 * be renamed, and `check-classes.mjs` cannot see a class that only ever
 * appears through interpolation, so both spellings are written out in full.)
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `useState` from React and the parent's stylesheet. No store, no
 * MobX, no API, no domain type.
 */
import { useState } from "react";
import "../ObjectLibrary.css";

export interface ObjectRenameDialogProps {
  /** The name to seed the field with. */
  initialName: string;
  /** `small` picks `__name-input-small`; see the header. */
  size?: "normal" | "small";
  /** Called with the trimmed name — never called with an empty string. */
  onRename: (name: string) => void;
  /** Called when the edit ends without a usable name (blur or empty). */
  onCancel: () => void;
}

export function ObjectRenameDialog({
  initialName,
  size = "normal",
  onRename,
  onCancel,
}: ObjectRenameDialogProps) {
  const [name, setName] = useState(initialName);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onRename(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      type="text"
      className={
        size === "small"
          ? "object-library__name-input-small"
          : "object-library__name-input"
      }
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      onClick={(e) => e.stopPropagation()}
      autoFocus
    />
  );
}
