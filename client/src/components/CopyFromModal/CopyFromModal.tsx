import { useRef, useEffect, memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { Layer, PixelObject, Variant } from '../../types';
import { renderLayerPreview, renderVariantLayerPreview } from '../../utils/previewRenderer';
import './CopyFromModal.css';

interface CopyFromModalProps {
  onClose: () => void;
}

// Memoized thumbnail component for a regular layer
const LayerThumbnail = memo(function LayerThumbnail({
  layer,
  gridWidth,
  gridHeight
}: {
  layer: Layer;
  gridWidth: number;
  gridHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 44;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    renderLayerPreview(ctx, thumbSize, layer, gridWidth, gridHeight);
  }, [layer, gridWidth, gridHeight]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="copy-thumb-canvas" />;
}, (prevProps, nextProps) => {
  const prev = prevProps.layer;
  const next = nextProps.layer;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.visible !== next.visible) return false;
  if (prev.pixels !== next.pixels) return false;

  return true;
});

// Memoized thumbnail component for a variant layer
const VariantThumbnail = memo(function VariantThumbnail({ variant }: { variant: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 44;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    renderVariantLayerPreview(ctx, thumbSize, variant);
  }, [variant]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="copy-thumb-canvas" />;
}, (prevProps, nextProps) => {
  const prev = prevProps.variant;
  const next = nextProps.variant;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;

  return true;
});

// Tooltip component that follows cursor
function Tooltip({ text, x, y, visible }: { text: string; x: number; y: number; visible: boolean }) {
  if (!visible) return null;

  return createPortal(
    <div
      className="copy-tooltip"
      style={{
        left: x + 12,
        top: y + 12
      }}
    >
      {text}
    </div>,
    document.body
  );
}

interface LayerCellProps {
  obj: PixelObject;
  layer: Layer;
  variants?: import('../../types').VariantGroup[];  // Project-level variants
  onCopy: () => void;
}

function LayerCell({ obj, layer, variants, onCopy }: LayerCellProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Get variant info if this is a variant layer (now from project.variants)
  const variantGroup = layer.isVariant && layer.variantGroupId
    ? variants?.find(vg => vg.id === layer.variantGroupId)
    : null;
  const selectedVariant = variantGroup?.variants.find(v => v.id === layer.selectedVariantId);

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
    if (!tooltipVisible) {
      setTooltipVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setTooltipVisible(false);
  };

  const tooltipText = layer.isVariant && selectedVariant
    ? `${layer.name} (${selectedVariant.name})`
    : layer.name;

  return (
    <>
      <div
        className={`copy-layer-cell ${layer.isVariant ? 'variant' : ''}`}
        onClick={onCopy}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {layer.isVariant && selectedVariant ? (
          <VariantThumbnail variant={selectedVariant} />
        ) : (
          <LayerThumbnail
            layer={layer}
            gridWidth={obj.gridSize.width}
            gridHeight={obj.gridSize.height}
          />
        )}
        {layer.isVariant && (
          <span className="variant-badge">⬡</span>
        )}
      </div>
      <Tooltip
        text={tooltipText}
        x={tooltipPos.x}
        y={tooltipPos.y}
        visible={tooltipVisible}
      />
    </>
  );
}

export function CopyFromModal({ onClose }: CopyFromModalProps) {
  const { project, copyLayerFromObject, getCurrentObject } = useEditorStore();

  const currentObject = getCurrentObject();

  if (!project) return null;

  const handleCopyLayer = (sourceObj: PixelObject, layer: Layer) => {
    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      copyLayerFromObject(
        sourceObj.id,
        layer.id,
        true,
        layer.variantGroupId,
        layer.selectedVariantId
      );
    } else {
      copyLayerFromObject(sourceObj.id, layer.id, false);
    }
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="copy-modal-backdrop" onClick={handleBackdropClick}>
      <div className="copy-modal">
        <div className="copy-modal-header">
          <h3>📋 Copy Layer From</h3>
          <span className="copy-modal-hint">Click a layer to copy it to the current object</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="copy-modal-content">
          <div className="objects-grid">
            {project.objects.map(obj => {
              // Get first frame layers
              const firstFrame = obj.frames[0];
              if (!firstFrame) return null;

              // Reverse layers so top layer appears first (like in LayerPanel)
              const layers = [...firstFrame.layers].reverse();

              const isCurrentObject = currentObject?.id === obj.id;

              return (
                <div key={obj.id} className={`object-row ${isCurrentObject ? 'current' : ''}`}>
                  <div className="object-name" title={obj.name}>
                    {obj.name}
                    {isCurrentObject && <span className="current-badge">(current)</span>}
                  </div>
                  <div className="layers-row">
                    {layers.map(layer => (
                      <LayerCell
                        key={layer.id}
                        obj={obj}
                        layer={layer}
                        variants={project.variants}
                        onCopy={() => handleCopyLayer(obj, layer)}
                      />
                    ))}
                    {layers.length === 0 && (
                      <div className="no-layers">No layers</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


