/**
 * LayerRow — one row of the layer list (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE 18-LEVEL JSX ENDS HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LayerPanel.tsx` held the **deepest JSX in the codebase — 18 levels** — and
 * most of that depth was this row nested inside the list inside the panel
 * body, with an IIFE (`{(() => { ... })()}`) buried in the action strip to
 * compute the two squash guards. Splitting the row out drops it to a handful
 * of levels and the IIFE becomes two props (`canSquashDown` / `canSquashUp`)
 * computed by the caller, where they are testable.
 *
 * ── ⚠️ NO `Layer` CROSSES THIS BOUNDARY ───────────────────────────────────
 *
 * The row takes a `LayerRowModel` — a flat view-model of ids, names and
 * booleans — never the `Layer` node. A `Layer` carries `pixels`, which on the
 * owner's real project is part of a 300,249-cell grid (R2). The list is
 * rebuilt on every visibility toggle; if the row held a `Layer` reference,
 * every such toggle would put a pixel grid on the diffing path. It also means
 * the container must project, which is the rule the task states as "never
 * pass an observable array or a domain node".
 *
 * ── The two collapsed callbacks ───────────────────────────────────────────
 *
 * `onMoveLayer` and `onSquashLayer` both take a `scope` and (for move) a
 * `direction`. This row only ever emits `scope: "frame"` — the all-frames
 * buttons live in `LayerPanelHeader` — but it emits through the SAME
 * signature, which is what makes the two scopes comparable at a glance.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: the `Icon` primitive, `lucide-react` glyphs, the shared scope
 * types, and this file's own stylesheet. No store, no MobX, no API, and no
 * domain type either — the view-model is defined locally.
 */
import { Icon } from "../../primitives/Icon/Icon";
import {
  Hexagon,
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  ClipboardCopy,
  Wand2,
  X,
  Copy,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { LayerScope, MoveDirection } from "./layerScope";
import "./LayerPanel.css";

/**
 * The flat projection of one layer, built by `LayerPanelContainer`.
 *
 * `variantGroupName` and `variantName` are already resolved — the row does
 * not look anything up in `project.variants`, which is what let the whole
 * `project` reference stop at the container.
 */
export interface LayerRowModel {
  id: string;
  name: string;
  visible: boolean;
  isVariant: boolean;
  /** Resolved `variants[].name` for a variant layer; `null` otherwise. */
  variantGroupName: string | null;
  /** Resolved selected-variant name for a variant layer; `null` otherwise. */
  variantName: string | null;
  /** This layer may squash into the one below it (frame scope). */
  canSquashDown: boolean;
  /** This layer may squash into the one above it (frame scope). */
  canSquashUp: boolean;
}

export interface LayerRowProps {
  layer: LayerRowModel;
  /** Position in the DISPLAYED (reversed, top-layer-first) list. */
  displayIndex: number;
  /** Length of the displayed list — the move-down disabled bound. */
  displayCount: number;
  isSelected: boolean;
  isDragging: boolean;
  /** True while this row's name is being edited inline. */
  isEditing: boolean;
  editingName: string;
  /** False when this is the last layer — delete is refused. */
  canDelete: boolean;

  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onStartRename: (layerId: string, currentName: string) => void;
  onEditingNameChange: (name: string) => void;
  onFinishRename: (layerId: string) => void;

  onDragStart: (displayIndex: number) => void;
  onDragOver: (e: React.DragEvent, displayIndex: number) => void;
  onDragEnd: () => void;

  /** Collapsed callback #1 — see the header. This row emits "frame" only. */
  onMoveLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  /** Collapsed callback #2 — see the header. This row emits "frame" only. */
  onSquashLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;

  onCopyLayer: (layerId: string) => void;
  onMakeVariant: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  /** Collapsed callback #3 — this row emits "frame"; the header "allFrames". */
  onDeleteLayer: (layerId: string, scope: LayerScope) => void;
  onRemoveVariantLayer: (layerId: string) => void;
  onOpenVariantSelect: (layerId: string) => void;
}

export function LayerRow({
  layer,
  displayIndex,
  displayCount,
  isSelected,
  isDragging,
  isEditing,
  editingName,
  canDelete,
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
  onCopyLayer,
  onMakeVariant,
  onDuplicateLayer,
  onDeleteLayer,
  onRemoveVariantLayer,
  onOpenVariantSelect,
}: LayerRowProps) {
  const className = [
    "layer-panel__item",
    isSelected ? "layer-panel__item--selected" : "",
    isDragging ? "layer-panel__item--dragging" : "",
    layer.isVariant ? "layer-panel__item--variant" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onClick={() => onSelect(layer.id)}
      draggable
      onDragStart={() => onDragStart(displayIndex)}
      onDragOver={(e) => onDragOver(e, displayIndex)}
      onDragEnd={onDragEnd}
    >
      <div className="layer-panel__content-row">
        <div className="layer-panel__visibility-col">
          <button
            className={`layer-panel__visibility-btn ${layer.visible ? "layer-panel__visibility-btn--visible" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            title={layer.visible ? "Hide layer" : "Show layer"}
          >
            <Icon icon={layer.visible ? Eye : EyeOff} size={12} />
          </button>
          {/* Variant select button for variant layers - always visible */}
          {layer.isVariant && (
            <button
              className="layer-panel__action-btn layer-panel__action-btn--variant-select layer-panel__action-btn--in-column"
              onClick={(e) => {
                e.stopPropagation();
                onOpenVariantSelect(layer.id);
              }}
              title="Select variant"
            >
              <Icon icon={Hexagon} size={12} />
            </button>
          )}
        </div>
        <div className="layer-panel__main-col">
          <div className="layer-panel__label-row">
            {layer.isVariant && (
              <span className="layer-panel__variant-icon" title="Variant Layer">
                <Icon icon={Hexagon} size={10} />
              </span>
            )}

            {isEditing ? (
              <input
                type="text"
                className="layer-panel__name-input"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onBlur={() => onFinishRename(layer.id)}
                onKeyDown={(e) => e.key === "Enter" && onFinishRename(layer.id)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span
                className="layer-panel__name"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onStartRename(layer.id, layer.name);
                }}
              >
                {layer.name}
                {layer.isVariant && layer.variantGroupName && (
                  <span
                    className="layer-panel__group-badge"
                    title={`Variant: ${layer.variantGroupName}`}
                  >
                    {layer.variantGroupName}
                  </span>
                )}
                {layer.isVariant && layer.variantName && (
                  <span
                    className="layer-panel__type-badge"
                    title={`Type: ${layer.variantName}`}
                  >
                    {layer.variantName}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="layer-panel__actions">
            {/* Copy layer button */}
            <button
              className="layer-panel__action-btn layer-panel__action-btn--copy"
              onClick={(e) => {
                e.stopPropagation();
                onCopyLayer(layer.id);
              }}
              title="Copy layer across all frames (Cmd+V pastes to current frame only)"
            >
              <Icon icon={ClipboardCopy} size={10} />
            </button>
            {!layer.isVariant && (
              <button
                className="layer-panel__action-btn layer-panel__action-btn--make-variant"
                onClick={(e) => {
                  e.stopPropagation();
                  onMakeVariant(layer.id);
                }}
                title="Make variant"
              >
                <Icon icon={Wand2} size={10} />
              </button>
            )}
            <button
              className="layer-panel__action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(layer.id, "up", "frame");
              }}
              disabled={displayIndex === 0}
              title="Move layer up (current frame only)"
            >
              <Icon icon={ChevronUp} size={10} />
            </button>
            <button
              className="layer-panel__action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(layer.id, "down", "frame");
              }}
              disabled={displayIndex === displayCount - 1}
              title="Move layer down (current frame only)"
            >
              <Icon icon={ChevronDown} size={10} />
            </button>
            {!layer.isVariant && (
              <>
                {/* Squash buttons - only show for regular layers. The two
                    guards were an inline IIFE before the split; they are
                    props now, computed once by the caller. */}
                <button
                  className="layer-panel__action-btn layer-panel__action-btn--squash"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSquashLayer(layer.id, "down", "frame");
                  }}
                  disabled={!layer.canSquashDown}
                  title="Squash down (this layer squashes into layer below)"
                >
                  <Icon icon={ArrowDownToLine} size={10} />
                </button>
                <button
                  className="layer-panel__action-btn layer-panel__action-btn--squash"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSquashLayer(layer.id, "up", "frame");
                  }}
                  disabled={!layer.canSquashUp}
                  title="Squash up (this layer squashes into layer above)"
                >
                  <Icon icon={ArrowUpToLine} size={10} />
                </button>
                <button
                  className="layer-panel__action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateLayer(layer.id);
                  }}
                  title="Duplicate layer"
                >
                  <Icon icon={Copy} size={10} />
                </button>
                <button
                  className="layer-panel__action-btn layer-panel__action-btn--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLayer(layer.id, "frame");
                  }}
                  disabled={!canDelete}
                  title="Delete layer"
                >
                  <Icon icon={X} size={10} />
                </button>
              </>
            )}
            {layer.isVariant && (
              <button
                className="layer-panel__action-btn layer-panel__action-btn--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveVariantLayer(layer.id);
                }}
                title="Remove variant layer (variant data preserved)"
              >
                <Icon icon={X} size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
