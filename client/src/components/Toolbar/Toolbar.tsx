import { useEditorStore } from '../../store';
import { ReferenceImageData } from '../ReferenceImageModal/ReferenceImageModal';
import { PixelStudioTools } from './PixelStudioTools';
import { LightingStudioTools } from './LightingStudioTools';
import './Toolbar.css';

interface ToolbarProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

export function Toolbar({ onReferenceImageChange, hasReferenceImage }: ToolbarProps) {
  const { project, setZoom, setStudioMode } = useEditorStore();

  if (!project) return null;

  const { zoom, studioMode } = project.uiState;
  const isLightingMode = studioMode === 'lighting';

  return (
    <div className="toolbar">
      {/* Studio Mode Toggle */}
      <div className="toolbar-section studio-mode-section">
        <div className="studio-mode-toggle">
          <button
            className={`studio-mode-btn ${!isLightingMode ? 'active' : ''}`}
            onClick={() => setStudioMode('pixel')}
            title="Pixel Studio - Edit colors"
          >
            <span className="tool-icon">🎨</span>
            <span className="studio-mode-label">Pixel</span>
          </button>
          <button
            className={`studio-mode-btn ${isLightingMode ? 'active' : ''}`}
            onClick={() => setStudioMode('lighting')}
            title="Lighting Studio - Edit normals and lighting"
          >
            <span className="tool-icon">💡</span>
            <span className="studio-mode-label">Lighting</span>
          </button>
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Conditional Tools based on Studio Mode */}
      {isLightingMode ? (
        <LightingStudioTools />
      ) : (
        <PixelStudioTools
          onReferenceImageChange={onReferenceImageChange}
          hasReferenceImage={hasReferenceImage}
        />
      )}

      {/* Zoom control - always visible */}
      <div className="toolbar-section toolbar-right">
        <label className="toolbar-label">Zoom</label>
        <div className="zoom-control">
          <button
            className="zoom-btn"
            onClick={() => setZoom(zoom - 2)}
            disabled={zoom <= 2}
          >
            −
          </button>
          <span className="zoom-value">{zoom}x</span>
          <button
            className="zoom-btn"
            onClick={() => setZoom(zoom + 2)}
            disabled={zoom >= 50}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

