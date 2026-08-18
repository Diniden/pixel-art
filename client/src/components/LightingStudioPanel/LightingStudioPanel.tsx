import { NormalPicker } from "./NormalPicker";
import { LightControl } from "./LightControl";
import { useEditorStore } from "../../store";
import "./LightingStudioPanel.css";

export function LightingStudioPanel() {
  const { project, setBrushSize, setNormalBrushShape, setHeightBrushValue } =
    useEditorStore();

  if (!project) return null;

  const { brushSize, normalBrushShape } = project.uiState;
  const editMode = project.uiState.lightingDataLayerEditMode ?? "normals";
  const heightBrushValue = project.uiState.heightBrushValue ?? 128;

  return (
    <div className="lighting-studio-panel">
      <div className="panel lighting-studio-panel__section">
        <div className="panel__header">
          {editMode === "height" ? "Height Brush" : "Normal Brush"}
        </div>
        <div className="panel__body panel__body--stack">
          {editMode === "height" ? (
            <div className="lighting-studio-panel__brush-controls" style={{ paddingTop: 8 }}>
              <div className="lighting-studio-panel__size-control">
                <label>Value</label>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={heightBrushValue}
                  onChange={(e) =>
                    setHeightBrushValue(parseInt(e.target.value))
                  }
                />
                <span className="lighting-studio-panel__size-value">{heightBrushValue}</span>
              </div>
              <div className="lighting-studio-panel__hint">
                Tip: hold Shift to erase (set height to 0).
              </div>
            </div>
          ) : (
            <NormalPicker enableScrollControl={true} />
          )}

          <div className="lighting-studio-panel__brush-controls">
            <div className="lighting-studio-panel__size-control">
              <label>Size</label>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
              />
              <span className="lighting-studio-panel__size-value">{brushSize}</span>
            </div>

            <div className="lighting-studio-panel__shape-control">
              <label>Shape</label>
              <div className="lighting-studio-panel__shape-buttons">
                <button
                  className={`lighting-studio-panel__shape-btn ${normalBrushShape === "circle" ? "lighting-studio-panel__shape-btn--active" : ""}`}
                  onClick={() => setNormalBrushShape("circle")}
                  title="Circle"
                >
                  ⭕
                </button>
                <button
                  className={`lighting-studio-panel__shape-btn ${normalBrushShape === "square" ? "lighting-studio-panel__shape-btn--active" : ""}`}
                  onClick={() => setNormalBrushShape("square")}
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
        <div className="panel__header">Light Settings</div>
        <div className="panel__body panel__body--stack">
          <LightControl />
        </div>
      </div>
    </div>
  );
}
