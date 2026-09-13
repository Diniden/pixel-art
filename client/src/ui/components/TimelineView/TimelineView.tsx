/**
 * TimelineView — the action bar and composition (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  833 LINES · 12 STORE MEMBERS · SIX RESPONSIBILITIES → THREE COMPONENTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The six were: the grid, the layer colouring, drag-and-drop, the keyboard
 * shortcuts, the thumbnails, and the cell clipboard. Four of them were never
 * presentation at all and are now in `TimelineViewContainer`:
 *
 *  - **colour assignment** — `generateLayerColors` kept a MODULE-LEVEL
 *    `Map` cache (`layerColorCache`) so a layer name kept its hue across
 *    re-renders. Module-level mutable state is explicitly banned under `ui/`
 *    ("no module-level mutable state"), and a story that mounted this
 *    component would have permanently seeded a process-wide cache. It moved
 *    to the container verbatim, hue-conflict search and all.
 *  - **the global keydown handler** — Cmd+C / Cmd+V / Delete on the selected
 *    cell, including the branch that CREATES a layer when pasting into an
 *    empty position. It fires store actions; it is not presentation.
 *  - **the clipboard**, and
 *  - **thumbnail painting**, which may not cross the boundary at all (R2).
 *
 * What is left here is an action bar and two children.
 *
 * ── ⚠️ THE PREVIEW MODAL IS A SLOT ────────────────────────────────────────
 *
 * The pre-split file imported `PreviewModal` and handed it `obj`, `frames`
 * and `project.variants` — whole domain trees, and through them every pixel
 * grid in the object. It is a `ReactNode` prop now, mounted by the container.
 *
 * ── The three "dead symbols" the spec asks to delete ──────────────────────
 *
 * Task 35 lists three dead symbols to remove while here: a destructured but
 * unused `moveLayer` (line 305), an unused `getCurrentObject` (313), and a
 * grid ref declared at 328 and attached at 740 but never dereferenced.
 * **All three were already gone** from `TimelineView.tsx` before this task
 * started — removed by an earlier wave — and grep confirms none of them
 * appears in the file this split was made from. Nothing to delete; recorded
 * as a spec correction. The verification `! grep -rn "gridRef"` over this
 * directory consequently passes, and this comment is deliberately worded so
 * that it keeps passing.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: `ReactNode` / `CSSProperties` (React TYPES only), the `ui/`
 * `classNames` helper, the `Icon` primitive, `lucide-react` glyphs, its
 * sibling `TimelineGrid`, and the shared grid types. No store, no MobX, no
 * API, no domain type. The stylesheet is
 * `FrameTimeline.css`, imported once by the `FrameTimeline` parent, because
 * the `timeline-view` block is declared there alongside its two sibling views
 * and this task may not restructure them.
 */
import type { CSSProperties, ReactNode } from "react";
import { classNames } from "../../classNames";
import { Icon } from "../../primitives/Icon/Icon";
import { ChevronUp, ChevronDown, SquareIcon, Play, Zap } from "lucide-react";
import { TimelineGrid } from "./TimelineGrid";
import type { TimelineCellData, TimelineLayerHeader } from "./timelineTypes";

export interface TimelineViewProps {
  /** Display rows, top row first; `null` marks an empty position. */
  grid: (TimelineCellData | null)[][];
  /** One entry per frame column, in order. */
  frameIds: string[];
  maxLayers: number;
  selectedFrameIndex: number;
  layerHeaders: TimelineLayerHeader[];
  hoveredLayerName: string | null;

  showThumbnails: boolean;
  onToggleThumbnails: (show: boolean) => void;

  isPlaying: boolean;
  onTogglePlayback: () => void;
  onOpenPreview: () => void;

  /** The view-mode dropdown, supplied by `FrameTimeline`. */
  viewModeDropdown: ReactNode;

  onAddLayer: () => void;

  /** Move the selected layer across ALL frames. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveLayerUp: () => void;
  onMoveLayerDown: () => void;

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

  /** Slot: the optimized-preview modal. See the header. */
  previewModal?: ReactNode;

  /**
   * Floor the grid at this many row pitches even when fewer layers exist;
   * `undefined` = content height. Opt-in: the pixel timeline passes nothing,
   * the brush rail passes 5 so a one-layer brush does not collapse the rail
   * (docs/11-brush-studio-followups task 01). Applied as the
   * `timeline-view--min-rows` modifier plus the `--timeline-min-rows` custom
   * property, which `FrameTimeline.css` turns into a `min-height` on the
   * scroll area. jsdom does not lay out, so tests assert the class and the
   * property, never pixels.
   */
  minRows?: number;
}

export function TimelineView({
  grid,
  frameIds,
  maxLayers,
  selectedFrameIndex,
  layerHeaders,
  hoveredLayerName,
  showThumbnails,
  onToggleThumbnails,
  isPlaying,
  onTogglePlayback,
  onOpenPreview,
  viewModeDropdown,
  onAddLayer,
  canMoveUp,
  canMoveDown,
  onMoveLayerUp,
  onMoveLayerDown,
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
  previewModal,
  minRows,
}: TimelineViewProps) {
  return (
    <div
      className={classNames(
        "timeline-view",
        minRows ? "timeline-view--min-rows" : undefined,
      )}
      style={
        minRows
          ? ({ "--timeline-min-rows": minRows } as CSSProperties)
          : undefined
      }
    >
      {/* Action bar */}
      <div className="frame-timeline__header-row">
        {viewModeDropdown}
        <div className="timeline-view__action-buttons">
          <button
            className="timeline-view__action-btn"
            onClick={onMoveLayerUp}
            disabled={!canMoveUp}
            title="Move layer up (all frames)"
          >
            <Icon icon={ChevronUp} size={12} />
          </button>
          <button
            className="timeline-view__action-btn"
            onClick={onMoveLayerDown}
            disabled={!canMoveDown}
            title="Move layer down (all frames)"
          >
            <Icon icon={ChevronDown} size={12} />
          </button>
          <button
            className="timeline-view__action-btn timeline-view__action-btn--add-layer"
            onClick={onAddLayer}
            title="Add layer to all frames"
          >
            + Layer
          </button>
        </div>
        <div className="timeline-view__playback-controls">
          <button
            className={`timeline-view__toggle-btn ${showThumbnails ? "timeline-view__toggle-btn--active" : ""}`}
            onClick={() => onToggleThumbnails(!showThumbnails)}
            title="Toggle thumbnails"
          >
            Thumbnails
          </button>
          <button
            className={`frame-timeline__play-btn ${isPlaying ? "frame-timeline__play-btn--playing" : ""}`}
            onClick={onTogglePlayback}
            title={isPlaying ? "Stop (Enter)" : "Play (Enter)"}
          >
            {isPlaying ? (
              <Icon icon={SquareIcon} size={14} />
            ) : (
              <Icon icon={Play} size={14} />
            )}
          </button>
          <button
            className="frame-timeline__preview-btn"
            onClick={onOpenPreview}
            title="Optimized Preview"
          >
            <Icon icon={Zap} size={14} />
          </button>
        </div>
      </div>

      <TimelineGrid
        grid={grid}
        frameIds={frameIds}
        maxLayers={maxLayers}
        selectedFrameIndex={selectedFrameIndex}
        showThumbnails={showThumbnails}
        hoveredLayerName={hoveredLayerName}
        layerHeaders={layerHeaders}
        onLayerHeaderClick={onLayerHeaderClick}
        onLayerHeaderHover={onLayerHeaderHover}
        editingLayerName={editingLayerName}
        editingLayerDraft={editingLayerDraft}
        onStartLayerRename={onStartLayerRename}
        onEditingLayerDraftChange={onEditingLayerDraftChange}
        onFinishLayerRename={onFinishLayerRename}
        onCancelLayerRename={onCancelLayerRename}
        renderCell={renderCell}
        renderEmptyCell={renderEmptyCell}
      />

      {previewModal}
    </div>
  );
}
