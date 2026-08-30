/**
 * Golden-hash and property tests for the lighting studio's PREVIEW pane painter.
 *
 * Render mode covered: **the lit composite at camera scale** — the whole object
 * upscaled by the shared pixel `zoom` onto the checkerboard, with no thumbnail
 * fit and no crop.
 *
 * ⚠️ The no-crop case below is the explicit contrast with `previewPlacement`
 * (`renderLightingPreview.ts`), which fits into a fixed 200 px square and
 * therefore CROPS anything bigger. If `drawLitComposite` ever grows a fit step,
 * that test is the one that fails.
 *
 * Everything this painter draws is `putImageData` work, so it hashes exactly.
 * Grid strokes and the pane border live at the call site (see the module header).
 *
 * Every hash below was recorded from a real run.
 */
import { describe, expect, it } from "vitest";
import { drawLitComposite } from "@/ui/canvas/render/renderLitComposite";
import type { PixelBuffer } from "@/ui/canvas/render/renderLitComposite";
import { backgroundTheme } from "@/ui/canvas/render/canvasBackground";
import { createBuffer, getPixel, hashBuffer } from "@/test/canvasStub";

function put(
  buf: PixelBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const i = (y * buf.width + x) * 4;
  buf.data[i] = r;
  buf.data[i + 1] = g;
  buf.data[i + 2] = b;
  buf.data[i + 3] = a;
}

/**
 * A 2×2 lit composite with four distinguishable opaque colours, so a
 * transposed or mis-strided upscale is visible rather than only "a different
 * hash".
 */
function litQuad(): PixelBuffer {
  const buf = createBuffer(2, 2);
  put(buf, 0, 0, 200, 40, 40);
  put(buf, 1, 0, 40, 200, 40);
  put(buf, 0, 1, 40, 40, 200);
  put(buf, 1, 1, 220, 220, 60);
  return buf;
}

/** A 4×4 lit composite in the shape `renderWithLighting` produces. */
function lit4(): PixelBuffer {
  const buf = createBuffer(4, 4);
  put(buf, 0, 0, 255, 240, 200);
  put(buf, 1, 1, 180, 170, 150);
  put(buf, 2, 2, 90, 90, 110);
  put(buf, 3, 3, 255, 240, 200);
  put(buf, 0, 3, 128, 64, 32);
  return buf;
}

/** Every cell opaque — the case that must hide the checkerboard entirely. */
function litOpaque(w: number, h: number): PixelBuffer {
  const buf = createBuffer(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) put(buf, x, y, 10, 20, 30);
  }
  return buf;
}

/** A single half-transparent cell — the one that proves compositing. */
function litHalf(): PixelBuffer {
  const buf = createBuffer(4, 4);
  put(buf, 1, 1, 255, 255, 255, 128);
  return buf;
}

const render = (
  source: PixelBuffer,
  light: boolean,
  zoom: number,
  objWidth = source.width,
  objHeight = source.height,
) => {
  const buf = createBuffer(objWidth * zoom, objHeight * zoom);
  drawLitComposite(buf, {
    source,
    objWidth,
    objHeight,
    zoom,
    theme: backgroundTheme(light),
  });
  return buf;
};

describe("drawLitComposite — golden hashes", () => {
  it("GOLDEN: dark theme, 4×4 lit composite at zoom 4", () => {
    expect(hashBuffer(render(lit4(), false, 4))).toBe("16x16:2fd0db85");
  });

  it("GOLDEN: light theme, 4×4 lit composite at zoom 4", () => {
    expect(hashBuffer(render(lit4(), true, 4))).toBe("16x16:0f2ce1e5");
  });

  it("GOLDEN: a half-transparent lit cell composites, not overwrites", () => {
    // Byte-identical to `renderNormalEdit`'s equivalent hash, as it must be:
    // same source, same checkerboard, same source-over lerp. If one moves and
    // the other does not, the two upscales have silently diverged.
    expect(hashBuffer(render(litHalf(), false, 4))).toBe("16x16:7ec31385");
  });
});

describe("drawLitComposite — the upscale", () => {
  it("gives every source pixel an exact zoom × zoom block", () => {
    const buf = render(litQuad(), false, 3);
    expect(buf.width).toBe(6);
    expect(buf.height).toBe(6);

    const blocks: Array<[number, number, [number, number, number, number]]> = [
      [0, 0, [200, 40, 40, 255]],
      [1, 0, [40, 200, 40, 255]],
      [0, 1, [40, 40, 200, 255]],
      [1, 1, [220, 220, 60, 255]],
    ];
    for (const [cx, cy, colour] of blocks) {
      // Corners and centre of the 3×3 block.
      for (const [dx, dy] of [
        [0, 0],
        [2, 0],
        [0, 2],
        [2, 2],
        [1, 1],
      ]) {
        expect(getPixel(buf, cx * 3 + dx, cy * 3 + dy)).toEqual(colour);
      }
    }
  });

  it("reproduces the source 1:1 at zoom 1", () => {
    const buf = render(litQuad(), false, 1);
    expect(buf.width).toBe(2);
    expect(buf.height).toBe(2);
    expect(getPixel(buf, 0, 0)).toEqual([200, 40, 40, 255]);
    expect(getPixel(buf, 1, 0)).toEqual([40, 200, 40, 255]);
    expect(getPixel(buf, 0, 1)).toEqual([40, 40, 200, 255]);
    expect(getPixel(buf, 1, 1)).toEqual([220, 220, 60, 255]);
  });

  it("returns the same buffer it was given", () => {
    const buf = createBuffer(8, 8);
    const out = drawLitComposite(buf, {
      source: litQuad(),
      objWidth: 2,
      objHeight: 2,
      zoom: 4,
      theme: backgroundTheme(false),
    });
    expect(out).toBe(buf);
  });

  it("is safe when the source is smaller than the declared object", () => {
    const buf = createBuffer(16, 16);
    expect(() =>
      drawLitComposite(buf, {
        source: createBuffer(2, 2),
        objWidth: 4,
        objHeight: 4,
        zoom: 4,
        theme: backgroundTheme(false),
      }),
    ).not.toThrow();
    // The uncovered region is checkerboard, not garbage.
    expect(getPixel(buf, 12, 12)).toEqual([42, 42, 58, 255]);
  });
});

describe("drawLitComposite — ⚠️ NO thumbnail fit, NO crop", () => {
  it("draws a sprite far larger than the 200 px thumb at full camera scale", () => {
    // `previewPlacement(300, 300, 200)` yields zoom 1 into a 200×200 square,
    // which crops 100 columns and 100 rows. This painter must not.
    const size = 300;
    const zoom = 2;
    const source = createBuffer(size, size);
    // Mark the bottom-right pixel — the first casualty of a fit-and-crop.
    put(source, size - 1, size - 1, 7, 190, 250);
    put(source, 0, 0, 250, 7, 190);

    const buf = createBuffer(size * zoom, size * zoom);
    drawLitComposite(buf, {
      source,
      objWidth: size,
      objHeight: size,
      zoom,
      theme: backgroundTheme(false),
    });

    expect(buf.width).toBe(600);
    expect(buf.height).toBe(600);
    // The bottom-right source pixel is present, in its full 2×2 block.
    expect(getPixel(buf, 598, 598)).toEqual([7, 190, 250, 255]);
    expect(getPixel(buf, 599, 599)).toEqual([7, 190, 250, 255]);
    // And the top-left one was not re-centred away from the origin.
    expect(getPixel(buf, 0, 0)).toEqual([250, 7, 190, 255]);
  });

  it("scales the output with zoom rather than clamping to a thumb size", () => {
    expect(render(litQuad(), false, 1).width).toBe(2);
    expect(render(litQuad(), false, 8).width).toBe(16);
    expect(render(litQuad(), false, 16).width).toBe(32);
  });
});

describe("drawLitComposite — background and compositing", () => {
  it("leaves the checkerboard visible where the composite is transparent", () => {
    const dark = render(createBuffer(4, 4), false, 4);
    // Cell (1,0): parity (1+0)%2===1 → `color2`.
    expect(getPixel(dark, 4, 0)).toEqual([34, 34, 48, 255]);
    // Cell (0,0): parity even → `color1`.
    expect(getPixel(dark, 0, 0)).toEqual([42, 42, 58, 255]);
  });

  it("uses the theme: light and dark differ for a transparent composite", () => {
    const empty = () => createBuffer(4, 4);
    const dark = hashBuffer(render(empty(), false, 4));
    const light = hashBuffer(render(empty(), true, 4));
    expect(dark).not.toBe(light);
    expect(getPixel(render(empty(), true, 4), 4, 0)).toEqual([
      238, 238, 238, 255,
    ]);
  });

  it("hides the checkerboard completely when the composite is fully opaque", () => {
    const buf = render(litOpaque(4, 4), false, 4);
    for (let y = 0; y < buf.height; y++) {
      for (let x = 0; x < buf.width; x++) {
        expect(getPixel(buf, x, y)).toEqual([10, 20, 30, 255]);
      }
    }
  });

  it("composites partial alpha over the checkerboard instead of replacing it", () => {
    const buf = render(litHalf(), false, 4);
    // Cell (1,1): parity even → `color1` = (42,42,58); source white at a=128.
    // 255 * (128/255) + 42 * (1 - 128/255) = 128 + 20.9 → 149.
    const [r, g, b, a] = getPixel(buf, 4, 4);
    expect(a).toBe(255);
    expect(r).toBe(149);
    expect(g).toBe(149);
    expect(b).toBe(157);
    // Not the raw source colour — that would be an overwrite, not a blend.
    expect(r).not.toBe(255);
  });

  it("writes every pixel opaque — nothing shows through the preview pane", () => {
    const buf = render(lit4(), false, 4);
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBe(255);
    }
  });
});
