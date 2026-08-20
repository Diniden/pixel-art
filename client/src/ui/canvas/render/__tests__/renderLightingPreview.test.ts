/**
 * Golden-hash tests for the floating lighting-preview thumbnail.
 *
 * Render mode covered: **lit-sprite thumbnail, letterboxed and integer-scaled**.
 *
 * The BORDER is a stroke and is deliberately not part of this renderer (see the
 * module header) — `canvasStub` cannot rasterise strokes, so hashing one would
 * be a lie about a visible element. `PREVIEW_BORDER` is asserted as data instead.
 *
 * ## The fixed inputs
 *
 * The task-33 spec asks for a fixed light direction so the hashes are stable.
 * `DEFAULT_LIGHT_DIRECTION` is `{x:-64, y:-64, z:180}` (`types/constants.ts:10`)
 * — but this renderer never sees it: the LIT image arrives already composed,
 * because `composeLayers` / `renderWithLighting` read frames and layers, i.e.
 * pixel grids, which may not cross into `ui/` (R2). Task 08 already hash-tested
 * those two under a fixed light direction. What is fixed HERE is the lit buffer
 * itself, which is the stronger constraint.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  renderLightingPreview,
  previewPlacement,
  PREVIEW_THUMB_SIZE,
  PREVIEW_BORDER,
} from "@/ui/canvas/render/renderLightingPreview";
import type { PixelBuffer } from "@/ui/canvas/render/renderLightingPreview";
import { backgroundTheme } from "@/ui/canvas/render/canvasBackground";
import { createBuffer, getPixel, hashBuffer, isBlank } from "@/test/canvasStub";

/**
 * A fixed 4×4 "lit" sprite: an opaque warm diagonal (what a lit surface facing
 * the default light looks like), one fully transparent region, and one
 * half-alpha cell so the compositing path is exercised.
 */
function lit4(): PixelBuffer {
  const buf = createBuffer(4, 4);
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const i = (y * 4 + x) * 4;
    buf.data[i] = r;
    buf.data[i + 1] = g;
    buf.data[i + 2] = b;
    buf.data[i + 3] = a;
  };
  put(0, 0, 255, 250, 240, 255);
  put(1, 1, 200, 196, 188, 255);
  put(2, 2, 140, 137, 132, 255);
  put(3, 3, 80, 78, 75, 255);
  put(3, 0, 255, 255, 255, 128);
  return buf;
}

const render = (
  lit: PixelBuffer,
  objWidth: number,
  objHeight: number,
  thumbSize = PREVIEW_THUMB_SIZE,
) => {
  const buf = createBuffer(thumbSize, thumbSize);
  renderLightingPreview(buf, {
    lit,
    objWidth,
    objHeight,
    theme: backgroundTheme(false),
    thumbSize,
  });
  return buf;
};

describe("previewPlacement — the legacy fit maths", () => {
  it("picks an INTEGER zoom and centres the sprite", () => {
    // 200 / 32 = 6.25 → 6. Drawn 192; margin (200-192)/2 = 4.
    expect(previewPlacement(32, 32)).toEqual({
      zoom: 6,
      offsetX: 4,
      offsetY: 4,
      drawWidth: 192,
      drawHeight: 192,
    });
  });

  it("uses the LARGER dimension, so a wide sprite still fits", () => {
    // max(64, 16) = 64 → 200/64 = 3.125 → 3.
    const p = previewPlacement(64, 16);
    expect(p.zoom).toBe(3);
    expect(p.drawWidth).toBe(192);
    expect(p.drawHeight).toBe(48);
    expect(p.offsetY).toBe(76);
  });

  it("⚠️ clamps to zoom 1 for an oversized sprite — which CROPS it", () => {
    // The legacy behaviour, preserved: a sprite wider than the thumb is drawn
    // 1:1 and the overflow falls off the edge. It is not shrunk.
    const p = previewPlacement(300, 300);
    expect(p.zoom).toBe(1);
    expect(p.offsetX).toBe(-50);
  });
});

describe("renderLightingPreview — golden hashes", () => {
  it("GOLDEN: a 4×4 lit sprite in the 200×200 thumbnail", () => {
    expect(hashBuffer(render(lit4(), 4, 4))).toBe("200x200:bf054695");
  });

  it("GOLDEN: a non-square sprite letterboxes", () => {
    expect(hashBuffer(render(lit4(), 4, 2))).toBe("200x200:8daaf785");
  });

  it("GOLDEN: a small thumbnail (the placement edge cases in miniature)", () => {
    expect(hashBuffer(render(lit4(), 4, 4, 16))).toBe("16x16:3d3c8a85");
  });
});

describe("renderLightingPreview — the properties behind the hashes", () => {
  it("never leaves the buffer blank (the `renderToHash` failure mode)", () => {
    expect(isBlank(render(lit4(), 4, 4))).toBe(false);
  });

  it("writes every pixel opaque", () => {
    const buf = render(lit4(), 4, 4);
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBe(255);
    }
  });

  it("leaves the MARGIN on the flat base colour, not the checkerboard", () => {
    // 4×4 at zoom 50 → drawn 200, margin 0. Use a 4×2 sprite so there IS one.
    const buf = render(lit4(), 4, 2, 16);
    // 16/4 = 4 → zoom 4, drawn 16×8, offsetY = 4. Row 0 is margin.
    expect(getPixel(buf, 0, 0)).toEqual([26, 26, 37, 255]);
  });

  it("draws the checkerboard UNDER the sprite where it is transparent", () => {
    const buf = render(lit4(), 4, 4, 16); // zoom 4, offset 0
    // Cell (1,0) is transparent in the fixture; parity odd → `color2`.
    expect(getPixel(buf, 4, 0)).toEqual([34, 34, 48, 255]);
  });

  it("upscales nearest-neighbour", () => {
    const buf = render(lit4(), 4, 4, 16);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getPixel(buf, x, y)).toEqual([255, 250, 240, 255]);
      }
    }
  });

  it("composites a half-alpha lit pixel over the checkerboard", () => {
    const buf = render(lit4(), 4, 4, 16);
    // Cell (3,0): parity odd → `color2` = (34,34,48); white at a=128.
    // 255 * (128/255) + 34 * (1 - 128/255) = 128 + 16.9 → 145.
    const [r, , , a] = getPixel(buf, 12, 0);
    expect(a).toBe(255);
    expect(r).toBe(145);
    expect(r).not.toBe(255);
  });

  it("returns the same buffer it was given", () => {
    const buf = createBuffer(16, 16);
    const out = renderLightingPreview(buf, {
      lit: lit4(),
      objWidth: 4,
      objHeight: 4,
      theme: backgroundTheme(false),
      thumbSize: 16,
    });
    expect(out).toBe(buf);
  });

  it("survives a lit buffer smaller than the declared object", () => {
    expect(() => render(createBuffer(2, 2), 4, 4, 16)).not.toThrow();
  });

  it("keeps the border values the call site strokes", () => {
    // Not drawn here on purpose; pinned so the two cannot drift apart.
    expect(PREVIEW_BORDER.strokeStyle).toBe("rgba(0, 217, 255, 0.25)");
    expect(PREVIEW_BORDER.lineWidth).toBe(2);
    expect(PREVIEW_THUMB_SIZE).toBe(200);
  });
});
