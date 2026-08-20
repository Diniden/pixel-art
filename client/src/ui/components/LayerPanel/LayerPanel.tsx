/**
 * LayerPanel — composition only (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  500 LINES · 22 STORE MEMBERS · 18-LEVEL JSX → A SHELL AND THREE PIECES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The highest store-member count outside `Canvas`, and the deepest JSX in the
 * codebase. It is now `LayerPanelHeader` + `LayerList` + `LayerRow` and this
 * file, which decides nothing except where the three modals hang.
 *
 * ── ⚠️ THE MODALS ARRIVE AS SLOTS, NOT IMPORTS ────────────────────────────
 *
 * The pre-split file imported `VariantSelectModalContainer`,
 * `CopyFromModalContainer` and `AddVariantModalContainer` directly — three
 * `observer()` components, which would drag MobX across the `ui/` boundary
 * and make every store-free story impossible. They are `ReactNode` props
 * instead, rendered where they were rendered before. `LayerPanelContainer`
 * decides which (if any) to pass; the stories pass a plain `<div>` or
 * nothing at all.
 *
 * That is the mechanical reason the stories here need no provider. It is the
 * same shape W24 used for `CanvasSurface`, applied to a panel whose children
 * happened to be containers.
 *
 * ── ⚠️ THE GLOBAL KEYDOWN HANDLER IS NOT HERE ─────────────────────────────
 *
 * The Cmd+V paste-layer listener was a `useEffect` on `window` inside this
 * component, reading `layerClipboard` off the store. A `window` listener that
 * fires a store action is not presentation, and a story that mounted this
 * component would silently install a global side effect. It moved to
 * `LayerPanelContainer` verbatim — including the "ignore when focus is in an
 * INPUT/TEXTAREA" guard and the `pasteLayerFromClipboard(true)` current-frame
 * -only argument.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `ReactNode` (a React TYPE only), its two sibling components and
 * their types, the shared scope types, and this file's own stylesheet. No
 * store, no MobX, no API, no domain type.
 */
import type { ReactNode } from "react";
import { LayerPanelHeader } from "./LayerPanelHeader";
import { LayerList } from "./LayerList";
import type { LayerRowModel } from "./LayerRow";
import type { LayerScope, MoveDirection } from "./layerScope";
import "./LayerPanel.css";

export interface LayerPanelProps {
  /** Display order: top layer FIRST. Reversed by the container. */
  layers: LayerRowModel[];
  selectedLayerId: string | null;
  allVisible: boolean;
  hasVariants: boolean;

  canMoveUp: boolean;
  canMoveDown: boolean;
  canSquashDown: boolean;
  canSquashUp: boolean;
  /** False when a single layer remains — both deletes are refused. */
  canDeleteLayer: boolean;

  dragIndex: number | null;
  editingId: string | null;
  editingName: string;
  newLayerName: string;

  onNewLayerNameChange: (name: string) => void;
  onAddLayer: () => void;
  onToggleAllVisibility: (visible: boolean) => void;
  onOpenCopyFrom: () => void;
  onOpenAddVariant: () => void;

  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onStartRename: (layerId: string, currentName: string) => void;
  onEditingNameChange: (name: string) => void;
  onFinishRename: (layerId: string) => void;

  onDragStart: (displayIndex: number) => void;
  onDragOver: (e: React.DragEvent, displayIndex: number) => void;
  onDragEnd: () => void;

  /** Collapsed callback #1 (§9.5). See `layerScope.ts`. */
  onMoveLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  /** Collapsed callback #2 (§9.5). See `layerScope.ts`. */
  onSquashLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  /** Collapsed callback #3 (§9.5). See `layerScope.ts`. */
  onDeleteLayer: (layerId: string, scope: LayerScope) => void;

  onCopyLayer: (layerId: string) => void;
  onMakeVariant: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onRemoveVariantLayer: (layerId: string) => void;
  onOpenVariantSelect: (layerId: string) => void;

  /** Slot: the variant-select modal, when one is open. See the header. */
  variantSelectModal?: ReactNode;
  /** Slot: the copy-from-object modal, when open. */
  copyFromModal?: ReactNode;
  /** Slot: the add-existing-variant modal, when open. */
  addVariantModal?: ReactNode;
}

export function LayerPanel({
  layers,
  selectedLayerId,
  allVisible,
  hasVariants,
  canMoveUp,
  canMoveDown,
  canSquashDown,
  canSquashUp,
  canDeleteLayer,
  dragIndex,
  editingId,
  editingName,
  newLayerName,
  onNewLayerNameChange,
  onAddLayer,
  onToggleAllVisibility,
  onOpenCopyFrom,
  onOpenAddVariant,
  onSelect,
  onToggleVisibility,
  onStartRename,
  onEditingNameChange,
  onFinishRename,
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
  variantSelectModal,
  copyFromModal,
  addVariantModal,
}: LayerPanelProps) {
  return (
    <div className="panel layer-panel">
      <LayerPanelHeader
        selectedLayerId={selectedLayerId}
        allVisible={allVisible}
        hasVariants={hasVariants}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        canSquashDown={canSquashDown}
        canSquashUp={canSquashUp}
        canDeleteAcrossAllFrames={canDeleteLayer}
        onMoveLayer={onMoveLayer}
        onSquashLayer={onSquashLayer}
        onDeleteLayer={onDeleteLayer}
        onToggleAllVisibility={onToggleAllVisibility}
        onOpenCopyFrom={onOpenCopyFrom}
        onOpenAddVariant={onOpenAddVariant}
        onAddLayer={onAddLayer}
      />

      <LayerList
        layers={layers}
        selectedLayerId={selectedLayerId}
        dragIndex={dragIndex}
        editingId={editingId}
        editingName={editingName}
        newLayerName={newLayerName}
        canDeleteLayer={canDeleteLayer}
        onNewLayerNameChange={onNewLayerNameChange}
        onAddLayer={onAddLayer}
        onSelect={onSelect}
        onToggleVisibility={onToggleVisibility}
        onStartRename={onStartRename}
        onEditingNameChange={onEditingNameChange}
        onFinishRename={onFinishRename}
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

      {variantSelectModal}
      {copyFromModal}
      {addVariantModal}
    </div>
  );
}
