/**
 * Characterisation tests for `utils/previewRenderer.ts`.
 *
 * This module is the reference implementation for ~8 duplicated pixel-blit
 * loops, and `getCheckerboard` (:12) is one of 4 checkerboard implementations.
 * Task 30 unifies them; these hashes are the equivalence proof.
 *
 * The renderers take a `CanvasRenderingContext2D` but only ever touch
 * `imageSmoothingEnabled`, `createImageData` and `putImageData` — all three of
 * which `canvasStub`'s `createStubContext` rasterises exactly. No jsdom, no
 * native canvas dependency: this file runs in the fast `unit` project.
 *
 * Every hash was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  renderFramePreview,
  renderLayerPreview,
  renderVariantFramePreview,
  renderVariantLayerPreview,
} from "@/utils/previewRenderer";
import { createStubContext, hashBuffer } from "@test/canvasStub";
import type { Frame, Layer, PixelData, Variant, VariantGroup } from "@/types";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const E = (): PixelData => ({ color: 0, normal: 0, height: 0 });
const px = (r: number, g: number, b: number, a = 255): PixelData => ({
  color: { r, g, b, a },
  normal: 0,
  height: 0,
});

function mkLayer(
  id: string,
  w: number,
  h: number,
  fill: (x: number, y: number) => PixelData,
  visible = true,
): Layer {
  return {
    id,
    name: id,
    visible,
    pixels: Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => fill(x, y)),
    ),
  };
}

/** Opaque red on the main diagonal of a 4×4. */
const DIAGONAL = mkLayer("diag", 4, 4, (x, y) =>
  x === y ? px(255, 0, 0) : E(),
);
/** Half-alpha green in the bottom-right 2×2 quadrant — forces real compositing. */
const QUADRANT = mkLayer("quad", 4, 4, (x, y) =>
  x >= 2 && y >= 2 ? px(0, 255, 0, 128) : E(),
);

const FRAME: Frame = { id: "f1", name: "f1", layers: [DIAGONAL, QUADRANT] };

/** The 16×16 hash produced when only the checkerboard is drawn. */
const CHECKERBOARD_ONLY_16 = "16x16:160a0385";

const ctxOf = (size: number) =>
  createStubContext(size, size) as unknown as CanvasRenderingContext2D & {
    buffer: import("@test/canvasStub").PixelBuffer;
  };

/* ────────────────────────────────────────────────────────────────────────── */
/* renderFramePreview                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderFramePreview", () => {
  it("hash tripwire — 4×4 fixture at scale 1", () => {
    const ctx = ctxOf(4);
    renderFramePreview(ctx, {
      thumbSize: 4,
      gridWidth: 4,
      gridHeight: 4,
      frame: FRAME,
    });
    expect(hashBuffer(ctx.buffer)).toBe("4x4:0b7192bd");
  });

  it("hash tripwire — 4×4 fixture at scale 2", () => {
    const ctx = ctxOf(8);
    renderFramePreview(ctx, {
      thumbSize: 8,
      gridWidth: 4,
      gridHeight: 4,
      frame: FRAME,
    });
    expect(hashBuffer(ctx.buffer)).toBe("8x8:06665865");
  });

  it("hash tripwire — 4×4 fixture at scale 8", () => {
    const ctx = ctxOf(32);
    renderFramePreview(ctx, {
      thumbSize: 32,
      gridWidth: 4,
      gridHeight: 4,
      frame: FRAME,
    });
    expect(hashBuffer(ctx.buffer)).toBe("32x32:8d982765");
  });

  it("EXCLUDES a hidden layer — output is identical to omitting it entirely", () => {
    const hidden = mkLayer(
      "quad",
      4,
      4,
      (x, y) => (x >= 2 && y >= 2 ? px(0, 255, 0, 128) : E()),
      false,
    );
    const withHidden = ctxOf(16);
    renderFramePreview(withHidden, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [DIAGONAL, hidden] },
    });

    const withoutIt = ctxOf(16);
    renderFramePreview(withoutIt, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [DIAGONAL] },
    });

    expect(hashBuffer(withHidden.buffer)).toBe(hashBuffer(withoutIt.buffer));
    expect(hashBuffer(withHidden.buffer)).toBe("16x16:5624c505");
  });

  it("an empty frame yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "e", name: "e", layers: [] },
    });
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("a zero-sized grid also yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 0,
      gridHeight: 0,
      frame: FRAME,
    });
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("disables image smoothing before drawing", () => {
    const ctx = ctxOf(16);
    ctx.imageSmoothingEnabled = true;
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: FRAME,
    });
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it("layer ORDER matters — the last layer composites on top", () => {
    const a = ctxOf(16);
    renderFramePreview(a, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [DIAGONAL, QUADRANT] },
    });
    const b = ctxOf(16);
    renderFramePreview(b, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [QUADRANT, DIAGONAL] },
    });
    // QUADRANT is half-alpha, so swapping the stack changes the composite.
    expect(hashBuffer(a.buffer)).not.toBe(hashBuffer(b.buffer));
  });

  it("does not mutate the frame it renders", () => {
    const before = JSON.stringify(FRAME);
    renderFramePreview(ctxOf(16), {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: FRAME,
    });
    expect(JSON.stringify(FRAME)).toBe(before);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Variant offsets — the 4-level fallback chain, as this module implements it  */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderFramePreview — variant offset resolution", () => {
  const variantLayer = mkLayer("v", 2, 2, () => px(0, 0, 255));
  const variant: Variant = {
    id: "v1",
    name: "v1",
    gridSize: { width: 2, height: 2 },
    frames: [{ id: "vf", layers: [variantLayer] }],
    baseFrameOffsets: { 0: { x: 0, y: 0 } },
  };
  const variants: VariantGroup[] = [
    { id: "vg1", name: "vg", variants: [variant] },
  ];
  const host: Layer = {
    id: "vh",
    name: "vh",
    visible: true,
    pixels: [],
    isVariant: true,
    variantGroupId: "vg1",
    selectedVariantId: "v1",
  };

  const render = (layer: Layer, frameIndex = 0) => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [layer] },
      frameIndex,
      variants,
      variantFrameIndices: { vg1: 0 },
    });
    return hashBuffer(ctx.buffer);
  };

  it("hash tripwire — variant at the default {0,0} offset", () => {
    expect(render(host)).toBe("16x16:60ea63c5");
  });

  it("APPLIES the offset — a shifted variant produces a different buffer", () => {
    const shifted = render({
      ...host,
      variantOffsets: { v1: { x: 2, y: 2 } },
    });
    expect(shifted).toBe("16x16:4af3cbc5");
    expect(shifted).not.toBe(render(host));
  });

  it("level 1 (variantOffsets[selectedVariantId]) beats level 2 (variantOffset)", () => {
    const both = render({
      ...host,
      variantOffsets: { v1: { x: 2, y: 2 } },
      variantOffset: { x: 0, y: 0 },
    });
    // Same as level-1-only, NOT the same as the {0,0} render.
    expect(both).toBe("16x16:4af3cbc5");
  });

  it("level 2 (variantOffset) beats level 3 (baseFrameOffsets)", () => {
    const v: Variant = { ...variant, baseFrameOffsets: { 0: { x: 0, y: 0 } } };
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: {
        id: "f",
        name: "f",
        layers: [{ ...host, variantOffset: { x: 2, y: 2 } }],
      },
      frameIndex: 0,
      variants: [{ id: "vg1", name: "vg", variants: [v] }],
      variantFrameIndices: { vg1: 0 },
    });
    expect(hashBuffer(ctx.buffer)).toBe("16x16:4af3cbc5");
  });

  it("level 3 (baseFrameOffsets[frameIndex]) is used when 1 and 2 are absent", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [host] },
      frameIndex: 1,
      variants: [
        {
          id: "vg1",
          name: "vg",
          variants: [
            {
              ...variant,
              baseFrameOffsets: { 0: { x: 0, y: 0 }, 1: { x: 2, y: 2 } },
            },
          ],
        },
      ],
      variantFrameIndices: { vg1: 0 },
    });
    expect(hashBuffer(ctx.buffer)).toBe("16x16:4af3cbc5");
  });

  it("level 4 ({x:0,y:0}) when nothing else resolves", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [host] },
      frameIndex: 0,
      variants: [
        {
          id: "vg1",
          name: "vg",
          variants: [{ ...variant, baseFrameOffsets: {} }],
        },
      ],
      variantFrameIndices: { vg1: 0 },
    });
    expect(hashBuffer(ctx.buffer)).toBe("16x16:60ea63c5");
  });

  // DIVERGENCE — recorded, not fixed. `store/helpers.ts:75-77` clamps a
  // negative base-frame index to 0 (`baseFrameIndex >= 0 ? baseFrameIndex : 0`).
  // previewRenderer.ts:93 does NOT: it indexes `baseFrameOffsets?.[frameIndex]`
  // raw, so a caller passing a `findIndex` miss (-1) silently drops to {0,0}
  // instead of the frame-0 offset. Task 30 unifies; this pins today's split.
  it("DIVERGENCE from store/helpers.ts: does NOT clamp a negative frame index to 0", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [host] },
      frameIndex: -1,
      variants: [
        {
          id: "vg1",
          name: "vg",
          variants: [{ ...variant, baseFrameOffsets: { 0: { x: 2, y: 2 } } }],
        },
      ],
      variantFrameIndices: { vg1: 0 },
    });
    // Rendered at {0,0} (level 4), NOT at the frame-0 offset {2,2} that
    // helpers.ts would have used.
    expect(hashBuffer(ctx.buffer)).toBe("16x16:60ea63c5");
  });

  it("skips the variant entirely when `variants` or `variantFrameIndices` is missing", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 4,
      gridHeight: 4,
      frame: { id: "f", name: "f", layers: [host] },
    });
    // Neither the variant branch (needs both args) nor the regular branch
    // (guarded by `!layer.isVariant`) runs — checkerboard only.
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* renderVariantFramePreview / renderLayerPreview / renderVariantLayerPreview */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderVariantFramePreview", () => {
  const variantLayer = mkLayer("v", 2, 2, () => px(0, 0, 255));

  it("hash tripwire — a 2×2 blue variant frame into a 16×16 thumb", () => {
    const ctx = ctxOf(16);
    renderVariantFramePreview(
      ctx,
      16,
      { gridSize: { width: 2, height: 2 } },
      { id: "vf", layers: [variantLayer] },
    );
    expect(hashBuffer(ctx.buffer)).toBe("16x16:0a0d1e85");
  });

  it("a zero-sized variant grid yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderVariantFramePreview(
      ctx,
      16,
      { gridSize: { width: 0, height: 0 } },
      { id: "vf", layers: [variantLayer] },
    );
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("a variant frame with no layers yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderVariantFramePreview(
      ctx,
      16,
      { gridSize: { width: 2, height: 2 } },
      { id: "vf", layers: [] },
    );
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("skips hidden variant layers", () => {
    const hidden = mkLayer("v", 2, 2, () => px(0, 0, 255), false);
    const ctx = ctxOf(16);
    renderVariantFramePreview(
      ctx,
      16,
      { gridSize: { width: 2, height: 2 } },
      { id: "vf", layers: [hidden] },
    );
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });
});

describe("renderLayerPreview", () => {
  it("hash tripwire — scale 1", () => {
    const ctx = ctxOf(4);
    renderLayerPreview(ctx, 4, DIAGONAL, 4, 4);
    expect(hashBuffer(ctx.buffer)).toBe("4x4:32c8cbad");
  });

  it("hash tripwire — scale 2", () => {
    const ctx = ctxOf(8);
    renderLayerPreview(ctx, 8, DIAGONAL, 4, 4);
    expect(hashBuffer(ctx.buffer)).toBe("8x8:b8f93105");
  });

  it("hash tripwire — scale 8", () => {
    const ctx = ctxOf(32);
    renderLayerPreview(ctx, 32, DIAGONAL, 4, 4);
    expect(hashBuffer(ctx.buffer)).toBe("32x32:02e85165");
  });

  it("a zero-sized grid yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderLayerPreview(ctx, 16, DIAGONAL, 0, 0);
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("OBSERVED: renderLayerPreview does NOT honour layer.visible", () => {
    // Unlike renderFramePreview, this entry point calls `renderLayer` directly
    // and never consults `visible`. Recorded, not fixed.
    const hidden = { ...DIAGONAL, visible: false };
    const ctx = ctxOf(16);
    renderLayerPreview(ctx, 16, hidden, 4, 4);
    const shown = ctxOf(16);
    renderLayerPreview(shown, 16, DIAGONAL, 4, 4);
    expect(hashBuffer(ctx.buffer)).toBe(hashBuffer(shown.buffer));
    expect(hashBuffer(ctx.buffer)).not.toBe(CHECKERBOARD_ONLY_16);
  });
});

describe("renderVariantLayerPreview", () => {
  const variant: Variant = {
    id: "v1",
    name: "v1",
    gridSize: { width: 2, height: 2 },
    frames: [{ id: "vf", layers: [mkLayer("v", 2, 2, () => px(0, 0, 255))] }],
    baseFrameOffsets: {},
  };

  it("delegates to renderVariantFramePreview with the FIRST frame", () => {
    const a = ctxOf(16);
    renderVariantLayerPreview(a, 16, variant);
    const b = ctxOf(16);
    renderVariantFramePreview(b, 16, variant, variant.frames[0]);
    expect(hashBuffer(a.buffer)).toBe(hashBuffer(b.buffer));
    expect(hashBuffer(a.buffer)).toBe("16x16:0a0d1e85");
  });

  it("a variant with no frames yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderVariantLayerPreview(ctx, 16, { ...variant, frames: [] });
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });

  it("a zero-sized variant grid yields the checkerboard alone", () => {
    const ctx = ctxOf(16);
    renderVariantLayerPreview(ctx, 16, {
      ...variant,
      gridSize: { width: 0, height: 0 },
    });
    expect(hashBuffer(ctx.buffer)).toBe(CHECKERBOARD_ONLY_16);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* The checkerboard — one of 4 implementations in this codebase               */
/* ────────────────────────────────────────────────────────────────────────── */

describe("getCheckerboard (asserted through the public renderers)", () => {
  it("uses a 4-pixel check cell alternating #2a2a3a and #222230, fully opaque", () => {
    const ctx = ctxOf(16);
    renderFramePreview(ctx, {
      thumbSize: 16,
      gridWidth: 0,
      gridHeight: 0,
      frame: FRAME,
    });
    const at = (x: number, y: number) => {
      const i = (y * 16 + x) * 4;
      return [
        ctx.buffer.data[i],
        ctx.buffer.data[i + 1],
        ctx.buffer.data[i + 2],
        ctx.buffer.data[i + 3],
      ];
    };
    expect(at(0, 0)).toEqual([42, 42, 58, 255]);
    expect(at(3, 3)).toEqual([42, 42, 58, 255]);
    expect(at(4, 0)).toEqual([34, 34, 48, 255]);
    expect(at(0, 4)).toEqual([34, 34, 48, 255]);
    expect(at(4, 4)).toEqual([42, 42, 58, 255]);
  });

  it("is CACHED per size — repeated renders are byte-identical", () => {
    const a = ctxOf(16);
    renderFramePreview(a, {
      thumbSize: 16,
      gridWidth: 0,
      gridHeight: 0,
      frame: FRAME,
    });
    const b = ctxOf(16);
    renderFramePreview(b, {
      thumbSize: 16,
      gridWidth: 0,
      gridHeight: 0,
      frame: FRAME,
    });
    expect(hashBuffer(a.buffer)).toBe(hashBuffer(b.buffer));
  });
});
