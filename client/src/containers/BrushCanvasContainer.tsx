/**
 * BrushCanvasContainer — the Brush Studio's drawing surface (Brush Studio
 * plan, `docs/01-brush-studio`, task 16; MASTER D8 / D18 / D19).
 *
 * Renders the selected brush frame — every visible layer's signed deltas
 * colourised through the 127-centred mapping and composited by
 * `renderBrushFrame` — into `CanvasSurface`, shows the hover marker, zooms
 * through `brushUI`, and drives the SHARED `toolHandlers` for pencil, eraser,
 * line, rectangle, ellipse, fill-square and the two fills on the selected
 * layer. Each stroke is ONE entry on the brush's own history. The eyedropper
 * and move are GESTURE tools (task 20): `beginPointer` hands them to
 * `createBrushGestureController` ahead of the handler table — a pick sets the
 * delta sliders, a move drag shifts the layer live inside one transaction that
 * the ordinary release path closes. Selection is visibly inert until task 21
 * (`isBrushInertTool`).
 *
 * ── ⚠️ `observer()` HERE, rAF-SCHEDULED REDRAW FOR THE CELLS (D8) ────────
 * This component reads only scalars, ids and `observableRef` objects: the
 * document's IDENTITY and size, the selected frame/layer ids, zoom, pan, the
 * delta tuple, the tool settings. It never reads a grid. Cells are consumed
 * only inside `renderFrame` below, which runs from a scheduled animation
 * frame; the redraw signal is `brushes.pixelVersion` / `domainVersion`.
 *
 * ── 1:1 backing store, CSS magnification ──────────────────────────────────
 * The task file predates plan 05: `CanvasSurface` now keeps every canvas at
 * `cellWidth × cellHeight` and magnifies with one CSS `scale(combinedScale)`;
 * the checkerboard is a CSS div and the grid is SVG chrome. So this
 * container paints the composited RGBA buffer straight onto a 1:1 layer
 * canvas (transparent cells let the checkerboard show through) and passes
 * `brushUI.zoom` as `combinedScale`. `renderNormalEdit`'s upscale and
 * `strokeGrid` would both be silent regressions here — see their headers.
 *
 * ── The camera is `brushUI`'s, not `useCanvasViewport`'s ─────────────────
 * The pixel canvas's viewport hook commits into `ViewportUIStore`, which is
 * persisted per project; the brush studio has its own session-only zoom/pan
 * (task 10). Wheel and pinch therefore go straight to `brushUI.zoomBy` /
 * `setPanOffset` from small handlers here. Pan is plain-wheel scroll only —
 * there is no space/middle-drag pan (reported as omitted).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores/context";
import type { Point } from "../types";
import { brushCellToRgba } from "../types";
import {
  getCirclePixels,
  getSquarePixels,
} from "../components/Canvas/drawingUtils";
import { CanvasSurface } from "../ui/components/CanvasSurface/CanvasSurface";
import { EmptyState } from "../ui/primitives/EmptyState/EmptyState";
import { renderBrushFrame } from "../ui/canvas/render/renderBrushFrame";
import { paintHoverCells } from "../ui/canvas/render/renderHoverMarker";
import { toolFootprint } from "../ui/canvas/tools/toolFootprint";
import type { StampPoint } from "../ui/canvas/tools/brushStamp";
import type { PointerDevice } from "../ui/canvas/tools/toolHandlers";
import { gridOverlayPath } from "../ui/canvas/svg/gridOverlay";
import { hoverOutlineOverlay } from "../ui/canvas/svg/chromeOverlay";
import { screenToPixel } from "../ui/canvas/model/coords";
import { useCanvasPointer } from "../ui/hooks/useCanvasPointer";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import {
  BRUSH_MOVE_LABEL,
  brushCoordGeometry,
  brushCursor,
  brushStrokeLabel,
  buildBrushToolContext,
  createBrushGestureController,
  isBrushGestureTool,
  isBrushInertTool,
  isBrushShapeTool,
  pointsToBrushCells,
} from "./brush/brushToolContext";
import { useBrushPointerHandlers } from "./brush/useBrushPointerHandlers";

/** One layer canvas holds the whole composited frame. Ids only cross the boundary. */
const FRAME_LAYER_ID = "brush-frame";
const LAYER_IDS: readonly string[] = [FRAME_LAYER_ID];
/** Every painter here is 1:1 with the cells — see the header. */
const CELL_SCALE = 1;
/** Grid lines only once a cell is at least this many screen px. */
const GRID_MIN_ZOOM = 8;
/** Same feel as `useCanvasViewport`'s ctrl+wheel. */
const WHEEL_ZOOM_RATE = 0.012;
const NO_PARITY = { x: 0, y: 0 };

export interface BrushCanvasContainerProps {
  className?: string;
}

export const BrushCanvasContainer = observer(function BrushCanvasContainer({
  className,
}: BrushCanvasContainerProps) {
  const app = useStores();
  const { brushUI, brushes, brushPixels, canvasInteraction: interaction } = app;
  const tool = app.ui.tool;

  /* ── refs ──────────────────────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The `width × height` RGBA buffer, reused across frames of the same size. */
  const bufferRef = useRef<ImageData | null>(null);

  /* ── observable reads (scalars, ids, refs — never a grid) ──────────────── */
  const doc = brushes.document;
  const width = doc?.width ?? 0;
  const height = doc?.height ?? 0;
  const selectedFrameId = brushUI.selectedFrameId;
  const layer = brushUI.selectedLayerIn(doc);
  const channelType = layer?.channelType ?? "rgb";
  const zoom = brushUI.zoom;
  const panOffset = brushUI.panOffset;
  const selectedDelta = brushUI.selectedDelta;
  const pixelVersion = brushes.pixelVersion;
  const domainVersion = brushes.domainVersion;
  const lightGridMode = app.ui.viewport.lightGridMode ?? false;

  const currentTool = tool.selectedTool;
  const brushSize = tool.brushSize;
  const activeToolBrushSize = tool.activeToolBrushSize;
  const pencilBrushShape = tool.pencilBrushShape;
  const eraserShape = tool.eraserShape;
  const shapeMode = tool.shapeMode;
  const borderRadius = tool.borderRadiusOrZero;

  const isDrawing = interaction.isDrawing;
  const drawStartPoint = interaction.drawStartPoint;
  const previewPixels = interaction.previewPixels;

  const inert = isBrushInertTool(currentTool);
  const hasDoc = doc !== null && width > 0 && height > 0;

  /* ── hover ─────────────────────────────────────────────────────────────── */
  const [hoverPixel, setHoverPixelState] = useState<Point | null>(null);
  const setHoverPixel = useCallback((p: Point | null) => {
    setHoverPixelState((prev) =>
      prev === p || (prev && p && prev.x === p.x && prev.y === p.y) ? prev : p,
    );
  }, []);

  const resolveHoverCells = useCallback(
    (center: Point): StampPoint[] =>
      toolFootprint(center, {
        tool: currentTool,
        brushSize: activeToolBrushSize,
        pencilShape: pencilBrushShape,
        eraserShape,
        circle: getCirclePixels,
        square: getSquarePixels,
        gridWidth: width,
        gridHeight: height,
      }),
    [
      currentTool,
      activeToolBrushSize,
      pencilBrushShape,
      eraserShape,
      width,
      height,
    ],
  );

  /* ── coordinate mapping ────────────────────────────────────────────────── */
  const coordGeom = useMemo(
    () => brushCoordGeometry(width, height),
    [width, height],
  );

  const getCoords = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeom,
        // A shape or move drag keeps tracking the pointer off-grid; the
        // store drops off-grid cells (`setCells` bounds-filters, and
        // `moveLayerCells` discards what leaves the grid on every step).
        isDrawing && (isBrushShapeTool(currentTool) || currentTool === "move")
          ? "pixel-unbounded"
          : "pixel",
      );
    },
    [coordGeom, isDrawing, currentTool],
  );

  /* ── the tool context and the pointer engine ───────────────────────────── */
  // Exactly one stroke cursor: the hook's ref, bound after the hook call.
  const strokeCursor = useRef<{
    ref: MutableRefObject<StampPoint | null> | null;
  }>({ ref: null });

  const getToolContext = useCallback(
    () =>
      buildBrushToolContext({
        gridWidth: width,
        gridHeight: height,
        brushSize: activeToolBrushSize,
        pencilBrushSize: brushSize,
        pencilShape: pencilBrushShape,
        eraserShape,
        shapeMode,
        borderRadius,
        delta: selectedDelta,
        // The LIVE grid at click time — the container itself never reads it.
        readGrid: () => brushPixels.resolveTarget()?.layer.pixels ?? null,
        lastStrokePixel: strokeCursor.current.ref?.current ?? null,
        setLastStrokePixel: (p) => {
          const ref = strokeCursor.current.ref;
          if (ref) ref.current = p;
        },
        beginStroke: () =>
          brushes.history.beginTransaction(brushStrokeLabel(currentTool)),
        endDrawing: () => {
          brushes.history.endTransaction();
          interaction.endDrawing();
        },
        setCells: (cells) => brushPixels.setCells(cells),
        setPreviewPixels: (points) => interaction.setPreviewPixels(points),
      }),
    [
      width,
      height,
      activeToolBrushSize,
      brushSize,
      pencilBrushShape,
      eraserShape,
      shapeMode,
      borderRadius,
      selectedDelta,
      currentTool,
      brushes,
      brushPixels,
      interaction,
    ],
  );

  const pointer = useCanvasPointer({
    currentTool,
    getToolContext,
    getCoords,
    startDrawing: (coords) => interaction.startDrawing(coords),
    isDrawing,
    drawStartPoint,
  });
  useEffect(() => {
    strokeCursor.current.ref = pointer.lastStrokePixelRef;
  }, [pointer.lastStrokePixelRef]);

  /* ── the gesture tools (eyedropper, move) — ahead of the handler table ─── */
  // A move drag opens the SAME drawing gesture a stroke does, so the window
  // `mouseup`, touch-end and pinch-abort paths below close its transaction.
  const gesture = useMemo(
    () =>
      createBrushGestureController({
        cellAt: (x, y) => brushPixels.cellAt(x, y),
        setDelta: (delta) => brushUI.setDelta(delta),
        beginMove: (coords) => {
          brushes.history.beginTransaction(BRUSH_MOVE_LABEL);
          interaction.startDrawing(coords);
        },
        moveBy: (dx, dy) => brushPixels.moveLayerCells(dx, dy),
      }),
    [brushPixels, brushUI, brushes, interaction],
  );

  /** Pointer-down for either device: a gesture tool first, else the table. */
  const beginPointer = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (!isBrushGestureTool(currentTool)) {
        pointer.beginStroke(clientX, clientY, device);
        return;
      }
      const coords = getCoords(clientX, clientY);
      if (coords) gesture.down(currentTool, coords);
    },
    [currentTool, pointer, getCoords, gesture],
  );

  /** Pointer-move while a gesture is open: a move drag steps, else the table. */
  const continuePointer = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (gesture.isMoving) gesture.move(getCoords(clientX, clientY));
      else pointer.continueStroke(clientX, clientY, device);
    },
    [gesture, getCoords, pointer],
  );

  /**
   * The release, for both devices. A shape tool commits its preview as ONE
   * `setCells` (one history entry); a paint tool's — or a move drag's — open
   * transaction closes. `endTransaction` is a no-op when nothing is open.
   */
  const finishStroke = useCallback(() => {
    pointer.lastStrokePixelRef.current = null;
    gesture.end();
    if (isBrushShapeTool(currentTool) && previewPixels.length > 0) {
      brushes.history.beginTransaction(brushStrokeLabel(currentTool));
      brushPixels.setCells(pointsToBrushCells(previewPixels, selectedDelta));
    }
    brushes.history.endTransaction();
    interaction.endDrawing();
  }, [
    pointer.lastStrokePixelRef,
    gesture,
    currentTool,
    previewPixels,
    selectedDelta,
    brushes,
    brushPixels,
    interaction,
  ]);

  /**
   * A pinch or a cancel: drop the preview, close whatever is open, commit
   * nothing new. A move drag's steps so far STAY applied — closing the
   * transaction commits them as one entry the owner can undo.
   */
  const abortStroke = useCallback(() => {
    pointer.lastStrokePixelRef.current = null;
    gesture.end();
    interaction.clearPreviewPixels();
    brushes.history.endTransaction();
    interaction.endDrawing();
  }, [pointer.lastStrokePixelRef, gesture, interaction, brushes]);

  /* ── render: the frame (THE ONLY place cells are read) ─────────────────── */
  const renderFrame = useCallback(() => {
    const canvas = frameCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);

    const liveDoc = brushes.document;
    const frame = liveDoc?.frames.find((f) => f.id === selectedFrameId);
    if (!liveDoc || !frame || width === 0 || height === 0) return;

    let buffer = bufferRef.current;
    if (!buffer || buffer.width !== width || buffer.height !== height) {
      buffer = ctx.createImageData(width, height);
      bufferRef.current = buffer;
    }
    // `ImageData` IS a `PixelBuffer`, structurally; the compositor clears it.
    renderBrushFrame(buffer, {
      layers: frame.layers,
      width,
      height,
    });
    ctx.putImageData(buffer, 0, 0);

    // The shape preview, colourised as the selected layer would show it.
    if (previewPixels.length > 0) {
      const rgba = brushCellToRgba(selectedDelta, channelType);
      if (rgba) {
        ctx.fillStyle = `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a / 255})`;
        for (const p of previewPixels) {
          if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
            ctx.fillRect(p.x, p.y, CELL_SCALE, CELL_SCALE);
          }
        }
      }
    }
  }, [
    brushes,
    selectedFrameId,
    width,
    height,
    previewPixels,
    selectedDelta,
    channelType,
  ]);
  useCanvasRender(renderFrame, [renderFrame, pixelVersion, domainVersion]);

  /* ── render: the hover marker ──────────────────────────────────────────── */
  const renderHover = useCallback(() => {
    const canvas = hoverCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!hoverPixel || width === 0 || height === 0) return;
    const cells = resolveHoverCells(hoverPixel);
    if (cells.length === 0) return;
    const buffer = ctx.createImageData(width, height);
    paintHoverCells(buffer, cells, CELL_SCALE);
    ctx.putImageData(buffer, 0, 0);
  }, [width, height, hoverPixel, resolveHoverCells]);
  useCanvasRender(renderHover, [renderHover]);

  const hoverOutline = useMemo(() => {
    if (!hoverPixel) return null;
    const cells = resolveHoverCells(hoverPixel);
    return cells.length > 0 ? hoverOutlineOverlay(cells) : null;
  }, [hoverPixel, resolveHoverCells]);

  const grid = useMemo(
    () =>
      hasDoc && zoom >= GRID_MIN_ZOOM
        ? gridOverlayPath(
            { cellWidth: width, cellHeight: height },
            lightGridMode,
          )
        : null,
    [hasDoc, zoom, width, height, lightGridMode],
  );

  /* ── camera: wheel zoom (ctrl/meta) and wheel pan, native + non-passive ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasDoc) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        brushUI.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_RATE));
      } else {
        const pan = brushUI.panOffset;
        brushUI.setPanOffset({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [brushUI, hasDoc]);
  const zoomBy = useCallback(
    (ratio: number) => brushUI.zoomBy(ratio),
    [brushUI],
  );

  /* ── pointer handlers: the device layer lives in `useBrushPointerHandlers` ── */
  const pointerHandlers = useBrushPointerHandlers({
    inert,
    hasLayer: layer !== null && layer !== undefined,
    isDrawing,
    getCoords,
    setHoverPixel,
    beginPointer,
    continuePointer,
    finishStroke,
    abortStroke,
    zoomBy,
  });

  const registerLayerCanvas = useCallback(
    (_id: string, el: HTMLCanvasElement | null) => {
      frameCanvasRef.current = el;
    },
    [],
  );

  if (!hasDoc) {
    return (
      <EmptyState className={className}>Create or select a brush</EmptyState>
    );
  }

  return (
    <CanvasSurface
      canvasRef={canvasRef}
      overlayCanvasRef={overlayCanvasRef}
      frameOverlayCanvasRef={frameOverlayCanvasRef}
      frameTraceOverlayCanvasRef={frameTraceOverlayCanvasRef}
      hoverCanvasRef={hoverCanvasRef}
      containerRef={containerRef}
      layerIds={LAYER_IDS}
      registerLayerCanvas={registerLayerCanvas}
      cellWidth={width}
      cellHeight={height}
      viewPanOffset={panOffset}
      combinedScale={zoom}
      lightGridMode={lightGridMode}
      checkerParity={NO_PARITY}
      cursor={brushCursor(currentTool)}
      showReferenceOverlay={false}
      showFrameOverlay={false}
      showFrameTraceOverlay={false}
      grid={grid}
      hoverOutline={hoverOutline}
      {...pointerHandlers}
    />
  );
});
