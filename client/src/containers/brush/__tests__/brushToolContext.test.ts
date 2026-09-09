/**
 * `brushToolContext` — the colour→delta translation and the inert-tool table
 * (Brush Studio task 16).
 *
 * The container itself needs a browser (task 19 mounts it); these tests are
 * the executable half of its verification. They pin the three properties the
 * task names — writes map, erase → 0, the delta is COPIED not aliased — and
 * then run the REAL `toolHandlers` through `buildBrushToolContext` so the
 * pencil, eraser and fill-square are proven end to end without React.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
} from "../../../types";
import type { BrushCell, BrushDelta, BrushDocument } from "../../../types";
import { getToolHandler } from "../../../ui/canvas/tools/toolHandlers";
import type { ToolPixelWrite } from "../../../ui/canvas/tools/toolHandlers";
import { BrushPixelStore } from "../../../stores/domain/BrushPixelStore";
import { BrushStore } from "../../../stores/domain/BrushStore";
import type { BrushApiLike } from "../../../stores/domain/BrushStore";
import { SessionStore } from "../../../stores/session/SessionStore";
import {
  BRUSH_GESTURE_TOOLS,
  BRUSH_INERT_TOOLS,
  BRUSH_MOVE_LABEL,
  BRUSH_STROKE_TOOLS,
  DUMMY_TOOL_COLOR,
  brushCoordGeometry,
  brushCursor,
  brushStrokeLabel,
  buildBrushToolContext,
  copyDelta,
  createBrushGestureController,
  isBrushGestureTool,
  isBrushInertTool,
  isBrushSelectionTool,
  isBrushShapeTool,
  mapWritesToBrushCells,
  pickBrushDelta,
  pointsToBrushCells,
  touchDistance,
} from "../brushToolContext";
import type {
  BrushGestureHost,
  BrushToolContextArgs,
} from "../brushToolContext";

const DELTA: BrushDelta = [100, -50, 255, 0];

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

/** A handler event at a grid cell, as `useCanvasPointer` would build it. */
const event = (x: number, y: number) => ({
  coords: { x, y },
  device: "mouse" as const,
  drawStartPoint: null,
});

function makeArgs(
  overrides: Partial<BrushToolContextArgs> = {},
): BrushToolContextArgs {
  return {
    gridWidth: 16,
    gridHeight: 16,
    brushSize: 1,
    pencilBrushSize: 1,
    pencilShape: "square",
    eraserShape: "circle",
    shapeMode: "outline",
    borderRadius: 0,
    delta: DELTA,
    readGrid: () => null,
    lastStrokePixel: null,
    setLastStrokePixel: vi.fn(),
    beginStroke: vi.fn(),
    endDrawing: vi.fn(),
    setCells: vi.fn(),
    setPreviewPixels: vi.fn(),
    ...overrides,
  };
}

describe("mapWritesToBrushCells (D19)", () => {
  it("maps a coloured write to the delta and an erase write to 0", () => {
    const writes: ToolPixelWrite[] = [
      { x: 1, y: 2, color: DUMMY_TOOL_COLOR },
      { x: 3, y: 4, color: 0 },
    ];
    expect(mapWritesToBrushCells(writes, DELTA)).toEqual([
      { x: 1, y: 2, value: [100, -50, 255, 0] },
      { x: 3, y: 4, value: 0 },
    ]);
  });

  it("ignores the colour's VALUE — any non-zero colour is a paint", () => {
    const writes: ToolPixelWrite[] = [
      { x: 0, y: 0, color: { r: 255, g: 255, b: 255, a: 0 } },
    ];
    expect(mapWritesToBrushCells(writes, DELTA)[0].value).toEqual(DELTA);
  });

  it("⭐ every painted cell gets its OWN copy — never the source tuple", () => {
    const writes: ToolPixelWrite[] = [
      { x: 0, y: 0, color: DUMMY_TOOL_COLOR },
      { x: 1, y: 0, color: DUMMY_TOOL_COLOR },
    ];
    const cells = mapWritesToBrushCells(writes, DELTA);
    const a = cells[0].value;
    const b = cells[1].value;
    expect(a).not.toBe(DELTA);
    expect(b).not.toBe(DELTA);
    expect(a).not.toBe(b);
    expect(a).toEqual(DELTA);
  });

  it("a later edit of the source delta does not reach painted cells", () => {
    const source: BrushDelta = [1, 2, 3, 4];
    const cells = mapWritesToBrushCells(
      [{ x: 0, y: 0, color: DUMMY_TOOL_COLOR }],
      source,
    );
    source[2] = 99;
    expect(cells[0].value).toEqual([1, 2, 3, 4]);
  });

  it("passes out-of-grid writes through — the store is the bounds filter", () => {
    const cells = mapWritesToBrushCells(
      [{ x: -1, y: 40, color: DUMMY_TOOL_COLOR }],
      DELTA,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ x: -1, y: 40 });
  });

  it("an empty write list is an empty cell list", () => {
    expect(mapWritesToBrushCells([], DELTA)).toEqual([]);
  });
});

describe("pointsToBrushCells (shape commit)", () => {
  it("paints every point with its own copy of the delta", () => {
    const cells = pointsToBrushCells(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      DELTA,
    );
    expect(cells).toEqual([
      { x: 0, y: 0, value: DELTA },
      { x: 1, y: 1, value: DELTA },
    ]);
    expect(cells[0].value).not.toBe(cells[1].value);
    expect(cells[0].value).not.toBe(DELTA);
  });
});

describe("brushCoordGeometry", () => {
  it("is a plain grid: no variant, object = grid, view = grid", () => {
    expect(brushCoordGeometry(16, 8)).toEqual({
      gridWidth: 16,
      gridHeight: 8,
      objWidth: 16,
      objHeight: 8,
      editingVariant: false,
      variantOffset: { x: 0, y: 0 },
      viewMinX: 0,
      viewMinY: 0,
      viewWidth: 16,
      viewHeight: 8,
    });
  });
});

describe("touchDistance", () => {
  it("is the Euclidean distance between the first two contacts", () => {
    const touches = [
      { clientX: 0, clientY: 0 },
      { clientX: 3, clientY: 4 },
      { clientX: 99, clientY: 99 },
    ];
    expect(touchDistance(touches)).toBe(5);
  });
});

describe("copyDelta", () => {
  it("returns an equal tuple that is not the argument", () => {
    const copy = copyDelta(DELTA);
    expect(copy).toEqual(DELTA);
    expect(copy).not.toBe(DELTA);
  });
});

describe("the tool tables", () => {
  it.each([
    "origin",
    "reference-trace",
    "reflection",
    "pose",
    "normal-pencil",
    "auto-normal",
    "height-map",
  ])("%s is inert", (tool) => {
    expect(isBrushInertTool(tool)).toBe(true);
  });

  it.each([
    "pixel",
    "eraser",
    "line",
    "rectangle",
    "ellipse",
    "fill-square",
    "flood-fill",
    "gaussian-fill",
  ])("%s goes through the handler table, not inert", (tool) => {
    expect(isBrushInertTool(tool)).toBe(false);
    expect(isBrushGestureTool(tool)).toBe(false);
    expect(BRUSH_STROKE_TOOLS.has(tool)).toBe(true);
  });

  it.each(["eyedropper", "move"])(
    "⭐ %s is a gesture tool (task 20): not inert, not in the handler table",
    (tool) => {
      expect(isBrushGestureTool(tool)).toBe(true);
      expect(isBrushInertTool(tool)).toBe(false);
      expect(BRUSH_STROKE_TOOLS.has(tool)).toBe(false);
      // The shared table has an EMPTY entry — the container must arbitrate.
      expect(getToolHandler(tool)).toEqual({});
    },
  );

  it("⭐ selection is its own kind (task 21): not inert, not gesture, not stroke", () => {
    expect(isBrushSelectionTool("selection")).toBe(true);
    expect(isBrushInertTool("selection")).toBe(false);
    expect(isBrushGestureTool("selection")).toBe(false);
    expect(BRUSH_STROKE_TOOLS.has("selection")).toBe(false);
    // The shared table has an EMPTY entry — the container must arbitrate.
    expect(getToolHandler("selection")).toEqual({});
    expect(isBrushSelectionTool("move")).toBe(false);
  });

  it("the four sets are pairwise disjoint and unknown tools are in none", () => {
    for (const tool of BRUSH_STROKE_TOOLS) {
      expect(BRUSH_INERT_TOOLS.has(tool)).toBe(false);
      expect(BRUSH_GESTURE_TOOLS.has(tool)).toBe(false);
      expect(isBrushSelectionTool(tool)).toBe(false);
    }
    for (const tool of BRUSH_GESTURE_TOOLS) {
      expect(BRUSH_INERT_TOOLS.has(tool)).toBe(false);
      expect(isBrushSelectionTool(tool)).toBe(false);
    }
    for (const tool of BRUSH_INERT_TOOLS) {
      expect(isBrushSelectionTool(tool)).toBe(false);
    }
    expect(isBrushInertTool("not-a-tool")).toBe(false);
    expect(isBrushGestureTool("not-a-tool")).toBe(false);
    expect(isBrushSelectionTool("not-a-tool")).toBe(false);
  });

  it("brushCursor: default when inert, move for move, crosshair otherwise", () => {
    expect(brushCursor("origin")).toBe("default");
    expect(brushCursor("selection")).toBe("crosshair");
    expect(brushCursor("move")).toBe("move");
    expect(brushCursor("pixel")).toBe("crosshair");
    expect(brushCursor("eyedropper")).toBe("crosshair");
    expect(brushCursor("flood-fill")).toBe("crosshair");
  });

  it("only line / rectangle / ellipse are shape tools", () => {
    expect(isBrushShapeTool("line")).toBe(true);
    expect(isBrushShapeTool("rectangle")).toBe(true);
    expect(isBrushShapeTool("ellipse")).toBe(true);
    expect(isBrushShapeTool("pixel")).toBe(false);
    expect(isBrushShapeTool("fill-square")).toBe(false);
  });

  it("every stroke tool has a label", () => {
    expect(brushStrokeLabel("pixel")).toBe("Draw");
    expect(brushStrokeLabel("eraser")).toBe("Erase");
    expect(brushStrokeLabel("line")).toBe("Draw line");
    expect(brushStrokeLabel("rectangle")).toBe("Draw rectangle");
    expect(brushStrokeLabel("ellipse")).toBe("Draw ellipse");
    expect(brushStrokeLabel("fill-square")).toBe("Fill square");
  });
});

describe("buildBrushToolContext", () => {
  it("hands the handlers the dummy colour and the grid extent", () => {
    const ctx = buildBrushToolContext(makeArgs());
    expect(ctx.currentColor).toBe(DUMMY_TOOL_COLOR);
    expect(ctx.gridWidth).toBe(16);
    expect(ctx.gridHeight).toBe(16);
  });

  it("setPixels translates through mapWritesToBrushCells", () => {
    const setCells = vi.fn();
    const ctx = buildBrushToolContext(makeArgs({ setCells }));
    ctx.setPixels([
      { x: 1, y: 1, color: DUMMY_TOOL_COLOR },
      { x: 2, y: 2, color: 0 },
    ]);
    expect(setCells).toHaveBeenCalledTimes(1);
    expect(setCells.mock.calls[0][0]).toEqual([
      { x: 1, y: 1, value: DELTA },
      { x: 2, y: 2, value: 0 },
    ]);
    // No selection: the options slot is simply absent.
    expect(setCells.mock.calls[0][1]).toBeUndefined();
  });

  it("⭐ setPixels passes writeOptions (the selection mask) through untouched (task 21)", () => {
    const setCells = vi.fn();
    const writeOptions = {
      mask: new Set([0, 1]),
      maskSize: { width: 16, height: 16 },
    };
    const ctx = buildBrushToolContext(makeArgs({ setCells, writeOptions }));
    ctx.setPixels([{ x: 1, y: 1, color: DUMMY_TOOL_COLOR }]);
    expect(setCells).toHaveBeenCalledTimes(1);
    expect(setCells.mock.calls[0][1]).toBe(writeOptions);
  });

  it("flood and gaussian fills are ONE fill over readGrid (details: brushFill.test)", () => {
    const grid: BrushCell[][] = [
      [0, 0],
      [0, DELTA],
    ];
    const ctx = buildBrushToolContext(
      makeArgs({ gridWidth: 2, gridHeight: 2, readGrid: () => grid }),
    );
    expect(ctx.floodFillAt).toBe(ctx.gaussianFillAt);
    expect(ctx.floodFillAt({ x: 0, y: 0 })).toHaveLength(3);
    expect(ctx.floodFillAt({ x: 1, y: 1 })).toEqual([
      { x: 1, y: 1, color: DUMMY_TOOL_COLOR },
    ]);
    expect(
      buildBrushToolContext(makeArgs({ readGrid: () => null })).floodFillAt({
        x: 0,
        y: 0,
      }),
    ).toEqual([]);
  });

  it("squarePixelsAt uses the PENCIL size and a paint colour, never 0", () => {
    const ctx = buildBrushToolContext(
      makeArgs({ brushSize: 9, pencilBrushSize: 3 }),
    );
    const cells = ctx.squarePixelsAt({ x: 5, y: 5 });
    expect(cells).toHaveLength(9);
    expect(cells.every((c) => c.color !== 0)).toBe(true);
    expect(key(cells)).toEqual(
      key([
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ]),
    );
  });

  it("linePreview is Bresenham between the two points", () => {
    const ctx = buildBrushToolContext(makeArgs());
    expect(ctx.linePreview({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("rectanglePreview honours shapeMode (outline vs fill)", () => {
    const outline = buildBrushToolContext(
      makeArgs({ shapeMode: "outline" }),
    ).rectanglePreview({ x: 0, y: 0 }, { x: 2, y: 2 });
    const fill = buildBrushToolContext(
      makeArgs({ shapeMode: "fill" }),
    ).rectanglePreview({ x: 0, y: 0 }, { x: 2, y: 2 });
    expect(outline).toHaveLength(8);
    expect(fill).toHaveLength(9);
  });

  it("the shape generators follow the pencil / eraser shape settings", () => {
    const ctx = buildBrushToolContext(
      makeArgs({ pencilShape: "circle", eraserShape: "square" }),
    );
    // A size-5 circle and a size-5 square differ: the circle drops the four
    // corners (at size 3 the corners sit inside the radius and both are 9).
    const circle = ctx.pencilShape({ x: 5, y: 5 }, 5, DUMMY_TOOL_COLOR);
    const square = ctx.eraserShapeFn({ x: 5, y: 5 }, 5, DUMMY_TOOL_COLOR);
    expect(square).toHaveLength(25);
    expect(circle.length).toBeLessThan(25);
  });

  it("stroke bookkeeping and preview pass straight through", () => {
    const args = makeArgs();
    const ctx = buildBrushToolContext(args);
    ctx.beginStroke();
    ctx.endDrawing();
    ctx.setLastStrokePixel({ x: 1, y: 1 });
    ctx.setPreviewPixels([{ x: 2, y: 3 }]);
    expect(args.beginStroke).toHaveBeenCalledTimes(1);
    expect(args.endDrawing).toHaveBeenCalledTimes(1);
    expect(args.setLastStrokePixel).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(args.setPreviewPixels).toHaveBeenCalledWith([{ x: 2, y: 3 }]);
  });
});

describe("end to end through the real toolHandlers", () => {
  it("⭐ pencil down opens ONE transaction and paints delta copies", () => {
    const args = makeArgs({ brushSize: 1 });
    const ctx = buildBrushToolContext(args);
    getToolHandler("pixel")!.onDown!(event(4, 4), ctx);

    expect(args.beginStroke).toHaveBeenCalledTimes(1);
    expect(args.setCells).toHaveBeenCalledTimes(1);
    const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { x: number; y: number; value: BrushDelta | 0 }[];
    expect(cells).toEqual([{ x: 4, y: 4, value: DELTA }]);
    expect(cells[0].value).not.toBe(DELTA);
    expect(args.setLastStrokePixel).toHaveBeenCalledWith({ x: 4, y: 4 });
  });

  it("⭐ eraser down writes 0 to every stamped cell", () => {
    const args = makeArgs({ brushSize: 3, eraserShape: "square" });
    const ctx = buildBrushToolContext(args);
    getToolHandler("eraser")!.onDown!(event(4, 4), ctx);

    const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { value: unknown }[];
    expect(cells).toHaveLength(9);
    expect(cells.every((c) => c.value === 0)).toBe(true);
  });

  it("pencil move bridges from the last stroke pixel with a copy per cell", () => {
    const args = makeArgs({ lastStrokePixel: { x: 0, y: 0 } });
    const ctx = buildBrushToolContext(args);
    getToolHandler("pixel")!.onMove!(event(2, 0), ctx);

    const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { x: number; y: number; value: BrushDelta }[];
    expect(key(cells)).toEqual(
      key([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    );
    const refs = new Set(cells.map((c) => c.value));
    expect(refs.size).toBe(cells.length);
    expect(refs.has(DELTA)).toBe(false);
  });

  it("fill-square down opens a transaction and paints the pencil-sized square", () => {
    const args = makeArgs({ pencilBrushSize: 3 });
    const ctx = buildBrushToolContext(args);
    getToolHandler("fill-square")!.onDown!(event(4, 4), ctx);

    expect(args.beginStroke).toHaveBeenCalledTimes(1);
    const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { value: BrushDelta | 0 }[];
    expect(cells).toHaveLength(9);
    expect(cells.every((c) => c.value !== 0)).toBe(true);
  });

  it("a shape tool previews on move and paints nothing", () => {
    const args = makeArgs();
    const ctx = buildBrushToolContext(args);
    getToolHandler("line")!.onMove!(
      {
        coords: { x: 3, y: 0 },
        device: "mouse",
        drawStartPoint: { x: 0, y: 0 },
      },
      ctx,
    );
    expect(args.setCells).not.toHaveBeenCalled();
    expect(args.setPreviewPixels).toHaveBeenCalledWith([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("the inert and gesture tools have no handler body and never touch the context", () => {
    const args = makeArgs();
    const ctx = buildBrushToolContext(args);
    for (const tool of [...BRUSH_INERT_TOOLS, ...BRUSH_GESTURE_TOOLS]) {
      const handler = getToolHandler(tool);
      handler?.onDown?.(event(1, 1), ctx);
      handler?.onMove?.(event(1, 1), ctx);
    }
    expect(args.beginStroke).not.toHaveBeenCalled();
    expect(args.setCells).not.toHaveBeenCalled();
  });
});

/* ── task 20: the gesture controller ────────────────────────────────────── */

describe("pickBrushDelta", () => {
  it("a painted cell yields a COPY of its tuple", () => {
    const cell: BrushCell = [1, 2, 3, 4];
    const picked = pickBrushDelta(cell);
    expect(picked).toEqual([1, 2, 3, 4]);
    expect(picked).not.toBe(cell);
  });

  it("an unpainted cell or no cell yields null", () => {
    expect(pickBrushDelta(0)).toBeNull();
    expect(pickBrushDelta(undefined)).toBeNull();
  });
});

function makeHost(overrides: Partial<BrushGestureHost> = {}): BrushGestureHost {
  return {
    cellAt: vi.fn(() => undefined),
    setDelta: vi.fn(),
    beginMove: vi.fn(),
    moveBy: vi.fn(),
    ...overrides,
  };
}

describe("createBrushGestureController", () => {
  it("a non-gesture tool is not consumed and touches nothing", () => {
    const host = makeHost();
    const g = createBrushGestureController(host);
    expect(g.down("pixel", { x: 1, y: 1 })).toBe(false);
    expect(g.down("selection", { x: 1, y: 1 })).toBe(false);
    expect(g.isMoving).toBe(false);
    expect(host.beginMove).not.toHaveBeenCalled();
    expect(host.setDelta).not.toHaveBeenCalled();
  });

  it("⭐ eyedropper on a painted cell sets the delta to a copy of the cell", () => {
    const cell: BrushCell = [10, -20, 30, 40];
    const host = makeHost({ cellAt: vi.fn(() => cell) });
    const g = createBrushGestureController(host);
    expect(g.down("eyedropper", { x: 3, y: 2 })).toBe(true);
    expect(host.cellAt).toHaveBeenCalledWith(3, 2);
    expect(host.setDelta).toHaveBeenCalledTimes(1);
    const arg = (host.setDelta as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toEqual(cell);
    expect(arg).not.toBe(cell);
    // A pick is one-shot: no drag opens.
    expect(g.isMoving).toBe(false);
    expect(host.beginMove).not.toHaveBeenCalled();
  });

  it("eyedropper on an unpainted or missing cell is consumed but a no-op", () => {
    const host = makeHost({ cellAt: vi.fn(() => 0 as const) });
    const g = createBrushGestureController(host);
    expect(g.down("eyedropper", { x: 0, y: 0 })).toBe(true);
    expect(host.setDelta).not.toHaveBeenCalled();
    expect(
      createBrushGestureController(makeHost()).down("eyedropper", {
        x: 0,
        y: 0,
      }),
    ).toBe(true);
  });

  it("⭐ move: down anchors and opens; each move applies the vector since the LAST APPLIED step", () => {
    const host = makeHost();
    const g = createBrushGestureController(host);
    expect(g.down("move", { x: 2, y: 2 })).toBe(true);
    expect(host.beginMove).toHaveBeenCalledWith({ x: 2, y: 2 });
    expect(g.isMoving).toBe(true);

    g.move({ x: 3, y: 2 }); // +1, 0
    g.move({ x: 3, y: 2 }); // same cell: nothing
    g.move({ x: 5, y: 4 }); // +2, +2 since the last applied step
    g.move({ x: 4, y: 4 }); // -1, 0
    expect((host.moveBy as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [1, 0],
      [2, 2],
      [-1, 0],
    ]);
  });

  it("move: an off-grid sample (null) applies nothing and keeps the anchor", () => {
    const host = makeHost();
    const g = createBrushGestureController(host);
    g.down("move", { x: 0, y: 0 });
    g.move(null);
    g.move({ x: 2, y: 0 });
    expect((host.moveBy as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [2, 0],
    ]);
  });

  it("move: the anchor is a copy, so a mutated coords object cannot drift it", () => {
    const host = makeHost();
    const g = createBrushGestureController(host);
    const p = { x: 0, y: 0 };
    g.down("move", p);
    p.x = 5;
    g.move({ x: 1, y: 0 });
    expect(host.moveBy).toHaveBeenCalledWith(1, 0);
  });

  it("end forgets the anchor; a move afterwards applies nothing", () => {
    const host = makeHost();
    const g = createBrushGestureController(host);
    g.down("move", { x: 0, y: 0 });
    g.end();
    expect(g.isMoving).toBe(false);
    g.move({ x: 4, y: 4 });
    expect(host.moveBy).not.toHaveBeenCalled();
    // end is idempotent and safe with nothing open.
    g.end();
  });

  it("move without a down applies nothing", () => {
    const host = makeHost();
    createBrushGestureController(host).move({ x: 1, y: 1 });
    expect(host.moveBy).not.toHaveBeenCalled();
  });
});

/* ── task 20 end to end: the REAL stores ─────────────────────────────────── */

/** Never called: the document is installed directly. */
const unreachableApi: BrushApiLike = {
  list: () => Promise.reject(new Error("api.list must not be called")),
  get: () => Promise.reject(new Error("api.get must not be called")),
  save: () => Promise.reject(new Error("api.save must not be called")),
  create: () => Promise.reject(new Error("api.create must not be called")),
  rename: () => Promise.reject(new Error("api.rename must not be called")),
  remove: () => Promise.reject(new Error("api.remove must not be called")),
};

function makeRig(width = 4, height = 4) {
  const doc: BrushDocument = {
    ...createBrushDocument(width, height),
    frames: [
      createBrushFrame("frame-1", "Frame 1", [
        createBrushLayer("layer-1", "Layer 1", width, height),
      ]),
    ],
  };
  const brush = new BrushStore({
    session: new SessionStore(),
    api: unreachableApi,
  });
  brush.installDocument(doc);
  const pixels = new BrushPixelStore({
    brush,
    source: { selectedFrameId: "frame-1", selectedLayerId: "layer-1" },
  });
  const grid = () => brush.document!.frames[0].layers[0].pixels;
  const painted = () => {
    const out: string[] = [];
    grid().forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell !== 0) out.push(`${x},${y}`);
      }),
    );
    return out.sort();
  };
  return { brush, pixels, history: brush.history, grid, painted };
}

describe("flood-fill against the real stores", () => {
  it("⭐ a ring's interior fills as ONE history entry that one undo reverts", () => {
    const rig = makeRig(4, 4);
    const ring: BrushDelta = [0, 0, 100, 0];
    const ringCells: { x: number; y: number; value: BrushCell }[] = [];
    for (let i = 0; i < 4; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, 3],
        [0, i],
        [3, i],
      ]) {
        ringCells.push({ x, y, value: ring });
      }
    }
    rig.pixels.setCells(ringCells);
    expect(rig.history.entries).toHaveLength(1);

    const ctx = buildBrushToolContext(
      makeArgs({
        gridWidth: 4,
        gridHeight: 4,
        readGrid: () => rig.pixels.resolveTarget()?.layer.pixels ?? null,
        setCells: (cells) => rig.pixels.setCells(cells),
        beginStroke: () => rig.history.beginTransaction("Draw"),
        endDrawing: () => rig.history.endTransaction(),
      }),
    );
    getToolHandler("flood-fill")!.onDown!(event(1, 1), ctx);

    expect(rig.history.entries).toHaveLength(2);
    expect(rig.painted()).toHaveLength(16);
    expect(rig.grid()[1][1]).toEqual(DELTA);
    expect(rig.grid()[2][2]).toEqual(DELTA);
    expect(rig.grid()[0][0]).toEqual(ring);

    rig.history.undo();
    expect(rig.painted()).toHaveLength(12);
    expect(rig.grid()[1][1]).toBe(0);
    expect(rig.grid()[0][0]).toEqual(ring);
  });

  it("filling a region that already holds the delta records nothing", () => {
    const rig = makeRig(2, 2);
    const ctx = buildBrushToolContext(
      makeArgs({
        gridWidth: 2,
        gridHeight: 2,
        readGrid: () => rig.pixels.resolveTarget()?.layer.pixels ?? null,
        setCells: (cells) => rig.pixels.setCells(cells),
        endDrawing: () => rig.history.endTransaction(),
      }),
    );
    getToolHandler("gaussian-fill")!.onDown!(event(0, 0), ctx);
    expect(rig.history.entries).toHaveLength(1);
    getToolHandler("gaussian-fill")!.onDown!(event(1, 1), ctx);
    expect(rig.history.entries).toHaveLength(1);
  });
});

describe("move against the real stores", () => {
  function moveRig() {
    const rig = makeRig(4, 4);
    rig.pixels.setCells([
      { x: 0, y: 0, value: DELTA },
      { x: 3, y: 3, value: [1, 1, 1, 1] },
    ]);
    rig.history.clear();
    const host = makeHost({
      cellAt: (x, y) => rig.pixels.cellAt(x, y),
      beginMove: () => rig.history.beginTransaction(BRUSH_MOVE_LABEL),
      moveBy: (dx, dy) => rig.pixels.moveLayerCells(dx, dy),
    });
    const g = createBrushGestureController(host);
    /** The container's release path: forget the anchor, close the transaction. */
    const release = () => {
      g.end();
      rig.history.endTransaction();
    };
    return { ...rig, g, host, release };
  }

  it("⭐ a multi-step drag is ONE undo entry; cells leaving the grid are dropped", () => {
    const rig = moveRig();
    rig.g.down("move", { x: 1, y: 1 });
    rig.g.move({ x: 2, y: 1 });
    rig.g.move({ x: 3, y: 2 });
    rig.g.move({ x: 4, y: 2 }); // (3,3) is now at (6,4): gone
    expect(rig.history.entries).toHaveLength(0); // still inside the transaction
    rig.release();

    expect(rig.history.entries).toHaveLength(1);
    expect(rig.history.entries[0].label).toBe(BRUSH_MOVE_LABEL);
    expect(rig.painted()).toEqual(["3,1"]);
    expect(rig.grid()[1][3]).toEqual(DELTA);

    rig.history.undo();
    expect(rig.painted()).toEqual(["0,0", "3,3"]);
    rig.history.redo();
    expect(rig.painted()).toEqual(["3,1"]);
  });

  it("dragging out and back does not bring dropped cells back", () => {
    const rig = moveRig();
    rig.g.down("move", { x: 0, y: 0 });
    rig.g.move({ x: 3, y: 0 });
    rig.g.move({ x: 0, y: 0 });
    rig.release();
    expect(rig.painted()).toEqual(["0,0"]);
    expect(rig.history.entries).toHaveLength(1);
  });

  it("a round trip puts an in-bounds cell back where it began; the layer follows the pointer LIVE", () => {
    const rig = makeRig(4, 4);
    rig.pixels.setCells([{ x: 1, y: 1, value: DELTA }]);
    rig.history.clear();
    const g = createBrushGestureController(
      makeHost({
        beginMove: () => rig.history.beginTransaction(BRUSH_MOVE_LABEL),
        moveBy: (dx, dy) => rig.pixels.moveLayerCells(dx, dy),
      }),
    );
    g.down("move", { x: 1, y: 1 });
    g.move({ x: 2, y: 1 });
    expect(rig.painted()).toEqual(["2,1"]); // applied on the step, not on release
    g.move({ x: 1, y: 1 });
    g.end();
    rig.history.endTransaction();

    expect(rig.painted()).toEqual(["1,1"]);
    expect(rig.grid()[1][1]).toEqual(DELTA);
    // Two opposite steps, both recorded, collapse to ONE entry — the grid is
    // back where it began but the entry exists (the pixel canvas's history
    // behaves the same way for a round trip); undoing it changes nothing.
    expect(rig.history.entries).toHaveLength(1);
    rig.history.undo();
    expect(rig.painted()).toEqual(["1,1"]);
  });

  it("a click without a drag records nothing", () => {
    const rig = moveRig();
    rig.g.down("move", { x: 1, y: 1 });
    rig.release();
    expect(rig.history.entries).toHaveLength(0);
  });

  it("the eyedropper reads the LIVE cell through the same host", () => {
    const rig = moveRig();
    rig.g.down("eyedropper", { x: 0, y: 0 });
    expect(rig.host.setDelta).toHaveBeenCalledWith(DELTA);
    rig.g.down("eyedropper", { x: 1, y: 0 });
    expect(rig.host.setDelta).toHaveBeenCalledTimes(1);
  });
});
