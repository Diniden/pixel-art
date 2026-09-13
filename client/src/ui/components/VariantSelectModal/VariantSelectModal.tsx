import { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { Layer, VariantGroup, Variant } from "../../../types";
import { renderVariantFramePreview } from "../../../utils/previewRenderer";
import { AnchorGrid, AnchorPosition } from "../AnchorGrid/AnchorGrid";
import { Icon } from "../../primitives/Icon/Icon";
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import { Hexagon, X, Scaling, Copy, Check } from "lucide-react";
import "./VariantSelectModal.css";

/**
 * Props supplied by `VariantSelectModalContainer` (REFRESH task 28).
 *
 * The easiest of the four variant consumers: all 5 store members were
 * ACTIONS and it had ZERO state coupling — every read already arrived
 * through `layer` and `variantGroup`. So the container injects five
 * callbacks and nothing else, and this component no longer touches a store
 * at all.
 */
interface VariantSelectModalProps {
  layer: Layer;
  variantGroup: VariantGroup;
  onClose: () => void;
  /** `VariantStore.selectVariant` — a DOMAIN action; it repoints host layers. */
  onSelectVariant: (layerId: string, variantId: string) => void;
  onAddVariant: (variantGroupId: string, copyFromVariantId?: string) => void;
  onDeleteVariant: (variantGroupId: string, variantId: string) => void;
  onRenameVariant: (
    variantGroupId: string,
    variantId: string,
    name: string,
  ) => void;
  onResizeVariant: (
    variantGroupId: string,
    variantId: string,
    width: number,
    height: number,
    anchor: AnchorPosition,
  ) => void;
}

// Optimized thumbnail component with memoization
const VariantThumbnail = memo(
  function VariantThumbnail({ variant }: { variant: Variant }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const thumbSize = 64;

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: false });
      if (!canvas || !ctx) return;

      // Use first frame for thumbnail
      const frameToRender = variant.frames[0];
      if (!frameToRender) return;

      renderVariantFramePreview(ctx, thumbSize, variant, frameToRender);
    }, [variant]);

    return (
      <canvas
        ref={canvasRef}
        width={thumbSize}
        height={thumbSize}
        className="variant-select-modal__thumb-canvas"
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if variant actually changed
    const prev = prevProps.variant;
    const next = nextProps.variant;

    if (prev === next) return true;
    if (prev.id !== next.id) return false;
    if (prev.name !== next.name) return false;
    if (
      prev.gridSize.width !== next.gridSize.width ||
      prev.gridSize.height !== next.gridSize.height
    )
      return false;
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
  },
);

export function VariantSelectModal({
  layer,
  variantGroup,
  onClose,
  onSelectVariant: selectVariant,
  onAddVariant: addVariant,
  onDeleteVariant: deleteVariant,
  onRenameVariant: renameVariant,
  onResizeVariant: resizeVariant,
}: VariantSelectModalProps) {
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [resizingVariantId, setResizingVariantId] = useState<string | null>(
    null,
  );
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [resizeAnchor, setResizeAnchor] =
    useState<AnchorPosition>("middle-center");
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
    setEditingName("");
  };

  const handleAddNew = (copyFromId?: string) => {
    addVariant(variantGroup.id, copyFromId);
    setShowAddOptions(false);
  };

  const handleDelete = (variantId: string) => {
    if (confirm("Delete this variant? This cannot be undone.")) {
      deleteVariant(variantGroup.id, variantId);
    }
  };

  const handleStartResize = (variant: Variant) => {
    setResizingVariantId(variant.id);
    setResizeWidth(variant.gridSize.width);
    setResizeHeight(variant.gridSize.height);
    setOriginalWidth(variant.gridSize.width);
    setOriginalHeight(variant.gridSize.height);
    setResizeAnchor("middle-center");
  };

  const handleFinishResize = () => {
    if (resizingVariantId && resizeWidth > 0 && resizeHeight > 0) {
      resizeVariant(
        variantGroup.id,
        resizingVariantId,
        resizeWidth,
        resizeHeight,
        resizeAnchor,
      );
    }
    setResizingVariantId(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="variant-select-modal__backdrop"
      onClick={handleBackdropClick}
    >
      <div className="variant-select-modal">
        <div className="variant-select-modal__header">
          <h3>
            <Icon icon={Hexagon} size={16} /> Select Variant
          </h3>
          <span className="variant-select-modal__group-name">
            {variantGroup.name}
          </span>
          <button className="modal__close" onClick={onClose}>
            <Icon icon={X} size={14} />
          </button>
        </div>

        <div className="variant-select-modal__content">
          <div className="variant-select-modal__grid">
            {variantGroup.variants.map((variant) => (
              <div
                key={variant.id}
                className={`variant-select-modal__card ${selectedVariantId === variant.id ? "variant-select-modal__card--selected" : ""}`}
                onClick={() => handleSelectVariant(variant.id)}
              >
                <div className="variant-select-modal__thumb">
                  <VariantThumbnail variant={variant} />
                </div>

                <div className="variant-select-modal__info">
                  {editingVariantId === variant.id ? (
                    <input
                      type="text"
                      className="variant-select-modal__name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleFinishRename(variant.id)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleFinishRename(variant.id)
                      }
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="variant-select-modal__name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(variant);
                      }}
                    >
                      {variant.name}
                    </span>
                  )}
                  <span className="variant-select-modal__size">
                    {variant.gridSize.width}×{variant.gridSize.height}
                  </span>
                </div>

                <div className="variant-select-modal__actions">
                  <button
                    className="variant-select-modal__action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartResize(variant);
                    }}
                    title="Resize"
                  >
                    <Icon icon={Scaling} size={12} />
                  </button>
                  <button
                    className="variant-select-modal__action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddNew(variant.id);
                    }}
                    title="Duplicate"
                  >
                    <Icon icon={Copy} size={12} />
                  </button>
                  <button
                    className="variant-select-modal__action-btn variant-select-modal__action-btn--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(variant.id);
                    }}
                    disabled={variantGroup.variants.length <= 1}
                    title="Delete"
                  >
                    <Icon icon={X} size={12} />
                  </button>
                </div>

                {selectedVariantId === variant.id && (
                  <div className="variant-select-modal__badge--selected">
                    <Icon icon={Check} size={12} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add new variant section */}
          <div className="variant-select-modal__add-section">
            {showAddOptions ? (
              <div className="variant-select-modal__add-options">
                <button onClick={() => handleAddNew()}>
                  + New Empty Variant
                </button>
                <button onClick={() => setShowAddOptions(false)}>Cancel</button>
              </div>
            ) : (
              <button
                className="variant-select-modal__add-btn"
                onClick={() => setShowAddOptions(true)}
              >
                + Add Variant
              </button>
            )}
          </div>
        </div>

        {/* Resize dialog */}
        {resizingVariantId && (
          <div
            className="variant-select-modal__resize-backdrop"
            onClick={() => setResizingVariantId(null)}
          >
            <div
              className="variant-select-modal__resize-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <h4>Resize Variant</h4>
              <div className="variant-select-modal__resize-inputs">
                <label>
                  Width:
                  <NumberInput
                    unstyled
                    value={resizeWidth}
                    onChange={setResizeWidth}
                    min={1}
                  />
                </label>
                <label>
                  Height:
                  <NumberInput
                    unstyled
                    value={resizeHeight}
                    onChange={setResizeHeight}
                    min={1}
                  />
                </label>
              </div>
              <div className="variant-select-modal__resize-anchor">
                <label className="variant-select-modal__anchor-label">
                  Anchor Point:
                </label>
                <AnchorGrid
                  anchor={resizeAnchor}
                  onChange={setResizeAnchor}
                  currentWidth={originalWidth}
                  currentHeight={originalHeight}
                  newWidth={resizeWidth}
                  newHeight={resizeHeight}
                />
              </div>
              <div className="variant-select-modal__resize-actions">
                <button onClick={handleFinishResize}>Apply</button>
                <button onClick={() => setResizingVariantId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
