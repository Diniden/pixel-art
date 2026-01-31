import { ColorPicker } from '../ColorPicker/ColorPicker';
import { PaletteManager } from '../PaletteManager/PaletteManager';
import { useEditorStore } from '../../store';
import './PixelStudioPanel.css';

export function PixelStudioPanel() {
  const { project, setBrushSize, setEraserShape } = useEditorStore();

  if (!project) return null;

  const { selectedTool, brushSize, eraserShape } = project.uiState;
  const showEraserControls = selectedTool === 'eraser';

  return (
    <div className="pixel-studio-panel">
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
                    max="16"
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
                    className={`shape-btn ${eraserShape === 'circle' ? 'active' : ''}`}
                    onClick={() => setEraserShape('circle')}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`shape-btn ${eraserShape === 'square' ? 'active' : ''}`}
                    onClick={() => setEraserShape('square')}
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


