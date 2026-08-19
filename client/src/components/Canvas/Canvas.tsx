import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "../../store";
import { Color, Point, SelectionBox, Pixel, PixelData } from "../../types";
import type { Layer } from "../../types";
import {
  getLinePixels,
  getRectanglePixels,
  getEllipsePixels,
  floodFill,
  gaussianFloodFill,
  getSquarePixels,
  getCirclePixels,
} from "./drawingUtils";
import type { ReferenceImageData } from "../../types/referenceImage";
import { resolveVariantOffset } from "../../ui/canvas/model/variantOffset";
import { screenToPixel } from "../../ui/canvas/model/coords";
import type { CanvasViewGeometry } from "../../ui/canvas/model/coords";
import {
  backgroundTheme,
  paintCheckerboard,
  strokeGrid,
} from "../../ui/canvas/render/canvasBackground";
import type { BackgroundGeometry } from "../../ui/canvas/render/canvasBackground";
import {
  renderFrameOverlay as renderFrameOverlayBuffer,
  overlayVariantFrameIndices,
  FRAME_OVERLAY_MODE,
  FRAME_TRACE_MODE,
} from "../../ui/canvas/render/renderFrameOverlay";
import { drawOriginCross } from "../../ui/canvas/render/renderOriginCross";
import {
  drawLasso,
  drawMarchingAnts,
} from "../../ui/canvas/render/renderSelectionOverlay";
import "./Canvas.css";

// Helper to extract color from PixelData.
//
// Takes `unknown` because the pure renderers under ui/canvas/ deliberately do
// not import the domain `PixelData` type — they treat a pixel cell as opaque
// and delegate reading it to this callback. The narrowing happens here.
function getPixelColor(cell: unknown): Pixel | null {
  const pd = cell as PixelData | undefined;
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

interface CanvasProps {
  referenceImage?: ReferenceImageData | null;
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  overlayFrameIndex?: number | null;
}

export function Canvas({ referenceImage, overlayFrameIndex }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Continuous stroke support: track the last pixel we applied while dragging.
  // Prevents "speckling" when pointer events are sparse during fast drags.
  const lastStrokePixelRef = useRef<Point | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [isDraggingPixels, setIsDraggingPixels] = useState(false);
  const [lastDragPixel, setLastDragPixel] = useState<Point | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [previewSelection, setPreviewSelection] = useState<SelectionBox | null>(
    null,
  );
  const [isLassoSelecting, setIsLassoSelecting] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionDragMode, setSelectionDragMode] = useState<
    "pixels" | "selection" | null
  >(null);
  const [lastSelectionDragPixel, setLastSelectionDragPixel] =
    useState<Point | null>(null);
  const [pixelDragOffset, setPixelDragOffset] = useState<{
    dx: number;
    dy: number;
  }>({
    dx: 0,
    dy: 0,
  });

  // Offscreen canvas refs for caching static content
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheKeyRef = useRef<string>("");
  const gridCacheKeyRef = useRef<string>("");
  const renderRequestRef = useRef<number | null>(null);

  // View zoom: CSS transform scale for pinch/gesture only. No re-render; buttery smooth.
  const [viewZoom, setViewZoom] = useState(1);

  // Two-finger pinch zoom (touch): track initial state so we can scale smoothly
  const pinchStartRef = useRef<{
    distance: number;
    center: { x: number; y: number };
    viewZoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  // Zoom anchor lock: use a fixed focal point for 100ms after each zoom step to avoid jitter from bounds
  const ZOOM_ANCHOR_MS = 100;
  const zoomAnchorLockRef = useRef<{
    anchor: { x: number; y: number };
    timeoutId: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // Refs for native wheel handler (passive: false so preventDefault works for pinch)
  const wheelStateRef = useRef({
    viewPanOffset: { x: 0, y: 0 },
    canvasWidth: 320,
    canvasHeight: 320,
    viewZoom: 1,
    setViewZoom: (_: number | ((prev: number) => number)) => {},
    clampPanToViewport: (o: { x: number; y: number }, _w: number, _h: number) =>
      o,
  });

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
    beginStroke,
    endStroke,
    setPixel,
    setPixels,
    startDrawing,
    endDrawing,
    setPreviewPixels,
    clearPreviewPixels,
    setPanOffset,
    moveLayerPixels,
    setBorderRadius,
    deleteSelectedFrame,
    undo,
    moveReferenceOverlay,
    frameTraceActive,
    frameTraceFrameIndex,
    frameOverlayOffset,
    moveFrameOverlay,
    setFrameTraceActive,
    getFrameReferenceObject,
    setColorAndAddToHistory,
    addToColorHistory,
    revertToPreviousTool,
    setTool,
    setSelection,
    clearSelection,
    moveSelectedPixels,
    moveSelection,
    deleteSelectionPixels,
    selectFloodFillAt,
    selectAllByColorAt,
    selectLasso,
    selectFrame,
    setVariantOffset,
    advanceVariantFrames,
    setObjectOrigin,
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
  const gridWidth =
    editingVariant && variantData
      ? variantData.variant.gridSize.width
      : objWidth;
  const gridHeight =
    editingVariant && variantData
      ? variantData.variant.gridSize.height
      : objHeight;

  const zoom = project?.uiState.zoom ?? 10;
  const panOffset = project?.uiState.panOffset ?? { x: 0, y: 0 };
  const lightGridMode = project?.uiState.lightGridMode ?? false;
  const currentTool = project?.uiState.selectedTool ?? "pixel";
  const selectionMode = project?.uiState.selectionMode ?? "rect";
  const selectionBehavior = project?.uiState.selectionBehavior ?? "movePixels";

  // View pan (transform-only). We debounce-commit into the store so gestures don't cause heavy rerenders.
  const [viewPanOffset, setViewPanOffset] = useState(panOffset);
  const viewPanRef = useRef(viewPanOffset);
  const panCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const scheduleCommitPan = useCallback(() => {
    if (panCommitTimeoutRef.current) clearTimeout(panCommitTimeoutRef.current);
    panCommitTimeoutRef.current = setTimeout(() => {
      setPanOffset(viewPanRef.current);
    }, 150);
  }, [setPanOffset]);

  useEffect(() => {
    viewPanRef.current = viewPanOffset;
  }, [viewPanOffset]);

  // Sync local pan when switching objects/frames/modes (e.g. project context changes)
  useEffect(() => {
    viewPanRef.current = panOffset;
    setViewPanOffset(panOffset);
    if (panCommitTimeoutRef.current) {
      clearTimeout(panCommitTimeoutRef.current);
      panCommitTimeoutRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project?.uiState.selectedObjectId,
    project?.uiState.selectedFrameId,
    project?.uiState.studioMode,
  ]);

  // Clamp pan so the canvas can move freely within the entire canvas-area viewport
  const clampPanToViewport = useCallback(
    (
      offset: { x: number; y: number },
      contentWidth: number,
      contentHeight: number,
    ) => {
      const container = containerRef.current;
      if (!container) return offset;
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const minX = Math.min(0, viewW - contentWidth);
      const maxX = Math.max(0, viewW - contentWidth);
      const minY = Math.min(0, viewH - contentHeight);
      const maxY = Math.max(0, viewH - contentHeight);
      return {
        x: Math.max(minX, Math.min(maxX, offset.x)),
        y: Math.max(minY, Math.min(maxY, offset.y)),
      };
    },
    [],
  );
  const currentColor = project?.uiState.selectedColor ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 255,
  };
  const brushSize = project?.uiState.brushSize ?? 1;
  const pencilBrushShape = project?.uiState.pencilBrushShape ?? "square";
  const traceNudgeAmount = project?.uiState.traceNudgeAmount ?? 10;
  const shapeMode = project?.uiState.shapeMode ?? "both";
  const borderRadius = project?.uiState.borderRadius ?? 0;
  const eraserShape = project?.uiState.eraserShape ?? "circle";

  // Get variant offset if editing variant (now from baseFrameOffsets)
  const variantOffset =
    editingVariant && variantData ? variantData.offset : { x: 0, y: 0 };

  // Create a stable key for the offset to ensure useEffect triggers on offset changes
  // (React's dependency comparison doesn't deep-compare objects)
  const variantOffsetKey = `${variantOffset.x},${variantOffset.y}`;

  // When editing a variant, view bounds = union of object bounds and variant bounds so the full variant is visible/editable
  const viewMinX =
    editingVariant && variantData ? Math.min(0, variantOffset.x) : 0;
  const viewMinY =
    editingVariant && variantData ? Math.min(0, variantOffset.y) : 0;
  const viewMaxX =
    editingVariant && variantData
      ? Math.max(objWidth, variantOffset.x + gridWidth)
      : objWidth;
  const viewMaxY =
    editingVariant && variantData
      ? Math.max(objHeight, variantOffset.y + gridHeight)
      : objHeight;
  const viewWidth = viewMaxX - viewMinX;
  const viewHeight = viewMaxY - viewMinY;

  // Calculate canvas size - when editing variant, use expanded view so variant isn't clipped
  const canvasWidth = editingVariant ? viewWidth * zoom : gridWidth * zoom;
  const canvasHeight = editingVariant ? viewHeight * zoom : gridHeight * zoom;
  wheelStateRef.current = {
    viewPanOffset: viewPanRef.current,
    canvasWidth,
    canvasHeight,
    viewZoom,
    setViewZoom,
    clampPanToViewport,
  };

  // Cache key for background/grid (only recreate when size changes; when editing variant use view size)
  const bgCacheKey = editingVariant
    ? `view-${viewWidth}-${viewHeight}-${viewMinX}-${viewMinY}-${zoom}-${lightGridMode ? "l" : "d"}`
    : `${gridWidth}-${gridHeight}-${zoom}-${lightGridMode ? "l" : "d"}`;

  // View geometry the pure coordinate mapper runs against. Rebuilt per render;
  // `screenToPixel` itself lives in ui/canvas/model/coords.ts and is store-free.
  const coordGeom: CanvasViewGeometry = {
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    editingVariant: Boolean(editingVariant && variantData),
    variantOffset,
    viewMinX,
    viewMinY,
    viewWidth,
    viewHeight,
  };
  const coordGeomRef = useRef(coordGeom);
  coordGeomRef.current = coordGeom;

  // Get pixel from canvas coordinates. Uses getBoundingClientRect() so it works
  // with the view zoom transform (scale) — no dependency on zoom or viewZoom.
  const getPixelCoords = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "pixel",
      );
    },
    [],
  );

  // Get origin coords snapped to nearest half-pixel. Uses rect so it works with
  // view zoom.
  const getOriginCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "origin",
      );
    },
    [],
  );

  // Geometry shared by the checkerboard and the grid. Both are pure functions
  // in ui/canvas/render/canvasBackground.ts; this component only owns the
  // offscreen-canvas CACHE around them.
  const bgGeom: BackgroundGeometry = {
    canvasWidth,
    canvasHeight,
    cellsX: editingVariant ? viewWidth : gridWidth,
    cellsY: editingVariant ? viewHeight : gridHeight,
    offsetX: editingVariant ? viewMinX : 0,
    offsetY: editingVariant ? viewMinY : 0,
    zoom,
  };
  const bgGeomRef = useRef(bgGeom);
  bgGeomRef.current = bgGeom;

  // Create or update cached background canvas (checkerboard)
  const ensureBgCanvas = useCallback(() => {
    if (bgCacheKeyRef.current === bgCacheKey && bgCanvasRef.current) {
      return bgCanvasRef.current;
    }

    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement("canvas");
    }
    const bgCanvas = bgCanvasRef.current;
    bgCanvas.width = canvasWidth;
    bgCanvas.height = canvasHeight;
    const bgCtx = bgCanvas.getContext("2d");
    if (!bgCtx) return bgCanvas;

    const imageData = bgCtx.createImageData(canvasWidth, canvasHeight);
    paintCheckerboard(
      imageData,
      bgGeomRef.current,
      backgroundTheme(lightGridMode),
    );
    bgCtx.putImageData(imageData, 0, 0);

    bgCacheKeyRef.current = bgCacheKey;
    return bgCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, lightGridMode]);

  // Create or update cached grid canvas
  const ensureGridCanvas = useCallback(() => {
    if (gridCacheKeyRef.current === bgCacheKey && gridCanvasRef.current) {
      return gridCanvasRef.current;
    }

    if (!gridCanvasRef.current) {
      gridCanvasRef.current = document.createElement("canvas");
    }
    const gridCanvas = gridCanvasRef.current;
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    const gridCtx = gridCanvas.getContext("2d");
    if (!gridCtx) return gridCanvas;

    gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    strokeGrid(gridCtx, bgGeomRef.current, backgroundTheme(lightGridMode));

    gridCacheKeyRef.current = bgCacheKey;
    return gridCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, lightGridMode]);

  // Optimized render - uses cached offscreen canvases for static content
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !frame || !obj) return;

    ctx.imageSmoothingEnabled = false;

    // Draw cached background (checkerboard)
    const bgCanvas = ensureBgCanvas();
    ctx.drawImage(bgCanvas, 0, 0);

    // When editing a variant, translate so world (viewMinX, viewMinY) is at canvas (0,0) — full variant area visible
    if (editingVariant && variantData) {
      ctx.save();
      ctx.translate(-viewMinX * zoom, -viewMinY * zoom);
    }

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
          // Look up variant from project.variants (not obj.variantGroups)
          const vg = project?.variants?.find(
            (vg) => vg.id === l.variantGroupId,
          );
          const variant = vg?.variants.find(
            (v) => v.id === l.selectedVariantId,
          );
          const variantFrameIdx =
            project?.uiState.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          // Get base frame index for fallback offset lookup
          const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

          if (variant && vFrame) {
            const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);
            const isCurrentLayer = l.id === layer?.id;

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = getPixelColor(row[x]);
                  if (pixel && pixel.a > 0) {
                    const drawX = (x + vOffset.x) * zoom;
                    const drawY = (y + vOffset.y) * zoom;
                    const worldX = x + vOffset.x;
                    const worldY = y + vOffset.y;
                    const inView =
                      worldX >= viewMinX &&
                      worldX < viewMaxX &&
                      worldY >= viewMinY &&
                      worldY < viewMaxY;
                    if (inView) {
                      // Dim non-current variant layers slightly
                      const alpha = isCurrentLayer
                        ? pixel.a / 255
                        : (pixel.a / 255) * 0.7;
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
              const pixel = getPixelColor(row[x]);
              if (pixel && pixel.a > 0) {
                ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${(pixel.a / 255) * 0.5})`;
                ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
              }
            }
          }
        }
      }

      // Draw preview pixels at variant offset
      if (previewPixels.length > 0) {
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${(currentColor.a / 255) * 0.6})`;
        for (const { x, y } of previewPixels) {
          if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            const drawX = (x + variantOffset.x) * zoom;
            const drawY = (y + variantOffset.y) * zoom;
            ctx.fillRect(drawX, drawY, zoom, zoom);
          }
        }
      }

      // Draw grid only over variant edit area
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
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
      ctx.strokeStyle = "rgba(255, 171, 0, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, objWidth * zoom, objHeight * zoom);
      ctx.setLineDash([]);

      // Draw outline around current variant editing area
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        variantOffset.x * zoom,
        variantOffset.y * zoom,
        gridWidth * zoom,
        gridHeight * zoom,
      );
    } else {
      // Normal mode - render all layers
      // Get base frame index for fallback offset lookup
      const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

      for (const l of frame.layers) {
        if (!l.visible) continue;

        // For variant layers, render the selected variant's pixels at the offset
        if (l.isVariant && l.variantGroupId) {
          // Look up variant from project.variants (not obj.variantGroups)
          const vg = project?.variants?.find(
            (vg) => vg.id === l.variantGroupId,
          );
          const variant = vg?.variants.find(
            (v) => v.id === l.selectedVariantId,
          );
          const variantFrameIdx =
            project?.uiState.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          if (variant && vFrame) {
            const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = getPixelColor(row[x]);
                  if (pixel && pixel.a > 0) {
                    const drawX = (x + vOffset.x) * zoom;
                    const drawY = (y + vOffset.y) * zoom;
                    if (
                      drawX >= 0 &&
                      drawX < canvasWidth &&
                      drawY >= 0 &&
                      drawY < canvasHeight
                    ) {
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
              const pixel = getPixelColor(row[x]);
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
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${(currentColor.a / 255) * 0.6})`;
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

    const offsetX = editingVariant ? variantOffset.x : 0;
    const offsetY = editingVariant ? variantOffset.y : 0;
    const dragDx =
      isDraggingSelection && selectionDragMode === "pixels"
        ? pixelDragOffset.dx
        : 0;
    const dragDy =
      isDraggingSelection && selectionDragMode === "pixels"
        ? pixelDragOffset.dy
        : 0;

    // Draw selection mask fill (finalized selection only)
    if (
      selection &&
      !previewSelection &&
      selection.width === gridWidth &&
      selection.height === gridHeight
    ) {
      // Only draw mask fill if it isn't huge (keeps things snappy on big grids)
      if (selection.mask.size <= 20000) {
        ctx.fillStyle = "rgba(0, 217, 255, 0.14)";
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect(
            (x + offsetX + dragDx) * zoom,
            (y + offsetY + dragDy) * zoom,
            zoom,
            zoom,
          );
        }
      }
    }

    // While dragging "move pixels", show a non-destructive preview overlay of moved pixels.
    if (
      isDraggingSelection &&
      selectionDragMode === "pixels" &&
      selection &&
      (dragDx !== 0 || dragDy !== 0) &&
      selection.width === gridWidth &&
      selection.height === gridHeight
    ) {
      const srcPixels =
        editingVariant && variantData
          ? variantData.variantFrame.layers[0]?.pixels
          : layer?.pixels;

      if (srcPixels && selection.mask.size <= 20000) {
        // Shade original area slightly (doesn't change data, just visual)
        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect((x + offsetX) * zoom, (y + offsetY) * zoom, zoom, zoom);
        }

        // Draw moved pixels on top
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          const destX = x + dragDx;
          const destY = y + dragDy;
          if (
            destX < 0 ||
            destX >= gridWidth ||
            destY < 0 ||
            destY >= gridHeight
          )
            continue;
          const pixel = getPixelColor(srcPixels[y]?.[x]);
          if (!pixel || pixel.a === 0) continue;
          ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
          ctx.fillRect(
            (destX + offsetX) * zoom,
            (destY + offsetY) * zoom,
            zoom,
            zoom,
          );
        }
      }
    }

    // Draw lasso preview path
    if (isLassoSelecting) {
      drawLasso(ctx, lassoPoints, zoom, offsetX, offsetY);
    }

    // Draw selection box (preview or finalized)
    const selBox = previewSelection || selection?.bounds;
    if (selBox) {
      drawMarchingAnts(ctx, selBox, zoom, offsetX, offsetY, dragDx, dragDy);
    }

    // Draw origin cross only when the move origin tool is selected
    const originPos = obj.origin;
    if (originPos && currentTool === "origin") {
      const oc = project?.uiState.originColor ?? {
        r: 255,
        g: 50,
        b: 50,
        a: 255,
      };
      drawOriginCross(ctx, originPos, zoom, oc);
    }

    if (editingVariant && variantData) {
      ctx.restore();
    }
  }, [
    frame,
    obj,
    layer,
    previewPixels,
    currentColor,
    zoom,
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    canvasWidth,
    canvasHeight,
    ensureBgCanvas,
    ensureGridCanvas,
    selection,
    previewSelection,
    editingVariant,
    variantData,
    variantOffsetKey,
    viewMinX,
    viewMinY,
    viewMaxX,
    viewMaxY,
    project?.uiState.variantFrameIndices,
    project?.uiState.originColor,
    currentTool,
    isDraggingSelection,
    selectionDragMode,
    pixelDragOffset.dx,
    pixelDragOffset.dy,
    isLassoSelecting,
    lassoPoints,
  ]);

  // Check if reference trace tool is active
  const isReferenceTraceActive =
    currentTool === "reference-trace" && referenceImage != null;

  // Get the frame reference object (may be different from current object)
  const frameRefObj = getFrameReferenceObject();

  // Get overlay frame if specified (from frame reference object)
  const overlayFrame =
    overlayFrameIndex !== null && overlayFrameIndex !== undefined && frameRefObj
      ? frameRefObj.frames[overlayFrameIndex]
      : null;

  // Get frame trace frame if trace mode is active (from frame reference object)
  const frameTraceFrame =
    frameTraceActive && frameTraceFrameIndex !== null && frameRefObj
      ? frameRefObj.frames[frameTraceFrameIndex]
      : null;

  // Render reference overlay (transparent overlay on top of main canvas)
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
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

    // When editing variant, overlay canvas shows expanded view — draw in view space (world - viewMin)
    const ox = editingVariant && variantData ? viewMinX : 0;
    const oy = editingVariant && variantData ? viewMinY : 0;

    // Draw reference pixels with transparency at the offset position
    ctx.globalAlpha = 0.5;

    for (let y = 0; y < referenceImage.height; y++) {
      const row = referenceImage.pixels[y];
      if (!row) continue;
      for (let x = 0; x < referenceImage.width; x++) {
        const pixel = row[x];
        if (pixel && pixel.a > 0) {
          const drawX = (x + referenceOverlayOffset.x - ox) * zoom;
          const drawY = (y + referenceOverlayOffset.y - oy) * zoom;

          // Only draw if within canvas bounds
          if (
            drawX >= 0 &&
            drawX < canvasWidth &&
            drawY >= 0 &&
            drawY < canvasHeight
          ) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(drawX, drawY, zoom, zoom);
          }
        }
      }
    }

    ctx.globalAlpha = 1;

    // Draw a subtle border around the reference area
    ctx.strokeStyle = "rgba(255, 171, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const overlayX = (referenceOverlayOffset.x - ox) * zoom;
    const overlayY = (referenceOverlayOffset.y - oy) * zoom;
    const overlayW = referenceImage.width * zoom;
    const overlayH = referenceImage.height * zoom;
    ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);
    ctx.setLineDash([]);
  }, [
    referenceImage,
    isReferenceTraceActive,
    canvasWidth,
    canvasHeight,
    zoom,
    referenceOverlayOffset,
    editingVariant,
    variantData,
    viewMinX,
    viewMinY,
  ]);

  // Render frame overlay (transparent overlay on top of main canvas)
  // Uses the same rendering strategy as thumbnails for consistency
  // Frame overlay (#8) and frame-trace overlay (#9) were ~200 lines of
  // near-duplicate code. Both now call ONE parameterised buffer renderer,
  // `renderFrameOverlay` in ui/canvas/render/renderFrameOverlay.ts, which
  // documents the SIX ways the two genuinely differ.
  const drawOverlayCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      overlaySourceFrame: { id: string; layers: Layer[] } | null | undefined,
      mode: typeof FRAME_OVERLAY_MODE | typeof FRAME_TRACE_MODE,
      drawOffset: { x: number; y: number },
      active: boolean,
    ) => {
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !overlaySourceFrame || !frameRefObj || !active) {
        // Clear canvas if not active
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      const refObjWidth = frameRefObj.gridSize.width;
      const refObjHeight = frameRefObj.gridSize.height;

      // When editing variant, overlay shows expanded view — draw in view space
      const ox = editingVariant && variantData ? viewMinX : 0;
      const oy = editingVariant && variantData ? viewMinY : 0;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      const frameIndex = frameRefObj.frames.findIndex(
        (f) => f.id === overlaySourceFrame.id,
      );
      const variants = project?.variants;
      const variantFrameIndices = overlayVariantFrameIndices(
        variants,
        frameIndex,
      );

      // createImageData is already zero-filled — the originals' explicit
      // transparent-fill loop was redundant.
      const imageData = tempCtx.createImageData(canvasWidth, canvasHeight);

      renderFrameOverlayBuffer(imageData, {
        layers: overlaySourceFrame.layers,
        refObjWidth,
        refObjHeight,
        zoom,
        ox,
        oy,
        variants,
        variantFrameIndices,
        frameIndex,
        getPixelColor,
        composite: mode.composite,
        clipToObject: mode.clipToObject,
        cellFill: mode.cellFill,
        renderOrphanVariantLayers: mode.renderOrphanVariantLayers,
      });

      tempCtx.putImageData(imageData, 0, 0);

      const drawX = (drawOffset.x - ox) * zoom;
      const drawY = (drawOffset.y - oy) * zoom;

      ctx.globalAlpha = mode.opacity;
      ctx.drawImage(tempCanvas, drawX, drawY);
      ctx.globalAlpha = 1;

      // Subtle dashed border around the overlay
      ctx.strokeStyle = mode.borderColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([...mode.borderDash]);
      ctx.strokeRect(drawX, drawY, refObjWidth * zoom, refObjHeight * zoom);
      ctx.setLineDash([]);
    },
    [
      canvasWidth,
      canvasHeight,
      zoom,
      frameRefObj,
      project?.variants,
      editingVariant,
      variantData,
      viewMinX,
      viewMinY,
    ],
  );

  const renderFrameOverlay = useCallback(() => {
    drawOverlayCanvas(
      frameOverlayCanvasRef.current,
      overlayFrame,
      FRAME_OVERLAY_MODE,
      // #8 draws at the origin — it does NOT honour frameOverlayOffset.
      { x: 0, y: 0 },
      Boolean(overlayFrame),
    );
  }, [drawOverlayCanvas, overlayFrame]);

  // Use a ref to always have access to the latest render function
  const renderRef = useRef(render);
  renderRef.current = render;

  // Render frame trace overlay (transparent overlay on top of main canvas, similar to reference trace)
  const renderFrameTraceOverlay = useCallback(() => {
    drawOverlayCanvas(
      frameTraceOverlayCanvasRef.current,
      frameTraceFrame,
      FRAME_TRACE_MODE,
      // #9 DOES honour the user-nudgeable trace offset.
      frameOverlayOffset,
      Boolean(frameTraceFrame && frameTraceActive),
    );
  }, [
    drawOverlayCanvas,
    frameTraceFrame,
    frameTraceActive,
    frameOverlayOffset,
  ]);

  // Render overlay when trace tool state changes
  useEffect(() => {
    renderOverlay();
  }, [renderOverlay, referenceOverlayOffset, isReferenceTraceActive]);

  // Render frame trace overlay when it changes
  useEffect(() => {
    renderFrameTraceOverlay();
  }, [renderFrameTraceOverlay]);

  // Render frame overlay when it changes
  useEffect(() => {
    renderFrameOverlay();
  }, [renderFrameOverlay, overlayFrameIndex]);

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
  }, [
    frame,
    previewPixels,
    currentColor,
    zoom,
    gridWidth,
    gridHeight,
    canvasWidth,
    canvasHeight,
    variantOffsetKey,
    project,
    obj,
    selection,
    previewSelection,
    isLassoSelecting,
    lassoPoints,
    isDraggingSelection,
    selectionDragMode,
    pixelDragOffset.dx,
    pixelDragOffset.dy,
  ]);

  // Clear selection if the editable grid size changes (prevents stale masks across modes)
  useEffect(() => {
    if (
      selection &&
      (selection.width !== gridWidth || selection.height !== gridHeight)
    ) {
      clearSelection();
    }
  }, [selection, gridWidth, gridHeight, clearSelection]);

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Cmd/Ctrl + Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }

      // Delete key to delete selected frame
      if (e.key === "Delete" || e.key === "Backspace") {
        // Only if not in an input field
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          if (selection) {
            deleteSelectionPixels();
          } else {
            deleteSelectedFrame();
          }
          return;
        }
      }

      // Number keys 1-9,0 for tool selection, O for origin
      const toolHotkeys: {
        [key: string]:
          | "pixel"
          | "eraser"
          | "eyedropper"
          | "fill-square"
          | "flood-fill"
          | "gaussian-fill"
          | "line"
          | "rectangle"
          | "ellipse"
          | "move"
          | "selection"
          | "origin";
      } = {
        "1": "pixel",
        "2": "eraser",
        "3": "eyedropper",
        "4": "fill-square",
        "5": "flood-fill",
        "6": "line",
        "7": "rectangle",
        "8": "ellipse",
        "9": "move",
        "0": "selection",
        g: "gaussian-fill",
        G: "gaussian-fill",
        o: "origin",
        O: "origin",
      };

      if (toolHotkeys[e.key]) {
        e.preventDefault();
        // Clear selection when switching away from selection tool
        if (currentTool === "selection" && toolHotkeys[e.key] !== "selection") {
          clearSelection();
        }
        setTool(toolHotkeys[e.key]);
        return;
      }

      // WASD keys for reference trace tool - move reference overlay (priority over frame trace and variant offset)
      if (
        isReferenceTraceActive &&
        ["w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)
      ) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        let dx = 0,
          dy = 0;
        if (key === "w") dy = -1;
        if (key === "s") dy = 1;
        if (key === "a") dx = -1;
        if (key === "d") dx = 1;
        const step = e.shiftKey ? traceNudgeAmount : 1;
        moveReferenceOverlay(dx * step, dy * step);
        return;
      }

      // WASD keys for frame trace tool - move frame overlay (priority over variant offset)
      if (
        frameTraceActive &&
        ["w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)
      ) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        let dx = 0,
          dy = 0;
        if (key === "w") dy = -1;
        if (key === "s") dy = 1;
        if (key === "a") dx = -1;
        if (key === "d") dx = 1;
        const step = e.shiftKey ? traceNudgeAmount : 1;
        moveFrameOverlay(dx * step, dy * step);
        return;
      }

      // WASD keys for variant offset adjustment when editing a variant
      if (
        editingVariant &&
        ["w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)
      ) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        let dx = 0,
          dy = 0;
        if (key === "w") dy = -1;
        if (key === "s") dy = 1;
        if (key === "a") dx = -1;
        if (key === "d") dx = 1;
        setVariantOffset(dx, dy, e.shiftKey);
        return;
      }

      // Arrow keys - move selection pixels if selection exists, otherwise move all pixels
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();

        // Shift + Arrow for rectangle border radius adjustment
        if (e.shiftKey && currentTool === "rectangle") {
          if (e.key === "ArrowUp") {
            setBorderRadius(borderRadius + 1);
          } else if (e.key === "ArrowDown") {
            setBorderRadius(borderRadius - 1);
          }
          return;
        }

        let dx = 0,
          dy = 0;
        if (e.key === "ArrowUp") dy = -1;
        if (e.key === "ArrowDown") dy = 1;
        if (e.key === "ArrowLeft") dx = -1;
        if (e.key === "ArrowRight") dx = 1;

        // If there's a selection, move only selected pixels
        if (selection) {
          if (selectionBehavior === "moveSelection") {
            moveSelection(dx, dy);
          } else if (selectionBehavior === "movePixels") {
            moveSelectedPixels(dx, dy);
          } else {
            // editMask: arrows do nothing (prevents accidental moves)
          }
        } else {
          // Otherwise move all layer pixels
          moveLayerPixels(dx, dy);
        }
        return;
      }

      // Escape key - selection always clears first when active
      // Note: Only changes the tool, does not affect variant editing mode
      // Stop propagation to prevent FrameTimeline from handling ESC when exiting trace mode
      if (e.key === "Escape") {
        if (selection) {
          e.preventDefault();
          e.stopPropagation();
          clearSelection();
          return;
        }
        if (isReferenceTraceActive) {
          e.preventDefault();
          e.stopPropagation();
          setTool("pixel");
          return;
        }
        if (frameTraceActive) {
          e.preventDefault();
          e.stopPropagation();
          setFrameTraceActive(false, null);
          return;
        }
        return;
      }

      // Frame navigation: "." for next frame, "," for previous frame
      if (e.key === "." || e.key === ",") {
        e.preventDefault();
        const currentObj = getCurrentObject();
        if (!currentObj || currentObj.frames.length <= 1) return;

        const currentFrameId = project?.uiState.selectedFrameId;
        const currentIndex = currentObj.frames.findIndex(
          (f) => f.id === currentFrameId,
        );
        if (currentIndex === -1) return;

        let newIndex: number;
        let delta: number;
        if (e.key === ".") {
          // Next frame (wrap around)
          newIndex = (currentIndex + 1) % currentObj.frames.length;
          delta = 1;
        } else {
          // Previous frame (wrap around)
          newIndex =
            (currentIndex - 1 + currentObj.frames.length) %
            currentObj.frames.length;
          delta = -1;
        }

        // Don't sync variants to base frames - advance them independently (same as playback)
        selectFrame(currentObj.frames[newIndex].id, false);
        advanceVariantFrames(delta);
        return;
      }
    };

    // Use capture phase to catch ESC before FrameTimeline handler
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    currentTool,
    borderRadius,
    undo,
    deleteSelectedFrame,
    deleteSelectionPixels,
    moveLayerPixels,
    setBorderRadius,
    isReferenceTraceActive,
    moveReferenceOverlay,
    frameTraceActive,
    moveFrameOverlay,
    setFrameTraceActive,
    setTool,
    selection,
    moveSelectedPixels,
    moveSelection,
    clearSelection,
    getCurrentObject,
    project?.uiState.selectedFrameId,
    selectFrame,
    editingVariant,
    setVariantOffset,
    advanceVariantFrames,
    selectionBehavior,
    traceNudgeAmount,
  ]);

  // Get pixel color from reference image at a given canvas coordinate
  const getRefPixelAtCoord = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!referenceImage) return null;

      // Calculate the reference pixel coordinate considering the overlay offset
      const refX = canvasX - referenceOverlayOffset.x;
      const refY = canvasY - referenceOverlayOffset.y;

      // Check bounds
      if (
        refX < 0 ||
        refX >= referenceImage.width ||
        refY < 0 ||
        refY >= referenceImage.height
      ) {
        return null;
      }

      return referenceImage.pixels[refY]?.[refX] ?? 0;
    },
    [referenceImage, referenceOverlayOffset],
  );

  // Get pixel color from frame trace at a given canvas coordinate
  const getFrameTracePixelAtCoord = useCallback(
    (canvasX: number, canvasY: number): Pixel | null => {
      if (!frameTraceFrame || !obj) return null;

      // Calculate the frame pixel coordinate considering the overlay offset
      const frameX = canvasX - frameOverlayOffset.x;
      const frameY = canvasY - frameOverlayOffset.y;

      // Check bounds
      if (
        frameX < 0 ||
        frameX >= objWidth ||
        frameY < 0 ||
        frameY >= objHeight
      ) {
        return null;
      }

      // Calculate variant frame indices for the trace frame
      const traceFrameIndex = obj.frames.findIndex(
        (f) => f.id === frameTraceFrame.id,
      );
      const variants = project?.variants;
      let variantFrameIndices: { [key: string]: number } | undefined;

      if (variants) {
        variantFrameIndices = {};
        for (const vg of variants) {
          const variant = vg.variants[0];
          if (variant && variant.frames.length > 0) {
            variantFrameIndices[vg.id] =
              traceFrameIndex % variant.frames.length;
          }
        }
      }

      // Check layers from top to bottom (reverse order)
      for (
        let layerIdx = frameTraceFrame.layers.length - 1;
        layerIdx >= 0;
        layerIdx--
      ) {
        const traceLayer: Layer = frameTraceFrame.layers[layerIdx];
        if (!traceLayer.visible) continue;

        // Handle variant layers
        if (
          traceLayer.isVariant &&
          traceLayer.variantGroupId &&
          variants &&
          variantFrameIndices
        ) {
          const vg = variants.find((vg) => vg.id === traceLayer.variantGroupId);
          const variant = vg?.variants.find(
            (v) => v.id === traceLayer.selectedVariantId,
          );
          const variantFrameIdx =
            variantFrameIndices[traceLayer.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          if (variant && vFrame) {
            const traceVariantOffset = resolveVariantOffset(
              traceLayer,
              variant,
              traceFrameIndex,
            );
            const vX = frameX - traceVariantOffset.x;
            const vY = frameY - traceVariantOffset.y;

            if (
              vX >= 0 &&
              vX < variant.gridSize.width &&
              vY >= 0 &&
              vY < variant.gridSize.height
            ) {
              for (let vlIdx = vFrame.layers.length - 1; vlIdx >= 0; vlIdx--) {
                const vl = vFrame.layers[vlIdx];
                if (!vl.visible) continue;

                const pixel = getPixelColor(vl.pixels[vY]?.[vX]);
                if (pixel && pixel.a > 0) {
                  return pixel;
                }
              }
            }
          }
        } else {
          // Regular layer
          const pixel = getPixelColor(traceLayer.pixels[frameY]?.[frameX]);
          if (pixel && pixel.a > 0) {
            return pixel;
          }
        }
      }

      return null;
    },
    [
      frameTraceFrame,
      obj,
      objWidth,
      objHeight,
      frameOverlayOffset,
      project?.variants,
    ],
  );

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse button or Alt+click for panning
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return;

    // Origin tool: set origin position (snapped to half-pixel)
    if (currentTool === "origin" && obj) {
      const originCoords = getOriginCoords(e.clientX, e.clientY);
      if (originCoords) {
        setObjectOrigin(obj.id, originCoords);
      }
      return;
    }

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords || !layer) return;

    // Reference trace tool: copy pixel from reference to canvas
    if (isReferenceTraceActive) {
      beginStroke();
      setIsTracing(true);
      lastStrokePixelRef.current = coords;

      // Stamp a brush worth of pixels from the reference image.
      const stamp =
        brushSize <= 1
          ? [{ x: coords.x, y: coords.y }]
          : (pencilBrushShape === "circle"
              ? getCirclePixels(coords, brushSize, currentColor)
              : getSquarePixels(coords, brushSize, currentColor)
            )
              .map((p) => ({ x: p.x, y: p.y }))
              .filter(
                (p) =>
                  p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
              );

      const out: Array<{ x: number; y: number; color: Pixel }> = [];
      for (const p of stamp) {
        // When in variant edit mode, coords are in variant grid space, but getRefPixelAtCoord
        // expects canvas coordinates. Convert by adding variant offset.
        const canvasX =
          editingVariant && variantData ? p.x + variantOffset.x : p.x;
        const canvasY =
          editingVariant && variantData ? p.y + variantOffset.y : p.y;
        const refPixel = getRefPixelAtCoord(canvasX, canvasY);
        if (refPixel && refPixel.a > 0) {
          out.push({ x: p.x, y: p.y, color: refPixel });
        }
      }
      if (out.length > 0) setPixels(out);
      return;
    }

    // Frame trace tool: copy pixel from frame trace overlay to canvas
    if (frameTraceActive) {
      beginStroke();
      setIsTracing(true);
      lastStrokePixelRef.current = coords;

      const stamp =
        brushSize <= 1
          ? [{ x: coords.x, y: coords.y }]
          : (pencilBrushShape === "circle"
              ? getCirclePixels(coords, brushSize, currentColor)
              : getSquarePixels(coords, brushSize, currentColor)
            )
              .map((p) => ({ x: p.x, y: p.y }))
              .filter(
                (p) =>
                  p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
              );

      const out: Array<{ x: number; y: number; color: Pixel }> = [];
      for (const p of stamp) {
        // When in variant edit mode, coords are in variant grid space, but getFrameTracePixelAtCoord
        // expects canvas coordinates. Convert by adding variant offset.
        const canvasX =
          editingVariant && variantData ? p.x + variantOffset.x : p.x;
        const canvasY =
          editingVariant && variantData ? p.y + variantOffset.y : p.y;
        const framePixel = getFrameTracePixelAtCoord(canvasX, canvasY);
        if (framePixel && framePixel.a > 0) {
          out.push({ x: p.x, y: p.y, color: framePixel });
        }
      }
      if (out.length > 0) setPixels(out);
      return;
    }

    // Eyedropper tool: pick color from first visible layer with a color (top to bottom)
    if (currentTool === "eyedropper") {
      // When editing a variant, check the variant's pixel data
      if (editingVariant && variantData) {
        const variantLayer = variantData.variantFrame.layers[0];
        if (variantLayer) {
          const pixel = getPixelColor(
            variantLayer.pixels[coords.y]?.[coords.x],
          );
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

          const pixel = getPixelColor(l.pixels[coords.y]?.[coords.x]);
          if (pixel && pixel.a > 0) {
            setColorAndAddToHistory(pixel);
            revertToPreviousTool();
            return;
          }
        }
      }

      // If no pixel on any visible layer, try reference image
      if (referenceImage) {
        // When in variant edit mode, coords are in variant grid space, but getRefPixelAtCoord
        // expects canvas coordinates. Convert by adding variant offset.
        const canvasX =
          editingVariant && variantData ? coords.x + variantOffset.x : coords.x;
        const canvasY =
          editingVariant && variantData ? coords.y + variantOffset.y : coords.y;
        const refPixel = getRefPixelAtCoord(canvasX, canvasY);
        if (refPixel && refPixel.a > 0) {
          setColorAndAddToHistory(refPixel);
          revertToPreviousTool();
          return;
        }
      }
      return;
    }

    // Move tool: start dragging pixels
    if (currentTool === "move") {
      setIsDraggingPixels(true);
      setLastDragPixel(coords);
      return;
    }

    // Selection tool: start selecting region
    if (currentTool === "selection") {
      const canUseSelectionMask =
        selection &&
        selection.width === gridWidth &&
        selection.height === gridHeight;
      const isInsideSelection =
        canUseSelectionMask &&
        selection!.mask.has(coords.y * gridWidth + coords.x);

      // If clicking inside selection, drag it (unless we're in edit-mask mode)
      if (isInsideSelection && selectionBehavior !== "editMask") {
        setIsDraggingSelection(true);
        setSelectionDragMode(
          selectionBehavior === "moveSelection" ? "selection" : "pixels",
        );
        setPixelDragOffset({ dx: 0, dy: 0 });
        setLastSelectionDragPixel(coords);
        return;
      }

      // In edit-mask mode, clicking inside the selection does nothing (prevents accidental changes)
      if (isInsideSelection && selectionBehavior === "editMask") {
        return;
      }

      // Start a new selection based on the current selection mode
      if (selectionMode === "rect") {
        setIsSelectingRegion(true);
        setSelectionStart(coords);
        setPreviewSelection({ x: coords.x, y: coords.y, width: 1, height: 1 });
        setIsLassoSelecting(false);
        setLassoPoints([]);
        clearSelection();
        return;
      }

      if (selectionMode === "flood") {
        setIsSelectingRegion(false);
        setSelectionStart(null);
        setPreviewSelection(null);
        setIsLassoSelecting(false);
        setLassoPoints([]);
        selectFloodFillAt(coords.x, coords.y);
        return;
      }

      if (selectionMode === "color") {
        setIsSelectingRegion(false);
        setSelectionStart(null);
        setPreviewSelection(null);
        setIsLassoSelecting(false);
        setLassoPoints([]);
        selectAllByColorAt(coords.x, coords.y);
        return;
      }

      // lasso
      setIsSelectingRegion(false);
      setSelectionStart(null);
      setPreviewSelection(null);
      setIsLassoSelecting(true);
      setLassoPoints([coords]);
      clearSelection();
      return;
    }

    startDrawing(coords);

    // Add current color to history when starting to draw (not for eraser)
    if (currentTool !== "eraser") {
      addToColorHistory(currentColor);
    }

    if (currentTool === "pixel") {
      beginStroke();
      if (brushSize === 1) {
        setPixel(coords.x, coords.y, currentColor);
      } else {
        const stamp =
          pencilBrushShape === "circle"
            ? getCirclePixels(coords, brushSize, currentColor)
            : getSquarePixels(coords, brushSize, currentColor);
        setPixels(
          stamp
            .filter(
              (p) =>
                p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
            )
            .map((p) => ({ x: p.x, y: p.y, color: currentColor })),
        );
      }
      lastStrokePixelRef.current = coords;
    } else if (currentTool === "eraser") {
      beginStroke();
      if (brushSize === 1) {
        setPixel(coords.x, coords.y, 0);
      } else {
        const stamp =
          eraserShape === "circle"
            ? getCirclePixels(coords, brushSize, currentColor)
            : getSquarePixels(coords, brushSize, currentColor);
        setPixels(
          stamp
            .filter(
              (p) =>
                p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
            )
            .map((p) => ({ x: p.x, y: p.y, color: 0 as const })),
        );
      }
      lastStrokePixelRef.current = coords;
    } else if (currentTool === "flood-fill") {
      // Get the correct pixel grid - variant frame's layer when editing variant
      const pixelGrid =
        editingVariant && variantData
          ? (variantData.variantFrame.layers[0]?.pixels ?? layer.pixels)
          : layer.pixels;
      const pixels = floodFill(
        pixelGrid,
        coords.x,
        coords.y,
        gridWidth,
        gridHeight,
        currentColor,
      );
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === "gaussian-fill") {
      const pixelGrid =
        editingVariant && variantData
          ? (variantData.variantFrame.layers[0]?.pixels ?? layer.pixels)
          : layer.pixels;
      const gaussian = project?.uiState.gaussianFill ?? {
        smoothing: 1.0,
        radius: 2.0,
      };
      const pixels = gaussianFloodFill(
        pixelGrid,
        coords.x,
        coords.y,
        gridWidth,
        gridHeight,
        gaussian.smoothing,
        gaussian.radius,
        currentColor,
      );
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === "fill-square") {
      beginStroke();
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
      const displayedW = canvasWidth * viewZoom;
      const displayedH = canvasHeight * viewZoom;
      const next = clampPanToViewport(
        { x: viewPanRef.current.x + dx, y: viewPanRef.current.y + dy },
        displayedW,
        displayedH,
      );
      viewPanRef.current = next;
      setViewPanOffset(next);
      scheduleCommitPan();
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords) {
      // If we leave the drawable area while dragging, don't "bridge" a long gap
      // when re-entering the canvas.
      if (isDrawing) lastStrokePixelRef.current = null;
      clearPreviewPixels();
      return;
    }

    // Handle reference trace dragging (continuous pixel copying)
    if (isTracing && isReferenceTraceActive) {
      const prev = lastStrokePixelRef.current;
      const segment =
        prev && (prev.x !== coords.x || prev.y !== coords.y)
          ? getLinePixels(prev, coords)
          : [coords];

      const seen = new Set<string>();
      const out: Array<{ x: number; y: number; color: Pixel }> = [];

      for (const s of segment) {
        const stamp =
          brushSize <= 1
            ? [{ x: s.x, y: s.y }]
            : (pencilBrushShape === "circle"
                ? getCirclePixels(s, brushSize, currentColor)
                : getSquarePixels(s, brushSize, currentColor)
              )
                .map((p) => ({ x: p.x, y: p.y }))
                .filter(
                  (p) =>
                    p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
                );

        for (const p of stamp) {
          const key = `${p.x},${p.y}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const canvasX =
            editingVariant && variantData ? p.x + variantOffset.x : p.x;
          const canvasY =
            editingVariant && variantData ? p.y + variantOffset.y : p.y;
          const refPixel = getRefPixelAtCoord(canvasX, canvasY);
          if (refPixel && refPixel.a > 0) {
            out.push({ x: p.x, y: p.y, color: refPixel });
          }
        }
      }

      if (out.length > 0) setPixels(out);
      lastStrokePixelRef.current = coords;
      return;
    }

    // Handle frame trace dragging (continuous pixel copying)
    if (isTracing && frameTraceActive) {
      const prev = lastStrokePixelRef.current;
      const segment =
        prev && (prev.x !== coords.x || prev.y !== coords.y)
          ? getLinePixels(prev, coords)
          : [coords];

      const seen = new Set<string>();
      const out: Array<{ x: number; y: number; color: Pixel }> = [];

      for (const s of segment) {
        const stamp =
          brushSize <= 1
            ? [{ x: s.x, y: s.y }]
            : (pencilBrushShape === "circle"
                ? getCirclePixels(s, brushSize, currentColor)
                : getSquarePixels(s, brushSize, currentColor)
              )
                .map((p) => ({ x: p.x, y: p.y }))
                .filter(
                  (p) =>
                    p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
                );

        for (const p of stamp) {
          const key = `${p.x},${p.y}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const canvasX =
            editingVariant && variantData ? p.x + variantOffset.x : p.x;
          const canvasY =
            editingVariant && variantData ? p.y + variantOffset.y : p.y;
          const framePixel = getFrameTracePixelAtCoord(canvasX, canvasY);
          if (framePixel && framePixel.a > 0) {
            out.push({ x: p.x, y: p.y, color: framePixel });
          }
        }
      }

      if (out.length > 0) setPixels(out);
      lastStrokePixelRef.current = coords;
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
    if (isDraggingSelection && lastSelectionDragPixel && selectionDragMode) {
      const dx = coords.x - lastSelectionDragPixel.x;
      const dy = coords.y - lastSelectionDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        if (selectionDragMode === "pixels") {
          // Non-destructive preview while dragging; commit on mouseup.
          setPixelDragOffset((prev) => ({
            dx: prev.dx + dx,
            dy: prev.dy + dy,
          }));
        } else {
          moveSelection(dx, dy);
        }
        setLastSelectionDragPixel(coords);
      }
      return;
    }

    if (isSelectingRegion && selectionStart) {
      const minX = Math.min(selectionStart.x, coords.x);
      const minY = Math.min(selectionStart.y, coords.y);
      const maxX = Math.max(selectionStart.x, coords.x);
      const maxY = Math.max(selectionStart.y, coords.y);
      setPreviewSelection({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
      return;
    }

    if (isLassoSelecting) {
      setLassoPoints((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.x === coords.x && last.y === coords.y) return prev;
        // Prevent huge arrays: drop tiny jitter by only keeping changes
        return [...prev, coords];
      });
      return;
    }

    if (!isDrawing || !drawStartPoint) {
      // Show hover preview for fill-square
      if (currentTool === "fill-square") {
        setPreviewPixels(
          getSquarePixels(coords, brushSize, currentColor).map((p) => ({
            x: p.x,
            y: p.y,
          })),
        );
      }
      return;
    }

    // Handle drawing
    switch (currentTool) {
      case "pixel":
        {
          const prev = lastStrokePixelRef.current;
          const segment =
            prev && (prev.x !== coords.x || prev.y !== coords.y)
              ? getLinePixels(prev, coords)
              : [coords];

          if (brushSize === 1) {
            setPixels(
              segment.map((p) => ({ x: p.x, y: p.y, color: currentColor })),
            );
          } else {
            const seen = new Set<string>();
            const out: { x: number; y: number; color: Color }[] = [];
            for (const s of segment) {
              const stamp =
                pencilBrushShape === "circle"
                  ? getCirclePixels(s, brushSize, currentColor)
                  : getSquarePixels(s, brushSize, currentColor);
              for (const p of stamp) {
                if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight)
                  continue;
                const key = `${p.x},${p.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ x: p.x, y: p.y, color: currentColor });
              }
            }
            setPixels(out);
          }
          lastStrokePixelRef.current = coords;
        }
        break;
      case "eraser":
        {
          const prev = lastStrokePixelRef.current;
          const segment =
            prev && (prev.x !== coords.x || prev.y !== coords.y)
              ? getLinePixels(prev, coords)
              : [coords];

          if (brushSize === 1) {
            setPixels(
              segment.map((p) => ({ x: p.x, y: p.y, color: 0 as const })),
            );
          } else {
            const seen = new Set<string>();
            const out: { x: number; y: number; color: 0 }[] = [];

            for (const s of segment) {
              const stamp =
                eraserShape === "circle"
                  ? getCirclePixels(s, brushSize, currentColor)
                  : getSquarePixels(s, brushSize, currentColor);

              for (const p of stamp) {
                if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight)
                  continue;
                const key = `${p.x},${p.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ x: p.x, y: p.y, color: 0 as const });
              }
            }

            setPixels(out);
          }

          lastStrokePixelRef.current = coords;
        }
        break;
      case "fill-square":
        setPixels(getSquarePixels(coords, brushSize, currentColor));
        break;
      case "line":
        setPreviewPixels(getLinePixels(drawStartPoint, coords));
        break;
      case "rectangle":
        setPreviewPixels(
          getRectanglePixels(drawStartPoint, coords, shapeMode, borderRadius),
        );
        break;
      case "ellipse":
        setPreviewPixels(getEllipsePixels(drawStartPoint, coords, shapeMode));
        break;
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    lastStrokePixelRef.current = null;
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isTracing) {
      endStroke();
      setIsTracing(false);
      return;
    }

    if (isDraggingPixels) {
      setIsDraggingPixels(false);
      setLastDragPixel(null);
      return;
    }

    if (isDraggingSelection) {
      if (selectionDragMode === "pixels") {
        const { dx, dy } = pixelDragOffset;
        if (dx !== 0 || dy !== 0) {
          moveSelectedPixels(dx, dy);
        }
      }
      setIsDraggingSelection(false);
      setSelectionDragMode(null);
      setLastSelectionDragPixel(null);
      setPixelDragOffset({ dx: 0, dy: 0 });
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

    if (isLassoSelecting) {
      if (lassoPoints.length > 1) {
        selectLasso(lassoPoints);
      }
      setIsLassoSelecting(false);
      setLassoPoints([]);
      return;
    }

    if (!isDrawing || !drawStartPoint) return;

    // Apply preview pixels as real pixels for shape tools
    if (
      previewPixels.length > 0 &&
      (currentTool === "line" ||
        currentTool === "rectangle" ||
        currentTool === "ellipse")
    ) {
      const pixelData = previewPixels.map((p) => ({
        x: p.x,
        y: p.y,
        color: currentColor as Color,
      }));
      setPixels(pixelData);
    }

    endStroke();
    endDrawing();
  };

  // Native non-passive wheel listener: pinch = view zoom toward cursor, scroll = pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      const state = wheelStateRef.current;
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        if (!zoomAnchorLockRef.current) {
          zoomAnchorLockRef.current = {
            anchor: { x: cursorX, y: cursorY },
            timeoutId: null,
          };
        }
        if (zoomAnchorLockRef.current.timeoutId)
          clearTimeout(zoomAnchorLockRef.current.timeoutId);
        zoomAnchorLockRef.current.timeoutId = setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS);
        const anchor = zoomAnchorLockRef.current.anchor;

        const factor = Math.exp(-e.deltaY * 0.012);
        const newViewZoom = Math.max(
          0.25,
          Math.min(4, state.viewZoom * factor),
        );
        const ratio = newViewZoom / state.viewZoom;
        // Don't clamp during pinch — clamping fights the anchor and causes jitter/drift
        const newPan = {
          x: anchor.x * (1 - ratio) + state.viewPanOffset.x * ratio,
          y: anchor.y * (1 - ratio) + state.viewPanOffset.y * ratio,
        };
        state.setViewZoom(newViewZoom);
        viewPanRef.current = newPan;
        setViewPanOffset(newPan);
        scheduleCommitPan();
      } else {
        e.preventDefault();
        const displayedW = state.canvasWidth * state.viewZoom;
        const displayedH = state.canvasHeight * state.viewZoom;
        const next = state.clampPanToViewport(
          {
            x: state.viewPanOffset.x - e.deltaX,
            y: state.viewPanOffset.y - e.deltaY,
          },
          displayedW,
          displayedH,
        );
        viewPanRef.current = next;
        setViewPanOffset(next);
        scheduleCommitPan();
      }
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => {
      container.removeEventListener("wheel", handler);
      if (zoomAnchorLockRef.current?.timeoutId)
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
    };
  }, [scheduleCommitPan]);

  // Touch event handlers: two-finger = pan + pinch zoom (fluid, fractional)
  const getTouchCenter = (touches: React.TouchList) => {
    const container = containerRef.current;
    if (!container || touches.length < 2) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
    const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
    return { x, y };
  };
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const center = getTouchCenter(e.touches);
      pinchStartRef.current = {
        distance: getTouchDistance(e.touches),
        center,
        viewZoom,
        pan: { ...viewPanRef.current },
      };
      if (zoomAnchorLockRef.current?.timeoutId)
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      zoomAnchorLockRef.current = {
        anchor: center,
        timeoutId: setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS),
      };
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }
    pinchStartRef.current = null;

    const touch = e.touches[0];
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords || !layer) return;

    // Move tool: start dragging pixels
    if (currentTool === "move") {
      setIsDraggingPixels(true);
      setLastDragPixel(coords);
      return;
    }

    startDrawing(coords);

    if (currentTool === "pixel") {
      beginStroke();
      if (brushSize === 1) {
        setPixel(coords.x, coords.y, currentColor);
      } else {
        const stamp =
          pencilBrushShape === "circle"
            ? getCirclePixels(coords, brushSize, currentColor)
            : getSquarePixels(coords, brushSize, currentColor);
        setPixels(
          stamp
            .filter(
              (p) =>
                p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight,
            )
            .map((p) => ({ x: p.x, y: p.y, color: currentColor })),
        );
      }
      lastStrokePixelRef.current = coords;
    } else if (currentTool === "eraser") {
      beginStroke();
      if (brushSize === 1) {
        setPixel(coords.x, coords.y, 0);
        lastStrokePixelRef.current = coords;
      } else {
        const erasePixels =
          eraserShape === "circle"
            ? getCirclePixels(coords, brushSize, currentColor)
            : getSquarePixels(coords, brushSize, currentColor);
        setPixels(
          erasePixels.map((p) => ({ x: p.x, y: p.y, color: 0 as const })),
        );
        lastStrokePixelRef.current = coords;
      }
    } else if (currentTool === "flood-fill") {
      // Get the correct pixel grid - variant frame's layer when editing variant
      const pixelGrid =
        editingVariant && variantData
          ? (variantData.variantFrame.layers[0]?.pixels ?? layer.pixels)
          : layer.pixels;
      const pixels = floodFill(
        pixelGrid,
        coords.x,
        coords.y,
        gridWidth,
        gridHeight,
        currentColor,
      );
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === "gaussian-fill") {
      const pixelGrid =
        editingVariant && variantData
          ? (variantData.variantFrame.layers[0]?.pixels ?? layer.pixels)
          : layer.pixels;
      const gaussian = project?.uiState.gaussianFill ?? {
        smoothing: 1.0,
        radius: 2.0,
      };
      const pixels = gaussianFloodFill(
        pixelGrid,
        coords.x,
        coords.y,
        gridWidth,
        gridHeight,
        gaussian.smoothing,
        gaussian.radius,
        currentColor,
      );
      setPixels(pixels);
      endDrawing();
    } else if (currentTool === "fill-square") {
      beginStroke();
      const pixels = getSquarePixels(coords, brushSize, currentColor);
      setPixels(pixels);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Two-finger pinch = view zoom (transform only) + pan; use locked anchor to avoid jitter
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const start = pinchStartRef.current;
      const dist = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      if (dist <= 0) return;
      if (zoomAnchorLockRef.current?.timeoutId)
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      if (zoomAnchorLockRef.current) {
        zoomAnchorLockRef.current.timeoutId = setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS);
      } else {
        zoomAnchorLockRef.current = {
          anchor: center,
          timeoutId: setTimeout(() => {
            zoomAnchorLockRef.current = null;
          }, ZOOM_ANCHOR_MS),
        };
      }
      const anchor = zoomAnchorLockRef.current.anchor;

      const scale = Math.pow(dist / start.distance, 1.15);
      const newViewZoom = Math.max(0.25, Math.min(4, start.viewZoom * scale));
      const zoomRatio = newViewZoom / start.viewZoom;
      // Don't clamp during pinch — clamping fights the anchor and causes jitter/drift
      const newPan = {
        x: anchor.x * (1 - zoomRatio) + start.pan.x * zoomRatio,
        y: anchor.y * (1 - zoomRatio) + start.pan.y * zoomRatio,
      };
      setViewZoom(newViewZoom);
      viewPanRef.current = newPan;
      setViewPanOffset(newPan);
      scheduleCommitPan();
      pinchStartRef.current = {
        distance: dist,
        center,
        viewZoom: newViewZoom,
        pan: newPan,
      };
      return;
    }

    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }

    if (isPanning && lastPanPoint && e.touches.length >= 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastPanPoint.x;
      const dy = touch.clientY - lastPanPoint.y;
      const displayedW = canvasWidth * viewZoom;
      const displayedH = canvasHeight * viewZoom;
      const next = clampPanToViewport(
        { x: viewPanRef.current.x - dx, y: viewPanRef.current.y - dy },
        displayedW,
        displayedH,
      );
      viewPanRef.current = next;
      setViewPanOffset(next);
      scheduleCommitPan();
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
      return;
    }

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords) {
      if (isDrawing) lastStrokePixelRef.current = null;
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

    if (!isDrawing) return;

    if (currentTool === "pixel") {
      const prev = lastStrokePixelRef.current;
      const segment =
        prev && (prev.x !== coords.x || prev.y !== coords.y)
          ? getLinePixels(prev, coords)
          : [coords];

      if (brushSize === 1) {
        setPixels(
          segment.map((p) => ({ x: p.x, y: p.y, color: currentColor })),
        );
      } else {
        const seen = new Set<string>();
        const out: { x: number; y: number; color: Color }[] = [];
        for (const s of segment) {
          const stamp =
            pencilBrushShape === "circle"
              ? getCirclePixels(s, brushSize, currentColor)
              : getSquarePixels(s, brushSize, currentColor);
          for (const p of stamp) {
            if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight)
              continue;
            const key = `${p.x},${p.y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ x: p.x, y: p.y, color: currentColor });
          }
        }
        setPixels(out);
      }
      lastStrokePixelRef.current = coords;
    } else if (currentTool === "eraser") {
      const prev = lastStrokePixelRef.current;
      const segment =
        prev && (prev.x !== coords.x || prev.y !== coords.y)
          ? getLinePixels(prev, coords)
          : [coords];

      if (brushSize === 1) {
        setPixels(segment.map((p) => ({ x: p.x, y: p.y, color: 0 as const })));
      } else {
        const seen = new Set<string>();
        const out: { x: number; y: number; color: 0 }[] = [];
        for (const s of segment) {
          const stamp =
            eraserShape === "circle"
              ? getCirclePixels(s, brushSize, currentColor)
              : getSquarePixels(s, brushSize, currentColor);
          for (const p of stamp) {
            if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight)
              continue;
            const key = `${p.x},${p.y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ x: p.x, y: p.y, color: 0 as const });
          }
        }
        setPixels(out);
      }
      lastStrokePixelRef.current = coords;
    } else if (currentTool === "fill-square") {
      setPixels(getSquarePixels(coords, brushSize, currentColor));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastStrokePixelRef.current = null;
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }
    if (isDraggingPixels) {
      setIsDraggingPixels(false);
      setLastDragPixel(null);
      return;
    }
    endStroke();
    endDrawing();
  };

  // Get cursor style based on tool
  const getCursorStyle = () => {
    if (currentTool === "move") return "move";
    if (currentTool === "reference-trace") return "copy";
    if (frameTraceActive) return "copy";
    if (currentTool === "eyedropper") return "crosshair";
    if (currentTool === "selection") return "crosshair";
    if (currentTool === "origin") return "crosshair";
    return "crosshair";
  };

  return (
    <div className="canvas">
      <div className="canvas__viewport" ref={containerRef} tabIndex={0}>
        <div
          className="canvas__layout"
          style={{
            transform: `translate(${viewPanOffset.x}px, ${viewPanOffset.y}px) scale(${viewZoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Main Editing Canvas */}
          <div className="canvas__frame">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="canvas__surface"
              style={{ cursor: getCursorStyle() }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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
                className="canvas__overlay"
              />
            )}
            {/* Frame Reference Overlay */}
            {overlayFrame && !isReferenceTraceActive && !frameTraceActive && (
              <canvas
                ref={frameOverlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="canvas__overlay"
                style={{ pointerEvents: "none" }}
              />
            )}
            {/* Frame Trace Overlay */}
            {frameTraceActive && (
              <canvas
                ref={frameTraceOverlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="canvas__overlay"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
