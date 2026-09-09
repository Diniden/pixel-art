/**
 * useBrushSelection — the brush canvas's selection state, keys and overlay
 * painter (Brush Studio plan, `docs/01-brush-studio`, task 21).
 *
 * Lifted out of `BrushCanvasContainer` so the container stays under
 * `max-lines`; it owns everything about the selection that is React state
 * and NOT a store: the mask, the rubber band of an open rect drag, the drag
 * vector of an open move, the Escape / Delete keys, and the raster half of
 * the chrome. The container wires the stores in as plain callbacks and
 * passes the SVG half (`marchingAntsOverlay`) to `CanvasSurface` itself.
 *
 * ── The mask lives HERE, not in `brushUI` ─────────────────────────────────
 * `stores/ui/**` is outside task 21's reach, so v1 keeps the mask in
 * `useState`. It therefore RESETS whenever the document identity changes
 * (`resetKey` = `BrushStore.loadGeneration`: a brush switch, create, delete
 * or reload) or the grid size changes (a stale mask would draw in the wrong
 * place and — by `BrushWriteOptions.maskSize`'s rule — silently stop
 * masking). Not persisted, not undoable, not shared across tabs.
 *
 * ── Two painters, one raster and one vector ───────────────────────────────
 * The mask fill and the move preview are `fillRect` work, painted 1:1 into
 * the overlay canvas with `renderSelectionOverlay`'s pure painters (the CSS
 * scale magnifies them). The marching ants are NOT painted here: a 1:1
 * canvas cannot draw a 1-screen-px dashed hairline (`lineWidth = 2` would be
 * two CELLS at every zoom — the defect the pixel canvas fixed on 2026-09-07
 * by moving its ants to `CanvasSurface`'s SVG chrome). So `marchingAnts` is
 * emitted here as SVG path specs for `CanvasSurface`'s `marchingAnts` slot:
 * the rubber band while a rect drag is open, else the mask's box, shifted by
 * an open move's vector.
 *
 * ── The controller is built ONCE per grid size ────────────────────────────
 * Every host callback the container passes (`beginGesture`, `writeMove`,
 * `clearCells`, `readGrid`) is read through a ref at event time, so the
 * container may hand over fresh lambdas each render. Keying the controller
 * on them would rebuild it on the very re-render a drag's own preview
 * causes — and lose the open gesture mid-drag.
 *
 * Store-free: no MobX, no store instance, no API. React, the pure
 * `brushSelection` module, and pure `ui/` imports (the overlay painters, the
 * ants' SVG spec and `isFromDialog`) only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { BrushCell, BrushChannelType, Point } from "../../types";
import { brushCellToRgba } from "../../types";
import type { BrushWriteOptions } from "../../stores/domain/BrushPixelStore";
import { useCanvasRender } from "../../ui/hooks/useCanvasRender";
import { isFromDialog } from "../../ui/hooks/useCanvasKeyboard";
import {
  paintDragPreview,
  paintMaskFill,
} from "../../ui/canvas/render/renderSelectionOverlay";
import type { SelectionBounds } from "../../ui/canvas/render/renderSelectionOverlay";
import { marchingAntsOverlay } from "../../ui/canvas/svg/chromeOverlay";
import type { SvgPathSpec } from "../../ui/canvas/svg/chromeOverlay";
import {
  brushMaskWriteOptions,
  createBrushSelectionController,
  maskBounds,
  maskToCells,
  moveMaskWrites,
  shiftMask,
} from "./brushSelection";
import type {
  BrushMoveWrites,
  BrushSelectionController,
  MoveOffset,
} from "./brushSelection";

/** Every painter here is 1:1 with the cells — see the module header. */
const CELL_SCALE = 1;

export interface BrushSelectionArgs {
  /** Changes when the document identity does (`BrushStore.loadGeneration`). */
  resetKey: number;
  width: number;
  height: number;
  /** The selected layer's channel type — colourises the move preview. */
  channelType: BrushChannelType;
  /** Redraw signal for the move preview (the cells under it may change). */
  pixelVersion: number;
  /**
   * Bind the Escape / Delete / Backspace keys. `false` binds NO listener —
   * the gestures still work, so a click in the non-owning pane still selects
   * there. The container passes "a document is open AND this pane is
   * `brushViews.keyboardOwner`" (follow-ups task 09): with two panes each
   * holding its own mask, exactly one may answer a key press.
   */
  enabled: boolean;
  /** `CanvasSurface`'s reference-overlay canvas; mounted only while needed. */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** The selected layer's LIVE grid, read at paint / commit time only. */
  readGrid: () => BrushCell[][] | null;
  /** `canvasInteraction.startDrawing` — opens the shared release path. */
  beginGesture: (coords: Point) => void;
  /**
   * The container's ONE-transaction write for a move: `setCells(clears)`
   * then `setCells(writes)` between `beginTransaction(BRUSH_MOVE_SELECTION_LABEL)`
   * and `endTransaction`.
   */
  writeMove: (move: BrushMoveWrites) => void;
  /** `brushPixels.clearCells` — Delete / Backspace. */
  clearCells: (cells: { x: number; y: number }[]) => void;
}

export interface BrushSelection {
  /** The current mask, packed `y * width + x`; `null` = no selection. */
  mask: ReadonlySet<number> | null;
  /** The mask's box — the ants when no gesture is open. */
  bounds: SelectionBounds | null;
  /** The rubber band of an open rect drag. */
  previewRect: SelectionBounds | null;
  /** The vector of an open move drag. */
  dragOffset: MoveOffset | null;
  /** True while there is any chrome to show (mounts the overlay canvas). */
  hasChrome: boolean;
  /** The ants for `CanvasSurface`'s SVG chrome; `null` with nothing to show. */
  marchingAnts: { outer: SvgPathSpec; inner: SvgPathSpec } | null;
  /** What every paint tool passes to `setCells` so the mask gates it. */
  writeOptions: BrushWriteOptions;
  /** The press / drag / release triad, for the container's pointer paths. */
  controller: BrushSelectionController;
  /** Drop the selection (Escape). */
  clear: () => void;
  /** Erase every selected cell, keeping the selection (Delete / Backspace). */
  deleteSelected: () => void;
}

export function useBrushSelection({
  resetKey,
  width,
  height,
  channelType,
  pixelVersion,
  enabled,
  overlayCanvasRef,
  readGrid,
  beginGesture,
  writeMove,
  clearCells,
}: BrushSelectionArgs): BrushSelection {
  const [mask, setMaskState] = useState<ReadonlySet<number> | null>(null);
  const [previewRect, setPreviewRect] = useState<SelectionBounds | null>(null);
  const [dragOffset, setDragOffset] = useState<MoveOffset | null>(null);

  // The controller and the key handler read the LIVE mask, not the render
  // they were built in; written only from event-time callbacks.
  const maskRef = useRef<ReadonlySet<number> | null>(null);
  // The host callbacks, latest-first — see the module header.
  const hostRef = useRef({ readGrid, beginGesture, writeMove, clearCells });
  useEffect(() => {
    hostRef.current = { readGrid, beginGesture, writeMove, clearCells };
  });

  const setMask = useCallback((next: ReadonlySet<number> | null) => {
    const value = next && next.size > 0 ? next : null;
    maskRef.current = value;
    setMaskState(value);
  }, []);

  const clear = useCallback(() => setMask(null), [setMask]);

  /* ── reset on document identity / size change ─────────────────────────── */
  const identity = `${resetKey}:${width}x${height}`;
  const identityRef = useRef(identity);
  useEffect(() => {
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    setMask(null);
    setPreviewRect(null);
    setDragOffset(null);
  }, [identity, setMask]);

  /* ── the actions ──────────────────────────────────────────────────────── */
  const deleteSelected = useCallback(() => {
    const current = maskRef.current;
    if (!current) return;
    hostRef.current.clearCells(maskToCells(current, width));
  }, [width]);

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      const current = maskRef.current;
      if (!current) return;
      const { readGrid: grid, writeMove: write } = hostRef.current;
      const cells = grid();
      if (cells) write(moveMaskWrites(cells, current, dx, dy, width, height));
      setMask(shiftMask(current, dx, dy, width, height));
    },
    [setMask, width, height],
  );

  // The state machine is built in an EFFECT, not during render: its host
  // reads refs at event time, and `react-hooks/refs` (rightly) refuses to let
  // a render-time call receive ref-reading callbacks. It is rebuilt only when
  // the grid size changes (through `moveSelected`); the container sees one
  // stable facade that delegates at event time.
  const controllerRef = useRef<BrushSelectionController | null>(null);
  useEffect(() => {
    controllerRef.current = createBrushSelectionController({
      size: () => ({ width, height }),
      mask: () => maskRef.current,
      beginGesture: (coords: Point) => hostRef.current.beginGesture(coords),
      previewRect: setPreviewRect,
      previewMove: setDragOffset,
      commitRect: setMask,
      commitMove: moveSelected,
    });
  }, [width, height, setMask, moveSelected]);
  const controller = useMemo<BrushSelectionController>(
    () => ({
      down: (coords) => controllerRef.current?.down(coords),
      move: (coords) => controllerRef.current?.move(coords),
      end: (commit) => controllerRef.current?.end(commit),
      get isActive() {
        return controllerRef.current?.isActive ?? false;
      },
    }),
    [],
  );

  /* ── Escape clears, Delete / Backspace erases (capture, like the pixel canvas) ── */
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!maskRef.current) return;
      if (isFromDialog(e.target)) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        clear();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, clear, deleteSelected]);

  /* ── the raster chrome: mask fill, move preview ───────────────────────── */
  const render = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!mask || width === 0 || height === 0) return;
    const buffer = ctx.createImageData(width, height);
    const common = { mask, maskWidth: width, zoom: CELL_SCALE };
    if (dragOffset && (dragOffset.dx !== 0 || dragOffset.dy !== 0)) {
      const grid = readGrid();
      paintDragPreview(buffer, {
        ...common,
        offsetX: 0,
        offsetY: 0,
        dragDx: dragOffset.dx,
        dragDy: dragOffset.dy,
        gridWidth: width,
        gridHeight: height,
        readPixel: (x, y) => {
          const cell = grid?.[y]?.[x];
          return cell === undefined ? null : brushCellToRgba(cell, channelType);
        },
      });
    } else {
      paintMaskFill(buffer, { ...common, offsetX: 0, offsetY: 0 });
    }
    ctx.putImageData(buffer, 0, 0);
  }, [
    overlayCanvasRef,
    width,
    height,
    mask,
    dragOffset,
    readGrid,
    channelType,
  ]);
  useCanvasRender(render, [render, pixelVersion]);

  const bounds = useMemo(
    () => (mask ? maskBounds(mask, width) : null),
    [mask, width],
  );
  const writeOptions = useMemo(
    () => brushMaskWriteOptions(mask, width, height),
    [mask, width, height],
  );
  const marchingAnts = useMemo(() => {
    const box = previewRect ?? bounds;
    if (!box) return null;
    return marchingAntsOverlay(
      box,
      0,
      0,
      dragOffset?.dx ?? 0,
      dragOffset?.dy ?? 0,
    );
  }, [previewRect, bounds, dragOffset]);

  return {
    mask,
    bounds,
    previewRect,
    dragOffset,
    hasChrome: mask !== null || previewRect !== null,
    marchingAnts,
    writeOptions,
    controller,
    clear,
    deleteSelected,
  };
}
