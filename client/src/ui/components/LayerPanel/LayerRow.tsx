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
 * ── ⚠️ THE THUMBNAIL IS A `draw` CALLBACK FOR THE SAME REASON ─────────────
 *
 * The row shows the current frame's thumbnail for its layer, and it does so
 * WITHOUT gaining a `pixels` reference: the container supplies a bound
 * `draw(ctx, size)` closure and a `thumbnailRevision`, exactly the contract
 * `TimelineCell` already uses. `cacheKey` opts the paint into the shared
 * bounded LRU — the siderail and the timeline show the same layers at the
 * same revision, so the second of them to paint is a blit.
 *
 * ── THE THUMBNAIL *IS* THE VISIBILITY TOGGLE ──────────────────────────────
 *
 * There is ONE control in the left column, not a preview beside a button:
 * tapping the thumbnail hides the layer, and the box then shows `EyeOff` in
 * the thumbnail's place. Reading the state off the artwork itself is the
 * point — a hidden layer stops showing its pixels, which is what "hidden"
 * means everywhere else in the app.
 *
 * Two consequences worth stating, because both are easy to regress:
 *
 *  - It stays a real `<button>` with `aria-pressed`. The glyph swap is the
 *    only visual state, so the same fact has to exist for a screen reader,
 *    and the thumbnail canvas inside stays `aria-hidden` (no `label`) —
 *    the button already names itself.
 *  - The canvas is NOT rendered while hidden, so a hidden layer costs no
 *    paint and no cache entry. Re-showing repaints from the LRU if the
 *    revision has not moved.
 *
 * A row with no `drawThumbnail` (a fixture, or a layer whose painter the
 * container withheld) keeps the original small eye button — the toggle must
 * never disappear just because there is nothing to preview.
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
import { ThumbnailCanvas } from "../../primitives/ThumbnailCanvas/ThumbnailCanvas";
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

/** Thumbnail canvas edge for a siderail row, in CSS px. */
export const LAYER_THUMB_SIZE = 32;

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

  /**
   * Paints this layer's thumbnail for the CURRENT frame. Supplied by the
   * container, which closes over the pixels — they never become a prop.
   * Omitted means this row renders no thumbnail.
   */
  drawThumbnail?: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Changes exactly when this row's thumbnail content changes. */
  thumbnailRevision?: number;
  /** Shared-LRU key; must encode the revision. See `thumbnailCacheKey`. */
  thumbnailCacheKey?: string;
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
  /** Abandon the inline edit without writing the name (Escape). */
  onCancelRename: () => void;

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
  onCancelRename,
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
          {/*
            The thumbnail IS the visibility toggle — one control, not a
            preview next to a button. Visible: the layer's thumbnail. Hidden:
            the EyeOff glyph in the same box, so the swap reads as the state
            change rather than as the row losing its preview.

            It stays a real <button> because it is now the only affordance
            for the toggle: `aria-pressed` carries the state that the glyph
            carries visually, and the keyboard path survives.
          */}
          <button
            className={`layer-panel__visibility-btn ${layer.visible ? "layer-panel__visibility-btn--visible" : ""} ${layer.drawThumbnail ? "layer-panel__visibility-btn--thumb" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            title={layer.visible ? "Hide layer" : "Show layer"}
            aria-pressed={layer.visible}
            aria-label={
              layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`
            }
          >
            {layer.drawThumbnail && layer.visible ? (
              <ThumbnailCanvas
                size={LAYER_THUMB_SIZE}
                revision={layer.thumbnailRevision ?? 0}
                draw={layer.drawThumbnail}
                cacheKey={layer.thumbnailCacheKey}
                className="layer-panel__thumbnail"
              />
            ) : (
              <Icon
                icon={layer.visible ? Eye : EyeOff}
                size={layer.drawThumbnail ? 16 : 12}
              />
            )}
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
                // A callback ref, not `autoFocus`: focusing is only half of
                // what a just-created row needs. The name is a placeholder the
                // user is expected to overtype, so it is selected, and the row
                // may be below the fold of the list, so it is scrolled in.
                ref={(el) => {
                  if (!el) return;
                  el.focus();
                  el.select();
                  el.scrollIntoView({ block: "nearest" });
                }}
                type="text"
                className="layer-panel__name-input"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onBlur={() => onFinishRename(layer.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onFinishRename(layer.id);
                  else if (e.key === "Escape") onCancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
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
