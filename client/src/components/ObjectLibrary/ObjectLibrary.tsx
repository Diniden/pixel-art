import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PixelObject, VariantGroup } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import { AnchorGrid, AnchorPosition } from '../AnchorGrid/AnchorGrid';
import { Icon } from '../../ui/primitives/Icon/Icon';
import { Copy, Maximize, X, AlertTriangle } from 'lucide-react';
import './ObjectLibrary.css';

const THUMB_SIZE = 32;

/**
 * ⚠️ THE MEMO COMPARATORS WERE REMOVED HERE (REFRESH task 28).
 *
 * `ObjectThumbnail` and `CompactObjectItem` each carried a hand-written
 * `React.memo` comparator (79 and 0 lines) that threaded `project` internals
 * — `project.uiState.variantFrameIndices`, `project.variants`, and every
 * layer of every object's first frame. The task spec required them
 * "rewritten or removed", and removal is the correct call for three measured
 * reasons:
 *
 *  1. **One of them was already broken, and broken in exactly the way the
 *     spec predicted.** Its final block iterated `prev.variantGroups` — the
 *     OBJECT-level variant list, which the v1.1.0 migration sets to
 *     `undefined` on load. The loop therefore never executed, so a
 *     variant-frame change on a changed object never invalidated the
 *     thumbnail. That is the stale-thumbnail regression, live in the code
 *     before this task rather than introduced by it.
 *  2. **`project` is the wrong dependency.** Every pixel edit publishes a NEW
 *     `project` object (measured, W19), so a comparator keyed on it either
 *     re-runs constantly or — as here — reaches for a sub-field that stopped
 *     existing. The component now takes `variants` and `variantFrameIndices`
 *     DIRECTLY, so React's default shallow compare sees the real inputs.
 *  3. **`observer()` on `ObjectLibraryContainer` makes the coarse guard
 *     redundant.** MobX invalidates on the observables actually read, which
 *     is strictly finer-grained than a comparator scanning whole frames.
 *
 * Default shallow memo is retained on both: `obj` and `variants` are replaced
 * by reference on a real change, and `variantFrameIndices` is `observableRef`
 * so it too is a new record per change. No `project` reference is threaded.
 */
const ObjectThumbnail = memo(function ObjectThumbnail({
  obj,
  variants,
  variantFrameIndices: liveVariantFrameIndices,
  isSelected,
  isFirstFrameSelected
}: {
  obj: PixelObject;
  /** `DomainStore.variants` — project-level, never `obj.variantGroups`. */
  variants?: VariantGroup[];
  /** `TimelineUIStore.variantFrameIndices`. */
  variantFrameIndices?: { [key: string]: number };
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

    // Only use the LIVE indices when this object is selected AND its first
    // frame is the selected one; otherwise render the static index-0 pose.
    // Behaviour unchanged from the pre-task-28 code.
    let variantFrameIndices: { [key: string]: number } | undefined;

    if (isSelected && isFirstFrameSelected) {
      variantFrameIndices = liveVariantFrameIndices;
    } else if (variants) {
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
  }, [obj, variants, liveVariantFrameIndices, isSelected, isFirstFrameSelected]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="object-library__thumb-canvas" />;
});

// Tooltip component for compact mode
function Tooltip({ children, visible, x, y }: { children: React.ReactNode; visible: boolean; x: number; y: number }) {
  if (!visible) return null;

  return createPortal(
    <div
      className="object-library__tooltip"
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
  variants,
  variantFrameIndices,
  isSelected,
  isFirstFrameSelected,
  onClick,
}: {
  obj: PixelObject;
  variants?: VariantGroup[];
  variantFrameIndices?: { [key: string]: number };
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
        className={`object-library__grid-item ${isSelected ? 'object-library__grid-item--selected' : ''}`}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <ObjectThumbnail
          obj={obj}
          variants={variants}
          variantFrameIndices={variantFrameIndices}
          isSelected={isSelected}
          isFirstFrameSelected={isFirstFrameSelected}
        />
      </div>
      <Tooltip visible={showTooltip} x={tooltipPos.x} y={tooltipPos.y}>
        <div className="object-library__tooltip-name">{obj.name}</div>
        <div className="object-library__tooltip-details">
          {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
        </div>
      </Tooltip>
    </>
  );
});

/**
 * Props supplied by `ObjectLibraryContainer` (REFRESH task 28).
 *
 * This component had NO props at all — it was fully store-driven, reading
 * `project` and seven actions off `useEditorStore()`. The container now
 * injects the reads explicitly, which is also what let both memo comparators
 * go: nothing threads a `project` reference any more.
 *
 * ⚠️ Its 15 `useState` calls (5 inline dialogs) are deliberately NOT
 * extracted — the spec assigns that to the purification task, not this one.
 */
export interface ObjectLibraryProps {
  /** `DomainStore.objects`. */
  objects: PixelObject[];
  /** `DomainStore.variants` — project-level, never `obj.variantGroups`. */
  variants: VariantGroup[];
  /** `TimelineUIStore.variantFrameIndices`. */
  variantFrameIndices: { [key: string]: number };
  selectedObjectId: string | null;
  selectedFrameId: string | null;
  objectLibraryViewMode: 'normal' | 'small-rows' | 'grid';
  onAddObject: (name: string, width: number, height: number) => void;
  onDeleteObject: (id: string) => void;
  onRenameObject: (id: string, name: string) => void;
  onResizeObject: (
    id: string,
    width: number,
    height: number,
    anchor: AnchorPosition,
  ) => void;
  onSelectObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onSetObjectLibraryViewMode: (
    mode: 'normal' | 'small-rows' | 'grid',
  ) => void;
}

export function ObjectLibrary({
  objects,
  variants,
  variantFrameIndices,
  selectedObjectId,
  selectedFrameId,
  objectLibraryViewMode: viewMode,
  onAddObject: addObject,
  onDeleteObject: deleteObject,
  onRenameObject: renameObject,
  onResizeObject: resizeObject,
  onSelectObject: selectObject,
  onDuplicateObject: duplicateObject,
  onSetObjectLibraryViewMode: setObjectLibraryViewMode,
}: ObjectLibraryProps) {

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
      <div className="panel__header">
        Objects
        <div className="object-library__header-actions">
          <button
            className={`object-library__view-toggle ${viewMode !== 'normal' ? 'object-library__view-toggle--active' : ''}`}
            onClick={cycleViewMode}
            title={getViewModeTitle()}
          >
            {getViewModeIcon()}
          </button>
          <button
            className="object-library__header-btn"
            onClick={() => setShowNewForm(!showNewForm)}
            title="New Object"
          >
            +
          </button>
        </div>
      </div>
      <div className="panel__body">
        {showNewForm && (
          <div className="object-library__new-form">
            <input
              type="text"
              placeholder="Object name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="object-library__size-inputs">
              <div className="object-library__size-field">
                <label>W</label>
                <input
                  type="number"
                  min="1"
                  max="256"
                  value={newWidth}
                  onChange={(e) => setNewWidth(parseInt(e.target.value) || 1)}
                />
              </div>
              <span className="object-library__size-separator">×</span>
              <div className="object-library__size-field">
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
            <div className="object-library__form-actions">
              <button className="btn btn--ghost" onClick={() => setShowNewForm(false)}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={handleAddObject}>
                Create
              </button>
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="object-library__grid">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && selectedFrameId === firstFrame.id;

              return (
                <CompactObjectItem
                  key={obj.id}
                  obj={obj}
                  variants={variants}
                  variantFrameIndices={variantFrameIndices}
                  isSelected={isSelected}
                  isFirstFrameSelected={isFirstFrameSelected}
                  onClick={() => selectObject(obj.id)}
                />
              );
            })}
          </div>
        ) : viewMode === 'small-rows' ? (
          <div className="object-library__list-small">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && selectedFrameId === firstFrame.id;

              return (
                <div
                  key={obj.id}
                  className={`object-library__item-small ${isSelected ? 'object-library__item-small--selected' : ''}`}
                  onClick={() => selectObject(obj.id)}
                >
                  <div className="object-library__thumb-small">
                    <ObjectThumbnail
                      obj={obj}
                      variants={variants}
                  variantFrameIndices={variantFrameIndices}
                      isSelected={isSelected}
                      isFirstFrameSelected={isFirstFrameSelected}
                    />
                  </div>
                  {editingId === obj.id ? (
                    <input
                      type="text"
                      className="object-library__name-input-small"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleFinishRename(obj.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(obj.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="object-library__name-small"
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
          <div className="object-library__list">
            {objects.map((obj) => {
              const isSelected = selectedObjectId === obj.id;
              const firstFrame = obj.frames[0];
              const isFirstFrameSelected = isSelected && firstFrame && selectedFrameId === firstFrame.id;

              return (
              <div key={obj.id} className="object-library__entry">
                <div
                  className={`object-library__item ${isSelected ? 'object-library__item--selected' : ''}`}
                  onClick={() => selectObject(obj.id)}
                >
                  <div className="object-library__thumb">
                    <ObjectThumbnail
                      obj={obj}
                      variants={variants}
                  variantFrameIndices={variantFrameIndices}
                      isSelected={isSelected}
                      isFirstFrameSelected={isFirstFrameSelected}
                    />
                  </div>
                  <div className="object-library__content">
                    <div className="object-library__name-row">
                      {editingId === obj.id ? (
                        <input
                          type="text"
                          className="object-library__name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleFinishRename(obj.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(obj.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="object-library__name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(obj.id, obj.name);
                          }}
                        >
                          {obj.name}
                        </span>
                      )}
                    </div>

                    <div className="object-library__metrics-row">
                      <span className="object-library__details">
                        {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="object-library__actions-row">
                      <div className="object-library__actions">
                        <button
                          className="object-library__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateObject(obj.id);
                          }}
                          title="Duplicate"
                        >
                          <Icon icon={Copy} size={12} />
                        </button>
                        <button
                          className="object-library__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartResize(obj);
                          }}
                          title="Resize"
                        >
                          <Icon icon={Maximize} size={12} />
                        </button>
                        <button
                          className="object-library__action-btn object-library__action-btn--danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: obj.id, name: obj.name });
                          }}
                          title="Delete"
                        >
                          <Icon icon={X} size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {showResizeFor === obj.id && (
                  <div className="object-library__resize-panel">
                    <div className="object-library__size-inputs">
                      <div className="object-library__size-field">
                        <label>W</label>
                        <input
                          type="number"
                          min="1"
                          max="256"
                          value={resizeWidth}
                          onChange={(e) => setResizeWidth(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <span className="object-library__size-separator">×</span>
                      <div className="object-library__size-field">
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
                    <div className="object-library__resize-anchor">
                      <AnchorGrid
                        anchor={resizeAnchor}
                        onChange={setResizeAnchor}
                        currentWidth={originalWidth}
                        currentHeight={originalHeight}
                        newWidth={resizeWidth}
                        newHeight={resizeHeight}
                      />
                    </div>
                    <div className="object-library__resize-actions">
                      <button onClick={() => setShowResizeFor(null)}>Cancel</button>
                      <button className="btn btn--primary" onClick={() => handleApplyResize(obj.id)}>
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
          <div className="object-library__empty">
            No objects yet. Create one to start.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
        <div className="confirm-dialog__backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-dialog confirm-dialog--danger" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__header">
              <h4><Icon icon={AlertTriangle} size={14} /> Delete Object</h4>
            </div>
            <div className="confirm-dialog__body">
              <p>
                Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
              </p>
              <p className="confirm-dialog__warning">
                This will permanently delete the object and all its frames and layers.
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
              <button
                className="btn btn--danger"
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

