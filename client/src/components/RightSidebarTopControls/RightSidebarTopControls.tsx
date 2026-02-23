import { useEditorStore } from "../../store";
import type { SelectionBehavior, SelectionMode, ShapeMode } from "../../types";
import "./RightSidebarTopControls.css";

const shapeModes: { id: ShapeMode; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "fill", label: "Fill" },
  { id: "both", label: "Both" },
];

const gaussianRadiusMaxOptions = [8, 16, 32, 64, 128] as const;

const selectionModes: { id: SelectionMode; label: string }[] = [
  { id: "rect", label: "Rect" },
  { id: "flood", label: "Flood" },
  { id: "lasso", label: "Lasso" },
  { id: "color", label: "Color" },
];

const selectionBehaviors: { id: SelectionBehavior; label: string }[] = [
  { id: "movePixels", label: "Move pixels" },
  { id: "moveSelection", label: "Move selection" },
  { id: "editMask", label: "Edit mask" },
];

export function RightSidebarTopControls() {
  const {
    project,
    setZoom,
    setBrushSize,
    setPencilBrushMax,
    setTraceNudgeAmount,
    setShapeMode,
    setBorderRadius,
    setMoveAllLayers,
    setGaussianFillParams,
    setSelectionMode,
    setSelectionBehavior,
    selection,
    expandSelection,
    shrinkSelection,
    clearSelection,
    frameTraceActive,
  } = useEditorStore();

  if (!project) return null;

  const {
    zoom,
    studioMode,
    selectedTool,
    brushSize,
    pencilBrushMax,
    traceNudgeAmount,
    shapeMode,
    borderRadius,
    moveAllLayers,
  } = project.uiState;

  const isPixelMode = studioMode !== "lighting";

  const showBrushSize = isPixelMode && selectedTool === "fill-square";
  const showTraceBrush =
    isPixelMode && (selectedTool === "reference-trace" || frameTraceActive);
  const showGaussianFill = isPixelMode && selectedTool === "gaussian-fill";
  const showShapeMode =
    isPixelMode && ["rectangle", "ellipse"].includes(selectedTool);
  const showBorderRadius = isPixelMode && selectedTool === "rectangle";
  const showMoveAllLayers = isPixelMode && selectedTool === "move";
  const showSelectionOptions = isPixelMode && selectedTool === "selection";

  const showToolOptions =
    showBrushSize ||
    showTraceBrush ||
    showGaussianFill ||
    showShapeMode ||
    showBorderRadius ||
    showMoveAllLayers ||
    showSelectionOptions;

  const gaussianFill = project.uiState.gaussianFill ?? {
    smoothing: 1.0,
    radius: 2.0,
    radiusMax: 16,
  };
  const gaussianRadiusMax = gaussianFill.radiusMax ?? 16;
  const currentSelectionMode = project.uiState.selectionMode ?? "rect";
  const currentSelectionBehavior =
    project.uiState.selectionBehavior ?? "movePixels";
  const traceMaxOptions = [8, 16, 32, 64, 128] as const;
  const traceMax = pencilBrushMax ?? 16;
  const traceNudgeOptions = [10, 20, 25, 50, 100] as const;
  const traceNudge = traceNudgeAmount ?? 10;

  return (
    <div className="right-sidebar-top-controls">
      <div className="panel compact-panel">
        <div className="panel-header">Zoom</div>
        <div className="panel-content compact-panel-content">
          <div className="compact-row">
            <button
              className="compact-btn"
              onClick={() => setZoom(Math.round(zoom) - 2)}
              disabled={zoom <= 2}
              title="Zoom out"
            >
              −
            </button>
            <span className="compact-value" title="Current zoom">
              {Math.round(zoom)}x
            </span>
            <button
              className="compact-btn"
              onClick={() => setZoom(Math.round(zoom) + 2)}
              disabled={zoom >= 50}
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {showToolOptions && (
        <div className="panel compact-panel">
          <div className="panel-header">Tool Options</div>
          <div className="panel-content compact-panel-content">
            {showBrushSize && (
              <div className="compact-control">
                <label className="compact-label">Size</label>
                <div className="compact-slider-row">
                  <input
                    className="compact-slider"
                    type="range"
                    min="1"
                    max="16"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  />
                  <span className="compact-value">{brushSize}</span>
                </div>
              </div>
            )}

            {showTraceBrush && (
              <>
                <div className="compact-control">
                  <label className="compact-label">Trace size</label>
                  <div className="compact-slider-row">
                    <input
                      className="compact-slider"
                      type="range"
                      min="1"
                      max={traceMax}
                      value={Math.min(brushSize, traceMax)}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    />
                    <span className="compact-value">
                      {Math.min(brushSize, traceMax)}
                    </span>
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Trace max</label>
                  <div className="compact-segmented">
                    {traceMaxOptions.map((opt) => (
                      <button
                        key={opt}
                        className={`compact-segment ${traceMax === opt ? "active" : ""}`}
                        onClick={() => setPencilBrushMax(opt)}
                        title={`Set max trace size to ${opt}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Trace nudge</label>
                  <div className="compact-segmented">
                    {traceNudgeOptions.map((opt) => (
                      <button
                        key={opt}
                        className={`compact-segment ${traceNudge === opt ? "active" : ""}`}
                        onClick={() => setTraceNudgeAmount(opt)}
                        title={`Shift+WASD moves by ${opt}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {showGaussianFill && (
              <>
                <div className="compact-control">
                  <label className="compact-label">Smoothing</label>
                  <div className="compact-slider-row">
                    <input
                      className="compact-slider"
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={gaussianFill.smoothing}
                      onChange={(e) =>
                        setGaussianFillParams({
                          smoothing: parseFloat(e.target.value),
                          radius: gaussianFill.radius,
                          radiusMax: gaussianRadiusMax,
                        })
                      }
                    />
                    <span className="compact-value">
                      {gaussianFill.smoothing.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Radius</label>
                  <div className="compact-slider-row">
                    <input
                      className="compact-slider"
                      type="range"
                      min="0.5"
                      max={gaussianRadiusMax}
                      step="0.1"
                      value={Math.min(gaussianFill.radius, gaussianRadiusMax)}
                      onChange={(e) =>
                        setGaussianFillParams({
                          smoothing: gaussianFill.smoothing,
                          radius: parseFloat(e.target.value),
                          radiusMax: gaussianRadiusMax,
                        })
                      }
                    />
                    <span className="compact-value">
                      {gaussianFill.radius.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Radius Max</label>
                  <div className="compact-segmented">
                    {gaussianRadiusMaxOptions.map((opt) => (
                      <button
                        key={opt}
                        className={`compact-segment ${gaussianRadiusMax === opt ? "active" : ""}`}
                        onClick={() =>
                          setGaussianFillParams({
                            smoothing: gaussianFill.smoothing,
                            radius: Math.min(gaussianFill.radius, opt),
                            radiusMax: opt,
                          })
                        }
                        title={`Set max radius to ${opt}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {showShapeMode && (
              <div className="compact-control">
                <label className="compact-label">Mode</label>
                <div className="compact-segmented">
                  {shapeModes.map((mode) => (
                    <button
                      key={mode.id}
                      className={`compact-segment ${shapeMode === mode.id ? "active" : ""}`}
                      onClick={() => setShapeMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showBorderRadius && (
              <div className="compact-control">
                <label className="compact-label">Radius</label>
                <div className="compact-slider-row">
                  <input
                    className="compact-slider"
                    type="range"
                    min="0"
                    max="16"
                    value={borderRadius}
                    onChange={(e) => setBorderRadius(parseInt(e.target.value))}
                  />
                  <span className="compact-value">{borderRadius}</span>
                </div>
              </div>
            )}

            {showMoveAllLayers && (
              <div className="compact-control">
                <label className="compact-toggle">
                  <input
                    type="checkbox"
                    checked={moveAllLayers}
                    onChange={(e) => setMoveAllLayers(e.target.checked)}
                  />
                  <span className="compact-toggle-slider" />
                  <span className="compact-toggle-label">Move all layers</span>
                </label>
              </div>
            )}

            {showSelectionOptions && (
              <>
                <div className="compact-control">
                  <label className="compact-label">Mode</label>
                  <div className="compact-segmented">
                    {selectionModes.map((mode) => (
                      <button
                        key={mode.id}
                        className={`compact-segment ${currentSelectionMode === mode.id ? "active" : ""}`}
                        onClick={() => setSelectionMode(mode.id)}
                        title={`Selection mode: ${mode.label}`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Behavior</label>
                  <div className="compact-segmented">
                    {selectionBehaviors.map((b) => (
                      <button
                        key={b.id}
                        className={`compact-segment ${currentSelectionBehavior === b.id ? "active" : ""}`}
                        onClick={() => setSelectionBehavior(b.id)}
                        title={b.label}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="compact-control">
                  <label className="compact-label">Selection</label>
                  <div className="compact-row">
                    <button
                      className="compact-btn"
                      onClick={() => shrinkSelection(1)}
                      disabled={!selection}
                      title="Shrink selection (−)"
                    >
                      −
                    </button>
                    <span
                      className="compact-value"
                      title={
                        selection
                          ? `${selection.bounds.width}×${selection.bounds.height} • ${selection.mask.size} px`
                          : "No selection"
                      }
                    >
                      {selection ? `${selection.mask.size}px` : "—"}
                    </span>
                    <button
                      className="compact-btn"
                      onClick={() => expandSelection(1)}
                      disabled={!selection}
                      title="Expand selection (+)"
                    >
                      +
                    </button>
                    <button
                      className="compact-btn"
                      onClick={() => clearSelection()}
                      disabled={!selection}
                      title="Deselect (Esc)"
                      style={{ marginLeft: 8 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
