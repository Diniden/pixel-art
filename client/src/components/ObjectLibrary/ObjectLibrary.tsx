import { useState, useRef, useEffect, memo } from 'react';
import { useEditorStore } from '../../store';
import { PixelObject } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import './ObjectLibrary.css';

const ObjectThumbnail = memo(function ObjectThumbnail({
  obj,
  project,
  isSelected,
  isFirstFrameSelected
}: {
  obj: PixelObject;
  project?: {
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
  const thumbSize = 32;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx || obj.frames.length === 0) return;

    const frame = obj.frames[0];

    // Only use current variantFrameIndices if this object is selected AND the first frame is selected
    // Otherwise, use static indices (frame index 0, so variant frame index 0)
    let variantFrameIndices: { [key: string]: number } | undefined;

    if (isSelected && isFirstFrameSelected) {
      // Use current indices when editing the first frame (allows live updates)
      variantFrameIndices = project?.uiState?.variantFrameIndices;
    } else if (obj.variantGroups) {
      // Use static indices (all variant frames at index 0 for the thumbnail)
      variantFrameIndices = {};
      for (const vg of obj.variantGroups) {
        variantFrameIndices[vg.id] = 0;
      }
    }

    renderFramePreview(ctx, {
      thumbSize,
      gridWidth: obj.gridSize.width,
      gridHeight: obj.gridSize.height,
      frame,
      variantGroups: obj.variantGroups,
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
        if (prev.variantGroups && next.variantGroups) {
          for (const vg of prev.variantGroups) {
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

export function ObjectLibrary() {
  const {
    project,
    addObject,
    deleteObject,
    renameObject,
    resizeObject,
    selectObject
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
  };

  const handleApplyResize = (id: string) => {
    resizeObject(id, resizeWidth, resizeHeight);
    setShowResizeFor(null);
  };

  return (
    <div className="panel object-library">
      <div className="panel-header">
        Objects
        <button
          className="header-btn"
          onClick={() => setShowNewForm(!showNewForm)}
          title="New Object"
        >
          +
        </button>
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
                          deleteObject(obj.id);
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

        {objects.length === 0 && (
          <div className="empty-state">
            No objects yet. Create one to start.
          </div>
        )}
      </div>
    </div>
  );
}

