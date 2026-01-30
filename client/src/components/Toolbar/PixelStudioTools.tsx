import { useState } from 'react';
import { useEditorStore } from '../../store';
import { Tool, ShapeMode } from '../../types';
import { ReferenceImageModal, ReferenceImageData } from '../ReferenceImageModal/ReferenceImageModal';

interface PixelStudioToolsProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

const tools: { id: Tool; icon: string; label: string; hotkey: string }[] = [
  { id: 'pixel', icon: '✏️', label: 'Pencil', hotkey: '1' },
  { id: 'eraser', icon: '🧹', label: 'Eraser', hotkey: '2' },
  { id: 'eyedropper', icon: '💧', label: 'Eyedropper', hotkey: '3' },
  { id: 'fill-square', icon: '⬛', label: 'Square Brush', hotkey: '4' },
  { id: 'flood-fill', icon: '🪣', label: 'Fill', hotkey: '5' },
  { id: 'line', icon: '📏', label: 'Line', hotkey: '6' },
  { id: 'rectangle', icon: '▢', label: 'Rectangle (↑↓ radius)', hotkey: '7' },
  { id: 'ellipse', icon: '◯', label: 'Ellipse', hotkey: '8' },
  { id: 'move', icon: '✥', label: 'Move (arrows to shift)', hotkey: '9' },
  { id: 'selection', icon: '⬚', label: 'Selection (arrows to move)', hotkey: '0' },
];

const referenceTraceTool = { id: 'reference-trace' as Tool, icon: '🎯', label: 'Trace Reference (WASD to align, click to copy)' };

const shapeModes: { id: ShapeMode; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'fill', label: 'Fill' },
  { id: 'both', label: 'Both' },
];

export function PixelStudioTools({ onReferenceImageChange, hasReferenceImage }: PixelStudioToolsProps) {
  const { project, setTool, setBrushSize, setEraserShape, setShapeMode, setBorderRadius, setMoveAllLayers } = useEditorStore();
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);

  if (!project) return null;

  const { selectedTool, brushSize, eraserShape, shapeMode, borderRadius, moveAllLayers } = project.uiState;
  const showBrushSize = selectedTool === 'fill-square' || selectedTool === 'eraser';
  const showEraserShape = selectedTool === 'eraser';
  const showShapeMode = ['rectangle', 'ellipse'].includes(selectedTool);
  const showBorderRadius = selectedTool === 'rectangle';
  const showMoveAllLayers = selectedTool === 'move';

  const handleReferenceConfirm = (data: ReferenceImageData) => {
    onReferenceImageChange?.(data);
    setIsRefModalOpen(false);
  };

  const handleClearReference = () => {
    onReferenceImageChange?.(null);
  };

  return (
    <>
      <div className="toolbar-section">
        <div className="toolbar-group">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
              onClick={() => setTool(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group reference-group">
          <button
            className={`tool-btn reference-btn ${hasReferenceImage ? 'has-reference' : ''}`}
            onClick={() => setIsRefModalOpen(true)}
            title="Add Reference Image"
          >
            <span className="tool-icon">📷</span>
          </button>
          {hasReferenceImage && (
            <>
              <button
                className={`tool-btn trace-btn ${selectedTool === 'reference-trace' ? 'active' : ''}`}
                onClick={() => setTool('reference-trace')}
                title={referenceTraceTool.label}
              >
                <span className="tool-icon">{referenceTraceTool.icon}</span>
              </button>
              <button
                className="tool-btn clear-reference-btn"
                onClick={handleClearReference}
                title="Clear Reference Image"
              >
                <span className="tool-icon">✕</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showBrushSize && (
        <div className="toolbar-section">
          <label className="toolbar-label">Size</label>
          <div className="brush-size-control">
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
      )}

      {showEraserShape && (
        <div className="toolbar-section">
          <label className="toolbar-label">Shape</label>
          <div className="shape-mode-group">
            <button
              className={`mode-btn ${eraserShape === 'circle' ? 'active' : ''}`}
              onClick={() => setEraserShape('circle')}
            >
              Circle
            </button>
            <button
              className={`mode-btn ${eraserShape === 'square' ? 'active' : ''}`}
              onClick={() => setEraserShape('square')}
            >
              Square
            </button>
          </div>
        </div>
      )}

      {showShapeMode && (
        <div className="toolbar-section">
          <label className="toolbar-label">Mode</label>
          <div className="shape-mode-group">
            {shapeModes.map((mode) => (
              <button
                key={mode.id}
                className={`mode-btn ${shapeMode === mode.id ? 'active' : ''}`}
                onClick={() => setShapeMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showBorderRadius && (
        <div className="toolbar-section">
          <label className="toolbar-label">Radius</label>
          <div className="brush-size-control">
            <input
              type="range"
              min="0"
              max="16"
              value={borderRadius}
              onChange={(e) => setBorderRadius(parseInt(e.target.value))}
            />
            <span className="brush-size-value">{borderRadius}</span>
          </div>
        </div>
      )}

      {showMoveAllLayers && (
        <div className="toolbar-section">
          <label className="move-all-toggle">
            <input
              type="checkbox"
              checked={moveAllLayers}
              onChange={(e) => setMoveAllLayers(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Move All Layers</span>
          </label>
        </div>
      )}

      <ReferenceImageModal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
        onConfirm={handleReferenceConfirm}
      />
    </>
  );
}

