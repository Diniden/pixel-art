import { useState } from 'react';
import { Color, Palette } from "../../../types";
import { Icon } from '../../primitives/Icon/Icon';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import './PaletteManager.css';

/**
 * Props supplied by `PaletteManagerContainer` (REFRESH task 23). `palettes`
 * comes from `DomainStore`; the five callbacks are `PaletteStore` actions and
 * are all deliberately NON-UNDOABLE (task 17, pinned).
 *
 * REFRESH task 36 (W27): `setColor` and `uiState.selectedColor` were the last
 * two Zustand reads in this file. They are now the `selectedColor` prop and
 * the `onSelectColor` callback, so the component is pure and lives in `ui/`.
 *
 * ⚠️ The old `if (!project) return null` guard is GONE. It could not survive
 * the move — there is no `project` here to test. The container now renders
 * nothing when there is no project, which preserves the observable behaviour
 * (see `PaletteManagerContainer`); putting the guard in both places would be
 * two sources of truth for the same condition.
 */
interface PaletteManagerProps {
  palettes: Palette[];
  onAddPalette: (name: string) => void;
  onDeletePalette: (id: string) => void;
  onRenamePalette: (id: string, name: string) => void;
  onAddColorToPalette: (paletteId: string, color: Color) => void;
  onRemoveColorFromPalette: (paletteId: string, colorIndex: number) => void;
  /** The active drawing colour — added to a palette by the "+" affordance. */
  selectedColor: Color;
  /** Makes a swatch the active drawing colour. */
  onSelectColor: (color: Color) => void;
}

export function PaletteManager({
  palettes,
  onAddPalette,
  onDeletePalette,
  onRenamePalette,
  onAddColorToPalette,
  onRemoveColorFromPalette,
  selectedColor,
  onSelectColor,
}: PaletteManagerProps) {
  const [newPaletteName, setNewPaletteName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAddPalette = () => {
    const name = newPaletteName.trim() || `Palette ${palettes.length + 1}`;
    onAddPalette(name);
    setNewPaletteName('');
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleFinishRename = (id: string) => {
    if (editingName.trim()) {
      onRenamePalette(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleAddCurrentColor = (paletteId: string) => {
    onAddColorToPalette(paletteId, selectedColor);
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
                          onClick={() => onSelectColor(color)}
                          title={`R:${color.r} G:${color.g} B:${color.b} A:${color.a}`}
                        >
                          <div className="palette-manager__swatch-bg"></div>
                        </button>
                        <button
                          className="palette-manager__swatch-remove"
                          onClick={() => onRemoveColorFromPalette(palette.id, index)}
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
                      onClick={() => onDeletePalette(palette.id)}
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

