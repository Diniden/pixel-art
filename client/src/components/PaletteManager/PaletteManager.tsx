import { useState } from 'react';
import { useEditorStore } from '../../store';
import { Color } from '../../types';
import { Icon } from '../../ui/primitives/Icon/Icon';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
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
      <div className="panel__header">
        Palettes
        <button className="palette-manager__header-btn" onClick={handleAddPalette} title="New Palette">
          +
        </button>
      </div>
      <div className="panel__body">
        <div className="palette-manager__new-form">
          <input
            type="text"
            placeholder="New palette name..."
            value={newPaletteName}
            onChange={(e) => setNewPaletteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPalette()}
          />
        </div>

        <div className="palette-manager__list">
          {palettes.map((palette) => (
            <div
              key={palette.id}
              className={`palette-manager__item ${expandedId === palette.id ? 'palette-manager__item--expanded' : ''}`}
            >
              <div
                className="palette-manager__item-header"
                onClick={() => setExpandedId(expandedId === palette.id ? null : palette.id)}
              >
                <span className="palette-manager__expand-icon"><Icon icon={expandedId === palette.id ? ChevronDown : ChevronRight} size={12} /></span>
                {editingId === palette.id ? (
                  <input
                    type="text"
                    className="palette-manager__name-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleFinishRename(palette.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(palette.id)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className="palette-manager__name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(palette.id, palette.name);
                    }}
                  >
                    {palette.name}
                  </span>
                )}
                <span className="palette-manager__count">{palette.colors.length}</span>
              </div>

              {expandedId === palette.id && (
                <div className="palette-manager__item-content">
                  <div className="palette-manager__swatches">
                    {palette.colors.map((color, index) => (
                      <div
                        key={index}
                        className="palette-manager__swatch-group"
                      >
                        <button
                          className="palette-manager__swatch"
                          style={{ backgroundColor: getColorStyle(color) }}
                          onClick={() => setColor(color)}
                          title={`R:${color.r} G:${color.g} B:${color.b} A:${color.a}`}
                        >
                          <div className="palette-manager__swatch-bg"></div>
                        </button>
                        <button
                          className="palette-manager__swatch-remove"
                          onClick={() => removeColorFromPalette(palette.id, index)}
                          title="Remove color"
                        >
                          <Icon icon={X} size={8} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="palette-manager__add-color-btn"
                      onClick={() => handleAddCurrentColor(palette.id)}
                      title="Add current color"
                    >
                      +
                    </button>
                  </div>

                  <div className="palette-manager__actions">
                    <button
                      className="palette-manager__delete-btn"
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
          <div className="palette-manager__empty">
            No palettes yet. Create one to save colors.
          </div>
        )}
      </div>
    </div>
  );
}

