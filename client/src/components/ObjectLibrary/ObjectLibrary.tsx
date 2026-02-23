import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { PixelObject } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import { AnchorGrid, AnchorPosition } from '../AnchorGrid/AnchorGrid';
import './ObjectLibrary.css';

const THUMB_SIZE = 32;

const ObjectThumbnail = memo(function ObjectThumbnail({
  obj,
  project,
  isSelected,
  isFirstFrameSelected
}: {
  obj: PixelObject;
  project?: {
    variants?: import('../../types').VariantGroup[];
    uiState?: {
      variantFrameIndices?: { [key: string]: number };
      selectedObjectId?: string | null;
      selectedFrameId?: string | null;
    }
  };
  isSelected: boolean;
  isFirstFrameSelected: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = THUMB_SIZE;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx || obj.frames.length === 0) return;

    const frame = obj.frames[0];
    const variants = project?.variants;

    // Only use current variantFrameIndices if this object is selected AND the first frame is selected
    // Otherwise, use static indices (frame index 0, so variant frame index 0)
    let variantFrameIndices: { [key: string]: number } | undefined;

    if (isSelected && isFirstFrameSelected) {
      // Use current indices when editing the first frame (allows live updates)
      variantFrameIndices = project?.uiState?.variantFrameIndices;
    } else if (variants) {
      // Use static indices (all variant frames at index 0 for the thumbnail)
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
  }, [obj, project, isSelected, isFirstFrameSelected]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="obj-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if object content actually changed
  const prev = prevProps.obj;
  const next = nextProps.obj;

  if (prev === next) {
    // Object is the same - only check variant frame indices if editing first frame
    if (nextProps.isSelected && nextProps.isFirstFrameSelected) {
      const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
      const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
      if (prevIndices !== nextIndices) {
        // Check if any relevant variant frame indices changed
        const variants = prevProps.project?.variants;
        if (variants) {
          for (const vg of variants) {
            const prevIdx = prevIndices?.[vg.id] ?? 0;
            const nextIdx = nextIndices?.[vg.id] ?? 0;
            if (prevIdx !== nextIdx) return false;
          }
        }
      }
    }
    // For non-selected objects or when not editing first frame, ignore variantFrameIndices changes
    return true;
  }

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

      // Check if variant layer's selectedVariantId or offset changed
      if (prevLayer.isVariant && nextLayer.isVariant) {
        if (prevLayer.selectedVariantId !== nextLayer.selectedVariantId) {
          return false; // Variant selection changed, re-render
        }
        // Check new variantOffsets for the selected variant type
        const prevOffset = prevLayer.variantOffsets?.[prevLayer.selectedVariantId ?? ''] ?? prevLayer.variantOffset;
        const nextOffset = nextLayer.variantOffsets?.[nextLayer.selectedVariantId ?? ''] ?? nextLayer.variantOffset;
        if (prevOffset?.x !== nextOffset?.x || prevOffset?.y !== nextOffset?.y) {
          return false; // Variant offset changed, re-render
        }
      }
    }
  }

  // Only check variant frame indices if editing first frame
  if (nextProps.isSelected && nextProps.isFirstFrameSelected) {
    const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
    const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
    if (prevIndices !== nextIndices) {
      // Check if any relevant variant frame indices changed
      if (prev.variantGroups && next.variantGroups) {
        for (const vg of prev.variantGroups) {
          const prevIdx = prevIndices?.[vg.id] ?? 0;
          const nextIdx = nextIndices?.[vg.id] ?? 0;
          if (prevIdx !== nextIdx) return false;
        }
      }
    }
  }

  return true;
});

// Tooltip component for compact mode
function Tooltip({ children, visible, x, y }: { children: React.ReactNode; visible: boolean; x: number; y: number }) {
  if (!visible) return null;

  return createPortal(
    <div
      className="compact-tooltip"
      style={{
        left: x,
        top: y,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

// Compact item with hover tooltip
const CompactObjectItem = memo(function CompactObjectItem({
  obj,
  project,
  isSelected,
  isFirstFrameSelected,
  onClick,
}: {
  obj: PixelObject;
  project?: {
    variants?: import('../../types').VariantGroup[];
    uiState?: {
      variantFrameIndices?: { [key: string]: number };
      selectedObjectId?: string | null;
      selectedFrameId?: string | null;
    }
  };
  isSelected: boolean;
  isFirstFrameSelected: boolean;
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const itemRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPos({
      x: rect.right + 8,
      y: rect.top,
    });
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  return (
    <>
      <div
        ref={itemRef}
        className={`compact-object-item ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <ObjectThumbnail
          obj={obj}
          project={project}
          isSelected={isSelected}
          isFirstFrameSelected={isFirstFrameSelected}
        />
      </div>
      <Tooltip visible={showTooltip} x={tooltipPos.x} y={tooltipPos.y}>
        <div className="tooltip-name">{obj.name}</div>
        <div className="tooltip-details">
          {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
        </div>
      </Tooltip>
    </>
  );
});

export function ObjectLibrary() {
  const {
    project,
    addObject,
    deleteObject,
    renameObject,
    resizeObject,
    selectObject,
    duplicateObject,
    setObjectLibraryViewMode
  } = useEditorStore();

  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState(32);
  const [newHeight, setNewHeight] = useState(32);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showResizeFor, setShowResizeFor] = useState<string | null>(null);
  const [resizeWidth, setResizeWidth] = useState(32);
  const [resizeHeight, setResizeHeight] = useState(32);
  const [resizeAnchor, setResizeAnchor] = useState<AnchorPosition>('middle-center');
  const [originalWidth, setOriginalWidth] = useState(32);
  const [originalHeight, setOriginalHeight] = useState(32);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const viewMode = project?.uiState.objectLibraryViewMode ?? 'normal';

  if (!project) return null;

  const { objects, uiState } = project;
  const { selectedObjectId } = uiState;

  const handleAddObject = () => {
    const name = newName.trim() || `Object ${objects.length + 1}`;
    addObject(name, newWidth, newHeight);
    setNewName('');
    setNewWidth(32);
    setNewHeight(32);
    setShowNewForm(false);
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleFinishRename = (id: string) => {
    if (editingName.trim()) {
      renameObject(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleStartResize = (obj: PixelObject) => {
    setShowResizeFor(obj.id);
    setResizeWidth(obj.gridSize.width);
    setResizeHeight(obj.gridSize.height);
    setOriginalWidth(obj.gridSize.width);
    setOriginalHeight(obj.gridSize.height);
    setResizeAnchor('middle-center');
  };

  const handleApplyResize = (id: string) => {
    resizeObject(id, resizeWidth, resizeHeight, resizeAnchor);
    setShowResizeFor(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteObject(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const cycleViewMode = () => {
    if (viewMode === 'normal') {
      setObjectLibraryViewMode('small-rows');
    } else if (viewMode === 'small-rows') {
      setObjectLibraryViewMode('grid');
    } else {
      setObjectLibraryViewMode('normal');
    }
  };

  const getViewModeIcon = () => {
    if (viewMode === 'normal') return '☰';
    if (viewMode === 'small-rows') return '≡';
    return '▦';
  };

  const getViewModeTitle = () => {
    if (viewMode === 'normal') return 'Normal View (click for Small Rows)';
    if (viewMode === 'small-rows') return 'Small Rows (click for Grid)';
    return 'Grid View (click for Normal)';
  };

  return (
    <div className="panel object-library">
      <div className="panel-header">
        Objects
        <div className="header-actions">
          <button
            className={`header-btn compact-toggle ${viewMode !== 'normal' ? 'active' : ''}`}
            onClick={cycleViewMode}
            title={getViewModeTitle()}
          >
            {getViewModeIcon()}
          </button>
          <button
            className="header-btn"
            onClick={() => setShowNewForm(!showNewForm)}
            title="New Object"
          >
            +
          </button>
        </div>
      </div>
      <div className="panel-content">
        {showNewForm && (
          <div className="new-object-form">
            <input
              type="text"
              placeholder="Object name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="size-inputs">
              <div className="size-field">
                <label>W</label>
                <input
                  type="number"
                  min="1"
                  max="256"
                  value={newWidth}
                  onChange={(e) => setNewWidth(parseInt(e.target.value) || 1)}
                />
              </div>
              <span className="size-separator">×</span>
              <div className="size-field">
                <label>H</label>
                <input
                  type="number"
                  min="1"
                  max="256"
                  value={newHeight}
                  onChange={(e) => setNewHeight(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setShowNewForm(false)}>
                Cancel
              </button>
              <button className="create-btn" onClick={handleAddObject}>
                Create
              </button>
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="object-grid">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && project.uiState.selectedFrameId === firstFrame.id;

              return (
                <CompactObjectItem
                  key={obj.id}
                  obj={obj}
                  project={project}
                  isSelected={isSelected}
                  isFirstFrameSelected={isFirstFrameSelected}
                  onClick={() => selectObject(obj.id)}
                />
              );
            })}
          </div>
        ) : viewMode === 'small-rows' ? (
          <div className="object-list-small">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && project.uiState.selectedFrameId === firstFrame.id;

              return (
                <div
                  key={obj.id}
                  className={`object-item-small ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectObject(obj.id)}
                >
                  <div className="object-thumbnail-small">
                    <ObjectThumbnail
                      obj={obj}
                      project={project}
                      isSelected={isSelected}
                      isFirstFrameSelected={isFirstFrameSelected}
                    />
                  </div>
                  {editingId === obj.id ? (
                    <input
                      type="text"
                      className="object-name-input-small"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleFinishRename(obj.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(obj.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="object-name-small"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(obj.id, obj.name);
                      }}
                    >
                      {obj.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="object-list">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && project.uiState.selectedFrameId === firstFrame.id;

              return (
              <div key={obj.id} className="object-wrapper">
                <div
                  className={`object-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectObject(obj.id)}
                >
                  <div className="object-thumbnail">
                    <ObjectThumbnail
                      obj={obj}
                      project={project}
                      isSelected={isSelected}
                      isFirstFrameSelected={isFirstFrameSelected}
                    />
                  </div>
                  <div className="object-content">
                    <div className="object-name-row">
                      {editingId === obj.id ? (
                        <input
                          type="text"
                          className="object-name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleFinishRename(obj.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(obj.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="object-name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(obj.id, obj.name);
                          }}
                        >
                          {obj.name}
                        </span>
                      )}
                    </div>

                    <div className="object-metrics-row">
                      <span className="object-details">
                        {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="object-actions-row">
                      <div className="object-actions">
                        <button
                          className="object-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateObject(obj.id);
                          }}
                          title="Duplicate"
                        >
                          ⧉
                        </button>
                        <button
                          className="object-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartResize(obj);
                          }}
                          title="Resize"
                        >
                          ⤢
                        </button>
                        <button
                          className="object-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: obj.id, name: obj.name });
                          }}
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {showResizeFor === obj.id && (
                  <div className="resize-panel">
                    <div className="size-inputs">
                      <div className="size-field">
                        <label>W</label>
                        <input
                          type="number"
                          min="1"
                          max="256"
                          value={resizeWidth}
                          onChange={(e) => setResizeWidth(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <span className="size-separator">×</span>
                      <div className="size-field">
                        <label>H</label>
                        <input
                          type="number"
                          min="1"
                          max="256"
                          value={resizeHeight}
                          onChange={(e) => setResizeHeight(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                    <div className="resize-anchor-section">
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
                      <button onClick={() => setShowResizeFor(null)}>Cancel</button>
                      <button className="apply-btn" onClick={() => handleApplyResize(obj.id)}>
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}

        {objects.length === 0 && (
          <div className="empty-state">
            No objects yet. Create one to start.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
        <div className="delete-confirm-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h4>⚠️ Delete Object</h4>
            </div>
            <div className="delete-confirm-content">
              <p>
                Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
              </p>
              <p className="delete-confirm-warning">
                This will permanently delete the object and all its frames and layers.
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
        </div>,
        document.body
      )}
    </div>
  );
}

