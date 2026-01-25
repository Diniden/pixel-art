import { useState } from 'react';
import { useEditorStore } from '../../store';
import './LayerPanel.css';

export function LayerPanel() {
  const {
    project,
    getCurrentFrame,
    addLayer,
    duplicateLayer,
    deleteLayer,
    renameLayer,
    toggleLayerVisibility,
    toggleAllLayersVisibility,
    selectLayer,
    moveLayer
  } = useEditorStore();

  const [newLayerName, setNewLayerName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const frame = getCurrentFrame();

  if (!project || !frame) return null;

  const { selectedLayerId } = project.uiState;
  const layers = [...frame.layers].reverse(); // Display top layer first
  const allVisible = frame.layers.every((l) => l.visible);
  const allHidden = frame.layers.every((l) => !l.visible);

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
        Layers
        <div className="header-actions">
          <button
            className={`header-btn visibility-toggle ${allVisible ? 'all-visible' : ''}`}
            onClick={() => toggleAllLayersVisibility(!allVisible)}
            title={allVisible ? 'Hide all layers' : 'Show all layers'}
          >
            {allVisible ? '👁' : allHidden ? '○' : '◐'}
          </button>
          <button className="header-btn" onClick={handleAddLayer} title="New Layer">
            +
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
          {layers.map((layer, displayIndex) => (
            <div
              key={layer.id}
              className={`layer-item ${selectedLayerId === layer.id ? 'selected' : ''} ${dragIndex === displayIndex ? 'dragging' : ''}`}
              onClick={() => selectLayer(layer.id)}
              draggable
              onDragStart={() => handleDragStart(displayIndex)}
              onDragOver={(e) => handleDragOver(e, displayIndex)}
              onDragEnd={handleDragEnd}
            >
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
                </span>
              )}

              <div className="layer-actions">
                <button
                  className="layer-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveLayerUp(displayIndex);
                  }}
                  disabled={displayIndex === 0}
                  title="Move layer up"
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
                  title="Move layer down"
                >
                  ▼
                </button>
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
              </div>
            </div>
          ))}
        </div>

        {layers.length === 0 && (
          <div className="empty-state">
            No layers. Add one to start drawing.
          </div>
        )}
      </div>
    </div>
  );
}

