/**
 * BrushTimelineContainer — the Brush Studio's bottom rail (Brush Studio plan,
 * `docs/01-brush-studio`, task 18; MASTER D6 / D8 / D20).
 *
 * Feeds the existing PURE `TimelineView` (frames × layers grid with per-cell
 * thumbnails) from the brush document. There is exactly one view mode here —
 * no `FramesView`, no `VariantView`, no per-frame layer drag — so this
 * container is `TimelineViewContainer` with its four non-presentation
 * responsibilities cut down to the two that apply (thumbnail painting and
 * layer colouring), plus the playback loop.
 *
 * ── Layers are UNIFORM across frames (D6), so frame 0 IS the layer list ───
 *
 * Every frame carries the same layer ids in the same order, enforced by
 * `BrushStructureStore`. That collapses most of the pixel container:
 *
 *  - the header column and `maxLayers` come straight from `frames[0].layers`;
 *  - "move layer up/down" is ONE store call, `moveLayer(id, dir)`, which the
 *    store applies to every frame — not the per-frame, by-NAME loop the pixel
 *    container runs;
 *  - `renderEmptyCell` is required by the prop type but can never be reached
 *    while the invariant holds. It mounts a plain `TimelineEmptyCell`.
 *
 * ── Drag-and-drop is INERT, deliberately ──────────────────────────────────
 *
 * `TimelineCell` requires the four drag callbacks and is always `draggable`;
 * the spec forbids per-frame layer reordering. The callbacks passed are
 * no-ops — `onDragOver` never calls `preventDefault`, so the browser refuses
 * the drop. Only layer SWAPPING (the action-bar chevrons) reorders layers.
 *
 * ── The frame toolbar lives in the `viewModeDropdown` slot ────────────────
 *
 * `TimelineView` has no frame-op props — in the pixel studio frame add /
 * duplicate / delete / reorder live in the (un-migrated) Frames view, which
 * the brush studio does not have. The one slot the pure component offers is
 * `viewModeDropdown: ReactNode`; with a single view mode it holds a static
 * "Timeline" label, and the frame buttons sit beside it in the same header
 * row, styled with the timeline's own action-button classes. Reorder is the
 * store's `moveFrame(id, "left" | "right")` swap; there is no frame drag.
 *
 * ── Playback ──────────────────────────────────────────────────────────────
 *
 * The flag is `brushUI.isPlaying` (MASTER §1: "Local 200 ms interval"); the
 * TIMER is owned here in one `useEffect`. It is cleared on unmount, when the
 * flag drops, and whenever `brushes.document` is replaced — every brush
 * mutation replaces the document (D8), so a structural edit mid-playback
 * re-arms the loop against the new frame list rather than ticking over a
 * stale one. The tick reads the CURRENT document and selection off the
 * stores, never a closure, and advances `brushUI.selectFrame` modulo the
 * frame count.
 *
 * ── Thumbnails: `draw` + `revision`, not the cache ────────────────────────
 *
 * Cells repaint from `brushes.pixelVersion` (D8), never by observing a grid.
 * `TimelineCell` exposes no `cacheKey`, so the shared thumbnail LRU is not
 * used here — and could not be keyed by layer id alone anyway, because a
 * brush layer id is the SAME in every frame (D6). This container reads the
 * document identity, which every pixel write replaces, so a per-cell
 * `observer` would buy nothing: cells are plain `TimelineCell`s.
 *
 * `observer()` lives in `src/containers/` and only there.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { Icon } from "../ui/primitives/Icon/Icon";
import { TimelineView } from "../ui/components/TimelineView/TimelineView";
import {
  TimelineCell,
  TimelineEmptyCell,
} from "../ui/components/TimelineView/TimelineCell";
import type {
  TimelineCellData,
  TimelineLayerHeader,
} from "../ui/components/TimelineView/timelineTypes";
import { generateLayerColors } from "./hooks/timelineLayerColors";
import { makeBrushCellThumbnailDraw } from "./hooks/brushCellThumbnail";
import { useStores } from "../stores/context";
import { brushLayerColorSource } from "../types";
import type { BrushFrame, BrushLayer } from "../types";

/** MASTER §1: "Local 200 ms interval, same as `FrameTimeline.tsx`." */
export const BRUSH_PLAYBACK_INTERVAL_MS = 200;

/** The inert handler every drag callback receives. See the header. */
function noop(): void {
  // Deliberately empty: drag-and-drop is disabled on the brush timeline.
}

const NO_FRAMES: readonly BrushFrame[] = [];
const NO_LAYERS: readonly BrushLayer[] = [];

export const BrushTimelineContainer = observer(
  function BrushTimelineContainer() {
    const { brushes, brushStructure, brushUI } = useStores();

    const doc = brushes.document;
    const frames = doc?.frames ?? NO_FRAMES;
    // D6: frame 0's layers ARE the layer list.
    const layers = frames[0]?.layers ?? NO_LAYERS;
    // The revision, never the grid — see the header.
    const pixelRevision = brushes.pixelVersion;
    const selectedFrameId = brushUI.selectedFrameId;
    const selectedLayerId = brushUI.selectedLayerId;
    const isPlaying = brushUI.isPlaying;

    const [showThumbnails, setShowThumbnails] = useState(true);
    const [hoveredLayerName, setHoveredLayerName] = useState<string | null>(
      null,
    );
    const [editingLayerName, setEditingLayerName] = useState<string | null>(
      null,
    );
    const [editingLayerDraft, setEditingLayerDraft] = useState("");

    const maxLayers = Math.max(layers.length, 1);
    const selectedFrameIndex = frames.findIndex(
      (f) => f.id === selectedFrameId,
    );
    const selectedLayerIndex = layers.findIndex(
      (l) => l.id === selectedLayerId,
    );

    // ── Grid derivation ───────────────────────────────────────────────────

    const layerColors = useMemo(
      () => generateLayerColors(layers.map((l) => l.name)),
      [layers],
    );

    /** Display row 0 is the TOP of the stack (the array end), as in the pixel timeline. */
    const layerHeaders = useMemo<TimelineLayerHeader[]>(
      () =>
        layers.map((layer, zOrder) => ({
          name: layer.name,
          firstDisplayRow: maxLayers - 1 - zOrder,
          typicalRow: zOrder,
          color: layerColors.get(layer.name) ?? "gray",
        })),
      [layers, maxLayers, layerColors],
    );

    /** `grid[displayRow][frameIndex]`; `rowIndex` is the STORED z-order (0 = bottom). */
    const grid = useMemo(() => {
      const rows: (TimelineCellData | null)[][] = [];
      for (let zOrder = maxLayers - 1; zOrder >= 0; zOrder--) {
        rows.push(
          frames.map((frame, frameIndex) => {
            const layer = frame.layers[zOrder];
            return layer
              ? {
                  frameId: frame.id,
                  frameIndex,
                  layerId: layer.id,
                  layerName: layer.name,
                  rowIndex: zOrder,
                  isVariant: false,
                  color: layerColors.get(layer.name) ?? "gray",
                }
              : null;
          }),
        );
      }
      return rows;
    }, [frames, maxLayers, layerColors]);

    const frameIds = useMemo(() => frames.map((f) => f.id), [frames]);

    // ── Playback ──────────────────────────────────────────────────────────
    //
    // Cleared on unmount, on `isPlaying = false`, and on every document
    // replacement (`doc` is in the deps) — see the header.

    useEffect(() => {
      if (!isPlaying) return;
      if (doc === null) {
        // Nothing to play: drop the flag rather than tick over nothing.
        brushUI.setPlaying(false);
        return;
      }
      const id = window.setInterval(() => {
        const current = brushes.document;
        if (!current || current.frames.length === 0) return;
        const index = current.frames.findIndex(
          (f) => f.id === brushUI.selectedFrameId,
        );
        // `index` of -1 (stale selection) lands on frame 0.
        const next = current.frames[(index + 1) % current.frames.length];
        brushUI.selectFrame(next.id);
      }, BRUSH_PLAYBACK_INTERVAL_MS);
      return () => window.clearInterval(id);
    }, [isPlaying, doc, brushes, brushUI]);

    const handleTogglePlayback = useCallback(
      () => brushUI.togglePlaying(),
      [brushUI],
    );

    // ── Selection ─────────────────────────────────────────────────────────

    const handleCellSelect = useCallback(
      (frameId: string, layerId: string) => {
        brushUI.selectFrame(frameId);
        brushUI.selectLayer(layerId);
      },
      [brushUI],
    );

    /**
     * Headers are keyed by NAME (the pure component's contract). Every frame
     * has the layer (D6), so the selected frame is kept; only with no frame
     * selected does this fall back to frame 0.
     */
    const handleLayerHeaderClick = useCallback(
      (layerName: string) => {
        const layer = layers.find((l) => l.name === layerName);
        if (!layer) return;
        if (selectedFrameIndex < 0 && frames.length > 0) {
          brushUI.selectFrame(frames[0].id);
        }
        brushUI.selectLayer(layer.id);
      },
      [layers, frames, selectedFrameIndex, brushUI],
    );

    // ── Layer ops ─────────────────────────────────────────────────────────

    const handleStartLayerRename = useCallback((name: string) => {
      setEditingLayerName(name);
      setEditingLayerDraft(name);
    }, []);

    const handleCancelLayerRename = useCallback(() => {
      setEditingLayerName(null);
      setEditingLayerDraft("");
    }, []);

    /** Resolves the header's NAME to an id, then renames it in every frame. */
    const handleFinishLayerRename = useCallback(() => {
      const oldName = editingLayerName;
      const next = editingLayerDraft.trim();
      if (oldName && next && next !== oldName) {
        const layer = layers.find((l) => l.name === oldName);
        if (layer) brushStructure.renameLayer(layer.id, next);
      }
      setEditingLayerName(null);
      setEditingLayerDraft("");
    }, [editingLayerName, editingLayerDraft, layers, brushStructure]);

    /**
     * Adds to every frame (the store's only add) with a unique placeholder
     * name and opens the header for renaming, exactly like the pixel
     * timeline. The new layer takes the selected layer's channel type so
     * adding beside an HSL layer gives an HSL layer; `rgb` otherwise. It
     * inherits the selected layer's colour source the same way (plan 13
     * D3); with no selection `brushLayerColorSource({})` is `"selected"`.
     */
    const handleAddLayer = useCallback(() => {
      if (doc === null) return;
      const taken = new Set(layers.map((l) => l.name));
      let n = layers.length + 1;
      while (taken.has(`Layer ${n}`)) n++;
      const name = `Layer ${n}`;
      brushStructure.addLayer(
        name,
        brushUI.channelTypeIn(doc) ?? "rgb",
        brushLayerColorSource(brushUI.selectedLayerIn(doc) ?? {}),
      );
      handleStartLayerRename(name);
    }, [doc, layers, brushStructure, brushUI, handleStartLayerRename]);

    // The store swaps the pair in EVERY frame — the semantics kept from
    // `TimelineViewContainer`'s across-all-frames move, without its loop.
    const canMoveUp =
      selectedLayerIndex >= 0 && selectedLayerIndex < layers.length - 1;
    const canMoveDown = selectedLayerIndex > 0;

    const handleMoveLayerUp = useCallback(() => {
      if (selectedLayerId) brushStructure.moveLayer(selectedLayerId, "up");
    }, [selectedLayerId, brushStructure]);

    const handleMoveLayerDown = useCallback(() => {
      if (selectedLayerId) brushStructure.moveLayer(selectedLayerId, "down");
    }, [selectedLayerId, brushStructure]);

    // ── Frame ops (the header-row toolbar) ────────────────────────────────

    const hasFrame = selectedFrameIndex >= 0 && selectedFrameId !== null;

    const handleAddFrame = useCallback(() => {
      brushStructure.addFrame();
    }, [brushStructure]);

    const handleDuplicateFrame = useCallback(() => {
      if (selectedFrameId) brushStructure.duplicateFrame(selectedFrameId);
    }, [selectedFrameId, brushStructure]);

    const handleDeleteFrame = useCallback(() => {
      if (selectedFrameId) brushStructure.deleteFrame(selectedFrameId);
    }, [selectedFrameId, brushStructure]);

    const handleMoveFrameLeft = useCallback(() => {
      if (selectedFrameId) brushStructure.moveFrame(selectedFrameId, "left");
    }, [selectedFrameId, brushStructure]);

    const handleMoveFrameRight = useCallback(() => {
      if (selectedFrameId) brushStructure.moveFrame(selectedFrameId, "right");
    }, [selectedFrameId, brushStructure]);

    /** One view mode, so the "dropdown" is a label — plus the frame toolbar. */
    const viewModeDropdown = (
      <>
        <span
          className="frame-timeline__dropdown-trigger"
          aria-label="View mode"
        >
          Timeline
        </span>
        <div
          className="timeline-view__action-buttons"
          role="group"
          aria-label="Frame actions"
        >
          <button
            className="timeline-view__action-btn"
            onClick={handleAddFrame}
            disabled={doc === null}
            title="Add frame (after selected)"
          >
            <Icon icon={Plus} size={12} />
          </button>
          <button
            className="timeline-view__action-btn"
            onClick={handleDuplicateFrame}
            disabled={!hasFrame}
            title="Duplicate frame"
          >
            <Icon icon={Copy} size={12} />
          </button>
          <button
            className="timeline-view__action-btn"
            onClick={handleDeleteFrame}
            disabled={!hasFrame || frames.length <= 1}
            title="Delete frame"
          >
            <Icon icon={Trash2} size={12} />
          </button>
          <button
            className="timeline-view__action-btn"
            onClick={handleMoveFrameLeft}
            disabled={!hasFrame || selectedFrameIndex === 0}
            title="Move frame left"
          >
            <Icon icon={ChevronLeft} size={12} />
          </button>
          <button
            className="timeline-view__action-btn"
            onClick={handleMoveFrameRight}
            disabled={!hasFrame || selectedFrameIndex >= frames.length - 1}
            title="Move frame right"
          >
            <Icon icon={ChevronRight} size={12} />
          </button>
        </div>
      </>
    );

    // ── Cell rendering ────────────────────────────────────────────────────

    const renderCell = useCallback(
      (cell: TimelineCellData) => {
        const layer = doc?.frames[cell.frameIndex]?.layers.find(
          (l) => l.id === cell.layerId,
        );
        const draw =
          showThumbnails && doc && layer
            ? makeBrushCellThumbnailDraw(layer, doc.width, doc.height)
            : undefined;
        return (
          <TimelineCell
            key={`${cell.frameId}-${cell.layerId}`}
            frameId={cell.frameId}
            layerId={cell.layerId}
            rowIndex={cell.rowIndex}
            color={cell.color}
            isVariant={false}
            isSelected={
              cell.frameId === selectedFrameId &&
              cell.layerId === selectedLayerId
            }
            isHighlighted={hoveredLayerName === cell.layerName}
            showThumbnail={draw !== undefined}
            draw={draw}
            thumbnailRevision={pixelRevision}
            onSelect={handleCellSelect}
            onDragStart={noop}
            onDragOver={noop}
            onDrop={noop}
            onDragEnd={noop}
          />
        );
      },
      [
        doc,
        showThumbnails,
        selectedFrameId,
        selectedLayerId,
        hoveredLayerName,
        pixelRevision,
        handleCellSelect,
      ],
    );

    /** Unreachable while D6 holds; required by the prop type. */
    const renderEmptyCell = useCallback(
      (frameId: string, rowIndex: number) => (
        <TimelineEmptyCell
          key={`${frameId}-${rowIndex}`}
          frameId={frameId}
          rowIndex={rowIndex}
          isSelected={false}
          onSelect={noop}
          onDragOver={noop}
          onDrop={noop}
        />
      ),
      [],
    );

    return (
      // The same wrapper `FrameTimeline` gives the pixel timeline, so the
      // layout's bottom slot pads and flexes this rail identically.
      <div className="frame-timeline">
        <TimelineView
          grid={grid}
          frameIds={frameIds}
          maxLayers={maxLayers}
          selectedFrameIndex={selectedFrameIndex}
          layerHeaders={layerHeaders}
          hoveredLayerName={hoveredLayerName}
          showThumbnails={showThumbnails}
          onToggleThumbnails={setShowThumbnails}
          isPlaying={isPlaying}
          onTogglePlayback={handleTogglePlayback}
          // The optimized preview is a pixel-studio feature; the button is
          // part of the pure action bar and its title is fixed there.
          onOpenPreview={noop}
          viewModeDropdown={viewModeDropdown}
          onAddLayer={handleAddLayer}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveLayerUp={handleMoveLayerUp}
          onMoveLayerDown={handleMoveLayerDown}
          onLayerHeaderClick={handleLayerHeaderClick}
          onLayerHeaderHover={setHoveredLayerName}
          editingLayerName={editingLayerName}
          editingLayerDraft={editingLayerDraft}
          onStartLayerRename={handleStartLayerRename}
          onEditingLayerDraftChange={setEditingLayerDraft}
          onFinishLayerRename={handleFinishLayerRename}
          onCancelLayerRename={handleCancelLayerRename}
          renderCell={renderCell}
          renderEmptyCell={renderEmptyCell}
          // Owner's request: "fit 5 layers by default even if not present".
          minRows={5}
        />
      </div>
    );
  },
);
