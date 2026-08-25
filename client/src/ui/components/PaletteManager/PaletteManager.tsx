import { useCallback, useEffect, useRef, useState } from "react";
import { Color, Palette } from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import "./PaletteManager.css";

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
  /**
   * Creates the palette and returns its id, so the "+" button can open the new
   * row's name for editing straight away. Implementations that cannot supply
   * an id may return `void` — the component then falls back to picking up the
   * palette that appeared in `palettes` (see `handleAddPalette`).
   */
  onAddPalette: (name: string) => string | void;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Ids present before the last "+" press. `onAddPalette` is allowed to return
   * `void` (Storybook's `fn()` does), so when it does we diff the next
   * `palettes` list against this set to find the row we just created.
   */
  const pendingAddRef = useRef<Set<string> | null>(null);

  const handleStartRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setExpandedId(id);
  }, []);

  const handleAddPalette = () => {
    const name = `Palette ${palettes.length + 1}`;
    pendingAddRef.current = new Set(palettes.map((p) => p.id));
    const id = onAddPalette(name);
    if (typeof id === "string") {
      pendingAddRef.current = null;
      handleStartRename(id, name);
    }
  };

  // Fallback path for an `onAddPalette` that returned no id: the new palette
  // arrives on the next render, so open whichever row is newly present.
  useEffect(() => {
    const before = pendingAddRef.current;
    if (!before) return;
    const added = palettes.find((p) => !before.has(p.id));
    if (!added) return;
    pendingAddRef.current = null;
    handleStartRename(added.id, added.name);
  }, [palettes, handleStartRename]);

  // Focus, select and scroll the name field into view whenever editing starts.
  useEffect(() => {
    if (!editingId) return;
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    input.scrollIntoView({ block: "nearest" });
  }, [editingId]);

  const handleFinishRename = (id: string) => {
    if (editingName.trim()) {
      onRenamePalette(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName("");
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
        <button
          className="palette-manager__header-btn"
          onClick={handleAddPalette}
          title="New Palette"
        >
          +
        </button>
      </div>
      <div className="panel__body">
        <div className="palette-manager__list">
          {palettes.map((palette) => (
            <div
              key={palette.id}
              className={`palette-manager__item ${expandedId === palette.id ? "palette-manager__item--expanded" : ""}`}
            >
              <div
                className="palette-manager__item-header"
                onClick={() =>
                  setExpandedId(expandedId === palette.id ? null : palette.id)
                }
              >
                <span className="palette-manager__expand-icon">
                  <Icon
                    icon={
                      expandedId === palette.id ? ChevronDown : ChevronRight
                    }
                    size={12}
                  />
                </span>
                {editingId === palette.id ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    className="palette-manager__name-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleFinishRename(palette.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFinishRename(palette.id);
                      else if (e.key === "Escape") handleCancelRename();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
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
                <span className="palette-manager__count">
                  {palette.colors.length}
                </span>
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
                          onClick={() =>
                            onRemoveColorFromPalette(palette.id, index)
                          }
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
