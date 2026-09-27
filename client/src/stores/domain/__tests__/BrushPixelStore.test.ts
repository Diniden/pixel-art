/**
 * BrushPixelStore unit suite (Brush Studio task 09; multi-brush task 10).
 *
 * Drives the store over a real `BrushStore` (bare `SessionStore`, an API stub
 * that is never reached — documents are installed directly) and a plain
 * mutable selection object standing in for `BrushUIStore`. No
 * ApplicationStore, no MSW, no network.
 *
 * Every rig is a TWO-brush project (brush-2 document) whose second brush is
 * a different size, so a write path that reads a document-level size,
 * resolves brush 0 instead of the selected id, or forgets to spine-copy
 * `doc.brushes` (multi-brush R3) fails here rather than in the studio.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableArray, isObservableObject } from "mobx";

import { BrushPixelStore } from "@/stores/domain/BrushPixelStore";
import { BrushStore, type BrushApiLike } from "@/stores/domain/BrushStore";
import { isBrushPixelCommand } from "@/stores/history/brushCommands";
import { SessionStore } from "@/stores/session/SessionStore";
import {
  BRUSH_DOCUMENT_VERSION,
  createBrushFrame,
  createBrushLayer,
  type Brush,
  type BrushCell,
  type BrushDelta,
  type BrushDocument,
} from "@/types";

/* ── the rig ─────────────────────────────────────────────────────────────── */

/** Never called: every test installs its document directly. */
const unreachableApi: BrushApiLike = {
  list: () => Promise.reject(new Error("api.list must not be called")),
  get: () => Promise.reject(new Error("api.get must not be called")),
  save: () => Promise.reject(new Error("api.save must not be called")),
  create: () => Promise.reject(new Error("api.create must not be called")),
  rename: () => Promise.reject(new Error("api.rename must not be called")),
  remove: () => Promise.reject(new Error("api.remove must not be called")),
};

/** One brush: `width × height`, `frameCount` frames, each with layers `layer-1..N`. */
function mkBrush(
  id: string,
  name: string,
  width: number,
  height: number,
  frameCount: number,
  layerCount: number,
): Brush {
  const frames = Array.from({ length: frameCount }, (_, fi) =>
    createBrushFrame(
      `frame-${fi + 1}`,
      `Frame ${fi + 1}`,
      Array.from({ length: layerCount }, (_, li) =>
        createBrushLayer(`layer-${li + 1}`, `Layer ${li + 1}`, width, height),
      ),
    ),
  );
  return { id, name, width, height, frames, appliedGroups: [] };
}

/**
 * A two-brush project. Brush 1 (`brush-1`) is `width × height`; brush 2
 * (`brush-2`) is `second` — 4×4 by default, a DIFFERENT size from the 8×8
 * default. Both have `frameCount` frames of `layerCount` layers with the
 * SAME frame / layer ids (`frame-1`, `layer-1`, …): ids are unique only
 * within a brush, which is exactly why the brush id must resolve first.
 */
function mkDocument(
  width = 8,
  height = 8,
  frameCount = 1,
  layerCount = 1,
  second: { width: number; height: number } = { width: 4, height: 4 },
): BrushDocument {
  return {
    version: BRUSH_DOCUMENT_VERSION,
    brushes: [
      mkBrush("brush-1", "Brush 1", width, height, frameCount, layerCount),
      mkBrush(
        "brush-2",
        "Brush 2",
        second.width,
        second.height,
        frameCount,
        layerCount,
      ),
    ],
  };
}

function makeRig(doc: BrushDocument = mkDocument()) {
  const brush = new BrushStore({
    session: new SessionStore(),
    api: unreachableApi,
  });
  brush.installDocument(doc);
  const first = doc.brushes[0];
  const source = {
    selectedBrushId: first.id as string | null,
    selectedFrameId: first.frames[0].id as string | null,
    selectedLayerId: first.frames[0].layers[0].id as string | null,
  };
  const pixels = new BrushPixelStore({ brush, source });
  return { brush, pixels, source, history: brush.history };
}

const RED: BrushDelta = [100, 0, 0, 0];
const GREEN: BrushDelta = [0, 100, 0, 0];
const BLUE: BrushDelta = [0, 0, 100, 0];

/** The live grid of `brushIndex` → `frame` → `layer` (brush 0 by default). */
function gridOf(
  brush: BrushStore,
  frame = 0,
  layer = 0,
  brushIndex = 0,
): BrushCell[][] {
  return brush.document!.brushes[brushIndex].frames[frame].layers[layer].pixels;
}

/* ── resolution ──────────────────────────────────────────────────────────── */

describe("resolveTarget / cellAt", () => {
  it("resolves the selected brush, frame and layer by id with their indices", () => {
    const { pixels, source } = makeRig(mkDocument(4, 3, 2, 2));
    source.selectedFrameId = "frame-2";
    source.selectedLayerId = "layer-2";
    const resolved = pixels.resolveTarget();
    expect(resolved).not.toBeNull();
    expect(resolved!.target).toEqual({
      brushId: "brush-1",
      frameId: "frame-2",
      layerId: "layer-2",
    });
    expect(resolved!.brushIndex).toBe(0);
    expect(resolved!.frameIndex).toBe(1);
    expect(resolved!.layerIndex).toBe(1);
    expect(resolved!.layer.id).toBe("layer-2");
    expect(resolved!.width).toBe(4);
    expect(resolved!.height).toBe(3);
  });

  it("width/height come from the SELECTED brush, not the first one", () => {
    const { brush, pixels, source } = makeRig(
      mkDocument(8, 8, 1, 1, { width: 5, height: 3 }),
    );
    source.selectedBrushId = "brush-2";
    const resolved = pixels.resolveTarget();
    expect(resolved).not.toBeNull();
    expect(resolved!.brushIndex).toBe(1);
    expect(resolved!.target.brushId).toBe("brush-2");
    expect(resolved!.width).toBe(5);
    expect(resolved!.height).toBe(3);
    expect(resolved!.layer).toBe(
      brush.document!.brushes[1].frames[0].layers[0],
    );
  });

  it("is null with no document, a null selection or a stale id — brush included", () => {
    const { brush, pixels, source } = makeRig();
    source.selectedLayerId = "ghost";
    expect(pixels.resolveTarget()).toBeNull();
    source.selectedLayerId = "layer-1";
    source.selectedFrameId = null;
    expect(pixels.resolveTarget()).toBeNull();
    source.selectedFrameId = "frame-1";
    expect(pixels.resolveTarget()).not.toBeNull();
    // A null brush id is "nowhere", never brush 0 (multi-brush D6).
    source.selectedBrushId = null;
    expect(pixels.resolveTarget()).toBeNull();
    source.selectedBrushId = "ghost";
    expect(pixels.resolveTarget()).toBeNull();
    source.selectedBrushId = "brush-1";
    expect(pixels.resolveTarget()).not.toBeNull();
    brush.installDocument(null);
    expect(pixels.resolveTarget()).toBeNull();
  });

  it("cellAt reads the live grid and is undefined off-grid or unselected", () => {
    const { pixels, source } = makeRig();
    expect(pixels.cellAt(1, 1)).toBe(0);
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    expect(pixels.cellAt(1, 1)).toEqual(RED);
    expect(pixels.cellAt(8, 0)).toBeUndefined();
    expect(pixels.cellAt(0, -1)).toBeUndefined();
    source.selectedLayerId = null;
    expect(pixels.cellAt(1, 1)).toBeUndefined();
  });
});

/* ── setCells ────────────────────────────────────────────────────────────── */

describe("setCells", () => {
  it("one cell → pixelVersion +1, domainVersion UNCHANGED, exactly one entry, document replaced", () => {
    const { brush, pixels, history } = makeRig();
    const before = brush.document!;
    const pixelV = brush.pixelVersion;
    const domainV = brush.domainVersion;

    pixels.setCells([{ x: 2, y: 3, value: RED }]);

    expect(brush.pixelVersion).toBe(pixelV + 1);
    expect(brush.domainVersion).toBe(domainV);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].label).toBe("Draw");
    expect(brush.document).not.toBe(before);
    expect(gridOf(brush)[3][2]).toEqual(RED);
    // The previous document is untouched — it was a spine copy.
    expect(before.brushes[0].frames[0].layers[0].pixels[3][2]).toBe(0);
  });

  it("copies ONLY the touched rows — untouched rows keep their reference identity", () => {
    const { brush, pixels } = makeRig(mkDocument(8, 8, 2, 2));
    const before = brush.document!;
    const beforeGrid = before.brushes[0].frames[0].layers[0].pixels;

    pixels.setCells([
      { x: 1, y: 2, value: RED },
      { x: 5, y: 2, value: GREEN },
      { x: 0, y: 6, value: BLUE },
    ]);

    const after = brush.document!;
    const afterGrid = after.brushes[0].frames[0].layers[0].pixels;
    expect(afterGrid).not.toBe(beforeGrid);
    for (let y = 0; y < 8; y++) {
      if (y === 2 || y === 6) {
        expect(afterGrid[y]).not.toBe(beforeGrid[y]);
      } else {
        expect(afterGrid[y]).toBe(beforeGrid[y]);
      }
    }
    // The spine: the other layer, the other frame, the applied groups and
    // the OTHER BRUSH are the very same objects; the touched brush, frame
    // and layer are fresh.
    expect(after.brushes[0].frames[0].layers[1]).toBe(
      before.brushes[0].frames[0].layers[1],
    );
    expect(after.brushes[0].frames[1]).toBe(before.brushes[0].frames[1]);
    expect(after.brushes[0].appliedGroups).toBe(
      before.brushes[0].appliedGroups,
    );
    expect(after.brushes[1]).toBe(before.brushes[1]);
    expect(after.brushes).not.toBe(before.brushes);
    expect(after.brushes[0]).not.toBe(before.brushes[0]);
    expect(after.brushes[0].frames[0]).not.toBe(before.brushes[0].frames[0]);
    expect(after.brushes[0].frames[0].layers[0]).not.toBe(
      before.brushes[0].frames[0].layers[0],
    );
  });

  it("the document and its grids stay RAW after a write and after an undo", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    const check = () => {
      const doc = brush.document!;
      expect(isObservableObject(doc)).toBe(false);
      expect(isObservable(doc)).toBe(false);
      expect(isObservableArray(doc.brushes)).toBe(false);
      expect(isObservableObject(doc.brushes[0])).toBe(false);
      expect(isObservableArray(doc.brushes[0].frames)).toBe(false);
      expect(isObservableObject(doc.brushes[0].frames[0].layers[0])).toBe(
        false,
      );
      const grid = gridOf(brush);
      expect(isObservableArray(grid)).toBe(false);
      expect(isObservableArray(grid[0])).toBe(false);
      expect(isObservable(grid[0][0])).toBe(false);
    };
    check();
    history.undo();
    check();
  });

  it("writing the value a cell already holds records nothing and bumps nothing", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    const doc = brush.document;
    const pixelV = brush.pixelVersion;

    pixels.setCells([{ x: 1, y: 1, value: [100, 0, 0, 0] }]); // equal, new tuple
    pixels.setCells([{ x: 4, y: 4, value: 0 }]); // already unpainted

    expect(history.entries).toHaveLength(1);
    expect(brush.pixelVersion).toBe(pixelV);
    expect(brush.document).toBe(doc);
  });

  it("de-duplicates: one patch per cell, LAST value wins, before is the pre-write value", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    history.clear();

    pixels.setCells([
      { x: 1, y: 1, value: GREEN },
      { x: 2, y: 2, value: GREEN },
      { x: 1, y: 1, value: BLUE },
    ]);

    expect(gridOf(brush)[1][1]).toEqual(BLUE);
    const entry = history.entries[0] as unknown as {
      cells: readonly {
        x: number;
        y: number;
        before: BrushCell;
        after: BrushCell;
      }[];
    };
    expect(entry.cells).toHaveLength(2);
    expect(entry.cells[0]).toEqual({ x: 1, y: 1, before: RED, after: BLUE });
    expect(entry.cells[1]).toEqual({ x: 2, y: 2, before: 0, after: GREEN });
  });

  it("a repeated cell whose LAST value equals the existing one is dropped", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    const pixelV = brush.pixelVersion;
    pixels.setCells([
      { x: 1, y: 1, value: GREEN },
      { x: 1, y: 1, value: RED },
    ]);
    expect(history.entries).toHaveLength(1);
    expect(brush.pixelVersion).toBe(pixelV);
  });

  it("skips out-of-bounds cells rather than clamping them", () => {
    const { brush, pixels, history } = makeRig(mkDocument(4, 4));
    pixels.setCells([
      { x: -1, y: 0, value: RED },
      { x: 4, y: 0, value: RED },
      { x: 0, y: 4, value: RED },
      { x: 0, y: -1, value: RED },
    ]);
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
    pixels.setCells([
      { x: 9, y: 9, value: RED },
      { x: 3, y: 3, value: RED },
    ]);
    expect(history.entries).toHaveLength(1);
    expect(gridOf(brush)[3][3]).toEqual(RED);
  });

  it("the grid holds its OWN tuple — a caller's buffer mutated later changes nothing", () => {
    const { brush, pixels } = makeRig();
    const buffer: BrushDelta = [10, 20, 30, 40];
    pixels.setCells([{ x: 0, y: 0, value: buffer }]);
    buffer[0] = 999;
    expect(gridOf(brush)[0][0]).toEqual([10, 20, 30, 40]);
    expect(gridOf(brush)[0][0]).not.toBe(buffer);
  });

  it("clamps every delta to −255..255 on the way in", () => {
    const { brush, pixels } = makeRig();
    pixels.setCells([{ x: 0, y: 0, value: [300, -300, 1.4, Number.NaN] }]);
    expect(gridOf(brush)[0][0]).toEqual([255, -255, 1, 0]);
  });

  it("trackHistory: false writes and bumps but records nothing", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 0, y: 0, value: RED }], { trackHistory: false });
    expect(gridOf(brush)[0][0]).toEqual(RED);
    expect(brush.pixelVersion).toBe(1);
    expect(history.entries).toHaveLength(0);
  });

  it("does nothing with no selection or no document", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedLayerId = null;
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
    source.selectedLayerId = "layer-1";
    brush.installDocument(null);
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    expect(brush.pixelVersion).toBe(0);
  });

  it("writes into the SELECTED frame and layer only", () => {
    const { brush, pixels, source } = makeRig(mkDocument(4, 4, 2, 2));
    source.selectedFrameId = "frame-2";
    source.selectedLayerId = "layer-2";
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    expect(gridOf(brush, 1, 1)[1][1]).toEqual(RED);
    expect(gridOf(brush, 0, 0)[1][1]).toBe(0);
    expect(gridOf(brush, 0, 1)[1][1]).toBe(0);
    expect(gridOf(brush, 1, 0)[1][1]).toBe(0);
  });
});

/* ── brush scope (multi-brush D6 / R3) ───────────────────────────────────── */

describe("brush scope", () => {
  it("with brush 2 selected, setCells writes brush 2's grid and brush 1 keeps its identity (R3)", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = "brush-2";
    const before = brush.document!;

    pixels.setCells([{ x: 1, y: 1, value: RED }]);

    const after = brush.document!;
    expect(gridOf(brush, 0, 0, 1)[1][1]).toEqual(RED);
    expect(gridOf(brush, 0, 0, 0)[1][1]).toBe(0);
    expect(after).not.toBe(before);
    expect(after.brushes).not.toBe(before.brushes);
    expect(after.brushes[1]).not.toBe(before.brushes[1]);
    expect(after.brushes[0]).toBe(before.brushes[0]);
    // The retained pre-write document still holds an unpainted brush 2.
    expect(before.brushes[1].frames[0].layers[0].pixels[1][1]).toBe(0);
    // The command is addressed to brush 2.
    const entry = history.entries[0];
    expect(isBrushPixelCommand(entry)).toBe(true);
    if (isBrushPixelCommand(entry)) {
      expect(entry.target).toEqual({
        brushId: "brush-2",
        frameId: "frame-1",
        layerId: "layer-1",
      });
    }
  });

  it("with brush 1 selected, brush 2 keeps its identity (R3)", () => {
    const { brush, pixels } = makeRig();
    const before = brush.document!;
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    const after = brush.document!;
    expect(after.brushes[0]).not.toBe(before.brushes[0]);
    expect(after.brushes[1]).toBe(before.brushes[1]);
    expect(gridOf(brush, 0, 0, 1)[1][1]).toBe(0);
  });

  it("a null brush id writes nothing and records nothing", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = null;
    const doc = brush.document;
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    pixels.clearCells([{ x: 0, y: 0 }]);
    pixels.moveLayerCells(1, 0);
    pixels.flipHorizontal();
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
    expect(brush.domainVersion).toBe(0);
    expect(brush.document).toBe(doc);
    expect(gridOf(brush, 0, 0, 0)[0][0]).toBe(0);
    expect(gridOf(brush, 0, 0, 1)[0][0]).toBe(0);
  });

  it("a stale brush id writes nothing and records nothing", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = "ghost";
    const doc = brush.document;
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
    expect(brush.document).toBe(doc);
  });

  it("bounds come from the selected brush: 4×4 brush 2 rejects x: 5 although brush 1 is 8×8", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = "brush-2";
    pixels.setCells([
      { x: 5, y: 0, value: RED },
      { x: 0, y: 5, value: RED },
      { x: 4, y: 4, value: RED },
    ]);
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
    // The same coordinates land in brush 1.
    source.selectedBrushId = "brush-1";
    pixels.setCells([{ x: 5, y: 0, value: RED }]);
    expect(gridOf(brush, 0, 0, 0)[0][5]).toEqual(RED);
    expect(history.entries).toHaveLength(1);
    // And an in-bounds cell of brush 2 is accepted.
    source.selectedBrushId = "brush-2";
    pixels.setCells([{ x: 3, y: 3, value: GREEN }]);
    expect(gridOf(brush, 0, 0, 1)[3][3]).toEqual(GREEN);
    expect(history.entries).toHaveLength(2);
  });

  it("the mask size is checked against the selected brush's size", () => {
    const { brush, pixels, source } = makeRig();
    const mask = new Set([0]); // only (0,0)
    // Brush 2 is 4×4: a 4×4 mask applies and blocks (2,2).
    source.selectedBrushId = "brush-2";
    pixels.setCells([{ x: 2, y: 2, value: RED }], {
      mask,
      maskSize: { width: 4, height: 4 },
    });
    expect(gridOf(brush, 0, 0, 1)[2][2]).toBe(0);
    // Brush 1 is 8×8: the same 4×4 mask mismatches and is DISABLED.
    source.selectedBrushId = "brush-1";
    pixels.setCells([{ x: 2, y: 2, value: RED }], {
      mask,
      maskSize: { width: 4, height: 4 },
    });
    expect(gridOf(brush, 0, 0, 0)[2][2]).toEqual(RED);
  });

  it("undo of a write in brush 2 after selecting brush 1 still restores brush 2 (commands hold ids, not the selection)", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = "brush-2";
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    source.selectedBrushId = "brush-1";
    pixels.setCells([{ x: 1, y: 1, value: GREEN }]);
    expect(history.entries).toHaveLength(2);

    // Brush 1 is selected for both undos; the first undoes brush 1's own
    // write, the second reaches back into brush 2.
    history.undo();
    expect(gridOf(brush, 0, 0, 0)[1][1]).toBe(0);
    expect(gridOf(brush, 0, 0, 1)[1][1]).toEqual(RED);
    const beforeCrossUndo = brush.document!;
    history.undo();
    expect(gridOf(brush, 0, 0, 1)[1][1]).toBe(0);
    expect(gridOf(brush, 0, 0, 0)[1][1]).toBe(0);
    // The replay spine-copied brush 2 and left brush 1 alone (R3).
    expect(brush.document!.brushes[0]).toBe(beforeCrossUndo.brushes[0]);
    expect(brush.document!.brushes[1]).not.toBe(beforeCrossUndo.brushes[1]);

    history.redo();
    expect(gridOf(brush, 0, 0, 1)[1][1]).toEqual(RED);
    expect(gridOf(brush, 0, 0, 0)[1][1]).toBe(0);
    history.redo();
    expect(gridOf(brush, 0, 0, 0)[1][1]).toEqual(GREEN);
    expect(history.entries).toHaveLength(2);
  });

  it("applyPatch resolves brush → frame → layer: the same frame/layer ids in another brush are a different grid", () => {
    const { brush, pixels } = makeRig();
    pixels.applyPatch(
      { brushId: "brush-2", frameId: "frame-1", layerId: "layer-1" },
      [{ x: 0, y: 0, before: 0, after: RED }],
      "redo",
    );
    expect(gridOf(brush, 0, 0, 1)[0][0]).toEqual(RED);
    expect(gridOf(brush, 0, 0, 0)[0][0]).toBe(0);
  });

  it("applyPatch with a brushId not in the document is a no-op", () => {
    const { brush, pixels, history } = makeRig();
    const doc = brush.document;
    pixels.applyPatch(
      { brushId: "ghost", frameId: "frame-1", layerId: "layer-1" },
      [{ x: 0, y: 0, before: 0, after: RED }],
      "redo",
    );
    expect(brush.document).toBe(doc);
    expect(brush.pixelVersion).toBe(0);
    expect(history.entries).toHaveLength(0);
  });

  it("moveLayerCells and the flips act on the selected brush only", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedBrushId = "brush-2";
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    const before = brush.document!;

    pixels.moveLayerCells(1, 0);
    expect(gridOf(brush, 0, 0, 1)[0]).toEqual([0, RED, 0, 0]);
    expect(brush.document!.brushes[0]).toBe(before.brushes[0]);

    pixels.flipHorizontal();
    expect(gridOf(brush, 0, 0, 1)[0]).toEqual([0, 0, RED, 0]);
    expect(brush.document!.brushes[0]).toBe(before.brushes[0]);

    pixels.flipVertical();
    expect(gridOf(brush, 0, 0, 1)[3]).toEqual([0, 0, RED, 0]);
    expect(gridOf(brush, 0, 0, 1)[0]).toEqual([0, 0, 0, 0]);
    expect(brush.document!.brushes[0]).toBe(before.brushes[0]);
    // Brush 1 never saw a cell.
    expect(
      gridOf(brush, 0, 0, 0).every((row) => row.every((c) => c === 0)),
    ).toBe(true);
    expect(history.entries.map((e) => e.label)).toEqual([
      "Draw",
      "Move layer",
      "Flip horizontal",
      "Flip vertical",
    ]);

    // Undoing the two flips — snapshot restores — brings back the moved
    // document by reference, brush 1 still the same object.
    history.undo();
    history.undo();
    expect(gridOf(brush, 0, 0, 1)[0]).toEqual([0, RED, 0, 0]);
    expect(brush.document!.brushes[0]).toBe(before.brushes[0]);
  });
});

/* ── the edit mask ───────────────────────────────────────────────────────── */

describe("mask", () => {
  it("excludes cells outside the mask", () => {
    const { brush, pixels, history } = makeRig(mkDocument(4, 4));
    const mask = new Set([1 * 4 + 1]); // only (1,1)
    pixels.setCells(
      [
        { x: 1, y: 1, value: RED },
        { x: 2, y: 2, value: RED },
      ],
      { mask, maskSize: { width: 4, height: 4 } },
    );
    expect(gridOf(brush)[1][1]).toEqual(RED);
    expect(gridOf(brush)[2][2]).toBe(0);
    expect(history.entries).toHaveLength(1);
  });

  it("a mask that excludes everything writes and records nothing", () => {
    const { brush, pixels, history } = makeRig(mkDocument(4, 4));
    pixels.setCells([{ x: 2, y: 2, value: RED }], {
      mask: new Set([0]),
      maskSize: { width: 4, height: 4 },
    });
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
  });

  it("a mismatched maskSize DISABLES masking (the PixelStore rule)", () => {
    const { brush, pixels } = makeRig(mkDocument(4, 4));
    pixels.setCells([{ x: 2, y: 2, value: RED }], {
      mask: new Set([0]),
      maskSize: { width: 16, height: 16 },
    });
    expect(gridOf(brush)[2][2]).toEqual(RED);
  });

  it("a mask without a maskSize is ignored", () => {
    const { brush, pixels } = makeRig(mkDocument(4, 4));
    pixels.setCells([{ x: 2, y: 2, value: RED }], { mask: new Set([0]) });
    expect(gridOf(brush)[2][2]).toEqual(RED);
  });
});

/* ── clearCells ──────────────────────────────────────────────────────────── */

describe("clearCells", () => {
  it("sets cells to 0 as one entry and honours the mask", () => {
    const { brush, pixels, history } = makeRig(mkDocument(4, 4));
    pixels.setCells([
      { x: 0, y: 0, value: RED },
      { x: 1, y: 0, value: RED },
      { x: 2, y: 0, value: RED },
    ]);
    pixels.clearCells(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 3, y: 3 }, // already 0 — dropped
      ],
      { mask: new Set([0]), maskSize: { width: 4, height: 4 } },
    );
    expect(gridOf(brush)[0]).toEqual([0, RED, RED, 0]);
    expect(history.entries).toHaveLength(2);
    history.undo();
    expect(gridOf(brush)[0]).toEqual([RED, RED, RED, 0]);
  });
});

/* ── undo / redo through the patch host ──────────────────────────────────── */

describe("undo / redo", () => {
  it("undo restores the cells and bumps pixelVersion; redo re-applies", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([
      { x: 1, y: 1, value: RED },
      { x: 2, y: 2, value: GREEN },
    ]);
    const painted = brush.document!;
    const pixelV = brush.pixelVersion;
    const domainV = brush.domainVersion;

    history.undo();
    expect(gridOf(brush)[1][1]).toBe(0);
    expect(gridOf(brush)[2][2]).toBe(0);
    expect(brush.pixelVersion).toBe(pixelV + 1);
    expect(brush.domainVersion).toBe(domainV);
    expect(history.entries).toHaveLength(1); // the replay recorded nothing
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(gridOf(brush)[1][1]).toEqual(RED);
    expect(gridOf(brush)[2][2]).toEqual(GREEN);
    expect(brush.pixelVersion).toBe(pixelV + 2);
    expect(history.entries).toHaveLength(1);
    // The redo produced an EQUAL document through a fresh spine, not the old
    // reference — every replace is a new object.
    expect(brush.document).not.toBe(painted);
    expect(brush.document).toEqual(painted);
  });

  it("a cell written twice in one stroke (two calls in a transaction) undoes to its ORIGINAL value", () => {
    // The double-reversal trap: `createBrushPixelCommand.undo()` already
    // reverses its cells, and the composite runs children last-to-first. If
    // the host reversed AGAIN, the second write's `before` (RED) would be the
    // final write and the cell would stay painted.
    const { brush, pixels, history } = makeRig();
    history.beginTransaction("Draw");
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    pixels.setCells([{ x: 1, y: 1, value: GREEN }]);
    pixels.setCells([{ x: 1, y: 1, value: BLUE }]);
    history.endTransaction();
    expect(history.entries).toHaveLength(1);
    expect(gridOf(brush)[1][1]).toEqual(BLUE);

    history.undo();
    expect(gridOf(brush)[1][1]).toBe(0);
    history.redo();
    expect(gridOf(brush)[1][1]).toEqual(BLUE);
  });

  it("a cell written twice INSIDE one setCells call also undoes to its original value", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 1, y: 1, value: RED }]);
    pixels.setCells([
      { x: 1, y: 1, value: GREEN },
      { x: 1, y: 1, value: BLUE },
    ]);
    history.undo();
    expect(gridOf(brush)[1][1]).toEqual(RED);
    history.undo();
    expect(gridOf(brush)[1][1]).toBe(0);
  });

  it("applyPatch writes the cells IN THE ORDER GIVEN and never records", () => {
    const { brush, pixels, history } = makeRig();
    const target = {
      brushId: "brush-1",
      frameId: "frame-1",
      layerId: "layer-1",
    };
    pixels.applyPatch(
      target,
      [
        { x: 0, y: 0, before: 0, after: RED },
        { x: 0, y: 0, before: 0, after: GREEN },
      ],
      "redo",
    );
    expect(gridOf(brush)[0][0]).toEqual(GREEN);
    pixels.applyPatch(
      target,
      [
        { x: 0, y: 0, before: BLUE, after: RED },
        { x: 0, y: 0, before: 0, after: GREEN },
      ],
      "undo",
    );
    expect(gridOf(brush)[0][0]).toBe(0);
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(2);
    expect(brush.domainVersion).toBe(0);
  });

  it("applyPatch with a target that no longer exists is a no-op", () => {
    const { brush, pixels } = makeRig();
    const doc = brush.document;
    pixels.applyPatch(
      { brushId: "brush-1", frameId: "frame-1", layerId: "ghost" },
      [{ x: 0, y: 0, before: 0, after: RED }],
      "redo",
    );
    pixels.applyPatch(
      { brushId: "brush-1", frameId: "ghost", layerId: "layer-1" },
      [{ x: 0, y: 0, before: 0, after: RED }],
      "redo",
    );
    expect(brush.document).toBe(doc);
    expect(brush.pixelVersion).toBe(0);
  });

  it("undo targets the recorded frame/layer even after the selection moves", () => {
    const { brush, pixels, history, source } = makeRig(mkDocument(4, 4, 2, 2));
    pixels.setCells([{ x: 1, y: 1, value: RED }]); // frame-1 / layer-1
    source.selectedFrameId = "frame-2";
    source.selectedLayerId = "layer-2";
    history.undo();
    expect(gridOf(brush, 0, 0)[1][1]).toBe(0);
    expect(gridOf(brush, 1, 1)[1][1]).toBe(0);
  });

  it("entries stack and unwind in order", () => {
    const { brush, pixels, history } = makeRig();
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    pixels.setCells([{ x: 0, y: 0, value: GREEN }]);
    pixels.setCells([{ x: 1, y: 0, value: BLUE }]);
    history.undo();
    expect(gridOf(brush)[0]).toEqual([GREEN, 0, 0, 0, 0, 0, 0, 0]);
    history.undo();
    expect(gridOf(brush)[0]).toEqual([RED, 0, 0, 0, 0, 0, 0, 0]);
    history.undo();
    expect(gridOf(brush)[0][0]).toBe(0);
    history.redo();
    history.redo();
    history.redo();
    expect(gridOf(brush)[0]).toEqual([GREEN, BLUE, 0, 0, 0, 0, 0, 0]);
  });
});

/* ── moveLayerCells ──────────────────────────────────────────────────────── */

describe("moveLayerCells", () => {
  function paintL(pixels: BrushPixelStore) {
    pixels.setCells([
      { x: 0, y: 0, value: RED },
      { x: 1, y: 0, value: GREEN },
      { x: 0, y: 1, value: BLUE },
    ]);
  }

  it("shifts every cell; cells shifted off the grid are DROPPED; vacated cells are 0", () => {
    const { brush, pixels, history } = makeRig(mkDocument(3, 3));
    paintL(pixels);
    pixels.moveLayerCells(2, 0);
    expect(gridOf(brush)).toEqual([
      [0, 0, RED], // GREEN fell off the right edge
      [0, 0, BLUE],
      [0, 0, 0],
    ]);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].label).toBe("Move layer");
    expect(brush.domainVersion).toBe(0);
  });

  it("negative offsets drop off the top/left", () => {
    const { brush, pixels } = makeRig(mkDocument(3, 3));
    paintL(pixels);
    pixels.moveLayerCells(-1, -1);
    expect(gridOf(brush)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("undo restores the pre-move layer exactly, including the dropped cells", () => {
    const { brush, pixels, history } = makeRig(mkDocument(3, 3));
    paintL(pixels);
    const before = gridOf(brush);
    pixels.moveLayerCells(1, 1);
    expect(gridOf(brush)).toEqual([
      [0, 0, 0],
      [0, RED, GREEN],
      [0, BLUE, 0],
    ]);
    history.undo();
    expect(gridOf(brush)).toEqual(before);
    history.redo();
    expect(gridOf(brush)[1][1]).toEqual(RED);
  });

  it("only rows that change are copied", () => {
    const { brush, pixels } = makeRig(mkDocument(4, 4));
    pixels.setCells([{ x: 0, y: 0, value: RED }]);
    const before = gridOf(brush);
    pixels.moveLayerCells(1, 0); // only row 0 changes
    const after = gridOf(brush);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it("a (0,0) move, a non-integer move, or a move that changes nothing records nothing", () => {
    const { brush, pixels, history } = makeRig(mkDocument(3, 3));
    pixels.moveLayerCells(0, 0);
    pixels.moveLayerCells(0.5, 0);
    pixels.moveLayerCells(1, 0); // empty layer — nothing changes
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
  });

  it("honours trackHistory: false", () => {
    const { brush, pixels, history } = makeRig(mkDocument(3, 3));
    paintL(pixels);
    pixels.moveLayerCells(1, 0, { trackHistory: false });
    expect(history.entries).toHaveLength(1);
    expect(gridOf(brush)[0][1]).toEqual(RED);
  });
});

/* ── flips: the snapshot family ──────────────────────────────────────────── */

describe("flipHorizontal / flipVertical", () => {
  it("each is ONE entry that undoes; the other brush, frames and layers keep identity", () => {
    const { brush, pixels, history } = makeRig(mkDocument(3, 2, 2, 2));
    pixels.setCells([
      { x: 0, y: 0, value: RED },
      { x: 1, y: 1, value: GREEN },
    ]);
    const before = brush.document!;
    const pixelV = brush.pixelVersion;

    pixels.flipHorizontal();
    expect(gridOf(brush)).toEqual([
      [0, 0, RED],
      [0, GREEN, 0],
    ]);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].label).toBe("Flip horizontal");
    expect(brush.pixelVersion).toBe(pixelV + 1);
    expect(brush.document!.brushes[1]).toBe(before.brushes[1]);
    expect(brush.document!.brushes[0].frames[1]).toBe(
      before.brushes[0].frames[1],
    );
    expect(brush.document!.brushes[0].frames[0].layers[1]).toBe(
      before.brushes[0].frames[0].layers[1],
    );

    pixels.flipVertical();
    expect(gridOf(brush)).toEqual([
      [0, GREEN, 0],
      [0, 0, RED],
    ]);
    expect(history.entries).toHaveLength(3);
    expect(history.entries[2].label).toBe("Flip vertical");

    history.undo();
    expect(gridOf(brush)).toEqual([
      [0, 0, RED],
      [0, GREEN, 0],
    ]);
    history.undo();
    expect(brush.document).toBe(before);
    expect(gridOf(brush)).toEqual([
      [RED, 0, 0],
      [0, GREEN, 0],
    ]);
  });

  it("flip ∘ flip is the identity on the grid contents", () => {
    const { brush, pixels } = makeRig(mkDocument(4, 3));
    pixels.setCells([
      { x: 0, y: 0, value: RED },
      { x: 3, y: 2, value: GREEN },
      { x: 1, y: 1, value: BLUE },
    ]);
    const before = gridOf(brush);
    pixels.flipHorizontal();
    pixels.flipHorizontal();
    expect(gridOf(brush)).toEqual(before);
    pixels.flipVertical();
    pixels.flipVertical();
    expect(gridOf(brush)).toEqual(before);
  });

  it("does nothing without a selection", () => {
    const { brush, pixels, source, history } = makeRig();
    source.selectedLayerId = null;
    pixels.flipHorizontal();
    pixels.flipVertical();
    expect(history.entries).toHaveLength(0);
    expect(brush.pixelVersion).toBe(0);
  });
});

/* ── isReplaying guard ───────────────────────────────────────────────────── */

describe("history replay guard", () => {
  it("a write issued while the history is replaying records nothing", () => {
    const { brush, pixels, history } = makeRig();
    // A command whose undo re-enters the store — the shape a future
    // structural op could take. The nested write must not spawn an entry.
    history.record({
      label: "re-entrant",
      bytes: 0,
      undo: () => pixels.setCells([{ x: 3, y: 3, value: RED }]),
      redo: () => pixels.setCells([{ x: 3, y: 3, value: 0 }]),
    });
    history.undo();
    expect(gridOf(brush)[3][3]).toEqual(RED);
    expect(history.entries).toHaveLength(1);
    expect(history.canRedo).toBe(true);
  });
});

/* ── THE PERFORMANCE GATE ────────────────────────────────────────────────── */

/**
 * "A 100-cell drag stays under 16 ms/frame" is the check that catches an
 * accidentally deep-observed brush grid. On a 64×64 layer (4,096 cells) a
 * fully proxied grid shows up here as a frame in the tens of milliseconds
 * rather than as a wrong answer anywhere else.
 */
describe("the 100-write drag performance gate (64×64)", () => {
  it("worst frame < 16 ms, undo < 16 ms, redo < 16 ms, one entry", () => {
    const { brush, pixels, history } = makeRig(mkDocument(64, 64));
    const frames: number[] = [];

    history.beginTransaction("Draw");
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      pixels.setCells([
        { x: i % 64, y: Math.floor(i / 8) % 64, value: [i, 0, 0, 0] },
      ]);
      frames.push(performance.now() - t0);
    }
    history.endTransaction();

    const worst = Math.max(...frames);
    const median = [...frames].sort((a, b) => a - b)[
      Math.floor(frames.length / 2)
    ];

    let t = performance.now();
    history.undo();
    const undoMs = performance.now() - t;
    expect(gridOf(brush).every((row) => row.every((c) => c === 0))).toBe(true);

    t = performance.now();
    history.redo();
    const redoMs = performance.now() - t;
    expect(gridOf(brush)[0][0]).toEqual([0, 0, 0, 0]);
    expect(gridOf(brush)[12][99 % 64]).toEqual([99, 0, 0, 0]);

    console.info(
      `[BrushPixelStore perf] 100-write drag on 64×64: worst ${worst.toFixed(3)} ms, ` +
        `median ${median.toFixed(3)} ms; undo ${undoMs.toFixed(3)} ms; redo ${redoMs.toFixed(3)} ms`,
    );

    expect(worst).toBeLessThan(16);
    expect(undoMs).toBeLessThan(16);
    expect(redoMs).toBeLessThan(16);
    // The whole drag collapsed to ONE entry.
    expect(history.entries).toHaveLength(1);
    expect(brush.domainVersion).toBe(0);
    // 100 writes, then 100 child undos and 100 child redos — the composite
    // runs every child command and each `applyPatch` bumps once. All of an
    // undo lands inside ONE `history.undo()` action, so reactions still
    // fire once per undo, not per child.
    expect(brush.pixelVersion).toBe(300);
  });

  it("the 4,096-cell grid is still RAW after the whole drag", () => {
    const { brush, pixels, history } = makeRig(mkDocument(64, 64));
    history.beginTransaction("Draw");
    for (let i = 0; i < 100; i++) {
      pixels.setCells([{ x: i % 64, y: 0, value: RED }]);
    }
    history.endTransaction();
    const grid = gridOf(brush);
    expect(isObservableArray(grid)).toBe(false);
    expect(grid.every((row) => !isObservableArray(row))).toBe(true);
    expect(isObservable(grid[0][0])).toBe(false);
  });
});
