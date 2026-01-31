import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { VariantGroup } from '../../types';
import { renderVariantFramePreview } from '../../utils/previewRenderer';
import './AddVariantModal.css';

interface AddVariantModalProps {
  onClose: () => void;
}

// Optimized thumbnail component with memoization
const VariantGroupThumbnail = memo(function VariantGroupThumbnail({
  variantGroup
}: {
  variantGroup: VariantGroup;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    // Use first variant's first frame for thumbnail
    const variant = variantGroup.variants[0];
    const frameToRender = variant?.frames[0];
    if (!frameToRender || !variant) return;

    renderVariantFramePreview(ctx, thumbSize, variant, frameToRender);
  }, [variantGroup]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="add-variant-thumb-canvas" />;
}, (prevProps, nextProps) => {
  const prev = prevProps.variantGroup;
  const next = nextProps.variantGroup;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.variants.length !== next.variants.length) return false;

  return true;
});

export function AddVariantModal({ onClose }: AddVariantModalProps) {
  const {
    project,
    addVariantLayerFromExisting,
    deleteVariantGroup,
    renameVariantGroup
  } = useEditorStore();

  const [addToAllFrames, setAddToAllFrames] = useState(true);
  const [selectedVariantGroupId, setSelectedVariantGroupId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ groupId: string; name: string } | null>(null);

  const variants = project?.variants ?? [];

  const handleSelectVariantGroup = (groupId: string) => {
    const group = variants.find(vg => vg.id === groupId);
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
      addVariantLayerFromExisting(selectedVariantGroupId, selectedVariantId, addToAllFrames);
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
    setEditingName('');
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
    ? variants.find(vg => vg.id === selectedVariantGroupId)
    : null;

  return createPortal(
    <div className="add-variant-modal-backdrop" onClick={handleBackdropClick}>
      <div className="add-variant-modal">
        <div className="add-variant-modal-header">
          <h3>✦ Add Variant Layer</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="add-variant-modal-content">
          {variants.length === 0 ? (
            <div className="no-variants-message">
              <p>No variants exist yet.</p>
              <p className="hint">Create a variant by selecting a layer and clicking the ✦ make variant button.</p>
            </div>
          ) : (
            <>
              {/* Toggle for add to all frames */}
              <div className="add-to-all-frames-toggle">
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
              <div className="add-variant-section-title">Select Variant</div>
              <div className="add-variant-grid">
                {variants.map(variantGroup => (
                  <div
                    key={variantGroup.id}
                    className={`add-variant-card ${selectedVariantGroupId === variantGroup.id ? 'selected' : ''}`}
                    onClick={() => handleSelectVariantGroup(variantGroup.id)}
                  >
                    {/* Delete button */}
                    <button
                      className="delete-variant-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ groupId: variantGroup.id, name: variantGroup.name });
                      }}
                      title="Delete variant"
                    >
                      ×
                    </button>

                    <div className="add-variant-thumb">
                      <VariantGroupThumbnail variantGroup={variantGroup} />
                    </div>

                    <div className="add-variant-info">
                      {editingGroupId === variantGroup.id ? (
                        <input
                          type="text"
                          className="add-variant-name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleFinishRename(variantGroup.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(variantGroup.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="add-variant-name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(variantGroup);
                          }}
                          title="Double-click to rename"
                        >
                          {variantGroup.name}
                        </span>
                      )}
                      <span className="add-variant-count">
                        {variantGroup.variants.length} type{variantGroup.variants.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {selectedVariantGroupId === variantGroup.id && (
                      <div className="selected-badge">✓</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Variant Type Picker (when a group is selected) */}
              {selectedGroup && selectedGroup.variants.length > 1 && (
                <>
                  <div className="add-variant-section-title">Select Variant Type</div>
                  <div className="variant-type-picker">
                    {selectedGroup.variants.map(variant => (
                      <div
                        key={variant.id}
                        className={`variant-type-option ${selectedVariantId === variant.id ? 'selected' : ''}`}
                        onClick={() => handleSelectVariantType(variant.id)}
                      >
                        <span className="variant-type-name">{variant.name}</span>
                        {selectedVariantId === variant.id && <span className="check">✓</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Add button */}
              <div className="add-variant-actions">
                <button
                  className="add-variant-confirm-btn"
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
        <div className="delete-confirm-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h4>⚠️ Delete Variant</h4>
            </div>
            <div className="delete-confirm-content">
              <p>
                Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
              </p>
              <p className="delete-confirm-warning">
                This will remove this variant from <strong>all objects and all frames</strong> that reference it.
              </p>
              <p className="delete-confirm-undo">
                You can undo this action with Cmd+Z.
              </p>
            </div>
            <div className="delete-confirm-actions">
              <button
                className="cancel-btn"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="delete-btn"
                onClick={handleDeleteConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

