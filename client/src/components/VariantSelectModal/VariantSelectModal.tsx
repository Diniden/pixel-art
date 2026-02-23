import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { Layer, VariantGroup, Variant, VariantFrame } from '../../types';
import { renderVariantFramePreview } from '../../utils/previewRenderer';
import { AnchorGrid, AnchorPosition } from '../AnchorGrid/AnchorGrid';
import './VariantSelectModal.css';

interface VariantSelectModalProps {
  layer: Layer;
  variantGroup: VariantGroup;
  onClose: () => void;
}

// Optimized thumbnail component with memoization
const VariantThumbnail = memo(function VariantThumbnail({ variant }: { variant: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    // Use first frame for thumbnail
    const frameToRender = variant.frames[0];
    if (!frameToRender) return;

    renderVariantFramePreview(ctx, thumbSize, variant, frameToRender);
  }, [variant]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="variant-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if variant actually changed
  const prev = prevProps.variant;
  const next = nextProps.variant;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.name !== next.name) return false;
  if (prev.gridSize.width !== next.gridSize.width || prev.gridSize.height !== next.gridSize.height) return false;
  if (prev.frames.length !== next.frames.length) return false;

  // Check if frame data changed (only check first frame for thumbnails)
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

export function VariantSelectModal({ layer, variantGroup, onClose }: VariantSelectModalProps) {
  const {
    selectVariant,
    addVariant,
    deleteVariant,
    renameVariant,
    resizeVariant
  } = useEditorStore();

  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [resizingVariantId, setResizingVariantId] = useState<string | null>(null);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [resizeAnchor, setResizeAnchor] = useState<AnchorPosition>('middle-center');
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);

  const selectedVariantId = layer.selectedVariantId;

  const handleSelectVariant = (variantId: string) => {
    selectVariant(layer.id, variantId);
  };

  const handleStartRename = (variant: Variant) => {
    setEditingVariantId(variant.id);
    setEditingName(variant.name);
  };

  const handleFinishRename = (variantId: string) => {
    if (editingName.trim()) {
      renameVariant(variantGroup.id, variantId, editingName.trim());
    }
    setEditingVariantId(null);
    setEditingName('');
  };

  const handleAddNew = (copyFromId?: string) => {
    addVariant(variantGroup.id, copyFromId);
    setShowAddOptions(false);
  };

  const handleDelete = (variantId: string) => {
    if (confirm('Delete this variant? This cannot be undone.')) {
      deleteVariant(variantGroup.id, variantId);
    }
  };

  const handleStartResize = (variant: Variant) => {
    setResizingVariantId(variant.id);
    setResizeWidth(variant.gridSize.width);
    setResizeHeight(variant.gridSize.height);
    setOriginalWidth(variant.gridSize.width);
    setOriginalHeight(variant.gridSize.height);
    setResizeAnchor('middle-center');
  };

  const handleFinishResize = () => {
    if (resizingVariantId && resizeWidth > 0 && resizeHeight > 0) {
      resizeVariant(variantGroup.id, resizingVariantId, resizeWidth, resizeHeight, resizeAnchor);
    }
    setResizingVariantId(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="variant-modal-backdrop" onClick={handleBackdropClick}>
      <div className="variant-modal">
        <div className="variant-modal-header">
          <h3>⬡ Select Variant</h3>
          <span className="variant-group-name">{variantGroup.name}</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="variant-modal-content">
          <div className="variants-grid">
            {variantGroup.variants.map(variant => (
              <div
                key={variant.id}
                className={`variant-card ${selectedVariantId === variant.id ? 'selected' : ''}`}
                onClick={() => handleSelectVariant(variant.id)}
              >
                <div className="variant-thumb">
                  <VariantThumbnail variant={variant} />
                </div>

                <div className="variant-info">
                  {editingVariantId === variant.id ? (
                    <input
                      type="text"
                      className="variant-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleFinishRename(variant.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(variant.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="variant-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(variant);
                      }}
                    >
                      {variant.name}
                    </span>
                  )}
                  <span className="variant-size">
                    {variant.gridSize.width}×{variant.gridSize.height}
                  </span>
                </div>

                <div className="variant-actions">
                  <button
                    className="variant-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartResize(variant);
                    }}
                    title="Resize"
                  >
                    ⬜
                  </button>
                  <button
                    className="variant-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddNew(variant.id);
                    }}
                    title="Duplicate"
                  >
                    ⧉
                  </button>
                  <button
                    className="variant-action-btn delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(variant.id);
                    }}
                    disabled={variantGroup.variants.length <= 1}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>

                {selectedVariantId === variant.id && (
                  <div className="selected-badge">✓</div>
                )}
              </div>
            ))}
          </div>

          {/* Add new variant section */}
          <div className="add-variant-section">
            {showAddOptions ? (
              <div className="add-options">
                <button onClick={() => handleAddNew()}>
                  + New Empty Variant
                </button>
                <button onClick={() => setShowAddOptions(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="add-variant-btn" onClick={() => setShowAddOptions(true)}>
                + Add Variant
              </button>
            )}
          </div>
        </div>

        {/* Resize dialog */}
        {resizingVariantId && (
          <div className="resize-dialog-backdrop" onClick={() => setResizingVariantId(null)}>
            <div className="resize-dialog" onClick={e => e.stopPropagation()}>
              <h4>Resize Variant</h4>
              <div className="resize-inputs">
                <label>
                  Width:
                  <input
                    type="number"
                    value={resizeWidth}
                    onChange={(e) => setResizeWidth(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                  />
                </label>
                <label>
                  Height:
                  <input
                    type="number"
                    value={resizeHeight}
                    onChange={(e) => setResizeHeight(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                  />
                </label>
              </div>
              <div className="resize-anchor-section">
                <label className="anchor-label">Anchor Point:</label>
                <AnchorGrid
                  anchor={resizeAnchor}
                  onChange={setResizeAnchor}
                  currentWidth={originalWidth}
                  currentHeight={originalHeight}
                  newWidth={resizeWidth}
                  newHeight={resizeHeight}
                />
              </div>
              <div className="resize-actions">
                <button onClick={handleFinishResize}>Apply</button>
                <button onClick={() => setResizingVariantId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

