/**
 * BrushStructureStore unit suite (Brush Studio task 08).
 *
 * Drives the store over a real `BrushStore` loaded through the same fake
 * in-memory `BrushApiLike` rig as `BrushStore.test.ts`, with a fake selection
 * that is both the source and the sink. After EVERY mutation the suite calls
 * `assertUniformLayers(brush.document!)` — the D6 invariant is the whole
 * point of this store — and checks the reference-identity contract: one
 * history entry per op, untouched grids shared, undo restoring the exact
 * previous document reference.
 */
import { describe, expect, it, vi } from "vitest";
import { flowResult } from "mobx";

import { ApiError } from "@/api";
import { BrushStore, type BrushApiLike } from "@/stores/domain/BrushStore";
import {
  BrushStructureStore,
  type BrushSelectionSink,
  type BrushSelectionSource,
} from "@/stores/domain/BrushStructureStore";
import { SessionStore } from "@/stores/session/SessionStore";
import {
  assertUniformLayers,
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
  type BrushCell,
  type BrushDocument,
  type BrushLayer,
} from "@/types";

/* ── rig ─────────────────────────────────────────────────────────────────── */

class FakeSelection implements BrushSelectionSource, BrushSelectionSink {
  selectedFrameId: string | null = null;
  selectedLayerId: string | null = null;
  readonly selectFrame = vi.fn((id: string | null) => {
    this.selectedFrameId = id;
  });
  readonly selectLayer = vi.fn((id: string | null) => {
    this.selectedLayerId = id;
  });
}

function makeFakeApi(files: Record<string, unknown>): BrushApiLike {
  const store = new Map<string, unknown>(Object.entries(files));
  const notFound = (name: string) =>
    new ApiError({
      kind: "notFound",
      path: "/brush",
      status: 404,
      message: name,
    });
  return {
    list: async () => [...store.keys()],
    get: async (name) => {
      if (!store.has(name)) throw notFound(name);
      return store.get(name);
    },
    save: async (doc, name) => {
      store.set(name, doc);
      return { success: true };
    },
    create: async (name, doc) => {
      store.set(name, doc ?? createBrushDocument());
      return { success: true, name };
    },
    rename: async () => undefined,
    remove: async () => undefined,
  };
}

/**
 * A 3×2 brush: two frames (`f1`, `f2`), two layers (`bottom` rgb, `top` hsl)
 * in each, one applied group `g1` that `top` belongs to. Cell (1,0) of every
 * grid is painted with a frame/layer-specific delta so a copy can be told
 * from its source and a crop can be checked cell by cell.
 */
function twoByTwoDoc(): BrushDocument {
  const W = 3;
  const H = 2;
  const layer = (
    id: string,
    frameNo: number,
    channelType: BrushLayer["channelType"],
  ): BrushLayer => {
    const l = createBrushLayer(id, id, W, H, channelType);
    const mark = id === "top" ? 100 : -100;
    l.pixels[0][1] = [mark, frameNo, 1, 2];
    l.pixels[1][2] = [mark, frameNo, 3, 4];
    if (id === "top") l.appliedGroupId = "g1";
    return l;
  };
  return {
    version: "brush-1",
    width: W,
    height: H,
    frames: [
      createBrushFrame("f1", "Frame 1", [
        layer("bottom", 1, "rgb"),
        layer("top", 1, "hsl"),
      ]),
      createBrushFrame("f2", "Frame 2", [
        layer("bottom", 2, "rgb"),
        layer("top", 2, "hsl"),
      ]),
    ],
    appliedGroups: [{ id: "g1", name: "Group 1" }],
  };
}

interface Rig {
  brush: BrushStore;
  structure: BrushStructureStore;
  selection: FakeSelection;
}

async function makeRig(doc: BrushDocument = twoByTwoDoc()): Promise<Rig> {
  const brush = new BrushStore({
    session: new SessionStore(),
    api: makeFakeApi({ a: doc }),
  });
  await flowResult(brush.loadBrush("a"));
  const selection = new FakeSelection();
  selection.selectedFrameId = "f1";
  selection.selectedLayerId = "top";
  selection.selectFrame.mockClear();
  selection.selectLayer.mockClear();
  const structure = new BrushStructureStore({
    brush,
    source: selection,
    select: selection,
  });
  return { brush, structure, selection };
}

/** Bare store with NO document loaded. */
function emptyRig(): Rig {
  const brush = new BrushStore({
    session: new SessionStore(),
    api: makeFakeApi({}),
  });
  const selection = new FakeSelection();
  const structure = new BrushStructureStore({
    brush,
    source: selection,
    select: selection,
  });
  return { brush, structure, selection };
}

const doc = (rig: Rig): BrushDocument => {
  const d = rig.brush.document;
  if (!d) throw new Error("no document");
  return d;
};
const layerIds = (d: BrushDocument): string[][] =>
  d.frames.map((f) => f.layers.map((l) => l.id));
const frameIds = (d: BrushDocument): string[] => d.frames.map((f) => f.id);
const layerIn = (d: BrushDocument, frame: number, id: string): BrushLayer => {
  const l = d.frames[frame].layers.find((x) => x.id === id);
  if (!l) throw new Error(`no layer ${id} in frame ${frame}`);
  return l;
};
const isAllZero = (grid: BrushCell[][]): boolean =>
  grid.every((row) => row.every((c) => c === 0));

/* ── frames ──────────────────────────────────────────────────────────────── */

describe("addFrame", () => {
  it("inserts after the selected frame with the same layer ids/order and EMPTY grids, and selects it", async () => {
    const rig = await makeRig();
    const before = doc(rig);

    const id = rig.structure.addFrame("New");

    const after = doc(rig);
    assertUniformLayers(after);
    expect(id).not.toBe("");
    expect(frameIds(after)).toEqual(["f1", id, "f2"]);
    const added = after.frames[1];
    expect(added.name).toBe("New");
    expect(added.layers.map((l) => l.id)).toEqual(["bottom", "top"]);
    // Same metadata as the template frame, fresh blank grids.
    expect(layerIn(after, 1, "top").channelType).toBe("hsl");
    expect(layerIn(after, 1, "top").appliedGroupId).toBe("g1");
    expect(isAllZero(layerIn(after, 1, "top").pixels)).toBe(true);
    expect(isAllZero(layerIn(after, 1, "bottom").pixels)).toBe(true);
    expect(added.layers[0].pixels).toHaveLength(2);
    expect(added.layers[0].pixels[0]).toHaveLength(3);
    // Other frames are shared by reference — a spine copy only.
    expect(after.frames[0]).toBe(before.frames[0]);
    expect(after.frames[2]).toBe(before.frames[1]);
    expect(rig.selection.selectFrame).toHaveBeenCalledWith(id);
    expect(rig.selection.selectedFrameId).toBe(id);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("copyPrevious DEEP-copies the selected frame's grids — mutating the copy leaves the source alone", async () => {
    const rig = await makeRig();
    rig.selection.selectedFrameId = "f2";

    const id = rig.structure.addFrame(undefined, true);

    const after = doc(rig);
    assertUniformLayers(after);
    expect(frameIds(after)).toEqual(["f1", "f2", id]);
    expect(after.frames[2].name).toBe("Frame 3");
    const source = layerIn(after, 1, "top");
    const copy = layerIn(after, 2, "top");
    expect(copy.pixels).toEqual(source.pixels);
    expect(copy.pixels).not.toBe(source.pixels);
    expect(copy.pixels[0]).not.toBe(source.pixels[0]);
    expect(copy.pixels[0][1]).not.toBe(source.pixels[0][1]);
    expect(copy.pixels[0][1]).toEqual([100, 2, 1, 2]);

    // Scribble on the copy (the way a careless caller might).
    const cell = copy.pixels[0][1];
    if (cell === 0) throw new Error("expected a painted cell");
    cell[0] = 7;
    copy.pixels[1][0] = [9, 9, 9, 9];
    expect(source.pixels[0][1]).toEqual([100, 2, 1, 2]);
    expect(source.pixels[1][0]).toBe(0);
  });

  it("appends when nothing is selected, templating off the last frame", async () => {
    const rig = await makeRig();
    rig.selection.selectedFrameId = null;
    const id = rig.structure.addFrame();
    const after = doc(rig);
    assertUniformLayers(after);
    expect(frameIds(after)).toEqual(["f1", "f2", id]);
  });

  it("returns '' and records nothing with no document", () => {
    const rig = emptyRig();
    expect(rig.structure.addFrame("x")).toBe("");
    expect(rig.brush.history.entries).toHaveLength(0);
    expect(rig.selection.selectFrame).not.toHaveBeenCalled();
  });
});

describe("duplicateFrame", () => {
  it("inserts a deep copy named '<name> Copy' after the source and selects it", async () => {
    const rig = await makeRig();
    rig.structure.duplicateFrame("f1");
    const after = doc(rig);
    assertUniformLayers(after);
    expect(after.frames).toHaveLength(3);
    const copy = after.frames[1];
    expect(copy.id).not.toBe("f1");
    expect(copy.name).toBe("Frame 1 Copy");
    expect(frameIds(after)[2]).toBe("f2");
    expect(copy.layers.map((l) => l.id)).toEqual(["bottom", "top"]);
    expect(layerIn(after, 1, "top").pixels).toEqual(
      layerIn(after, 0, "top").pixels,
    );
    expect(layerIn(after, 1, "top").pixels).not.toBe(
      layerIn(after, 0, "top").pixels,
    );
    expect(layerIn(after, 1, "top").pixels[0][1]).not.toBe(
      layerIn(after, 0, "top").pixels[0][1],
    );
    expect(rig.selection.selectFrame).toHaveBeenCalledWith(copy.id);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("is a no-op for an unknown frame", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    rig.structure.duplicateFrame("ghost");
    expect(doc(rig)).toBe(before);
    expect(rig.brush.history.entries).toHaveLength(0);
  });
});

describe("deleteFrame", () => {
  it("removes the frame; deleting the SELECTED frame selects the previous one", async () => {
    const rig = await makeRig();
    rig.structure.addFrame("f3"); // f1, f3', f2 — selected = f3'
    const f3 = rig.selection.selectedFrameId!;
    rig.selection.selectFrame.mockClear();

    rig.structure.deleteFrame(f3);

    const after = doc(rig);
    assertUniformLayers(after);
    expect(frameIds(after)).toEqual(["f1", "f2"]);
    expect(rig.selection.selectFrame).toHaveBeenCalledWith("f1");
  });

  it("deleting the FIRST selected frame selects the new first", async () => {
    const rig = await makeRig();
    rig.structure.deleteFrame("f1");
    const after = doc(rig);
    assertUniformLayers(after);
    expect(frameIds(after)).toEqual(["f2"]);
    expect(rig.selection.selectFrame).toHaveBeenCalledWith("f2");
  });

  it("deleting an UNSELECTED frame leaves the selection alone", async () => {
    const rig = await makeRig();
    rig.structure.deleteFrame("f2");
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual(["f1"]);
    expect(rig.selection.selectFrame).not.toHaveBeenCalled();
    expect(rig.selection.selectedFrameId).toBe("f1");
  });

  it("REFUSES to delete the last frame (no-op, nothing recorded)", async () => {
    const rig = await makeRig();
    rig.structure.deleteFrame("f2");
    const only = doc(rig);
    rig.structure.deleteFrame("f1");
    expect(doc(rig)).toBe(only);
    expect(frameIds(doc(rig))).toEqual(["f1"]);
    expect(rig.brush.history.entries).toHaveLength(1);
    assertUniformLayers(doc(rig));
  });
});

describe("renameFrame / moveFrame / reorderFrame", () => {
  it("renameFrame relabels ONE frame, shares the rest, does not bump pixels", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    const pixelV = rig.brush.pixelVersion;
    rig.structure.renameFrame("f2", "Two");
    const after = doc(rig);
    assertUniformLayers(after);
    expect(after.frames[1].name).toBe("Two");
    expect(after.frames[1].layers).toBe(before.frames[1].layers);
    expect(after.frames[0]).toBe(before.frames[0]);
    expect(rig.brush.pixelVersion).toBe(pixelV);
    expect(before.frames[1].name).toBe("Frame 2");
  });

  it("renameFrame of an unknown id records nothing", async () => {
    const rig = await makeRig();
    rig.structure.renameFrame("ghost", "x");
    expect(rig.brush.history.entries).toHaveLength(0);
  });

  it("moveFrame swaps with the neighbour and is a no-op at the ends", async () => {
    const rig = await makeRig();
    rig.structure.moveFrame("f1", "left");
    expect(rig.brush.history.entries).toHaveLength(0);
    rig.structure.moveFrame("f2", "right");
    expect(rig.brush.history.entries).toHaveLength(0);

    rig.structure.moveFrame("f1", "right");
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual(["f2", "f1"]);
    rig.structure.moveFrame("f1", "left");
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual(["f1", "f2"]);
    expect(rig.brush.history.entries).toHaveLength(2);
  });

  it("reorderFrame uses the drag-and-drop index correction and allows the append index", async () => {
    const rig = await makeRig();
    const f3 = rig.structure.addFrame("3"); // f1, f3, f2
    rig.selection.selectedFrameId = f3;
    const f4 = rig.structure.addFrame("4"); // f1, f3, f4, f2
    expect(frameIds(doc(rig))).toEqual(["f1", f3, f4, "f2"]);

    rig.structure.reorderFrame("f1", 4); // append
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual([f3, f4, "f2", "f1"]);

    rig.structure.reorderFrame("f2", 0);
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual(["f2", f3, f4, "f1"]);

    rig.structure.reorderFrame(f3, 3); // rightwards: lands at index 2
    assertUniformLayers(doc(rig));
    expect(frameIds(doc(rig))).toEqual(["f2", f4, f3, "f1"]);
  });

  it("reorderFrame ignores same-place, out-of-range and non-integer targets", async () => {
    const rig = await makeRig();
    rig.structure.reorderFrame("f1", 0);
    rig.structure.reorderFrame("f1", 1); // "drop right after itself" = no move
    rig.structure.reorderFrame("f1", 3);
    rig.structure.reorderFrame("f1", -1);
    rig.structure.reorderFrame("f1", 1.5);
    rig.structure.reorderFrame("ghost", 0);
    expect(rig.brush.history.entries).toHaveLength(0);
    expect(frameIds(doc(rig))).toEqual(["f1", "f2"]);
  });
});

/* ── layers ──────────────────────────────────────────────────────────────── */

describe("addLayer", () => {
  it("appends the same id on TOP of every frame with a fresh grid, and selects it", async () => {
    const rig = await makeRig();
    const before = doc(rig);

    const id = rig.structure.addLayer("Normals", "normal");

    const after = doc(rig);
    assertUniformLayers(after);
    expect(id).not.toBe("");
    expect(layerIds(after)).toEqual([
      ["bottom", "top", id],
      ["bottom", "top", id],
    ]);
    for (let f = 0; f < 2; f++) {
      const l = layerIn(after, f, id);
      expect(l.name).toBe("Normals");
      expect(l.channelType).toBe("normal");
      expect(l.visible).toBe(true);
      expect(l.appliedGroupId).toBeUndefined();
      expect(l.pixels).toHaveLength(2);
      expect(l.pixels[0]).toHaveLength(3);
      expect(isAllZero(l.pixels)).toBe(true);
      // Every frame gets its OWN grid instance.
      expect(after.frames[0].layers[2].pixels).not.toBe(
        after.frames[1].layers[2].pixels,
      );
      // Existing layers are shared by reference.
      expect(after.frames[f].layers[0]).toBe(before.frames[f].layers[0]);
      expect(after.frames[f].layers[1]).toBe(before.frames[f].layers[1]);
    }
    expect(rig.selection.selectLayer).toHaveBeenCalledWith(id);
    expect(rig.selection.selectedLayerId).toBe(id);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("returns '' with no document", () => {
    const rig = emptyRig();
    expect(rig.structure.addLayer("x", "rgb")).toBe("");
    expect(rig.selection.selectLayer).not.toHaveBeenCalled();
  });
});

describe("deleteLayer", () => {
  it("removes the id from EVERY frame; deleting the selected layer selects the one below", async () => {
    const rig = await makeRig();
    rig.structure.deleteLayer("top");
    const after = doc(rig);
    assertUniformLayers(after);
    expect(layerIds(after)).toEqual([["bottom"], ["bottom"]]);
    expect(rig.selection.selectLayer).toHaveBeenCalledWith("bottom");
  });

  it("deleting the bottom selected layer selects the new bottom", async () => {
    const rig = await makeRig();
    rig.selection.selectedLayerId = "bottom";
    rig.structure.deleteLayer("bottom");
    assertUniformLayers(doc(rig));
    expect(layerIds(doc(rig))).toEqual([["top"], ["top"]]);
    expect(rig.selection.selectLayer).toHaveBeenCalledWith("top");
  });

  it("deleting an UNSELECTED layer leaves the selection alone", async () => {
    const rig = await makeRig();
    rig.structure.deleteLayer("bottom");
    assertUniformLayers(doc(rig));
    expect(layerIds(doc(rig))).toEqual([["top"], ["top"]]);
    expect(rig.selection.selectLayer).not.toHaveBeenCalled();
  });

  it("REFUSES to delete the last layer (no-op, nothing recorded)", async () => {
    const rig = await makeRig();
    rig.structure.deleteLayer("top");
    const only = doc(rig);
    rig.structure.deleteLayer("bottom");
    expect(doc(rig)).toBe(only);
    expect(rig.brush.history.entries).toHaveLength(1);
    assertUniformLayers(doc(rig));
  });

  it("is a no-op for an unknown id", async () => {
    const rig = await makeRig();
    rig.structure.deleteLayer("ghost");
    expect(rig.brush.history.entries).toHaveLength(0);
  });
});

describe("moveLayer", () => {
  it("'up' swaps with the layer above in EVERY frame; 'down' swaps back", async () => {
    const rig = await makeRig();
    const before = doc(rig);

    rig.structure.moveLayer("bottom", "up");
    let after = doc(rig);
    assertUniformLayers(after);
    expect(layerIds(after)).toEqual([
      ["top", "bottom"],
      ["top", "bottom"],
    ]);
    // Layer objects (and their grids) are shared, only the arrays are new.
    expect(after.frames[0].layers[1]).toBe(before.frames[0].layers[0]);
    expect(after.frames[1].layers[0]).toBe(before.frames[1].layers[1]);

    rig.structure.moveLayer("bottom", "down");
    after = doc(rig);
    assertUniformLayers(after);
    expect(layerIds(after)).toEqual([
      ["bottom", "top"],
      ["bottom", "top"],
    ]);
    expect(rig.brush.history.entries).toHaveLength(2);
  });

  it("is a no-op at the ends and for an unknown id", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    rig.structure.moveLayer("top", "up");
    rig.structure.moveLayer("bottom", "down");
    rig.structure.moveLayer("ghost", "up");
    expect(doc(rig)).toBe(before);
    expect(rig.brush.history.entries).toHaveLength(0);
  });

  it("holds the invariant across three layers and both directions", async () => {
    const rig = await makeRig();
    const mid = rig.structure.addLayer("mid", "heightmap");
    rig.structure.moveLayer(mid, "down");
    assertUniformLayers(doc(rig));
    expect(layerIds(doc(rig))).toEqual([
      ["bottom", mid, "top"],
      ["bottom", mid, "top"],
    ]);
    rig.structure.moveLayer(mid, "down");
    assertUniformLayers(doc(rig));
    expect(layerIds(doc(rig))).toEqual([
      [mid, "bottom", "top"],
      [mid, "bottom", "top"],
    ]);
  });
});

describe("duplicateLayer", () => {
  it("inserts a deep copy directly above the source in every frame and selects it", async () => {
    const rig = await makeRig();
    const id = rig.structure.duplicateLayer("bottom");
    const after = doc(rig);
    assertUniformLayers(after);
    expect(id).not.toBe("");
    expect(layerIds(after)).toEqual([
      ["bottom", id, "top"],
      ["bottom", id, "top"],
    ]);
    for (let f = 0; f < 2; f++) {
      const source = layerIn(after, f, "bottom");
      const copy = layerIn(after, f, id);
      expect(copy.name).toBe("bottom Copy");
      expect(copy.channelType).toBe("rgb");
      expect(copy.pixels).toEqual(source.pixels);
      expect(copy.pixels).not.toBe(source.pixels);
      expect(copy.pixels[0][1]).not.toBe(source.pixels[0][1]);
      // Frame-specific content was copied from THAT frame.
      expect(copy.pixels[0][1]).toEqual([-100, f + 1, 1, 2]);
    }
    expect(rig.selection.selectLayer).toHaveBeenCalledWith(id);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("carries the applied group and returns '' for an unknown id", async () => {
    const rig = await makeRig();
    const id = rig.structure.duplicateLayer("top");
    expect(layerIn(doc(rig), 1, id).appliedGroupId).toBe("g1");
    expect(rig.structure.duplicateLayer("ghost")).toBe("");
    expect(rig.brush.history.entries).toHaveLength(1);
  });
});

describe("renameLayer / toggleLayerVisibility", () => {
  it("renameLayer relabels in every frame, keeps grids shared, no pixel bump", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    const pixelV = rig.brush.pixelVersion;
    rig.structure.renameLayer("top", "Highlights");
    const after = doc(rig);
    assertUniformLayers(after);
    for (let f = 0; f < 2; f++) {
      expect(layerIn(after, f, "top").name).toBe("Highlights");
      expect(layerIn(after, f, "top").pixels).toBe(
        layerIn(before, f, "top").pixels,
      );
      expect(layerIn(after, f, "bottom")).toBe(layerIn(before, f, "bottom"));
    }
    expect(rig.brush.pixelVersion).toBe(pixelV);
    expect(layerIn(before, 0, "top").name).toBe("top");
  });

  it("toggleLayerVisibility flips in every frame and bumps pixels", async () => {
    const rig = await makeRig();
    const pixelV = rig.brush.pixelVersion;
    rig.structure.toggleLayerVisibility("top");
    assertUniformLayers(doc(rig));
    expect(layerIn(doc(rig), 0, "top").visible).toBe(false);
    expect(layerIn(doc(rig), 1, "top").visible).toBe(false);
    expect(layerIn(doc(rig), 0, "bottom").visible).toBe(true);
    expect(rig.brush.pixelVersion).toBe(pixelV + 1);
    expect(rig.brush.history.entries[0].label).toBe("Hide layer");

    rig.structure.toggleLayerVisibility("top");
    expect(layerIn(doc(rig), 0, "top").visible).toBe(true);
    expect(layerIn(doc(rig), 1, "top").visible).toBe(true);
    expect(rig.brush.history.entries[1].label).toBe("Show layer");
  });

  it("both ignore an unknown id", async () => {
    const rig = await makeRig();
    rig.structure.renameLayer("ghost", "x");
    rig.structure.toggleLayerVisibility("ghost");
    expect(rig.brush.history.entries).toHaveLength(0);
  });
});

describe("setLayerChannelType", () => {
  it("relabels in every frame and leaves every cell value — and the grid reference — untouched", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    const pixelV = rig.brush.pixelVersion;

    rig.structure.setLayerChannelType("top", "heightmap");

    const after = doc(rig);
    assertUniformLayers(after);
    for (let f = 0; f < 2; f++) {
      const l = layerIn(after, f, "top");
      expect(l.channelType).toBe("heightmap");
      expect(l.pixels).toBe(layerIn(before, f, "top").pixels);
      expect(l.pixels[0][1]).toEqual([100, f + 1, 1, 2]);
      expect(l.pixels[1][2]).toEqual([100, f + 1, 3, 4]);
    }
    expect(layerIn(before, 0, "top").channelType).toBe("hsl");
    expect(rig.brush.pixelVersion).toBe(pixelV + 1);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("is a no-op when the type is unchanged or the id unknown", async () => {
    const rig = await makeRig();
    rig.structure.setLayerChannelType("top", "hsl");
    rig.structure.setLayerChannelType("ghost", "rgb");
    expect(rig.brush.history.entries).toHaveLength(0);
  });
});

/* ── applied groups ──────────────────────────────────────────────────────── */

describe("applied groups", () => {
  it("addAppliedGroup appends and returns the id; renameAppliedGroup relabels", async () => {
    const rig = await makeRig();
    const id = rig.structure.addAppliedGroup("Shadow");
    assertUniformLayers(doc(rig));
    expect(doc(rig).appliedGroups).toEqual([
      { id: "g1", name: "Group 1" },
      { id, name: "Shadow" },
    ]);
    rig.structure.renameAppliedGroup(id, "Shade");
    assertUniformLayers(doc(rig));
    expect(doc(rig).appliedGroups[1]).toEqual({ id, name: "Shade" });
    rig.structure.renameAppliedGroup("ghost", "x");
    expect(rig.brush.history.entries).toHaveLength(2);
    expect(emptyRig().structure.addAppliedGroup("x")).toBe("");
  });

  it("setLayerAppliedGroup assigns in every frame, clears with null, rejects unknown groups", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    const pixelV = rig.brush.pixelVersion;

    rig.structure.setLayerAppliedGroup("bottom", "g1");
    assertUniformLayers(doc(rig));
    expect(layerIn(doc(rig), 0, "bottom").appliedGroupId).toBe("g1");
    expect(layerIn(doc(rig), 1, "bottom").appliedGroupId).toBe("g1");
    expect(layerIn(doc(rig), 0, "bottom").pixels).toBe(
      layerIn(before, 0, "bottom").pixels,
    );
    expect(layerIn(before, 0, "bottom").appliedGroupId).toBeUndefined();

    rig.structure.setLayerAppliedGroup("top", null);
    assertUniformLayers(doc(rig));
    expect("appliedGroupId" in layerIn(doc(rig), 0, "top")).toBe(false);
    expect("appliedGroupId" in layerIn(doc(rig), 1, "top")).toBe(false);

    rig.structure.setLayerAppliedGroup("top", "nope");
    rig.structure.setLayerAppliedGroup("top", null); // already clear
    rig.structure.setLayerAppliedGroup("bottom", "g1"); // already set
    rig.structure.setLayerAppliedGroup("ghost", "g1");
    expect(rig.brush.history.entries).toHaveLength(2);
    expect(rig.brush.pixelVersion).toBe(pixelV);
  });

  it("deleteAppliedGroup removes the group and clears every layer that used it, in every frame", async () => {
    const rig = await makeRig();
    rig.structure.setLayerAppliedGroup("bottom", "g1");
    const before = doc(rig);

    rig.structure.deleteAppliedGroup("g1");

    const after = doc(rig);
    assertUniformLayers(after);
    expect(after.appliedGroups).toEqual([]);
    for (let f = 0; f < 2; f++) {
      expect("appliedGroupId" in layerIn(after, f, "top")).toBe(false);
      expect("appliedGroupId" in layerIn(after, f, "bottom")).toBe(false);
      expect(layerIn(after, f, "top").pixels).toBe(
        layerIn(before, f, "top").pixels,
      );
    }
    expect(layerIn(before, 0, "top").appliedGroupId).toBe("g1");
    rig.structure.deleteAppliedGroup("g1"); // gone already
    expect(rig.brush.history.entries).toHaveLength(2);
  });
});

/* ── resize ──────────────────────────────────────────────────────────────── */

describe("resizeBrush", () => {
  it("crops from the top-left, in every grid of every frame", async () => {
    const rig = await makeRig(); // 3×2, painted at (1,0) and (2,1)
    const pixelV = rig.brush.pixelVersion;
    rig.structure.resizeBrush(2, 1);
    const after = doc(rig);
    assertUniformLayers(after);
    expect(after.width).toBe(2);
    expect(after.height).toBe(1);
    for (let f = 0; f < 2; f++) {
      for (const id of ["bottom", "top"]) {
        const l = layerIn(after, f, id);
        expect(l.pixels).toHaveLength(1);
        expect(l.pixels[0]).toHaveLength(2);
        expect(l.pixels[0][0]).toBe(0);
        expect(l.pixels[0][1]).toEqual([
          id === "top" ? 100 : -100,
          f + 1,
          1,
          2,
        ]);
      }
    }
    expect(rig.brush.pixelVersion).toBe(pixelV + 1);
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("pads with unpainted cells and never shares tuples with the source", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    rig.structure.resizeBrush(4, 3);
    const after = doc(rig);
    assertUniformLayers(after);
    expect(after.width).toBe(4);
    expect(after.height).toBe(3);
    const l = layerIn(after, 1, "top");
    expect(l.pixels).toEqual([
      [0, [100, 2, 1, 2], 0, 0],
      [0, 0, [100, 2, 3, 4], 0],
      [0, 0, 0, 0],
    ]);
    expect(l.pixels[0][1]).not.toBe(layerIn(before, 1, "top").pixels[0][1]);
    // The source document is byte-for-byte what it was.
    expect(before.width).toBe(3);
    expect(layerIn(before, 1, "top").pixels).toHaveLength(2);
  });

  it("ignores the current size, non-integers and sub-1 dimensions", async () => {
    const rig = await makeRig();
    const before = doc(rig);
    rig.structure.resizeBrush(3, 2);
    rig.structure.resizeBrush(2.5, 2);
    rig.structure.resizeBrush(0, 2);
    rig.structure.resizeBrush(3, -1);
    rig.structure.resizeBrush(Number.NaN, 2);
    expect(doc(rig)).toBe(before);
    expect(rig.brush.history.entries).toHaveLength(0);
  });
});

/* ── the history contract, every op ──────────────────────────────────────── */

describe("every op is exactly one history entry whose undo restores the previous document reference", () => {
  const ops: Array<{
    name: string;
    run: (rig: Rig) => void;
    /** Ops that change what is rendered bump `pixelVersion`. */
    bumpsPixels: boolean;
  }> = [
    {
      name: "addFrame",
      run: (r) => r.structure.addFrame("x"),
      bumpsPixels: true,
    },
    {
      name: "addFrame(copy)",
      run: (r) => r.structure.addFrame("x", true),
      bumpsPixels: true,
    },
    {
      name: "duplicateFrame",
      run: (r) => r.structure.duplicateFrame("f1"),
      bumpsPixels: true,
    },
    {
      name: "deleteFrame",
      run: (r) => r.structure.deleteFrame("f1"),
      bumpsPixels: true,
    },
    {
      name: "renameFrame",
      run: (r) => r.structure.renameFrame("f1", "x"),
      bumpsPixels: false,
    },
    {
      name: "moveFrame",
      run: (r) => r.structure.moveFrame("f1", "right"),
      bumpsPixels: true,
    },
    {
      name: "reorderFrame",
      run: (r) => r.structure.reorderFrame("f2", 0),
      bumpsPixels: true,
    },
    {
      name: "addLayer",
      run: (r) => r.structure.addLayer("x", "rgb"),
      bumpsPixels: true,
    },
    {
      name: "deleteLayer",
      run: (r) => r.structure.deleteLayer("top"),
      bumpsPixels: true,
    },
    {
      name: "renameLayer",
      run: (r) => r.structure.renameLayer("top", "x"),
      bumpsPixels: false,
    },
    {
      name: "toggleLayerVisibility",
      run: (r) => r.structure.toggleLayerVisibility("top"),
      bumpsPixels: true,
    },
    {
      name: "moveLayer",
      run: (r) => r.structure.moveLayer("top", "down"),
      bumpsPixels: true,
    },
    {
      name: "duplicateLayer",
      run: (r) => r.structure.duplicateLayer("top"),
      bumpsPixels: true,
    },
    {
      name: "setLayerChannelType",
      run: (r) => r.structure.setLayerChannelType("top", "normal"),
      bumpsPixels: true,
    },
    {
      name: "setLayerAppliedGroup",
      run: (r) => r.structure.setLayerAppliedGroup("bottom", "g1"),
      bumpsPixels: false,
    },
    {
      name: "addAppliedGroup",
      run: (r) => r.structure.addAppliedGroup("x"),
      bumpsPixels: false,
    },
    {
      name: "renameAppliedGroup",
      run: (r) => r.structure.renameAppliedGroup("g1", "x"),
      bumpsPixels: false,
    },
    {
      name: "deleteAppliedGroup",
      run: (r) => r.structure.deleteAppliedGroup("g1"),
      bumpsPixels: false,
    },
    {
      name: "resizeBrush",
      run: (r) => r.structure.resizeBrush(5, 5),
      bumpsPixels: true,
    },
  ];

  it.each(ops)("$name", async ({ run, bumpsPixels }) => {
    const rig = await makeRig();
    const before = doc(rig);
    const beforeJson = JSON.stringify(before);
    const domainV = rig.brush.domainVersion;
    const pixelV = rig.brush.pixelVersion;

    run(rig);

    const after = doc(rig);
    assertUniformLayers(after);
    expect(after).not.toBe(before);
    expect(rig.brush.history.entries).toHaveLength(1);
    expect(rig.brush.domainVersion).toBe(domainV + 1);
    expect(rig.brush.pixelVersion).toBe(bumpsPixels ? pixelV + 1 : pixelV);
    // The previous document was never mutated in place.
    expect(JSON.stringify(before)).toBe(beforeJson);
    assertUniformLayers(before);

    rig.brush.history.undo();
    expect(rig.brush.document).toBe(before);
    assertUniformLayers(doc(rig));
    rig.brush.history.redo();
    expect(rig.brush.document).toBe(after);
    assertUniformLayers(doc(rig));
    expect(rig.brush.history.entries).toHaveLength(1);
  });

  it("no op records anything without a document", () => {
    const rig = emptyRig();
    for (const op of ops) op.run(rig);
    expect(rig.brush.history.entries).toHaveLength(0);
    expect(rig.brush.document).toBeNull();
    expect(rig.selection.selectFrame).not.toHaveBeenCalled();
    expect(rig.selection.selectLayer).not.toHaveBeenCalled();
  });
});

/* ── the invariant guard ─────────────────────────────────────────────────── */

describe("assertUniformLayers is enforced on every commit", () => {
  it("a document whose frames disagree cannot get a layer added — the throw leaves the live document intact", async () => {
    // Bypass the store's own guards to install a non-uniform document, the
    // way a hand-edited file might arrive if the normaliser were skipped.
    const broken = twoByTwoDoc();
    broken.frames[1] = {
      ...broken.frames[1],
      layers: [broken.frames[1].layers[0]],
    };
    const rig = await makeRig(createBrushDocument(3, 2));
    rig.brush.installDocument(broken);
    expect(() => assertUniformLayers(broken)).toThrow();

    expect(() => rig.structure.addLayer("x", "rgb")).toThrow(/differ/);
    expect(rig.brush.document).toBe(broken);
    expect(rig.brush.history.entries).toHaveLength(0);
    expect(rig.selection.selectLayer).not.toHaveBeenCalled();
  });
});
