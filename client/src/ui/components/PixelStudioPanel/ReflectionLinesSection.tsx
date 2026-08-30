/**
 * ReflectionLinesSection — the Reflection tool's right-rail controls
 * (reflection-tool 2026-08-29, task 06; MASTER D10).
 *
 * PURE. Like every other module under `ui/`, this one imports no store, no
 * MobX and no API: the list of lines arrives as plain `{id, label}` records
 * and every interaction leaves as a callback. `PixelStudioPanelContainer` is
 * the `observer()` seam that reads `app.reflection` and turns store lines into
 * these records via `describeLine()`.
 *
 * ⚠️ The component does NOT compute preset geometry. `presetLines()` lives in
 * `ui/canvas/model/reflection.ts` but needs the editable grid's dimensions,
 * which only the container can see; the section therefore emits nothing but
 * the preset NAME and lets the container do the maths (D10). The only thing
 * imported from the geometry module here is the `ReflectionPreset` type, so
 * the button row and the maths can never drift apart.
 *
 * Capacity: `atCapacity` is `lines.length >= MAX_REFLECTION_LINES` (8),
 * computed by the store. It disables the preset row rather than hiding it, so
 * the cap is visible rather than mysterious — the assumption recorded in
 * MASTER §1 ("stated in the UI by disabling presets at capacity").
 */
import { X } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import type { ReflectionPreset } from "../../canvas/model/reflection";
import "./ReflectionLinesSection.css";

/** One row of the list. `label` is already formatted by `describeLine()`. */
export interface ReflectionLineRow {
  id: string;
  label: string;
}

export interface ReflectionLinesSectionProps {
  /** Committed lines, in the order the store holds them. */
  lines: readonly ReflectionLineRow[];
  /** At `MAX_REFLECTION_LINES`; disables every preset button. */
  atCapacity: boolean;
  onRemoveLine: (id: string) => void;
  onClearAll: () => void;
  onApplyPreset: (preset: ReflectionPreset) => void;
}

/**
 * The five presets, in the order the request listed them ("vertical,
 * horizontal, both, diagonals, all"). Kept as a module constant so the story,
 * the dom test and the row all read the same source.
 */
const PRESETS: readonly { preset: ReflectionPreset; label: string }[] = [
  { preset: "vertical", label: "Vertical" },
  { preset: "horizontal", label: "Horizontal" },
  { preset: "both", label: "Both" },
  { preset: "diagonals", label: "Diagonals" },
  { preset: "all", label: "All" },
];

export function ReflectionLinesSection({
  lines,
  atCapacity,
  onRemoveLine,
  onClearAll,
  onApplyPreset,
}: ReflectionLinesSectionProps) {
  return (
    <div className="reflection-lines">
      <div className="reflection-lines__presets">
        {PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            type="button"
            className="reflection-lines__preset"
            onClick={() => onApplyPreset(preset)}
            disabled={atCapacity}
            title={
              atCapacity
                ? "Remove a line before adding more"
                : `Add the ${label.toLowerCase()} preset`
            }
          >
            {label}
          </button>
        ))}
      </div>

      {lines.length === 0 ? (
        <p className="reflection-lines__empty">
          Drag on the canvas to draw a reflection line
        </p>
      ) : (
        <ul className="reflection-lines__list">
          {lines.map((line, index) => (
            <li key={line.id} className="reflection-lines__item">
              <span className="reflection-lines__label">{line.label}</span>
              <button
                type="button"
                className="reflection-lines__remove"
                /* 1-based: the label names the row the owner can count to,
                   not the array index. */
                aria-label={`Remove reflection line ${index + 1}`}
                title={`Remove reflection line ${index + 1}`}
                onClick={() => onRemoveLine(line.id)}
              >
                <Icon icon={X} size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 ? (
        <button
          type="button"
          className="reflection-lines__clear"
          onClick={onClearAll}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
