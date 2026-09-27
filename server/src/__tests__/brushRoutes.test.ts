/**
 * `routes/brush.ts` — the document `POST /api/brush/create` writes when the
 * caller sends no `brushData` (multi-brush task 02, MASTER D14).
 *
 * Only the exported pure builder is exercised. The route module binds to the
 * default `BRUSHES_DIR` under `server/src/data/**` — the owner's real work —
 * so no test here mounts the router or writes a file. A test that needs the
 * file layer belongs in `brushFiles.test.ts`, against a `mkdtemp` directory.
 */
import { describe, expect, it } from "vitest";
import { emptyBrushDocument } from "../routes/brush.js";

/** 16 rows × 16 columns of `0` — an empty brush grid. */
const emptyGrid = () =>
  Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 0));

describe("emptyBrushDocument", () => {
  it("is a brush-2 document with exactly one brush", () => {
    const doc = emptyBrushDocument();
    expect(doc.version).toBe("brush-2");
    expect(doc.brushes).toHaveLength(1);
  });

  it("names the brush 'Brush 1' with id brush-1 at 16×16", () => {
    const [brush] = emptyBrushDocument().brushes;
    expect(brush.id).toBe("brush-1");
    expect(brush.name).toBe("Brush 1");
    expect(brush.width).toBe(16);
    expect(brush.height).toBe(16);
    expect(brush.appliedGroups).toEqual([]);
  });

  it("holds one frame (frame-1) with one visible rgb layer (layer-1)", () => {
    const [brush] = emptyBrushDocument().brushes;
    expect(brush.frames).toHaveLength(1);
    const [frame] = brush.frames;
    expect(frame.id).toBe("frame-1");
    expect(frame.name).toBe("Frame 1");
    expect(frame.layers).toHaveLength(1);
    const [layer] = frame.layers;
    expect(layer.id).toBe("layer-1");
    expect(layer.name).toBe("Layer 1");
    expect(layer.channelType).toBe("rgb");
    expect(layer.visible).toBe(true);
  });

  it("gives the layer a 16-row × 16-column grid of zeros", () => {
    const { pixels } = emptyBrushDocument().brushes[0].frames[0].layers[0];
    expect(pixels).toHaveLength(16);
    for (const row of pixels) {
      expect(row).toHaveLength(16);
      expect(row.every((cell) => cell === 0)).toBe(true);
    }
  });

  it("pins the exact created shape (the client factory's defaults, D14)", () => {
    expect(emptyBrushDocument()).toStrictEqual({
      version: "brush-2",
      brushes: [
        {
          id: "brush-1",
          name: "Brush 1",
          width: 16,
          height: 16,
          frames: [
            {
              id: "frame-1",
              name: "Frame 1",
              layers: [
                {
                  id: "layer-1",
                  name: "Layer 1",
                  channelType: "rgb",
                  visible: true,
                  pixels: emptyGrid(),
                },
              ],
            },
          ],
          appliedGroups: [],
        },
      ],
    });
  });

  it("survives the JSON round trip the file layer performs", () => {
    const doc = emptyBrushDocument();
    expect(JSON.parse(JSON.stringify(doc))).toStrictEqual(doc);
  });

  it("returns a fresh object with fresh grid arrays on every call", () => {
    const a = emptyBrushDocument();
    const b = emptyBrushDocument();
    expect(a).not.toBe(b);
    expect(a.brushes[0]).not.toBe(b.brushes[0]);

    const gridA = a.brushes[0].frames[0].layers[0].pixels;
    const gridB = b.brushes[0].frames[0].layers[0].pixels;
    expect(gridA).not.toBe(gridB);
    gridA.forEach((row, y) => expect(row).not.toBe(gridB[y]));
    // Rows within one grid are distinct arrays too — a shared row would make
    // one write land on every row.
    expect(new Set(gridA).size).toBe(16);

    // Mutating one create must not leak into the next.
    gridA[3][5] = 1;
    expect(gridB[3][5]).toBe(0);
    expect(
      emptyBrushDocument().brushes[0].frames[0].layers[0].pixels[3][5],
    ).toBe(0);
  });
});
