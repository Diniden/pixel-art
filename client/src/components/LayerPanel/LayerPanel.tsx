import { useState, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { VariantSelectModal } from '../VariantSelectModal/VariantSelectModal';
import { CopyFromModal } from '../CopyFromModal/CopyFromModal';
import { AddVariantModal } from '../AddVariantModal/AddVariantModal';
import './LayerPanel.css';

export function LayerPanel() {
  const {
    project,
    getCurrentObject,
    getCurrentFrame,
    addLayer,
    duplicateLayer,
    deleteLayer,
    renameLayer,
    toggleLayerVisibility,
    toggleAllLayersVisibility,
    selectLayer,
    moveLayer,
    moveLayerAcrossAllFrames,
    deleteLayerAcrossAllFrames,
    squashLayerDown,
    squashLayerUp,
    squashLayerDownAcrossAllFrames,
    squashLayerUpAcrossAllFrames,
    makeVariant,
    copyLayerToClipboard,
    pasteLayerFromClipboard,
    layerClipboard,
    removeVariantLayer
  } = useEditorStore();

  const [newLayerName, setNewLayerName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [variantModalLayerId, setVariantModalLayerId] = useState<string | null>(null);
  const [showCopyFromModal, setShowCopyFromModal] = useState(false);
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);

  const obj = getCurrentObject();
  const frame = getCurrentFrame();

  // Handle Cmd+V to paste layer (only to current frame)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && layerClipboard) {
        // Only paste if not focused on an input
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        pasteLayerFromClipboard(true); // Paste only to current frame
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layerClipboard, pasteLayerFromClipboard]);

  if (!project || !frame || !obj) return null;

  const { selectedLayerId } = project.uiState;
  const layers = [...frame.layers].reverse(); // Display top layer first
  const allVisible = frame.layers.every((l) => l.visible);
  const allHidden = frame.layers.every((l) => !l.visible);
  const hasVariants = (project.variants?.length ?? 0) > 0;

  // Find selected layer index for header button enable/disable
  const selectedLayerIndex = selectedLayerId
    ? frame.layers.findIndex(l => l.id === selectedLayerId)
    : -1;
  const selectedLayer = selectedLayerId ? frame.layers.find(l => l.id === selectedLayerId) : null;
  const canMoveUp = selectedLayerIndex >= 0 && selectedLayerIndex < frame.layers.length - 1;
  const canMoveDown = selectedLayerIndex > 0;
  const canSquashDown = selectedLayerIndex > 0 &&
    !selectedLayer?.isVariant &&
    !frame.layers[selectedLayerIndex - 1]?.isVariant;
  const canSquashUp = selectedLayerIndex >= 0 &&
    selectedLayerIndex < frame.layers.length - 1 &&
    !selectedLayer?.isVariant &&
    !frame.layers[selectedLayerIndex + 1]?.isVariant;

  const handleAddLayer = () => {
    const name = newLayerName.trim() || `Layer ${frame.layers.length + 1}`;
    addLayer(name);
    setNewLayerName('');
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleFinishRename = (id: string) => {
    if (editingName.trim()) {
      renameLayer(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    // Convert display index (reversed) to actual index
    const actualFromIndex = layers.length - 1 - dragIndex;
    const actualToIndex = layers.length - 1 - index;

    moveLayer(actualFromIndex, actualToIndex);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleMoveLayerUp = (displayIndex: number) => {
    // Display is reversed, so moving "up" in display means moving "down" in actual array
    // which means higher index in the actual array (rendered on top)
    if (displayIndex <= 0) return; // Already at top in display
    const actualIndex = layers.length - 1 - displayIndex;
    moveLayer(actualIndex, actualIndex + 1);
  };

  const handleMoveLayerDown = (displayIndex: number) => {
    // Display is reversed, so moving "down" in display means moving "up" in actual array
    // which means lower index in the actual array (rendered below)
    if (displayIndex >= layers.length - 1) return; // Already at bottom in display
    const actualIndex = layers.length - 1 - displayIndex;
    moveLayer(actualIndex, actualIndex - 1);
  };

  return (
    <div className="panel layer-panel">
      <div className="panel-header">
        <div className="panel-header-title">Layers</div>
        <div className="header-actions">
          <button
            className="header-btn move-all-frames-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedLayerId) {
                moveLayerAcrossAllFrames(selectedLayerId, 'up');
              }
            }}
            disabled={!canMoveUp}
            title="Move selected layer up across all frames"
          >
            ▲
          </button>
          <button
            className="header-btn move-all-frames-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedLayerId) {
                moveLayerAcrossAllFrames(selectedLayerId, 'down');
              }
            }}
            disabled={!canMoveDown}
            title="Move selected layer down across all frames"
          >
            ▼
          </button>
          <button
            className="header-btn squash-all-frames-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedLayerId) {
                squashLayerDownAcrossAllFrames(selectedLayerId);
              }
            }}
            disabled={!canSquashDown}
            title="Squash down across all frames (this layer squashes into layer below)"
          >
            ⬇
          </button>
          <button
            className="header-btn squash-all-frames-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedLayerId) {
                squashLayerUpAcrossAllFrames(selectedLayerId);
              }
            }}
            disabled={!canSquashUp}
            title="Squash up across all frames (this layer squashes into layer above)"
          >
            ⬆
          </button>
          <button
            className={`header-btn visibility-toggle ${allVisible ? 'all-visible' : ''}`}
            onClick={() => toggleAllLayersVisibility(!allVisible)}
            title={allVisible ? 'Hide all layers' : 'Show all layers'}
          >
            {allVisible ? '👁' : allHidden ? '○' : '◐'}
          </button>
          <button
            className="header-btn copy-from-btn"
            onClick={() => setShowCopyFromModal(true)}
            title="Copy layer from another object"
          >
            📋
          </button>
          <button
            className={`header-btn add-variant-btn ${hasVariants ? '' : 'disabled'}`}
            onClick={() => hasVariants && setShowAddVariantModal(true)}
            disabled={!hasVariants}
            title={hasVariants ? "Add existing variant as layer" : "No variants exist yet"}
          >
            ✦
          </button>
          <button className="header-btn" onClick={handleAddLayer} title="New Layer">
            +
          </button>
          <button
            className="header-btn delete-all-frames-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedLayerId && frame.layers.length > 1) {
                if (confirm('Delete this layer across all frames?')) {
                  deleteLayerAcrossAllFrames(selectedLayerId);
                }
              }
            }}
            disabled={!selectedLayerId || frame.layers.length <= 1}
            title="Delete selected layer across all frames"
          >
            ×
          </button>
        </div>
      </div>
      <div className="panel-content">
        <div className="new-layer-form">
          <input
            type="text"
            placeholder="New layer name..."
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLayer()}
          />
        </div>

        <div className="layer-list">
          {layers.map((layer, displayIndex) => {
            // Get variant info if this is a variant layer (now from project.variants)
            const variantGroup = layer.isVariant && layer.variantGroupId
              ? project.variants?.find(vg => vg.id === layer.variantGroupId)
              : null;
            const selectedVariant = variantGroup?.variants.find(v => v.id === layer.selectedVariantId);

            return (
              <div
                key={layer.id}
                className={`layer-item ${selectedLayerId === layer.id ? 'selected' : ''} ${dragIndex === displayIndex ? 'dragging' : ''} ${layer.isVariant ? 'variant-layer' : ''}`}
                onClick={() => selectLayer(layer.id)}
                draggable
                onDragStart={() => handleDragStart(displayIndex)}
                onDragOver={(e) => handleDragOver(e, displayIndex)}
                onDragEnd={handleDragEnd}
              >
                <div className="layer-content-row">
                  <div className="layer-visibility-column">
                    <button
                      className={`visibility-btn ${layer.visible ? 'visible' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(layer.id);
                      }}
                      title={layer.visible ? 'Hide layer' : 'Show layer'}
                    >
                      {layer.visible ? '👁' : '○'}
                    </button>
                    {/* Variant select button for variant layers - always visible */}
                    {layer.isVariant && (
                      <button
                        className="layer-action-btn variant-select-btn variant-select-in-column"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVariantModalLayerId(layer.id);
                        }}
                        title="Select variant"
                      >
                        ⬡
                      </button>
                    )}
                  </div>
                  <div className="layer-main-column">
                    <div className="layer-label-row">
                      {/* Variant icon for variant layers */}
                      {layer.isVariant && (
                        <span className="variant-icon" title="Variant Layer">⬡</span>
                      )}

                      {editingId === layer.id ? (
                        <input
                          type="text"
                          className="layer-name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleFinishRename(layer.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(layer.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="layer-name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(layer.id, layer.name);
                          }}
                        >
                          {layer.name}
                          {layer.isVariant && variantGroup && (
                            <span className="variant-group-badge" title={`Variant: ${variantGroup.name}`}>
                              {variantGroup.name}
                            </span>
                          )}
                          {layer.isVariant && selectedVariant && (
                            <span className="variant-type-badge" title={`Type: ${selectedVariant.name}`}>
                              {selectedVariant.name}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="layer-actions">
                      {/* Copy layer button */}
                      <button
                        className="layer-action-btn copy-layer-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyLayerToClipboard(layer.id);
                        }}
                        title="Copy layer across all frames (Cmd+V pastes to current frame only)"
                      >
                        📋
                      </button>
                      {/* Variant-specific actions */}
                      {!layer.isVariant && (
                        <button
                          className="layer-action-btn make-variant-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            makeVariant(layer.id);
                          }}
                          title="Make variant"
                        >
                          ✦
                        </button>
                      )}
                      <button
                        className="layer-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveLayerUp(displayIndex);
                        }}
                        disabled={displayIndex === 0}
                        title="Move layer up (current frame only)"
                      >
                        ▲
                      </button>
                      <button
                        className="layer-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveLayerDown(displayIndex);
                        }}
                        disabled={displayIndex === layers.length - 1}
                        title="Move layer down (current frame only)"
                      >
                        ▼
                      </button>
                      {!layer.isVariant && (
                        <>
                          {/* Squash buttons - only show for regular layers */}
                          {/* Convert display index to actual index */}
                          {(() => {
                            const actualIndex = layers.length - 1 - displayIndex;
                            const canSquashDownThis = actualIndex > 0 &&
                              !frame.layers[actualIndex - 1]?.isVariant;
                            const canSquashUpThis = actualIndex < frame.layers.length - 1 &&
                              !frame.layers[actualIndex + 1]?.isVariant;

                            return (
                              <>
                                <button
                                  className="layer-action-btn squash-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    squashLayerDown(layer.id);
                                  }}
                                  disabled={!canSquashDownThis}
                                  title="Squash down (this layer squashes into layer below)"
                                >
                                  ⬇
                                </button>
                                <button
                                  className="layer-action-btn squash-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    squashLayerUp(layer.id);
                                  }}
                                  disabled={!canSquashUpThis}
                                  title="Squash up (this layer squashes into layer above)"
                                >
                                  ⬆
                                </button>
                              </>
                            );
                          })()}
                          <button
                            className="layer-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateLayer(layer.id);
                            }}
                            title="Duplicate layer"
                          >
                            ⧉
                          </button>
                          <button
                            className="layer-action-btn delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLayer(layer.id);
                            }}
                            disabled={frame.layers.length <= 1}
                            title="Delete layer"
                          >
                            ×
                          </button>
                        </>
                      )}
                      {/* Delete button for variant layers - removes layer only, not the variant */}
                      {layer.isVariant && (
                        <button
                          className="layer-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeVariantLayer(layer.id);
                          }}
                          title="Remove variant layer (variant data preserved)"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {layers.length === 0 && (
          <div className="empty-state">
            No layers. Add one to start drawing.
          </div>
        )}
      </div>

      {/* Variant Selection Modal */}
      {variantModalLayerId && (() => {
        const modalLayer = frame.layers.find(l => l.id === variantModalLayerId);
        const modalVariantGroup = modalLayer?.variantGroupId
          ? project.variants?.find(vg => vg.id === modalLayer.variantGroupId)
          : null;

        if (!modalLayer || !modalVariantGroup) return null;

        return (
          <VariantSelectModal
            layer={modalLayer}
            variantGroup={modalVariantGroup}
            onClose={() => setVariantModalLayerId(null)}
          />
        );
      })()}

      {/* Copy From Modal */}
      {showCopyFromModal && (
        <CopyFromModal onClose={() => setShowCopyFromModal(false)} />
      )}

      {/* Add Variant Modal */}
      {showAddVariantModal && (
        <AddVariantModal onClose={() => setShowAddVariantModal(false)} />
      )}
    </div>
  );
}

