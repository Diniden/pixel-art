import { useCallback, useRef, useState, type RefObject } from "react";

/**
 * useDragReorder — HTML5 drag-and-drop list reordering with a drop-position
 * indicator (task 19).
 *
 * Extracted from the measured clones: `FramesView.tsx:362-366,421-478,480-511`,
 * `VariantView.tsx:123-132,167-273,275-334` (duplicated TWICE inside that one
 * file) and `TimelineView.tsx:322-326,574-602` — ~265 duplicated lines. The
 * semantics are theirs:
 *
 * - Dragging item `id` over item `index` computes an INSERT index from the
 *   pointer's position relative to the item's midpoint (before / after),
 *   clamped to `[0, itemCount]`.
 * - Dragging over the list container past the last item's midpoint targets
 *   the end of the list.
 * - The indicator offset (px from the list's leading edge) is derived from
 *   the registered item elements — the same geometry as the legacy
 *   `indicatorLeft` computation, but computed inside the drag-over handlers
 *   rather than in a layout effect (item rects are stable mid-drag, and the
 *   React Compiler ruleset rightly rejects setState-in-effect in `ui/`).
 * - Drop calls `onReorder(draggedId, insertIndex)`; state always resets on
 *   drop/end.
 *
 * `axis` selects horizontal (frames timeline) or vertical lists.
 * Pure DOM/gesture logic — no store, no domain types; items are opaque ids.
 */

export type DragReorderAxis = "horizontal" | "vertical";

export interface UseDragReorderOptions {
  /** Number of items currently in the list. */
  itemCount: number;
  /** Called on a completed drop with the dragged id and the insert index. */
  onReorder: (draggedId: string, insertIndex: number) => void;
  /** Layout direction of the list. Default `"horizontal"`. */
  axis?: DragReorderAxis;
  /** The scrolling list container (for the indicator + end-of-list drops). */
  listRef: RefObject<HTMLElement | null>;
}

export interface UseDragReorderResult {
  /** Id currently being dragged, or null. */
  dragId: string | null;
  /** Insert index the drop would use, or null when no drop is pending. */
  dropInsertIndex: number | null;
  /** Indicator offset in px from the list's leading edge, or null to hide. */
  indicatorOffset: number | null;
  /** Register item element `index` (pass as a ref callback). */
  registerItem: (index: number) => (el: HTMLElement | null) => void;
  /** Attach to each item's `onDragStart` with its id. */
  onItemDragStart: (e: React.DragEvent, id: string) => void;
  /** Attach to each item's `onDragOver` with its index. */
  onItemDragOver: (e: React.DragEvent, index: number) => void;
  /** Attach to each item's `onDragLeave`. */
  onItemDragLeave: () => void;
  /** Attach to the list container's `onDragOver` (end-of-list drops). */
  onListDragOver: (e: React.DragEvent) => void;
  /** Attach to the item's / container's `onDrop`. */
  onDrop: (e: React.DragEvent) => void;
  /** Attach to each item's `onDragEnd`. */
  onDragEnd: () => void;
}

export function useDragReorder({
  itemCount,
  onReorder,
  axis = "horizontal",
  listRef,
}: UseDragReorderOptions): UseDragReorderResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const [indicatorOffset, setIndicatorOffset] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const horizontal = axis === "horizontal";

  const registerItem = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    [],
  );

  const onItemDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }, []);

  /** The legacy `indicatorLeft` geometry, generalised over both axes. */
  const computeIndicatorOffset = useCallback(
    (insertIndex: number): number | null => {
      const list = listRef.current;
      if (!list) return null;
      const listRect = list.getBoundingClientRect();
      const listStart = horizontal ? listRect.left : listRect.top;
      const n = itemCount;
      if (n === 0) return null;

      const startOf = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return horizontal ? r.left : r.top;
      };
      const endOf = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return horizontal ? r.right : r.bottom;
      };

      if (insertIndex === 0) {
        const first = itemRefs.current[0];
        return first ? startOf(first) - listStart : 0;
      }
      if (insertIndex >= n) {
        const last = itemRefs.current[n - 1];
        return last
          ? endOf(last) - listStart
          : horizontal
            ? listRect.width
            : listRect.height;
      }
      const before = itemRefs.current[insertIndex - 1];
      const after = itemRefs.current[insertIndex];
      if (!before || !after) return null;
      return (endOf(before) + startOf(after)) / 2 - listStart;
    },
    [horizontal, itemCount, listRef],
  );

  const applyInsertIndex = useCallback(
    (insertIndex: number) => {
      const clamped = Math.max(0, Math.min(itemCount, insertIndex));
      setDropInsertIndex(clamped);
      setIndicatorOffset(computeIndicatorOffset(clamped));
    },
    [itemCount, computeIndicatorOffset],
  );

  const onItemDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const el = itemRefs.current[index];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pointer = horizontal ? e.clientX : e.clientY;
      const mid = horizontal
        ? rect.left + rect.width / 2
        : rect.top + rect.height / 2;
      applyInsertIndex(pointer < mid ? index : index + 1);
    },
    [horizontal, applyInsertIndex],
  );

  const onItemDragLeave = useCallback(() => {
    setDropInsertIndex(null);
    setIndicatorOffset(null);
  }, []);

  /** Dragging over empty space after the last item targets the list end. */
  const onListDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragId || itemCount === 0) return;
      const lastEl = itemRefs.current[itemCount - 1];
      if (!lastEl) return;
      const rect = lastEl.getBoundingClientRect();
      const pointer = horizontal ? e.clientX : e.clientY;
      const mid = horizontal
        ? rect.left + rect.width / 2
        : rect.top + rect.height / 2;
      if (pointer >= mid) applyInsertIndex(itemCount);
    },
    [dragId, horizontal, itemCount, applyInsertIndex],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragId != null && dropInsertIndex != null) {
        onReorder(dragId, dropInsertIndex);
      }
      setDragId(null);
      setDropInsertIndex(null);
      setIndicatorOffset(null);
    },
    [dragId, dropInsertIndex, onReorder],
  );

  const onDragEnd = useCallback(() => {
    setDragId(null);
    setDropInsertIndex(null);
    setIndicatorOffset(null);
  }, []);

  return {
    dragId,
    dropInsertIndex,
    indicatorOffset,
    registerItem,
    onItemDragStart,
    onItemDragOver,
    onItemDragLeave,
    onListDragOver,
    onDrop,
    onDragEnd,
  };
}

export default useDragReorder;
