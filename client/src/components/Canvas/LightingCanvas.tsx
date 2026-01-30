import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../../store';
import { Point, Normal, Pixel, PixelData } from '../../types';
import { composeLayers, renderWithLighting, renderNormalAsRGB, renderHeightAsGrayscale } from '../../utils/lightingRenderer';
import { getSquarePixels, getCirclePixels } from './drawingUtils';
import './LightingCanvas.css';

export function LightingCanvas() {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const normalCanvasRef = useRef<HTMLCanvasElement>(null);
  const heightCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewOverlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [lastDragPixel, setLastDragPixel] = useState<Point | null>(null);
  const [hoverPixel, setHoverPixel] = useState<Point | null>(null);

  const {
    project,
    getCurrentObject,
    getCurrentFrame,
    getCurrentLayer,
    getCurrentVariant,
    isEditingVariant,
    setNormalPixel,
    setNormalPixels
  } = useEditorStore();

  const obj = getCurrentObject();
  const frame = getCurrentFrame();
  const layer = getCurrentLayer();
  const variantData = getCurrentVariant();
  const editingVariant = isEditingVariant();

  const zoom = project?.uiState.zoom ?? 10;
  const brushSize = project?.uiState.brushSize ?? 1;
  const normalBrushShape = project?.uiState.normalBrushShape ?? 'circle';
  const selectedNormal = project?.uiState.selectedNormal ?? { x: 0, y: 0, z: 255 };
  const lightDirection = project?.uiState.lightDirection ?? { x: -64, y: -64, z: 180 };
  const lightColor = project?.uiState.lightColor ?? { r: 255, g: 250, b: 240, a: 255 };
  const ambientColor = project?.uiState.ambientColor ?? { r: 40, g: 45, b: 60, a: 255 };
  const heightScale = project?.uiState.heightScale ?? 100;

  // Get grid dimensions
  const objWidth = obj?.gridSize.width ?? 32;
  const objHeight = obj?.gridSize.height ?? 32;

  // When editing variant, use variant's grid size for the editable area
  const gridWidth = editingVariant && variantData
    ? variantData.variant.gridSize.width
    : objWidth;
  const gridHeight = editingVariant && variantData
    ? variantData.variant.gridSize.height
    : objHeight;

  const canvasWidth = gridWidth * zoom;
  const canvasHeight = gridHeight * zoom;

  // Get pixel coordinates from mouse event on normal/height canvas
  const getPixelCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
    return { x, y };
  }, [zoom, gridWidth, gridHeight]);

  // Check if a pixel has color data (can have normal painted)
  const hasColorAtPixel = useCallback((x: number, y: number): boolean => {
    if (!layer) return false;

    if (editingVariant && variantData) {
      const targetLayer = variantData.variantFrame.layers[0];
      if (!targetLayer) return false;
      const pixelData = targetLayer.pixels[y]?.[x];
      return pixelData?.color !== 0;
    }

    const pixelData = layer.pixels[y]?.[x];
    return pixelData?.color !== 0;
  }, [layer, editingVariant, variantData]);

  // Get brush pixels that have color (can be painted)
  const getPaintableBrushPixels = useCallback((center: Point): Point[] => {
    const brushPixelsWithColor = normalBrushShape === 'circle'
      ? getCirclePixels(center, brushSize, { r: 0, g: 0, b: 0, a: 255 })
      : getSquarePixels(center, brushSize, { r: 0, g: 0, b: 0, a: 255 });

    // Extract just the coordinates and filter to only pixels that have color and are within bounds
    return brushPixelsWithColor
      .map(p => ({ x: p.x, y: p.y }))
      .filter(p => {
        if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight) return false;
        return hasColorAtPixel(p.x, p.y);
      });
  }, [brushSize, normalBrushShape, gridWidth, gridHeight, hasColorAtPixel]);

  // Get the layer being edited for normal/height visualization
  const getEditLayer = useCallback(() => {
    if (!layer) return null;

    if (editingVariant && variantData) {
      return variantData.variantFrame.layers[0];
    }

    return layer;
  }, [layer, editingVariant, variantData]);

  // Render the lighting preview (composed frame with Phong lighting)
  const renderPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !frame || !obj) return;

    // Get base frame index for variant offset lookup
    const baseFrameIndex = obj.frames.findIndex(f => f.id === frame.id);

    // Compose all layers
    const composed = composeLayers(
      frame,
      objWidth,
      objHeight,
      baseFrameIndex >= 0 ? baseFrameIndex : 0,
      obj.variantGroups,
      project?.uiState.variantFrameIndices
    );

    // Apply lighting
    const litImage = renderWithLighting(composed, {
      lightDirection,
      lightColor,
      ambientColor,
      heightScale
    });

    // Use consistent dimensions for preview (always objWidth/objHeight, not gridWidth/gridHeight)
    const previewCanvasWidth = objWidth * zoom;
    const previewCanvasHeight = objHeight * zoom;

    // Draw checkerboard background
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, previewCanvasWidth, previewCanvasHeight);

    // Draw checkerboard
    const checkSize = zoom;
    for (let py = 0; py < objHeight; py++) {
      for (let px = 0; px < objWidth; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? '#2a2a3a' : '#222230';
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }

    // Draw the lit image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = objWidth;
    tempCanvas.height = objHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(litImage, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, previewCanvasWidth, previewCanvasHeight);
    }
  }, [frame, obj, objWidth, objHeight, zoom, lightDirection, lightColor, ambientColor, heightScale, project?.uiState.variantFrameIndices]);

  // Render the normal visualization
  const renderNormal = useCallback(() => {
    const canvas = normalCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const editLayer = getEditLayer();
    if (!canvas || !ctx || !editLayer) return;

    ctx.imageSmoothingEnabled = false;

    // Draw checkerboard background
    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (let py = 0; py < gridHeight; py++) {
      for (let px = 0; px < gridWidth; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? '#2a2a3a' : '#222230';
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }

    // Render normal as RGB
    const normalImage = renderNormalAsRGB(editLayer, gridWidth, gridHeight);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = gridWidth;
    tempCanvas.height = gridHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(normalImage, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= gridWidth; x++) {
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, canvasHeight);
    }
    for (let y = 0; y <= gridHeight; y++) {
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(canvasWidth, y * zoom + 0.5);
    }
    ctx.stroke();

    // Draw indicator showing which pixels can be edited (have color)
    ctx.fillStyle = 'rgba(0, 217, 255, 0.15)';
    for (let py = 0; py < gridHeight; py++) {
      const row = editLayer.pixels[py];
      if (!row) continue;
      for (let px = 0; px < gridWidth; px++) {
        const pd = row[px];
        if (pd && pd.color !== 0 && pd.normal === 0) {
          // Has color but no normal - highlight as editable
          ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
        }
      }
    }
  }, [getEditLayer, gridWidth, gridHeight, canvasWidth, canvasHeight, zoom]);

  // Render the height visualization
  const renderHeight = useCallback(() => {
    const canvas = heightCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const editLayer = getEditLayer();
    if (!canvas || !ctx || !editLayer) return;

    ctx.imageSmoothingEnabled = false;

    // Draw checkerboard background
    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (let py = 0; py < gridHeight; py++) {
      for (let px = 0; px < gridWidth; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? '#2a2a3a' : '#222230';
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }

    // Render height as grayscale
    const heightImage = renderHeightAsGrayscale(editLayer, gridWidth, gridHeight);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = gridWidth;
    tempCanvas.height = gridHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(heightImage, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= gridWidth; x++) {
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, canvasHeight);
    }
    for (let y = 0; y <= gridHeight; y++) {
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(canvasWidth, y * zoom + 0.5);
    }
    ctx.stroke();
  }, [getEditLayer, gridWidth, gridHeight, canvasWidth, canvasHeight, zoom]);

  // Render hover preview overlay
  const renderPreviewOverlay = useCallback(() => {
    const canvas = previewOverlayRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !hoverPixel) {
      if (canvas) {
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const paintablePixels = getPaintableBrushPixels(hoverPixel);

    // Draw transparent overlay for pixels that will be affected
    ctx.fillStyle = 'rgba(0, 217, 255, 0.3)'; // Cyan with transparency
    for (const pixel of paintablePixels) {
      ctx.fillRect(pixel.x * zoom, pixel.y * zoom, zoom, zoom);
    }

    // Draw border around the brush area
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.6)';
    ctx.lineWidth = 1;
    for (const pixel of paintablePixels) {
      ctx.strokeRect(pixel.x * zoom + 0.5, pixel.y * zoom + 0.5, zoom - 1, zoom - 1);
    }
  }, [hoverPixel, getPaintableBrushPixels, zoom]);

  // Render all canvases
  useEffect(() => {
    renderPreview();
    renderNormal();
    renderHeight();
  }, [renderPreview, renderNormal, renderHeight, project]);

  // Render preview overlay when hover changes
  useEffect(() => {
    renderPreviewOverlay();
  }, [renderPreviewOverlay]);

  // Handle mouse interaction on normal canvas
  const handleNormalMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoords(e);
    if (!coords) return;

    const paintablePixels = getPaintableBrushPixels(coords);
    if (paintablePixels.length > 0) {
      setIsDragging(true);
      setLastDragPixel(coords);
      setHoverPixel(null); // Clear hover when dragging

      // Paint all pixels in brush
      const pixelsToUpdate = paintablePixels.map(p => ({
        x: p.x,
        y: p.y,
        normal: selectedNormal
      }));
      setNormalPixels(pixelsToUpdate);
    }
  };

  const handleNormalMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoords(e);

    if (isDragging) {
      if (!coords) {
        setHoverPixel(null);
        return;
      }

      // Avoid repainting the same area
      if (lastDragPixel && coords.x === lastDragPixel.x && coords.y === lastDragPixel.y) {
        return;
      }

      const paintablePixels = getPaintableBrushPixels(coords);
      if (paintablePixels.length > 0) {
        setLastDragPixel(coords);

        // Paint all pixels in brush
        const pixelsToUpdate = paintablePixels.map(p => ({
          x: p.x,
          y: p.y,
          normal: selectedNormal
        }));
        setNormalPixels(pixelsToUpdate);
      }
    } else {
      // Update hover preview
      setHoverPixel(coords);
    }
  };

  const handleNormalMouseUp = () => {
    setIsDragging(false);
    setLastDragPixel(null);
  };

  const handleNormalMouseLeave = () => {
    setIsDragging(false);
    setLastDragPixel(null);
    setHoverPixel(null);
  };

  if (!project || !frame || !obj) {
    return (
      <div className="lighting-canvas-container">
        <div className="lighting-canvas-empty">
          Select an object and frame to edit lighting
        </div>
      </div>
    );
  }

  return (
    <div className="lighting-canvas-container" ref={containerRef}>
      <div className="lighting-canvas-row">
        {/* Lighting Preview */}
        <div className="lighting-canvas-panel">
          <div className="lighting-canvas-label">
            <span className="label-icon">💡</span>
            Lighting Preview
          </div>
          <div className="lighting-canvas-wrapper">
            <canvas
              ref={previewCanvasRef}
              width={objWidth * zoom}
              height={objHeight * zoom}
              className="lighting-preview-canvas"
              style={{ width: `${objWidth * zoom}px`, height: `${objHeight * zoom}px` }}
            />
          </div>
        </div>

        {/* Normal Editor */}
        <div className="lighting-canvas-panel">
          <div className="lighting-canvas-label">
            <span className="label-icon">🔆</span>
            Normal Editor
            <span className="label-hint">(RGB = XYZ)</span>
          </div>
          <div className="lighting-canvas-wrapper">
            <canvas
              ref={normalCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="lighting-normal-canvas"
              onMouseDown={handleNormalMouseDown}
              onMouseMove={handleNormalMouseMove}
              onMouseUp={handleNormalMouseUp}
              onMouseLeave={handleNormalMouseLeave}
            />
            <canvas
              ref={previewOverlayRef}
              width={canvasWidth}
              height={canvasHeight}
              className="lighting-preview-overlay"
            />
          </div>
        </div>

        {/* Height Viewer */}
        <div className="lighting-canvas-panel">
          <div className="lighting-canvas-label">
            <span className="label-icon">📊</span>
            Height Map
            <span className="label-hint">(Read-only)</span>
          </div>
          <div className="lighting-canvas-wrapper">
            <canvas
              ref={heightCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="lighting-height-canvas"
            />
          </div>
        </div>
      </div>

      <div className="lighting-canvas-info">
        <span>{gridWidth} × {gridHeight}</span>
        <span className="separator">|</span>
        <span>Zoom: {zoom}x</span>
        <span className="separator">|</span>
        <span>Click on Normal Editor to paint normals on colored pixels</span>
      </div>
    </div>
  );
}

