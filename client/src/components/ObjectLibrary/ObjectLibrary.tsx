import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { PixelObject } from '../../types';
import './ObjectLibrary.css';

function ObjectThumbnail({ obj }: { obj: PixelObject }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 40;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || obj.frames.length === 0) return;

    const { width, height } = obj.gridSize;
    const scale = Math.min(thumbSize / width, thumbSize / height);
    const frame = obj.frames[0];

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, thumbSize, thumbSize);

    // Draw checkerboard
    const checkSize = 4;
    for (let y = 0; y < thumbSize; y += checkSize) {
      for (let x = 0; x < thumbSize; x += checkSize) {
        if (((x + y) / checkSize) % 2 === 0) {
          ctx.fillStyle = '#2a2a3a';
        } else {
          ctx.fillStyle = '#222230';
        }
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    const offsetX = (thumbSize - width * scale) / 2;
    const offsetY = (thumbSize - height * scale) / 2;

    for (const layer of frame.layers) {
      if (!layer.visible) continue;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const pixel = layer.pixels[py]?.[px];
          if (pixel && pixel.a > 0) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(
              offsetX + px * scale,
              offsetY + py * scale,
              Math.ceil(scale),
              Math.ceil(scale)
            );
          }
        }
      }
    }
  }, [obj]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="obj-thumb-canvas" />;
}

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
          {objects.map((obj) => (
            <div key={obj.id} className="object-wrapper">
              <div
                className={`object-item ${selectedObjectId === obj.id ? 'selected' : ''}`}
                onClick={() => selectObject(obj.id)}
              >
                <div className="object-thumbnail">
                  <ObjectThumbnail obj={obj} />
                </div>

                <div className="object-info">
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
                  <span className="object-details">
                    {obj.gridSize.width}×{obj.gridSize.height} • {obj.frames.length} frame{obj.frames.length !== 1 ? 's' : ''}
                  </span>
                </div>

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
          ))}
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

