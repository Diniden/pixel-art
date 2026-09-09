/**
 * brushToolContext — the pure half of `BrushCanvasContainer` (Brush Studio
 * plan, `docs/01-brush-studio`, task 16; MASTER D18 / D19).
 *
 * The brush canvas drives the SAME `toolHandlers` table the pixel canvas
 * does. Those handlers think in colours: they hand back `ToolPixelWrite`s
 * whose `color` is either a `ToolColor` or the `0` erase sentinel. A brush
 * layer stores signed DELTAS, not colours (D3), so this module is the
 * translation layer between the two vocabularies:
 *
 *   - `DUMMY_TOOL_COLOR` is what the handlers are given as `currentColor`.
 *     Its value is irrelevant — the only thing this module ever asks of a
 *     write's colour is "is it the erase sentinel?" (D19).
 *   - `mapWritesToBrushCells` turns every write into a `BrushCellWrite`:
 *     `0` stays `0` (unpainted), anything else becomes a COPY of the delta
 *     the user has dialled in.
 *
 * ── ⚠️ EVERY PAINTED CELL GETS ITS OWN TUPLE ──────────────────────────────
 * `selectedDelta` is an `observableRef` on `BrushUIStore` that is replaced
 * wholesale on every slider move, so aliasing it would be safe TODAY — but
 * the document is meant to be a plain JSON tree that other code (undo
 * patches, the timeline thumbnails, `JSON.stringify`) may hold onto, and a
 * single shared tuple behind a thousand cells is the kind of hidden identity
 * that turns a future in-place edit into a silent corruption of every cell
 * at once. `copyDelta` is a tuple LITERAL, never a spread of the argument,
 * and the tests pin that no two cells — and no cell and the source — share a
 * reference. (`BrushPixelStore.setCells` copies again on the way in; the
 * belt is here, the braces are there.)
 *
 * ── Why `buildBrushToolContext` lives here and not in the container ───────
 * `ToolContext` has fourteen members. Assembling it inline in the container
 * hides the two decisions that matter (the colour→delta mapping and which
 * tools are wired) inside a wall of plumbing. Here they are the whole file,
 * and they are testable without React, MobX or a DOM.
 *
 * ── Task 20: the fills and the two gesture tools ──────────────────────────
 * `floodFillAt` / `gaussianFillAt` run {@link brushFloodFill} over the LIVE
 * grid (`readGrid`, read at click time — never a render-time capture) and
 * hand back writes carrying the dummy colour; the handler's `setPixels`
 * maps them to the delta and `BrushPixelStore.setCells` records ONE entry.
 * The eyedropper and move are GESTURE tools — arbitrated by the container
 * ahead of the handler table, as `CanvasContainer.isGestureTool` does — and
 * their state machine is {@link createBrushGestureController}, kept here so
 * the container stays under `max-lines` and the maths is testable.
 *
 * Pure: no React, no MobX, no store instance, no API. The only imports are
 * TYPES from the stores (erased at build time) and the shape generators from
 * `components/Canvas/drawingUtils`, which containers may import.
 */
import type { BrushCell, BrushDelta, Point, ShapeMode } from "../../types";
import type { BrushCellWrite } from "../../stores/domain/BrushPixelStore";
import { brushFloodFill } from "./brushFill";
import type {
  ToolColor,
  ToolContext,
  ToolPixelWrite,
} from "../../ui/canvas/tools/toolHandlers";
import type { StampPoint } from "../../ui/canvas/tools/brushStamp";
import type { BrushShape } from "../../ui/canvas/tools/toolFootprint";
import type { CanvasViewGeometry } from "../../ui/canvas/model/coords";
import {
  getCirclePixels,
  getEllipsePixels,
  getLinePixels,
  getRectanglePixels,
  getSquarePixels,
} from "../../components/Canvas/drawingUtils";

/**
 * The colour the handlers are told they are painting with (D19). Opaque so
 * nothing downstream mistakes it for the erase sentinel; otherwise
 * meaningless — it never reaches a cell.
 */
export const DUMMY_TOOL_COLOR: ToolColor = { r: 0, g: 0, b: 0, a: 255 };

/**
 * The tools that go through the handler table: task 16's six stroke tools
 * and task 20's two fills (which commit on the down event and open no
 * drag). Everything else the toolbar can select is either a
 * {@link BRUSH_GESTURE_TOOLS gesture tool} or {@link isBrushInertTool} until
 * task 21 (selection) takes its entry out of {@link BRUSH_INERT_TOOLS}.
 */
export const BRUSH_STROKE_TOOLS: ReadonlySet<string> = new Set([
  "pixel",
  "eraser",
  "line",
  "rectangle",
  "ellipse",
  "fill-square",
  "flood-fill",
  "gaussian-fill",
]);

/** The three drag-to-draw tools: preview on move, commit on release. */
export function isBrushShapeTool(tool: string): boolean {
  return tool === "line" || tool === "rectangle" || tool === "ellipse";
}

/**
 * The tools the container arbitrates BEFORE the handler table (task 20),
 * exactly as `CanvasContainer.isGestureTool` does for the pixel canvas:
 * neither has a handler body, and neither opens a stroke through
 * `useCanvasPointer`. See {@link createBrushGestureController}.
 */
export const BRUSH_GESTURE_TOOLS: ReadonlySet<string> = new Set([
  "eyedropper",
  "move",
]);

export function isBrushGestureTool(tool: string): boolean {
  return BRUSH_GESTURE_TOOLS.has(tool);
}

/**
 * Tools that must be VISIBLY INERT on the brush canvas — no stroke, no
 * transaction, no exception — until a later task wires them.
 *
 * ⚠️ Deliberately broader than the task file's list. `reflection`, `pose`
 * and the three lighting tools are also members: none of them has a handler
 * body in `toolHandlers`, so letting them through `useCanvasPointer` would
 * open a drawing gesture (`startDrawing`) that nothing closes with a paint,
 * and the release path would then run a shape-commit check against a tool
 * that never previewed. Listing them keeps "inert" one predicate rather than
 * a predicate plus an accident of the handler table.
 *
 * Task 20 removed `flood-fill`, `gaussian-fill`, `eyedropper` and `move`;
 * task 21 removes `selection`. Nothing is ever added.
 */
export const BRUSH_INERT_TOOLS: ReadonlySet<string> = new Set([
  "origin",
  "reference-trace",
  "selection",
  "reflection",
  "pose",
  "normal-pencil",
  "auto-normal",
  "height-map",
]);

export function isBrushInertTool(tool: string): boolean {
  return BRUSH_INERT_TOOLS.has(tool);
}

/** The CSS cursor the surface shows for `tool`. */
export function brushCursor(tool: string): string {
  if (isBrushInertTool(tool)) return "default";
  return tool === "move" ? "move" : "crosshair";
}

/** The undo-entry label a stroke of `tool` records. */
export function brushStrokeLabel(tool: string): string {
  switch (tool) {
    case "eraser":
      return "Erase";
    case "line":
      return "Draw line";
    case "rectangle":
      return "Draw rectangle";
    case "ellipse":
      return "Draw ellipse";
    case "fill-square":
      return "Fill square";
    default:
      return "Draw";
  }
}

/** A fresh 4-tuple with `delta`'s values. A literal, never a spread. */
export function copyDelta(delta: BrushDelta): BrushDelta {
  return [delta[0], delta[1], delta[2], delta[3]];
}

/**
 * D19: `color === 0` → unpainted; anything else → a COPY of `delta`.
 *
 * One copy PER CELL — see the module header. Out-of-grid writes are passed
 * through untouched; `BrushPixelStore.setCells` is the one bounds filter.
 */
export function mapWritesToBrushCells(
  writes: readonly ToolPixelWrite[],
  delta: BrushDelta,
): BrushCellWrite[] {
  return writes.map(({ x, y, color }) => ({
    x,
    y,
    value: color === 0 ? 0 : copyDelta(delta),
  }));
}

/**
 * The shape tools' release path: every previewed point becomes a painted
 * cell. Same per-cell copy rule as {@link mapWritesToBrushCells}.
 */
export function pointsToBrushCells(
  points: readonly StampPoint[],
  delta: BrushDelta,
): BrushCellWrite[] {
  return points.map(({ x, y }) => ({ x, y, value: copyDelta(delta) }));
}

/**
 * The `screenToPixel` geometry for a brush: no variant, no view offset, the
 * grid is the object. `objWidth/Height` mirror the grid so every snap mode
 * agrees on the extent.
 */
export function brushCoordGeometry(
  width: number,
  height: number,
): CanvasViewGeometry {
  return {
    gridWidth: width,
    gridHeight: height,
    objWidth: width,
    objHeight: height,
    editingVariant: false,
    variantOffset: { x: 0, y: 0 },
    viewMinX: 0,
    viewMinY: 0,
    viewWidth: width,
    viewHeight: height,
  };
}

/** A touch, structurally — `React.TouchList` entries satisfy it. */
export interface ClientPoint {
  clientX: number;
  clientY: number;
}

/** Distance between the first two contacts of a pinch, in CSS px. */
export function touchDistance(touches: ArrayLike<ClientPoint>): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/* ── the two gesture tools (task 20) ─────────────────────────────────────── */

/** The undo label of one move drag — the whole drag is ONE entry. */
export const BRUSH_MOVE_LABEL = "Move layer";

/**
 * The eyedropper's pick: a painted cell's delta as a fresh tuple; `null` for
 * an unpainted cell (`0`) or no cell at all (off-grid / nothing selected), in
 * which case the pick is a no-op — the sliders keep what they had.
 */
export function pickBrushDelta(cell: BrushCell | undefined): BrushDelta | null {
  return cell === undefined || cell === 0 ? null : copyDelta(cell);
}

/** What the gesture controller reaches into — the container wires the stores. */
export interface BrushGestureHost {
  /** `brushPixels.cellAt` — the selected layer's cell, read at pick time. */
  cellAt: (x: number, y: number) => BrushCell | undefined;
  /** `brushUI.setDelta` (which clamps and copies again). */
  setDelta: (delta: BrushDelta) => void;
  /**
   * Opens the move drag: ONE history transaction (`BRUSH_MOVE_LABEL`) and
   * the drawing gesture (`canvasInteraction.startDrawing`), so the same
   * release path that ends a stroke — window `mouseup`, touch end, pinch
   * abort — closes the transaction.
   */
  beginMove: (coords: Point) => void;
  /** `brushPixels.moveLayerCells` — one applied step inside the open transaction. */
  moveBy: (dx: number, dy: number) => void;
}

export interface BrushGestureController {
  /**
   * Pointer-down. Returns `true` when `tool` is a gesture tool and the event
   * was consumed (the caller must NOT dispatch to the handler table).
   */
  down: (tool: string, coords: Point) => boolean;
  /**
   * Pointer-move during a move drag: shifts the layer by the vector since the
   * LAST APPLIED step and re-anchors there. `null` (off-grid in a bounded
   * mapping) or a zero vector applies nothing. No-op when no drag is open.
   */
  move: (coords: Point | null) => void;
  /** Release or abort: forgets the anchor. The host closes the transaction. */
  end: () => void;
  /** True between `down("move", …)` and `end()`. */
  readonly isMoving: boolean;
}

/**
 * The eyedropper / move state machine. Pure and framework-free: the only
 * state is the move anchor, and every effect goes through `host`.
 *
 * Moves accumulate as REPEATED `moveLayerCells(dx, dy)` calls — one per cell
 * the pointer crosses — rather than one call on release, so the layer
 * follows the pointer live; the transaction the host opened collapses them
 * into one undo entry. Cells shifted off the grid are dropped by the store
 * on each step, so a drag out and back does not bring them back (the pixel
 * canvas's `moveLayerPixels` has the same contract).
 */
export function createBrushGestureController(
  host: BrushGestureHost,
): BrushGestureController {
  let anchor: Point | null = null;
  return {
    down(tool, coords) {
      if (tool === "eyedropper") {
        const delta = pickBrushDelta(host.cellAt(coords.x, coords.y));
        if (delta) host.setDelta(delta);
        return true;
      }
      if (tool === "move") {
        anchor = { x: coords.x, y: coords.y };
        host.beginMove(coords);
        return true;
      }
      return false;
    },
    move(coords) {
      if (!anchor || !coords) return;
      const dx = coords.x - anchor.x;
      const dy = coords.y - anchor.y;
      if (dx === 0 && dy === 0) return;
      host.moveBy(dx, dy);
      anchor = { x: coords.x, y: coords.y };
    },
    end() {
      anchor = null;
    },
    get isMoving() {
      return anchor !== null;
    },
  };
}

/** Everything the container hands over — plain values and callbacks. */
export interface BrushToolContextArgs {
  gridWidth: number;
  gridHeight: number;
  /** The ACTIVE tool's diameter — the eraser has its own size setting. */
  brushSize: number;
  /**
   * The pencil's diameter. `fill-square` reads THIS, not `brushSize`, because
   * the pixel canvas's `squarePixelsAt` does (`CanvasContainer`, "fill-square
   * reads the PENCIL's size by design").
   */
  pencilBrushSize: number;
  pencilShape: BrushShape;
  eraserShape: BrushShape;
  shapeMode: ShapeMode;
  borderRadius: number;
  /** `brushUI.selectedDelta`. Copied per cell; never stored by reference. */
  delta: BrushDelta;
  /**
   * The selected layer's LIVE grid, read when a fill is clicked — `null`
   * when nothing is selected (the fill is then empty). A callback, not a
   * value: the context is assembled per render and must never capture a
   * grid the store has since replaced.
   */
  readGrid: () => BrushCell[][] | null;

  lastStrokePixel: StampPoint | null;
  setLastStrokePixel: (p: StampPoint | null) => void;

  /** Opens the brush history transaction for this stroke. */
  beginStroke: () => void;
  /** Closes the transaction AND the gesture (`canvasInteraction.endDrawing`). */
  endDrawing: () => void;
  /** `app.brushPixels.setCells`, already translated to deltas. */
  setCells: (cells: BrushCellWrite[]) => void;
  /** `app.canvasInteraction.setPreviewPixels`. */
  setPreviewPixels: (points: Point[]) => void;
}

/**
 * Assemble the `ToolContext` the shared handlers run against.
 *
 * `floodFillAt` and `gaussianFillAt` are the SAME fill (MASTER §1: gaussian
 * behaves as flood on a delta grid): the 4-connected region of the clicked
 * cell, every member carrying the dummy colour so `setPixels` paints it with
 * the delta. The flood handler calls `setPixels` once and never
 * `beginStroke`, so the region lands as ONE `setCells` → one history entry.
 */
export function buildBrushToolContext(args: BrushToolContextArgs): ToolContext {
  const {
    gridWidth,
    gridHeight,
    brushSize,
    pencilBrushSize,
    pencilShape,
    eraserShape,
    shapeMode,
    borderRadius,
    delta,
    readGrid,
    lastStrokePixel,
    setLastStrokePixel,
    beginStroke,
    endDrawing,
    setCells,
    setPreviewPixels,
  } = args;

  const fillAt = (p: StampPoint): ToolPixelWrite[] => {
    const grid = readGrid();
    if (!grid) return [];
    return brushFloodFill(grid, gridWidth, gridHeight, p.x, p.y).map(
      ({ x, y }) => ({ x, y, color: DUMMY_TOOL_COLOR }),
    );
  };

  return {
    gridWidth,
    gridHeight,
    brushSize,
    currentColor: DUMMY_TOOL_COLOR,
    pencilShape: pencilShape === "circle" ? getCirclePixels : getSquarePixels,
    eraserShapeFn: eraserShape === "circle" ? getCirclePixels : getSquarePixels,
    line: getLinePixels,
    shapeMode,
    borderRadius,
    lastStrokePixel,
    setLastStrokePixel,
    beginStroke,
    endDrawing,
    setPixels: (writes) => setCells(mapWritesToBrushCells(writes, delta)),
    setPreviewPixels: (points) =>
      setPreviewPixels(points.map((p) => ({ x: p.x, y: p.y }))),
    floodFillAt: fillAt,
    gaussianFillAt: fillAt,
    // Carries the dummy colour so the handler's `setPixels` maps it to the
    // delta; the pencil's size, as on the pixel canvas.
    squarePixelsAt: (p) =>
      getSquarePixels(p, pencilBrushSize, DUMMY_TOOL_COLOR).map((c) => ({
        x: c.x,
        y: c.y,
        color: DUMMY_TOOL_COLOR,
      })),
    rectanglePreview: (from, to) =>
      getRectanglePixels(from, to, shapeMode, borderRadius),
    ellipsePreview: (from, to) => getEllipsePixels(from, to, shapeMode),
    linePreview: (from, to) => getLinePixels(from, to),
  };
}
