/**
 * `brushToolContext` — the colour→delta translation and the inert-tool table
 * (Brush Studio task 16).
 *
 * The container itself needs a browser (task 19 mounts it); these tests are
 * the executable half of its verification. They pin the three properties the
 * task names — writes map, erase → 0, the delta is COPIED not aliased — and
 * then run the REAL `toolHandlers` through `buildBrushToolContext` so the
 * pencil, eraser and fill-square are proven end to end without React.
 *
 * Follow-ups task 08 (D9): the writes are routed to TWO slots — the edge
 * sentinel / pencil / eraser / square / outline → `delta` (edge), the fill
 * sentinel / flood / interior → `fillDelta` — and a `"both"` shape splits per
 * pixel; the preview colours come from the same split as the commit.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
} from "../../../types";
import type { BrushCell, BrushDelta, BrushDocument } from "../../../types";
import { brushCellToRgba } from "../../../types";
import { getShapeOutlineKeys } from "../../../components/Canvas/drawingUtils";
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
  DUMMY_FILL_COLOR,
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
  isFillSentinel,
  mapWritesToBrushCells,
  paintShapePreview,
  pickBrushDelta,
  pointsToBrushCells,
  shapeCommitCells,
  shapePointSlot,
  shapePreviewColors,
  touchDistance,
} from "../brushToolContext";
import type {
  BrushGestureHost,
  BrushShapeSlots,
  BrushToolContextArgs,
} from "../brushToolContext";

/** The EDGE slot. */
const DELTA: BrushDelta = [100, -50, 255, 0];
/** The FILL slot — distinct in every channel so a mix-up cannot pass. */
const FILL: BrushDelta = [-100, 50, -255, 10];

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
    fillDelta: FILL,
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

describe("the two sentinels (D9)", () => {
  it("are distinct by identity AND by value; only the fill one has a = 254", () => {
    expect(DUMMY_FILL_COLOR).not.toBe(DUMMY_TOOL_COLOR);
    expect(DUMMY_FILL_COLOR).not.toEqual(DUMMY_TOOL_COLOR);
    expect(DUMMY_FILL_COLOR.a).toBe(254);
    expect(DUMMY_TOOL_COLOR.a).toBe(255);
  });

  it("isFillSentinel: by identity, or by the a byte of a copy; never erase or edge", () => {
    expect(isFillSentinel(DUMMY_FILL_COLOR)).toBe(true);
    expect(isFillSentinel({ ...DUMMY_FILL_COLOR })).toBe(true);
    expect(isFillSentinel({ r: 9, g: 9, b: 9, a: 254 })).toBe(true);
    expect(isFillSentinel(DUMMY_TOOL_COLOR)).toBe(false);
    expect(isFillSentinel({ ...DUMMY_TOOL_COLOR })).toBe(false);
    expect(isFillSentinel(0)).toBe(false);
  });
});

describe("mapWritesToBrushCells (D19 + D9)", () => {
  it("maps the edge sentinel to the edge delta and an erase write to 0", () => {
    const writes: ToolPixelWrite[] = [
      { x: 1, y: 2, color: DUMMY_TOOL_COLOR },
      { x: 3, y: 4, color: 0 },
    ];
    expect(mapWritesToBrushCells(writes, DELTA, FILL)).toEqual([
      { x: 1, y: 2, value: [100, -50, 255, 0] },
      { x: 3, y: 4, value: 0 },
    ]);
  });

  it("⭐ maps the fill sentinel to a COPY of the fill delta — never the same reference", () => {
    const writes: ToolPixelWrite[] = [
      { x: 1, y: 2, color: DUMMY_FILL_COLOR },
      { x: 2, y: 2, color: { ...DUMMY_FILL_COLOR } },
    ];
    const cells = mapWritesToBrushCells(writes, DELTA, FILL);
    expect(cells).toEqual([
      { x: 1, y: 2, value: [-100, 50, -255, 10] },
      { x: 2, y: 2, value: [-100, 50, -255, 10] },
    ]);
    expect(cells[0].value).not.toBe(FILL);
    expect(cells[1].value).not.toBe(FILL);
    expect(cells[0].value).not.toBe(cells[1].value);
    expect(cells[0].value).not.toEqual(DELTA);
  });

  it("routes by the sentinel, not by value: an arbitrary opaque colour is edge, a = 254 is fill", () => {
    const writes: ToolPixelWrite[] = [
      { x: 0, y: 0, color: { r: 255, g: 255, b: 255, a: 0 } },
      { x: 1, y: 0, color: { r: 7, g: 7, b: 7, a: 254 } },
    ];
    const cells = mapWritesToBrushCells(writes, DELTA, FILL);
    expect(cells[0].value).toEqual(DELTA);
    expect(cells[1].value).toEqual(FILL);
  });

  it("a mixed list keeps each write's slot in order", () => {
    const writes: ToolPixelWrite[] = [
      { x: 0, y: 0, color: DUMMY_TOOL_COLOR },
      { x: 1, y: 0, color: DUMMY_FILL_COLOR },
      { x: 2, y: 0, color: 0 },
      { x: 3, y: 0, color: DUMMY_TOOL_COLOR },
    ];
    expect(
      mapWritesToBrushCells(writes, DELTA, FILL).map((c) => c.value),
    ).toEqual([DELTA, FILL, 0, DELTA]);
  });

  it("⭐ every painted cell gets its OWN copy — never the source tuple", () => {
    const writes: ToolPixelWrite[] = [
      { x: 0, y: 0, color: DUMMY_TOOL_COLOR },
      { x: 1, y: 0, color: DUMMY_TOOL_COLOR },
    ];
    const cells = mapWritesToBrushCells(writes, DELTA, FILL);
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
      FILL,
    );
    source[2] = 99;
    expect(cells[0].value).toEqual([1, 2, 3, 4]);
  });

  it("a later edit of the source FILL delta does not reach filled cells", () => {
    const source: BrushDelta = [1, 2, 3, 4];
    const cells = mapWritesToBrushCells(
      [{ x: 0, y: 0, color: DUMMY_FILL_COLOR }],
      DELTA,
      source,
    );
    source[2] = 99;
    expect(cells[0].value).toEqual([1, 2, 3, 4]);
  });

  it("passes out-of-grid writes through — the store is the bounds filter", () => {
    const cells = mapWritesToBrushCells(
      [{ x: -1, y: 40, color: DUMMY_TOOL_COLOR }],
      DELTA,
      FILL,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ x: -1, y: 40 });
  });

  it("an empty write list is an empty cell list", () => {
    expect(mapWritesToBrushCells([], DELTA, FILL)).toEqual([]);
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

/* ── task 08: the shape tools' two slots ────────────────────────────────── */

const slots = (shapeMode: BrushShapeSlots["shapeMode"]): BrushShapeSlots => ({
  shapeMode,
  edgeDelta: DELTA,
  fillDelta: FILL,
  channelType: "rgb",
});

/** A 5×5 rectangle from (0,0) to (4,4): 16 outline cells, 9 interior. */
const RECT_START = { x: 0, y: 0 };
const RECT_END = { x: 4, y: 4 };
const rectPoints = () => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y <= 4; y++) {
    for (let x = 0; x <= 4; x++) out.push({ x, y });
  }
  return out;
};
const isRectOutline = (p: { x: number; y: number }) =>
  p.x === 0 || p.x === 4 || p.y === 0 || p.y === 4;

describe("shapePointSlot", () => {
  it("without an outline set: fill mode is all fill, anything else all edge", () => {
    const p = { x: 2, y: 2 };
    expect(shapePointSlot(p, "fill", null)).toBe("fill");
    expect(shapePointSlot(p, "outline", null)).toBe("edge");
    expect(shapePointSlot(p, "both", null)).toBe("edge");
  });

  it("with an outline set: members are edge, the rest fill", () => {
    const keys = new Set(["1,1"]);
    expect(shapePointSlot({ x: 1, y: 1 }, "both", keys)).toBe("edge");
    expect(shapePointSlot({ x: 2, y: 2 }, "both", keys)).toBe("fill");
  });
});

describe("shapeCommitCells", () => {
  it('"outline": every cell takes the edge delta, each its own copy', () => {
    const cells = shapeCommitCells(rectPoints(), null, slots("outline"));
    expect(cells).toHaveLength(25);
    expect(cells.every((c) => c.value !== 0)).toBe(true);
    for (const c of cells) {
      expect(c.value).toEqual(DELTA);
      expect(c.value).not.toBe(DELTA);
    }
    expect(new Set(cells.map((c) => c.value)).size).toBe(25);
  });

  it('"fill": every cell takes the fill delta', () => {
    const cells = shapeCommitCells(rectPoints(), null, slots("fill"));
    expect(cells).toHaveLength(25);
    for (const c of cells) {
      expect(c.value).toEqual(FILL);
      expect(c.value).not.toBe(FILL);
    }
  });

  it('⭐ "both" on a 5×5 rectangle: outline cells edge, interior fill', () => {
    const keys = getShapeOutlineKeys("rectangle", RECT_START, RECT_END);
    expect(keys.size).toBe(16);
    const cells = shapeCommitCells(rectPoints(), keys, slots("both"));
    expect(cells).toHaveLength(25);
    let edge = 0;
    let fill = 0;
    for (const c of cells) {
      if (isRectOutline(c)) {
        expect(c.value).toEqual(DELTA);
        edge++;
      } else {
        expect(c.value).toEqual(FILL);
        fill++;
      }
    }
    expect(edge).toBe(16);
    expect(fill).toBe(9);
    expect(new Set(cells.map((c) => c.value)).size).toBe(25);
  });

  it('"both" on a line: all edge — a line has no interior', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 4, y: 2 };
    const keys = getShapeOutlineKeys("line", start, end);
    const points = [...keys].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    });
    const cells = shapeCommitCells(points, keys, slots("both"));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.value !== 0)).toBe(true);
    for (const c of cells) expect(c.value).toEqual(DELTA);
  });

  it('"both" without a recorded outline set falls back to all edge', () => {
    const cells = shapeCommitCells(rectPoints(), null, slots("both"));
    for (const c of cells) expect(c.value).toEqual(DELTA);
  });

  it("an empty preview commits nothing", () => {
    expect(shapeCommitCells([], null, slots("both"))).toEqual([]);
  });
});

describe("shapePreviewColors", () => {
  const edgeRgba = brushCellToRgba(DELTA, "rgb");
  const fillRgba = brushCellToRgba(FILL, "rgb");

  it("colourises through brushCellToRgba with the layer's channel type", () => {
    expect(edgeRgba).not.toBeNull();
    expect(fillRgba).not.toBeNull();
    expect(edgeRgba).not.toEqual(fillRgba);
    const colors = shapePreviewColors(rectPoints(), null, slots("outline"));
    expect(colors).toHaveLength(25);
    for (const c of colors) expect(c).toEqual(edgeRgba);
    const heightmap = shapePreviewColors([{ x: 0, y: 0 }], null, {
      ...slots("outline"),
      channelType: "heightmap",
    });
    expect(heightmap[0]).toEqual(brushCellToRgba(DELTA, "heightmap"));
  });

  it('"fill" previews in the fill delta', () => {
    const colors = shapePreviewColors(rectPoints(), null, slots("fill"));
    for (const c of colors) expect(c).toEqual(fillRgba);
  });

  it('⭐ "both" previews per pixel exactly as shapeCommitCells will land it', () => {
    const keys = getShapeOutlineKeys("rectangle", RECT_START, RECT_END);
    const points = rectPoints();
    const colors = shapePreviewColors(points, keys, slots("both"));
    const cells = shapeCommitCells(points, keys, slots("both"));
    points.forEach((p, i) => {
      expect(colors[i]).toEqual(isRectOutline(p) ? edgeRgba : fillRgba);
      expect(colors[i]).toEqual(
        brushCellToRgba(cells[i].value as BrushDelta, "rgb"),
      );
    });
  });
});

describe("paintShapePreview", () => {
  /** A recording stub: each fillRect with the style in force at the time. */
  function stub() {
    const rects: {
      x: number;
      y: number;
      w: number;
      h: number;
      style: unknown;
    }[] = [];
    const ctx = {
      fillStyle: "" as string | CanvasGradient | CanvasPattern,
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, style: this.fillStyle });
      },
    };
    return { ctx, rects };
  }
  const css = (c: { r: number; g: number; b: number; a: number }) =>
    `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;

  it("paints one 1×1 rect per in-grid point in its slot's colour", () => {
    const { ctx, rects } = stub();
    const keys = getShapeOutlineKeys("rectangle", RECT_START, RECT_END);
    paintShapePreview(ctx, {
      points: rectPoints(),
      outlineKeys: keys,
      slots: slots("both"),
      width: 5,
      height: 5,
    });
    expect(rects).toHaveLength(25);
    const edge = css(brushCellToRgba(DELTA, "rgb")!);
    const fill = css(brushCellToRgba(FILL, "rgb")!);
    for (const r of rects) {
      expect([r.w, r.h]).toEqual([1, 1]);
      expect(r.style).toBe(isRectOutline(r) ? edge : fill);
    }
  });

  it("skips off-grid points and paints nothing for an empty preview", () => {
    const { ctx, rects } = stub();
    paintShapePreview(ctx, {
      points: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 3, y: 1 },
        { x: 1, y: 3 },
      ],
      outlineKeys: null,
      slots: slots("outline"),
      width: 3,
      height: 3,
    });
    expect(rects.map((r) => [r.x, r.y])).toEqual([[0, 0]]);
    const empty = stub();
    paintShapePreview(empty.ctx, {
      points: [],
      outlineKeys: null,
      slots: slots("outline"),
      width: 3,
      height: 3,
    });
    expect(empty.rects).toEqual([]);
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

  it("flood and gaussian fills are ONE fill over readGrid, carrying the FILL sentinel (D9)", () => {
    const grid: BrushCell[][] = [
      [0, 0],
      [0, DELTA],
    ];
    const ctx = buildBrushToolContext(
      makeArgs({ gridWidth: 2, gridHeight: 2, readGrid: () => grid }),
    );
    expect(ctx.floodFillAt).toBe(ctx.gaussianFillAt);
    const region = ctx.floodFillAt({ x: 0, y: 0 });
    expect(region).toHaveLength(3);
    expect(region.every((w) => w.color === DUMMY_FILL_COLOR)).toBe(true);
    expect(ctx.floodFillAt({ x: 1, y: 1 })).toEqual([
      { x: 1, y: 1, color: DUMMY_FILL_COLOR },
    ]);
    expect(
      buildBrushToolContext(makeArgs({ readGrid: () => null })).floodFillAt({
        x: 0,
        y: 0,
      }),
    ).toEqual([]);
  });

  it("squarePixelsAt uses the PENCIL size and the EDGE sentinel, never 0", () => {
    const ctx = buildBrushToolContext(
      makeArgs({ brushSize: 9, pencilBrushSize: 3 }),
    );
    const cells = ctx.squarePixelsAt({ x: 5, y: 5 });
    expect(cells).toHaveLength(9);
    expect(cells.every((c) => c.color === DUMMY_TOOL_COLOR)).toBe(true);
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

  it('⭐ every shape preview reports its outline set — the keys in "both", null otherwise', () => {
    const setShapeOutlineKeys = vi.fn();
    const both = buildBrushToolContext(
      makeArgs({ shapeMode: "both", setShapeOutlineKeys }),
    );
    const preview = both.rectanglePreview(RECT_START, RECT_END);
    expect(preview).toHaveLength(25);
    expect(setShapeOutlineKeys).toHaveBeenCalledTimes(1);
    const keys = setShapeOutlineKeys.mock.calls[0][0] as Set<string>;
    expect(keys).toEqual(
      getShapeOutlineKeys("rectangle", RECT_START, RECT_END, 0),
    );
    // The keys are exactly the "outline"-mode pixels of the same generator.
    expect([...keys].sort()).toEqual(
      key(
        buildBrushToolContext(
          makeArgs({ shapeMode: "outline" }),
        ).rectanglePreview(RECT_START, RECT_END),
      ),
    );

    both.ellipsePreview({ x: 4, y: 4 }, { x: 7, y: 6 });
    both.linePreview({ x: 0, y: 0 }, { x: 3, y: 1 });
    expect(setShapeOutlineKeys).toHaveBeenCalledTimes(3);
    expect(setShapeOutlineKeys.mock.calls[1][0]).toEqual(
      getShapeOutlineKeys("ellipse", { x: 4, y: 4 }, { x: 7, y: 6 }),
    );
    expect(setShapeOutlineKeys.mock.calls[2][0]).toEqual(
      getShapeOutlineKeys("line", { x: 0, y: 0 }, { x: 3, y: 1 }),
    );

    // Outside "both" the report is null — one slot covers the whole shape.
    const single = vi.fn();
    const outline = buildBrushToolContext(
      makeArgs({ shapeMode: "outline", setShapeOutlineKeys: single }),
    );
    outline.rectanglePreview(RECT_START, RECT_END);
    outline.linePreview(RECT_START, RECT_END);
    expect(single.mock.calls).toEqual([[null], [null]]);

    // Without the hook the previews still draw (the rigs in sibling tests).
    expect(
      buildBrushToolContext(makeArgs({ shapeMode: "both" })).rectanglePreview(
        RECT_START,
        RECT_END,
      ),
    ).toHaveLength(25);
  });

  it("the border radius reaches the outline set the same way it reaches the preview", () => {
    const setShapeOutlineKeys = vi.fn();
    const ctx = buildBrushToolContext(
      makeArgs({ shapeMode: "both", borderRadius: 2, setShapeOutlineKeys }),
    );
    ctx.rectanglePreview({ x: 0, y: 0 }, { x: 9, y: 9 });
    expect(setShapeOutlineKeys.mock.calls[0][0]).toEqual(
      getShapeOutlineKeys("rectangle", { x: 0, y: 0 }, { x: 9, y: 9 }, 2),
    );
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

  it("fill-square down opens a transaction and paints the pencil-sized square with the EDGE delta", () => {
    const args = makeArgs({ pencilBrushSize: 3 });
    const ctx = buildBrushToolContext(args);
    getToolHandler("fill-square")!.onDown!(event(4, 4), ctx);

    expect(args.beginStroke).toHaveBeenCalledTimes(1);
    const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { value: BrushDelta | 0 }[];
    expect(cells).toHaveLength(9);
    expect(cells.every((c) => c.value !== 0)).toBe(true);
    for (const c of cells) expect(c.value).toEqual(DELTA);
  });

  it("⭐ a flood click writes the FILL delta; a pencil stroke writes the EDGE delta (D9)", () => {
    const grid: BrushCell[][] = [
      [0, 0, 0],
      [0, DELTA, 0],
      [0, 0, 0],
    ];
    const args = makeArgs({
      gridWidth: 3,
      gridHeight: 3,
      readGrid: () => grid,
    });
    const ctx = buildBrushToolContext(args);
    const setCells = args.setCells as ReturnType<typeof vi.fn>;

    getToolHandler("flood-fill")!.onDown!(event(0, 0), ctx);
    expect(setCells).toHaveBeenCalledTimes(1);
    const flooded = setCells.mock.calls[0][0] as {
      x: number;
      y: number;
      value: BrushDelta | 0;
    }[];
    expect(flooded).toHaveLength(8);
    for (const c of flooded) {
      expect(c.value).toEqual(FILL);
      expect(c.value).not.toBe(FILL);
    }
    expect(new Set(flooded.map((c) => c.value)).size).toBe(8);

    getToolHandler("gaussian-fill")!.onDown!(event(2, 2), ctx);
    const gaussian = setCells.mock.calls[1][0] as { value: BrushDelta | 0 }[];
    expect(gaussian.every((c) => c.value !== 0)).toBe(true);
    for (const c of gaussian) expect(c.value).toEqual(FILL);

    getToolHandler("pixel")!.onDown!(event(1, 0), ctx);
    getToolHandler("pixel")!.onMove!(
      { ...event(2, 0), drawStartPoint: { x: 1, y: 0 } },
      { ...ctx, lastStrokePixel: { x: 1, y: 0 } },
    );
    const pencilDown = setCells.mock.calls[2][0] as { value: BrushDelta | 0 }[];
    const pencilMove = setCells.mock.calls[3][0] as { value: BrushDelta | 0 }[];
    expect(pencilDown).toEqual([{ x: 1, y: 0, value: DELTA }]);
    expect(pencilMove.length).toBeGreaterThan(0);
    for (const c of pencilMove) expect(c.value).toEqual(DELTA);

    // The line bridge and the eraser stay on the edge / erase paths.
    getToolHandler("eraser")!.onDown!(event(1, 1), ctx);
    const erased = setCells.mock.calls[4][0] as { value: BrushDelta | 0 }[];
    expect(erased.every((c) => c.value === 0)).toBe(true);
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

  it("⭐ eyedropper on a painted cell hands the host (the ACTIVE slot) a copy of the cell", () => {
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
    // The interior lands as the FILL delta (D9), not the edge.
    expect(rig.grid()[1][1]).toEqual(FILL);
    expect(rig.grid()[2][2]).toEqual(FILL);
    expect(rig.grid()[1][1]).not.toEqual(DELTA);
    expect(rig.grid()[0][0]).toEqual(ring);

    rig.history.undo();
    expect(rig.painted()).toHaveLength(12);
    expect(rig.grid()[1][1]).toBe(0);
    expect(rig.grid()[0][0]).toEqual(ring);
  });

  it("filling a region that already holds the FILL delta records nothing", () => {
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
