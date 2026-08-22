/**
 * FrameReferencePanel — PURE (REFRESH task 36, W27).
 *
 * Task 29 already removed its local `isMinimized`/`position` mirrors; task 36
 * removes the remaining 9 store reads.
 *
 * ⚠️ The panel keeps its OWN persistence keys
 * (`frameReferencePanelMinimized` / `frameReferencePanelPosition`). The three
 * floating panels are deliberately NOT unified — that is a standing task-29
 * constraint restated by this task's spec, and merging them would make all
 * three share one position.
 *
 * ⚠️ `objectSelectModal` is a RENDER PROP: it is `ObjectSelectModalContainer`,
 * and `ui/` may not import a container without dragging MobX across the
 * purity boundary transitively.
 */
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { PixelObject, VariantGroup } from "../../../types";
import { renderFramePreview } from "../../../utils/previewRenderer";
import { Icon } from "../../primitives/Icon/Icon";
import {
  Film,
  Package,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Target,
} from "lucide-react";
import "./FrameReferencePanel.css";

interface FrameReferencePanelProps {
  onOverlayChange: (frameIndex: number | null) => void;
  overlayFrameIndex: number | null;
  /** Owned by `ViewportUIStore.panels.frameReference` — see the note below. */
  frameReferencePanelMinimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;

  /** The object the timeline is editing. */
  currentObject: PixelObject | null;
  /** The object being referenced, when it differs from `currentObject`. */
  referenceObject: PixelObject | null;
  /** Project-level variants, for the preview renderer. */
  variants: VariantGroup[] | undefined;
  /** `uiState.selectedFrameId`, to locate the current frame. */
  selectedFrameId: string | null;
  /** Persisted panel position, as percentages. Own key — do not unify. */
  panelPosition: { topPercent: number; leftPercent: number } | undefined;
  onPanelPositionChange: (pos: {
    topPercent: number;
    leftPercent: number;
  }) => void;
  /** Frame-trace state. */
  frameTraceActive: boolean;
  frameTraceFrameIndex: number | null;
  onFrameTraceActiveChange: (
    active: boolean,
    frameIndex?: number | null,
  ) => void;
  /** The referenced object's id, or null when referencing the current object. */
  frameReferenceObjectId: string | null;
  onFrameReferenceObjectIdChange: (objectId: string | null) => void;
  /** `ObjectSelectModalContainer` with the supplied wiring. */
  objectSelectModal: (props: {
    selectedObjectId: string | null;
    onSelect: (objectId: string | null) => void;
    onClose: () => void;
  }) => ReactNode;
}

export function FrameReferencePanel({
  onOverlayChange,
  overlayFrameIndex,
  frameReferencePanelMinimized,
  onMinimizedChange,
  currentObject,
  referenceObject,
  variants,
  selectedFrameId,
  panelPosition,
  onPanelPositionChange,
  frameTraceActive,
  frameTraceFrameIndex,
  onFrameTraceActiveChange,
  frameReferenceObjectId,
  onFrameReferenceObjectIdChange,
  objectSelectModal,
}: FrameReferencePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [referenceFrameIndex, setReferenceFrameIndex] = useState(0); // Absolute frame index for the reference object
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showObjectSelect, setShowObjectSelect] = useState(false);

  /**
   * ⚠️ TASK 29: the local `isMinimized` MIRROR IS DELETED, not migrated.
   *
   * It was `useState(project?.uiState.frameReferencePanelMinimized ?? false)`
   * plus a `useEffect` that re-synced it from the store — a duplicate that
   * disagreed with the store for one render after every external change. The
   * value is a prop now, so there is exactly one copy and nothing to sync.
   *
   * ⚠️ This panel keeps its OWN persistence keys
   * (`frameReferencePanelMinimized` / `frameReferencePanelPosition`) — the
   * three floating panels are deliberately NOT unified (task 29 constraint).
   */
  const isMinimized = frameReferencePanelMinimized;
  const [position, setPosition] = useState({ top: 20, left: 20 }); // Position in pixels (for rendering)

  // Helper to convert percentage to pixels
  const percentageToPixels = useCallback(
    (percentPos: { topPercent: number; leftPercent: number } | undefined) => {
      const canvasArea = document.querySelector(".canvas-area");
      if (!canvasArea || !panelRef.current || !percentPos) {
        return { top: 20, left: 20 }; // Default fallback
      }

      const canvasRect = canvasArea.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();

      const maxLeft = canvasRect.width - panelRect.width;
      const maxTop = canvasRect.height - panelRect.height;

      return {
        top: Math.max(
          0,
          Math.min(maxTop, (percentPos.topPercent / 100) * canvasRect.height),
        ),
        left: Math.max(
          0,
          Math.min(maxLeft, (percentPos.leftPercent / 100) * canvasRect.width),
        ),
      };
    },
    [],
  );

  // Helper to convert pixels to percentage
  const pixelsToPercentage = useCallback(
    (pixelPos: { top: number; left: number }) => {
      const canvasArea = document.querySelector(".canvas-area");
      if (!canvasArea) {
        return { topPercent: 0, leftPercent: 0 };
      }

      const canvasRect = canvasArea.getBoundingClientRect();
      return {
        topPercent: (pixelPos.top / canvasRect.height) * 100,
        leftPercent: (pixelPos.left / canvasRect.width) * 100,
      };
    },
    [],
  );

  // Initialize position from project (convert percentage to pixels)
  useEffect(() => {
    const percentPos = panelPosition;
    if (percentPos) {
      // Use requestAnimationFrame to ensure canvas area is rendered
      requestAnimationFrame(() => {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      });
    }
  }, [panelPosition, percentageToPixels]);

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      const percentPos = panelPosition;
      if (percentPos) {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [panelPosition, percentageToPixels]);

  const currentObj = currentObject;
  const referenceObj = referenceObject;

  // Determine if we're referencing a different object
  const isReferencingDifferentObject =
    frameReferenceObjectId !== null &&
    frameReferenceObjectId !== currentObj?.id;

  // The object to show frames from
  const displayObj = referenceObj;

  // Clamp frame index when object changes
  useEffect(() => {
    if (displayObj && referenceFrameIndex >= displayObj.frames.length) {
      setReferenceFrameIndex(Math.max(0, displayObj.frames.length - 1));
    }
  }, [displayObj, referenceFrameIndex]);

  // Reset frame index when reference object changes
  useEffect(() => {
    setReferenceFrameIndex(0);
  }, [frameReferenceObjectId]);

  if (!displayObj || !currentObj) return null;

  // Current frame index (timeline selection) for same-object comparison and "go to current"
  const rawCurrentIndex = currentObj.frames.findIndex(
    (f) => f.id === (selectedFrameId ?? ""),
  );
  const currentFrameIndex = rawCurrentIndex >= 0 ? rawCurrentIndex : 0;

  // Get the reference frame
  const isValidReference =
    referenceFrameIndex >= 0 && referenceFrameIndex < displayObj.frames.length;
  const referenceFrame = isValidReference
    ? displayObj.frames[referenceFrameIndex]
    : null;

  const gridWidth = displayObj.gridSize.width;
  const gridHeight = displayObj.gridSize.height;
  const thumbSize = 200; // Fixed size for preview

  // Render the reference frame using the same renderer as thumbnails
  useEffect(() => {
    // Don't render if minimized (canvas isn't in DOM)
    if (isMinimized) return;

    // Use requestAnimationFrame to ensure canvas is mounted in DOM
    const frameId = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: false });
      if (!canvas || !ctx || !referenceFrame) return;

      canvas.width = thumbSize;
      canvas.height = thumbSize;

      // Calculate variant frame indices for the reference frame

      let variantFrameIndices: { [key: string]: number } | undefined;

      if (variants && referenceFrame) {
        // Calculate static indices based on frame position
        // We need to check which variant is actually selected in each layer
        variantFrameIndices = {};

        // First, collect all variant groups that are used in this frame's layers
        const variantGroupsInFrame = new Set<string>();
        for (const layer of referenceFrame.layers) {
          if (
            layer.isVariant &&
            layer.variantGroupId &&
            layer.selectedVariantId
          ) {
            variantGroupsInFrame.add(layer.variantGroupId);
          }
        }

        // For each variant group used in this frame, calculate the frame index
        // based on the selected variant's frame count
        for (const vg of variants) {
          if (!variantGroupsInFrame.has(vg.id)) continue;

          // Find the selected variant in this frame's layers
          let selectedVariant = null;
          for (const layer of referenceFrame.layers) {
            if (
              layer.isVariant &&
              layer.variantGroupId === vg.id &&
              layer.selectedVariantId
            ) {
              selectedVariant = vg.variants.find(
                (v) => v.id === layer.selectedVariantId,
              );
              if (selectedVariant) break;
            }
          }

          // If we found a selected variant, use its frame count
          if (selectedVariant && selectedVariant.frames.length > 0) {
            // Use frame index modulo variant frame count to determine which variant frame to show
            variantFrameIndices[vg.id] =
              referenceFrameIndex % selectedVariant.frames.length;
          }
        }
      }

      renderFramePreview(ctx, {
        thumbSize,
        gridWidth,
        gridHeight,
        frame: referenceFrame,
        frameIndex: referenceFrameIndex,
        variants,
        variantFrameIndices,
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    referenceFrame,
    gridWidth,
    gridHeight,
    thumbSize,
    variants,
    referenceFrameIndex,
    isMinimized,
  ]);

  const handlePrevious = () => {
    if (referenceFrameIndex > 0) {
      setReferenceFrameIndex(referenceFrameIndex - 1);
    }
  };

  const handleNext = () => {
    if (referenceFrameIndex + 1 < displayObj.frames.length) {
      setReferenceFrameIndex(referenceFrameIndex + 1);
    }
  };

  const handleToggleOverlay = () => {
    if (overlayFrameIndex === referenceFrameIndex) {
      // Turn off overlay
      onOverlayChange(null);
    } else if (isValidReference) {
      // Turn on overlay for this frame
      onOverlayChange(referenceFrameIndex);
      // Also turn off trace mode if it's active
      if (frameTraceActive) {
        onFrameTraceActiveChange(false, null);
      }
    }
  };

  const handleToggleTrace = () => {
    if (frameTraceActive && frameTraceFrameIndex === referenceFrameIndex) {
      // Turn off trace mode
      onFrameTraceActiveChange(false, null);
    } else if (isValidReference) {
      // Turn on trace mode for this frame
      onFrameTraceActiveChange(true, referenceFrameIndex);
      // Also turn off overlay if it's active (for any frame, not just this one)
      if (overlayFrameIndex !== null) {
        onOverlayChange(null);
      }
    }
  };

  const isOverlayActive = overlayFrameIndex === referenceFrameIndex;
  const isTraceActive =
    frameTraceActive && frameTraceFrameIndex === referenceFrameIndex;

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on the minimize button or object select button
    if (
      (e.target as HTMLElement).closest(".frame-reference-panel__minimize") ||
      (e.target as HTMLElement).closest(".frame-reference-panel__object-btn")
    ) {
      return;
    }

    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvasArea = document.querySelector(".canvas-area");
      if (!canvasArea || !panelRef.current) return;

      const canvasRect = canvasArea.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();

      // Calculate new position relative to canvas area
      let newLeft = e.clientX - canvasRect.left - dragStart.x;
      let newTop = e.clientY - canvasRect.top - dragStart.y;

      // Constrain to canvas area bounds
      const maxLeft = canvasRect.width - panelRect.width;
      const maxTop = canvasRect.height - panelRect.height;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      const newPosition = { top: newTop, left: newLeft };
      setPosition(newPosition);
      // Don't save on every move - save when drag ends instead
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Save position as percentage when dragging ends
      if (panelRef.current) {
        const canvasArea = document.querySelector(".canvas-area");
        if (canvasArea) {
          const canvasRect = canvasArea.getBoundingClientRect();
          const panelRect = panelRef.current.getBoundingClientRect();
          const finalPixelPosition = {
            top: panelRect.top - canvasRect.top,
            left: panelRect.left - canvasRect.left,
          };
          // Convert to percentage and save
          const percentPosition = pixelsToPercentage(finalPixelPosition);
          onPanelPositionChange(percentPosition);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, onPanelPositionChange, pixelsToPercentage]);

  const handleGoToCurrentFrame = () => {
    const target = Math.min(
      Math.max(0, currentFrameIndex),
      displayObj.frames.length - 1,
    );
    setReferenceFrameIndex(target);
  };

  // Frames ahead/behind: positive = reference is ahead of timeline, negative = behind
  const frameDelta = referenceFrameIndex - currentFrameIndex;
  const framesAheadBehindLabel =
    frameDelta === 0
      ? "Current frame"
      : frameDelta > 0
        ? `${frameDelta} frame${frameDelta === 1 ? "" : "s"} ahead`
        : `${-frameDelta} frame${-frameDelta === 1 ? "" : "s"} behind`;

  return (
    <>
      <div
        ref={panelRef}
        className={`frame-reference-panel ${isMinimized ? "frame-reference-panel--minimized" : ""} ${isDragging ? "frame-reference-panel--dragging" : ""} ${isReferencingDifferentObject ? "frame-reference-panel--foreign-object" : ""}`}
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div
          className="frame-reference-panel__header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <span className="frame-reference-panel__title">
            <Icon icon={Film} size={12} /> Frame Reference
          </span>
          <button
            className="frame-reference-panel__object-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowObjectSelect(true);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Select reference object"
          >
            <Icon icon={Package} size={12} />
          </button>
          <button
            className="frame-reference-panel__minimize"
            onClick={(e) => {
              e.stopPropagation();
              onMinimizedChange(!isMinimized);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title={isMinimized ? "Expand" : "Minimize"}
          >
            <Icon icon={isMinimized ? ChevronUp : ChevronDown} size={12} />
          </button>
        </div>

        {!isMinimized && (
          <div className="frame-reference-panel__content">
            {/* Show which object we're referencing */}
            {isReferencingDifferentObject && (
              <div className="frame-reference-panel__object-info">
                <span className="frame-reference-panel__object-label">
                  Viewing:
                </span>
                <span className="frame-reference-panel__object-name">
                  {displayObj.name}
                </span>
              </div>
            )}

            <div className="frame-reference-panel__controls">
              <button
                className="frame-reference-panel__btn"
                onClick={handlePrevious}
                disabled={referenceFrameIndex <= 0}
                title="Previous frame"
              >
                <Icon icon={ChevronLeft} size={14} />
              </button>
              <div className="frame-reference-panel__info">
                {isValidReference ? (
                  <>
                    <span className="frame-reference-panel__number">
                      Frame {referenceFrameIndex + 1}
                    </span>
                    <span className="frame-reference-panel__name">
                      {referenceFrame?.name || "Unnamed"}
                    </span>
                    <span className="frame-reference-panel__index">
                      {displayObj.frames.length} total
                    </span>
                  </>
                ) : (
                  <span className="frame-reference-panel__invalid">
                    No frame
                  </span>
                )}
              </div>
              <button
                className="frame-reference-panel__btn"
                onClick={handleNext}
                disabled={referenceFrameIndex + 1 >= displayObj.frames.length}
                title="Next frame"
              >
                <Icon icon={ChevronRight} size={14} />
              </button>
            </div>

            {/* Frames ahead/behind indicator and Go to current frame */}
            <div className="frame-reference-panel__sync-row">
              <span
                className="frame-reference-panel__ahead-behind"
                title="Relative to timeline"
              >
                {framesAheadBehindLabel}
              </span>
              <button
                className="frame-reference-panel__go-current-btn"
                onClick={handleGoToCurrentFrame}
                disabled={frameDelta === 0}
                title="Sync to current frame"
              >
                Go to current
              </button>
            </div>

            {isValidReference && referenceFrame && (
              <>
                <div className="frame-reference-panel__preview">
                  <canvas
                    ref={canvasRef}
                    width={thumbSize}
                    height={thumbSize}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                  <button
                    className={`frame-reference-panel__overlay-btn ${isOverlayActive ? "frame-reference-panel__overlay-btn--active" : ""}`}
                    onClick={handleToggleOverlay}
                    title={
                      isOverlayActive
                        ? "Hide overlay"
                        : "Show overlay on canvas"
                    }
                    style={{ flex: 1 }}
                  >
                    <Icon icon={isOverlayActive ? EyeOff : Eye} size={14} />{" "}
                    {isOverlayActive ? "Hide Overlay" : "Show Overlay"}
                  </button>
                  <button
                    className={`frame-reference-panel__trace-btn ${isTraceActive ? "frame-reference-panel__trace-btn--active" : ""}`}
                    onClick={handleToggleTrace}
                    title={
                      isTraceActive
                        ? "Exit trace mode (ESC)"
                        : "Trace mode (WASD to align, click to copy)"
                    }
                    style={{ flex: "0 0 auto", padding: "10px 16px" }}
                  >
                    <Icon icon={Target} size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showObjectSelect &&
        objectSelectModal({
          selectedObjectId: frameReferenceObjectId,
          onSelect: onFrameReferenceObjectIdChange,
          onClose: () => setShowObjectSelect(false),
        })}
    </>
  );
}
