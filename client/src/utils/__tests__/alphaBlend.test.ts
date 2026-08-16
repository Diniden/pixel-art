import { describe, expect, it } from "vitest";
// Imported through the `@/` alias on purpose: this single import is the proof
// that `client/aliases.ts` (used by vite.config.ts + vitest.config.ts) and the
// hand-mirrored `paths` block in `client/tsconfig.json` agree. If either side
// drifts, this file fails under `bunx vitest run` or `bunx tsc --noEmit`.
import { blendPixels } from "@/utils/alphaBlend";
import type { Pixel, PixelData } from "@/types";

const px = (r: number, g: number, b: number, a: number): Pixel => ({
  r,
  g,
  b,
  a,
});

const data = (color: Pixel | 0, height = 0): PixelData => ({
  color,
  normal: 0,
  height,
});

// These assertions pin OBSERVED behaviour (MASTER.md §10 rule 10), not desired
// behaviour. In particular `blendPixels` branches on the `color === 0` SENTINEL,
// which is a different thing from an alpha of 0 — a distinction the tests below
// make explicit so a later refactor cannot quietly conflate them.
describe("blendPixels", () => {
  it("returns an empty PixelData when both sides have the 0 colour sentinel", () => {
    expect(blendPixels(data(0), data(0))).toEqual({
      color: 0,
      normal: 0,
      height: 0,
    });
  });

  it("returns dst unchanged when src has the 0 colour sentinel", () => {
    const dst = data(px(10, 20, 30, 200), 7);
    expect(blendPixels(data(0), dst)).toBe(dst);
  });

  it("returns src unchanged when dst has the 0 colour sentinel", () => {
    const src = data(px(10, 20, 30, 200), 7);
    expect(blendPixels(src, data(0))).toBe(src);
  });

  it("yields the src colour when src is fully opaque (a=255)", () => {
    const result = blendPixels(
      data(px(255, 0, 0, 255)),
      data(px(0, 0, 255, 255)),
    );
    expect(result.color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("leaves the dst colour intact when src alpha is 0 but src is not the sentinel", () => {
    // NOT the `src.color === 0` early return: this src is a real Pixel object
    // whose alpha happens to be 0, so it goes through the Porter-Duff path.
    const result = blendPixels(
      data(px(255, 255, 255, 0)),
      data(px(10, 20, 30, 255)),
    );
    expect(result.color).toEqual({ r: 10, g: 20, b: 30, a: 255 });
  });

  it("composites a 50%-alpha src over an opaque dst (Porter-Duff over)", () => {
    // srcAlpha = 128/255 ≈ 0.50196, dstAlpha = 1, outAlpha = 1.
    // r = 255*0.50196 + 0*1*(1-0.50196) = 128.0 -> 128
    // b = 0*0.50196   + 255*1*(1-0.50196) = 127.0 -> 127
    const result = blendPixels(
      data(px(255, 0, 0, 128)),
      data(px(0, 0, 255, 255)),
    );
    expect(result.color).toEqual({ r: 128, g: 0, b: 127, a: 255 });
  });

  it("returns fully transparent black when the composited alpha rounds below 0.01", () => {
    const result = blendPixels(data(px(255, 0, 0, 1)), data(px(0, 255, 0, 1)));
    expect(result.color).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("takes the topmost non-zero normal and height", () => {
    const src: PixelData = {
      color: px(255, 0, 0, 255),
      normal: 0,
      height: 0,
    };
    const dst: PixelData = {
      color: px(0, 0, 255, 255),
      normal: { x: 1, y: 2, z: 3 },
      height: 42,
    };
    const result = blendPixels(src, dst);
    // src's normal/height are 0, so dst's survive.
    expect(result.normal).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.height).toBe(42);

    const srcWithData: PixelData = {
      color: px(255, 0, 0, 255),
      normal: { x: 9, y: 9, z: 9 },
      height: 5,
    };
    const result2 = blendPixels(srcWithData, dst);
    expect(result2.normal).toEqual({ x: 9, y: 9, z: 9 });
    expect(result2.height).toBe(5);
  });
});
