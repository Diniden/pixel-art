import { ColorPicker } from "../ColorPicker/ColorPicker";
import { PaletteManagerContainer } from "../../containers/PaletteManagerContainer";
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
    <div className="panel pixel-studio-panel__origin-panel">
      <div className="panel__header">Origin</div>
      <div className="panel__body">
        <div className="pixel-studio-panel__origin-controls">
          <div className="pixel-studio-panel__origin-color-control">
            <label>Color</label>
            <input
              type="color"
              value={toHex(color)}
              onChange={(e) => setOriginColor(fromHex(e.target.value))}
              className="pixel-studio-panel__origin-color-input"
            />
          </div>
          <div className="pixel-studio-panel__origin-position">
            <label>Position</label>
            <span className="pixel-studio-panel__origin-position-value">
              {originPos ? `${originPos.x}, ${originPos.y}` : "Not set"}
            </span>
          </div>
          <p className="pixel-studio-panel__origin-hint">
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
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">Pencil</div>
          <div className="panel__body panel__body--dense">
            <div className="pixel-studio-panel__controls">
              <div className="pixel-studio-panel__size-control">
                <label>Size</label>
                <div className="pixel-studio-panel__size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={pencilBrushMax ?? 16}
                    value={Math.min(brushSize, pencilBrushMax ?? 16)}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                  <span className="pixel-studio-panel__size-value">
                    {Math.min(brushSize, pencilBrushMax ?? 16)}
                  </span>
                </div>
              </div>

              <div className="pixel-studio-panel__max-control">
                <label>Max</label>
                <div className="pixel-studio-panel__shape-buttons">
                  {maxOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`pixel-studio-panel__shape-btn ${(pencilBrushMax ?? 16) === opt ? "pixel-studio-panel__shape-btn--active" : ""}`}
                      onClick={() => setPencilBrushMax(opt)}
                      title={`Set max size to ${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pixel-studio-panel__shape-control">
                <label>Shape</label>
                <div className="pixel-studio-panel__shape-buttons">
                  <button
                    className={`pixel-studio-panel__shape-btn ${(pencilBrushShape ?? "square") === "circle" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => setPencilBrushShape("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`pixel-studio-panel__shape-btn ${(pencilBrushShape ?? "square") === "square" ? "pixel-studio-panel__shape-btn--active" : ""}`}
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
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">Eraser</div>
          <div className="panel__body panel__body--dense">
            <div className="pixel-studio-panel__controls">
              <div className="pixel-studio-panel__size-control">
                <label>Size</label>
                <div className="pixel-studio-panel__size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={pencilBrushMax ?? 16}
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                  <span className="pixel-studio-panel__size-value">{brushSize}</span>
                </div>
              </div>

              <div className="pixel-studio-panel__shape-control">
                <label>Shape</label>
                <div className="pixel-studio-panel__shape-buttons">
                  <button
                    className={`pixel-studio-panel__shape-btn ${eraserShape === "circle" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => setEraserShape("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`pixel-studio-panel__shape-btn ${eraserShape === "square" ? "pixel-studio-panel__shape-btn--active" : ""}`}
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
      <PaletteManagerContainer />
    </div>
  );
}
