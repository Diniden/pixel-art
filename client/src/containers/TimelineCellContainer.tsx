/**
 * TimelineCellContainer — one cell, reading its own item (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PER-ITEM CONTAINER THE TASK REQUIRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 35's constraint: *"Per-cell rendering must use per-item containers
 * reading their own item, not one `observer` over the whole grid — a 360-cell
 * timeline re-rendering wholesale is exactly the granularity problem the MobX
 * migration exists to fix."*
 *
 * So this is an `observer()` per cell. It reads `domain.pixelVersion` — and
 * only that, plus its own layer — so a pixel edit invalidates the cells that
 * show that layer rather than the grid.
 *
 * ── ⚠️ `pixelVersion` IS THE REVISION, NOT THE PIXELS ─────────────────────
 *
 * `layer.pixels` is `observableRef` (R2): MobX never looks inside it, and a
 * component cannot learn that a pixel changed by reading the grid. The store
 * publishes `pixelVersion` for exactly this, and `ThumbnailCanvas` takes a
 * `revision` number for exactly this. Reading it here is what makes the
 * thumbnail repaint on an edit; walking the grid instead would be the
 * modelling error R2 exists to prevent.
 *
 * The `draw` closure is rebuilt every render, which is deliberate and free:
 * `ThumbnailCanvas` ignores `draw`'s identity by design and repaints only
 * when `revision` changes.
 *
 * `observer()` lives in `src/containers/` and only there (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { TimelineCell } from "../ui/components/TimelineView/TimelineCell";
import type { TimelineCellData } from "../ui/components/TimelineView/timelineTypes";
import { makeCellThumbnailDraw } from "./hooks/timelineCellThumbnail";
import { useStores } from "../stores/context";

export interface TimelineCellContainerProps {
  cell: TimelineCellData;
  isSelected: boolean;
  isHighlighted: boolean;
  showThumbnail: boolean;
  onSelect: (frameId: string, layerId: string) => void;
  onDragStart: (frameId: string, layerId: string, rowIndex: number) => void;
  onDragOver: (e: React.DragEvent, frameId: string) => void;
  onDrop: (e: React.DragEvent, rowIndex: number, frameId: string) => void;
  onDragEnd: () => void;
}

export const TimelineCellContainer = observer(function TimelineCellContainer({
  cell,
  isSelected,
  isHighlighted,
  showThumbnail,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TimelineCellContainerProps) {
  const store = useStores();
  const { domain } = store;

  const obj = store.currentObject;
  const frame = obj?.frames[cell.frameIndex];
  const layer = frame?.layers.find((l) => l.id === cell.layerId);

  // See the header: the revision, never the grid itself.
  const revision = domain.pixelVersion;

  const draw =
    showThumbnail && layer && obj
      ? makeCellThumbnailDraw(
          layer,
          obj.gridSize,
          domain.variants,
          cell.frameIndex,
        )
      : undefined;

  return (
    <TimelineCell
      frameId={cell.frameId}
      layerId={cell.layerId}
      rowIndex={cell.rowIndex}
      color={cell.color}
      isVariant={cell.isVariant}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      showThumbnail={showThumbnail && !!draw}
      draw={draw}
      thumbnailRevision={revision}
      onSelect={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    />
  );
});
