// Brush document types & colourisation — `docs/01-brush-studio` task 01;
// brush-2 (many brushes per file, legacy brush-1 wrapped) —
// `docs/14-multi-brush-projects` task 05.
//
// Pure unit tests (node lane, no DOM). Imports go through the `@/types` barrel
// so the test also proves `types/index.ts` re-exports the brush module.
import { describe, expect, it } from "vitest";

import {
  BRUSH_CHANNELS,
  BRUSH_CHANNEL_BADGE,
  BRUSH_CHANNEL_TYPES,
  BRUSH_COLOR_SOURCES,
  BRUSH_COLOR_SOURCE_BADGE,
  BRUSH_COLOR_SOURCE_LABEL,
  BRUSH_DELTA_MAX,
  BRUSH_DELTA_MIN,
  BRUSH_DOCUMENT_VERSION,
  DEFAULT_BRUSH_COLOR_SOURCE,
  LEGACY_BRUSH_DOCUMENT_VERSION,
  assertBrushDocument,
  assertUniformLayers,
  brushCellToRgba,
  brushIn,
  brushLayerColorSource,
  clampDelta,
  createBrush,
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
  createEmptyBrushGrid,
  deltaToByte,
  isColorSource,
  normalizeBrushDocument,
  type Brush,
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
    expect(BRUSH_DOCUMENT_VERSION).toBe("brush-2");
    expect(LEGACY_BRUSH_DOCUMENT_VERSION).toBe("brush-1");
  });

  it("lists the two colour sources with labels and badges", () => {
    expect(BRUSH_COLOR_SOURCES).toEqual(["selected", "target"]);
    expect(BRUSH_COLOR_SOURCE_LABEL).toEqual({
      selected: "Selected colour",
      target: "Target pixel",
    });
    expect(BRUSH_COLOR_SOURCE_BADGE).toEqual({
      selected: "SEL",
      target: "TGT",
    });
    expect(DEFAULT_BRUSH_COLOR_SOURCE).toBe("selected");
    expect(isColorSource("selected")).toBe(true);
    expect(isColorSource("target")).toBe(true);
    expect(isColorSource("bogus")).toBe(false);
    expect(isColorSource(undefined)).toBe(false);
    expect(isColorSource(1)).toBe(false);
    // The helper treats an absent key as the default.
    expect(brushLayerColorSource({})).toBe("selected");
    expect(brushLayerColorSource({ colorSource: "selected" })).toBe("selected");
    expect(brushLayerColorSource({ colorSource: "target" })).toBe("target");
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
    // The colour-source key is absent (not `undefined`) by default so the
    // factory output is byte-identical to a pre-plan-13 layer.
    expect("colorSource" in layer).toBe(false);
    expect(brushLayerColorSource(layer)).toBe("selected");
    expect(createBrushLayer("l", "L", 1, 1, "normal").channelType).toBe(
      "normal",
    );
    expect(
      "colorSource" in createBrushLayer("l", "L", 1, 1, "rgb", "selected"),
    ).toBe(false);
    const target = createBrushLayer("l", "L", 1, 1, "rgb", "target");
    expect(target.colorSource).toBe("target");
    expect(brushLayerColorSource(target)).toBe("target");
  });

  it("createBrushFrame wraps the layers it is given", () => {
    const layer = createBrushLayer("l", "L", 1, 1);
    expect(createBrushFrame("f", "F", [layer])).toEqual({
      id: "f",
      name: "F",
      layers: [layer],
    });
  });

  it("createBrush builds a 16×16 default with the given id and name", () => {
    const brush = createBrush("b-x", "Spark");
    expect(brush.id).toBe("b-x");
    expect(brush.name).toBe("Spark");
    expect(brush.width).toBe(16);
    expect(brush.height).toBe(16);
    expect(brush.appliedGroups).toEqual([]);
    expect(brush.frames).toHaveLength(1);
    expect(brush.frames[0].id).toBe("frame-1");
    expect(brush.frames[0].name).toBe("Frame 1");
    expect(brush.frames[0].layers).toHaveLength(1);
    expect(brush.frames[0].layers[0].id).toBe("layer-1");
    expect(brush.frames[0].layers[0].name).toBe("Layer 1");
    expect(brush.frames[0].layers[0].channelType).toBe("rgb");
    expect(brush.frames[0].layers[0].pixels).toEqual(
      createEmptyBrushGrid(16, 16),
    );
    expect(() => assertUniformLayers(brush)).not.toThrow();

    const small = createBrush("b-y", "Small", 3, 5);
    expect(small.width).toBe(3);
    expect(small.height).toBe(5);
    expect(small.frames[0].layers[0].pixels).toHaveLength(5);
    expect(small.frames[0].layers[0].pixels[0]).toHaveLength(3);
    expect(() => assertUniformLayers(small)).not.toThrow();
    // Deterministic frame / layer ids are reused by every brush (unique
    // within a brush only).
    expect(small.frames[0].id).toBe(brush.frames[0].id);
    expect(small.frames[0].layers[0].id).toBe(brush.frames[0].layers[0].id);
  });

  it("createBrushDocument builds a brush-2 file with one brush 'brush-1' / 'Brush 1'", () => {
    const doc = createBrushDocument();
    expect(doc.version).toBe("brush-2");
    expect(doc.brushes).toHaveLength(1);
    const brush = doc.brushes[0];
    expect(brush.id).toBe("brush-1");
    expect(brush.name).toBe("Brush 1");
    expect(brush.width).toBe(16);
    expect(brush.height).toBe(16);
    expect(brush.appliedGroups).toEqual([]);
    expect(brush.frames).toHaveLength(1);
    expect(brush.frames[0].id).toBe("frame-1");
    expect(brush.frames[0].name).toBe("Frame 1");
    expect(brush.frames[0].layers).toHaveLength(1);
    expect(brush.frames[0].layers[0].id).toBe("layer-1");
    expect(brush.frames[0].layers[0].name).toBe("Layer 1");
    expect(brush.frames[0].layers[0].channelType).toBe("rgb");
    expect(() => assertBrushDocument(doc)).not.toThrow();
    // The body is exactly `createBrush("brush-1", "Brush 1")`.
    expect(brush).toEqual(createBrush("brush-1", "Brush 1"));

    const small = createBrushDocument(3, 5, "Tiny");
    expect(small.brushes).toHaveLength(1);
    expect(small.brushes[0].id).toBe("brush-1");
    expect(small.brushes[0].name).toBe("Tiny");
    expect(small.brushes[0].width).toBe(3);
    expect(small.brushes[0].height).toBe(5);
    expect(small.brushes[0].frames[0].layers[0].pixels).toHaveLength(5);
    expect(small.brushes[0].frames[0].layers[0].pixels[0]).toHaveLength(3);
    expect(() => assertBrushDocument(small)).not.toThrow();
  });
});

describe("brushIn", () => {
  function twoBrushDoc(): BrushDocument {
    return {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [createBrush("a", "A", 2, 2), createBrush("b", "B", 3, 3)],
    };
  }

  it("returns null for a null document", () => {
    expect(brushIn(null, "a")).toBeNull();
    expect(brushIn(null, null)).toBeNull();
  });

  it("finds a brush by id and returns the object held by the document", () => {
    const doc = twoBrushDoc();
    expect(brushIn(doc, "b")).toBe(doc.brushes[1]);
    expect(brushIn(doc, "a")).toBe(doc.brushes[0]);
  });

  it("falls back to the first brush for a null or unknown id", () => {
    const doc = twoBrushDoc();
    expect(brushIn(doc, null)).toBe(doc.brushes[0]);
    expect(brushIn(doc, "missing")).toBe(doc.brushes[0]);
  });

  it("returns null when the document has no brushes", () => {
    const empty: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [],
    };
    expect(brushIn(empty, null)).toBeNull();
    expect(brushIn(empty, "a")).toBeNull();
  });
});

describe("assertUniformLayers", () => {
  function twoFrameBrush(): Brush {
    const w = 2;
    const h = 2;
    return {
      id: "brush-1",
      name: "Brush 1",
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
    expect(() => assertUniformLayers(twoFrameBrush())).not.toThrow();
  });

  it("throws when a frame is missing a layer", () => {
    const brush = twoFrameBrush();
    brush.frames[1].layers.pop();
    expect(() => assertUniformLayers(brush)).toThrow(Error);
  });

  it("throws when a frame has the same layers in a different order", () => {
    const brush = twoFrameBrush();
    brush.frames[1].layers.reverse();
    expect(() => assertUniformLayers(brush)).toThrow(Error);
  });

  it("throws on a wrong-size grid (rows)", () => {
    const brush = twoFrameBrush();
    brush.frames[0].layers[0].pixels = createEmptyBrushGrid(2, 3);
    expect(() => assertUniformLayers(brush)).toThrow(/rows/);
  });

  it("throws on a wrong-size grid (cells in a row)", () => {
    const brush = twoFrameBrush();
    brush.frames[1].layers[1].pixels[1] = [0];
    expect(() => assertUniformLayers(brush)).toThrow(/cells/);
  });

  it("throws on a brush with no frames", () => {
    const brush = twoFrameBrush();
    brush.frames = [];
    expect(() => assertUniformLayers(brush)).toThrow(Error);
  });
});

describe("assertBrushDocument", () => {
  it("accepts a document of distinct, uniform brushes", () => {
    const doc: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [createBrush("a", "A", 2, 2), createBrush("b", "B", 4, 1)],
    };
    expect(() => assertBrushDocument(doc)).not.toThrow();
  });

  it("rejects an empty brushes array", () => {
    const doc: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [],
    };
    expect(() => assertBrushDocument(doc)).toThrow(/no brushes/);
  });

  it("rejects duplicate brush ids", () => {
    const doc: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [
        createBrush("a", "A"),
        createBrush("b", "B"),
        createBrush("a", "A again"),
      ],
    };
    expect(() => assertBrushDocument(doc)).toThrow(/duplicate brush id a/);
  });

  it("rejects a document whose second brush is not uniform", () => {
    const bad = createBrush("b", "B", 2, 2);
    bad.frames[0].layers[0].pixels = createEmptyBrushGrid(2, 3);
    const doc: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [createBrush("a", "A", 2, 2), bad],
    };
    expect(() => assertBrushDocument(doc)).toThrow(/rows/);
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
    const brush = doc.brushes[0];
    brush.frames[0].layers[0].pixels[1][2] = [1, -2, 3, -4];
    brush.frames[0].layers.push(
      createBrushLayer("layer-2", "Layer 2", 4, 3, "hsl", "target"),
    );
    const parsed: unknown = JSON.parse(JSON.stringify(doc));
    const out = normalizeBrushDocument(parsed);
    expect(out).toEqual(doc);
    expect("colorSource" in out!.brushes[0].frames[0].layers[0]).toBe(false);
    expect(out!.brushes[0].frames[0].layers[1].colorSource).toBe("target");
  });

  it("round-trips a two-brush document of different sizes through JSON unchanged", () => {
    const doc: BrushDocument = {
      version: BRUSH_DOCUMENT_VERSION,
      brushes: [
        createBrush("a", "Alpha", 2, 3),
        createBrush("b", "Beta", 5, 1),
      ],
    };
    doc.brushes[0].frames[0].layers[0].pixels[2][1] = [9, 8, 7, 6];
    doc.brushes[1].frames[0].layers[0].pixels[0][4] = [-1, -2, -3, -4];
    doc.brushes[1].appliedGroups.push({ id: "g", name: "G" });
    const out = normalizeBrushDocument(JSON.parse(JSON.stringify(doc)));
    expect(out).toEqual(doc);
    expect(out!.brushes.map((b) => [b.id, b.name, b.width, b.height])).toEqual([
      ["a", "Alpha", 2, 3],
      ["b", "Beta", 5, 1],
    ]);
  });

  it("fills in missing brush ids and names by index", () => {
    const out = normalizeBrushDocument({
      brushes: [
        { width: 1, height: 1, frames: [{}] },
        { name: "Named", width: 1, height: 1, frames: [{}] },
        { id: "custom", width: 1, height: 1, frames: [{}] },
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.version).toBe("brush-2");
    expect(out!.brushes.map((b) => [b.id, b.name])).toEqual([
      ["brush-1", "Brush 1"],
      ["brush-2", "Named"],
      ["custom", "Brush 3"],
    ]);
  });

  it("returns null for the whole document when any brush is invalid", () => {
    const good = { id: "a", width: 2, height: 2, frames: [{}] };
    expect(
      normalizeBrushDocument({
        brushes: [good, { id: "b", width: 0, height: 2, frames: [{}] }],
      }),
    ).toBeNull();
    expect(
      normalizeBrushDocument({
        brushes: [good, { id: "b", width: 2, height: 2, frames: [] }],
      }),
    ).toBeNull();
    expect(
      normalizeBrushDocument({
        brushes: [good, { id: "b", width: "2", height: 2, frames: [{}] }],
      }),
    ).toBeNull();
    expect(normalizeBrushDocument({ brushes: [good, "junk"] })).toBeNull();
    expect(normalizeBrushDocument({ brushes: [good, null] })).toBeNull();
    // A brush whose frames disagree on layer ids is invalid too.
    expect(
      normalizeBrushDocument({
        brushes: [
          good,
          {
            id: "b",
            width: 1,
            height: 1,
            frames: [{ layers: [{ id: "x" }] }, { layers: [{ id: "y" }] }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("returns null on duplicate brush ids", () => {
    expect(
      normalizeBrushDocument({
        brushes: [
          { id: "same", width: 1, height: 1, frames: [{}] },
          { id: "same", width: 1, height: 1, frames: [{}] },
        ],
      }),
    ).toBeNull();
    // Filled-in ids can collide with explicit ones as well.
    expect(
      normalizeBrushDocument({
        brushes: [
          { id: "brush-2", width: 1, height: 1, frames: [{}] },
          { width: 1, height: 1, frames: [{}] },
        ],
      }),
    ).toBeNull();
  });

  it("returns null on an empty brushes array (a corrupt file is never a blank default)", () => {
    expect(normalizeBrushDocument({ brushes: [] })).toBeNull();
    expect(
      normalizeBrushDocument({ version: "brush-2", brushes: [] }),
    ).toBeNull();
  });

  it("never reads the version string", () => {
    const body = { width: 1, height: 1, frames: [{}] };
    expect(
      normalizeBrushDocument({ version: "brush-1", brushes: [body] }),
    ).not.toBeNull();
    expect(
      normalizeBrushDocument({ version: 42, brushes: [body] }),
    ).not.toBeNull();
    expect(normalizeBrushDocument({ brushes: [body] })).not.toBeNull();
    expect(
      normalizeBrushDocument({ version: "brush-2", ...body }),
    ).not.toBeNull();
    expect(
      normalizeBrushDocument({ version: "brush-1", ...body })!.version,
    ).toBe("brush-2");
  });

  it("ignores top-level width/height/frames when brushes is an array", () => {
    const out = normalizeBrushDocument({
      width: 9,
      height: 9,
      frames: [{}],
      brushes: [{ id: "only", width: 2, height: 3, frames: [{}] }],
    });
    expect(out!.brushes).toHaveLength(1);
    expect(out!.brushes[0].id).toBe("only");
    expect(out!.brushes[0].width).toBe(2);
    expect(out!.brushes[0].height).toBe(3);
  });

  describe("legacy brush-1 files", () => {
    // A hand-written brush-1 file as the app wrote it before plan 14: two
    // frames, an hsl layer, a "target" colour source, an applied group, and
    // specific cell values. Already clean, so the wrap must be byte-identical.
    function legacyFile() {
      return {
        version: LEGACY_BRUSH_DOCUMENT_VERSION,
        width: 3,
        height: 2,
        frames: [
          {
            id: "f1",
            name: "Idle",
            layers: [
              {
                id: "base",
                name: "Base",
                channelType: "rgb",
                visible: true,
                pixels: [
                  [[10, -20, 30, 255], 0, [0, 0, 0, 0]],
                  [0, [-255, 255, 1, -1], 0],
                ],
              },
              {
                id: "tint",
                name: "Tint",
                channelType: "hsl",
                visible: false,
                pixels: [
                  [0, [5, 6, 7, 8], 0],
                  [[1, 1, 1, 1], 0, [2, 2, 2, 2]],
                ],
                appliedGroupId: "g1",
                colorSource: "target",
              },
            ],
          },
          {
            id: "f2",
            name: "Blink",
            layers: [
              {
                id: "base",
                name: "Base",
                channelType: "rgb",
                visible: true,
                pixels: [
                  [0, 0, 0],
                  [[3, 3, 3, 3], 0, 0],
                ],
              },
              {
                id: "tint",
                name: "Tint",
                channelType: "hsl",
                visible: false,
                pixels: [
                  [0, 0, [9, 9, 9, 9]],
                  [0, 0, 0],
                ],
                appliedGroupId: "g1",
                colorSource: "target",
              },
            ],
          },
        ],
        appliedGroups: [{ id: "g1", name: "Eyes" }],
      };
    }

    it("wraps a legacy file as one brush 'brush-1' / 'Brush 1'", () => {
      const legacy = legacyFile();
      const out = normalizeBrushDocument(legacy);
      expect(out).not.toBeNull();
      expect(out!.version).toBe("brush-2");
      expect(out!.brushes).toHaveLength(1);
      const brush = out!.brushes[0];
      expect(brush.id).toBe("brush-1");
      expect(brush.name).toBe("Brush 1");
      expect(brush.width).toBe(3);
      expect(brush.height).toBe(2);
      expect(brush.frames).toHaveLength(2);
      expect(brush.frames[0].layers[1].channelType).toBe("hsl");
      expect(brush.frames[0].layers[1].colorSource).toBe("target");
      expect(brush.frames[0].layers[1].appliedGroupId).toBe("g1");
      expect(brush.frames[1].layers[0].pixels[1][0]).toEqual([3, 3, 3, 3]);
      expect(brush.appliedGroups).toEqual([{ id: "g1", name: "Eyes" }]);
      expect(() => assertBrushDocument(out!)).not.toThrow();
    });

    it("normalises a legacy body exactly as the same object would be as a brush-2 entry", () => {
      const legacy = legacyFile();
      const wrapped = normalizeBrushDocument(legacy)!.brushes[0];
      const direct = normalizeBrushDocument({ brushes: [legacy] })!.brushes[0];
      expect(wrapped.frames).toEqual(direct.frames);
      expect(wrapped.appliedGroups).toEqual(direct.appliedGroups);
      expect(wrapped.width).toBe(direct.width);
      expect(wrapped.height).toBe(direct.height);
      // The entry carries no id/name either, so the two are identical.
      expect(wrapped).toEqual(direct);
    });

    it("wraps a clean legacy file byte-identically (R1)", () => {
      const legacy = legacyFile();
      const out = normalizeBrushDocument(legacy)!;
      expect(JSON.stringify(out.brushes[0].frames)).toBe(
        JSON.stringify(legacy.frames),
      );
      expect(JSON.stringify(out.brushes[0].appliedGroups)).toBe(
        JSON.stringify(legacy.appliedGroups),
      );
      // And the wrap is exactly the legacy body plus id/name, in that order.
      const { version: _version, ...body } = legacy;
      expect(JSON.stringify(out.brushes[0])).toBe(
        JSON.stringify({ id: "brush-1", name: "Brush 1", ...body }),
      );
    });

    it("wraps a factory brush-1 document (as the old app wrote it) losslessly", () => {
      const body = createBrush("ignored", "ignored", 4, 3);
      const oldFile = {
        version: LEGACY_BRUSH_DOCUMENT_VERSION,
        width: body.width,
        height: body.height,
        frames: body.frames,
        appliedGroups: body.appliedGroups,
      };
      oldFile.frames[0].layers[0].pixels[2][3] = [1, 2, 3, 4];
      const out = normalizeBrushDocument(JSON.parse(JSON.stringify(oldFile)))!;
      expect(out.brushes[0]).toEqual({
        ...createBrush("brush-1", "Brush 1", 4, 3),
        frames: oldFile.frames,
      });
      expect(JSON.stringify(out.brushes[0].frames)).toBe(
        JSON.stringify(oldFile.frames),
      );
    });

    it("applies the legacy wrap only when the brushes key is absent", () => {
      const body = { width: 4, height: 4, frames: [{ layers: [{}] }] };
      expect(normalizeBrushDocument({ brushes: "x", ...body })).toBeNull();
      expect(normalizeBrushDocument({ brushes: null, ...body })).toBeNull();
      expect(normalizeBrushDocument({ brushes: {}, ...body })).toBeNull();
      expect(normalizeBrushDocument({ brushes: 1, ...body })).toBeNull();
      expect(normalizeBrushDocument(body)).not.toBeNull();
    });

    it("rejects a legacy file that fails the document rules", () => {
      expect(
        normalizeBrushDocument({
          version: "brush-1",
          width: 0,
          height: 4,
          frames: [{}],
        }),
      ).toBeNull();
      expect(
        normalizeBrushDocument({
          version: "brush-1",
          width: 4,
          height: 4,
          frames: [],
        }),
      ).toBeNull();
      expect(
        normalizeBrushDocument({
          version: "brush-1",
          width: 1,
          height: 1,
          frames: [{ layers: [{ id: "a" }] }, { layers: [{ id: "b" }] }],
        }),
      ).toBeNull();
    });
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
    expect(doc!.version).toBe("brush-2");
    const brush = doc!.brushes[0];
    expect(brush.appliedGroups).toEqual([]);
    const layer = brush.frames[0].layers[0];
    expect(layer.visible).toBe(true);
    expect(layer.channelType).toBe("rgb");
    expect(layer.appliedGroupId).toBeUndefined();
    // A pre-plan-13 file has no colorSource: the key stays absent and the
    // helper resolves it to the default.
    expect("colorSource" in layer).toBe(false);
    expect(brushLayerColorSource(layer)).toBe("selected");
    expect(layer.pixels).toEqual([
      [
        [255, -255, 2, 0],
        [0, 1, 0, 255],
      ],
      [0, [1, 2, 3, 4]],
    ]);
    expect(() => assertUniformLayers(brush)).not.toThrow();
  });

  it('normalises colorSource to an absent key unless it is exactly "target"', () => {
    const layerWith = (colorSource: unknown) => ({
      id: "l1",
      name: "L1",
      colorSource,
      pixels: [[0]],
    });
    const doc = normalizeBrushDocument({
      width: 1,
      height: 1,
      frames: [
        {
          layers: [
            layerWith("bogus"),
            layerWith("selected"),
            layerWith("TARGET"),
            layerWith(1),
          ],
        },
      ],
    });
    expect(doc).not.toBeNull();
    for (const layer of doc!.brushes[0].frames[0].layers) {
      expect("colorSource" in layer).toBe(false);
      expect(brushLayerColorSource(layer)).toBe("selected");
    }
  });

  it("preserves known channelType, visible:false, appliedGroupId, colorSource and appliedGroups", () => {
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
              colorSource: "target",
              pixels: [[[10, 0, 0, 0]]],
            },
          ],
        },
      ],
    };
    const doc = normalizeBrushDocument(raw);
    const brush = doc!.brushes[0];
    expect(brush.appliedGroups).toEqual([
      { id: "g1", name: "Group 1" },
      { id: "g2", name: "g2" },
    ]);
    const layer = brush.frames[0].layers[0];
    expect(layer.channelType).toBe("heightmap");
    expect(layer.visible).toBe(false);
    expect(layer.appliedGroupId).toBe("g1");
    expect(layer.colorSource).toBe("target");
    expect(brushLayerColorSource(layer)).toBe("target");
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
    const brush = doc!.brushes[0];
    const [short, long, none] = brush.frames[0].layers;
    expect(short.pixels).toEqual([
      [[1, 1, 1, 1], 0, 0],
      [0, 0, 0],
    ]);
    expect(long.pixels).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(none.pixels).toEqual(createEmptyBrushGrid(3, 2));
    expect(() => assertUniformLayers(brush)).not.toThrow();
  });

  it("fills in missing frame / layer ids and names by index", () => {
    const doc = normalizeBrushDocument({
      width: 1,
      height: 1,
      frames: [{ layers: [{}, {}] }, { layers: [{}, {}] }],
    });
    const brush = doc!.brushes[0];
    expect(brush.frames.map((f) => [f.id, f.name])).toEqual([
      ["frame-1", "Frame 1"],
      ["frame-2", "Frame 2"],
    ]);
    expect(brush.frames[1].layers.map((l) => [l.id, l.name])).toEqual([
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
    const brush = doc!.brushes[0];
    expect(brush.width).toBe(2);
    expect(brush.height).toBe(1);
    expect(brush.frames[0].layers[0].pixels).toEqual([[0, 0]]);
  });
});
