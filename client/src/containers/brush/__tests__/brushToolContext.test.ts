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
import type { BrushDelta } from "../../../types";
import { getToolHandler } from "../../../ui/canvas/tools/toolHandlers";
import type { ToolPixelWrite } from "../../../ui/canvas/tools/toolHandlers";
import {
  BRUSH_INERT_TOOLS,
  BRUSH_STROKE_TOOLS,
  DUMMY_TOOL_COLOR,
  brushCoordGeometry,
  brushStrokeLabel,
  buildBrushToolContext,
  copyDelta,
  isBrushInertTool,
  isBrushShapeTool,
  mapWritesToBrushCells,
  pointsToBrushCells,
  touchDistance,
} from "../brushToolContext";
import type { BrushToolContextArgs } from "../brushToolContext";

const DELTA: BrushDelta = [100, -50, 255, 0];

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

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

describe("the inert-tool table", () => {
  it.each([
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
  ])("%s is inert", (tool) => {
    expect(isBrushInertTool(tool)).toBe(true);
  });

  it.each(["pixel", "eraser", "line", "rectangle", "ellipse", "fill-square"])(
    "%s is a stroke tool, not inert",
    (tool) => {
      expect(isBrushInertTool(tool)).toBe(false);
      expect(BRUSH_STROKE_TOOLS.has(tool)).toBe(true);
    },
  );

  it("the two sets are disjoint and unknown tools are not inert", () => {
    for (const tool of BRUSH_STROKE_TOOLS) {
      expect(BRUSH_INERT_TOOLS.has(tool)).toBe(false);
    }
    expect(isBrushInertTool("not-a-tool")).toBe(false);
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
  });

  it("flood and gaussian fills are inert (empty) until task 20", () => {
    const ctx = buildBrushToolContext(makeArgs());
    expect(ctx.floodFillAt({ x: 3, y: 3 })).toEqual([]);
    expect(ctx.gaussianFillAt({ x: 3, y: 3 })).toEqual([]);
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
  const event = (x: number, y: number) => ({
    coords: { x, y },
    device: "mouse" as const,
    drawStartPoint: null,
  });

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

  it("the inert tools have no handler body and never touch the context", () => {
    const args = makeArgs();
    const ctx = buildBrushToolContext(args);
    for (const tool of BRUSH_INERT_TOOLS) {
      const handler = getToolHandler(tool);
      // `flood-fill` / `gaussian-fill` DO have an `onDown`; the container
      // never dispatches them (`isBrushInertTool`), and even if it did the
      // context's empty fill makes them a no-op write.
      handler?.onDown?.(event(1, 1), ctx);
      handler?.onMove?.(event(1, 1), ctx);
    }
    expect(args.beginStroke).not.toHaveBeenCalled();
    const writes = (args.setCells as ReturnType<typeof vi.fn>).mock.calls;
    expect(writes.every((call) => (call[0] as unknown[]).length === 0)).toBe(
      true,
    );
  });
});
