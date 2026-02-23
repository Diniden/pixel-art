import { ColorPicker } from "../ColorPicker/ColorPicker";
import { PaletteManager } from "../PaletteManager/PaletteManager";
import { useEditorStore } from "../../store";
import type { Color } from "../../types";
import "./PixelStudioPanel.css";

/** Simple inline color picker for the origin cross display color. */
function OriginColorPicker() {
  const { project, setOriginColor, getCurrentObject } = useEditorStore();
  const color = project?.uiState.originColor ?? {
    r: 255,
    g: 50,
    b: 50,
    a: 255,
  };
  const obj = getCurrentObject();
  const originPos = obj?.origin;

  const toHex = (c: Color) =>
    "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");

  const fromHex = (hex: string): Color => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255,
  });

  return (
    <div className="panel origin-controls-panel">
      <div className="panel-header">Origin</div>
      <div className="panel-content">
        <div className="origin-controls">
          <div className="origin-color-control">
            <label>Color</label>
            <input
              type="color"
              value={toHex(color)}
              onChange={(e) => setOriginColor(fromHex(e.target.value))}
              className="origin-color-input"
            />
          </div>
          <div className="origin-position-display">
            <label>Position</label>
            <span className="origin-position-value">
              {originPos ? `${originPos.x}, ${originPos.y}` : "Not set"}
            </span>
          </div>
          <p className="origin-hint">
            Click on the canvas to set the origin anchor point.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PixelStudioPanel() {
  const {
    project,
    setBrushSize,
    setEraserShape,
    setPencilBrushShape,
    setPencilBrushMax,
  } = useEditorStore();

  if (!project) return null;

  const {
    selectedTool,
    brushSize,
    eraserShape,
    pencilBrushShape,
    pencilBrushMax,
  } = project.uiState;
  const showEraserControls = selectedTool === "eraser";
  const showPencilControls = selectedTool === "pixel";
  const showOriginControls = selectedTool === "origin";
  const maxOptions = [8, 16, 32, 64, 128] as const;

  return (
    <div className="pixel-studio-panel">
      {showOriginControls && <OriginColorPicker />}
      {showPencilControls && (
        <div className="panel eraser-controls-panel">
          <div className="panel-header">Pencil</div>
          <div className="panel-content">
            <div className="eraser-controls">
              <div className="brush-size-control">
                <label>Size</label>
                <div className="brush-size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={pencilBrushMax ?? 16}
                    value={Math.min(brushSize, pencilBrushMax ?? 16)}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                  <span className="brush-size-value">
                    {Math.min(brushSize, pencilBrushMax ?? 16)}
                  </span>
                </div>
              </div>

              <div className="brush-max-control">
                <label>Max</label>
                <div className="shape-buttons">
                  {maxOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`shape-btn ${(pencilBrushMax ?? 16) === opt ? "active" : ""}`}
                      onClick={() => setPencilBrushMax(opt)}
                      title={`Set max size to ${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="brush-shape-control">
                <label>Shape</label>
                <div className="shape-buttons">
                  <button
                    className={`shape-btn ${(pencilBrushShape ?? "square") === "circle" ? "active" : ""}`}
                    onClick={() => setPencilBrushShape("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`shape-btn ${(pencilBrushShape ?? "square") === "square" ? "active" : ""}`}
                    onClick={() => setPencilBrushShape("square")}
                    title="Square"
                  >
                    ⬜
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showEraserControls && (
        <div className="panel eraser-controls-panel">
          <div className="panel-header">Eraser</div>
          <div className="panel-content">
            <div className="eraser-controls">
              <div className="brush-size-control">
                <label>Size</label>
                <div className="brush-size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={pencilBrushMax ?? 16}
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                  <span className="brush-size-value">{brushSize}</span>
                </div>
              </div>

              <div className="brush-shape-control">
                <label>Shape</label>
                <div className="shape-buttons">
                  <button
                    className={`shape-btn ${eraserShape === "circle" ? "active" : ""}`}
                    onClick={() => setEraserShape("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`shape-btn ${eraserShape === "square" ? "active" : ""}`}
                    onClick={() => setEraserShape("square")}
                    title="Square"
                  >
                    ⬜
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <ColorPicker />
      <PaletteManager />
    </div>
  );
}
