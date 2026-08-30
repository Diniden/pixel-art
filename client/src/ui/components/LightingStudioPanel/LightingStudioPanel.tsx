/**
 * LightingStudioPanel — PURE (REFRESH task 36, W27).
 *
 * Task 27 gave this an `observer()` container; task 36 removes its
 * legacy Zustand-hook call so it can live under `ui/`. Every value is a prop
 * and every effect is a callback.
 *
 * ⚠️ The two children are still rendered through their own CONTAINERS, passed
 * in as the `normalPicker` and `lightControl` RENDER PROPS. They cannot be
 * imported here: `containers/` imports `mobx-react-lite`, and a `ui/` module
 * importing a container would drag MobX across the purity boundary
 * transitively. Injecting them as elements keeps this file store-free while
 * preserving task 27's per-child `observer()` seams exactly.
 *
 * ⚠️ The `?? "normals"` / `?? 128` defaults moved to the CONTAINER, not here.
 * Keeping a fallback in both places would mean two sources of truth for the
 * same default.
 */
import type { ReactNode } from "react";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import "./LightingStudioPanel.css";

interface LightingStudioPanelProps {
  brushSize: number;
  normalBrushShape: "circle" | "square";
  editMode: "normals" | "height";
  heightBrushValue: number;
  onBrushSizeChange: (size: number) => void;
  onNormalBrushShapeChange: (shape: "circle" | "square") => void;
  onHeightBrushValueChange: (value: number) => void;
  /** `SelectedNormalPickerContainer` element, injected by the container. */
  normalPicker: ReactNode;
  /** `LightControlContainer` element, injected by the container. */
  lightControl: ReactNode;
  /** Other Hand Mode for the brush (tablets only; absent = no button). */
  onOtherHandBrush?: () => void;
  /** Other Hand Mode for the light settings (tablets only). */
  onOtherHandLight?: () => void;
}

export function LightingStudioPanel({
  brushSize,
  normalBrushShape,
  editMode,
  heightBrushValue,
  onBrushSizeChange,
  onNormalBrushShapeChange,
  onHeightBrushValueChange,
  normalPicker,
  lightControl,
  onOtherHandBrush,
  onOtherHandLight,
}: LightingStudioPanelProps) {
  return (
    <div className="lighting-studio-panel">
      <div className="panel lighting-studio-panel__section">
        <div className="panel__header">
          <span className="panel__title">
            {editMode === "height" ? "Height Brush" : "Normal Brush"}
          </span>
          {onOtherHandBrush ? (
            <OtherHandButton
              onClick={onOtherHandBrush}
              sectionLabel={
                editMode === "height" ? "Height Brush" : "Normal Brush"
              }
            />
          ) : null}
        </div>
        <div className="panel__body panel__body--stack">
          {editMode === "height" ? (
            <div
              className="lighting-studio-panel__brush-controls"
              style={{ paddingTop: 8 }}
            >
              <div className="lighting-studio-panel__size-control">
                <label>Value</label>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={heightBrushValue}
                  onChange={(e) =>
                    onHeightBrushValueChange(parseInt(e.target.value))
                  }
                />
                <span className="lighting-studio-panel__size-value">
                  {heightBrushValue}
                </span>
              </div>
              <div className="lighting-studio-panel__hint">
                Tip: hold Shift to erase (set height to 0).
              </div>
            </div>
          ) : (
            normalPicker
          )}

          <div className="lighting-studio-panel__brush-controls">
            <div className="lighting-studio-panel__size-control">
              <label>Size</label>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
              />
              <span className="lighting-studio-panel__size-value">
                {brushSize}
              </span>
            </div>

            <div className="lighting-studio-panel__shape-control">
              <label>Shape</label>
              <div className="lighting-studio-panel__shape-buttons">
                <button
                  className={`lighting-studio-panel__shape-btn ${normalBrushShape === "circle" ? "lighting-studio-panel__shape-btn--active" : ""}`}
                  onClick={() => onNormalBrushShapeChange("circle")}
                  title="Circle"
                >
                  ⭕
                </button>
                <button
                  className={`lighting-studio-panel__shape-btn ${normalBrushShape === "square" ? "lighting-studio-panel__shape-btn--active" : ""}`}
                  onClick={() => onNormalBrushShapeChange("square")}
                  title="Square"
                >
                  ⬜
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel lighting-studio-panel__section">
        <div className="panel__header">
          <span className="panel__title">Light Settings</span>
          {onOtherHandLight ? (
            <OtherHandButton
              onClick={onOtherHandLight}
              sectionLabel="Light Settings"
            />
          ) : null}
        </div>
        <div className="panel__body panel__body--stack">{lightControl}</div>
      </div>
    </div>
  );
}
