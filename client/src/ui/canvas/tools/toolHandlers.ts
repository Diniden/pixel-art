/**
 * The tool dispatch table — one entry per member of the 18-tool union.
 *
 * ## What this replaces
 *
 * `Canvas.tsx` decided what a tool does in four separate places: the mouse
 * down/move handlers and the touch start/move handlers. The touch pair
 * implemented a SUBSET of the mouse pair, and where the two overlapped they had
 * already drifted (R10 / Q44 — see `brushStamp.ts`). This table is the single
 * decision point both devices now go through, so "what does the eraser do on
 * pointer-down" has exactly one answer.
 *
 * ## Purity, and why the handlers take a context object
 *
 * Nothing here may import a store, the API, or MobX. Every effect a tool needs —
 * writing pixels, opening a history entry, moving a selection — arrives as a
 * callback on `ToolContext`, and every value it reads arrives as a field. The
 * handlers therefore compute and delegate; they never reach for state.
 *
 * ## Device parity is structural, not asserted
 *
 * `onDown` and `onMove` take a `device` field, but **no handler branches on it.**
 * It is carried for the two places the legacy code legitimately differed
 * (touch-specific gesture bookkeeping lives in `useCanvasPointer`, not here) and
 * so a future divergence has to be written deliberately rather than by omission.
 * The agreement gate in `__tests__/brushStamp.test.ts` runs the same handler for
 * both devices and asserts identical output.
 *
 * ## Tools with no entry body
 *
 * `reference-trace` is a MODE, not a pointer tool: when it is active the trace
 * sampler takes precedence over the selected tool entirely, which is why the
 * legacy handlers tested `isReferenceTraceActive` before reading `currentTool`.
 * `normal-pencil`, `auto-normal` and `height-map` belong to the lighting studio
 * (`LightingCanvas.tsx`) and never reach this surface.
 *
 * `origin`, `reflection` and `pose` are GESTURE tools: `CanvasContainer`
 * arbitrates their pointer gestures ahead of this table, so a gesture never
 * opens a history stroke or writes a pixel through a handler. `pose` in
 * particular is a 3D reference overlay — its drag pans the model and its
 * double-click stamps the rendered texels through a store action of its own
 * (`docs/06-pose-tool/`), neither of which is a pointer-tool effect.
 *
 * All of them are present with explicit no-op entries so the
 * `Record<Tool, ...>` is exhaustive and adding a 19th tool is a type error
 * rather than a silent gap.
 */

import { stampAt, stampSegment } from "./brushStamp";
import type {
  BrushShapeFn,
  LineFn,
  StampColor,
  StampPoint,
} from "./brushStamp";
// Type-only: a string union, erased at build time. Used solely by the
// exhaustiveness gate at the bottom of this file.
import type { Tool as DomainTool } from "../../../types/domain";

/** Which input device produced the event. Carried, never branched on. */
export type PointerDevice = "mouse" | "touch";

/** A colour, structurally — `ui/` does not import the domain `Color`. */
export type ToolColor = StampColor;

/** The erase sentinel the store understands. */
export type EraseColor = 0;

/** One pixel write handed back to the caller. */
export interface ToolPixelWrite {
  x: number;
  y: number;
  color: ToolColor | EraseColor;
}

/**
 * Everything a handler may read or do. Assembled per event by
 * `useCanvasPointer`; every member is a plain value or a plain function, so
 * this file stays store-free.
 */
export interface ToolContext {
  /* — geometry — */
  gridWidth: number;
  gridHeight: number;

  /* — brush settings — */
  brushSize: number;
  currentColor: ToolColor;
  /** Shape generator for the pencil/trace brush. */
  pencilShape: BrushShapeFn;
  /** Shape generator for the eraser, which has its OWN shape setting. */
  eraserShapeFn: BrushShapeFn;
  /** Line rasteriser used to bridge drag segments. */
  line: LineFn;

  /* — shape-tool settings — */
  shapeMode: string;
  borderRadius: number;

  /* — stroke bookkeeping — */
  /** Last cell painted in this stroke, or `null` at the start. */
  lastStrokePixel: StampPoint | null;
  setLastStrokePixel: (p: StampPoint | null) => void;

  /* — effects — */
  beginStroke: () => void;
  endDrawing: () => void;
  setPixels: (writes: ToolPixelWrite[]) => void;
  setPreviewPixels: (points: StampPoint[]) => void;
  /** Flood/gaussian fills are computed against the live grid by the caller. */
  floodFillAt: (p: StampPoint) => ToolPixelWrite[];
  gaussianFillAt: (p: StampPoint) => ToolPixelWrite[];
  /** Square-fill geometry, which carries its own colour rule. */
  squarePixelsAt: (p: StampPoint) => ToolPixelWrite[];

  /* — shape previews — */
  rectanglePreview: (from: StampPoint, to: StampPoint) => StampPoint[];
  ellipsePreview: (from: StampPoint, to: StampPoint) => StampPoint[];
  linePreview: (from: StampPoint, to: StampPoint) => StampPoint[];
}

/** The event a handler receives. */
export interface ToolEvent {
  coords: StampPoint;
  device: PointerDevice;
  /** Where this stroke began — needed by the shape tools' previews. */
  drawStartPoint: StampPoint | null;
}

export interface ToolHandler {
  onDown?: (e: ToolEvent, ctx: ToolContext) => void;
  onMove?: (e: ToolEvent, ctx: ToolContext) => void;
  onUp?: (e: ToolEvent, ctx: ToolContext) => void;
}

/* ── shared bodies ─────────────────────────────────────────────────────────── */

/**
 * The pencil/eraser press. One body, both devices, both tools — the difference
 * is only which shape generator and which colour are used.
 *
 * ⚠️ This is where Q44's fix lives. The legacy touch eraser press skipped the
 * bounds filter; `stampAt` always applies it, so the device cannot matter.
 */
function paintDown(
  e: ToolEvent,
  ctx: ToolContext,
  shape: BrushShapeFn,
  color: ToolColor | EraseColor,
): void {
  ctx.beginStroke();
  const cells = stampAt(e.coords, {
    gridWidth: ctx.gridWidth,
    gridHeight: ctx.gridHeight,
    brushSize: ctx.brushSize,
    shape,
    // Preserved from the legacy code: the eraser passed `currentColor` to the
    // shape generator, not the erase sentinel. It only fills a field the stamp
    // discards, so this is inert — but it is preserved rather than "tidied".
    shapeColor: ctx.currentColor,
  });
  if (cells.length > 0) {
    ctx.setPixels(cells.map((p) => ({ x: p.x, y: p.y, color })));
  }
  ctx.setLastStrokePixel(e.coords);
}

/** The pencil/eraser drag. Segment-bridged and de-duplicated. */
function paintMove(
  e: ToolEvent,
  ctx: ToolContext,
  shape: BrushShapeFn,
  color: ToolColor | EraseColor,
): void {
  const cells = stampSegment(ctx.lastStrokePixel, e.coords, ctx.line, {
    gridWidth: ctx.gridWidth,
    gridHeight: ctx.gridHeight,
    brushSize: ctx.brushSize,
    shape,
    shapeColor: ctx.currentColor,
  });
  if (cells.length > 0) {
    ctx.setPixels(cells.map((p) => ({ x: p.x, y: p.y, color })));
  }
  ctx.setLastStrokePixel(e.coords);
}

/* ── the table ─────────────────────────────────────────────────────────────── */

/**
 * Keyed by the `Tool` union. Declared with an explicit key list rather than
 * `Record<Tool, ToolHandler>` so `ui/` need not import the domain type; the
 * exhaustiveness check at the bottom of this file enforces the correspondence.
 */
export const toolHandlers = {
  pixel: {
    onDown: (e, ctx) => paintDown(e, ctx, ctx.pencilShape, ctx.currentColor),
    onMove: (e, ctx) => paintMove(e, ctx, ctx.pencilShape, ctx.currentColor),
  },

  eraser: {
    onDown: (e, ctx) => paintDown(e, ctx, ctx.eraserShapeFn, 0),
    onMove: (e, ctx) => paintMove(e, ctx, ctx.eraserShapeFn, 0),
  },

  "fill-square": {
    onDown: (e, ctx) => {
      ctx.beginStroke();
      ctx.setPixels(ctx.squarePixelsAt(e.coords));
    },
    onMove: (e, ctx) => {
      ctx.setPixels(ctx.squarePixelsAt(e.coords));
    },
  },

  "flood-fill": {
    // Fills commit immediately and do NOT open a drag stroke: the legacy code
    // called `endDrawing()` right after, and omitted `beginStroke()` entirely.
    onDown: (e, ctx) => {
      ctx.setPixels(ctx.floodFillAt(e.coords));
      ctx.endDrawing();
    },
  },

  "gaussian-fill": {
    onDown: (e, ctx) => {
      ctx.setPixels(ctx.gaussianFillAt(e.coords));
      ctx.endDrawing();
    },
  },

  // The three shape tools preview on drag and commit on release. Commit stays
  // in `useCanvasPointer`'s mouse-up path, which owns `previewPixels`.
  line: {
    onMove: (e, ctx) => {
      if (e.drawStartPoint) {
        ctx.setPreviewPixels(ctx.linePreview(e.drawStartPoint, e.coords));
      }
    },
  },

  rectangle: {
    onMove: (e, ctx) => {
      if (e.drawStartPoint) {
        ctx.setPreviewPixels(ctx.rectanglePreview(e.drawStartPoint, e.coords));
      }
    },
  },

  ellipse: {
    onMove: (e, ctx) => {
      if (e.drawStartPoint) {
        ctx.setPreviewPixels(ctx.ellipsePreview(e.drawStartPoint, e.coords));
      }
    },
  },

  // Handled ahead of the table because they consume the event before any
  // drawing state is touched. Present so the record stays exhaustive.
  move: {},
  selection: {},
  eyedropper: {},
  origin: {},
  // arbitrated by `CanvasContainer`, like `origin` — see docs/03-reflection-tool/07
  reflection: {},
  // arbitrated by `CanvasContainer`, like `reflection` — see docs/06-pose-tool/01
  pose: {},

  // A mode, not a pointer tool — see the module comment.
  "reference-trace": {},

  // Lighting-studio tools; they never reach this surface.
  "normal-pencil": {},
  "auto-normal": {},
  "height-map": {},

  // placeholder — docs/12-pixel-brush-tool task 05 fills it
  brush: {},
} satisfies Record<string, ToolHandler>;

/** The tool names this table serves. */
export type HandledTool = keyof typeof toolHandlers;

/**
 * Exhaustiveness gate. `Tool` is a pure string union in `types/domain.ts` — a
 * type-only import, no runtime dependency and no store — so this costs nothing
 * at runtime and fails `tsc` the moment the union and the table disagree in
 * either direction. Without it, `satisfies Record<string, ToolHandler>` would
 * accept a table that had silently lost a tool.
 */
type AssertSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : { missingFromTable: Exclude<B, A> }
  : { notATool: Exclude<A, B> };

/**
 * Exported (rather than a bare `const`) so it is a used binding — an unused
 * local would be deleted by the next person to run a lint autofix, taking the
 * gate with it. `true` only typechecks when the two unions match exactly.
 */
export const TOOLS_ARE_EXHAUSTIVE: AssertSame<HandledTool, DomainTool> = true;

export function getToolHandler(tool: string): ToolHandler | undefined {
  return (toolHandlers as Record<string, ToolHandler>)[tool];
}
