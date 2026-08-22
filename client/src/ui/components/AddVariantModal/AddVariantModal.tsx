import { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { VariantGroup } from "../../../types";
import { renderVariantFramePreview } from "../../../utils/previewRenderer";
import { Icon } from "../../primitives/Icon/Icon";
import { Wand2, X, AlertTriangle } from "lucide-react";
import "./AddVariantModal.css";

/**
 * Props supplied by `AddVariantModalContainer` (REFRESH task 28).
 *
 * Of the four variant consumers this is the only one whose single state read
 * was not already prop-driven: it read `project?.variants` off the Zustand
 * store. That becomes the `variants` prop, sourced from `DomainStore.variants`
 * — the project-level source of truth since v1.1.0. Object-level
 * `variantGroups` is NEVER read (the migration sets it to `undefined`).
 */
interface AddVariantModalProps {
  onClose: () => void;
  /** `DomainStore.variants` — project-level, never `obj.variantGroups`. */
  variants: VariantGroup[];
  onAddVariantLayerFromExisting: (
    variantGroupId: string,
    selectedVariantId: string,
    addToAllFrames: boolean,
  ) => void;
  onDeleteVariantGroup: (variantGroupId: string) => void;
  onRenameVariantGroup: (variantGroupId: string, name: string) => void;
}

// Optimized thumbnail component with memoization
const VariantGroupThumbnail = memo(
  function VariantGroupThumbnail({
    variantGroup,
  }: {
    variantGroup: VariantGroup;
  }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const thumbSize = 64;

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: false });
      if (!canvas || !ctx) return;

      // Use first variant's first frame for thumbnail
      const variant = variantGroup.variants[0];
      const frameToRender = variant?.frames[0];
      if (!frameToRender || !variant) return;

      renderVariantFramePreview(ctx, thumbSize, variant, frameToRender);
    }, [variantGroup]);

    return (
      <canvas
        ref={canvasRef}
        width={thumbSize}
        height={thumbSize}
        className="add-variant-modal__thumb-canvas"
      />
    );
  },
  (prevProps, nextProps) => {
    const prev = prevProps.variantGroup;
    const next = nextProps.variantGroup;

    if (prev === next) return true;
    if (prev.id !== next.id) return false;
    if (prev.variants.length !== next.variants.length) return false;

    return true;
  },
);

export function AddVariantModal({
  onClose,
  variants,
  onAddVariantLayerFromExisting: addVariantLayerFromExisting,
  onDeleteVariantGroup: deleteVariantGroup,
  onRenameVariantGroup: renameVariantGroup,
}: AddVariantModalProps) {
  const [addToAllFrames, setAddToAllFrames] = useState(true);
  const [selectedVariantGroupId, setSelectedVariantGroupId] = useState<
    string | null
  >(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    groupId: string;
    name: string;
  } | null>(null);

  const handleSelectVariantGroup = (groupId: string) => {
    const group = variants.find((vg) => vg.id === groupId);
    if (group) {
      setSelectedVariantGroupId(groupId);
      // Auto-select first variant type
      setSelectedVariantId(group.variants[0]?.id ?? null);
    }
  };

  const handleSelectVariantType = (variantId: string) => {
    setSelectedVariantId(variantId);
  };

  const handleAdd = () => {
    if (selectedVariantGroupId && selectedVariantId) {
      addVariantLayerFromExisting(
        selectedVariantGroupId,
        selectedVariantId,
        addToAllFrames,
      );
      onClose();
    }
  };

  const handleStartRename = (group: VariantGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const handleFinishRename = (groupId: string) => {
    if (editingName.trim()) {
      renameVariantGroup(groupId, editingName.trim());
    }
    setEditingGroupId(null);
    setEditingName("");
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteVariantGroup(deleteConfirm.groupId);
      setDeleteConfirm(null);
      // Clear selection if we deleted the selected group
      if (selectedVariantGroupId === deleteConfirm.groupId) {
        setSelectedVariantGroupId(null);
        setSelectedVariantId(null);
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Get the selected variant group for the variant type picker
  const selectedGroup = selectedVariantGroupId
    ? variants.find((vg) => vg.id === selectedVariantGroupId)
    : null;

  return createPortal(
    <div className="add-variant-modal__backdrop" onClick={handleBackdropClick}>
      <div className="add-variant-modal">
        <div className="add-variant-modal__header">
          <h3>
            <Icon icon={Wand2} size={16} /> Add Variant Layer
          </h3>
          <button className="modal__close" onClick={onClose}>
            <Icon icon={X} size={14} />
          </button>
        </div>

        <div className="add-variant-modal__content">
          {variants.length === 0 ? (
            <div className="add-variant-modal__empty">
              <p>No variants exist yet.</p>
              <p className="add-variant-modal__hint">
                Create a variant by selecting a layer and clicking the make
                variant button.
              </p>
            </div>
          ) : (
            <>
              {/* Toggle for add to all frames */}
              <div className="add-variant-modal__all-frames-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={addToAllFrames}
                    onChange={(e) => setAddToAllFrames(e.target.checked)}
                  />
                  <span>Add to all frames</span>
                </label>
              </div>

              {/* Variant Groups Grid */}
              <div className="add-variant-modal__section-title">
                Select Variant
              </div>
              <div className="add-variant-modal__grid">
                {variants.map((variantGroup) => (
                  <div
                    key={variantGroup.id}
                    className={`add-variant-modal__card ${selectedVariantGroupId === variantGroup.id ? "add-variant-modal__card--selected" : ""}`}
                    onClick={() => handleSelectVariantGroup(variantGroup.id)}
                  >
                    {/* Delete button */}
                    <button
                      className="add-variant-modal__delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({
                          groupId: variantGroup.id,
                          name: variantGroup.name,
                        });
                      }}
                      title="Delete variant"
                    >
                      <Icon icon={X} size={10} />
                    </button>

                    <div className="add-variant-modal__thumb">
                      <VariantGroupThumbnail variantGroup={variantGroup} />
                    </div>

                    <div className="add-variant-modal__info">
                      {editingGroupId === variantGroup.id ? (
                        <input
                          type="text"
                          className="add-variant-modal__name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleFinishRename(variantGroup.id)}
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            handleFinishRename(variantGroup.id)
                          }
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="add-variant-modal__name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(variantGroup);
                          }}
                          title="Double-click to rename"
                        >
                          {variantGroup.name}
                        </span>
                      )}
                      <span className="add-variant-modal__count">
                        {variantGroup.variants.length} type
                        {variantGroup.variants.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {selectedVariantGroupId === variantGroup.id && (
                      <div className="add-variant-modal__badge add-variant-modal__badge--selected">
                        ✓
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Variant Type Picker (when a group is selected) */}
              {selectedGroup && selectedGroup.variants.length > 1 && (
                <>
                  <div className="add-variant-modal__section-title">
                    Select Variant Type
                  </div>
                  <div className="add-variant-modal__type-picker">
                    {selectedGroup.variants.map((variant) => (
                      <div
                        key={variant.id}
                        className={`add-variant-modal__type-option ${selectedVariantId === variant.id ? "add-variant-modal__type-option--selected" : ""}`}
                        onClick={() => handleSelectVariantType(variant.id)}
                      >
                        <span className="add-variant-modal__type-name">
                          {variant.name}
                        </span>
                        {selectedVariantId === variant.id && (
                          <span className="add-variant-modal__check">✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Add button */}
              <div className="add-variant-modal__actions">
                <button
                  className="add-variant-modal__confirm-btn"
                  onClick={handleAdd}
                  disabled={!selectedVariantGroupId || !selectedVariantId}
                >
                  Add Variant Layer
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="confirm-dialog__backdrop"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="confirm-dialog confirm-dialog--danger"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog__header">
              <h4>
                <Icon icon={AlertTriangle} size={14} /> Delete Variant
              </h4>
            </div>
            <div className="confirm-dialog__body">
              <p>
                Are you sure you want to delete{" "}
                <strong>"{deleteConfirm.name}"</strong>?
              </p>
              <p className="confirm-dialog__warning">
                This will remove this variant from{" "}
                <strong>all objects and all frames</strong> that reference it.
              </p>
              <p className="confirm-dialog__undo">
                You can undo this action with Cmd+Z.
              </p>
            </div>
            <div className="confirm-dialog__actions">
              <button
                className="btn btn--muted"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button className="btn btn--danger" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
