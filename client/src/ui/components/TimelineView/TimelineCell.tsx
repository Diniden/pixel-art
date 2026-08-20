/**
 * TimelineCell — one cell of the timeline grid (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NO PIXEL GRID CROSSES THIS BOUNDARY — AND THAT IS WHY `draw` IS A PROP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The pre-split `CellThumbnail` took a `Layer` and a `VariantGroup[]` and
 * walked `layer.pixels` itself — 60 lines of nested loops over `PixelData`
 * cells, plus a second copy of the same loops for the variant-frame branch.
 * On the owner's real project that is part of a 300,249-cell grid (R2), and a
 * 360-cell timeline meant 360 components each holding a grid reference.
 *
 * The cell now takes a `draw(ctx, size)` callback and a `thumbnailRevision`
 * instead, through the `ThumbnailCanvas` primitive. The container closes over
 * the domain data in `draw`; the cell never sees a pixel. `revision` is what
 * decides when to repaint — a new closure with an unchanged revision must not
 * repaint, which is the primitive's contract and the replacement for the
 * hand-written comparators this codebase has been burned by (W20).
 *
 * `ThumbnailCanvas` is used here as the MECHANISM that keeps the boundary
 * intact, not as primitive adoption for its own sake — wholesale adoption is
 * task 36's. `ThumbnailCanvas`'s own header names `TimelineView.tsx:47-128`
 * as one of the five sites it was extracted from.
 *
 * ── Per-cell rendering ────────────────────────────────────────────────────
 *
 * This component is `memo`'d on its plain props so that one cell changing
 * does not re-render the row. The task's rule — "per-item containers reading
 * their own item, not one `observer` over the whole grid" — is satisfied by
 * `TimelineCellContainer`, which wraps exactly this component per cell.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `memo` from React, and the `ThumbnailCanvas` primitive. No store,
 * no MobX, no API, no domain type. The stylesheet is `FrameTimeline.css`,
 * imported once by the `FrameTimeline` parent — the timeline block is shared
 * with `FramesView` and `VariantView`, which this task may not restructure,
 * so the cell deliberately does not import a stylesheet of its own.
 */
import { memo } from "react";
import { ThumbnailCanvas } from "../../primitives/ThumbnailCanvas/ThumbnailCanvas";

/** Thumbnail canvas edge, verbatim from the pre-split `CellThumbnail`. */
export const TIMELINE_THUMB_SIZE = 20;

export interface TimelineCellProps {
  /** Frame this cell sits in — emitted back on every callback. */
  frameId: string;
  /** Layer occupying this cell. */
  layerId: string;
  /** z-order position in the STORED array (0 = bottom). */
  rowIndex: number;
  /** Dot colour for this layer name, assigned by the caller. */
  color: string;
  isVariant: boolean;
  isSelected: boolean;
  /** The hovered layer-header name matches this cell's layer. */
  isHighlighted: boolean;
  /** Render the thumbnail instead of the colour dot. */
  showThumbnail: boolean;

  /**
   * Paints the thumbnail. Supplied by the container, which closes over the
   * layer's pixels — they never become a prop. Only called when
   * `showThumbnail`.
   */
  draw?: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Changes exactly when this cell's thumbnail content changes. */
  thumbnailRevision?: number;

  onSelect: (frameId: string, layerId: string) => void;
  onDragStart: (frameId: string, layerId: string, rowIndex: number) => void;
  onDragOver: (e: React.DragEvent, frameId: string) => void;
  onDrop: (e: React.DragEvent, rowIndex: number, frameId: string) => void;
  onDragEnd: () => void;
}

function TimelineCellImpl({
  frameId,
  layerId,
  rowIndex,
  color,
  isVariant,
  isSelected,
  isHighlighted,
  showThumbnail,
  draw,
  thumbnailRevision = 0,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TimelineCellProps) {
  const className = [
    "timeline-view__cell",
    isSelected ? "timeline-view__cell--selected" : "",
    isHighlighted ? "timeline-view__cell--highlighted" : "",
    isVariant ? "timeline-view__cell--variant" : "",
    showThumbnail ? "timeline-view__cell--with-thumbnail" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onClick={() => onSelect(frameId, layerId)}
      draggable
      onDragStart={() => onDragStart(frameId, layerId, rowIndex)}
      onDragOver={(e) => onDragOver(e, frameId)}
      onDrop={(e) => onDrop(e, rowIndex, frameId)}
      onDragEnd={onDragEnd}
    >
      {showThumbnail && draw ? (
        <ThumbnailCanvas
          size={TIMELINE_THUMB_SIZE}
          revision={thumbnailRevision}
          draw={draw}
          className="timeline-view__cell-thumbnail"
        />
      ) : (
        <span
          className="timeline-view__cell-dot"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
}

export const TimelineCell = memo(TimelineCellImpl);

/**
 * An EMPTY slot in the grid — a row position where this frame has no layer.
 *
 * Kept in this file because it is the same grid position with the same drop
 * target, differing only in what it renders and that it carries no layer id.
 * Splitting it into its own file would separate two things that must stay
 * consistent about drag-and-drop.
 */
export interface TimelineEmptyCellProps {
  frameId: string;
  /** z-order position in the STORED array (0 = bottom). */
  rowIndex: number;
  isSelected: boolean;
  onSelect: (frameId: string, rowIndex: number) => void;
  onDragOver: (e: React.DragEvent, frameId: string) => void;
  onDrop: (e: React.DragEvent, rowIndex: number, frameId: string) => void;
}

function TimelineEmptyCellImpl({
  frameId,
  rowIndex,
  isSelected,
  onSelect,
  onDragOver,
  onDrop,
}: TimelineEmptyCellProps) {
  return (
    <div
      className={`timeline-view__cell timeline-view__cell--empty ${isSelected ? "timeline-view__cell--empty-selected" : ""}`}
      onClick={() => onSelect(frameId, rowIndex)}
      onDragOver={(e) => onDragOver(e, frameId)}
      onDrop={(e) => onDrop(e, rowIndex, frameId)}
    />
  );
}

export const TimelineEmptyCell = memo(TimelineEmptyCellImpl);
