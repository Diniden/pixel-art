import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * useFloatingPanel — drag + %-position persistence for floating panels
 * (task 19).
 *
 * Extracted from the three measured clones: `LightingCanvas.tsx:713-835`,
 * `FrameReferencePanel.tsx:32-102,272-323` and
 * `ReferenceImagePanel.tsx:32-94,130-191` (~120 duplicated lines). The
 * behaviour is theirs, verbatim in spirit:
 *
 * - The panel's position is PERSISTED as percentages of the container
 *   (`{ topPercent, leftPercent }`) and RENDERED as pixels, so it survives
 *   container resizes proportionally.
 * - While dragging, the position is clamped so the panel stays fully inside
 *   the container.
 * - On mouse-up the final pixel position is converted back to percentages and
 *   handed to `onPositionCommit` — persistence itself is the CALLER'S job.
 *
 * ⚠️ THE THREE PANELS PERSIST TO THREE DIFFERENT `uiState` KEYS
 * (`frameReferencePanelPosition`, `referenceImagePanelPosition`,
 * `lightingPreviewPanelPosition`). This hook is pure and store-free, so the
 * key never appears here — it lives entirely in the container that supplies
 * `position` / `onPositionCommit`. That is the task's "takes the key as a
 * parameter" requirement enforced by construction: a pure hook physically
 * cannot unify the keys, which the spec calls out as a bug.
 */

export interface PercentPosition {
  topPercent: number;
  leftPercent: number;
}

export interface PixelPosition {
  top: number;
  left: number;
}

export interface UseFloatingPanelOptions {
  /** The element the panel floats INSIDE (its positioning context). */
  containerRef: RefObject<HTMLElement | null>;
  /** The floating panel element itself. */
  panelRef: RefObject<HTMLElement | null>;
  /** Persisted position, if any. `undefined` falls back to `initialPosition`. */
  position?: PercentPosition | undefined;
  /**
   * Called once per completed drag with the final percent position.
   * The caller persists it under ITS key (see the header comment).
   */
  onPositionCommit?: ((position: PercentPosition) => void) | undefined;
  /** Pixel position used before any persisted position exists. */
  initialPosition?: PixelPosition;
  /**
   * CSS selector for elements inside the drag handle that must NOT start a
   * drag (e.g. the minimise button). Mirrors the legacy
   * `closest(".lighting-canvas__preview-minimize")` guard.
   */
  dragExcludeSelector?: string | undefined;
}

export interface UseFloatingPanelResult {
  /** Pixel position to render (`style={{ top, left }}`). */
  position: PixelPosition;
  /** True while a drag is in progress. */
  isDragging: boolean;
  /** Attach to the drag handle's `onMouseDown`. */
  onHandleMouseDown: (e: React.MouseEvent) => void;
}

export function useFloatingPanel({
  containerRef,
  panelRef,
  position,
  onPositionCommit,
  initialPosition = { top: 20, left: 20 },
  dragExcludeSelector,
}: UseFloatingPanelOptions): UseFloatingPanelResult {
  const { top: initialTop, left: initialLeft } = initialPosition;
  const [pixelPosition, setPixelPosition] = useState<PixelPosition>({
    top: initialTop,
    left: initialLeft,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const percentageToPixels = useCallback(
    (percentPos: PercentPosition | undefined): PixelPosition => {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel || !percentPos)
        return { top: initialTop, left: initialLeft };
      const containerRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const maxLeft = containerRect.width - panelRect.width;
      const maxTop = containerRect.height - panelRect.height;
      return {
        top: Math.max(
          0,
          Math.min(maxTop, (percentPos.topPercent / 100) * containerRect.height),
        ),
        left: Math.max(
          0,
          Math.min(maxLeft, (percentPos.leftPercent / 100) * containerRect.width),
        ),
      };
    },
    [containerRef, panelRef, initialTop, initialLeft],
  );

  const pixelsToPercentage = useCallback(
    (pixelPos: PixelPosition): PercentPosition => {
      const container = containerRef.current;
      if (!container) return { topPercent: 0, leftPercent: 0 };
      const containerRect = container.getBoundingClientRect();
      return {
        topPercent: (pixelPos.top / containerRect.height) * 100,
        leftPercent: (pixelPos.left / containerRect.width) * 100,
      };
    },
    [containerRef],
  );

  // Apply the persisted position on mount / whenever it changes. rAF matches
  // the legacy behaviour: the panel must have laid out before it is measured.
  useEffect(() => {
    if (!position) return;
    const raf = requestAnimationFrame(() => {
      setPixelPosition(percentageToPixels(position));
    });
    return () => cancelAnimationFrame(raf);
  }, [position, percentageToPixels]);

  // Re-derive the pixel position when the window resizes, keeping the
  // percent-of-container placement.
  useEffect(() => {
    const handleResize = () => {
      if (position) setPixelPosition(percentageToPixels(position));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position, percentageToPixels]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return;
      const containerRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      let newLeft = e.clientX - containerRect.left - dragStart.x;
      let newTop = e.clientY - containerRect.top - dragStart.y;
      const maxLeft = containerRect.width - panelRect.width;
      const maxTop = containerRect.height - panelRect.height;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      setPixelPosition({ top: newTop, left: newLeft });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return;
      const containerRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const finalPixelPosition = {
        top: panelRect.top - containerRect.top,
        left: panelRect.left - containerRect.left,
      };
      onPositionCommit?.(pixelsToPercentage(finalPixelPosition));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    dragStart,
    containerRef,
    panelRef,
    pixelsToPercentage,
    onPositionCommit,
  ]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (
        dragExcludeSelector &&
        e.target instanceof HTMLElement &&
        e.target.closest(dragExcludeSelector)
      ) {
        return;
      }
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [dragExcludeSelector, panelRef],
  );

  return { position: pixelPosition, isDragging, onHandleMouseDown };
}

export default useFloatingPanel;
