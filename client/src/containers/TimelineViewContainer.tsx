/**
 * TimelineViewContainer (REFRESH task 25, split in task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FOUR OF THE SIX RESPONSIBILITIES ENDED UP HERE, NOT IN `ui/`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `TimelineView` was 833 lines with six responsibilities: the grid, layer
 * colouring, drag-and-drop, keyboard shortcuts, thumbnails, and the cell
 * clipboard. Only the grid and the drag GESTURE are presentation. The rest
 * live here:
 *
 *  - **Layer colouring** — `containers/hooks/timelineLayerColors.ts`. It
 *    keeps a module-level `Map` so a layer name holds its hue; `ui/` forbids
 *    module-level mutable state, and for good reason (a story would seed a
 *    process-wide cache).
 *  - **Thumbnail painting** — `containers/hooks/timelineCellThumbnail.ts`. It
 *    walks `layer.pixels` (R2); it may not cross into `ui/` at all, and
 *    reaches it as a bound `draw` closure instead.
 *  - **Keyboard shortcuts** — the `window` keydown listener below.
 *  - **The cell clipboard** — `SessionStore.timelineCellClipboard`.
 *
 * ── ⚠️ THE PASTE-INTO-EMPTY-CELL BRANCH IS THE SUBTLE ONE ─────────────────
 *
 * Cmd+V into an EMPTY grid position does not just paste. It looks for a layer
 * in that frame with the clipboard's layer NAME; if none exists it CREATES
 * one at the target z-order via `addLayerToFrameAtPosition` — in that frame
 * only — forwarding the clipboard's variant fields (`variantGroupId`,
 * `selectedVariantId`, `variantOffsets`, and the legacy singular
 * `variantOffset`) so a pasted variant cell stays a variant. Then it pastes
 * into the new layer. All of that is carried over verbatim; it is the branch
 * most likely to be broken by a well-meaning simplification.
 *
 * ── Per-cell containers ───────────────────────────────────────────────────
 *
 * `renderCell` mounts a `TimelineCellContainer` per occupied position, which
 * is the granularity the task requires. This container deliberately does NOT
 * read `pixelVersion` — if it did, every pixel edit would re-render the whole
 * grid and the per-cell containers would be pointless.
 *
 * `observer()` lives in `src/containers/` and only there (ESLint, task 05).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { TimelineView } from "../ui/components/TimelineView/TimelineView";
import { TimelineEmptyCell } from "../ui/components/TimelineView/TimelineCell";
import type {
  TimelineCellData,
  TimelineEmptyCellSelection,
  TimelineLayerHeader,
  TimelineSelectedCell,
} from "../ui/components/TimelineView/timelineTypes";
import { TimelineCellContainer } from "./TimelineCellContainer";
import { generateLayerColors } from "./hooks/timelineLayerColors";
import { PreviewModal } from "../ui/components/PreviewModal/PreviewModal";
import { useStores } from "../stores/context";
import type { PixelObject, TimelineProjectView } from "../types";

export interface TimelineViewContainerProps {
  project: TimelineProjectView;
  obj: PixelObject;
  isPlaying: boolean;
  togglePlayback: () => void;
  viewModeDropdown: ReactNode;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
}

/**
 * Find the typical/max row where a layer appears across all frames.
 * Using MAX gives a better alignment since we display top-to-bottom =
 * high z to low z. Verbatim from the pre-split component.
 */
function findTypicalRowForLayer(
  layerName: string,
  frames: PixelObject["frames"],
): number {
  let maxRow = -1;
  for (const frame of frames) {
    const layerIndex = frame.layers.findIndex((l) => l.name === layerName);
    if (layerIndex !== -1 && layerIndex > maxRow) {
      maxRow = layerIndex;
    }
  }
  return maxRow === -1 ? 0 : maxRow;
}

export const TimelineViewContainer = observer(function TimelineViewContainer({
  project,
  obj,
  isPlaying,
  togglePlayback,
  viewModeDropdown,
  showPreview,
  setShowPreview,
}: TimelineViewContainerProps) {
  const { layers: layerStore, timelineUI, session, ui } = useStores();

  const [selectedCell, setSelectedCell] = useState<TimelineSelectedCell | null>(
    null,
  );
  const [emptyCellSelection, setEmptyCellSelection] =
    useState<TimelineEmptyCellSelection | null>(null);
  const [hoveredLayerName, setHoveredLayerName] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{
    frameId: string;
    layerId: string;
    startRow: number;
  } | null>(null);
  const [newLayerName, setNewLayerName] = useState("");

  const frames = obj.frames;
  const showThumbnails = ui.viewport.timelineThumbnailMode;
  const selectedFrameId = timelineUI.selectedFrameId;
  const selectedLayerId = timelineUI.selectedLayerId;
  const selectedFrameIndex = frames.findIndex((f) => f.id === selectedFrameId);
  const timelineCellClipboard = session.timelineCellClipboard;

  // ── Grid derivation ─────────────────────────────────────────────────────

  const maxLayers = useMemo(
    () => Math.max(...frames.map((f) => f.layers.length), 1),
    [frames],
  );

  const layerColors = useMemo(() => {
    const names = new Set<string>();
    for (const frame of frames) {
      for (const layer of frame.layers) names.add(layer.name);
    }
    return generateLayerColors(names);
  }, [frames]);

  /**
   * Unique layer names ordered by first appearance. Priority: layers
   * appearing in earlier frames first, then by z-order (higher z = top).
   * Verbatim from the pre-split component.
   */
  const layerHeaders = useMemo<TimelineLayerHeader[]>(() => {
    const layerInfo: {
      name: string;
      firstFrameIndex: number;
      firstZOrder: number;
      firstDisplayRow: number;
      typicalRow: number;
      color: string;
    }[] = [];
    const seenNames = new Set<string>();

    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      for (let zOrder = 0; zOrder < frame.layers.length; zOrder++) {
        const layer = frame.layers[zOrder];
        if (!seenNames.has(layer.name)) {
          seenNames.add(layer.name);
          layerInfo.push({
            name: layer.name,
            firstFrameIndex: frameIndex,
            firstZOrder: zOrder,
            // Convert z-order to display row
            firstDisplayRow: maxLayers - 1 - zOrder,
            typicalRow: findTypicalRowForLayer(layer.name, frames),
            color: layerColors.get(layer.name) || "gray",
          });
        }
      }
    }

    // Sort by first display row (top rows first), then first frame index.
    layerInfo.sort((a, b) => {
      if (a.firstDisplayRow !== b.firstDisplayRow) {
        return a.firstDisplayRow - b.firstDisplayRow;
      }
      return a.firstFrameIndex - b.firstFrameIndex;
    });

    return layerInfo.map((info) => ({
      name: info.name,
      firstDisplayRow: info.firstDisplayRow,
      typicalRow: info.typicalRow,
      color: info.color,
    }));
  }, [frames, maxLayers, layerColors]);

  /**
   * Rows are z-order positions, columns are frames. Cells appear at their
   * actual z-order position, so a layer may span multiple rows.
   */
  const grid = useMemo(() => {
    const rows: (TimelineCellData | null)[][] = [];

    // Rows from maxLayers-1 down to 0 (top layer first in display)
    for (let row = maxLayers - 1; row >= 0; row--) {
      const rowCells: (TimelineCellData | null)[] = [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        const frame = frames[frameIndex];
        const layer = frame.layers[row];

        rowCells.push(
          layer
            ? {
                frameId: frame.id,
                frameIndex,
                layerId: layer.id,
                layerName: layer.name,
                rowIndex: row,
                isVariant: layer.isVariant || false,
                color: layerColors.get(layer.name) || "gray",
              }
            : null,
        );
      }

      rows.push(rowCells);
    }

    return rows;
  }, [frames, maxLayers, layerColors]);

  const frameIds = useMemo(() => frames.map((f) => f.id), [frames]);

  // ── Selection ───────────────────────────────────────────────────────────

  const handleCellSelect = useCallback(
    (frameId: string, layerId: string) => {
      setSelectedCell({ frameId, layerId });
      // Clear empty cell selection when clicking a filled cell
      setEmptyCellSelection(null);
      timelineUI.selectFrame(frameId, true); // Always sync variant timelines
      timelineUI.selectLayer(layerId);
    },
    [timelineUI],
  );

  const handleEmptyCellSelect = useCallback(
    (frameId: string, rowIndex: number) => {
      setEmptyCellSelection({ frameId, rowIndex });
    },
    [],
  );

  const handleLayerHeaderClick = useCallback(
    (layerName: string) => {
      // Find first frame that has this layer and select it
      for (const frame of frames) {
        const layer = frame.layers.find((l) => l.name === layerName);
        if (layer) {
          setSelectedCell({ frameId: frame.id, layerId: layer.id });
          timelineUI.selectFrame(frame.id, true);
          timelineUI.selectLayer(layer.id);
          break;
        }
      }
    },
    [frames, timelineUI],
  );

  // ── Layer ops ───────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const name = newLayerName.trim() || `Layer ${maxLayers + 1}`;
    layerStore.addLayerToAllFrames(name);
    setNewLayerName("");
  }, [newLayerName, maxLayers, layerStore]);

  /**
   * Move the selected layer up/down across ALL frames, matched by NAME.
   * Verbatim from the pre-split component — note it reorders by name, not by
   * id, so a rename mid-operation would desynchronise the frames.
   */
  const handleMoveLayerUp = useCallback(() => {
    if (!selectedLayerId) return;
    const frame = frames.find((f) => f.id === selectedFrameId);
    if (!frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === selectedLayerId);
    if (layerIndex < frame.layers.length - 1) {
      const layer = frame.layers[layerIndex];
      for (const f of frames) {
        const idx = f.layers.findIndex((l) => l.name === layer.name);
        if (idx !== -1 && idx < f.layers.length - 1) {
          layerStore.reorderLayerInFrame(f.id, f.layers[idx].id, idx + 1);
        }
      }
    }
  }, [selectedLayerId, selectedFrameId, frames, layerStore]);

  const handleMoveLayerDown = useCallback(() => {
    if (!selectedLayerId) return;
    const frame = frames.find((f) => f.id === selectedFrameId);
    if (!frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === selectedLayerId);
    if (layerIndex > 0) {
      const layer = frame.layers[layerIndex];
      for (const f of frames) {
        const idx = f.layers.findIndex((l) => l.name === layer.name);
        if (idx > 0) {
          layerStore.reorderLayerInFrame(f.id, f.layers[idx].id, idx - 1);
        }
      }
    }
  }, [selectedLayerId, selectedFrameId, frames, layerStore]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  //
  // Verbatim from the pre-split component, including the paste-into-empty
  // branch described in the header.

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Copy: Cmd+C (only works with filled cell selection)
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        if (selectedCell) {
          e.preventDefault();
          layerStore.copyTimelineCell(
            selectedCell.frameId,
            selectedCell.layerId,
          );
        }
      }

      // Paste: Cmd+V (works with either empty or filled cell selection)
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        if (timelineCellClipboard) {
          if (emptyCellSelection) {
            // Paste to empty cell - find or create a layer at that position
            const frame = frames.find(
              (f) => f.id === emptyCellSelection.frameId,
            );
            if (frame) {
              const existingLayer = frame.layers.find(
                (l) => l.name === timelineCellClipboard.layerName,
              );
              if (existingLayer) {
                // Layer exists, just paste to it
                layerStore.pasteTimelineCell(
                  emptyCellSelection.frameId,
                  existingLayer.id,
                );
              } else {
                // Create a new layer only in this frame at the target row,
                // forwarding variant information when the clipboard has it.
                const variantInfo = timelineCellClipboard.isVariant
                  ? {
                      isVariant: timelineCellClipboard.isVariant,
                      variantGroupId: timelineCellClipboard.variantGroupId,
                      selectedVariantId:
                        timelineCellClipboard.selectedVariantId,
                      variantOffsets: timelineCellClipboard.variantOffsets,
                      variantOffset: timelineCellClipboard.variantOffset,
                    }
                  : undefined;
                const newLayerId = layerStore.addLayerToFrameAtPosition(
                  emptyCellSelection.frameId,
                  timelineCellClipboard.layerName,
                  emptyCellSelection.rowIndex,
                  variantInfo,
                );
                if (newLayerId) {
                  // Pixels get pasted; variant info is already set.
                  layerStore.pasteTimelineCell(
                    emptyCellSelection.frameId,
                    newLayerId,
                  );
                }
              }
            }
            setEmptyCellSelection(null); // Clear after paste
          } else if (selectedCell) {
            // Paste to existing cell - this should override the cell
            layerStore.pasteTimelineCell(
              selectedCell.frameId,
              selectedCell.layerId,
            );
          }
        }
      }

      // Delete: Delete or Backspace
      if (selectedCell && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        layerStore.deleteLayerFromFrame(
          selectedCell.frameId,
          selectedCell.layerId,
        );
        setSelectedCell(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedCell,
    emptyCellSelection,
    timelineCellClipboard,
    frames,
    layerStore,
  ]);

  // ── Drag and drop ───────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (frameId: string, layerId: string, rowIndex: number) => {
      setDragInfo({ frameId, layerId, startRow: rowIndex });
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, frameId: string) => {
      e.preventDefault();
      if (!dragInfo || dragInfo.frameId !== frameId) return;
      e.dataTransfer.dropEffect = "move";
    },
    [dragInfo],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetRow: number, frameId: string) => {
      e.preventDefault();
      if (!dragInfo || dragInfo.frameId !== frameId) return;

      if (dragInfo.startRow !== targetRow) {
        layerStore.reorderLayerInFrame(frameId, dragInfo.layerId, targetRow);
      }

      setDragInfo(null);
    },
    [dragInfo, layerStore],
  );

  const handleDragEnd = useCallback(() => setDragInfo(null), []);

  // ── Can-move guards ─────────────────────────────────────────────────────

  const currentFrame = frames.find((f) => f.id === selectedFrameId);
  const currentLayerIndex =
    currentFrame?.layers.findIndex((l) => l.id === selectedLayerId) ?? -1;
  const canMoveUp =
    currentLayerIndex >= 0 &&
    currentLayerIndex < (currentFrame?.layers.length ?? 0) - 1;
  const canMoveDown = currentLayerIndex > 0;

  // ── Cell rendering: a per-item container per occupied position ──────────

  const renderCell = useCallback(
    (cell: TimelineCellData) => (
      <TimelineCellContainer
        key={`${cell.frameId}-${cell.layerId}`}
        cell={cell}
        isSelected={
          selectedCell?.frameId === cell.frameId &&
          selectedCell?.layerId === cell.layerId
        }
        isHighlighted={hoveredLayerName === cell.layerName}
        showThumbnail={showThumbnails}
        onSelect={handleCellSelect}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
    ),
    [
      selectedCell,
      hoveredLayerName,
      showThumbnails,
      handleCellSelect,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
    ],
  );

  const renderEmptyCell = useCallback(
    (frameId: string, rowIndex: number) => (
      <TimelineEmptyCell
        key={`${frameId}-${rowIndex}`}
        frameId={frameId}
        rowIndex={rowIndex}
        isSelected={
          emptyCellSelection?.frameId === frameId &&
          emptyCellSelection?.rowIndex === rowIndex
        }
        onSelect={handleEmptyCellSelect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
    ),
    [emptyCellSelection, handleEmptyCellSelect, handleDragOver, handleDrop],
  );

  return (
    <TimelineView
      grid={grid}
      frameIds={frameIds}
      maxLayers={maxLayers}
      selectedFrameIndex={selectedFrameIndex}
      layerHeaders={layerHeaders}
      hoveredLayerName={hoveredLayerName}
      showThumbnails={showThumbnails}
      onToggleThumbnails={(show) => timelineUI.setTimelineThumbnailMode(show)}
      isPlaying={isPlaying}
      onTogglePlayback={togglePlayback}
      onOpenPreview={() => setShowPreview(true)}
      viewModeDropdown={viewModeDropdown}
      newLayerName={newLayerName}
      onNewLayerNameChange={setNewLayerName}
      onAddLayer={handleAddLayer}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveLayerUp={handleMoveLayerUp}
      onMoveLayerDown={handleMoveLayerDown}
      onLayerHeaderClick={handleLayerHeaderClick}
      onLayerHeaderHover={setHoveredLayerName}
      renderCell={renderCell}
      renderEmptyCell={renderEmptyCell}
      previewModal={
        <PreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          object={obj}
          frames={obj.frames}
          variants={project.variants}
          zoom={project.uiState.zoom}
        />
      }
    />
  );
});
