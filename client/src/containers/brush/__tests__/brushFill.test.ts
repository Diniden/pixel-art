/**
 * `brushFill` — the 4-connected flood fill over a delta grid (Brush Studio
 * task 20).
 *
 * Pins the cases the task names — a region inside a ring, the grid boundary,
 * an unpainted (`0`) region, a single cell, out-of-bounds → `[]` — and the
 * equality rule that makes a delta grid different from a colour grid: `0`
 * equals `0`, tuples equal slot for slot, and a `0` never equals a painted
 * all-zero delta. The last block runs the REAL `flood-fill` / `gaussian-fill`
 * handlers through `buildBrushToolContext` so the seam the container uses is
 * proven end to end without React.
 */
import { describe, expect, it, vi } from "vitest";
import type { BrushCell, BrushDelta } from "../../../types";
import { getToolHandler } from "../../../ui/canvas/tools/toolHandlers";
import { brushFloodFill, cellsMatch } from "../brushFill";
import {
  DUMMY_FILL_COLOR,
  DUMMY_TOOL_COLOR,
  buildBrushToolContext,
} from "../brushToolContext";
import type { BrushToolContextArgs } from "../brushToolContext";

const A: BrushDelta = [100, -50, 255, 0];
const B: BrushDelta = [1, 2, 3, 4];
/** The FILL slot (follow-ups D9) — distinct from the edge delta `A` so a
 *  fill is proven to copy the fill slot, not the edge one. */
const FILL: BrushDelta = [-20, 40, 60, 80];

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

/** Build a grid from rows of characters: `.` = 0, a letter = that delta. */
function gridFrom(
  rows: readonly string[],
  legend: Record<string, BrushDelta>,
): BrushCell[][] {
  return rows.map((row) =>
    [...row].map((ch) => (ch === "." ? 0 : ([...legend[ch]] as BrushDelta))),
  );
}

/** Every `(x, y)` of the grid whose character is `ch`. */
function cellsOf(rows: readonly string[], ch: string) {
  const out: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === ch) out.push({ x, y });
    });
  });
  return out;
}

describe("cellsMatch", () => {
  it("0 equals 0", () => {
    expect(cellsMatch(0, 0)).toBe(true);
  });

  it("tuples compare by their four numbers, not by identity", () => {
    expect(cellsMatch([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(cellsMatch([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
    expect(cellsMatch([1, 2, 3, 4], [0, 2, 3, 4])).toBe(false);
  });

  it("a painted all-zero delta is NOT an unpainted cell", () => {
    expect(cellsMatch(0, [0, 0, 0, 0])).toBe(false);
    expect(cellsMatch([0, 0, 0, 0], 0)).toBe(false);
  });
});

describe("brushFloodFill", () => {
  it("⭐ fills only the interior of a ring, never the ring or the outside", () => {
    const rows = ["......", ".AAAA.", ".A..A.", ".A..A.", ".AAAA.", "......"];
    const grid = gridFrom(rows, { A });
    const region = brushFloodFill(grid, 6, 6, 2, 2);
    expect(key(region)).toEqual(
      key([
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
      ]),
    );
  });

  it("clicking the ring fills the ring itself (a tuple region)", () => {
    const rows = ["AAAA", "A..A", "A..A", "AAAA"];
    const grid = gridFrom(rows, { A });
    expect(key(brushFloodFill(grid, 4, 4, 0, 0))).toEqual(
      key(cellsOf(rows, "A")),
    );
  });

  it("an unpainted (0) region fills up to the painted boundary", () => {
    const rows = ["..A.", "..A.", "AAA.", "...."];
    const grid = gridFrom(rows, { A });
    // Top-left pocket: (0,0) (1,0) (0,1) (1,1).
    expect(key(brushFloodFill(grid, 4, 4, 0, 0))).toEqual(
      key([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]),
    );
    // The other side of the wall is a separate 0 region.
    expect(brushFloodFill(grid, 4, 4, 3, 3)).toHaveLength(7);
  });

  it("is 4-connected: diagonal neighbours do not join", () => {
    const rows = ["A.", ".A"];
    const grid = gridFrom(rows, { A });
    expect(brushFloodFill(grid, 2, 2, 0, 0)).toEqual([{ x: 0, y: 0 }]);
  });

  it("a single isolated cell is a one-cell region, the seed first", () => {
    const rows = ["...", ".B.", "..."];
    const grid = gridFrom(rows, { B });
    expect(brushFloodFill(grid, 3, 3, 1, 1)).toEqual([{ x: 1, y: 1 }]);
  });

  it("a uniform grid fills every cell exactly once", () => {
    const grid = gridFrom(["....", "....", "...."], {});
    const region = brushFloodFill(grid, 4, 3, 3, 2);
    expect(region).toHaveLength(12);
    expect(new Set(key(region)).size).toBe(12);
    expect(region[0]).toEqual({ x: 3, y: 2 });
  });

  it("distinguishes tuples that differ in one slot", () => {
    const grid: BrushCell[][] = [
      [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [1, 2, 3, 5],
      ],
    ];
    expect(key(brushFloodFill(grid, 3, 1, 0, 0))).toEqual(
      key([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    );
  });

  it("matches by value, so distinct-but-equal tuples join one region", () => {
    const grid: BrushCell[][] = [
      [
        [7, 7, 7, 7],
        [7, 7, 7, 7],
      ],
    ];
    expect(grid[0][0]).not.toBe(grid[0][1]);
    expect(brushFloodFill(grid, 2, 1, 1, 0)).toHaveLength(2);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [4, 0],
    [0, 4],
    [99, 99],
  ])("out of bounds (%i, %i) → []", (x, y) => {
    const grid = gridFrom(["....", "....", "....", "...."], {});
    expect(brushFloodFill(grid, 4, 4, x, y)).toEqual([]);
  });

  it("a non-integer seed → []", () => {
    const grid = gridFrom(["..", ".."], {});
    expect(brushFloodFill(grid, 2, 2, 0.5, 1)).toEqual([]);
    expect(brushFloodFill(grid, 2, 2, Number.NaN, 1)).toEqual([]);
  });

  it("a missing cell (short row) is never a seed and never a match", () => {
    const grid: BrushCell[][] = [[0, 0], [0]];
    expect(brushFloodFill(grid, 2, 2, 1, 1)).toEqual([]);
    // From (0,0) the walk reaches (0,1) but not the absent (1,1).
    expect(key(brushFloodFill(grid, 2, 2, 0, 0))).toEqual(
      key([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    );
  });

  it("does not mutate the grid", () => {
    const rows = ["A.", ".."];
    const grid = gridFrom(rows, { A });
    const snapshot = JSON.stringify(grid);
    brushFloodFill(grid, 2, 2, 1, 1);
    expect(JSON.stringify(grid)).toBe(snapshot);
  });

  it("copes with a large uniform grid without recursion", () => {
    const size = 256;
    const grid: BrushCell[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0 as const),
    );
    expect(brushFloodFill(grid, size, size, 128, 128)).toHaveLength(
      size * size,
    );
  });
});

/* ── the seam the container uses: the REAL fill handlers ────────────────── */

function makeArgs(
  overrides: Partial<BrushToolContextArgs> = {},
): BrushToolContextArgs {
  return {
    gridWidth: 4,
    gridHeight: 4,
    brushSize: 1,
    pencilBrushSize: 1,
    pencilShape: "square",
    eraserShape: "circle",
    shapeMode: "outline",
    borderRadius: 0,
    delta: A,
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

describe("the fills through buildBrushToolContext", () => {
  const RING = ["BBBB", "B..B", "B..B", "BBBB"];
  const event = (x: number, y: number) => ({
    coords: { x, y },
    device: "mouse" as const,
    drawStartPoint: null,
  });

  it("floodFillAt returns the region carrying the FILL sentinel colour", () => {
    const ctx = buildBrushToolContext(
      makeArgs({ readGrid: () => gridFrom(RING, { B }) }),
    );
    const writes = ctx.floodFillAt({ x: 1, y: 1 });
    expect(key(writes)).toEqual(key(cellsOf(RING, ".")));
    expect(writes.every((w) => w.color === DUMMY_FILL_COLOR)).toBe(true);
    expect(writes.some((w) => w.color === DUMMY_TOOL_COLOR)).toBe(false);
  });

  it("gaussianFillAt is the same fill", () => {
    const ctx = buildBrushToolContext(
      makeArgs({ readGrid: () => gridFrom(RING, { B }) }),
    );
    expect(ctx.gaussianFillAt({ x: 1, y: 1 })).toEqual(
      ctx.floodFillAt({ x: 1, y: 1 }),
    );
  });

  it("with no selected layer the fill is empty", () => {
    const ctx = buildBrushToolContext(makeArgs({ readGrid: () => null }));
    expect(ctx.floodFillAt({ x: 1, y: 1 })).toEqual([]);
  });

  it("readGrid is consulted at click time, not at build time", () => {
    let grid = gridFrom(["..", ".."], {});
    const ctx = buildBrushToolContext(
      makeArgs({ gridWidth: 2, gridHeight: 2, readGrid: () => grid }),
    );
    expect(ctx.floodFillAt({ x: 0, y: 0 })).toHaveLength(4);
    grid = gridFrom(["A.", ".."], { A });
    expect(ctx.floodFillAt({ x: 0, y: 0 })).toHaveLength(1);
  });

  it.each(["flood-fill", "gaussian-fill"])(
    "⭐ a %s click is ONE setCells of FILL delta copies, no transaction, gesture closed",
    (tool) => {
      const args = makeArgs({ readGrid: () => gridFrom(RING, { B }) });
      const ctx = buildBrushToolContext(args);
      getToolHandler(tool)!.onDown!(event(2, 2), ctx);

      expect(args.beginStroke).not.toHaveBeenCalled();
      expect(args.setCells).toHaveBeenCalledTimes(1);
      const cells = (args.setCells as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { x: number; y: number; value: BrushDelta | 0 }[];
      expect(key(cells)).toEqual(key(cellsOf(RING, ".")));
      for (const cell of cells) {
        expect(cell.value).toEqual(FILL);
        expect(cell.value).not.toBe(FILL);
        expect(cell.value).not.toEqual(A);
      }
      expect(new Set(cells.map((c) => c.value)).size).toBe(cells.length);
      expect(args.endDrawing).toHaveBeenCalledTimes(1);
    },
  );

  it("the fill handlers define no onMove — a drag after a fill paints nothing", () => {
    expect(getToolHandler("flood-fill")!.onMove).toBeUndefined();
    expect(getToolHandler("gaussian-fill")!.onMove).toBeUndefined();
  });
});
