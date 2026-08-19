/**
 * `traceSampler` — the reference/frame trace stamping path (task 31 step 5).
 *
 * These pin the three behaviours the four legacy copies shared and that a
 * parameterised implementation could plausibly get wrong: the alpha test, the
 * variant-space asymmetry (sample in object space, write in grid space), and
 * the "no visible samples ⇒ no write" guard that keeps an empty stroke out of
 * the undo history.
 */

import { describe, it, expect } from "vitest";
import {
  getCirclePixels,
  getLinePixels,
} from "../../../../components/Canvas/drawingUtils";
import { stampTrace } from "../traceSampler";
import type { TraceSample, TraceSamplerFn } from "../traceSampler";
import type { StampOptions } from "../brushStamp";

const OPAQUE: TraceSample = { r: 10, g: 20, b: 30, a: 255 };
const TRANSPARENT: TraceSample = { r: 10, g: 20, b: 30, a: 0 };

const GRID = { gridWidth: 16, gridHeight: 16 };

function opts(over: Partial<StampOptions> = {}): StampOptions {
  return {
    ...GRID,
    brushSize: 1,
    shape: getCirclePixels,
    shapeColor: OPAQUE,
    ...over,
  };
}

const NO_VARIANT = { editingVariant: false, variantOffset: { x: 0, y: 0 } };

describe("traceSampler", () => {
  it("emits the sampled colour at the stamped cell", () => {
    const out = stampTrace(
      null,
      { x: 4, y: 4 },
      getLinePixels,
      opts(),
      NO_VARIANT,
      () => OPAQUE,
    );
    expect(out).toEqual([{ x: 4, y: 4, color: OPAQUE }]);
  });

  it("SKIPS fully transparent samples — `a > 0` is the legacy test", () => {
    const out = stampTrace(
      null,
      { x: 4, y: 4 },
      getLinePixels,
      opts(),
      NO_VARIANT,
      () => TRANSPARENT,
    );
    expect(out).toEqual([]);
  });

  it("keeps a barely-visible sample (a === 1)", () => {
    const out = stampTrace(
      null,
      { x: 4, y: 4 },
      getLinePixels,
      opts(),
      NO_VARIANT,
      () => ({ ...OPAQUE, a: 1 }),
    );
    expect(out).toHaveLength(1);
  });

  it("SKIPS cells with no sample at all", () => {
    const out = stampTrace(
      null,
      { x: 4, y: 4 },
      getLinePixels,
      opts(),
      NO_VARIANT,
      () => null,
    );
    expect(out).toEqual([]);
  });

  it("returns an empty list when nothing sampled — the caller's `length > 0` guard stays meaningful", () => {
    const out = stampTrace(
      { x: 1, y: 1 },
      { x: 9, y: 9 },
      getLinePixels,
      opts({ brushSize: 3 }),
      NO_VARIANT,
      () => null,
    );
    expect(out).toEqual([]);
  });

  describe("variant space — sample in object space, write in grid space", () => {
    it("adds the variant offset before sampling but NOT to the emitted coordinate", () => {
      const seen: Array<[number, number]> = [];
      const sampler: TraceSamplerFn = (x, y) => {
        seen.push([x, y]);
        return OPAQUE;
      };

      const out = stampTrace(
        null,
        { x: 2, y: 3 },
        getLinePixels,
        opts(),
        { editingVariant: true, variantOffset: { x: 5, y: 7 } },
        sampler,
      );

      // Sampled at object space...
      expect(seen).toEqual([[7, 10]]);
      // ...but written back at the grid-local coordinate.
      expect(out).toEqual([{ x: 2, y: 3, color: OPAQUE }]);
    });

    it("does NOT convert when not editing a variant, even if an offset is present", () => {
      const seen: Array<[number, number]> = [];
      stampTrace(
        null,
        { x: 2, y: 3 },
        getLinePixels,
        opts(),
        { editingVariant: false, variantOffset: { x: 5, y: 7 } },
        (x, y) => {
          seen.push([x, y]);
          return OPAQUE;
        },
      );
      expect(seen).toEqual([[2, 3]]);
    });
  });

  it("stamps a whole drag segment, de-duplicated", () => {
    const out = stampTrace(
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      getLinePixels,
      opts({ brushSize: 3 }),
      NO_VARIANT,
      () => OPAQUE,
    );
    const keys = out.map((w) => `${w.x},${w.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(out.length).toBeGreaterThan(4);
  });

  it("never samples outside the editable grid", () => {
    const seen: Array<[number, number]> = [];
    stampTrace(
      null,
      { x: 0, y: 0 },
      getLinePixels,
      opts({ brushSize: 6 }),
      NO_VARIANT,
      (x, y) => {
        seen.push([x, y]);
        return OPAQUE;
      },
    );
    for (const [x, y] of seen) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(GRID.gridWidth);
      expect(y).toBeLessThan(GRID.gridHeight);
    }
  });

  it("agrees between the reference and frame sources given the same samples", () => {
    const args = [
      { x: 3, y: 3 },
      { x: 8, y: 6 },
    ] as const;
    const reference = stampTrace(
      args[0],
      args[1],
      getLinePixels,
      opts({ brushSize: 4 }),
      NO_VARIANT,
      () => OPAQUE,
    );
    const frame = stampTrace(
      args[0],
      args[1],
      getLinePixels,
      opts({ brushSize: 4 }),
      NO_VARIANT,
      () => OPAQUE,
    );
    expect(frame).toEqual(reference);
  });
});
