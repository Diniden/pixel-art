import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { renderFramePreview } from '../../utils/previewRenderer';
import { ObjectSelectModal } from '../ObjectSelectModal/ObjectSelectModal';
import './FrameReferencePanel.css';

interface FrameReferencePanelProps {
  onOverlayChange: (frameIndex: number | null) => void;
  overlayFrameIndex: number | null;
}

export function FrameReferencePanel({ onOverlayChange, overlayFrameIndex }: FrameReferencePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [referenceFrameIndex, setReferenceFrameIndex] = useState(0); // Absolute frame index for the reference object
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showObjectSelect, setShowObjectSelect] = useState(false);

  const {
    project,
    getCurrentObject,
    getFrameReferenceObject,
    setFrameReferencePanelPosition,
    setFrameReferencePanelMinimized,
    frameTraceActive,
    frameTraceFrameIndex,
    setFrameTraceActive,
    frameReferenceObjectId,
    setFrameReferenceObjectId,
  } = useEditorStore();

  const [isMinimized, setIsMinimized] = useState(project?.uiState.frameReferencePanelMinimized ?? false);
  const [position, setPosition] = useState({ top: 20, left: 20 }); // Position in pixels (for rendering)

  // Helper to convert percentage to pixels
  const percentageToPixels = useCallback((percentPos: { topPercent: number; leftPercent: number } | undefined) => {
    const canvasArea = document.querySelector('.canvas-area');
    if (!canvasArea || !panelRef.current || !percentPos) {
      return { top: 20, left: 20 }; // Default fallback
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

  // Initialize position from project (convert percentage to pixels)
  useEffect(() => {
    const percentPos = project?.uiState.frameReferencePanelPosition;
    if (percentPos) {
      // Use requestAnimationFrame to ensure canvas area is rendered
      requestAnimationFrame(() => {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      });
    }
  }, [project?.uiState.frameReferencePanelPosition, percentageToPixels]);

  // Sync minimized state
  useEffect(() => {
    if (project?.uiState.frameReferencePanelMinimized !== undefined) {
      setIsMinimized(project.uiState.frameReferencePanelMinimized);
    }
  }, [project?.uiState.frameReferencePanelMinimized]);

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      const percentPos = project?.uiState.frameReferencePanelPosition;
      if (percentPos) {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [project?.uiState.frameReferencePanelPosition, percentageToPixels]);

  const currentObj = getCurrentObject();
  const referenceObj = getFrameReferenceObject();

  // Determine if we're referencing a different object
  const isReferencingDifferentObject = frameReferenceObjectId !== null && frameReferenceObjectId !== currentObj?.id;

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
    (f) => f.id === (project?.uiState.selectedFrameId ?? '')
  );
  const currentFrameIndex = rawCurrentIndex >= 0 ? rawCurrentIndex : 0;

  // Get the reference frame
  const isValidReference = referenceFrameIndex >= 0 && referenceFrameIndex < displayObj.frames.length;
  const referenceFrame = isValidReference ? displayObj.frames[referenceFrameIndex] : null;

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
      const ctx = canvas?.getContext('2d', { willReadFrequently: false });
      if (!canvas || !ctx || !referenceFrame) return;

      canvas.width = thumbSize;
      canvas.height = thumbSize;

      // Calculate variant frame indices for the reference frame
      const variants = project?.variants;
      let variantFrameIndices: { [key: string]: number } | undefined;

      if (variants && referenceFrame) {
        // Calculate static indices based on frame position
        // We need to check which variant is actually selected in each layer
        variantFrameIndices = {};

        // First, collect all variant groups that are used in this frame's layers
        const variantGroupsInFrame = new Set<string>();
        for (const layer of referenceFrame.layers) {
          if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
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
            if (layer.isVariant && layer.variantGroupId === vg.id && layer.selectedVariantId) {
              selectedVariant = vg.variants.find(v => v.id === layer.selectedVariantId);
              if (selectedVariant) break;
            }
          }

          // If we found a selected variant, use its frame count
          if (selectedVariant && selectedVariant.frames.length > 0) {
            // Use frame index modulo variant frame count to determine which variant frame to show
            variantFrameIndices[vg.id] = referenceFrameIndex % selectedVariant.frames.length;
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
        variantFrameIndices
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [referenceFrame, gridWidth, gridHeight, thumbSize, project?.variants, referenceFrameIndex, isMinimized]);

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
        setFrameTraceActive(false, null);
      }
    }
  };

  const handleToggleTrace = () => {
    if (frameTraceActive && frameTraceFrameIndex === referenceFrameIndex) {
      // Turn off trace mode
      setFrameTraceActive(false, null);
    } else if (isValidReference) {
      // Turn on trace mode for this frame
      setFrameTraceActive(true, referenceFrameIndex);
      // Also turn off overlay if it's active (for any frame, not just this one)
      if (overlayFrameIndex !== null) {
        onOverlayChange(null);
      }
    }
  };

  const isOverlayActive = overlayFrameIndex === referenceFrameIndex;
  const isTraceActive = frameTraceActive && frameTraceFrameIndex === referenceFrameIndex;

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking on the minimize button or object select button
    if ((e.target as HTMLElement).closest('.frame-reference-minimize') ||
        (e.target as HTMLElement).closest('.frame-reference-object-btn')) {
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
        const canvasArea = document.querySelector('.canvas-area');
        if (canvasArea) {
          const canvasRect = canvasArea.getBoundingClientRect();
          const panelRect = panelRef.current.getBoundingClientRect();
          const finalPixelPosition = {
            top: panelRect.top - canvasRect.top,
            left: panelRect.left - canvasRect.left
          };
          // Convert to percentage and save
          const percentPosition = pixelsToPercentage(finalPixelPosition);
          setFrameReferencePanelPosition(percentPosition);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, setFrameReferencePanelPosition, pixelsToPercentage]);

  const handleGoToCurrentFrame = () => {
    const target = Math.min(Math.max(0, currentFrameIndex), displayObj.frames.length - 1);
    setReferenceFrameIndex(target);
  };

  // Frames ahead/behind: positive = reference is ahead of timeline, negative = behind
  const frameDelta = referenceFrameIndex - currentFrameIndex;
  const framesAheadBehindLabel =
    frameDelta === 0
      ? 'Current frame'
      : frameDelta > 0
        ? `${frameDelta} frame${frameDelta === 1 ? '' : 's'} ahead`
        : `${-frameDelta} frame${-frameDelta === 1 ? '' : 's'} behind`;

  return (
    <>
      <div
        ref={panelRef}
        className={`frame-reference-panel ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''} ${isReferencingDifferentObject ? 'different-object' : ''}`}
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div
          className="frame-reference-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <span className="frame-reference-title">
            🎞️ Frame Reference
          </span>
          <button
            className="frame-reference-object-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowObjectSelect(true);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Select reference object"
          >
            📦
          </button>
          <button
            className="frame-reference-minimize"
            onClick={(e) => {
              e.stopPropagation();
              const newMinimized = !isMinimized;
              setIsMinimized(newMinimized);
              // Persist minimized state to project
              setFrameReferencePanelMinimized(newMinimized);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
        </div>

        {!isMinimized && (
          <div className="frame-reference-content">
            {/* Show which object we're referencing */}
            {isReferencingDifferentObject && (
              <div className="frame-reference-object-info">
                <span className="frame-reference-object-label">Viewing:</span>
                <span className="frame-reference-object-name">{displayObj.name}</span>
              </div>
            )}

            <div className="frame-reference-controls">
              <button
                className="frame-reference-btn"
                onClick={handlePrevious}
                disabled={referenceFrameIndex <= 0}
                title="Previous frame"
              >
                ◀
              </button>
              <div className="frame-reference-info">
                {isValidReference ? (
                  <>
                    <span className="frame-reference-number">Frame {referenceFrameIndex + 1}</span>
                    <span className="frame-reference-name">{referenceFrame?.name || 'Unnamed'}</span>
                    <span className="frame-reference-index">
                      {displayObj.frames.length} total
                    </span>
                  </>
                ) : (
                  <span className="frame-reference-invalid">No frame</span>
                )}
              </div>
              <button
                className="frame-reference-btn"
                onClick={handleNext}
                disabled={referenceFrameIndex + 1 >= displayObj.frames.length}
                title="Next frame"
              >
                ▶
              </button>
            </div>

            {/* Frames ahead/behind indicator and Go to current frame */}
            <div className="frame-reference-sync-row">
              <span className="frame-reference-ahead-behind" title="Relative to timeline">
                {framesAheadBehindLabel}
              </span>
              <button
                className="frame-reference-go-current-btn"
                onClick={handleGoToCurrentFrame}
                disabled={frameDelta === 0}
                title="Sync to current frame"
              >
                Go to current
              </button>
            </div>

            {isValidReference && referenceFrame && (
              <>
                <div className="frame-reference-preview">
                  <canvas ref={canvasRef} width={thumbSize} height={thumbSize} />
                </div>

                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <button
                    className={`frame-reference-overlay-btn ${isOverlayActive ? 'active' : ''}`}
                    onClick={handleToggleOverlay}
                    title={isOverlayActive ? 'Hide overlay' : 'Show overlay on canvas'}
                    style={{ flex: 1 }}
                  >
                    {isOverlayActive ? '👁️ Hide Overlay' : '👁️ Show Overlay'}
                  </button>
                  <button
                    className={`frame-reference-trace-btn ${isTraceActive ? 'active' : ''}`}
                    onClick={handleToggleTrace}
                    title={isTraceActive ? 'Exit trace mode (ESC)' : 'Trace mode (WASD to align, click to copy)'}
                    style={{ flex: '0 0 auto', padding: '10px 16px' }}
                  >
                    🎯
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showObjectSelect && (
        <ObjectSelectModal
          selectedObjectId={frameReferenceObjectId}
          onSelect={setFrameReferenceObjectId}
          onClose={() => setShowObjectSelect(false)}
        />
      )}
    </>
  );
}
