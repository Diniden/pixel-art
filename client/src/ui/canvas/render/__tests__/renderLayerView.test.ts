/**
 * Tests for `drawLayerView` — the Layer Render Mode painter (task 04).
 *
 * Asserted structurally via the recorded `fillRect` calls on the stub context
 * (one call per painted cell), plus the fill style in effect at each call.
 * The stub DOES rasterise `fillRect`, but call-level assertions localise a
 * failure to a cell far better than a hash would.
 */
import { describe, expect, it } from "vitest";
import { drawLayerView } from "@/ui/canvas/render/renderLayerView";
import type { LayerViewLayer } from "@/ui/canvas/render/renderLayerView";
import { createStubContext } from "@/test/canvasStub";
import { getPixelColor, grid, RED, BLUE, HALF_WHITE } from "./fixtures";

interface Fill {
  x: number;
  y: number;
  w: number;
  h: number;
  style: unknown;
}

/** Run the painter and return every fillRect with the style in effect. */
function paint(
  opts: Omit<Parameters<typeof drawLayerView>[1], "getPixelColor" | "zoom"> & {
    zoom?: number;
  },
): Fill[] {
  const ctx = createStubContext(64, 64);
  const fills: Fill[] = [];
  const realFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = (x, y, w, h) => {
    fills.push({ x, y, w, h, style: ctx.fillStyle });
    realFillRect(x, y, w, h);
  };
  drawLayerView(ctx as never, {
    zoom: 10,
    getPixelColor,
    ...opts,
  });
  return fills;
}

const layer = (
  rows: string[],
  over: Partial<LayerViewLayer> = {},
): LayerViewLayer => ({
  visible: true,
  pixels: grid(rows, { R: RED, B: BLUE, H: HALF_WHITE }),
  ...over,
});

describe("drawLayerView", () => {
  it("paints each opaque cell as one zoom-sized fillRect at x*zoom, y*zoom", () => {
    const fills = paint({
      layers: [layer(["R.", ".B"])],
      gridWidth: 2,
      gridHeight: 2,
    });
    expect(fills).toEqual([
      { x: 0, y: 0, w: 10, h: 10, style: "rgba(255, 0, 0, 1)" },
      { x: 10, y: 10, w: 10, h: 10, style: "rgba(0, 0, 255, 1)" },
    ]);
  });

  it("paints only visible layers, in array order (bottom → top)", () => {
    const fills = paint({
      layers: [
        layer(["R"], { id: "bottom" }),
        layer(["B"], { id: "hidden", visible: false }),
        layer(["H"], { id: "top" }),
      ],
      gridWidth: 1,
      gridHeight: 1,
    });
    expect(fills.map((f) => f.style)).toEqual([
      "rgba(255, 0, 0, 1)",
      `rgba(255, 255, 255, ${128 / 255})`,
    ]);
  });

  it("respects gridWidth/gridHeight — a 4-wide row on a 3×3 grid paints 3 cells", () => {
    const fills = paint({
      layers: [layer(["RRRR", "RRRR", "RRRR", "RRRR"])],
      gridWidth: 3,
      gridHeight: 3,
    });
    expect(fills).toHaveLength(9);
    expect(fills.every((f) => f.x <= 20 && f.y <= 20)).toBe(true);
  });

  it("skips rows beyond pixels.length", () => {
    const fills = paint({
      layers: [layer(["RR"])],
      gridWidth: 2,
      gridHeight: 4,
    });
    expect(fills).toHaveLength(2);
    expect(fills.every((f) => f.y === 0)).toBe(true);
  });

  it("produces no fillRect for transparent, empty or null cells", () => {
    const fills = paint({
      layers: [
        {
          visible: true,
          pixels: [[0, undefined, null, { color: { r: 1, g: 2, b: 3, a: 0 } }]],
        },
      ],
      gridWidth: 4,
      gridHeight: 1,
    });
    expect(fills).toHaveLength(0);
  });

  it("tolerates a layer with no pixels", () => {
    const fills = paint({
      layers: [{ visible: true }],
      gridWidth: 2,
      gridHeight: 2,
    });
    expect(fills).toHaveLength(0);
  });

  it("moveDx shifts ONLY the layer the predicate selects", () => {
    const fills = paint({
      layers: [
        layer(["R.."], { id: "moving" }),
        layer(["B.."], { id: "still" }),
      ],
      gridWidth: 3,
      gridHeight: 1,
      moveDx: 1,
      moveDy: 0,
      movesWithDrag: (l) => l.id === "moving",
    });
    expect(fills.map((f) => [f.x, f.y, f.style])).toEqual([
      [10, 0, "rgba(255, 0, 0, 1)"],
      [0, 0, "rgba(0, 0, 255, 1)"],
    ]);
  });

  it("drops cells the drag shifts off the grid", () => {
    const fills = paint({
      layers: [layer(["RR", "RR"])],
      gridWidth: 2,
      gridHeight: 2,
      moveDx: -1,
      moveDy: 1,
      movesWithDrag: () => true,
    });
    // Only (1,0) survives: it lands on (0,1).
    expect(fills.map((f) => [f.x, f.y])).toEqual([[0, 10]]);
  });

  it("ignores moveDx/moveDy when no predicate is given", () => {
    const fills = paint({
      layers: [layer(["R"])],
      gridWidth: 1,
      gridHeight: 1,
      moveDx: 5,
      moveDy: 5,
    });
    expect(fills.map((f) => [f.x, f.y])).toEqual([[0, 0]]);
  });

  it("never applies an offset or dims — a cell at (x,y) lands at exactly (x*zoom, y*zoom) at full alpha", () => {
    const fills = paint({
      layers: [layer(["..", ".R"])],
      gridWidth: 2,
      gridHeight: 2,
      zoom: 7,
    });
    expect(fills).toEqual([
      { x: 7, y: 7, w: 7, h: 7, style: "rgba(255, 0, 0, 1)" },
    ]);
  });
});
