import { useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { PixelObject, VariantGroup } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import { Icon } from '../../ui/primitives/Icon/Icon';
import { Target, Check, X, Package } from 'lucide-react';
import './ObjectSelectModal.css';

interface ObjectSelectModalProps {
  selectedObjectId: string | null;
  onSelect: (objectId: string | null) => void;
  onClose: () => void;
  /** From DomainStore via ObjectSelectModalContainer (REFRESH task 23). */
  objects: PixelObject[];
  /** From DomainStore — the thumbnail renderer resolves variant layers. */
  variants?: VariantGroup[];
  /** The `uiState` selection, for the "Current" badge. */
  currentObjectId: string | null;
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

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="object-select-modal__thumb-canvas" />;
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

export function ObjectSelectModal({
  selectedObjectId,
  onSelect,
  onClose,
  objects,
  variants,
  currentObjectId,
}: ObjectSelectModalProps) {

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
    <div className="object-select-modal__backdrop" onClick={handleBackdropClick}>
      <div className="object-select-modal">
        <div className="object-select-modal__header">
          <h3><Icon icon={Package} size={16} /> Select Reference Object</h3>
          <span className="object-select-modal__subtitle">Choose which object's frames to preview</span>
          <button className="modal__close" onClick={onClose}><Icon icon={X} size={14} /></button>
        </div>

        <div className="object-select-modal__content">
          {/* Option to use current object (default behavior) */}
          <div
            className={`object-select-modal__card object-select-modal__card--follow-current ${selectedObjectId === null ? 'object-select-modal__card--selected' : ''}`}
            onClick={() => handleSelectObject(null)}
          >
            <div className="object-select-modal__current-icon"><Icon icon={Target} size={18} /></div>
            <div className="object-select-modal__info">
              <span className="object-select-modal__name">Follow Current Object</span>
              <span className="object-select-modal__details">
                Always show frames from the selected object
              </span>
            </div>
            {selectedObjectId === null && (
              <div className="object-select-modal__badge--selected"><Icon icon={Check} size={12} /></div>
            )}
          </div>

          <div className="object-select-modal__divider">
            <span>Or select a specific object</span>
          </div>

          <div className="object-select-modal__grid">
            {objects.map(obj => {
              const isCurrent = obj.id === currentObjectId;
              const isSelected = selectedObjectId === obj.id;

              return (
                <div
                  key={obj.id}
                  className={`object-select-modal__card ${isSelected ? 'object-select-modal__card--selected' : ''} ${isCurrent ? 'object-select-modal__card--current' : ''}`}
                  onClick={() => handleSelectObject(obj.id)}
                >
                  <div className="object-select-modal__thumb">
                    <ObjectThumbnail obj={obj} project={{ variants }} />
                  </div>

                  <div className="object-select-modal__info">
                    <span className="object-select-modal__name">{obj.name}</span>
                    <span className="object-select-modal__details">
                      {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {isCurrent && (
                    <div className="object-select-modal__badge--current">Current</div>
                  )}

                  {isSelected && (
                    <div className="object-select-modal__badge--selected"><Icon icon={Check} size={12} /></div>
                  )}
                </div>
              );
            })}
          </div>

          {objects.length === 0 && (
            <div className="object-select-modal__empty">
              No objects available
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}



