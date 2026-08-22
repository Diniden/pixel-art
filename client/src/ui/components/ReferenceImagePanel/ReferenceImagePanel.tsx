import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../../primitives/Icon/Icon';
import { Camera, ChevronUp, ChevronDown, Target } from 'lucide-react';
import type { ReferenceImageData } from '../../../types/referenceImage';
import './ReferenceImagePanel.css';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TASK 29: THIS PANEL NO LONGER MUTATES A MODAL'S MODULE-LEVEL SINGLETON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * All 16 nudge/resize buttons below used to import three functions FROM
 * `ReferenceImageModal.tsx` and call them directly. Those functions mutated a
 * module-level object shared with the modal, which meant this panel and that
 * modal communicated through a global with no reactivity at all — mutating it
 * re-rendered nothing, so every handler had to thread the returned
 * `ReferenceImageData` back up through `onReferenceImageChange` by hand.
 *
 * The three are now `ReferenceUIStore` actions, delivered as the three
 * callbacks below. The hand-threading REMAINS, deliberately: extracting pixels
 * is a canvas read-back, so the data is still pulled rather than observed. What
 * is gone is the shared mutable module state.
 *
 * ⚠️ The component is now pure presentation — it imports no store (task 29
 * deletes its legacy Zustand-hook call). `ReferenceImagePanelContainer` supplies
 * every value below.
 */
interface ReferenceImagePanelProps {
  referenceImage: ReferenceImageData | null;
  onReferenceImageChange: (data: ReferenceImageData | null) => void;
  isReferenceTraceActive: boolean;
  zoom: number;
  /**
   * ⚠️ NOT mirrored into local `useState` (task 29 constraint: the duplicate is
   * DELETED, not migrated). It was `useState(project?.uiState...)` plus a
   * `useEffect` that re-synced it — a copy that could disagree with the store
   * for one render. Reading the prop directly removes both.
   */
  isMinimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  /** The persisted position, as percentages of the canvas area. */
  persistedPosition: { topPercent: number; leftPercent: number } | undefined;
  onPositionChange: (position: { topPercent: number; leftPercent: number }) => void;
  onSelectTool: (tool: 'pixel' | 'reference-trace') => void;
  /** `ReferenceUIStore.adjustBoxSize` — was `adjustReferenceBoxSize`. */
  onAdjustBoxSize: (
    direction: 'up' | 'down' | 'left' | 'right',
    increase: boolean,
  ) => ReferenceImageData | null;
  /** `ReferenceUIStore.shiftSelection` — was `shiftReferenceSelection`. */
  onShiftSelection: (dx: number, dy: number) => ReferenceImageData | null;
  /** `ReferenceUIStore.shiftSelectionBySize` — was `shiftReferenceSelectionBySize`. */
  onShiftSelectionBySize: (
    dx: number,
    dy: number,
    width: number,
    height: number,
  ) => ReferenceImageData | null;
}

export function ReferenceImagePanel({
  referenceImage,
  onReferenceImageChange,
  isReferenceTraceActive,
  zoom,
  isMinimized,
  onMinimizedChange,
  persistedPosition,
  onPositionChange,
  onSelectTool,
  onAdjustBoxSize,
  onShiftSelection,
  onShiftSelectionBySize,
}: ReferenceImagePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  /**
   * ⚠️ `position` (PIXELS) is NOT the deleted mirror. The deleted duplicate was
   * `isMinimized`; this one is a genuine DERIVED value — the persisted form is
   * a percentage of the canvas area and must be recomputed against live element
   * bounds on mount and on resize. It is local because it is a measurement, not
   * a copy of store state.
   */
  const [position, setPosition] = useState({ top: 20, left: 20 });

  // Helper to convert percentage to pixels
  const percentageToPixels = useCallback((percentPos: { topPercent: number; leftPercent: number } | undefined) => {
    const canvasArea = document.querySelector('.canvas-area');
    if (!canvasArea || !panelRef.current || !percentPos) {
      return { top: 20, left: 20 };
    }

    const canvasRect = canvasArea.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();

    const maxLeft = canvasRect.width - panelRect.width;
    const maxTop = canvasRect.height - panelRect.height;

    return {
      top: Math.max(0, Math.min(maxTop, (percentPos.topPercent / 100) * canvasRect.height)),
      left: Math.max(0, Math.min(maxLeft, (percentPos.leftPercent / 100) * canvasRect.width))
    };
  }, []);

  // Helper to convert pixels to percentage
  const pixelsToPercentage = useCallback((pixelPos: { top: number; left: number }) => {
    const canvasArea = document.querySelector('.canvas-area');
    if (!canvasArea) {
      return { topPercent: 0, leftPercent: 0 };
    }

    const canvasRect = canvasArea.getBoundingClientRect();
    return {
      topPercent: (pixelPos.top / canvasRect.height) * 100,
      leftPercent: (pixelPos.left / canvasRect.width) * 100
    };
  }, []);

  // Initialize position from project
  useEffect(() => {
    if (persistedPosition) {
      requestAnimationFrame(() => {
        const pixelPos = percentageToPixels(persistedPosition);
        setPosition(pixelPos);
      });
    }
  }, [persistedPosition, percentageToPixels]);

  /* The "sync minimized state" effect that used to sit here is DELETED — the
   * value is a prop now, so there is nothing to sync. */

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      if (persistedPosition) {
        const pixelPos = percentageToPixels(persistedPosition);
        setPosition(pixelPos);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [persistedPosition, percentageToPixels]);

  // Render the reference image
  useEffect(() => {
    if (isMinimized || !referenceImage) return;

    const frameId = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: false });
      if (!canvas || !ctx || !referenceImage) return;

      const displayWidth = referenceImage.width * zoom;
      const displayHeight = referenceImage.height * zoom;
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      ctx.imageSmoothingEnabled = false;

      // Draw pixels
      for (let y = 0; y < referenceImage.height; y++) {
        for (let x = 0; x < referenceImage.width; x++) {
          const pixel = referenceImage.pixels[y][x];
          // Elements are typed `{r,g,b,a} | 0`, so the truthiness check already
          // excludes the `0` sentinel; the former `pixel !== 0` arm was
          // unreachable and is dropped. No behaviour change.
          if (pixel) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [referenceImage, zoom, isMinimized]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.reference-image-panel__minimize')) {
      return;
    }

    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvasArea = document.querySelector('.canvas-area');
      if (!canvasArea || !panelRef.current) return;

      const canvasRect = canvasArea.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();

      let newLeft = e.clientX - canvasRect.left - dragStart.x;
      let newTop = e.clientY - canvasRect.top - dragStart.y;

      const maxLeft = canvasRect.width - panelRect.width;
      const maxTop = canvasRect.height - panelRect.height;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      setPosition({ top: newTop, left: newLeft });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (panelRef.current) {
        const canvasArea = document.querySelector('.canvas-area');
        if (canvasArea) {
          const canvasRect = canvasArea.getBoundingClientRect();
          const panelRect = panelRef.current.getBoundingClientRect();
          const finalPixelPosition = {
            top: panelRect.top - canvasRect.top,
            left: panelRect.left - canvasRect.left
          };
          const percentPosition = pixelsToPercentage(finalPixelPosition);
          onPositionChange(percentPosition);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, onPositionChange, pixelsToPercentage]);

  if (!referenceImage) return null;

  return (
    <div
      ref={panelRef}
      className={`reference-image-panel ${isMinimized ? 'reference-image-panel--minimized' : ''} ${isDragging ? 'reference-image-panel--dragging' : ''}`}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div
        className="reference-image-panel__header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <span className="reference-image-panel__title">
          <Icon icon={Camera} size={12} /> Reference Image
        </span>
        <button
          className="reference-image-panel__minimize"
          onClick={(e) => {
            e.stopPropagation();
            onMinimizedChange(!isMinimized);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          <Icon icon={isMinimized ? ChevronUp : ChevronDown} size={12} />
        </button>
      </div>

      {!isMinimized && (
        <div className="reference-image-panel__body">
          <div className="reference-image-panel__preview">
            <div className="reference-image-panel__frame">
              {/* Reference box adjustment buttons */}
              {!isReferenceTraceActive && onReferenceImageChange && (
                <>
                  {/* Top buttons - Up adjustments */}
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--top-increase"
                    onClick={() => {
                      const newData = onAdjustBoxSize('up', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Up"
                  >
                    ↑
                  </button>
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--top-decrease"
                    onClick={() => {
                      const newData = onAdjustBoxSize('up', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Up"
                  >
                    ↓
                  </button>

                  {/* Bottom buttons - Down adjustments */}
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--bottom-increase"
                    onClick={() => {
                      const newData = onAdjustBoxSize('down', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Down"
                  >
                    ↓
                  </button>
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--bottom-decrease"
                    onClick={() => {
                      const newData = onAdjustBoxSize('down', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Down"
                  >
                    ↑
                  </button>

                  {/* Left buttons - Left adjustments */}
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--left-increase"
                    onClick={() => {
                      const newData = onAdjustBoxSize('left', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Left"
                  >
                    ←
                  </button>
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--left-decrease"
                    onClick={() => {
                      const newData = onAdjustBoxSize('left', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Left"
                  >
                    →
                  </button>

                  {/* Right buttons - Right adjustments */}
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--right-increase"
                    onClick={() => {
                      const newData = onAdjustBoxSize('right', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Right"
                  >
                    →
                  </button>
                  <button
                    className="reference-image-panel__box-btn reference-image-panel__box-btn--right-decrease"
                    onClick={() => {
                      const newData = onAdjustBoxSize('right', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Right"
                  >
                    ←
                  </button>
                </>
              )}
              <canvas ref={canvasRef} />
            </div>
          </div>

          <div className="reference-image-panel__info">
            {referenceImage.width} × {referenceImage.height}px
          </div>

          {/* Navigation buttons */}
          {onReferenceImageChange && (
            <div className="reference-image-panel__nav">
              <div className="reference-image-panel__nav-group">
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelection(-1, 0);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Left"
                >
                  ←
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelection(1, 0);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Right"
                >
                  →
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelectionBySize(-1, 0, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Left"
                >
                  ⇇
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelectionBySize(1, 0, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Right"
                >
                  ⇉
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelection(0, -1);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Up"
                >
                  ↑
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelection(0, 1);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Down"
                >
                  ↓
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelectionBySize(0, -1, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Up"
                >
                  ⇈
                </button>
                <button
                  className="reference-image-panel__nav-btn"
                  onClick={() => {
                    const newData = onShiftSelectionBySize(0, 1, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Down"
                >
                  ⇊
                </button>
              </div>
              <button
                className={`reference-image-panel__trace-btn ${isReferenceTraceActive ? 'reference-image-panel__trace-btn--active' : ''}`}
                onClick={() => {
                  // Toggle trace mode: if already active, switch to pixel tool
                  if (isReferenceTraceActive) {
                    onSelectTool('pixel');
                  } else {
                    onSelectTool('reference-trace');
                  }
                }}
                title="Trace Reference (WASD to align, click to copy)"
              >
                <Icon icon={Target} size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

