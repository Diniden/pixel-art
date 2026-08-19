/**
 * Tests for the 4-level variant-offset fallback.
 *
 * Task 08 tested all four levels in priority order against the copies that
 * lived in `Canvas.tsx`; this pins the single extracted implementation that
 * replaced them.
 */
import { describe, expect, it } from "vitest";
import { resolveVariantOffset } from "@/ui/canvas/model/variantOffset";

const variant = (baseFrameOffsets?: unknown) =>
  ({ baseFrameOffsets }) as Parameters<typeof resolveVariantOffset>[1];

describe("resolveVariantOffset — the four levels in priority order", () => {
  it("level 1 — variantOffsets[selectedVariantId] beats everything below", () => {
    const offset = resolveVariantOffset(
      {
        selectedVariantId: "v1",
        variantOffsets: { v1: { x: 1, y: 2 } },
        variantOffset: { x: 9, y: 9 },
      },
      variant([{ x: 8, y: 8 }]),
      0,
    );
    expect(offset).toEqual({ x: 1, y: 2 });
  });

  it("level 2 — the legacy variantOffset when the map has no entry", () => {
    const offset = resolveVariantOffset(
      { selectedVariantId: "v1", variantOffsets: {}, variantOffset: { x: 3, y: 4 } },
      variant([{ x: 8, y: 8 }]),
      0,
    );
    expect(offset).toEqual({ x: 3, y: 4 });
  });

  it("level 3 — baseFrameOffsets[baseFrameIndex] when 1 and 2 are absent", () => {
    const offset = resolveVariantOffset(
      { selectedVariantId: "v1" },
      variant([{ x: 5, y: 6 }, { x: 7, y: 8 }]),
      1,
    );
    expect(offset).toEqual({ x: 7, y: 8 });
  });

  it("level 4 — the zero offset when nothing resolves", () => {
    expect(resolveVariantOffset({}, variant(undefined), 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("the `??` semantics — falsy is NOT the same as absent", () => {
  it("a ZERO offset at level 1 still WINS over a non-zero level 3", () => {
    // The rule uses ??, not ||. An explicit {0,0} is a real answer, and
    // treating it as "unset" would silently move the layer.
    const offset = resolveVariantOffset(
      { selectedVariantId: "v1", variantOffsets: { v1: { x: 0, y: 0 } } },
      variant([{ x: 5, y: 5 }]),
      0,
    );
    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it("a ZERO legacy offset wins over level 3 too", () => {
    const offset = resolveVariantOffset(
      { variantOffset: { x: 0, y: 0 } },
      variant([{ x: 5, y: 5 }]),
      0,
    );
    expect(offset).toEqual({ x: 0, y: 0 });
  });
});

describe("edge cases the original copies had, preserved", () => {
  it('probes the "" key when the layer has no selected variant', () => {
    // `selectedVariantId ?? ""` — a layer with nothing selected does NOT skip
    // level 1, it looks up the empty-string key. Odd, but observed.
    const offset = resolveVariantOffset(
      { variantOffsets: { "": { x: 4, y: 4 } } },
      variant([{ x: 1, y: 1 }]),
      0,
    );
    expect(offset).toEqual({ x: 4, y: 4 });
  });

  it("falls through when the map has no entry for the selected variant", () => {
    const offset = resolveVariantOffset(
      { selectedVariantId: "missing", variantOffsets: { other: { x: 1, y: 1 } } },
      variant([{ x: 2, y: 2 }]),
      0,
    );
    expect(offset).toEqual({ x: 2, y: 2 });
  });

  it("a baseFrameIndex of -1 (frame not found) falls through to zero", () => {
    // Callers pass `frames.findIndex(...)`, which is -1 on a miss. The lookup
    // misses and level 4 answers — the same as the originals did.
    expect(
      resolveVariantOffset({}, variant([{ x: 5, y: 5 }]), -1),
    ).toEqual({ x: 0, y: 0 });
  });

  it("an index past the end of baseFrameOffsets falls through to zero", () => {
    expect(
      resolveVariantOffset({}, variant([{ x: 5, y: 5 }]), 9),
    ).toEqual({ x: 0, y: 0 });
  });

  it("returns a FRESH zero object each time — callers may mutate it", () => {
    const a = resolveVariantOffset({}, variant(undefined), 0);
    const b = resolveVariantOffset({}, variant(undefined), 0);
    expect(a).not.toBe(b);
    a.x = 99;
    expect(b.x).toBe(0);
  });

  it("supports baseFrameOffsets as a sparse keyed object, not just an array", () => {
    const offset = resolveVariantOffset({}, variant({ 3: { x: 7, y: 7 } }), 3);
    expect(offset).toEqual({ x: 7, y: 7 });
  });
});
