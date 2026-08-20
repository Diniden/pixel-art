/**
 * SelectionControls — selection mode, behaviour, and expand/shrink/clear
 * (REFRESH task 35).
 *
 * ⚠️ **The live `Selection` object does NOT cross this boundary.** The
 * pre-split code read `selection.bounds.width`, `selection.bounds.height` and
 * `selection.mask.size` straight off the store. `mask` is a `Set` of packed
 * cell indices — on the owner's real project a selection can hold tens of
 * thousands of entries, and it is the selection analogue of a pixel grid (R2):
 * a container that passed it down would make every marching-ants tick a prop
 * change on this component.
 *
 * So the container projects it to `SelectionSummary` — three numbers — and
 * `selection == null` is spelled as `summary === null`. That is the same rule
 * the task applies to layer lists: never pass an observable array or a domain
 * node, project it to a flat view-model.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `SelectionBehavior` and `SelectionMode` from `src/types` (domain
 * types, permitted in `ui/components/`), the `Icon` primitive, `lucide-react`
 * for the glyph, and this file's own stylesheet. No store, no MobX, no API.
 */
import type { SelectionBehavior, SelectionMode } from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { X } from "lucide-react";
import "./RightSidebarTopControls.css";

const SELECTION_MODES: { id: SelectionMode; label: string }[] = [
  { id: "rect", label: "Rect" },
  { id: "flood", label: "Flood" },
  { id: "lasso", label: "Lasso" },
  { id: "color", label: "Color" },
];

const SELECTION_BEHAVIORS: { id: SelectionBehavior; label: string }[] = [
  { id: "movePixels", label: "Move pixels" },
  { id: "moveSelection", label: "Move selection" },
  { id: "editMask", label: "Edit mask" },
];

/**
 * The flat projection of a live `Selection`. Three numbers — never the mask.
 */
export interface SelectionSummary {
  width: number;
  height: number;
  /** `selection.mask.size` — the count, not the Set. */
  pixelCount: number;
}

export interface SelectionControlsProps {
  /** `null` when there is no active selection. */
  summary: SelectionSummary | null;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
  selectionBehavior: SelectionBehavior;
  onSelectionBehaviorChange: (behavior: SelectionBehavior) => void;
  onExpand: (by: number) => void;
  onShrink: (by: number) => void;
  onClear: () => void;
}

export function SelectionControls({
  summary,
  selectionMode,
  onSelectionModeChange,
  selectionBehavior,
  onSelectionBehaviorChange,
  onExpand,
  onShrink,
  onClear,
}: SelectionControlsProps) {
  return (
    <>
      <div className="right-sidebar-top-controls__control">
        <label className="right-sidebar-top-controls__label">Mode</label>
        <div className="right-sidebar-top-controls__segmented">
          {SELECTION_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`right-sidebar-top-controls__segment ${selectionMode === mode.id ? "right-sidebar-top-controls__segment--active" : ""}`}
              onClick={() => onSelectionModeChange(mode.id)}
              title={`Selection mode: ${mode.label}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="right-sidebar-top-controls__control">
        <label className="right-sidebar-top-controls__label">Behavior</label>
        <div className="right-sidebar-top-controls__segmented">
          {SELECTION_BEHAVIORS.map((b) => (
            <button
              key={b.id}
              className={`right-sidebar-top-controls__segment ${selectionBehavior === b.id ? "right-sidebar-top-controls__segment--active" : ""}`}
              onClick={() => onSelectionBehaviorChange(b.id)}
              title={b.label}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="right-sidebar-top-controls__control">
        <label className="right-sidebar-top-controls__label">Selection</label>
        <div className="right-sidebar-top-controls__row">
          <button
            className="right-sidebar-top-controls__btn"
            onClick={() => onShrink(1)}
            disabled={!summary}
            title="Shrink selection (−)"
          >
            −
          </button>
          <span
            className="right-sidebar-top-controls__value"
            title={
              summary
                ? `${summary.width}×${summary.height} • ${summary.pixelCount} px`
                : "No selection"
            }
          >
            {summary ? `${summary.pixelCount}px` : "—"}
          </span>
          <button
            className="right-sidebar-top-controls__btn"
            onClick={() => onExpand(1)}
            disabled={!summary}
            title="Expand selection (+)"
          >
            +
          </button>
          <button
            className="right-sidebar-top-controls__btn"
            onClick={() => onClear()}
            disabled={!summary}
            title="Deselect (Esc)"
            style={{ marginLeft: 8 }}
          >
            <Icon icon={X} size={12} />
          </button>
        </div>
      </div>
    </>
  );
}
