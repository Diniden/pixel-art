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
 * the ordinary release path closes. The selection (task 21) is arbitrated
 * the same way: `useBrushSelection` keeps the mask in React state (it resets
 * on a brush switch — see its header), the paint tools receive it as
 * `BrushWriteOptions`, Delete erases the masked cells, a drag inside it
 * moves them as ONE transaction, and the ants are SVG chrome.
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
 * `zoom * viewZoom` as `combinedScale`. `renderNormalEdit`'s upscale and
 * `strokeGrid` would both be silent regressions here — see their headers.
 *
 * ── The camera: `useCanvasViewport`, committing into `brushUI` ────────────
 * (Follow-ups task 06, MASTER D1–D4.) The same engine as the pixel and
 * lighting canvases drives this one — anchored pinch, two-finger pan,
 * ctrl/⌘-wheel zoom, plain-wheel pan, zoom-out floor, debounced commit,
 * re-sync on brush/frame — through the `useBrushCamera` adapter; the brush
 * store is its `CanvasCamera` (session-only, task 10). Middle / alt drag
 * pans; a lone finger under `pencilOnly` does nothing. `combinedScale` is
 * `zoom * viewZoom`, computed once in the adapter; `zoom` stays integer.
 *
 * ── What lives in `./brush/` ──────────────────────────────────────────────
 * Everything store-free: the tool context and gesture maths
 * (`brushToolContext`), the device layer (`useBrushPointerHandlers`), the
 * hover marker (`useBrushHover`), the camera (`useBrushCamera`) and the
 * selection (`brushSelection` + `useBrushSelection`). This file keeps only
 * what touches a store.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores/context";
import type { Point } from "../types";
import { brushCellToRgba } from "../types";
import { CanvasSurface } from "../ui/components/CanvasSurface/CanvasSurface";
import { CanvasViewControls } from "../ui/components/CanvasViewControls/CanvasViewControls";
import { EmptyState } from "../ui/primitives/EmptyState/EmptyState";
import { renderBrushFrame } from "../ui/canvas/render/renderBrushFrame";
import type { StampPoint } from "../ui/canvas/tools/brushStamp";
import type { PointerDevice } from "../ui/canvas/tools/toolHandlers";
import { gridOverlayPath } from "../ui/canvas/svg/gridOverlay";
import { screenToPixel } from "../ui/canvas/model/coords";
import { useCanvasPointer } from "../ui/hooks/useCanvasPointer";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import { isTouchDevice } from "../ui/utils/pointerDevice";
import {
  BRUSH_MOVE_LABEL,
  brushCoordGeometry,
  brushCursor,
  brushStrokeLabel,
  buildBrushToolContext,
  createBrushGestureController,
  isBrushGestureTool,
  isBrushInertTool,
  isBrushSelectionTool,
  isBrushShapeTool,
  pointsToBrushCells,
} from "./brush/brushToolContext";
import { BRUSH_MOVE_SELECTION_LABEL } from "./brush/brushSelection";
import { useBrushCamera } from "./brush/useBrushCamera";
import { useBrushHover } from "./brush/useBrushHover";
import { useBrushPointerHandlers } from "./brush/useBrushPointerHandlers";
import { useBrushSelection } from "./brush/useBrushSelection";

/** One layer canvas holds the whole composited frame. Ids only cross the boundary. */
const FRAME_LAYER_ID = "brush-frame";
const LAYER_IDS: readonly string[] = [FRAME_LAYER_ID];
/** Every painter here is 1:1 with the cells — see the header. */
const CELL_SCALE = 1;
/** Grid lines only once a cell is at least this many screen px. */
const GRID_MIN_ZOOM = 8;
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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const selectedDelta = brushUI.selectedDelta;
  const pixelVersion = brushes.pixelVersion;
  const domainVersion = brushes.domainVersion;
  const loadGeneration = brushes.loadGeneration;
  const brushName = brushes.brushName;
  const lightGridMode = app.ui.viewport.lightGridMode ?? false;
  // Pencil-only input: tri-state in the file, device-dependent default — the
  // same resolution as the pixel canvas (`CanvasContainer.tsx:648`).
  const pencilOnly = app.ui.viewport.pencilOnly ?? isTouchDevice();

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

  /* ── hover marker and camera: store-free hooks in `./brush/` ───────────── */
  const { hoverCanvasRef, setHoverPixel, hoverOutline } = useBrushHover({
    width,
    height,
    tool: currentTool,
    brushSize: activeToolBrushSize,
    pencilShape: pencilBrushShape,
    eraserShape,
  });
  const camera = useBrushCamera({
    enabled: hasDoc,
    width,
    height,
    zoom,
    camera: brushUI,
    resyncKey: `${brushName}:${selectedFrameId ?? ""}`,
  });

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
        // A shape, move or selection drag keeps tracking the pointer
        // off-grid; the store drops off-grid cells (`setCells`
        // bounds-filters, `moveLayerCells` discards what leaves the grid on
        // every step) and the selection clamps its rectangle.
        isDrawing &&
          (isBrushShapeTool(currentTool) ||
            currentTool === "move" ||
            isBrushSelectionTool(currentTool))
          ? "pixel-unbounded"
          : "pixel",
      );
    },
    [coordGeom, isDrawing, currentTool],
  );

  /* ── the selection (task 21): mask, keys, raster chrome ────────────────── */
  // The LIVE grid at paint / commit time — the container itself never reads it.
  const readGrid = useCallback(
    () => brushPixels.resolveTarget()?.layer.pixels ?? null,
    [brushPixels],
  );
  const selection = useBrushSelection({
    resetKey: loadGeneration,
    width,
    height,
    channelType,
    pixelVersion,
    enabled: hasDoc,
    overlayCanvasRef,
    readGrid,
    beginGesture: (coords) => interaction.startDrawing(coords),
    // ONE transaction: clear the old cells, then write the new (two
    // commands → one composite entry carrying the label; see `moveMaskWrites`).
    writeMove: ({ clears, writes }) => {
      brushes.history.beginTransaction(BRUSH_MOVE_SELECTION_LABEL);
      brushPixels.setCells(clears);
      brushPixels.setCells(writes);
      brushes.history.endTransaction();
    },
    clearCells: (cells) => brushPixels.clearCells(cells),
  });
  const selectionWriteOptions = selection.writeOptions;
  const selectionController = selection.controller;

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
        readGrid,
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
        setCells: (cells, options) => brushPixels.setCells(cells, options),
        setPreviewPixels: (points) => interaction.setPreviewPixels(points),
        writeOptions: selectionWriteOptions,
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
      readGrid,
      currentTool,
      brushes,
      brushPixels,
      interaction,
      selectionWriteOptions,
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

  /** Pointer-down for either device: selection, then a gesture tool, else the table. */
  const beginPointer = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (isBrushSelectionTool(currentTool)) {
        const coords = getCoords(clientX, clientY);
        if (coords) selectionController.down(coords);
        return;
      }
      if (!isBrushGestureTool(currentTool)) {
        pointer.beginStroke(clientX, clientY, device);
        return;
      }
      const coords = getCoords(clientX, clientY);
      if (coords) gesture.down(currentTool, coords);
    },
    [currentTool, pointer, getCoords, gesture, selectionController],
  );

  /** Pointer-move while a gesture is open: selection or move drag, else the table. */
  const continuePointer = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (selectionController.isActive) {
        selectionController.move(getCoords(clientX, clientY));
      } else if (gesture.isMoving) {
        gesture.move(getCoords(clientX, clientY));
      } else {
        pointer.continueStroke(clientX, clientY, device);
      }
    },
    [selectionController, gesture, getCoords, pointer],
  );

  /**
   * The release, for both devices. A shape tool commits its preview as ONE
   * `setCells` (one history entry); a paint tool's — or a move drag's — open
   * transaction closes. `endTransaction` is a no-op when nothing is open.
   */
  const finishStroke = useCallback(() => {
    pointer.lastStrokePixelRef.current = null;
    gesture.end();
    // A selection release commits its rect or its move (one transaction of
    // its own) BEFORE the shared close below.
    selectionController.end(true);
    if (isBrushShapeTool(currentTool) && previewPixels.length > 0) {
      brushes.history.beginTransaction(brushStrokeLabel(currentTool));
      brushPixels.setCells(
        pointsToBrushCells(previewPixels, selectedDelta),
        selectionWriteOptions,
      );
    }
    brushes.history.endTransaction();
    interaction.endDrawing();
  }, [
    pointer.lastStrokePixelRef,
    gesture,
    selectionController,
    currentTool,
    previewPixels,
    selectedDelta,
    selectionWriteOptions,
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
    selectionController.end(false);
    interaction.clearPreviewPixels();
    brushes.history.endTransaction();
    interaction.endDrawing();
  }, [
    pointer.lastStrokePixelRef,
    gesture,
    selectionController,
    interaction,
    brushes,
  ]);

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

  /* ── pointer handlers: the device layer lives in `useBrushPointerHandlers` ── */
  const { handlers: pointerHandlers, isPanning } = useBrushPointerHandlers({
    inert,
    hasLayer: layer !== null && layer !== undefined,
    isDrawing,
    containerRef: camera.containerRef,
    pencilOnly,
    isPinching: camera.isPinching,
    viewPanRef: camera.viewPanRef,
    setViewPanOffset: camera.setViewPanOffset,
    scheduleCommitPan: camera.scheduleCommitPan,
    getCoords,
    setHoverPixel,
    beginPointer,
    continuePointer,
    finishStroke,
    abortStroke,
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
      containerRef={camera.containerRef}
      layerIds={LAYER_IDS}
      registerLayerCanvas={registerLayerCanvas}
      cellWidth={width}
      cellHeight={height}
      // The engine's LIVE pan (the store's is the debounced commit) and the
      // one scale, `zoom * viewZoom`, multiplied in the adapter and nowhere else.
      viewPanOffset={camera.viewPanOffset}
      combinedScale={camera.combinedScale}
      lightGridMode={lightGridMode}
      checkerParity={NO_PARITY}
      cursor={isPanning ? "grabbing" : brushCursor(currentTool)}
      // The selection's raster chrome paints into the reference overlay
      // canvas, mounted only while there is something to show.
      showReferenceOverlay={selection.hasChrome}
      showFrameOverlay={false}
      showFrameTraceOverlay={false}
      grid={grid}
      hoverOutline={hoverOutline}
      marchingAnts={selection.marchingAnts}
      viewControls={<CanvasViewControls onResetView={camera.handleResetView} />}
      {...pointerHandlers}
    />
  );
});
