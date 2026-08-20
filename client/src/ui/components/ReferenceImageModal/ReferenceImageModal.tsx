import { useState, useRef, useCallback, useEffect } from 'react';
import './ReferenceImageModal.css';
import { Icon } from '../../primitives/Icon/Icon';
import { ImagePlus, RotateCcw, Camera, X, Trash2, Search } from 'lucide-react';
import type { ReferenceImageData } from '../../../types/referenceImage';
import {
  extractPixelsFromSelection,
  type ReferenceSelectionBox,
} from '../../../utils/referenceImage';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TASK 29: THE MODULE-LEVEL SINGLETON THAT USED TO LIVE HERE IS GONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This file declared `const persistentState = {...}` above the component — six
 * fields of mutable state in a React module, with the comment "Store persistent
 * state outside the component so it survives unmounts". It was the LAST
 * module-level state in the codebase and a fourth, undeclared store:
 * `ReferenceImagePanel` mutated it from 16 call sites and `App.tsx` used it as
 * a data-transfer object, all with none of the reactivity a store provides.
 *
 * It is now `ReferenceUIStore`. This file also exported TEN non-component
 * symbols; all ten moved:
 *
 *   extractPixelsFromSelection ─┐
 *   (shift/adjust geometry)     ├─→ `utils/referenceImage.ts`   (pure)
 *   encodeImageToBase64 ────────┐
 *   decodeBase64ToImage         └─→ `utils/imageEncoding.ts`    (pure)
 *   shiftReferenceSelection ────┐
 *   shiftReferenceSelectionBySize ├→ `ReferenceUIStore` actions (stateful)
 *   adjustReferenceBoxSize ─────┘
 *   saveReferenceImageToProject ┐
 *   restoreReferenceImageFromProject └→ `DomainStore` actions   (the last two
 *                                       `useEditorStore.getState()` calls)
 *   getCurrentReferenceImageData → `ReferenceUIStore.currentReferenceImageData`
 *   ReferenceImageData (the type) → `types/referenceImage.ts`
 *
 * ⚠️ THE COMPONENT IS NOW PURE PRESENTATION — props in, callbacks out. It
 * imports NO store and NO MobX, so it can live under `ui/` when task 35
 * relocates it. Its `ReferenceImageModalContainer` supplies the store wiring.
 *
 * ⚠️ The cropper UI is deliberately NOT decomposed here (task 29 constraint:
 * "Do not restructure the modal's cropper UI into a separate component — that
 * is a later purification task"). This task moves state and deletes the
 * singleton, nothing more.
 */

interface ReferenceImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReferenceImageData) => void;
  /**
   * The persisted image, owned by `ReferenceUIStore`.
   *
   * ⚠️ THIS PROP IS THE REPLACEMENT FOR THE SINGLETON'S LIFETIME. The modal
   * returns `null` when closed, so React discards its state on every close —
   * which is precisely why `persistentState` existed. The image now outlives
   * the component because the STORE holds it, and it arrives here as a prop.
   */
  image: HTMLImageElement | null;
  imageUrl: string | null;
  selection: ReferenceSelectionBox | null;
  /** Commit a new image + selection to the store (one atomic write). */
  onImageChange: (
    image: HTMLImageElement | null,
    imageUrl: string | null,
    selection: ReferenceSelectionBox | null,
  ) => void;
  /** Commit a selection-only change. */
  onSelectionChange: (selection: ReferenceSelectionBox | null) => void;
  /** Persist the current image + crop to `project.referenceImage`. */
  onSave: (
    image: HTMLImageElement | null,
    selection: ReferenceSelectionBox | null,
  ) => void;
}

type InteractionMode = 'none' | 'selecting' | 'dragging-selection' | 'panning';

export function ReferenceImageModal({
  isOpen,
  onClose,
  onConfirm,
  image,
  imageUrl,
  selection,
  onImageChange,
  onSelectionChange,
  onSave,
}: ReferenceImageModalProps) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [isDragging, setIsDragging] = useState(false);
  /**
   * ⚠️ `zoom` and `panOffset` are COMPONENT-LOCAL, deliberately (task 29).
   *
   * They were fields 4 and 5 of `persistentState`, but nothing outside this
   * modal ever read them — they are viewport state for one dialog. Keeping
   * them local is not a downgrade: the restore effect the singleton needed
   * always reset BOTH to their defaults on open anyway ("Always reset zoom and
   * pan to defaults for a clean view"), so storing them across unmounts was
   * dead weight. `useState` reproduces that reset for free.
   */
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionDragOffset, setSelectionDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringSelection, setIsHoveringSelection] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ══════════════════════════════════════════════════════════════════════
   *  THE TWO SYNC EFFECTS THAT USED TO LIVE HERE ARE DELETED (task 29)
   *
   *  A "restore from persistent storage on open" effect and a "sync state to
   *  persistent storage" effect kept local `useState` and the module singleton
   *  in agreement, guarded by `isRestoringRef` / `hasRestoredRef` — two refs
   *  that existed only to stop the two effects from fighting each other, plus
   *  a `requestAnimationFrame` to let the copy settle.
   *
   *  All of it was the cost of duplicating store state into component state.
   *  `image`/`imageUrl`/`selection` are now PROPS off `ReferenceUIStore`, so
   *  there is one copy, no synchronisation, and no ordering hazard. The
   *  "reset zoom/pan for a clean view on open" behaviour the restore effect
   *  also performed is preserved by the effect below.
   * ══════════════════════════════════════════════════════════════════════ */

  // Reset the viewport whenever the modal opens, so a reopened modal always
  // shows the image centred at 100% — verbatim behaviour from the deleted
  // restore effect, which did exactly this under the comment "Always reset zoom
  // and pan to defaults for a clean view".
  //
  // ⚠️ `react-hooks/set-state-in-effect` warns here (a WARNING, not an error).
  // It is correct in general and wrong for this case: the reset must happen on
  // the OPEN TRANSITION, and `isOpen` is a prop owned by the parent, so there
  // is no render-time or event-handler position that observes the transition.
  // Deriving it instead would change behaviour — a user who zooms in, closes
  // and reopens must get 100%, and this is the effect that guarantees it.
  // Silencing the rule with a disable comment would hide it for any FUTURE
  // setState added to this effect, so the warning is left visible on purpose.
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [isOpen]);

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
      onImageChange(img, url, null);
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
      onImageChange(img, url, null);
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
  const isInsideSelection = (sel: ReferenceSelectionBox | null, imageX: number, imageY: number) => {
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
    onSelectionChange({
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
      onSelectionChange({
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

      onSelectionChange({
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

  // Extract pixels from selection (use exported function)
  const extractPixels = (): ReferenceImageData | null => {
    return extractPixelsFromSelection(image, selection);
  };

  const handleConfirm = () => {
    const data = extractPixels();
    if (data) {
      // Save to project when user confirms selection
      if (image && selection) {
        onSave(image, selection);
      }
      onConfirm(data);
      onClose();
    }
  };

  const handleClose = () => {
    // Don't clear state on close - let it persist
    onClose();
  };

  const handleClearImage = () => {
    if (imageUrl && !imageUrl.startsWith('data:')) {
      // Only revoke object URLs, not data URLs (base64)
      URL.revokeObjectURL(imageUrl);
    }
    // One store write replaces the six-line manual reset of the singleton.
    onImageChange(null, null, null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });

    // Clear from project
    onSave(null, null);
  };

  const handleSelectAll = () => {
    if (image) {
      onSelectionChange({
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
    <div className="modal__overlay" onClick={handleClose}>
      <div className="modal reference-image-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2><Icon icon={Camera} size={18} /> Add Reference Image</h2>
          <button className="modal__close" onClick={handleClose}><Icon icon={X} size={14} /></button>
        </div>

        <div className="modal__body modal__body--fill">
          {!image ? (
            <div
              className={`reference-image-modal__upload-zone ${isDragging ? 'reference-image-modal__upload-zone--dragging' : ''}`}
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
              <div className="reference-image-modal__upload-icon"><Icon icon={ImagePlus} size={32} /></div>
              <p className="reference-image-modal__upload-text">Drop an image here or click to upload</p>
              <p className="reference-image-modal__upload-hint">Supports PNG, JPG, GIF, WebP</p>
            </div>
          ) : (
            <div className="reference-image-modal__editor" ref={containerRef}>
              <div className="reference-image-modal__toolbar">
                <span className="reference-image-modal__image-info">
                  {image.width} × {image.height}px
                </span>
                <div className="reference-image-modal__zoom-controls">
                  <button className="reference-image-modal__toolbar-btn" onClick={handleZoomOut} title="Zoom Out">
                    −
                  </button>
                  <span className="reference-image-modal__zoom-level">{Math.round(zoom * 100)}%</span>
                  <button className="reference-image-modal__toolbar-btn" onClick={handleZoomIn} title="Zoom In">
                    +
                  </button>
                  <button className="reference-image-modal__toolbar-btn reference-image-modal__toolbar-btn--reset" onClick={handleResetView} title="Reset View">
                    <Icon icon={RotateCcw} size={12} />
                  </button>
                </div>
                <button className="reference-image-modal__select-all-btn" onClick={handleSelectAll}>
                  Select All
                </button>
                <button
                  className="reference-image-modal__change-image-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change Image
                </button>
                <button
                  className="reference-image-modal__clear-image-btn"
                  onClick={handleClearImage}
                  title="Clear current image"
                >
                  <Icon icon={Trash2} size={12} /> Clear
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
                className="reference-image-modal__canvas-area"
                ref={canvasAreaRef}
              >
                <div
                  className="reference-image-modal__pan"
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
              <p className="reference-image-modal__selection-hint">
                <Icon icon={Search} size={12} /> Pinch or scroll to zoom • Two-finger swipe to pan • Click and drag to select • Drag inside selection to move it
              </p>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <div className="reference-image-modal__selection-info">
            {hasValidSelection && (
              <span>Selection: {selectionWidth} × {selectionHeight}px</span>
            )}
          </div>
          <div className="modal__actions">
            <button className="btn btn--lg btn--neutral" onClick={handleClose}>
              Cancel
            </button>
            <button
              className="btn btn--lg btn--primary"
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
