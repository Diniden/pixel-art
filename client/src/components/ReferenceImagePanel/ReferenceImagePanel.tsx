import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { ReferenceImageData, adjustReferenceBoxSize, shiftReferenceSelection, shiftReferenceSelectionBySize } from '../ReferenceImageModal/ReferenceImageModal';
import './ReferenceImagePanel.css';

interface ReferenceImagePanelProps {
  referenceImage: ReferenceImageData | null;
  onReferenceImageChange: (data: ReferenceImageData | null) => void;
  isReferenceTraceActive: boolean;
  zoom: number;
}

export function ReferenceImagePanel({ referenceImage, onReferenceImageChange, isReferenceTraceActive, zoom }: ReferenceImagePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const {
    project,
    setReferenceImagePanelPosition,
    setReferenceImagePanelMinimized,
    setTool,
  } = useEditorStore();

  const [isMinimized, setIsMinimized] = useState(project?.uiState.referenceImagePanelMinimized ?? false);
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
    const percentPos = project?.uiState.referenceImagePanelPosition;
    if (percentPos) {
      requestAnimationFrame(() => {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      });
    }
  }, [project?.uiState.referenceImagePanelPosition, percentageToPixels]);

  // Sync minimized state
  useEffect(() => {
    if (project?.uiState.referenceImagePanelMinimized !== undefined) {
      setIsMinimized(project.uiState.referenceImagePanelMinimized);
    }
  }, [project?.uiState.referenceImagePanelMinimized]);

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      const percentPos = project?.uiState.referenceImagePanelPosition;
      if (percentPos) {
        const pixelPos = percentageToPixels(percentPos);
        setPosition(pixelPos);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [project?.uiState.referenceImagePanelPosition, percentageToPixels]);

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
          if (pixel && pixel !== 0) {
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
    if ((e.target as HTMLElement).closest('.reference-image-minimize')) {
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
          setReferenceImagePanelPosition(percentPosition);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, setReferenceImagePanelPosition, pixelsToPercentage]);

  if (!referenceImage) return null;

  return (
    <div
      ref={panelRef}
      className={`reference-image-panel ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div
        className="reference-image-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <span className="reference-image-title">
          📷 Reference Image
        </span>
        <button
          className="reference-image-minimize"
          onClick={(e) => {
            e.stopPropagation();
            const newMinimized = !isMinimized;
            setIsMinimized(newMinimized);
            setReferenceImagePanelMinimized(newMinimized);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {!isMinimized && (
        <div className="reference-image-content">
          <div className="reference-image-preview">
            <div className="reference-canvas-wrapper">
              {/* Reference box adjustment buttons */}
              {!isReferenceTraceActive && onReferenceImageChange && (
                <>
                  {/* Top buttons - Up adjustments */}
                  <button
                    className="ref-box-btn ref-box-btn-top ref-box-btn-increase"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('up', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Up"
                  >
                    ↑
                  </button>
                  <button
                    className="ref-box-btn ref-box-btn-top ref-box-btn-decrease"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('up', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Up"
                  >
                    ↓
                  </button>

                  {/* Bottom buttons - Down adjustments */}
                  <button
                    className="ref-box-btn ref-box-btn-bottom ref-box-btn-increase"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('down', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Down"
                  >
                    ↓
                  </button>
                  <button
                    className="ref-box-btn ref-box-btn-bottom ref-box-btn-decrease"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('down', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Down"
                  >
                    ↑
                  </button>

                  {/* Left buttons - Left adjustments */}
                  <button
                    className="ref-box-btn ref-box-btn-left ref-box-btn-increase"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('left', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Left"
                  >
                    ←
                  </button>
                  <button
                    className="ref-box-btn ref-box-btn-left ref-box-btn-decrease"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('left', false);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Decrease Reference Box Left"
                  >
                    →
                  </button>

                  {/* Right buttons - Right adjustments */}
                  <button
                    className="ref-box-btn ref-box-btn-right ref-box-btn-increase"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('right', true);
                      if (newData) onReferenceImageChange(newData);
                    }}
                    title="Increase Reference Box Right"
                  >
                    →
                  </button>
                  <button
                    className="ref-box-btn ref-box-btn-right ref-box-btn-decrease"
                    onClick={() => {
                      const newData = adjustReferenceBoxSize('right', false);
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

          <div className="reference-image-info">
            {referenceImage.width} × {referenceImage.height}px
          </div>

          {/* Navigation buttons */}
          {onReferenceImageChange && (
            <div className="reference-navigation">
              <div className="reference-nav-group">
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelection(-1, 0);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Left"
                >
                  ←
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelection(1, 0);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Right"
                >
                  →
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelectionBySize(-1, 0, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Left"
                >
                  ⇇
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelectionBySize(1, 0, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Right"
                >
                  ⇉
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelection(0, -1);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Up"
                >
                  ↑
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelection(0, 1);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Down"
                >
                  ↓
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelectionBySize(0, -1, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Up"
                >
                  ⇈
                </button>
                <button
                  className="reference-nav-btn"
                  onClick={() => {
                    const newData = shiftReferenceSelectionBySize(0, 1, referenceImage.width, referenceImage.height);
                    if (newData) onReferenceImageChange(newData);
                  }}
                  title="Next Down"
                >
                  ⇊
                </button>
              </div>
              <button
                className={`reference-trace-btn ${isReferenceTraceActive ? 'active' : ''}`}
                onClick={() => {
                  // Toggle trace mode: if already active, switch to pixel tool
                  if (isReferenceTraceActive) {
                    setTool('pixel');
                  } else {
                    setTool('reference-trace');
                  }
                }}
                title="Trace Reference (WASD to align, click to copy)"
              >
                🎯
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

