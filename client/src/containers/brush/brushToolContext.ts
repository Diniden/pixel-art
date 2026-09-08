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
 * Pure: no React, no MobX, no store instance, no API. The only imports are
 * TYPES from the stores (erased at build time) and the shape generators from
 * `components/Canvas/drawingUtils`, which containers may import.
 */
import type { BrushDelta, Point, ShapeMode } from "../../types";
import type { BrushCellWrite } from "../../stores/domain/BrushPixelStore";
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
 * The tools task 16 wires. Everything else the toolbar can select is
 * {@link isBrushInertTool} until tasks 20 (flood-fill, eyedropper, move) and
 * 21 (selection) take their entries out of {@link BRUSH_INERT_TOOLS}.
 */
export const BRUSH_STROKE_TOOLS: ReadonlySet<string> = new Set([
  "pixel",
  "eraser",
  "line",
  "rectangle",
  "ellipse",
  "fill-square",
]);

/** The three drag-to-draw tools: preview on move, commit on release. */
export function isBrushShapeTool(tool: string): boolean {
  return tool === "line" || tool === "rectangle" || tool === "ellipse";
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
 * Tasks 20/21 REMOVE entries from this set; they never add to it.
 */
export const BRUSH_INERT_TOOLS: ReadonlySet<string> = new Set([
  "origin",
  "reference-trace",
  "flood-fill",
  "gaussian-fill",
  "eyedropper",
  "move",
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
 * `floodFillAt` / `gaussianFillAt` return `[]` — those tools are inert until
 * task 20 and the container never dispatches them, so the members exist only
 * to satisfy the interface without a cast.
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
    lastStrokePixel,
    setLastStrokePixel,
    beginStroke,
    endDrawing,
    setCells,
    setPreviewPixels,
  } = args;

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
    floodFillAt: () => [],
    gaussianFillAt: () => [],
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
