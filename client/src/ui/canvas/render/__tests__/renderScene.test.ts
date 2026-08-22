/**
 * Golden-hash tests for the main scene renderer.
 *
 * Render modes covered: **normal** and **variant-edit**.
 *
 * All of this is `fillRect`-equivalent buffer work, so it hashes exactly.
 *
 * Every hash was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  renderScene,
  paintPreviewPixels,
  VARIANT_EDIT_REGULAR_DIM,
  VARIANT_EDIT_OTHER_DIM,
  PREVIEW_ALPHA,
} from "@/ui/canvas/render/renderScene";
import type { RenderSceneOptions } from "@/ui/canvas/render/renderScene";
import { createBuffer, getPixel, hashBuffer } from "@/test/canvasStub";
import { DIAGONAL_4, VARIANT_2, getPixelColor, RED, GREEN } from "./fixtures";

const baseOpts = (
  over: Partial<RenderSceneOptions> = {},
): RenderSceneOptions => ({
  mode: "normal",
  layers: [{ id: "l1", visible: true, pixels: DIAGONAL_4 }],
  gridWidth: 4,
  gridHeight: 4,
  objWidth: 4,
  objHeight: 4,
  zoom: 4,
  viewMinX: 0,
  viewMinY: 0,
  viewMaxX: 4,
  viewMaxY: 4,
  variants: undefined,
  variantFrameIndices: undefined,
  baseFrameIndex: 0,
  currentLayerId: "l1",
  getPixelColor,
  ...over,
});

const render = (over: Partial<RenderSceneOptions> = {}, w = 16, h = 16) => {
  const buf = createBuffer(w, h);
  renderScene(buf, baseOpts(over));
  return buf;
};

describe("renderScene — NORMAL mode", () => {
  it("GOLDEN: a single 4×4 layer at zoom 4", () => {
    expect(hashBuffer(render())).toBe("16x16:14ebea65");
  });

  it("draws every layer at FULL opacity", () => {
    const buf = render();
    expect(getPixel(buf, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("skips hidden layers", () => {
    const buf = render({
      layers: [{ id: "l1", visible: false, pixels: DIAGONAL_4 }],
    });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("stacks layers in array order — later layers paint over earlier ones", () => {
    const buf = render({
      layers: [
        { id: "a", visible: true, pixels: [[{ color: RED }]] },
        { id: "b", visible: true, pixels: [[{ color: GREEN }]] },
      ],
      gridWidth: 1,
      gridHeight: 1,
    });
    expect(getPixel(buf, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("clips a cell whose ORIGIN falls outside the canvas", () => {
    // 8×8 buffer, 4 cells at zoom 4 = 16px of content: cells 2 and 3 are out.
    const buf = render({}, 8, 8);
    expect(getPixel(buf, 0, 0)).toEqual([255, 0, 0, 255]);
    // Cell (2,2) starts at (8,8) — outside an 8px buffer.
    expect(hashBuffer(buf)).toBe("8x8:89d295a5");
  });
});

describe("renderScene — VARIANT-EDIT mode", () => {
  const variantEdit = {
    mode: "variant-edit" as const,
    gridWidth: 2,
    gridHeight: 2,
    objWidth: 4,
    objHeight: 4,
    viewMinX: 0,
    viewMinY: 0,
    viewMaxX: 4,
    viewMaxY: 4,
  };

  it("GOLDEN: a regular layer dimmed to 0.5 behind the variant edit area", () => {
    expect(hashBuffer(render(variantEdit))).toBe("16x16:40a70a05");
  });

  it("DIMS a regular layer to 0.5 — normal mode does not", () => {
    const dimmed = getPixel(render(variantEdit), 0, 0);
    const full = getPixel(render(), 0, 0);
    expect(full).toEqual([255, 0, 0, 255]);
    // Red at 50% over an empty buffer: colour survives, alpha halves.
    expect(dimmed[3]).toBe(Math.round(255 * VARIANT_EDIT_REGULAR_DIM));
    expect(dimmed).not.toEqual(full);
  });

  it("walks the OBJECT bounds for regular layers, not the variant grid", () => {
    // gridWidth/Height are the VARIANT's 2×2; the object is 4×4. A cell at
    // (3,3) must still render — using the grid size would truncate it.
    const buf = render(variantEdit);
    expect(getPixel(buf, 12, 12)[3]).toBeGreaterThan(0);
  });

  const withVariant = {
    ...variantEdit,
    layers: [
      {
        id: "v-layer",
        visible: true,
        isVariant: true,
        variantGroupId: "vg1",
        selectedVariantId: "v1",
        pixels: undefined,
      },
    ],
    variants: [
      {
        id: "vg1",
        variants: [
          {
            id: "v1",
            gridSize: { width: 2, height: 2 },
            frames: [{ layers: [{ visible: true, pixels: VARIANT_2 }] }],
            baseFrameOffsets: [{ x: 0, y: 0 }],
          },
        ],
      },
    ],
    variantFrameIndices: { vg1: 0 },
  };

  it("draws the CURRENT variant layer at full opacity", () => {
    const buf = render({ ...withVariant, currentLayerId: "v-layer" });
    expect(getPixel(buf, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("DIMS a non-current variant layer to 0.7", () => {
    const buf = render({ ...withVariant, currentLayerId: "someone-else" });
    const [, , , a] = getPixel(buf, 0, 0);
    // OBSERVED 178, not 179. `255 * 0.7` is 178.5, and the value lands in a
    // `Uint8ClampedArray`, which rounds HALF-TO-EVEN — so it goes down, where
    // `Math.round` would go up. Pinning the observed byte, not the arithmetic
    // ideal: this is the number a real canvas produces.
    expect(VARIANT_EDIT_OTHER_DIM).toBe(0.7);
    expect(a).toBe(178);
  });

  it("clips on WORLD position against the view bounds, not the canvas", () => {
    // Push the variant fully outside the view: nothing should render.
    const buf = render({
      ...withVariant,
      currentLayerId: "v-layer",
      variants: [
        {
          id: "vg1",
          variants: [
            {
              id: "v1",
              gridSize: { width: 2, height: 2 },
              frames: [{ layers: [{ visible: true, pixels: VARIANT_2 }] }],
              baseFrameOffsets: [{ x: 10, y: 10 }],
            },
          ],
        },
      ],
    });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("folds the view origin into the draw position (the old ctx.translate)", () => {
    // viewMin (-1,-1) means world (-1,-1) lands at buffer (0,0).
    const buf = render({
      ...withVariant,
      currentLayerId: "v-layer",
      viewMinX: -1,
      viewMinY: -1,
      viewMaxX: 4,
      viewMaxY: 4,
    });
    // Variant cell (0,0) is world (0,0) -> buffer cell (1,1) -> px (4,4).
    expect(getPixel(buf, 4, 4)).toEqual([0, 255, 0, 255]);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("paintPreviewPixels", () => {
  const preview = (over = {}) => {
    const buf = createBuffer(16, 16);
    paintPreviewPixels(buf, {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      color: RED,
      gridWidth: 4,
      gridHeight: 4,
      zoom: 4,
      offsetX: 0,
      offsetY: 0,
      viewMinX: 0,
      viewMinY: 0,
      ...over,
    });
    return buf;
  };

  it("GOLDEN: two preview cells at 0.6 opacity", () => {
    expect(hashBuffer(preview())).toBe("16x16:77519a85");
  });

  it("draws the preview at PREVIEW_ALPHA, not full opacity", () => {
    const [, , , a] = getPixel(preview(), 0, 0);
    expect(a).toBe(Math.round(255 * PREVIEW_ALPHA));
  });

  it("drops points outside the editable grid", () => {
    const buf = preview({
      points: [
        { x: 9, y: 9 },
        { x: -1, y: 0 },
      ],
    });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("applies the variant offset AFTER the grid bounds test", () => {
    // (0,0) passes the bounds test, then shifts by the offset to cell (2,2).
    const buf = preview({ points: [{ x: 0, y: 0 }], offsetX: 2, offsetY: 2 });
    expect(getPixel(buf, 8, 8)[3]).toBeGreaterThan(0);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});
