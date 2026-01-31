import { useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { PixelObject } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import './ObjectSelectModal.css';

interface ObjectSelectModalProps {
  selectedObjectId: string | null;
  onSelect: (objectId: string | null) => void;
  onClose: () => void;
}

// Optimized thumbnail component with memoization
const ObjectThumbnail = memo(function ObjectThumbnail({
  obj,
  project
}: {
  obj: PixelObject;
  project?: {
    variants?: import('../../types').VariantGroup[];
  };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx || obj.frames.length === 0) return;

    const frame = obj.frames[0];
    const variants = project?.variants;

    // Use static indices (all variant frames at index 0 for the thumbnail)
    let variantFrameIndices: { [key: string]: number } | undefined;
    if (variants) {
      variantFrameIndices = {};
      for (const vg of variants) {
        variantFrameIndices[vg.id] = 0;
      }
    }

    renderFramePreview(ctx, {
      thumbSize,
      gridWidth: obj.gridSize.width,
      gridHeight: obj.gridSize.height,
      frame,
      variants,
      variantFrameIndices
    });
  }, [obj, project]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="object-select-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if object actually changed
  const prev = prevProps.obj;
  const next = nextProps.obj;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.gridSize.width !== next.gridSize.width || prev.gridSize.height !== next.gridSize.height) return false;
  if (prev.frames.length !== next.frames.length) return false;

  // Check if first frame changed
  if (prev.frames.length > 0 && next.frames.length > 0) {
    const prevFrame = prev.frames[0];
    const nextFrame = next.frames[0];

    if (prevFrame.id !== nextFrame.id) return false;
    if (prevFrame.layers.length !== nextFrame.layers.length) return false;

    // Check if layer pixels changed
    for (let i = 0; i < prevFrame.layers.length; i++) {
      const prevLayer = prevFrame.layers[i];
      const nextLayer = nextFrame.layers[i];

      if (prevLayer.visible !== nextLayer.visible) return false;
      if (prevLayer.pixels !== nextLayer.pixels) return false;
    }
  }

  return true;
});

export function ObjectSelectModal({ selectedObjectId, onSelect, onClose }: ObjectSelectModalProps) {
  const { project } = useEditorStore();

  if (!project) return null;

  const { objects } = project;
  const currentObjectId = project.uiState.selectedObjectId;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSelectObject = (objectId: string | null) => {
    onSelect(objectId);
    onClose();
  };

  return createPortal(
    <div className="object-select-modal-backdrop" onClick={handleBackdropClick}>
      <div className="object-select-modal">
        <div className="object-select-modal-header">
          <h3>📦 Select Reference Object</h3>
          <span className="object-select-subtitle">Choose which object's frames to preview</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="object-select-modal-content">
          {/* Option to use current object (default behavior) */}
          <div
            className={`object-select-card current-object-option ${selectedObjectId === null ? 'selected' : ''}`}
            onClick={() => handleSelectObject(null)}
          >
            <div className="current-object-icon">🎯</div>
            <div className="object-select-info">
              <span className="object-select-name">Follow Current Object</span>
              <span className="object-select-details">
                Always show frames from the selected object
              </span>
            </div>
            {selectedObjectId === null && (
              <div className="selected-badge">✓</div>
            )}
          </div>

          <div className="object-select-divider">
            <span>Or select a specific object</span>
          </div>

          <div className="objects-grid">
            {objects.map(obj => {
              const isCurrent = obj.id === currentObjectId;
              const isSelected = selectedObjectId === obj.id;

              return (
                <div
                  key={obj.id}
                  className={`object-select-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                  onClick={() => handleSelectObject(obj.id)}
                >
                  <div className="object-select-thumb">
                    <ObjectThumbnail obj={obj} project={project} />
                  </div>

                  <div className="object-select-info">
                    <span className="object-select-name">{obj.name}</span>
                    <span className="object-select-details">
                      {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {isCurrent && (
                    <div className="current-badge">Current</div>
                  )}

                  {isSelected && (
                    <div className="selected-badge">✓</div>
                  )}
                </div>
              );
            })}
          </div>

          {objects.length === 0 && (
            <div className="object-select-empty">
              No objects available
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

