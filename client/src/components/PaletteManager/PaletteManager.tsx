import { useState } from 'react';
import { useEditorStore } from '../../store';
import { Color } from '../../types';
import './PaletteManager.css';

export function PaletteManager() {
  const {
    project,
    setColor,
    addPalette,
    deletePalette,
    renamePalette,
    addColorToPalette,
    removeColorFromPalette
  } = useEditorStore();

  const [newPaletteName, setNewPaletteName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!project) return null;

  const { palettes, uiState } = project;

  const handleAddPalette = () => {
    const name = newPaletteName.trim() || `Palette ${palettes.length + 1}`;
    addPalette(name);
    setNewPaletteName('');
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleFinishRename = (id: string) => {
    if (editingName.trim()) {
      renamePalette(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleAddCurrentColor = (paletteId: string) => {
    addColorToPalette(paletteId, uiState.selectedColor);
  };

  const getColorStyle = (color: Color): string => {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  };

  return (
    <div className="panel palette-manager">
      <div className="panel-header">
        Palettes
        <button className="header-btn" onClick={handleAddPalette} title="New Palette">
          +
        </button>
      </div>
      <div className="panel-content">
        <div className="new-palette-form">
          <input
            type="text"
            placeholder="New palette name..."
            value={newPaletteName}
            onChange={(e) => setNewPaletteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPalette()}
          />
        </div>

        <div className="palette-list">
          {palettes.map((palette) => (
            <div
              key={palette.id}
              className={`palette-item ${expandedId === palette.id ? 'expanded' : ''}`}
            >
              <div
                className="palette-header"
                onClick={() => setExpandedId(expandedId === palette.id ? null : palette.id)}
              >
                <span className="expand-icon">{expandedId === palette.id ? '▼' : '▶'}</span>
                {editingId === palette.id ? (
                  <input
                    type="text"
                    className="palette-name-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleFinishRename(palette.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(palette.id)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className="palette-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(palette.id, palette.name);
                    }}
                  >
                    {palette.name}
                  </span>
                )}
                <span className="palette-count">{palette.colors.length}</span>
              </div>

              {expandedId === palette.id && (
                <div className="palette-content">
                  <div className="color-swatches">
                    {palette.colors.map((color, index) => (
                      <div
                        key={index}
                        className="swatch-wrapper"
                      >
                        <button
                          className="color-swatch"
                          style={{ backgroundColor: getColorStyle(color) }}
                          onClick={() => setColor(color)}
                          title={`R:${color.r} G:${color.g} B:${color.b} A:${color.a}`}
                        >
                          <div className="swatch-bg"></div>
                        </button>
                        <button
                          className="swatch-remove"
                          onClick={() => removeColorFromPalette(palette.id, index)}
                          title="Remove color"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="add-color-btn"
                      onClick={() => handleAddCurrentColor(palette.id)}
                      title="Add current color"
                    >
                      +
                    </button>
                  </div>

                  <div className="palette-actions">
                    <button
                      className="delete-palette-btn"
                      onClick={() => deletePalette(palette.id)}
                    >
                      Delete Palette
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {palettes.length === 0 && (
          <div className="empty-state">
            No palettes yet. Create one to save colors.
          </div>
        )}
      </div>
    </div>
  );
}

