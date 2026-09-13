/**
 * BrushListRow — one brush INSIDE a project (multi-brush plan, task 03;
 * MASTER D8).
 *
 * A thumbnail, the name (double-click → inline rename), a `W×H` badge and the
 * hover-revealed action strip: move up, move down, duplicate, delete. The
 * affordances are `BrushLayerPanel/BrushLayerRow.tsx`'s, minus everything a
 * brush does not have (visibility, channel, source, group).
 *
 * ── No `Brush` crosses this boundary ──────────────────────────────────────
 * The row takes a `BrushListRowModel`: id, name, size and a `draw` closure.
 * A `Brush` carries frames of pixel grids, and the rule that keeps `Layer`
 * out of `LayerRow` keeps it out of here — the container projects, and it
 * paints the thumbnail through `draw` (the `ThumbnailCanvas` contract).
 *
 * ── Display order is array order ──────────────────────────────────────────
 * Unlike the layer list, brushes are NOT reversed: index 0 is the top row, so
 * "up" is disabled at index 0 and "down" at `count - 1`.
 *
 * ── Delete never fires on the last brush ──────────────────────────────────
 * A project always has ≥ 1 brush (MASTER §1). The button is `disabled` with
 * an explanatory title when `count === 1`; `onDelete` is unreachable then.
 *
 * ── Local rename state, deliberately ──────────────────────────────────────
 * The draft is transient presentation state with a single consumer. Enter
 * and blur commit through `onRename` (never for an unchanged or empty
 * trimmed name); Escape cancels. Every action handler stops propagation so a
 * button press never doubles as a row select.
 *
 * `ui/` boundary: React, lucide, the `Icon` / `ThumbnailCanvas` primitives,
 * `classNames` and the stylesheet. No store, no MobX, no brush type.
 */
import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, X } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { ThumbnailCanvas } from "../../primitives/ThumbnailCanvas/ThumbnailCanvas";
import { classNames } from "../../classNames";
import "./BrushList.css";

/** Thumbnail edge in px — the same 32 the rail's other lists use. */
export const BRUSH_LIST_THUMB_SIZE = 32;

/** The flat projection of one brush, built by the container. */
export interface BrushListRowModel {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Paints this brush's thumbnail; `null` = no thumbnail (row shows name only). */
  draw: ((ctx: CanvasRenderingContext2D, size: number) => void) | null;
}

export interface BrushListRowProps {
  brush: BrushListRowModel;
  isSelected: boolean;
  /** Position in the displayed list (index 0 at the top). */
  index: number;
  /** Length of the list — the move-down and delete bounds. */
  count: number;
  /** Changes whenever any thumbnail's content changes. */
  thumbnailRevision: number;

  onSelect: (brushId: string) => void;
  onRename: (brushId: string, name: string) => void;
  onDuplicate: (brushId: string) => void;
  onDelete: (brushId: string) => void;
  onMoveUp: (brushId: string) => void;
  onMoveDown: (brushId: string) => void;
}

export function BrushListRow({
  brush,
  isSelected,
  index,
  count,
  thumbnailRevision,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: BrushListRowProps) {
  /** `null` = not renaming; a string = the draft in the input. */
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and Escape both remove the input; a blur that follows must not
  // commit (or re-commit) on their behalf.
  const skipBlurRef = useRef(false);
  // Focus and select on MOUNT only: the name is expected to be overtyped. A
  // stable callback, deliberately — an inline ref runs on every render, and
  // re-selecting after each keystroke would make the next one replace the
  // whole draft.
  const focusAndSelect = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const startRename = () => {
    skipBlurRef.current = false;
    setDraft(brush.name);
  };
  const finishRename = (commit: boolean) => {
    if (draft === null) return;
    const name = draft.trim();
    if (commit && name.length > 0 && name !== brush.name) {
      onRename(brush.id, name);
    }
    setDraft(null);
  };

  const isFirst = index === 0;
  const isLast = index === count - 1;
  const isOnly = count === 1;

  return (
    <div
      className={classNames(
        "brush-list__row",
        isSelected && "brush-list__row--selected",
      )}
      aria-current={isSelected ? "true" : undefined}
      onClick={() => onSelect(brush.id)}
    >
      {brush.draw && (
        <span className="brush-list__thumb">
          <ThumbnailCanvas
            size={BRUSH_LIST_THUMB_SIZE}
            revision={thumbnailRevision}
            draw={brush.draw}
            label={`${brush.name} preview`}
            className="brush-list__thumb-canvas"
          />
        </span>
      )}

      {draft !== null ? (
        <input
          ref={focusAndSelect}
          type="text"
          className="brush-list__rename-input"
          value={draft}
          aria-label="Brush name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (skipBlurRef.current) return;
            finishRename(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              skipBlurRef.current = true;
              finishRename(true);
            } else if (e.key === "Escape") {
              skipBlurRef.current = true;
              finishRename(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="brush-list__name"
          title={brush.name}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename();
          }}
        >
          {brush.name}
        </span>
      )}

      <span className="brush-list__size">
        {brush.width}×{brush.height}
      </span>

      <div className="brush-list__actions">
        <button
          type="button"
          className="brush-list__action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp(brush.id);
          }}
          disabled={isFirst}
          title="Move brush up"
          aria-label={`Move ${brush.name} up`}
        >
          <Icon icon={ChevronUp} size={10} />
        </button>
        <button
          type="button"
          className="brush-list__action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown(brush.id);
          }}
          disabled={isLast}
          title="Move brush down"
          aria-label={`Move ${brush.name} down`}
        >
          <Icon icon={ChevronDown} size={10} />
        </button>
        <button
          type="button"
          className="brush-list__action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(brush.id);
          }}
          title="Duplicate brush"
          aria-label={`Duplicate ${brush.name}`}
        >
          <Icon icon={Copy} size={10} />
        </button>
        <button
          type="button"
          className="brush-list__action-btn brush-list__action-btn--danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(brush.id);
          }}
          disabled={isOnly}
          title={isOnly ? "Cannot delete the last brush" : "Delete brush"}
          aria-label={`Delete ${brush.name}`}
        >
          <Icon icon={X} size={10} />
        </button>
      </div>
    </div>
  );
}
