/**
 * Tests for `renderBrushFrame` / `renderBrushLayer` — the Brush Studio's frame
 * compositor (Brush Studio plan, task 06).
 *
 * Strategy 1 of `canvasStub`: buffer in, buffer out, no context. Cell-level
 * expectations (a–g) localise a failure to a byte; the golden digest (h) pins
 * the whole 16×16 composite. The digest is over SYNTHETIC data built in this
 * file — it is not owner data, so re-pinning it after a deliberate change is
 * fine, but a change to it must be explained.
 */
import { describe, expect, it } from "vitest";
import {
  createBrushBuffer,
  renderBrushFrame,
  renderBrushLayer,
} from "@/ui/canvas/render/renderBrushFrame";
import type { BrushSceneLayer } from "@/ui/canvas/render/renderBrushFrame";
import type { BrushCell, BrushChannelType } from "@/types/brush";
import { brushCellToRgba, createEmptyBrushGrid } from "@/types/brush";
import { blendOverChannels } from "@/utils/alphaBlend";
import { getPixel, hashBuffer, isBlank } from "@/test/canvasStub";

/** A `w × h` layer, all cells `0`, with the given cells written. */
function layer(
  channelType: BrushChannelType,
  w: number,
  h: number,
  cells: ReadonlyArray<[number, number, BrushCell]> = [],
  visible = true,
): BrushSceneLayer {
  const pixels = createEmptyBrushGrid(w, h);
  for (const [x, y, cell] of cells) pixels[y][x] = cell;
  return { pixels, channelType, visible };
}

const render = (layers: BrushSceneLayer[], w = 4, h = 4) =>
  renderBrushFrame(createBrushBuffer(w, h), { layers, width: w, height: h });

describe("renderBrushFrame — colourisation (D5)", () => {
  it("(a) an unpainted layer yields all-zero bytes", () => {
    const buf = render([layer("rgb", 4, 4)]);
    expect(buf.width).toBe(4);
    expect(buf.height).toBe(4);
    expect(buf.data.length).toBe(4 * 4 * 4);
    expect(isBlank(buf)).toBe(true);
  });

  it("(b) an rgb cell [0,0,0,255] renders as mid-grey 127,127,127 at alpha 255", () => {
    const buf = render([layer("rgb", 4, 4, [[1, 2, [0, 0, 0, 255]]])]);
    expect(getPixel(buf, 1, 2)).toEqual([127, 127, 127, 255]);
    // And ONLY that cell.
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 2, 1)).toEqual([0, 0, 0, 0]);
  });

  it("(c) an hsl cell [100,-100,0,255] renders channel-for-channel: 177,77,127,255", () => {
    const buf = render([layer("hsl", 4, 4, [[0, 0, [100, -100, 0, 255]]])]);
    expect(getPixel(buf, 0, 0)).toEqual([177, 77, 127, 255]);
  });

  it("(d) a normal cell [0,0,255,0] renders X/Y/Z → R/G/B at alpha 255: 127,127,255,255", () => {
    const buf = render([layer("normal", 4, 4, [[3, 3, [0, 0, 255, 0]]])]);
    expect(getPixel(buf, 3, 3)).toEqual([127, 127, 255, 255]);
  });

  it("(e) a heightmap cell [-255,0,0,0] renders as opaque black: 0,0,0,255", () => {
    const buf = render([layer("heightmap", 4, 4, [[2, 0, [-255, 0, 0, 0]]])]);
    expect(getPixel(buf, 2, 0)).toEqual([0, 0, 0, 255]);
  });

  it("an rgb cell with A delta 0 over transparent lands at alpha 127, colour intact", () => {
    // Over a transparent destination "over" reduces to the source itself —
    // the alpha-127 cell must not be dimmed or premultiplied on the way in.
    const buf = render([layer("rgb", 4, 4, [[0, 0, [255, -255, -255, 0]]])]);
    expect(getPixel(buf, 0, 0)).toEqual([255, 0, 0, 127]);
  });
});

describe("renderBrushFrame — compositing", () => {
  it("(f) a top layer at alpha 127 blends over an opaque bottom layer exactly as blendOverChannels says", () => {
    const bottom = layer("rgb", 2, 2, [[0, 0, [255, -255, -255, 255]]]); // (255,0,0,255)
    const top = layer("rgb", 2, 2, [[0, 0, [255, 255, 255, 0]]]); // (255,255,255,127)
    const buf = render([bottom, top], 2, 2);

    const src = brushCellToRgba([255, 255, 255, 0], "rgb");
    const dst = brushCellToRgba([255, -255, -255, 255], "rgb");
    if (!src || !dst) throw new Error("fixture cells must be painted");
    expect(src.a).toBe(127);
    expect(dst.a).toBe(255);

    const blended = blendOverChannels(
      src.r,
      src.g,
      src.b,
      src.a,
      dst.r,
      dst.g,
      dst.b,
      dst.a,
    );
    if (!blended) throw new Error("composite must not be transparent");
    // `blendOverInto` assigns the UNROUNDED channels into the clamped array —
    // reproduce that, not `Math.round`, so half-to-even stays half-to-even.
    const expected = new Uint8ClampedArray(4);
    expected[0] = blended[0];
    expected[1] = blended[1];
    expected[2] = blended[2];
    expected[3] = blended[3] * 255;

    expect(getPixel(buf, 0, 0)).toEqual([...expected]);
    // Sanity on the shape of the answer: red stayed full, green/blue rose to
    // about half, alpha is fully opaque (over an opaque base it always is).
    expect(getPixel(buf, 0, 0)).toEqual([255, 127, 127, 255]);
  });

  it("(g) a hidden layer contributes nothing", () => {
    const shown = layer("rgb", 4, 4, [[0, 0, [0, 0, 0, 255]]]);
    const hidden = layer("rgb", 4, 4, [[1, 1, [255, 255, 255, 255]]], false);
    const buf = render([shown, hidden]);
    expect(getPixel(buf, 0, 0)).toEqual([127, 127, 127, 255]);
    expect(getPixel(buf, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(hashBuffer(buf)).toBe(hashBuffer(render([shown])));
  });

  it("composites bottom → top: a later opaque layer covers an earlier one", () => {
    const bottom = layer("rgb", 2, 1, [[0, 0, [-255, -255, -255, 255]]]); // black
    const top = layer("rgb", 2, 1, [[0, 0, [255, 255, 255, 255]]]); // white
    expect(getPixel(render([bottom, top], 2, 1), 0, 0)).toEqual([
      255, 255, 255, 255,
    ]);
    expect(getPixel(render([top, bottom], 2, 1), 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("a cell whose A delta is -255 (alpha 0) leaves what is beneath it untouched", () => {
    const bottom = layer("rgb", 1, 1, [[0, 0, [255, -255, -255, 255]]]);
    const clear = layer("rgb", 1, 1, [[0, 0, [255, 255, 255, -255]]]);
    expect(getPixel(render([bottom, clear], 1, 1), 0, 0)).toEqual([
      255, 0, 0, 255,
    ]);
    // And alone it paints nothing at all.
    expect(isBlank(render([clear], 1, 1))).toBe(true);
  });

  it("clears the buffer before painting — stale bytes never survive a re-render", () => {
    const buf = createBrushBuffer(2, 2);
    buf.data.fill(200);
    renderBrushFrame(buf, {
      layers: [layer("rgb", 2, 2)],
      width: 2,
      height: 2,
    });
    expect(isBlank(buf)).toBe(true);
  });

  it("returns the same buffer it was given", () => {
    const buf = createBrushBuffer(2, 2);
    expect(renderBrushFrame(buf, { layers: [], width: 2, height: 2 })).toBe(
      buf,
    );
  });
});

describe("renderBrushFrame — clipping", () => {
  it("skips rows and cells outside width × height even when the grid is larger", () => {
    // A 4×4 grid fully painted, rendered as a 2×2 document into a 4×4 buffer.
    const cells: [number, number, BrushCell][] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) cells.push([x, y, [0, 0, 0, 255]]);
    }
    const buf = renderBrushFrame(createBrushBuffer(4, 4), {
      layers: [layer("rgb", 4, 4, cells)],
      width: 2,
      height: 2,
    });
    let painted = 0;
    for (let i = 3; i < buf.data.length; i += 4)
      if (buf.data[i] !== 0) painted++;
    expect(painted).toBe(4);
    expect(getPixel(buf, 1, 1)).toEqual([127, 127, 127, 255]);
    expect(getPixel(buf, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 0, 2)).toEqual([0, 0, 0, 0]);
  });

  it("never overruns a buffer smaller than the document", () => {
    const cells: [number, number, BrushCell][] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) cells.push([x, y, [0, 0, 0, 255]]);
    }
    const buf = renderBrushFrame(createBrushBuffer(2, 2), {
      layers: [layer("rgb", 4, 4, cells)],
      width: 4,
      height: 4,
    });
    expect(buf.data.length).toBe(16);
    // The 2×2 corner is painted at the right stride — no wrap-around.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        expect(getPixel(buf, x, y)).toEqual([127, 127, 127, 255]);
      }
    }
  });

  it("tolerates ragged grids: short rows and missing rows are skipped", () => {
    const ragged: BrushSceneLayer = {
      channelType: "rgb",
      visible: true,
      pixels: [
        [[0, 0, 0, 255]],
        [],
        [
          [0, 0, 0, 255],
          [0, 0, 0, 255],
          [0, 0, 0, 255],
        ],
      ],
    };
    const buf = renderBrushFrame(createBrushBuffer(3, 3), {
      layers: [ragged],
      width: 2,
      height: 3,
    });
    expect(getPixel(buf, 0, 0)).toEqual([127, 127, 127, 255]);
    expect(getPixel(buf, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 0, 2)).toEqual([127, 127, 127, 255]);
    expect(getPixel(buf, 1, 2)).toEqual([127, 127, 127, 255]);
    expect(getPixel(buf, 2, 2)).toEqual([0, 0, 0, 0]); // beyond width 2
  });
});

describe("renderBrushLayer", () => {
  it("paints exactly one layer, clearing first", () => {
    const buf = createBrushBuffer(2, 2);
    buf.data.fill(9);
    renderBrushLayer(
      buf,
      layer("heightmap", 2, 2, [[1, 0, [255, 0, 0, 0]]]),
      2,
      2,
    );
    expect(getPixel(buf, 1, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(getPixel(buf, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("paints a hidden layer anyway — a thumbnail still shows what the layer holds", () => {
    const hidden = layer("rgb", 2, 2, [[0, 0, [0, 0, 0, 255]]], false);
    const buf = renderBrushLayer(createBrushBuffer(2, 2), hidden, 2, 2);
    expect(getPixel(buf, 0, 0)).toEqual([127, 127, 127, 255]);
  });

  it("matches renderBrushFrame for a single visible layer, byte for byte", () => {
    const only = layer("hsl", 3, 3, [
      [0, 0, [100, -100, 0, 255]],
      [1, 1, [0, 0, 0, 0]],
      [2, 2, [-255, 255, 40, 120]],
    ]);
    const viaLayer = renderBrushLayer(createBrushBuffer(3, 3), only, 3, 3);
    expect(hashBuffer(viaLayer)).toBe(hashBuffer(render([only], 3, 3)));
  });
});

describe("createBrushBuffer", () => {
  it("allocates width × height × 4 zeroed bytes", () => {
    const buf = createBrushBuffer(5, 3);
    expect(buf).toEqual({
      data: new Uint8ClampedArray(60),
      width: 5,
      height: 3,
    });
    expect(isBlank(buf)).toBe(true);
  });

  it("floors and clamps a bad size instead of throwing", () => {
    expect(createBrushBuffer(2.9, 1.1)).toMatchObject({ width: 2, height: 1 });
    expect(createBrushBuffer(-4, 3)).toMatchObject({ width: 0, height: 3 });
    expect(createBrushBuffer(NaN, 3).data.length).toBe(0);
  });
});

/**
 * (h) A deterministic 16×16 synthetic frame exercising all four channel types
 * and a semi-transparent overlap, so the digest moves if ANY of colourisation,
 * ordering, alpha or clipping changes.
 */
function syntheticFrame16(): BrushSceneLayer[] {
  const w = 16;
  const h = 16;
  const d = (i: number, j: number, k: number) =>
    ((i * 37 + j * 91 + k * 53) % 511) - 255; // deterministic −255..255

  // Bottom: heightmap gradient, fully painted.
  const height = layer("heightmap", w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      (height.pixels as BrushCell[][])[y][x] = [d(x, y, 0), 0, 0, 0];
    }
  }

  // Middle: normal on the diagonal band.
  const normal = layer("normal", w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - y) <= 2) {
        (normal.pixels as BrushCell[][])[y][x] = [
          d(x, y, 1),
          d(y, x, 2),
          255,
          0,
        ];
      }
    }
  }

  // Top: a semi-transparent rgb square and an hsl frame around the edge.
  const rgb = layer("rgb", w, h);
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) {
      (rgb.pixels as BrushCell[][])[y][x] = [
        d(x, y, 3),
        d(x, y, 4),
        d(x, y, 5),
        0,
      ];
    }
  }
  const hsl = layer("hsl", w, h);
  for (let i = 0; i < w; i++) {
    (hsl.pixels as BrushCell[][])[0][i] = [d(i, 0, 6), 0, 0, 255];
    (hsl.pixels as BrushCell[][])[h - 1][i] = [0, d(i, 1, 7), 0, 255];
    (hsl.pixels as BrushCell[][])[i][0] = [0, 0, d(i, 2, 8), 255];
    (hsl.pixels as BrushCell[][])[i][w - 1] = [0, 0, 0, d(i, 3, 9)];
  }

  // A hidden layer that would ruin everything if it leaked.
  const hidden = layer("rgb", w, h, [[8, 8, [255, 255, 255, 255]]], false);

  return [height, normal, rgb, hidden, hsl];
}

describe("renderBrushFrame — golden digest", () => {
  it("(h) GOLDEN: the 16×16 synthetic frame is byte-stable", () => {
    const buf = render(syntheticFrame16(), 16, 16);
    // Recorded 2026-09-08 from a real run of this exact fixture. Synthetic
    // data; re-pin only after a DELIBERATE change to colourisation or
    // compositing, and say why in the commit.
    expect(hashBuffer(buf)).toBe("16x16:682f7e4d");
  });

  it("is deterministic across runs and does not depend on buffer reuse", () => {
    const a = render(syntheticFrame16(), 16, 16);
    const reused = createBrushBuffer(16, 16);
    reused.data.fill(77);
    const b = renderBrushFrame(reused, {
      layers: syntheticFrame16(),
      width: 16,
      height: 16,
    });
    expect(hashBuffer(a)).toBe(hashBuffer(b));
  });
});
