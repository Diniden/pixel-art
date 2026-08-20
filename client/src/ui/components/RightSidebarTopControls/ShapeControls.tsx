/**
 * ShapeControls — shape mode, border radius, and the move-all-layers toggle
 * (REFRESH task 35).
 *
 * The three tool-option groups that describe *how a shape or a move is
 * applied*, as opposed to how big a stamp is (`BrushControls`) or what is
 * selected (`SelectionControls`).
 *
 * ⚠️ The border-radius slider carries `className="slider"` verbatim — see the
 * pixel-identical note in `BrushControls`. The `move all layers` toggle keeps
 * its hand-rolled `__toggle` / `__toggle-slider` / `__toggle-label` markup
 * rather than adopting the `Toggle` primitive: the primitive was DERIVED from
 * this markup (see `Toggle.tsx`'s header) but adopting it is task 36's job,
 * and swapping it here would be an unreviewed visual change.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `ShapeMode` from `src/types` (a domain type, which `ui/components/`
 * explicitly permits — only `ui/primitives/` bans them) and this file's own
 * stylesheet. No store, no MobX, no API.
 */
import type { ShapeMode } from "../../../types";
import "./RightSidebarTopControls.css";

const SHAPE_MODES: { id: ShapeMode; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "fill", label: "Fill" },
  { id: "both", label: "Both" },
];

export interface ShapeControlsProps {
  /** Show the outline/fill/both segmented control (rectangle + ellipse). */
  showShapeMode: boolean;
  /** Show the corner-radius slider (rectangle only). */
  showBorderRadius: boolean;
  /** Show the move-all-layers toggle (the move tool only). */
  showMoveAllLayers: boolean;

  shapeMode: ShapeMode;
  onShapeModeChange: (mode: ShapeMode) => void;

  borderRadius: number;
  onBorderRadiusChange: (radius: number) => void;

  moveAllLayers: boolean;
  onMoveAllLayersChange: (moveAll: boolean) => void;
}

export function ShapeControls({
  showShapeMode,
  showBorderRadius,
  showMoveAllLayers,
  shapeMode,
  onShapeModeChange,
  borderRadius,
  onBorderRadiusChange,
  moveAllLayers,
  onMoveAllLayersChange,
}: ShapeControlsProps) {
  return (
    <>
      {showShapeMode && (
        <div className="right-sidebar-top-controls__control">
          <label className="right-sidebar-top-controls__label">Mode</label>
          <div className="right-sidebar-top-controls__segmented">
            {SHAPE_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`right-sidebar-top-controls__segment ${shapeMode === mode.id ? "right-sidebar-top-controls__segment--active" : ""}`}
                onClick={() => onShapeModeChange(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showBorderRadius && (
        <div className="right-sidebar-top-controls__control">
          <label className="right-sidebar-top-controls__label">Radius</label>
          <div className="right-sidebar-top-controls__row">
            <input
              className="slider"
              type="range"
              min="0"
              max="16"
              value={borderRadius}
              onChange={(e) => onBorderRadiusChange(parseInt(e.target.value))}
            />
            <span className="right-sidebar-top-controls__value">
              {borderRadius}
            </span>
          </div>
        </div>
      )}

      {showMoveAllLayers && (
        <div className="right-sidebar-top-controls__control">
          <label className="right-sidebar-top-controls__toggle">
            <input
              type="checkbox"
              checked={moveAllLayers}
              onChange={(e) => onMoveAllLayersChange(e.target.checked)}
            />
            <span className="right-sidebar-top-controls__toggle-slider" />
            <span className="right-sidebar-top-controls__toggle-label">
              Move all layers
            </span>
          </label>
        </div>
      )}
    </>
  );
}
