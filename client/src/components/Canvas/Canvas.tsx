import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../../store';
import { Color, Point, SelectionBox, Pixel } from '../../types';
import { getLinePixels, getRectanglePixels, getEllipsePixels, floodFill, getSquarePixels } from './drawingUtils';
import { ReferenceImageData } from '../ReferenceImageModal/ReferenceImageModal';
import './Canvas.css';

interface CanvasProps {
  referenceImage?: ReferenceImageData | null;
}

export function Canvas({ referenceImage }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [isDraggingPixels, setIsDraggingPixels] = useState(false);
  const [dragStartPixel, setDragStartPixel] = useState<Point | null>(null);
  const [lastDragPixel, setLastDragPixel] = useState<Point | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [previewSelection, setPreviewSelection] = useState<SelectionBox | null>(null);

  // Offscreen canvas refs for caching static content
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refGridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheKeyRef = useRef<string>('');
  const gridCacheKeyRef = useRef<string>('');
  const refCacheKeyRef = useRef<string>('');
  const renderRequestRef = useRef<number | null>(null);

  const {
    project,
    isDrawing,
    drawStartPoint,
    previewPixels,
    referenceOverlayOffset,
    selection,
    getCurrentObject,
    getCurrentFrame,
    getCurrentLayer,
    getCurrentVariant,
    isEditingVariant,
    setPixel,
    setPixels,
    startDrawing,
    endDrawing,
    setPreviewPixels,
    clearPreviewPixels,
    setZoom,
    setPanOffset,
    moveLayerPixels,
    setBorderRadius,
    deleteSelectedFrame,
    undo,
    moveReferenceOverlay,
    resetReferenceOverlay,
    setColorAndAddToHistory,
    addToColorHistory,
    revertToPreviousTool,
    setTool,
    setSelection,
    clearSelection,
    moveSelectedPixels,
    selectFrame,
    setVariantOffset,
    advanceVariantFrames
  } = useEditorStore();

  const obj = getCurrentObject();
  const frame = getCurrentFrame();
  const layer = getCurrentLayer();
  const variantData = getCurrentVariant();
  const editingVariant = isEditingVariant();

  // Get grid dimensions - use variant size if editing a variant
  const objWidth = obj?.gridSize.width ?? 32;
  const objHeight = obj?.gridSize.height ?? 32;

  // When editing variant, use variant's grid size for the editable area
  const gridWidth = editingVariant && variantData
    ? variantData.variant.gridSize.width
    : objWidth;
  const gridHeight = editingVariant && variantData
    ? variantData.variant.gridSize.height
    : objHeight;

  const zoom = project?.uiState.zoom ?? 10;
  const panOffset = project?.uiState.panOffset ?? { x: 0, y: 0 };
  const currentTool = project?.uiState.selectedTool ?? 'pixel';
  const currentColor = project?.uiState.selectedColor ?? { r: 0, g: 0, b: 0, a: 255 };
  const brushSize = project?.uiState.brushSize ?? 1;
  const shapeMode = project?.uiState.shapeMode ?? 'both';
  const borderRadius = project?.uiState.borderRadius ?? 0;

  // Get variant offset if editing variant (now from baseFrameOffsets)
  const variantOffset = editingVariant && variantData
    ? variantData.offset
    : { x: 0, y: 0 };

  // Create a stable key for the offset to ensure useEffect triggers on offset changes
  // (React's dependency comparison doesn't deep-compare objects)
  const variantOffsetKey = `${variantOffset.x},${variantOffset.y}`;

  // Calculate canvas size - when editing variant, show both the variant grid and the object outline
  const canvasWidth = editingVariant ? objWidth * zoom : gridWidth * zoom;
  const canvasHeight = editingVariant ? objHeight * zoom : gridHeight * zoom;

  // Cache key for background/grid (only recreate when size changes)
  const bgCacheKey = `${gridWidth}-${gridHeight}-${zoom}`;

  // Get pixel from canvas coordinates
  // When editing variant, returns coords relative to the variant grid
  const getPixelCoords = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let x = Math.floor((clientX - rect.left) / zoom);
    let y = Math.floor((clientY - rect.top) / zoom);

    // When editing a variant, adjust coords to be relative to variant grid
    if (editingVariant && variantData) {
      x = x - variantOffset.x;
      y = y - variantOffset.y;
    }

    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
    return { x, y };
  }, [zoom, gridWidth, gridHeight, editingVariant, variantData, variantOffsetKey]);

  // Create or update cached background canvas (checkerboard)
  const ensureBgCanvas = useCallback(() => {
    if (bgCacheKeyRef.current === bgCacheKey && bgCanvasRef.current) {
      return bgCanvasRef.current;
    }

    // Create or resize background canvas
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCanvasRef.current;
    bgCanvas.width = canvasWidth;
    bgCanvas.height = canvasHeight;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return bgCanvas;

    // Draw base color
    bgCtx.fillStyle = '#1a1a25';
    bgCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw checkerboard using ImageData for speed
    const imageData = bgCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const color1 = { r: 42, g: 42, b: 58 };  // #2a2a3a
    const color2 = { r: 34, g: 34, b: 48 };  // #222230

    for (let py = 0; py < gridHeight; py++) {
      for (let px = 0; px < gridWidth; px++) {
        const color = (px + py) % 2 === 0 ? color1 : color2;
        const startX = px * zoom;
        const startY = py * zoom;

        for (let dy = 0; dy < zoom; dy++) {
          for (let dx = 0; dx < zoom; dx++) {
            const idx = ((startY + dy) * canvasWidth + (startX + dx)) * 4;
            data[idx] = color.r;
            data[idx + 1] = color.g;
            data[idx + 2] = color.b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    bgCtx.putImageData(imageData, 0, 0);
    bgCacheKeyRef.current = bgCacheKey;
    return bgCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, gridWidth, gridHeight, zoom]);

  // Create or update cached grid canvas
  const ensureGridCanvas = useCallback(() => {
    if (gridCacheKeyRef.current === bgCacheKey && gridCanvasRef.current) {
      return gridCanvasRef.current;
    }

    if (!gridCanvasRef.current) {
      gridCanvasRef.current = document.createElement('canvas');
    }
    const gridCanvas = gridCanvasRef.current;
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    const gridCtx = gridCanvas.getContext('2d');
    if (!gridCtx) return gridCanvas;

    gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    gridCtx.lineWidth = 1;

    // Draw all vertical lines in one path
    gridCtx.beginPath();
    for (let x = 0; x <= gridWidth; x++) {
      gridCtx.moveTo(x * zoom + 0.5, 0);
      gridCtx.lineTo(x * zoom + 0.5, canvasHeight);
    }
    // Draw all horizontal lines in the same path
    for (let y = 0; y <= gridHeight; y++) {
      gridCtx.moveTo(0, y * zoom + 0.5);
      gridCtx.lineTo(canvasWidth, y * zoom + 0.5);
    }
    gridCtx.stroke();

    gridCacheKeyRef.current = bgCacheKey;
    return gridCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, gridWidth, gridHeight, zoom]);

  // Optimized render - uses cached offscreen canvases for static content
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !frame || !obj) return;

    ctx.imageSmoothingEnabled = false;

    // Draw cached background (checkerboard)
    const bgCanvas = ensureBgCanvas();
    ctx.drawImage(bgCanvas, 0, 0);

    // When editing a variant, we render differently:
    // 1. Render all non-variant layers at their normal positions
    // 2. Render variant layers at their variant offset positions
    // 3. Draw outline around object bounds
    // 4. Draw grid only for the variant editing area

    if (editingVariant && variantData) {
      // First, render all non-selected layers (including other variant layers at their positions)
      for (const l of frame.layers) {
        if (!l.visible) continue;

        // For variant layers, render the selected variant's pixels at the offset
        if (l.isVariant && l.variantGroupId) {
          const vg = obj.variantGroups?.find(vg => vg.id === l.variantGroupId);
          const variant = vg?.variants.find(v => v.id === l.selectedVariantId);
          const variantFrameIdx = project?.uiState.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame = variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          // Get the base frame index for offset lookup
          const baseFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

          if (variant && vFrame) {
            // Use baseFrameOffsets for position (key change)
            const vOffset = variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 };
            const isCurrentLayer = l.id === layer?.id;

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = row[x];
                  if (pixel && pixel.a > 0) {
                    const drawX = (x + vOffset.x) * zoom;
                    const drawY = (y + vOffset.y) * zoom;
                    if (drawX >= 0 && drawX < canvasWidth && drawY >= 0 && drawY < canvasHeight) {
                      // Dim non-current variant layers slightly
                      const alpha = isCurrentLayer ? pixel.a / 255 : pixel.a / 255 * 0.7;
                      ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${alpha})`;
                      ctx.fillRect(drawX, drawY, zoom, zoom);
                    }
                  }
                }
              }
            }
          }
        } else {
          // Regular layer - render dimmed
          for (let y = 0; y < objHeight; y++) {
            const row = l.pixels[y];
            if (!row) continue;

            for (let x = 0; x < objWidth; x++) {
              const pixel = row[x];
              if (pixel && pixel.a > 0) {
                ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255 * 0.5})`;
                ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
              }
            }
          }
        }
      }

      // Draw preview pixels at variant offset
      if (previewPixels.length > 0) {
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${currentColor.a / 255 * 0.6})`;
        for (const { x, y } of previewPixels) {
          if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            const drawX = (x + variantOffset.x) * zoom;
            const drawY = (y + variantOffset.y) * zoom;
            ctx.fillRect(drawX, drawY, zoom, zoom);
          }
        }
      }

      // Draw grid only over variant edit area
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= gridWidth; x++) {
        const px = (variantOffset.x + x) * zoom + 0.5;
        ctx.moveTo(px, variantOffset.y * zoom);
        ctx.lineTo(px, (variantOffset.y + gridHeight) * zoom);
      }
      for (let y = 0; y <= gridHeight; y++) {
        const py = (variantOffset.y + y) * zoom + 0.5;
        ctx.moveTo(variantOffset.x * zoom, py);
        ctx.lineTo((variantOffset.x + gridWidth) * zoom, py);
      }
      ctx.stroke();

      // Draw outline around object bounds
      ctx.strokeStyle = 'rgba(255, 171, 0, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, objWidth * zoom, objHeight * zoom);
      ctx.setLineDash([]);

      // Draw outline around current variant editing area
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        variantOffset.x * zoom,
        variantOffset.y * zoom,
        gridWidth * zoom,
        gridHeight * zoom
      );

    } else {
      // Normal mode - render all layers
      for (const l of frame.layers) {
        if (!l.visible) continue;

        // For variant layers, render the selected variant's pixels at the offset
        if (l.isVariant && l.variantGroupId) {
          const vg = obj.variantGroups?.find(vg => vg.id === l.variantGroupId);
          const variant = vg?.variants.find(v => v.id === l.selectedVariantId);
          const variantFrameIdx = project?.uiState.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame = variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          // Get the base frame index for offset lookup
          const baseFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

          if (variant && vFrame) {
            // Use baseFrameOffsets for position (key change)
            const vOffset = variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 };

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = row[x];
                  if (pixel && pixel.a > 0) {
                    const drawX = (x + vOffset.x) * zoom;
                    const drawY = (y + vOffset.y) * zoom;
                    if (drawX >= 0 && drawX < canvasWidth && drawY >= 0 && drawY < canvasHeight) {
                      ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
                      ctx.fillRect(drawX, drawY, zoom, zoom);
                    }
                  }
                }
              }
            }
          }
        } else {
          // Regular layer
          for (let y = 0; y < gridHeight; y++) {
            const row = l.pixels[y];
            if (!row) continue;

            for (let x = 0; x < gridWidth; x++) {
              const pixel = row[x];
              if (pixel && pixel.a > 0) {
                ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
                ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
              }
            }
          }
        }
      }

      // Draw preview pixels
      if (previewPixels.length > 0) {
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${currentColor.a / 255 * 0.6})`;
        for (const { x, y } of previewPixels) {
          if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }

      // Draw cached grid on top
      const gridCanvas = ensureGridCanvas();
      ctx.drawImage(gridCanvas, 0, 0);
    }

    // Draw selection box (preview or finalized)
    const selBox = previewSelection || selection;
    if (selBox) {
      const offsetX = editingVariant ? variantOffset.x : 0;
      const offsetY = editingVariant ? variantOffset.y : 0;

      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        (selBox.x + offsetX) * zoom,
        (selBox.y + offsetY) * zoom,
        selBox.width * zoom,
        selBox.height * zoom
      );
      ctx.setLineDash([]);

      // Draw inner dashed line with offset for marching ants effect
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = 4;
      ctx.strokeRect(
        (selBox.x + offsetX) * zoom + 1,
        (selBox.y + offsetY) * zoom + 1,
        selBox.width * zoom - 2,
        selBox.height * zoom - 2
      );
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }, [frame, obj, layer, previewPixels, currentColor, zoom, gridWidth, gridHeight, objWidth, objHeight, canvasWidth, canvasHeight, ensureBgCanvas, ensureGridCanvas, selection, previewSelection, editingVariant, variantData, variantOffsetKey, project?.uiState.variantFrameIndices]);

  // Check if reference trace tool is active
  const isReferenceTraceActive = currentTool === 'reference-trace' && referenceImage != null;

  // Render reference overlay (transparent overlay on top of main canvas)
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !referenceImage || !isReferenceTraceActive) {
      // Clear canvas if not active
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    // Size the overlay to match the main canvas
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw reference pixels with transparency at the offset position
    ctx.globalAlpha = 0.5;

    for (let y = 0; y < referenceImage.height; y++) {
      const row = referenceImage.pixels[y];
      if (!row) continue;
      for (let x = 0; x < referenceImage.width; x++) {
        const pixel = row[x];
        if (pixel && pixel.a > 0) {
          const drawX = (x + referenceOverlayOffset.x) * zoom;
          const drawY = (y + referenceOverlayOffset.y) * zoom;

          // Only draw if within canvas bounds
          if (drawX >= 0 && drawX < canvasWidth && drawY >= 0 && drawY < canvasHeight) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(drawX, drawY, zoom, zoom);
          }
        }
      }
    }

    ctx.globalAlpha = 1;

    // Draw a subtle border around the reference area
    ctx.strokeStyle = 'rgba(255, 171, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const overlayX = referenceOverlayOffset.x * zoom;
    const overlayY = referenceOverlayOffset.y * zoom;
    const overlayW = referenceImage.width * zoom;
    const overlayH = referenceImage.height * zoom;
    ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);
    ctx.setLineDash([]);
  }, [referenceImage, isReferenceTraceActive, canvasWidth, canvasHeight, zoom, referenceOverlayOffset]);

  // Render reference image
  const renderReference = useCallback(() => {
    const canvas = refCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !referenceImage) return;

    const refWidth = referenceImage.width * zoom;
    const refHeight = referenceImage.height * zoom;

    canvas.width = refWidth;
    canvas.height = refHeight;
    ctx.imageSmoothingEnabled = false;

    // Create or update cached background for reference
    const refCacheKey = `ref-${referenceImage.width}-${referenceImage.height}-${zoom}`;

    if (refCacheKeyRef.current !== refCacheKey || !refBgCanvasRef.current) {
      if (!refBgCanvasRef.current) {
        refBgCanvasRef.current = document.createElement('canvas');
      }
      const bgCanvas = refBgCanvasRef.current;
      bgCanvas.width = refWidth;
      bgCanvas.height = refHeight;
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) {
        // Draw checkerboard
        const imageData = bgCtx.createImageData(refWidth, refHeight);
        const data = imageData.data;
        const color1 = { r: 42, g: 42, b: 58 };
        const color2 = { r: 34, g: 34, b: 48 };

        for (let py = 0; py < referenceImage.height; py++) {
          for (let px = 0; px < referenceImage.width; px++) {
            const color = (px + py) % 2 === 0 ? color1 : color2;
            const startX = px * zoom;
            const startY = py * zoom;

            for (let dy = 0; dy < zoom; dy++) {
              for (let dx = 0; dx < zoom; dx++) {
                const idx = ((startY + dy) * refWidth + (startX + dx)) * 4;
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = 255;
              }
            }
          }
        }
        bgCtx.putImageData(imageData, 0, 0);
      }

      // Create grid for reference
      if (!refGridCanvasRef.current) {
        refGridCanvasRef.current = document.createElement('canvas');
      }
      const gridCanvas = refGridCanvasRef.current;
      gridCanvas.width = refWidth;
      gridCanvas.height = refHeight;
      const gridCtx = gridCanvas.getContext('2d');
      if (gridCtx) {
        gridCtx.clearRect(0, 0, refWidth, refHeight);
        gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        gridCtx.lineWidth = 1;
        gridCtx.beginPath();
        for (let x = 0; x <= referenceImage.width; x++) {
          gridCtx.moveTo(x * zoom + 0.5, 0);
          gridCtx.lineTo(x * zoom + 0.5, refHeight);
        }
        for (let y = 0; y <= referenceImage.height; y++) {
          gridCtx.moveTo(0, y * zoom + 0.5);
          gridCtx.lineTo(refWidth, y * zoom + 0.5);
        }
        gridCtx.stroke();
      }

      refCacheKeyRef.current = refCacheKey;
    }

    // Draw background
    if (refBgCanvasRef.current) {
      ctx.drawImage(refBgCanvasRef.current, 0, 0);
    }

    // Draw pixels
    for (let y = 0; y < referenceImage.height; y++) {
      const row = referenceImage.pixels[y];
      if (!row) continue;
      for (let x = 0; x < referenceImage.width; x++) {
        const pixel = row[x];
        if (pixel && pixel.a > 0) {
          ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }

    // Draw grid
    if (refGridCanvasRef.current) {
      ctx.drawImage(refGridCanvasRef.current, 0, 0);
    }
  }, [referenceImage, zoom]);

  // Use a ref to always have access to the latest render function
  const renderRef = useRef(render);
  renderRef.current = render;

  // Render reference when it changes
  useEffect(() => {
    if (referenceImage) {
      renderReference();
    }
  }, [referenceImage, zoom, renderReference]);

  // Render overlay when trace tool state changes
  useEffect(() => {
    renderOverlay();
  }, [renderOverlay, referenceOverlayOffset, isReferenceTraceActive]);

  // Schedule render using requestAnimationFrame
  useEffect(() => {
    // Cancel any pending frame
    if (renderRequestRef.current !== null) {
      cancelAnimationFrame(renderRequestRef.current);
    }

    renderRequestRef.current = requestAnimationFrame(() => {
      renderRequestRef.current = null;
      renderRef.current();
    });

    return () => {
      if (renderRequestRef.current !== null) {
        cancelAnimationFrame(renderRequestRef.current);
      }
    };
    // Note: project is included to ensure re-render on undo (which restores historical project reference)
    // obj is included for variant group changes
  }, [frame, previewPixels, currentColor, zoom, gridWidth, gridHeight, canvasWidth, canvasHeight, variantOffsetKey, project, obj]);

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd/Ctrl + Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Delete key to delete selected frame
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only if not in an input field
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          deleteSelectedFrame();
          return;
        }
      }

      // Number keys 1-9,0 for tool selection
      const toolHotkeys: { [key: string]: 'pixel' | 'eraser' | 'eyedropper' | 'fill-square' | 'flood-fill' | 'line' | 'rectangle' | 'ellipse' | 'move' | 'selection' } = {
        '1': 'pixel',
        '2': 'eraser',
        '3': 'eyedropper',
        '4': 'fill-square',
        '5': 'flood-fill',
        '6': 'line',
        '7': 'rectangle',
        '8': 'ellipse',
        '9': 'move',
        '0': 'selection',
      };

      if (toolHotkeys[e.key]) {
        e.preventDefault();
        // Clear selection when switching away from selection tool
        if (currentTool === 'selection' && toolHotkeys[e.key] !== 'selection') {
          clearSelection();
        }
        setTool(toolHotkeys[e.key]);
        return;
      }

      // WASD keys for variant offset adjustment when editing a variant
      if (editingVariant && ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        let dx = 0, dy = 0;
        if (key === 'w') dy = -1;
        if (key === 's') dy = 1;
        if (key === 'a') dx = -1;
        if (key === 'd') dx = 1;
        setVariantOffset(dx, dy);
        return;
      }

      // WASD keys for reference trace tool - move reference overlay
      if (isReferenceTraceActive && ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        let dx = 0, dy = 0;
        if (key === 'w') dy = -1;
        if (key === 's') dy = 1;
        if (key === 'a') dx = -1;
        if (key === 'd') dx = 1;
        moveReferenceOverlay(dx, dy);
        return;
      }

      // Arrow keys - move selection pixels if selection exists, otherwise move all pixels
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();

        // Shift + Arrow for rectangle border radius adjustment
        if (e.shiftKey && currentTool === 'rectangle') {
          if (e.key === 'ArrowUp') {
            setBorderRadius(borderRadius + 1);
          } else if (e.key === 'ArrowDown') {
            setBorderRadius(borderRadius - 1);
          }
          return;
        }

        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        if (e.key === 'ArrowDown') dy = 1;
        if (e.key === 'ArrowLeft') dx = -1;
        if (e.key === 'ArrowRight') dx = 1;

        // If there's a selection, move only selected pixels
        if (selection) {
          moveSelectedPixels(dx, dy);
        } else {
          // Otherwise move all layer pixels
          moveLayerPixels(dx, dy);
        }
        return;
      }

      // Escape key to clear selection
      if (e.key === 'Escape' && selection) {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Frame navigation: "." for next frame, "," for previous frame
      if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        const currentObj = getCurrentObject();
        if (!currentObj || currentObj.frames.length <= 1) return;

        const currentFrameId = project?.uiState.selectedFrameId;
        const currentIndex = currentObj.frames.findIndex(f => f.id === currentFrameId);
        if (currentIndex === -1) return;

        let newIndex: number;
        let delta: number;
        if (e.key === '.') {
          // Next frame (wrap around)
          newIndex = (currentIndex + 1) % currentObj.frames.length;
          delta = 1;
        } else {
          // Previous frame (wrap around)
          newIndex = (currentIndex - 1 + currentObj.frames.length) % currentObj.frames.length;
          delta = -1;
        }

        // Don't sync variants to base frames - advance them independently (same as playback)
        selectFrame(currentObj.frames[newIndex].id, false);
        advanceVariantFrames(delta);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTool, borderRadius, undo, deleteSelectedFrame, moveLayerPixels, setBorderRadius, isReferenceTraceActive, moveReferenceOverlay, setTool, selection, moveSelectedPixels, clearSelection, getCurrentObject, project?.uiState.selectedFrameId, selectFrame, editingVariant, setVariantOffset, advanceVariantFrames]);

  // Get pixel color from reference image at a given canvas coordinate
  const getRefPixelAtCoord = useCallback((canvasX: number, canvasY: number) => {
    if (!referenceImage) return null;

    // Calculate the reference pixel coordinate considering the overlay offset
    const refX = canvasX - referenceOverlayOffset.x;
    const refY = canvasY - referenceOverlayOffset.y;

    // Check bounds
    if (refX < 0 || refX >= referenceImage.width || refY < 0 || refY >= referenceImage.height) {
      return null;
    }

    return referenceImage.pixels[refY]?.[refX] ?? 0;
  }, [referenceImage, referenceOverlayOffset]);

  // Get pixel coords from reference canvas
  const getRefCanvasPixelCoords = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = refCanvasRef.current;
    if (!canvas || !referenceImage) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / zoom);
    const y = Math.floor((clientY - rect.top) / zoom);

    if (x < 0 || x >= referenceImage.width || y < 0 || y >= referenceImage.height) return null;
    return { x, y };
  }, [zoom, referenceImage]);

  // Handle click on reference canvas for eyedropper
  const handleRefCanvasClick = (e: React.MouseEvent) => {
    if (currentTool !== 'eyedropper' || !referenceImage) return;

    const coords = getRefCanvasPixelCoords(e.clientX, e.clientY);
    if (!coords) return;

    const pixel = referenceImage.pixels[coords.y]?.[coords.x];
    if (pixel && pixel.a > 0) {
      setColorAndAddToHistory(pixel);
      revertToPreviousTool();
    }
  };

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse button or Alt+click for panning
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return;

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords || !layer) return;

    // Reference trace tool: copy pixel from reference to canvas
    if (isReferenceTraceActive) {
      setIsTracing(true);
      const refPixel = getRefPixelAtCoord(coords.x, coords.y);
      if (refPixel) {
        setPixel(coords.x, coords.y, refPixel);
      }
      return;
    }

    // Eyedropper tool: pick color from first visible layer with a color (top to bottom)
    if (currentTool === 'eyedropper') {
      // When editing a variant, check the variant's pixel data
      if (editingVariant && variantData) {
        const variantLayer = variantData.variantFrame.layers[0];
        if (variantLayer) {
          const pixel = variantLayer.pixels[coords.y]?.[coords.x];
          if (pixel && pixel.a > 0) {
            setColorAndAddToHistory(pixel);
            revertToPreviousTool();
            return;
          }
        }
      }

      // Iterate through visible layers from top to bottom (reverse order since layers render bottom-to-top)
      if (frame && !editingVariant) {
        for (let i = frame.layers.length - 1; i >= 0; i--) {
          const l = frame.layers[i];
          if (!l.visible) continue;

          const pixel = l.pixels[coords.y]?.[coords.x];
          if (pixel && pixel.a > 0) {
            setColorAndAddToHistory(pixel);
            revertToPreviousTool();
            return;
          }
        }
      }

      // If no pixel on any visible layer, try reference image
      if (referenceImage) {
        const refPixel = getRefPixelAtCoord(coords.x, coords.y);
        if (refPixel && refPixel.a > 0) {
          setColorAndAddToHistory(refPixel);
          revertToPreviousTool();
          return;
        }
      }
      return;
    }

    // Move tool: start dragging pixels
    if (currentTool === 'move') {
      setIsDraggingPixels(true);
      setDragStartPixel(coords);
      setLastDragPixel(coords);
      return;
    }

    // Selection tool: start selecting region
    if (currentTool === 'selection') {
      setIsSelectingRegion(true);
      setSelectionStart(coords);
      setPreviewSelection({ x: coords.x, y: coords.y, width: 1, height: 1 });
      clearSelection(); // Clear any existing selection when starting a new one
      return;
    }

    startDrawing(coords);

    // Add current color to history when starting to draw (not for eraser)
    if (currentTool !== 'eraser') {
      addToColorHistory(currentColor);
    }

    if (currentTool === 'pixel') {
      setPixel(coords.x, coords.y, currentColor);
    } else if (currentTool === 'eraser') {
      setPixel(coords.x, coords.y, 0);
    } else if (currentTool === 'flood-fill') {
      // Get the correct pixel grid - variant frame's layer when editing variant
      const pixelGrid = editingVariant && variantData
        ? variantData.variantFrame.layers[0]?.pixels ?? layer.pixels
        : layer.pixels;
      const pixels = floodFill(pixelGrid, coords.x, coords.y, gridWidth, gridHeight, currentColor);
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === 'fill-square') {
      const pixels = getSquarePixels(coords, brushSize, currentColor);
      setPixels(pixels);
    }
  };

  // Track if we're tracing (dragging with reference trace tool)
  const [isTracing, setIsTracing] = useState(false);

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPanOffset({
        x: panOffset.x + dx,
        y: panOffset.y + dy
      });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords) {
      clearPreviewPixels();
      return;
    }

    // Handle reference trace dragging (continuous pixel copying)
    if (isTracing && isReferenceTraceActive) {
      const refPixel = getRefPixelAtCoord(coords.x, coords.y);
      if (refPixel) {
        setPixel(coords.x, coords.y, refPixel);
      }
      return;
    }

    // Handle move tool dragging
    if (isDraggingPixels && lastDragPixel) {
      const dx = coords.x - lastDragPixel.x;
      const dy = coords.y - lastDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        moveLayerPixels(dx, dy);
        setLastDragPixel(coords);
      }
      return;
    }

    // Handle selection tool dragging
    if (isSelectingRegion && selectionStart) {
      const minX = Math.min(selectionStart.x, coords.x);
      const minY = Math.min(selectionStart.y, coords.y);
      const maxX = Math.max(selectionStart.x, coords.x);
      const maxY = Math.max(selectionStart.y, coords.y);
      setPreviewSelection({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      });
      return;
    }

    if (!isDrawing || !drawStartPoint) {
      // Show hover preview for fill-square
      if (currentTool === 'fill-square') {
        setPreviewPixels(getSquarePixels(coords, brushSize, currentColor).map(p => ({ x: p.x, y: p.y })));
      }
      return;
    }

    // Handle drawing
    switch (currentTool) {
      case 'pixel':
        setPixel(coords.x, coords.y, currentColor);
        break;
      case 'eraser':
        setPixel(coords.x, coords.y, 0);
        break;
      case 'fill-square':
        setPixels(getSquarePixels(coords, brushSize, currentColor));
        break;
      case 'line':
        setPreviewPixels(getLinePixels(drawStartPoint, coords));
        break;
      case 'rectangle':
        setPreviewPixels(getRectanglePixels(drawStartPoint, coords, shapeMode, borderRadius));
        break;
      case 'ellipse':
        setPreviewPixels(getEllipsePixels(drawStartPoint, coords, shapeMode));
        break;
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isTracing) {
      setIsTracing(false);
      return;
    }

    if (isDraggingPixels) {
      setIsDraggingPixels(false);
      setDragStartPixel(null);
      setLastDragPixel(null);
      return;
    }

    // Finalize selection
    if (isSelectingRegion && previewSelection) {
      setSelection(previewSelection);
      setIsSelectingRegion(false);
      setSelectionStart(null);
      setPreviewSelection(null);
      return;
    }

    if (!isDrawing || !drawStartPoint) return;

    // Apply preview pixels as real pixels for shape tools
    if (previewPixels.length > 0 && (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'ellipse')) {
      const pixelData = previewPixels.map(p => ({
        x: p.x,
        y: p.y,
        color: currentColor as Color
      }));
      setPixels(pixelData);
    }

    endDrawing();
  };

  // Handle wheel for zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setZoom(zoom + delta);
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Two-finger touch for panning
      const touch = e.touches[0];
      setIsPanning(true);
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
      return;
    }

    const touch = e.touches[0];
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords || !layer) return;

    // Move tool: start dragging pixels
    if (currentTool === 'move') {
      setIsDraggingPixels(true);
      setDragStartPixel(coords);
      setLastDragPixel(coords);
      return;
    }

    startDrawing(coords);

    if (currentTool === 'pixel') {
      setPixel(coords.x, coords.y, currentColor);
    } else if (currentTool === 'eraser') {
      setPixel(coords.x, coords.y, 0);
    } else if (currentTool === 'flood-fill') {
      // Get the correct pixel grid - variant frame's layer when editing variant
      const pixelGrid = editingVariant && variantData
        ? variantData.variantFrame.layers[0]?.pixels ?? layer.pixels
        : layer.pixels;
      const pixels = floodFill(pixelGrid, coords.x, coords.y, gridWidth, gridHeight, currentColor);
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === 'fill-square') {
      const pixels = getSquarePixels(coords, brushSize, currentColor);
      setPixels(pixels);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPanning && lastPanPoint && e.touches.length >= 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastPanPoint.x;
      const dy = touch.clientY - lastPanPoint.y;
      setPanOffset({
        x: panOffset.x + dx,
        y: panOffset.y + dy
      });
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
      return;
    }

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords) return;

    // Handle move tool dragging
    if (isDraggingPixels && lastDragPixel) {
      const dx = coords.x - lastDragPixel.x;
      const dy = coords.y - lastDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        moveLayerPixels(dx, dy);
        setLastDragPixel(coords);
      }
      return;
    }

    if (!isDrawing) return;

    if (currentTool === 'pixel') {
      setPixel(coords.x, coords.y, currentColor);
    } else if (currentTool === 'eraser') {
      setPixel(coords.x, coords.y, 0);
    } else if (currentTool === 'fill-square') {
      setPixels(getSquarePixels(coords, brushSize, currentColor));
    }
  };

  const handleTouchEnd = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }
    if (isDraggingPixels) {
      setIsDraggingPixels(false);
      setDragStartPixel(null);
      setLastDragPixel(null);
      return;
    }
    endDrawing();
  };

  // Get cursor style based on tool
  const getCursorStyle = () => {
    if (currentTool === 'move') return 'move';
    if (currentTool === 'reference-trace') return 'copy';
    if (currentTool === 'eyedropper') return 'crosshair';
    if (currentTool === 'selection') return 'crosshair';
    return 'crosshair';
  };

  return (
    <div className="canvas-wrapper-outer">
      <div className="canvas-container" ref={containerRef} tabIndex={0}>
        <div
          className="canvas-wrapper"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`
          }}
        >
          {/* Reference Image Canvas */}
          {referenceImage && (
            <div className="reference-canvas-container">
              <div className="reference-label">📷 Reference</div>
              <canvas
                ref={refCanvasRef}
                width={referenceImage.width * zoom}
                height={referenceImage.height * zoom}
                className="reference-canvas"
                style={{ cursor: currentTool === 'eyedropper' ? 'crosshair' : 'default' }}
                onClick={handleRefCanvasClick}
              />
              <div className="reference-info">{referenceImage.width} × {referenceImage.height}</div>
            </div>
          )}

          {/* Main Editing Canvas */}
          <div className="main-canvas-container">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="pixel-canvas"
              style={{ cursor: getCursorStyle() }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            {/* Reference Trace Overlay */}
            {isReferenceTraceActive && (
              <canvas
                ref={overlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="reference-overlay-canvas"
              />
            )}
          </div>
        </div>
      </div>

      <div className="canvas-info">
        {editingVariant && variantData ? (
          <>
            <span className="variant-indicator">⬡ Variant: {variantData.variant.name}</span>
            <span className="separator">|</span>
            <span>{gridWidth} × {gridHeight}</span>
            <span className="separator">|</span>
            <span>Offset: ({variantOffset.x}, {variantOffset.y})</span>
            <span className="separator">|</span>
            <span>WASD to adjust offset</span>
          </>
        ) : (
          <>
            <span>{gridWidth} × {gridHeight}</span>
          </>
        )}
        <span className="separator">|</span>
        <span>Zoom: {zoom}x</span>
        <span className="separator">|</span>
        <span>↑↓←→ {selection ? 'move selection' : 'move pixels'}</span>
        {currentTool === 'move' && <span className="separator">|</span>}
        {currentTool === 'move' && <span>Drag to move</span>}
        {currentTool === 'selection' && <span className="separator">|</span>}
        {currentTool === 'selection' && <span>Drag to select • Esc to clear</span>}
        {selection && <span className="separator">|</span>}
        {selection && (
          <span className="selection-info">
            ⬚ Selection: {selection.width}×{selection.height} at ({selection.x}, {selection.y})
          </span>
        )}
        {currentTool === 'rectangle' && <span className="separator">|</span>}
        {currentTool === 'rectangle' && <span>Shift+↑↓ radius: {borderRadius}</span>}
        {isReferenceTraceActive && <span className="separator">|</span>}
        {isReferenceTraceActive && (
          <span className="trace-info">
            🎯 Offset: ({referenceOverlayOffset.x}, {referenceOverlayOffset.y})
          </span>
        )}
        {referenceImage && !isReferenceTraceActive && <span className="separator">|</span>}
        {referenceImage && !isReferenceTraceActive && <span>📷 Ref: {referenceImage.width}×{referenceImage.height}</span>}
      </div>
    </div>
  );
}
