/**
 * ObjectResizeDialog — new width/height plus the 9-anchor picker
 * (REFRESH task 35).
 *
 * Six of `ObjectLibrary`'s 15 `useState` calls were this panel:
 * `showResizeFor`, `resizeWidth`, `resizeHeight`, `resizeAnchor`,
 * `originalWidth` and `originalHeight`. They collapse to this component's own
 * three, seeded from props, plus one `resizingObjectId` upstream.
 *
 * ⚠️ **It renders in place, NOT as a `Modal`.** The pre-split
 * `object-library__resize-panel` appeared INSIDE the object's list entry,
 * directly beneath the row being resized, so the anchor grid sat next to the
 * thumbnail it described. Portalling it to `document.body` would break that
 * association and move the panel across the screen — a visible UX change this
 * task did not license. The spec's "the dialogs use the `Modal` and
 * `ConfirmDialog` primitives" is honoured where the pre-split code was
 * already an overlay (`ObjectDeleteDialog`); it is not a licence to promote
 * an inline panel into a modal.
 *
 * ⚠️ `AnchorGrid` needs BOTH the current and the new dimensions — it draws
 * the old box inside the new one to show where the content lands. The current
 * size therefore arrives as props (`currentWidth`/`currentHeight`) and is
 * never derived from the editable fields, which is what the pre-split
 * `originalWidth`/`originalHeight` pair existed for.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `useState` from React, the pure `AnchorGrid` component and its
 * `AnchorPosition` type, and the parent's stylesheet. `AnchorGrid` is a
 * `memo`'d component with a stylesheet and a type re-export and holds no
 * store — W20 moved its anchor MATH out to `utils/variantHelpers` precisely
 * so the store would stop depending on a React component.
 */
import { useState } from "react";
import {
  AnchorGrid,
  type AnchorPosition,
} from "../../../../components/AnchorGrid/AnchorGrid";
import "../ObjectLibrary.css";

export interface ObjectResizeDialogProps {
  /** The object's CURRENT width — the reference box in the anchor grid. */
  currentWidth: number;
  /** The object's CURRENT height. */
  currentHeight: number;
  onApply: (width: number, height: number, anchor: AnchorPosition) => void;
  onCancel: () => void;
}

export function ObjectResizeDialog({
  currentWidth,
  currentHeight,
  onApply,
  onCancel,
}: ObjectResizeDialogProps) {
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);
  const [anchor, setAnchor] = useState<AnchorPosition>("middle-center");

  return (
    <div className="object-library__resize-panel">
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
      <div className="object-library__resize-anchor">
        <AnchorGrid
          anchor={anchor}
          onChange={setAnchor}
          currentWidth={currentWidth}
          currentHeight={currentHeight}
          newWidth={width}
          newHeight={height}
        />
      </div>
      <div className="object-library__resize-actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          className="btn btn--primary"
          onClick={() => onApply(width, height, anchor)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
