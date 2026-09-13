// Brush document types & colourisation — `docs/01-brush-studio` task 01.
//
// Pure unit tests (node lane, no DOM). Imports go through the `@/types` barrel
// so the test also proves `types/index.ts` re-exports the brush module.
import { describe, expect, it } from "vitest";

import {
  BRUSH_CHANNELS,
  BRUSH_CHANNEL_BADGE,
  BRUSH_CHANNEL_TYPES,
  BRUSH_DELTA_MAX,
  BRUSH_DELTA_MIN,
  BRUSH_DOCUMENT_VERSION,
  assertUniformLayers,
  brushCellToRgba,
  clampDelta,
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
  createEmptyBrushGrid,
  deltaToByte,
  normalizeBrushDocument,
  type BrushCell,
  type BrushDocument,
} from "@/types";

describe("channel table", () => {
  it("lists the four channel types with their channels and badges", () => {
    expect(BRUSH_CHANNEL_TYPES).toEqual(["hsl", "rgb", "normal", "heightmap"]);
    expect(BRUSH_CHANNELS.hsl).toEqual(["H", "S", "L", "A"]);
    expect(BRUSH_CHANNELS.rgb).toEqual(["R", "G", "B", "A"]);
    expect(BRUSH_CHANNELS.normal).toEqual(["X", "Y", "Z"]);
    expect(BRUSH_CHANNELS.heightmap).toEqual(["H"]);
    expect(BRUSH_CHANNEL_BADGE).toEqual({
      hsl: "HSL",
      rgb: "RGB",
      normal: "NRM",
      heightmap: "HGT",
    });
    expect(BRUSH_DELTA_MIN).toBe(-255);
    expect(BRUSH_DELTA_MAX).toBe(255);
    expect(BRUSH_DOCUMENT_VERSION).toBe("brush-1");
  });
});

describe("clampDelta", () => {
  it("rounds and clamps to ±255, NaN → 0", () => {
    expect(clampDelta(0)).toBe(0);
    expect(clampDelta(12.4)).toBe(12);
    expect(clampDelta(12.5)).toBe(13);
    expect(clampDelta(-12.5)).toBe(-12);
    expect(clampDelta(300)).toBe(255);
    expect(clampDelta(-300)).toBe(-255);
    expect(clampDelta(Number.NaN)).toBe(0);
    // A signed zero never leaks into a stored cell.
    expect(Object.is(clampDelta(-0.4), 0)).toBe(true);
    expect(Object.is(clampDelta(-0), 0)).toBe(true);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDelta(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("deltaToByte", () => {
  it("maps −255/−100/0/100/255 → 0/77/127/177/255", () => {
    expect(deltaToByte(-255)).toBe(0);
    expect(deltaToByte(-100)).toBe(77);
    expect(deltaToByte(0)).toBe(127);
    expect(deltaToByte(100)).toBe(177);
    expect(deltaToByte(255)).toBe(255);
  });

  it("clamps out-of-range input to a byte", () => {
    expect(deltaToByte(-1000)).toBe(0);
    expect(deltaToByte(1000)).toBe(255);
  });
});

describe("brushCellToRgba", () => {
  const cell: BrushCell = [100, -100, 0, 255];

  it("returns null for an unpainted cell regardless of type", () => {
    for (const type of BRUSH_CHANNEL_TYPES) {
      expect(brushCellToRgba(0, type)).toBeNull();
    }
  });

  it("hsl maps channel-for-channel including alpha", () => {
    expect(brushCellToRgba(cell, "hsl")).toEqual({
      r: 177,
      g: 77,
      b: 127,
      a: 255,
    });
  });

  it("rgb maps channel-for-channel including alpha", () => {
    expect(brushCellToRgba(cell, "rgb")).toEqual({
      r: 177,
      g: 77,
      b: 127,
      a: 255,
    });
    // A painted cell with A = 0 renders at alpha 127 (MASTER §1 assumption).
    expect(brushCellToRgba([0, 0, 0, 0], "rgb")).toEqual({
      r: 127,
      g: 127,
      b: 127,
      a: 127,
    });
  });

  it("normal maps X/Y/Z → R/G/B with alpha 255, ignoring slot 3", () => {
    expect(brushCellToRgba([100, -100, 0, -255], "normal")).toEqual({
      r: 177,
      g: 77,
      b: 127,
      a: 255,
    });
  });

  it("heightmap renders grey from H with alpha 255, ignoring slots 1–3", () => {
    expect(brushCellToRgba([-100, 255, 255, 255], "heightmap")).toEqual({
      r: 77,
      g: 77,
      b: 77,
      a: 255,
    });
  });
});

describe("factories", () => {
  it("createEmptyBrushGrid builds height rows of width unpainted cells", () => {
    const grid = createEmptyBrushGrid(3, 2);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(3);
    expect(grid.flat().every((c) => c === 0)).toBe(true);
    // Rows are distinct arrays, never shared.
    expect(grid[0]).not.toBe(grid[1]);
  });

  it("createBrushLayer defaults to rgb and visible", () => {
    const layer = createBrushLayer("l", "L", 4, 3);
    expect(layer).toEqual({
      id: "l",
      name: "L",
      channelType: "rgb",
      visible: true,
      pixels: createEmptyBrushGrid(4, 3),
    });
    expect(layer.appliedGroupId).toBeUndefined();
    expect(createBrushLayer("l", "L", 1, 1, "normal").channelType).toBe(
      "normal",
    );
  });

  it("createBrushFrame wraps the layers it is given", () => {
    const layer = createBrushLayer("l", "L", 1, 1);
    expect(createBrushFrame("f", "F", [layer])).toEqual({
      id: "f",
      name: "F",
      layers: [layer],
    });
  });

  it("createBrushDocument builds a 16×16 default satisfying assertUniformLayers", () => {
    const doc = createBrushDocument();
    expect(doc.version).toBe("brush-1");
    expect(doc.width).toBe(16);
    expect(doc.height).toBe(16);
    expect(doc.appliedGroups).toEqual([]);
    expect(doc.frames).toHaveLength(1);
    expect(doc.frames[0].id).toBe("frame-1");
    expect(doc.frames[0].name).toBe("Frame 1");
    expect(doc.frames[0].layers).toHaveLength(1);
    expect(doc.frames[0].layers[0].id).toBe("layer-1");
    expect(doc.frames[0].layers[0].name).toBe("Layer 1");
    expect(doc.frames[0].layers[0].channelType).toBe("rgb");
    expect(() => assertUniformLayers(doc)).not.toThrow();

    const small = createBrushDocument(3, 5);
    expect(small.frames[0].layers[0].pixels).toHaveLength(5);
    expect(small.frames[0].layers[0].pixels[0]).toHaveLength(3);
    expect(() => assertUniformLayers(small)).not.toThrow();
  });
});

describe("assertUniformLayers", () => {
  function twoFrameDoc(): BrushDocument {
    const w = 2;
    const h = 2;
    return {
      version: BRUSH_DOCUMENT_VERSION,
      width: w,
      height: h,
      frames: [
        createBrushFrame("f1", "F1", [
          createBrushLayer("a", "A", w, h),
          createBrushLayer("b", "B", w, h),
        ]),
        createBrushFrame("f2", "F2", [
          createBrushLayer("a", "A", w, h),
          createBrushLayer("b", "B", w, h),
        ]),
      ],
      appliedGroups: [],
    };
  }

  it("accepts identical layer id sequences across frames", () => {
    expect(() => assertUniformLayers(twoFrameDoc())).not.toThrow();
  });

  it("throws when a frame is missing a layer", () => {
    const doc = twoFrameDoc();
    doc.frames[1].layers.pop();
    expect(() => assertUniformLayers(doc)).toThrow(Error);
  });

  it("throws when a frame has the same layers in a different order", () => {
    const doc = twoFrameDoc();
    doc.frames[1].layers.reverse();
    expect(() => assertUniformLayers(doc)).toThrow(Error);
  });

  it("throws on a wrong-size grid (rows)", () => {
    const doc = twoFrameDoc();
    doc.frames[0].layers[0].pixels = createEmptyBrushGrid(2, 3);
    expect(() => assertUniformLayers(doc)).toThrow(/rows/);
  });

  it("throws on a wrong-size grid (cells in a row)", () => {
    const doc = twoFrameDoc();
    doc.frames[1].layers[1].pixels[1] = [0];
    expect(() => assertUniformLayers(doc)).toThrow(/cells/);
  });

  it("throws on a document with no frames", () => {
    const doc = twoFrameDoc();
    doc.frames = [];
    expect(() => assertUniformLayers(doc)).toThrow(Error);
  });
});

describe("normalizeBrushDocument", () => {
  it("rejects null, {}, and {width:0}", () => {
    expect(normalizeBrushDocument(null)).toBeNull();
    expect(normalizeBrushDocument({})).toBeNull();
    expect(normalizeBrushDocument({ width: 0 })).toBeNull();
    expect(
      normalizeBrushDocument({ width: 0, height: 4, frames: [{}] }),
    ).toBeNull();
  });

  it("rejects non-objects, non-numeric sizes, and empty frames", () => {
    expect(normalizeBrushDocument(undefined)).toBeNull();
    expect(normalizeBrushDocument("nope")).toBeNull();
    expect(normalizeBrushDocument([])).toBeNull();
    expect(
      normalizeBrushDocument({ width: "4", height: 4, frames: [{}] }),
    ).toBeNull();
    expect(
      normalizeBrushDocument({ width: 4, height: Number.NaN, frames: [{}] }),
    ).toBeNull();
    expect(
      normalizeBrushDocument({ width: 4, height: 4, frames: [] }),
    ).toBeNull();
    expect(
      normalizeBrushDocument({ width: 4, height: 4, frames: "x" }),
    ).toBeNull();
  });

  it("round-trips a factory document through JSON unchanged", () => {
    const doc = createBrushDocument(4, 3);
    doc.frames[0].layers[0].pixels[1][2] = [1, -2, 3, -4];
    const parsed: unknown = JSON.parse(JSON.stringify(doc));
    expect(normalizeBrushDocument(parsed)).toEqual(doc);
  });

  it("accepts a document with missing appliedGroups / visible / channelType and clamps cells", () => {
    const raw = {
      width: 2,
      height: 2,
      frames: [
        {
          id: "f1",
          name: "F1",
          layers: [
            {
              id: "l1",
              name: "L1",
              channelType: "bogus",
              pixels: [
                [
                  [999, -999, 1.6, Number.NaN],
                  [0.4, 0.5, -0.5, 255],
                ],
                [0, [1, 2, 3, 4]],
              ],
            },
          ],
        },
      ],
    };
    const doc = normalizeBrushDocument(raw);
    expect(doc).not.toBeNull();
    expect(doc!.version).toBe("brush-1");
    expect(doc!.appliedGroups).toEqual([]);
    const layer = doc!.frames[0].layers[0];
    expect(layer.visible).toBe(true);
    expect(layer.channelType).toBe("rgb");
    expect(layer.appliedGroupId).toBeUndefined();
    expect(layer.pixels).toEqual([
      [
        [255, -255, 2, 0],
        [0, 1, 0, 255],
      ],
      [0, [1, 2, 3, 4]],
    ]);
    expect(() => assertUniformLayers(doc!)).not.toThrow();
  });

  it("preserves known channelType, visible:false, appliedGroupId and appliedGroups", () => {
    const raw = {
      width: 1,
      height: 1,
      appliedGroups: [
        { id: "g1", name: "Group 1" },
        { id: "g2" },
        { name: "no id" },
        "junk",
      ],
      frames: [
        {
          id: "f1",
          name: "F1",
          layers: [
            {
              id: "l1",
              name: "L1",
              channelType: "heightmap",
              visible: false,
              appliedGroupId: "g1",
              pixels: [[[10, 0, 0, 0]]],
            },
          ],
        },
      ],
    };
    const doc = normalizeBrushDocument(raw);
    expect(doc!.appliedGroups).toEqual([
      { id: "g1", name: "Group 1" },
      { id: "g2", name: "g2" },
    ]);
    const layer = doc!.frames[0].layers[0];
    expect(layer.channelType).toBe("heightmap");
    expect(layer.visible).toBe(false);
    expect(layer.appliedGroupId).toBe("g1");
    expect(layer.pixels).toEqual([[[10, 0, 0, 0]]]);
  });

  it("pads short grids and truncates long grids to height × width", () => {
    const raw = {
      width: 3,
      height: 2,
      frames: [
        {
          id: "f1",
          name: "F1",
          layers: [
            { id: "short", name: "S", pixels: [[[1, 1, 1, 1]]] },
            {
              id: "long",
              name: "L",
              pixels: [[0, 0, 0, [9, 9, 9, 9]], [0, 0, 0], [[5, 5, 5, 5]]],
            },
            { id: "none", name: "N" },
          ],
        },
      ],
    };
    const doc = normalizeBrushDocument(raw);
    expect(doc).not.toBeNull();
    const [short, long, none] = doc!.frames[0].layers;
    expect(short.pixels).toEqual([
      [[1, 1, 1, 1], 0, 0],
      [0, 0, 0],
    ]);
    expect(long.pixels).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(none.pixels).toEqual(createEmptyBrushGrid(3, 2));
    expect(() => assertUniformLayers(doc!)).not.toThrow();
  });

  it("fills in missing frame / layer ids and names by index", () => {
    const doc = normalizeBrushDocument({
      width: 1,
      height: 1,
      frames: [{ layers: [{}, {}] }, { layers: [{}, {}] }],
    });
    expect(doc!.frames.map((f) => [f.id, f.name])).toEqual([
      ["frame-1", "Frame 1"],
      ["frame-2", "Frame 2"],
    ]);
    expect(doc!.frames[1].layers.map((l) => [l.id, l.name])).toEqual([
      ["layer-1", "Layer 1"],
      ["layer-2", "Layer 2"],
    ]);
  });

  it("returns null when frames disagree on layer ids (uniform-layer invariant)", () => {
    const raw = {
      width: 1,
      height: 1,
      frames: [
        { id: "f1", name: "F1", layers: [{ id: "a", name: "A" }] },
        { id: "f2", name: "F2", layers: [{ id: "b", name: "B" }] },
      ],
    };
    expect(normalizeBrushDocument(raw)).toBeNull();
  });

  it("floors fractional sizes and treats non-array cells as unpainted", () => {
    const doc = normalizeBrushDocument({
      width: 2.9,
      height: 1.2,
      frames: [
        {
          layers: [{ pixels: [[null, { r: 1 }], "junk"] }],
        },
      ],
    });
    expect(doc!.width).toBe(2);
    expect(doc!.height).toBe(1);
    expect(doc!.frames[0].layers[0].pixels).toEqual([[0, 0]]);
  });
});
