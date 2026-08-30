/**
 * TimelineGrid — the layer-header column, the playhead, and the cell grid
 * (REFRESH task 35).
 *
 * ── ⚠️ CELLS ARRIVE THROUGH A `renderCell` SLOT ───────────────────────────
 *
 * The task's constraint is "per-cell rendering uses per-item containers, not
 * one big `observer`" — a 360-cell timeline re-rendering wholesale is exactly
 * the granularity problem the MobX migration exists to fix.
 *
 * A pure grid cannot import a container (that would put MobX under `ui/`), so
 * the grid calls a `renderCell(cell)` prop for each occupied position and
 * `renderEmptyCell(frameId, rowIndex)` for each hole. `TimelineViewContainer`
 * passes render functions that mount a per-cell container; the stories pass
 * functions that mount the plain `TimelineCell`. The grid itself only decides
 * WHERE things go, never what data they read.
 *
 * ── The header-row packing algorithm ──────────────────────────────────────
 *
 * `layerHeaders` are placed at their preferred display row, and when two want
 * the same row the second searches OUTWARD — below first, then above — for a
 * free one. That loop is carried over verbatim from the pre-split file
 * including its `searchOffset > maxLayers` safety break. It is not obviously
 * correct and it is not this task's to change; it is isolated here so it can
 * be replaced deliberately later.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `ReactNode` (a React TYPE only) and the shared grid types. No
 * store, no MobX, no API, no domain type. The stylesheet is
 * `FrameTimeline.css`, imported once by the `FrameTimeline` parent — the
 * `timeline-view` block is declared there alongside `FramesView`'s and
 * `VariantView`'s, and this task may not restructure those siblings.
 */
import type { ReactNode } from "react";
import type { TimelineCellData, TimelineLayerHeader } from "./timelineTypes";

/** Cell pitch in px: 24px cell + 2px gap, or 28 + 2 with thumbnails. */
const CELL_PITCH = 26;
const CELL_PITCH_WITH_THUMBNAILS = 30;
/** Half a cell, for centring the playhead. */
const PLAYHEAD_OFFSET = 12;
const PLAYHEAD_OFFSET_WITH_THUMBNAILS = 14;

export interface TimelineGridProps {
  /** Display rows, top row first; `null` marks an empty position. */
  grid: (TimelineCellData | null)[][];
  /** One entry per frame column, in order. */
  frameIds: string[];
  /** Max layer count across all frames — the row count. */
  maxLayers: number;
  /** Index of the selected frame, or -1 to hide the playhead. */
  selectedFrameIndex: number;
  showThumbnails: boolean;
  /** Layer name currently hovered in the header column, or `null`. */
  hoveredLayerName: string | null;
  layerHeaders: TimelineLayerHeader[];

  onLayerHeaderClick: (layerName: string) => void;
  onLayerHeaderHover: (layerName: string | null) => void;

  /** Name of the layer whose header is being renamed inline, or `null`. */
  editingLayerName: string | null;
  /** Draft text of the inline header rename. */
  editingLayerDraft: string;
  onStartLayerRename: (layerName: string) => void;
  onEditingLayerDraftChange: (draft: string) => void;
  onFinishLayerRename: () => void;
  onCancelLayerRename: () => void;

  /** Renders one occupied cell — a per-item container in the real app. */
  renderCell: (cell: TimelineCellData) => ReactNode;
  /** Renders one empty grid position. */
  renderEmptyCell: (frameId: string, rowIndex: number) => ReactNode;
}

export function TimelineGrid({
  grid,
  frameIds,
  maxLayers,
  selectedFrameIndex,
  showThumbnails,
  hoveredLayerName,
  layerHeaders,
  onLayerHeaderClick,
  onLayerHeaderHover,
  editingLayerName,
  editingLayerDraft,
  onStartLayerRename,
  onEditingLayerDraftChange,
  onFinishLayerRename,
  onCancelLayerRename,
  renderCell,
  renderEmptyCell,
}: TimelineGridProps) {
  // Build a map of display row → header. Verbatim from the pre-split file:
  // preferred row first, then search outward (below, then above).
  const rowToHeader = new Map<number, TimelineLayerHeader>();
  const usedRows = new Set<number>();

  for (const header of layerHeaders) {
    const preferredRow = header.firstDisplayRow;

    let row = preferredRow;
    let searchOffset = 0;
    while (usedRows.has(row)) {
      searchOffset++;
      const tryBelow = preferredRow + searchOffset;
      const tryAbove = preferredRow - searchOffset;

      if (tryBelow < maxLayers && !usedRows.has(tryBelow)) {
        row = tryBelow;
        break;
      } else if (tryAbove >= 0 && !usedRows.has(tryAbove)) {
        row = tryAbove;
        break;
      }

      // Safety: if we've searched all possible rows, break
      if (searchOffset > maxLayers) break;
    }

    if (row >= 0 && row < maxLayers && !usedRows.has(row)) {
      rowToHeader.set(row, header);
      usedRows.add(row);
    }
  }

  const pitch = showThumbnails ? CELL_PITCH_WITH_THUMBNAILS : CELL_PITCH;
  const playheadOffset = showThumbnails
    ? PLAYHEAD_OFFSET_WITH_THUMBNAILS
    : PLAYHEAD_OFFSET;

  return (
    <div className="timeline-view__layout">
      {/* Layer headers column - positioned to align with grid rows */}
      <div className="timeline-view__layer-headers">
        {Array.from({ length: maxLayers }, (_, rowIndex) => {
          const header = rowToHeader.get(rowIndex);
          if (!header) {
            return (
              <div
                key={`empty-${rowIndex}`}
                className="timeline-view__layer-header timeline-view__layer-header--empty"
              />
            );
          }
          return (
            <div
              key={`${header.name}-${rowIndex}`}
              className={`timeline-view__layer-header ${hoveredLayerName === header.name ? "timeline-view__layer-header--hovered" : ""}`}
              style={{ "--layer-color": header.color } as React.CSSProperties}
              onClick={() => onLayerHeaderClick(header.name)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartLayerRename(header.name);
              }}
              onMouseEnter={() => onLayerHeaderHover(header.name)}
              onMouseLeave={() => onLayerHeaderHover(null)}
            >
              <span
                className="timeline-view__layer-dot"
                style={{ backgroundColor: header.color }}
              />
              {editingLayerName === header.name ? (
                <input
                  // A callback ref rather than `autoFocus`, matching
                  // `LayerRow`: a header opened by "+ Layer" carries a
                  // placeholder name meant to be overtyped, and the row may sit
                  // below the fold of the scrolling header column.
                  ref={(el) => {
                    if (!el) return;
                    el.focus();
                    el.select();
                    el.scrollIntoView({ block: "nearest" });
                  }}
                  type="text"
                  className="timeline-view__layer-name-input"
                  value={editingLayerDraft}
                  onChange={(e) => onEditingLayerDraftChange(e.target.value)}
                  onBlur={onFinishLayerRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onFinishLayerRename();
                    else if (e.key === "Escape") onCancelLayerRename();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="timeline-view__layer-name">{header.name}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid with cells and playhead */}
      <div className="timeline-view__scroll">
        <div className="timeline-view__grid">
          {selectedFrameIndex >= 0 && (
            <div
              className="timeline-view__playhead"
              style={{
                left: `${selectedFrameIndex * pitch + playheadOffset}px`,
              }}
            />
          )}

          {grid.map((row, rowIndex) => {
            // Display row → z-order (display row 0 = highest z-order)
            const actualZOrder = maxLayers - 1 - rowIndex;

            return (
              <div
                key={rowIndex}
                className={`timeline-view__row ${rowIndex % 2 === 0 ? "timeline-view__row--even" : "timeline-view__row--odd"}`}
              >
                {row.map((cell, colIndex) => {
                  const frameId = frameIds[colIndex];
                  // The render props return a keyed element (see the header):
                  // wrapping them in a keyed <div> here would insert a level
                  // into a flex row whose children are sized by the grid CSS.
                  return cell
                    ? renderCell(cell)
                    : renderEmptyCell(frameId, actualZOrder);
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
