/**
 * LayerList — the scrollable list and the empty state (REFRESH task 35).
 *
 * The list receives `layers` **already reversed** into display order
 * (top-layer-first) by the container, along with each row's resolved variant
 * names and squash guards. Doing the reversal upstream is deliberate: the
 * pre-split component juggled a display index and an "actual index" in five
 * separate places (`layers.length - 1 - displayIndex`, three times inline),
 * and every one of those conversions was a chance to get the z-order backwards
 * in a way no type would catch. Here the list is simply a list.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: its sibling `LayerRow` (and its types), the shared scope types,
 * and this file's own stylesheet. No store, no MobX, no API, no domain type.
 */
import { LayerRow, type LayerRowModel } from "./LayerRow";
import type { LayerScope, MoveDirection } from "./layerScope";
import "./LayerPanel.css";

export interface LayerListProps {
  /** Display order: top layer FIRST. Reversed by the container. */
  layers: LayerRowModel[];
  selectedLayerId: string | null;
  /** Display index currently being dragged, or `null`. */
  dragIndex: number | null;
  /** Id of the layer whose name is being edited inline, or `null`. */
  editingId: string | null;
  editingName: string;
  /** False when a single layer remains — per-row delete is refused. */
  canDeleteLayer: boolean;

  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onStartRename: (layerId: string, currentName: string) => void;
  onEditingNameChange: (name: string) => void;
  onFinishRename: (layerId: string) => void;
  onCancelRename: () => void;

  onDragStart: (displayIndex: number) => void;
  onDragOver: (e: React.DragEvent, displayIndex: number) => void;
  onDragEnd: () => void;

  onMoveLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  onSquashLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  onDeleteLayer: (layerId: string, scope: LayerScope) => void;

  onCopyLayer: (layerId: string) => void;
  onMakeVariant: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onRemoveVariantLayer: (layerId: string) => void;
  onOpenVariantSelect: (layerId: string) => void;
}

export function LayerList({
  layers,
  selectedLayerId,
  dragIndex,
  editingId,
  editingName,
  canDeleteLayer,
  onSelect,
  onToggleVisibility,
  onStartRename,
  onEditingNameChange,
  onFinishRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveLayer,
  onSquashLayer,
  onDeleteLayer,
  onCopyLayer,
  onMakeVariant,
  onDuplicateLayer,
  onRemoveVariantLayer,
  onOpenVariantSelect,
}: LayerListProps) {
  return (
    <div className="panel__body">
      <div className="layer-panel__list">
        {layers.map((layer, displayIndex) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            displayIndex={displayIndex}
            displayCount={layers.length}
            isSelected={selectedLayerId === layer.id}
            isDragging={dragIndex === displayIndex}
            isEditing={editingId === layer.id}
            editingName={editingName}
            canDelete={canDeleteLayer}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onStartRename={onStartRename}
            onEditingNameChange={onEditingNameChange}
            onFinishRename={onFinishRename}
            onCancelRename={onCancelRename}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onMoveLayer={onMoveLayer}
            onSquashLayer={onSquashLayer}
            onDeleteLayer={onDeleteLayer}
            onCopyLayer={onCopyLayer}
            onMakeVariant={onMakeVariant}
            onDuplicateLayer={onDuplicateLayer}
            onRemoveVariantLayer={onRemoveVariantLayer}
            onOpenVariantSelect={onOpenVariantSelect}
          />
        ))}
      </div>

      {layers.length === 0 && (
        <div className="layer-panel__empty">
          No layers. Add one to start drawing.
        </div>
      )}
    </div>
  );
}
