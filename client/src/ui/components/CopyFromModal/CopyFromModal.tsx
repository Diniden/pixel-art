import { useRef, useEffect, memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layer, PixelObject, Variant, VariantGroup } from '../../../types';
import { renderLayerPreview, renderVariantLayerPreview } from '../../../utils/previewRenderer';
import { Icon } from '../../primitives/Icon/Icon';
import { Hexagon, ClipboardCopy, X } from 'lucide-react';
import './CopyFromModal.css';

interface CopyFromModalProps {
  onClose: () => void;
  /** From DomainStore via CopyFromModalContainer (REFRESH task 23). */
  objects: PixelObject[];
  variants?: VariantGroup[];
  /** The `currentObject` computed, for the "(current)" row marker. */
  currentObject: PixelObject | null;
  /**
   * Copies a layer from another object into the current frame.
   *
   * Task 36: this was the component's last store read. `LayerStore` owns the
   * action now (the bridge already delegates to it), so the container calls
   * `layers.copyLayerFromObject` and the signature is preserved verbatim —
   * including the `isVariant` flag that selects between the two branches.
   */
  onCopyLayerFromObject: (
    sourceObjectId: string,
    sourceLayerId: string,
    isVariant: boolean,
    variantGroupId?: string,
    variantId?: string,
  ) => void;
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

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="copy-from-modal__thumb-canvas" />;
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

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="copy-from-modal__thumb-canvas" />;
}, (prevProps, nextProps) => {
  const prev = prevProps.variant;
  const next = nextProps.variant;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;

  return true;
});

/**
 * Cursor-following tooltip — DELIBERATELY NOT the `Tooltip` primitive.
 *
 * REFRESH task 36 (W27) considered adopting `ui/primitives/Tooltip` here (the
 * spec lists this file's bespoke portal tooltip as a candidate) and rejected
 * it, for two measured reasons:
 *
 *  1. **Different positioning MECHANISM.** This one tracks the CURSOR: every
 *     `onMouseMove` rewrites `{x, y}` and the bubble sits at
 *     `(clientX + 12, clientY + 12)`. The primitive measures the TRIGGER's
 *     bounding box once on enter and centres the bubble under it. Over a grid
 *     of small layer cells that is a visibly different interaction — the label
 *     would stop following the pointer and would jump to each cell's centre.
 *  2. **Different SKIN.** `.copy-from-modal__tooltip` uses `--bg-primary`
 *     with `--border-primary` and `--shadow-md`; the primitive's `.tooltip`
 *     uses the dark `--overlay-90` bubble it inherited from `Toolbar`. The
 *     class names are BEM-final since W13/W14, so adopting the primitive
 *     would silently restyle these tooltips.
 *
 * W26 warned specifically about swapping markup for a primitive without
 * checking the rendered result. That warning applies here, so the bespoke
 * implementation stays. Unifying the two mechanisms is a real task, but it is
 * a design decision about hover affordances, not a relocation.
 */
function Tooltip({ text, x, y, visible }: { text: string; x: number; y: number; visible: boolean }) {
  if (!visible) return null;

  return createPortal(
    <div
      className="copy-from-modal__tooltip"
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
  variants?: VariantGroup[];  // Project-level variants
  onCopy: () => void;
}

function LayerCell({ obj, layer, variants, onCopy }: LayerCellProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Get variant info if this is a variant layer (now from variants)
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
        className={`copy-from-modal__cell ${layer.isVariant ? 'copy-from-modal__cell--variant' : ''}`}
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
          <span className="copy-from-modal__badge--variant"><Icon icon={Hexagon} size={10} /></span>
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

export function CopyFromModal({
  onClose,
  objects,
  variants,
  currentObject,
  onCopyLayerFromObject,
}: CopyFromModalProps) {

  const handleCopyLayer = (sourceObj: PixelObject, layer: Layer) => {
    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      onCopyLayerFromObject(
        sourceObj.id,
        layer.id,
        true,
        layer.variantGroupId,
        layer.selectedVariantId
      );
    } else {
      onCopyLayerFromObject(sourceObj.id, layer.id, false);
    }
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="copy-from-modal__backdrop" onClick={handleBackdropClick}>
      <div className="copy-from-modal">
        <div className="copy-from-modal__header">
          <h3><Icon icon={ClipboardCopy} size={16} /> Copy Layer From</h3>
          <span className="copy-from-modal__hint">Click a layer to copy it to the current object</span>
          <button className="modal__close" onClick={onClose}><Icon icon={X} size={14} /></button>
        </div>

        <div className="copy-from-modal__content">
          <div className="copy-from-modal__grid">
            {objects.map(obj => {
              // Get first frame layers
              const firstFrame = obj.frames[0];
              if (!firstFrame) return null;

              // Reverse layers so top layer appears first (like in LayerPanel)
              const layers = [...firstFrame.layers].reverse();

              const isCurrentObject = currentObject?.id === obj.id;

              return (
                <div key={obj.id} className={`copy-from-modal__row ${isCurrentObject ? 'copy-from-modal__row--current' : ''}`}>
                  <div className="copy-from-modal__name" title={obj.name}>
                    {obj.name}
                    {isCurrentObject && <span className="copy-from-modal__badge--current">(current)</span>}
                  </div>
                  <div className="copy-from-modal__layers">
                    {layers.map(layer => (
                      <LayerCell
                        key={layer.id}
                        obj={obj}
                        layer={layer}
                        variants={variants}
                        onCopy={() => handleCopyLayer(obj, layer)}
                      />
                    ))}
                    {layers.length === 0 && (
                      <div className="copy-from-modal__no-layers">No layers</div>
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


