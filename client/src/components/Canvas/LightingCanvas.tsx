import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "../../store";
import { Point, Normal } from "../../types";
import {
  composeLayers,
  renderWithLighting,
  renderNormalAsRGB,
  renderHeightAsGrayscale,
} from "../../utils/lightingRenderer";
import { getSquarePixels, getCirclePixels } from "./drawingUtils";
import "./LightingCanvas.css";

export function LightingCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const editCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const previewPanelRef = useRef<HTMLDivElement>(null);

  const [isPainting, setIsPainting] = useState(false);
  const [lastPaintPixel, setLastPaintPixel] = useState<Point | null>(null);
  const [hoverPixel, setHoverPixel] = useState<Point | null>(null);

  // View zoom: CSS transform scale for pinch/gesture only (mirrors Pixel Studio Canvas)
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPanOffset, setViewPanOffset] = useState({ x: 0, y: 0 });
  const viewPanRef = useRef(viewPanOffset);

  // Touch pinch support
  const pinchStartRef = useRef<{
    distance: number;
    center: { x: number; y: number };
    viewZoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  // Zoom anchor lock (reduces jitter)
  const ZOOM_ANCHOR_MS = 100;
  const zoomAnchorLockRef = useRef<{
    anchor: { x: number; y: number };
    timeoutId: ReturnType<typeof setTimeout> | null;
  } | null>(null);

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
    getCurrentObject,
    getCurrentFrame,
    getCurrentLayer,
    getCurrentVariant,
    isEditingVariant,
    setNormalPixels,
    setHeightPixels,
    setHeightBrushValue,
    undo,
    selectFrame,
    advanceVariantFrames,
    setLightingPreviewPanelPosition,
    setLightingPreviewPanelMinimized,
  } = useEditorStore();

  const obj = getCurrentObject();
  const frame = getCurrentFrame();
  const layer = getCurrentLayer();
  const variantData = getCurrentVariant();
  const editingVariant = isEditingVariant();

  const zoom = project?.uiState.zoom ?? 10;
  const brushSize = project?.uiState.brushSize ?? 1;
  const normalBrushShape = project?.uiState.normalBrushShape ?? "circle";
  const selectedNormal = project?.uiState.selectedNormal ?? {
    x: 0,
    y: 0,
    z: 255,
  };
  const heightBrushValue = project?.uiState.heightBrushValue ?? 128;
  const editMode = project?.uiState.lightingDataLayerEditMode ?? "normals";
  const lightDirection = project?.uiState.lightDirection ?? {
    x: -64,
    y: -64,
    z: 180,
  };
  const lightColor = project?.uiState.lightColor ?? {
    r: 255,
    g: 250,
    b: 240,
    a: 255,
  };
  const ambientColor = project?.uiState.ambientColor ?? {
    r: 40,
    g: 45,
    b: 60,
    a: 255,
  };
  const heightScale = project?.uiState.heightScale ?? 100;

  // Object dims (preview always uses base object size)
  const objWidth = obj?.gridSize.width ?? 32;
  const objHeight = obj?.gridSize.height ?? 32;

  // Editable dims (variant size when editing a variant)
  const gridWidth =
    editingVariant && variantData
      ? variantData.variant.gridSize.width
      : objWidth;
  const gridHeight =
    editingVariant && variantData
      ? variantData.variant.gridSize.height
      : objHeight;

  const canvasWidth = gridWidth * zoom;
  const canvasHeight = gridHeight * zoom;

  useEffect(() => {
    viewPanRef.current = viewPanOffset;
  }, [viewPanOffset]);

  // Clamp pan so the canvas can move freely within the editor viewport
  const clampPanToViewport = useCallback(
    (
      offset: { x: number; y: number },
      contentWidth: number,
      contentHeight: number,
    ) => {
      const container = editorContainerRef.current;
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

  wheelStateRef.current = {
    viewPanOffset: viewPanRef.current,
    canvasWidth,
    canvasHeight,
    viewZoom,
    setViewZoom,
    clampPanToViewport,
  };

  // Get pixel coords using rect so it works with viewZoom transform
  const getPixelCoordsFromClient = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = editCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.floor(((clientX - rect.left) / rect.width) * gridWidth);
      const y = Math.floor(((clientY - rect.top) / rect.height) * gridHeight);
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
      return { x, y };
    },
    [gridWidth, gridHeight],
  );

  const getEditLayer = useCallback(() => {
    if (!layer) return null;
    if (editingVariant && variantData)
      return variantData.variantFrame.layers[0];
    return layer;
  }, [layer, editingVariant, variantData]);

  const hasColorAtPixel = useCallback(
    (x: number, y: number): boolean => {
      const editLayer = getEditLayer();
      if (!editLayer) return false;
      const pd = editLayer.pixels[y]?.[x];
      return pd?.color !== 0;
    },
    [getEditLayer],
  );

  const getPaintableBrushPixels = useCallback(
    (center: Point): Point[] => {
      const brushPixelsWithColor =
        normalBrushShape === "circle"
          ? getCirclePixels(center, brushSize, { r: 0, g: 0, b: 0, a: 255 })
          : getSquarePixels(center, brushSize, { r: 0, g: 0, b: 0, a: 255 });

      return brushPixelsWithColor
        .map((p) => ({ x: p.x, y: p.y }))
        .filter((p) => {
          if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight)
            return false;
          return hasColorAtPixel(p.x, p.y);
        });
    },
    [brushSize, normalBrushShape, gridWidth, gridHeight, hasColorAtPixel],
  );

  // Render: floating lighting preview (like Frame Reference)
  const renderPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !frame || !obj || !project) return;

    const thumbSize = 200;
    canvas.width = thumbSize;
    canvas.height = thumbSize;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, thumbSize, thumbSize);

    const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);
    const composed = composeLayers(
      frame,
      objWidth,
      objHeight,
      baseFrameIndex >= 0 ? baseFrameIndex : 0,
      project.variants,
      project.uiState.variantFrameIndices,
    );

    const litImage = renderWithLighting(composed, {
      lightDirection,
      lightColor,
      ambientColor,
      heightScale,
    });

    // Choose an integer zoom that fits inside thumb
    const z = Math.max(
      1,
      Math.floor(thumbSize / Math.max(objWidth, objHeight)),
    );
    const drawW = objWidth * z;
    const drawH = objHeight * z;
    const ox = Math.floor((thumbSize - drawW) / 2);
    const oy = Math.floor((thumbSize - drawH) / 2);

    // Background + checkerboard
    ctx.fillStyle = "#1a1a25";
    ctx.fillRect(0, 0, thumbSize, thumbSize);
    for (let py = 0; py < objHeight; py++) {
      for (let px = 0; px < objWidth; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? "#2a2a3a" : "#222230";
        ctx.fillRect(ox + px * z, oy + py * z, z, z);
      }
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = objWidth;
    tempCanvas.height = objHeight;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(litImage, 0, 0);
    ctx.drawImage(tempCanvas, ox, oy, drawW, drawH);

    // Border
    ctx.strokeStyle = "rgba(0, 217, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, thumbSize - 1, thumbSize - 1);
  }, [
    frame,
    obj,
    objWidth,
    objHeight,
    lightDirection,
    lightColor,
    ambientColor,
    heightScale,
    project,
  ]);

  // Render: editable visualization (normals or height)
  const renderEdit = useCallback(() => {
    const canvas = editCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const editLayer = getEditLayer();
    if (!canvas || !ctx || !editLayer) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.imageSmoothingEnabled = false;

    // Checkerboard background
    ctx.fillStyle = "#1a1a25";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    for (let py = 0; py < gridHeight; py++) {
      for (let px = 0; px < gridWidth; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? "#2a2a3a" : "#222230";
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }

    const img =
      editMode === "height"
        ? renderHeightAsGrayscale(editLayer, gridWidth, gridHeight)
        : renderNormalAsRGB(editLayer, gridWidth, gridHeight);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = gridWidth;
    tempCanvas.height = gridHeight;
    const tempCtx = tempCanvas.getContext("2d");
    if (tempCtx) {
      tempCtx.putImageData(img, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
    }

    // Grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
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
  }, [
    getEditLayer,
    gridWidth,
    gridHeight,
    canvasWidth,
    canvasHeight,
    zoom,
    editMode,
  ]);

  const renderBrushOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (!hoverPixel) return;

    const paintable = getPaintableBrushPixels(hoverPixel);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "rgba(0, 217, 255, 0.22)";
    for (const p of paintable) {
      ctx.fillRect(p.x * zoom, p.y * zoom, zoom, zoom);
    }
    ctx.strokeStyle = "rgba(0, 217, 255, 0.55)";
    ctx.lineWidth = 1;
    for (const p of paintable) {
      ctx.strokeRect(p.x * zoom + 0.5, p.y * zoom + 0.5, zoom - 1, zoom - 1);
    }
  }, [canvasWidth, canvasHeight, hoverPixel, getPaintableBrushPixels, zoom]);

  // Re-render visuals
  useEffect(() => {
    renderPreview();
    renderEdit();
  }, [renderPreview, renderEdit]);

  useEffect(() => {
    renderBrushOverlay();
  }, [renderBrushOverlay]);

  // Native non-passive wheel listener: pinch = view zoom toward cursor, scroll = pan
  useEffect(() => {
    const container = editorContainerRef.current;
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
        if (zoomAnchorLockRef.current.timeoutId) {
          clearTimeout(zoomAnchorLockRef.current.timeoutId);
        }
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
        const newPan = {
          x: anchor.x * (1 - ratio) + state.viewPanOffset.x * ratio,
          y: anchor.y * (1 - ratio) + state.viewPanOffset.y * ratio,
        };
        state.setViewZoom(newViewZoom);
        viewPanRef.current = newPan;
        setViewPanOffset(newPan);
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
      }
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => {
      container.removeEventListener("wheel", handler);
      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
    };
  }, []);

  const getTouchCenter = (touches: React.TouchList) => {
    const container = editorContainerRef.current;
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
      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
      zoomAnchorLockRef.current = {
        anchor: center,
        timeoutId: setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS),
      };
      return;
    }
    pinchStartRef.current = null;

    const touch = e.touches[0];
    if (!touch) return;
    const coords = getPixelCoordsFromClient(touch.clientX, touch.clientY);
    if (!coords) return;

    setIsPainting(true);
    setLastPaintPixel(coords);
    setHoverPixel(null);

    const paintable = getPaintableBrushPixels(coords);
    if (paintable.length === 0) return;

    if (editMode === "height") {
      const value = heightBrushValue;
      setHeightPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, height: value })),
      );
    } else {
      setNormalPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
      );
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Two-finger pinch = zoom + pan
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const start = pinchStartRef.current;
      const dist = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      if (dist <= 0) return;

      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
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
      const newPan = {
        x: anchor.x * (1 - zoomRatio) + start.pan.x * zoomRatio,
        y: anchor.y * (1 - zoomRatio) + start.pan.y * zoomRatio,
      };
      setViewZoom(newViewZoom);
      viewPanRef.current = newPan;
      setViewPanOffset(newPan);
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

    if (!isPainting) return;
    const touch = e.touches[0];
    if (!touch) return;
    const coords = getPixelCoordsFromClient(touch.clientX, touch.clientY);
    if (!coords) return;
    if (
      lastPaintPixel &&
      coords.x === lastPaintPixel.x &&
      coords.y === lastPaintPixel.y
    ) {
      return;
    }

    const paintable = getPaintableBrushPixels(coords);
    if (paintable.length === 0) return;

    setLastPaintPixel(coords);
    if (editMode === "height") {
      const value = heightBrushValue;
      setHeightPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, height: value })),
      );
    } else {
      setNormalPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
      );
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
    setIsPainting(false);
    setLastPaintPixel(null);
  };

  // Mouse painting
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const coords = getPixelCoordsFromClient(e.clientX, e.clientY);
    if (!coords) return;

    // Alt-click picks height value while editing height
    if (editMode === "height" && e.altKey) {
      const editLayer = getEditLayer();
      const h = editLayer?.pixels[coords.y]?.[coords.x]?.height;
      if (typeof h === "number") setHeightBrushValue(h);
      return;
    }

    const paintable = getPaintableBrushPixels(coords);
    if (paintable.length === 0) return;

    setIsPainting(true);
    setLastPaintPixel(coords);
    setHoverPixel(null);

    if (editMode === "height") {
      const value = e.shiftKey ? 0 : heightBrushValue;
      setHeightPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, height: value })),
      );
    } else {
      setNormalPixels(
        paintable.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
      );
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoordsFromClient(e.clientX, e.clientY);
    if (isPainting) {
      if (!coords) {
        setHoverPixel(null);
        return;
      }
      if (
        lastPaintPixel &&
        coords.x === lastPaintPixel.x &&
        coords.y === lastPaintPixel.y
      ) {
        return;
      }
      const paintable = getPaintableBrushPixels(coords);
      if (paintable.length === 0) return;
      setLastPaintPixel(coords);

      if (editMode === "height") {
        const value = e.shiftKey ? 0 : heightBrushValue;
        setHeightPixels(
          paintable.map((p) => ({ x: p.x, y: p.y, height: value })),
        );
      } else {
        setNormalPixels(
          paintable.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
        );
      }
    } else {
      setHoverPixel(coords);
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    setLastPaintPixel(null);
  };

  const handleMouseLeave = () => {
    setIsPainting(false);
    setLastPaintPixel(null);
    setHoverPixel(null);
  };

  // Keyboard: undo + frame navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
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
          newIndex = (currentIndex + 1) % currentObj.frames.length;
          delta = 1;
        } else {
          newIndex =
            (currentIndex - 1 + currentObj.frames.length) %
            currentObj.frames.length;
          delta = -1;
        }
        selectFrame(currentObj.frames[newIndex].id, false);
        advanceVariantFrames(delta);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    getCurrentObject,
    project?.uiState.selectedFrameId,
    selectFrame,
    advanceVariantFrames,
  ]);

  // Floating preview panel: position/minimize (mirrors FrameReferencePanel)
  const [previewMinimized, setPreviewMinimized] = useState(
    project?.uiState.lightingPreviewPanelMinimized ?? false,
  );
  const [previewPosition, setPreviewPosition] = useState({ top: 20, left: 20 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [previewDragStart, setPreviewDragStart] = useState({ x: 0, y: 0 });

  // When expanding the panel, re-render the preview canvas once it mounts.
  useEffect(() => {
    if (!previewMinimized) {
      // Next paint gets the latest lighting state
      requestAnimationFrame(() => renderPreview());
    }
  }, [previewMinimized, renderPreview]);

  const percentageToPixels = useCallback(
    (percentPos: { topPercent: number; leftPercent: number } | undefined) => {
      const root = rootRef.current;
      if (!root || !previewPanelRef.current || !percentPos)
        return { top: 20, left: 20 };
      const canvasRect = root.getBoundingClientRect();
      const panelRect = previewPanelRef.current.getBoundingClientRect();
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

  const pixelsToPercentage = useCallback(
    (pixelPos: { top: number; left: number }) => {
      const root = rootRef.current;
      if (!root) return { topPercent: 0, leftPercent: 0 };
      const canvasRect = root.getBoundingClientRect();
      return {
        topPercent: (pixelPos.top / canvasRect.height) * 100,
        leftPercent: (pixelPos.left / canvasRect.width) * 100,
      };
    },
    [],
  );

  useEffect(() => {
    const percentPos = project?.uiState.lightingPreviewPanelPosition;
    if (percentPos) {
      requestAnimationFrame(() =>
        setPreviewPosition(percentageToPixels(percentPos)),
      );
    }
  }, [project?.uiState.lightingPreviewPanelPosition, percentageToPixels]);

  useEffect(() => {
    if (project?.uiState.lightingPreviewPanelMinimized !== undefined) {
      setPreviewMinimized(project.uiState.lightingPreviewPanelMinimized);
    }
  }, [project?.uiState.lightingPreviewPanelMinimized]);

  useEffect(() => {
    const handleResize = () => {
      const percentPos = project?.uiState.lightingPreviewPanelPosition;
      if (percentPos) setPreviewPosition(percentageToPixels(percentPos));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [project?.uiState.lightingPreviewPanelPosition, percentageToPixels]);

  useEffect(() => {
    if (!isPreviewDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root || !previewPanelRef.current) return;
      const canvasRect = root.getBoundingClientRect();
      const panelRect = previewPanelRef.current.getBoundingClientRect();
      let newLeft = e.clientX - canvasRect.left - previewDragStart.x;
      let newTop = e.clientY - canvasRect.top - previewDragStart.y;
      const maxLeft = canvasRect.width - panelRect.width;
      const maxTop = canvasRect.height - panelRect.height;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      setPreviewPosition({ top: newTop, left: newLeft });
    };
    const handleMouseUp = () => {
      setIsPreviewDragging(false);
      if (!previewPanelRef.current) return;
      const root = rootRef.current;
      if (!root) return;
      const canvasRect = root.getBoundingClientRect();
      const panelRect = previewPanelRef.current.getBoundingClientRect();
      const finalPixelPosition = {
        top: panelRect.top - canvasRect.top,
        left: panelRect.left - canvasRect.left,
      };
      setLightingPreviewPanelPosition(pixelsToPercentage(finalPixelPosition));
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isPreviewDragging,
    previewDragStart,
    pixelsToPercentage,
    setLightingPreviewPanelPosition,
  ]);

  const handlePreviewHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".lighting-preview-minimize")) return;
    setIsPreviewDragging(true);
    const rect = previewPanelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPreviewDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
    <div className="lighting-canvas-container" ref={rootRef}>
      <div className="lighting-editor-outer">
        <div
          className="lighting-editor-container"
          ref={editorContainerRef}
          tabIndex={0}
        >
          <div
            className="lighting-editor-wrapper"
            style={{
              transform: `translate(${viewPanOffset.x}px, ${viewPanOffset.y}px) scale(${viewZoom})`,
              transformOrigin: "0 0",
            }}
          >
            <div className="lighting-editor-stack">
              <canvas
                ref={editCanvasRef}
                className="lighting-edit-canvas"
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
              <canvas
                ref={overlayCanvasRef}
                className="lighting-edit-overlay"
                width={canvasWidth}
                height={canvasHeight}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="lighting-canvas-info">
        <span>
          {editMode === "height" ? "Height" : "Normals"} • {gridWidth} ×{" "}
          {gridHeight}
        </span>
        <span className="separator">|</span>
        <span>Zoom: {zoom}x</span>
        <span className="separator">|</span>
        <span>
          Two-finger scroll to pan • Pinch to zoom • Shift = erase (height)
        </span>
      </div>

      <div
        ref={previewPanelRef}
        className={`lighting-preview-panel ${previewMinimized ? "minimized" : ""} ${isPreviewDragging ? "dragging" : ""}`}
        style={{
          top: `${previewPosition.top}px`,
          left: `${previewPosition.left}px`,
        }}
      >
        <div
          className="lighting-preview-header"
          onMouseDown={handlePreviewHeaderMouseDown}
          style={{ cursor: isPreviewDragging ? "grabbing" : "grab" }}
        >
          <span className="lighting-preview-title">💡 Lighting Preview</span>
          <button
            className="lighting-preview-minimize"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const next = !previewMinimized;
              setPreviewMinimized(next);
              setLightingPreviewPanelMinimized(next);
            }}
            title={previewMinimized ? "Expand" : "Minimize"}
          >
            {previewMinimized ? "▲" : "▼"}
          </button>
        </div>

        {!previewMinimized && (
          <div className="lighting-preview-content">
            <canvas ref={previewCanvasRef} width={200} height={200} />
          </div>
        )}
      </div>
    </div>
  );
}
