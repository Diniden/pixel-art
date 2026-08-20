/**
 * ObjectCreateDialog — name + width + height for a new object
 * (REFRESH task 35).
 *
 * One of the inline forms that made `ObjectLibrary` carry **15 `useState`
 * calls**. Four of them were this form (`showNewForm`, `newName`, `newWidth`,
 * `newHeight`); they are now this component's own state plus one `isOpen`
 * flag upstream.
 *
 * ⚠️ **This one is deliberately NOT a `Modal`.** It renders in place, inside
 * the panel body, exactly where `object-library__new-form` rendered before —
 * it is a disclosure form, not an overlay, and putting it in a portal would
 * be a visible UX change this task did not license. `ObjectDeleteDialog` and
 * `ObjectResizeDialog` are the ones the spec's "use the `Modal` and
 * `ConfirmDialog` primitives" applies to; see their headers.
 *
 * The default name (`Object N`) is computed by the caller, because only the
 * caller knows how many objects exist.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `useState` from React, and the parent's stylesheet. No store, no
 * MobX, no API, no domain type.
 */
import { useState } from "react";
import "../ObjectLibrary.css";

export interface ObjectCreateDialogProps {
  /** Default name when the field is left blank, e.g. `Object 3`. */
  defaultName: string;
  onCreate: (name: string, width: number, height: number) => void;
  onCancel: () => void;
}

const DEFAULT_SIZE = 32;

export function ObjectCreateDialog({
  defaultName,
  onCreate,
  onCancel,
}: ObjectCreateDialogProps) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState(DEFAULT_SIZE);
  const [height, setHeight] = useState(DEFAULT_SIZE);

  return (
    <div className="object-library__new-form">
      <input
        type="text"
        placeholder="Object name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="object-library__size-inputs">
        <div className="object-library__size-field">
          <label>W</label>
          <input
            type="number"
            min="1"
            max="256"
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value) || 1)}
          />
        </div>
        <span className="object-library__size-separator">×</span>
        <div className="object-library__size-field">
          <label>H</label>
          <input
            type="number"
            min="1"
            max="256"
            value={height}
            onChange={(e) => setHeight(parseInt(e.target.value) || 1)}
          />
        </div>
      </div>
      <div className="object-library__form-actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn--primary"
          onClick={() => onCreate(name.trim() || defaultName, width, height)}
        >
          Create
        </button>
      </div>
    </div>
  );
}
