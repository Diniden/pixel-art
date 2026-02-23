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
      <div className="panel lighting-panel-section">
        <div className="panel-header">
          {editMode === "height" ? "Height Brush" : "Normal Brush"}
        </div>
        <div className="panel-content">
          {editMode === "height" ? (
            <div className="normal-brush-controls" style={{ paddingTop: 8 }}>
              <div className="brush-size-control">
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
                <span className="brush-size-value">{heightBrushValue}</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Tip: hold Shift to erase (set height to 0).
              </div>
            </div>
          ) : (
            <NormalPicker enableScrollControl={true} />
          )}

          <div className="normal-brush-controls">
            <div className="brush-size-control">
              <label>Size</label>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
              />
              <span className="brush-size-value">{brushSize}</span>
            </div>

            <div className="brush-shape-control">
              <label>Shape</label>
              <div className="shape-buttons">
                <button
                  className={`shape-btn ${normalBrushShape === "circle" ? "active" : ""}`}
                  onClick={() => setNormalBrushShape("circle")}
                  title="Circle"
                >
                  ⭕
                </button>
                <button
                  className={`shape-btn ${normalBrushShape === "square" ? "active" : ""}`}
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

      <div className="panel lighting-panel-section">
        <div className="panel-header">Light Settings</div>
        <div className="panel-content">
          <LightControl />
        </div>
      </div>
    </div>
  );
}
