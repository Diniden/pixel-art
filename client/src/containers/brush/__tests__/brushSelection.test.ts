/**
 * `brushSelection` — the brush canvas's selection mask, its gesture, and the
 * masked writes end to end (Brush Studio task 21).
 *
 * The container needs a browser (task 19 mounts it); these tests are the
 * executable half of its verification. They pin the pure helpers, drive the
 * rect / move state machine through its host, and then run the REAL
 * `toolHandlers` and the REAL stores so masked painting, Delete and the
 * one-transaction move are proven without React.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
} from "../../../types";
import type { BrushCell, BrushDelta, BrushDocument } from "../../../types";
import { getToolHandler } from "../../../ui/canvas/tools/toolHandlers";
import { BrushPixelStore } from "../../../stores/domain/BrushPixelStore";
import { BrushStore } from "../../../stores/domain/BrushStore";
import type { BrushApiLike } from "../../../stores/domain/BrushStore";
import { SessionStore } from "../../../stores/session/SessionStore";
import { buildBrushToolContext } from "../brushToolContext";
import type { BrushToolContextArgs } from "../brushToolContext";
import {
  BRUSH_MOVE_SELECTION_LABEL,
  brushMaskWriteOptions,
  createBrushSelectionController,
  maskBounds,
  maskToCells,
  moveMaskWrites,
  packCell,
  rectBounds,
  rectMask,
  shiftMask,
} from "../brushSelection";
import type { BrushMoveWrites, BrushSelectionHost } from "../brushSelection";

const DELTA: BrushDelta = [100, -50, 255, 0];

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

const unpacked = (mask: ReadonlySet<number>, width: number) =>
  key(maskToCells(mask, width));

/* ── the pure helpers ─────────────────────────────────────────────────────── */

describe("rectMask", () => {
  it("packs the inclusive rectangle as y * width + x", () => {
    const mask = rectMask(1, 1, 2, 2, 4, 4);
    expect([...mask].sort((a, b) => a - b)).toEqual([
      packCell(1, 1, 4),
      packCell(2, 1, 4),
      packCell(1, 2, 4),
      packCell(2, 2, 4),
    ]);
  });

  it("accepts the corners in any order", () => {
    expect(unpacked(rectMask(2, 2, 1, 1, 4, 4), 4)).toEqual(
      unpacked(rectMask(1, 1, 2, 2, 4, 4), 4),
    );
  });

  it("a single cell selects exactly that cell", () => {
    expect(unpacked(rectMask(3, 0, 3, 0, 4, 4), 4)).toEqual(["3,0"]);
  });

  it("clamps an off-grid corner to the grid (an unbounded drag)", () => {
    expect(unpacked(rectMask(2, 2, 9, -3, 4, 4), 4)).toEqual([
      "2,0",
      "2,1",
      "2,2",
      "3,0",
      "3,1",
      "3,2",
    ]);
  });

  it("a rectangle entirely off the grid is empty", () => {
    expect(rectMask(5, 5, 9, 9, 4, 4).size).toBe(0);
    expect(rectMask(-3, -3, -1, -1, 4, 4).size).toBe(0);
  });
});

describe("rectBounds", () => {
  it("is the clamped inclusive box, or null when nothing is on the grid", () => {
    expect(rectBounds({ x: 3, y: 3 }, { x: 0, y: 1 }, 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 3,
    });
    expect(rectBounds({ x: -2, y: 5 }, { x: 1, y: 9 }, 4, 4)).toBeNull();
  });
});

describe("shiftMask", () => {
  it("slides every cell and DROPS what leaves the grid", () => {
    const mask = rectMask(2, 2, 3, 3, 4, 4);
    expect(unpacked(shiftMask(mask, 1, -1, 4, 4), 4)).toEqual(["3,1", "3,2"]);
  });

  it("a zero shift is the same set of cells in a new Set", () => {
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    const same = shiftMask(mask, 0, 0, 4, 4);
    expect(same).not.toBe(mask);
    expect(unpacked(same, 4)).toEqual(unpacked(mask, 4));
  });

  it("shifting everything off the grid leaves an empty mask", () => {
    expect(shiftMask(rectMask(0, 0, 3, 3, 4, 4), 4, 0, 4, 4).size).toBe(0);
  });
});

describe("maskToCells / maskBounds", () => {
  it("unpacks with the mask's width, not a guess", () => {
    const mask = new Set([packCell(4, 1, 5)]);
    expect(maskToCells(mask, 5)).toEqual([{ x: 4, y: 1 }]);
  });

  it("bounds is the box of the extreme cells; null when empty", () => {
    const mask = new Set([packCell(1, 3, 8), packCell(6, 0, 8)]);
    expect(maskBounds(mask, 8)).toEqual({ x: 1, y: 0, width: 6, height: 4 });
    expect(maskBounds(new Set(), 8)).toBeNull();
  });
});

describe("brushMaskWriteOptions", () => {
  it("wraps the mask with the BRUSH grid as maskSize; {} with no mask", () => {
    const mask = new Set([1]);
    expect(brushMaskWriteOptions(mask, 7, 9)).toEqual({
      mask,
      maskSize: { width: 7, height: 9 },
    });
    expect(brushMaskWriteOptions(null, 7, 9)).toEqual({});
  });
});

describe("moveMaskWrites", () => {
  const grid = (): BrushCell[][] => [
    [DELTA, 0, 0, 0],
    [0, [1, 2, 3, 4], 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  it("⭐ clears every source, then writes every in-bounds destination with a COPY", () => {
    const g = grid();
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    const { clears, writes: moved } = moveMaskWrites(g, mask, 1, 1, 4, 4);
    // 4 clears, then 4 writes (all destinations in bounds).
    expect(key(clears)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect(clears.every((w) => w.value === 0)).toBe(true);
    expect(key(moved)).toEqual(["1,1", "1,2", "2,1", "2,2"]);
    const at = (x: number, y: number) =>
      moved.find((w) => w.x === x && w.y === y)!.value;
    expect(at(1, 1)).toEqual(DELTA);
    expect(at(1, 1)).not.toBe(DELTA);
    expect(at(2, 2)).toEqual([1, 2, 3, 4]);
    expect(at(2, 2)).not.toBe(g[1][1]);
    expect(at(2, 1)).toBe(0);
  });

  it("destinations that leave the grid are dropped; their sources still clear", () => {
    const move = moveMaskWrites(
      grid(),
      rectMask(0, 0, 0, 0, 4, 4),
      -1,
      0,
      4,
      4,
    );
    expect(move).toEqual({ clears: [{ x: 0, y: 0, value: 0 }], writes: [] });
  });

  it("a zero vector writes nothing", () => {
    expect(
      moveMaskWrites(grid(), rectMask(0, 0, 3, 3, 4, 4), 0, 0, 4, 4),
    ).toEqual({ clears: [], writes: [] });
  });
});

/* ── the state machine ────────────────────────────────────────────────────── */

function makeHost(
  overrides: Partial<BrushSelectionHost> & {
    mask?: () => ReadonlySet<number> | null;
  } = {},
) {
  const host: BrushSelectionHost = {
    size: () => ({ width: 4, height: 4 }),
    mask: () => null,
    beginGesture: vi.fn(),
    previewRect: vi.fn(),
    previewMove: vi.fn(),
    commitRect: vi.fn(),
    commitMove: vi.fn(),
    ...overrides,
  };
  return host;
}

describe("createBrushSelectionController", () => {
  it("⭐ a press outside the mask opens a RECT drag: previews on move, commits the mask on release", () => {
    const host = makeHost();
    const c = createBrushSelectionController(host);
    expect(c.isActive).toBe(false);

    c.down({ x: 1, y: 1 });
    expect(c.isActive).toBe(true);
    expect(host.beginGesture).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(host.previewRect).toHaveBeenLastCalledWith({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });

    c.move({ x: 2, y: 3 });
    expect(host.previewRect).toHaveBeenLastCalledWith({
      x: 1,
      y: 1,
      width: 2,
      height: 3,
    });
    expect(host.commitRect).not.toHaveBeenCalled();

    c.end();
    expect(c.isActive).toBe(false);
    expect(host.previewRect).toHaveBeenLastCalledWith(null);
    expect(host.commitRect).toHaveBeenCalledTimes(1);
    const mask = (host.commitRect as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Set<number>;
    expect(unpacked(mask, 4)).toEqual([
      "1,1",
      "1,2",
      "1,3",
      "2,1",
      "2,2",
      "2,3",
    ]);
    expect(host.commitMove).not.toHaveBeenCalled();
  });

  it("a rect drag off the grid clamps; a repeated cell does not re-preview", () => {
    const host = makeHost();
    const c = createBrushSelectionController(host);
    c.down({ x: 3, y: 3 });
    c.move({ x: 3, y: 3 });
    expect(host.previewRect).toHaveBeenCalledTimes(1);
    c.move({ x: 9, y: 9 });
    expect(host.previewRect).toHaveBeenLastCalledWith({
      x: 3,
      y: 3,
      width: 1,
      height: 1,
    });
    c.end();
    const mask = (host.commitRect as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Set<number>;
    expect(unpacked(mask, 4)).toEqual(["3,3"]);
  });

  it("⭐ a press INSIDE the mask opens a MOVE: previews the vector, commits it ONCE on release", () => {
    const host = makeHost({ mask: () => rectMask(0, 0, 1, 1, 4, 4) });
    const c = createBrushSelectionController(host);
    c.down({ x: 1, y: 0 });
    expect(host.previewMove).toHaveBeenLastCalledWith({ dx: 0, dy: 0 });
    expect(host.previewRect).not.toHaveBeenCalled();

    c.move({ x: 2, y: 1 });
    expect(host.previewMove).toHaveBeenLastCalledWith({ dx: 1, dy: 1 });
    c.move({ x: 2, y: 1 });
    expect(host.previewMove).toHaveBeenCalledTimes(2);
    c.move({ x: 3, y: 0 });
    expect(host.previewMove).toHaveBeenLastCalledWith({ dx: 2, dy: 0 });
    expect(host.commitMove).not.toHaveBeenCalled();

    c.end();
    expect(host.previewMove).toHaveBeenLastCalledWith(null);
    // The TOTAL vector since the press — not a sum of steps, not per step.
    expect(host.commitMove).toHaveBeenCalledTimes(1);
    expect(host.commitMove).toHaveBeenCalledWith(2, 0);
    expect(host.commitRect).not.toHaveBeenCalled();
  });

  it("a move that returns to its origin commits nothing", () => {
    const host = makeHost({ mask: () => rectMask(0, 0, 1, 1, 4, 4) });
    const c = createBrushSelectionController(host);
    c.down({ x: 0, y: 0 });
    c.move({ x: 2, y: 2 });
    c.move({ x: 0, y: 0 });
    c.end();
    expect(host.commitMove).not.toHaveBeenCalled();
  });

  it("an off-grid sample (null) applies nothing and keeps the gesture open", () => {
    const host = makeHost();
    const c = createBrushSelectionController(host);
    c.down({ x: 0, y: 0 });
    c.move(null);
    expect(host.previewRect).toHaveBeenCalledTimes(1);
    expect(c.isActive).toBe(true);
  });

  it("end(false) ABANDONS: the preview clears, nothing commits", () => {
    const rectHost = makeHost();
    const r = createBrushSelectionController(rectHost);
    r.down({ x: 0, y: 0 });
    r.move({ x: 2, y: 2 });
    r.end(false);
    expect(rectHost.previewRect).toHaveBeenLastCalledWith(null);
    expect(rectHost.commitRect).not.toHaveBeenCalled();
    expect(r.isActive).toBe(false);

    const moveHost = makeHost({ mask: () => rectMask(0, 0, 1, 1, 4, 4) });
    const m = createBrushSelectionController(moveHost);
    m.down({ x: 0, y: 0 });
    m.move({ x: 2, y: 2 });
    m.end(false);
    expect(moveHost.previewMove).toHaveBeenLastCalledWith(null);
    expect(moveHost.commitMove).not.toHaveBeenCalled();
  });

  it("move / end without a down do nothing", () => {
    const host = makeHost();
    const c = createBrushSelectionController(host);
    c.move({ x: 1, y: 1 });
    c.end();
    expect(host.previewRect).not.toHaveBeenCalled();
    expect(host.commitRect).not.toHaveBeenCalled();
  });
});

/* ── end to end: the REAL toolHandlers and the REAL stores ────────────────── */

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

/** A handler event at a grid cell, as `useCanvasPointer` would build it. */
const event = (x: number, y: number) => ({
  coords: { x, y },
  device: "mouse" as const,
  drawStartPoint: null,
});

/** The container's `getToolContext`, wired to the rig with a live mask. */
function contextFor(
  rig: ReturnType<typeof makeRig>,
  mask: ReadonlySet<number> | null,
  overrides: Partial<BrushToolContextArgs> = {},
) {
  return buildBrushToolContext({
    gridWidth: 4,
    gridHeight: 4,
    brushSize: 1,
    pencilBrushSize: 1,
    pencilShape: "square",
    eraserShape: "square",
    shapeMode: "outline",
    borderRadius: 0,
    delta: DELTA,
    readGrid: () => rig.grid(),
    lastStrokePixel: null,
    setLastStrokePixel: () => {},
    beginStroke: () => rig.history.beginTransaction("Draw"),
    endDrawing: () => rig.history.endTransaction(),
    setCells: (cells, options) => rig.pixels.setCells(cells, options),
    setPreviewPixels: () => {},
    writeOptions: brushMaskWriteOptions(mask, 4, 4),
    ...overrides,
  });
}

describe("masked painting through the real toolHandlers and stores", () => {
  it("⭐ pencil OUTSIDE the selection paints nothing and records nothing", () => {
    const rig = makeRig();
    const ctx = contextFor(rig, rectMask(0, 0, 1, 1, 4, 4));
    getToolHandler("pixel")!.onDown!(event(3, 3), ctx);
    ctx.endDrawing();
    expect(rig.painted()).toEqual([]);
    expect(rig.history.entries).toHaveLength(0);
  });

  it("⭐ pencil INSIDE the selection paints; a stroke crossing the edge is clipped", () => {
    const rig = makeRig();
    const ctx = contextFor(rig, rectMask(0, 0, 1, 1, 4, 4));
    getToolHandler("pixel")!.onDown!(event(1, 1), ctx);
    // A move to (3,1) bridges through (2,1) — both outside the mask.
    getToolHandler("pixel")!.onMove!(event(3, 1), {
      ...ctx,
      lastStrokePixel: { x: 1, y: 1 },
    });
    ctx.endDrawing();
    expect(rig.painted()).toEqual(["1,1"]);
    expect(rig.grid()[1][1]).toEqual(DELTA);
    expect(rig.history.entries).toHaveLength(1);
  });

  it("the eraser and the flood fill respect the mask too", () => {
    const rig = makeRig();
    rig.pixels.setCells([
      { x: 0, y: 0, value: DELTA },
      { x: 3, y: 3, value: DELTA },
    ]);
    rig.history.clear();
    const ctx = contextFor(rig, rectMask(0, 0, 1, 1, 4, 4));

    getToolHandler("eraser")!.onDown!(event(3, 3), ctx);
    ctx.endDrawing();
    expect(rig.painted()).toEqual(["0,0", "3,3"]);

    // Flood the empty region: it spans the grid, only the mask's part lands.
    getToolHandler("flood-fill")!.onDown!(event(1, 1), ctx);
    expect(rig.painted()).toEqual(["0,0", "0,1", "1,0", "1,1", "3,3"]);
  });

  it("with no selection the options are {} and everything paints", () => {
    const rig = makeRig();
    const ctx = contextFor(rig, null);
    getToolHandler("pixel")!.onDown!(event(3, 3), ctx);
    ctx.endDrawing();
    expect(rig.painted()).toEqual(["3,3"]);
  });

  it("a mask from ANOTHER grid size disables masking rather than blocking the stroke", () => {
    const rig = makeRig();
    const ctx = contextFor(rig, null, {
      writeOptions: brushMaskWriteOptions(new Set([0]), 8, 8),
    });
    getToolHandler("pixel")!.onDown!(event(3, 3), ctx);
    ctx.endDrawing();
    expect(rig.painted()).toEqual(["3,3"]);
  });
});

describe("delete and move against the real stores", () => {
  function paintedRig() {
    const rig = makeRig();
    rig.pixels.setCells([
      { x: 0, y: 0, value: DELTA },
      { x: 1, y: 1, value: [1, 2, 3, 4] },
      { x: 3, y: 3, value: [9, 9, 9, 9] },
    ]);
    rig.history.clear();
    return rig;
  }

  it("⭐ Delete: clearCells(maskToCells) erases only the selected cells, one entry", () => {
    const rig = paintedRig();
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    rig.pixels.clearCells(maskToCells(mask, 4));
    expect(rig.painted()).toEqual(["3,3"]);
    expect(rig.history.entries).toHaveLength(1);
    rig.history.undo();
    expect(rig.painted()).toEqual(["0,0", "1,1", "3,3"]);
  });

  it("Delete on an already-empty selection records nothing", () => {
    const rig = paintedRig();
    rig.pixels.clearCells(maskToCells(rectMask(2, 0, 3, 1, 4, 4), 4));
    expect(rig.history.entries).toHaveLength(0);
  });

  it("⭐ move: the container's writeMove is ONE transaction that one undo reverts", () => {
    const rig = paintedRig();
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    // Exactly what `BrushCanvasContainer.writeMove` does.
    const writeMove = ({ clears, writes }: BrushMoveWrites) => {
      rig.history.beginTransaction(BRUSH_MOVE_SELECTION_LABEL);
      rig.pixels.setCells(clears);
      rig.pixels.setCells(writes);
      rig.history.endTransaction();
    };
    // Drive the state machine the way a drag inside the mask would.
    const host = makeHost({
      mask: () => mask,
      commitMove: (dx, dy) =>
        writeMove(moveMaskWrites(rig.grid(), mask, dx, dy, 4, 4)),
    });
    const c = createBrushSelectionController(host);
    c.down({ x: 0, y: 0 });
    c.move({ x: 1, y: 0 });
    c.move({ x: 2, y: 1 });
    expect(rig.painted()).toEqual(["0,0", "1,1", "3,3"]); // preview only
    c.end();

    // (0,0)→(2,1), (1,1)→(3,2); (3,3) is outside the mask and stays.
    expect(rig.painted()).toEqual(["2,1", "3,2", "3,3"]);
    expect(rig.grid()[1][2]).toEqual(DELTA);
    expect(rig.grid()[2][3]).toEqual([1, 2, 3, 4]);
    expect(rig.history.entries).toHaveLength(1);
    expect(rig.history.entries[0].label).toBe(BRUSH_MOVE_SELECTION_LABEL);

    rig.history.undo();
    expect(rig.painted()).toEqual(["0,0", "1,1", "3,3"]);
    rig.history.redo();
    expect(rig.painted()).toEqual(["2,1", "3,2", "3,3"]);
    // The mask follows the cells.
    expect(unpacked(shiftMask(mask, 2, 1, 4, 4), 4)).toEqual([
      "2,1",
      "2,2",
      "3,1",
      "3,2",
    ]);
  });

  it("a move onto the selection's own cells keeps the moved values (last write wins)", () => {
    const rig = paintedRig();
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    const { clears, writes } = moveMaskWrites(rig.grid(), mask, 1, 1, 4, 4);
    rig.history.beginTransaction(BRUSH_MOVE_SELECTION_LABEL);
    rig.pixels.setCells(clears);
    rig.pixels.setCells(writes);
    rig.history.endTransaction();
    // (0,0)→(1,1) overwrites the old (1,1), which itself moved to (2,2).
    expect(rig.painted()).toEqual(["1,1", "2,2", "3,3"]);
    expect(rig.grid()[1][1]).toEqual(DELTA);
    expect(rig.grid()[2][2]).toEqual([1, 2, 3, 4]);
    expect(rig.history.entries).toHaveLength(1);
  });

  it("cells moved off the grid are dropped and the vacated cells clear", () => {
    const rig = paintedRig();
    const mask = rectMask(0, 0, 1, 1, 4, 4);
    const { clears, writes } = moveMaskWrites(rig.grid(), mask, -1, 0, 4, 4);
    rig.pixels.setCells(clears);
    rig.pixels.setCells(writes);
    expect(rig.painted()).toEqual(["0,1", "3,3"]);
    expect(rig.grid()[1][0]).toEqual([1, 2, 3, 4]);
  });
});
