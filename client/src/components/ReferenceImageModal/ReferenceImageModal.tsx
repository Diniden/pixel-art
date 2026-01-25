import { useState, useRef, useCallback, useEffect } from 'react';
import './ReferenceImageModal.css';

export interface ReferenceImageData {
  pixels: Array<Array<{ r: number; g: number; b: number; a: number } | 0>>;
  width: number;
  height: number;
}

interface ReferenceImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReferenceImageData) => void;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type InteractionMode = 'none' | 'selecting' | 'dragging-selection' | 'panning';

// Store persistent state outside the component so it survives unmounts
const persistentState = {
  image: null as HTMLImageElement | null,
  imageUrl: null as string | null,
  selection: null as SelectionBox | null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
};

export function ReferenceImageModal({ isOpen, onClose, onConfirm }: ReferenceImageModalProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionDragOffset, setSelectionDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringSelection, setIsHoveringSelection] = useState(false);

  // Track if we're currently restoring to prevent sync during restore
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore state from persistent storage when modal opens
  useEffect(() => {
    if (isOpen && !hasRestoredRef.current) {
      isRestoringRef.current = true;
      hasRestoredRef.current = true;

      // Restore image and selection from persistent state
      setImage(persistentState.image);
      setImageUrl(persistentState.imageUrl);
      setSelection(persistentState.selection);

      // Always reset zoom and pan to defaults for a clean view
      // This ensures the image is visible and centered when reopening
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });

      // Allow sync after a tick to ensure state is settled
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    }

    // Reset the restored flag when modal closes so next open will restore
    if (!isOpen) {
      hasRestoredRef.current = false;
    }
  }, [isOpen]);

  // Sync state to persistent storage (but not during restoration)
  useEffect(() => {
    if (!isRestoringRef.current) {
      persistentState.image = image;
      persistentState.imageUrl = imageUrl;
      persistentState.selection = selection;
      persistentState.zoom = zoom;
      persistentState.panOffset = panOffset;
    }
  }, [image, imageUrl, selection, zoom, panOffset]);

  // Calculate display scale based on zoom
  const getDisplayScale = useCallback(() => {
    if (!image || !containerRef.current) return zoom;
    const container = containerRef.current;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;
    const scaleX = maxWidth / image.width;
    const scaleY = maxHeight / image.height;
    const baseScale = Math.min(scaleX, scaleY, 1);
    return baseScale * zoom;
  }, [image, zoom]);

  // Render the image and selection
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;

    const scale = getDisplayScale();
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw selection overlay
    if (selection) {
      const x = Math.min(selection.startX, selection.endX) * scale;
      const y = Math.min(selection.startY, selection.endY) * scale;
      const w = Math.abs(selection.endX - selection.startX) * scale;
      const h = Math.abs(selection.endY - selection.startY) * scale;

      // Darken non-selected areas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, canvas.width, y);
      ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, canvas.width - x - w, h);

      // Draw selection border
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Draw corner handles
      ctx.fillStyle = '#00d9ff';
      const handleSize = 8;
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);

      // Draw center move handle
      ctx.fillStyle = 'rgba(0, 217, 255, 0.3)';
      ctx.fillRect(x, y, w, h);

      // Draw move icon in center
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      // Draw move cross
      const crossSize = Math.min(20, w / 4, h / 4);
      ctx.beginPath();
      ctx.moveTo(centerX - crossSize, centerY);
      ctx.lineTo(centerX + crossSize, centerY);
      ctx.moveTo(centerX, centerY - crossSize);
      ctx.lineTo(centerX, centerY + crossSize);
      ctx.stroke();

      // Show dimensions
      const selW = Math.abs(selection.endX - selection.startX);
      const selH = Math.abs(selection.endY - selection.startY);
      ctx.fillStyle = '#00d9ff';
      ctx.font = '12px monospace';
      ctx.fillText(`${selW} × ${selH}px`, x + 4, y - 8);
    }
  }, [image, selection, getDisplayScale]);

  useEffect(() => {
    if (image) {
      render();
    }
  }, [image, selection, render, zoom]);

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear old URL if exists
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageUrl(url);
      setSelection(null);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    };
    img.src = url;

    // Reset file input so the same file can be selected again
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    // Clear old URL if exists
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageUrl(url);
      setSelection(null);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    };
    img.src = url;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Get coordinates relative to original image
  const getImageCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return null;

    const rect = canvas.getBoundingClientRect();
    const scale = getDisplayScale();
    const x = Math.round((clientX - rect.left) / scale);
    const y = Math.round((clientY - rect.top) / scale);

    return {
      x: Math.max(0, Math.min(x, image.width)),
      y: Math.max(0, Math.min(y, image.height))
    };
  }, [image, getDisplayScale]);

  // Check if a point is inside the selection (non-memoized to always use latest selection)
  const isInsideSelection = (sel: SelectionBox | null, imageX: number, imageY: number) => {
    if (!sel) return false;
    const minX = Math.min(sel.startX, sel.endX);
    const maxX = Math.max(sel.startX, sel.endX);
    const minY = Math.min(sel.startY, sel.endY);
    const maxY = Math.max(sel.startY, sel.endY);
    return imageX >= minX && imageX <= maxX && imageY >= minY && imageY <= maxY;
  };

  // Handle wheel events for zoom - using native event for proper preventDefault
  useEffect(() => {
    if (!isOpen || !image) return;

    // Small delay to ensure DOM is ready after restoration
    const timeoutId = setTimeout(() => {
      const canvasArea = canvasAreaRef.current;
      if (!canvasArea) return;

      const handleWheelNative = (e: WheelEvent) => {
        // Prevent browser zoom and stop propagation
        e.preventDefault();
        e.stopPropagation();

        // Pinch-to-zoom (trackpad) shows up as wheel events with ctrlKey
        if (e.ctrlKey || e.metaKey) {
          const delta = -e.deltaY * 0.01;
          setZoom(prev => Math.max(0.5, Math.min(10, prev + delta)));
        } else {
          // Regular trackpad scroll for panning
          setPanOffset(prev => ({
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
          }));
        }
      };

      // Use passive: false to allow preventDefault
      canvasArea.addEventListener('wheel', handleWheelNative, { passive: false });

      // Store cleanup function
      (canvasArea as any)._wheelCleanup = () => {
        canvasArea.removeEventListener('wheel', handleWheelNative);
      };
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      const canvasArea = canvasAreaRef.current;
      if (canvasArea && (canvasArea as any)._wheelCleanup) {
        (canvasArea as any)._wheelCleanup();
        delete (canvasArea as any)._wheelCleanup;
      }
    };
  }, [isOpen, image]);

  // Selection/pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!image) return;

    // Middle mouse button or space key held = pan
    if (e.button === 1) {
      setInteractionMode('panning');
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    const coords = getImageCoords(e.clientX, e.clientY);
    if (!coords) return;

    // Check if clicking inside existing selection to drag it
    if (selection && isInsideSelection(selection, coords.x, coords.y)) {
      setInteractionMode('dragging-selection');
      const minX = Math.min(selection.startX, selection.endX);
      const minY = Math.min(selection.startY, selection.endY);
      setSelectionDragOffset({
        x: coords.x - minX,
        y: coords.y - minY
      });
      return;
    }

    // Start new selection
    setInteractionMode('selecting');
    setSelection({
      startX: coords.x,
      startY: coords.y,
      endX: coords.x,
      endY: coords.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!image) return;

    if (interactionMode === 'panning' && dragStart) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    const coords = getImageCoords(e.clientX, e.clientY);
    if (!coords) return;

    // Track if hovering over selection (for cursor feedback)
    if (interactionMode === 'none') {
      const hovering = isInsideSelection(selection, coords.x, coords.y);
      if (hovering !== isHoveringSelection) {
        setIsHoveringSelection(hovering);
      }
    }

    if (interactionMode === 'selecting' && selection) {
      setSelection({
        ...selection,
        endX: coords.x,
        endY: coords.y
      });
    } else if (interactionMode === 'dragging-selection' && selection && selectionDragOffset) {
      const width = Math.abs(selection.endX - selection.startX);
      const height = Math.abs(selection.endY - selection.startY);

      // Calculate new position
      let newX = coords.x - selectionDragOffset.x;
      let newY = coords.y - selectionDragOffset.y;

      // Clamp to image bounds
      newX = Math.max(0, Math.min(newX, image.width - width));
      newY = Math.max(0, Math.min(newY, image.height - height));

      setSelection({
        startX: newX,
        startY: newY,
        endX: newX + width,
        endY: newY + height
      });
    }
  };

  const handleMouseUp = () => {
    setInteractionMode('none');
    setDragStart(null);
    setSelectionDragOffset(null);
  };

  // Extract pixels from selection
  const extractPixels = (): ReferenceImageData | null => {
    if (!image || !selection) return null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(image, 0, 0);

    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const w = Math.abs(selection.endX - selection.startX);
    const h = Math.abs(selection.endY - selection.startY);

    if (w === 0 || h === 0) return null;

    const imageData = ctx.getImageData(x, y, w, h);
    const pixels: ReferenceImageData['pixels'] = [];

    for (let py = 0; py < h; py++) {
      const row: Array<{ r: number; g: number; b: number; a: number } | 0> = [];
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const a = imageData.data[idx + 3];
        row.push(a > 0 ? { r, g, b, a } : 0);
      }
      pixels.push(row);
    }

    return { pixels, width: w, height: h };
  };

  const handleConfirm = () => {
    const data = extractPixels();
    if (data) {
      onConfirm(data);
      onClose();
    }
  };

  const handleClose = () => {
    // Don't clear state on close - let it persist
    onClose();
  };

  const handleClearImage = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImage(null);
    setImageUrl(null);
    setSelection(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });

    // Clear persistent state
    persistentState.image = null;
    persistentState.imageUrl = null;
    persistentState.selection = null;
    persistentState.zoom = 1;
    persistentState.panOffset = { x: 0, y: 0 };
  };

  const handleSelectAll = () => {
    if (image) {
      setSelection({
        startX: 0,
        startY: 0,
        endX: image.width,
        endY: image.height
      });
    }
  };

  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(10, prev * 1.25));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.5, prev / 1.25));
  };

  if (!isOpen) return null;

  const selectionWidth = selection ? Math.abs(selection.endX - selection.startX) : 0;
  const selectionHeight = selection ? Math.abs(selection.endY - selection.startY) : 0;
  const hasValidSelection = selectionWidth > 0 && selectionHeight > 0;

  // Determine cursor based on state
  const getCursorStyle = () => {
    if (interactionMode === 'panning') return 'grabbing';
    if (interactionMode === 'dragging-selection') return 'move';
    if (isHoveringSelection) return 'move';
    return 'crosshair';
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="reference-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📷 Add Reference Image</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          {!image ? (
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div className="upload-icon">🖼️</div>
              <p className="upload-text">Drop an image here or click to upload</p>
              <p className="upload-hint">Supports PNG, JPG, GIF, WebP</p>
            </div>
          ) : (
            <div className="image-editor" ref={containerRef}>
              <div className="editor-toolbar">
                <span className="image-info">
                  {image.width} × {image.height}px
                </span>
                <div className="zoom-controls">
                  <button className="toolbar-btn" onClick={handleZoomOut} title="Zoom Out">
                    −
                  </button>
                  <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                  <button className="toolbar-btn" onClick={handleZoomIn} title="Zoom In">
                    +
                  </button>
                  <button className="toolbar-btn reset-btn" onClick={handleResetView} title="Reset View">
                    ⟲
                  </button>
                </div>
                <button className="select-all-btn" onClick={handleSelectAll}>
                  Select All
                </button>
                <button
                  className="change-image-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change Image
                </button>
                <button
                  className="clear-image-btn"
                  onClick={handleClearImage}
                  title="Clear current image"
                >
                  🗑️ Clear
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>
              <div
                className="canvas-area"
                ref={canvasAreaRef}
              >
                <div
                  className="canvas-pan-container"
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{ cursor: getCursorStyle() }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
                </div>
              </div>
              <p className="selection-hint">
                🔍 Pinch or scroll to zoom • Two-finger swipe to pan • Click and drag to select • Drag inside selection to move it
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="selection-info">
            {hasValidSelection && (
              <span>Selection: {selectionWidth} × {selectionHeight}px</span>
            )}
          </div>
          <div className="modal-actions">
            <button className="cancel-btn" onClick={handleClose}>
              Cancel
            </button>
            <button
              className="confirm-btn"
              onClick={handleConfirm}
              disabled={!hasValidSelection}
            >
              Use Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
