import { useState, useRef, useEffect, memo } from 'react';
import { useEditorStore } from '../../store';
import { Layer, VariantGroup, Variant, VariantFrame } from '../../types';
import './VariantSelectModal.css';

interface VariantSelectModalProps {
  layer: Layer;
  variantGroup: VariantGroup;
  onClose: () => void;
}

// Cached checkerboard background (created once, reused)
const CHECKERBOARD_CACHE = new Map<number, Uint8ClampedArray>();
function getCheckerboard(size: number): Uint8ClampedArray {
  if (!CHECKERBOARD_CACHE.has(size)) {
    const data = new Uint8ClampedArray(size * size * 4);
    const checkSize = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2) === 0) {
          data[idx] = 42;
          data[idx + 1] = 42;
          data[idx + 2] = 58;
        } else {
          data[idx] = 34;
          data[idx + 1] = 34;
          data[idx + 2] = 48;
        }
        data[idx + 3] = 255;
      }
    }
    CHECKERBOARD_CACHE.set(size, data);
  }
  return CHECKERBOARD_CACHE.get(size)!;
}

// Optimized thumbnail component with memoization
const VariantThumbnail = memo(function VariantThumbnail({ variant }: { variant: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = false;

    const { width, height } = variant.gridSize;
    if (width === 0 || height === 0 || variant.frames.length === 0) {
      // Empty variant - just draw checkerboard
      const checkerboard = getCheckerboard(thumbSize);
      const imageData = ctx.createImageData(thumbSize, thumbSize);
      imageData.data.set(checkerboard);
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    const scale = Math.min(thumbSize / width, thumbSize / height);
    const offsetX = Math.floor((thumbSize - width * scale) / 2);
    const offsetY = Math.floor((thumbSize - height * scale) / 2);

    // Use first frame (much faster than searching)
    const frameToRender = variant.frames[0];
    if (!frameToRender || frameToRender.layers.length === 0) {
      const checkerboard = getCheckerboard(thumbSize);
      const imageData = ctx.createImageData(thumbSize, thumbSize);
      imageData.data.set(checkerboard);
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    // Create ImageData with cached checkerboard
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    const data = imageData.data;
    const checkerboard = getCheckerboard(thumbSize);
    data.set(checkerboard);

    // Pre-calculate scale factors for performance
    const scaleX = scale;
    const scaleY = scale;
    const invScale = 1 / scale;

    // Render layers (back to front for proper alpha blending)
    for (let layerIdx = frameToRender.layers.length - 1; layerIdx >= 0; layerIdx--) {
      const layer = frameToRender.layers[layerIdx];
      if (!layer.visible) continue;

      const pixels = layer.pixels;
      if (!pixels) continue;

      // Render pixels more efficiently
      for (let py = 0; py < height; py++) {
        const row = pixels[py];
        if (!row) continue;

        for (let px = 0; px < width; px++) {
          const pixel = row[px];
          if (!pixel || pixel.a === 0) continue;

          // Calculate thumbnail pixel bounds
          const thumbX = Math.floor(offsetX + px * scaleX);
          const thumbY = Math.floor(offsetY + py * scaleY);
          const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (px + 1) * scaleX));
          const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (py + 1) * scaleY));

          if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

          // For thumbnails, use simpler rendering: just fill the pixel area
          // This is much faster than per-pixel alpha blending for small thumbnails
          const srcAlpha = pixel.a / 255;
          const r = pixel.r;
          const g = pixel.g;
          const b = pixel.b;

          for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
            for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
              const idx = (ty * thumbSize + tx) * 4;

              // Simplified alpha blending for performance
              const dstAlpha = data[idx + 3] / 255;
              const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

              if (outAlpha > 0.01) {
                // Only blend if there's meaningful alpha
                const invOutAlpha = 1 / outAlpha;
                data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 3] = outAlpha * 255;
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
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
  };

  const handleFinishResize = () => {
    if (resizingVariantId && resizeWidth > 0 && resizeHeight > 0) {
      resizeVariant(variantGroup.id, resizingVariantId, resizeWidth, resizeHeight);
    }
    setResizingVariantId(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
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
              <div className="resize-actions">
                <button onClick={handleFinishResize}>Apply</button>
                <button onClick={() => setResizingVariantId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

