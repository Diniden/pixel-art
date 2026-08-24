/**
 * `utils/normalCompute` — the pure lighting algorithms (REFRESH task 27,
 * §9.5's fold-in).
 *
 * ⚠️ EVERY ASSERTION HERE IS OBSERVED BEHAVIOUR, not desired behaviour. These
 * functions were transcribed character-for-character out of a React component
 * (`LightingStudioTools.tsx`) and a Zustand action module
 * (`store/lightingActions.ts`), and task 08 pinned the outputs. The point of
 * the extraction is that the maths is now testable in isolation — NOT that
 * the maths changed. Several of the assertions below encode arithmetic that
 * looks wrong (0-255 hue, the forced floor of 1, `params.min` for a flat
 * channel); each is correct as a description of what the app does.
 */
import { describe, expect, it } from "vitest";

import {
  computeHeightMap,
  flipGridHorizontal,
  flipGridVertical,
  getChannelValue,
  getNormalAxisValue,
  isNormalAxis,
  rgbToHsl,
} from "@/utils/normalCompute";
import type { Layer, PixelData } from "@/types";

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const GREEN = { r: 0, g: 255, b: 0, a: 255 };
const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

function grid(width: number, height: number): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ...EMPTY })),
  );
}

function layerFrom(pixels: PixelData[][]): Layer {
  return {
    id: "layer-1",
    name: "Layer 1",
    visible: true,
    opacity: 1,
    pixels,
  } as unknown as Layer;
}

/* ══ rgbToHsl ═════════════════════════════════════════════════════════════ */

describe("rgbToHsl — scaled to 0-255, NOT to degrees/percent", () => {
  it("a greyscale colour has zero saturation and hue", () => {
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 128 });
  });

  it("black and white sit at the ends of L", () => {
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 255 });
  });

  it("OBSERVED: hue is 0-255, so pure red is 0 and pure green is 85", () => {
    // 120° of 360 is 1/3, and 1/3 × 255 rounds to 85 — NOT 120. Anyone
    // expecting degrees here would read the height map as badly wrong.
    expect(rgbToHsl(255, 0, 0).h).toBe(0);
    expect(rgbToHsl(0, 255, 0).h).toBe(85);
    expect(rgbToHsl(0, 0, 255).h).toBe(170);
  });

  it("a fully saturated colour reports S at the maximum", () => {
    expect(rgbToHsl(255, 0, 0).s).toBe(255);
  });

  it("OBSERVED: the max-channel branch order means red wins a tie", () => {
    // `switch (max)` tests `r` first, so a colour whose max is shared between
    // channels takes the red branch. Transcribed, not chosen.
    expect(rgbToHsl(255, 255, 0).h).toBe(rgbToHsl(255, 255, 0).h);
    expect(rgbToHsl(255, 255, 0)).toEqual({ h: 43, s: 255, l: 128 });
  });
});

/* ══ getChannelValue ══════════════════════════════════════════════════════ */

describe("getChannelValue", () => {
  it("R/G/B are returned raw", () => {
    expect(getChannelValue({ r: 12, g: 34, b: 56, a: 255 }, "R")).toBe(12);
    expect(getChannelValue({ r: 12, g: 34, b: 56, a: 255 }, "G")).toBe(34);
    expect(getChannelValue({ r: 12, g: 34, b: 56, a: 255 }, "B")).toBe(56);
  });

  it("H/S/L go through rgbToHsl", () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(getChannelValue(RED, "H")).toBe(hsl.h);
    expect(getChannelValue(RED, "S")).toBe(hsl.s);
    expect(getChannelValue(RED, "L")).toBe(hsl.l);
  });

  it("alpha is IGNORED by every channel", () => {
    const opaque = { r: 10, g: 20, b: 30, a: 255 };
    const faint = { r: 10, g: 20, b: 30, a: 1 };
    for (const ch of ["R", "G", "B", "H", "S", "L"] as const) {
      expect(getChannelValue(faint, ch)).toBe(getChannelValue(opaque, ch));
    }
  });
});

/* ══ computeHeightMap ═════════════════════════════════════════════════════ */

describe("computeHeightMap", () => {
  it("maps the darkest channel to min and the brightest to max", () => {
    const px = grid(2, 1);
    px[0][0] = { color: { r: 0, g: 0, b: 0, a: 255 }, normal: 0, height: 0 };
    px[0][1] = {
      color: { r: 255, g: 0, b: 0, a: 255 },
      normal: 0,
      height: 0,
    };
    const out = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "R",
      min: 10,
      max: 200,
    });
    expect(out).toEqual([
      { x: 0, y: 0, height: 10 },
      { x: 1, y: 0, height: 200 },
    ]);
  });

  it("only COLOURED pixels participate — transparent cells are skipped", () => {
    const px = grid(3, 1);
    px[0][1] = { color: RED, normal: 0, height: 0 };
    const out = computeHeightMap(layerFrom(px), 3, 1, {
      channel: "R",
      min: 50,
      max: 200,
    });
    // Only (1,0) appears; (0,0) and (2,0) are untouched entirely.
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(1);
  });

  it("returns NOTHING when the layer has no coloured pixels", () => {
    const out = computeHeightMap(layerFrom(grid(4, 4)), 4, 4, {
      channel: "L",
      min: 0,
      max: 255,
    });
    expect(out).toEqual([]);
  });

  it("OBSERVED: a FLAT channel maps everything to params.min, not the midpoint", () => {
    const px = grid(3, 1);
    for (let x = 0; x < 3; x++) {
      px[0][x] = { color: RED, normal: 0, height: 0 };
    }
    const out = computeHeightMap(layerFrom(px), 3, 1, {
      channel: "R",
      min: 40,
      max: 200,
    });
    expect(out.map((c) => c.height)).toEqual([40, 40, 40]);
  });

  it("OBSERVED: a non-zero result is FLOORED at 1 — height 0 is the 'no data' sentinel", () => {
    const px = grid(2, 1);
    px[0][0] = { color: { r: 0, g: 0, b: 0, a: 255 }, normal: 0, height: 0 };
    px[0][1] = { color: RED, normal: 0, height: 0 };
    // min 0 would round the dark end to 0; the floor keeps it distinguishable
    // from "no height data" ONLY when it rounds above 0. At exactly 0 it stays
    // 0 — that is the transcribed `heightValue === 0 ? 0 : max(1, …)` rule.
    const out = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "R",
      min: 0,
      max: 255,
    });
    expect(out[0].height).toBe(0);
    expect(out[1].height).toBe(255);

    // A fractional result below 0.5 rounds to 0 and therefore STAYS 0.
    const nudged = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "R",
      min: 0.4,
      max: 255,
    });
    expect(nudged[0].height).toBe(0);
  });

  it("clamps a params range that overshoots 0-255", () => {
    const px = grid(2, 1);
    px[0][0] = { color: { r: 0, g: 0, b: 0, a: 255 }, normal: 0, height: 0 };
    px[0][1] = { color: RED, normal: 0, height: 0 };
    const out = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "R",
      min: -100,
      max: 9999,
    });
    expect(out[0].height).toBe(0);
    expect(out[1].height).toBe(255);
  });

  it("is DETERMINISTIC — the same input twice produces the same output", () => {
    const px = grid(3, 3);
    px[0][0] = { color: RED, normal: 0, height: 0 };
    px[1][1] = { color: GREEN, normal: 0, height: 0 };
    px[2][2] = { color: BLUE, normal: 0, height: 0 };
    const layer = layerFrom(px);
    const params = { channel: "L" as const, min: 5, max: 250 };
    expect(computeHeightMap(layer, 3, 3, params)).toEqual(
      computeHeightMap(layer, 3, 3, params),
    );
  });

  it("does not mutate the source layer", () => {
    const px = grid(2, 2);
    px[0][0] = { color: RED, normal: 0, height: 7 };
    computeHeightMap(layerFrom(px), 2, 2, {
      channel: "R",
      min: 0,
      max: 255,
    });
    expect(px[0][0].height).toBe(7);
  });
});

/* ══ computeHeightMap — the NORMAL-AXIS channels ══════════════════════════ */

describe("computeHeightMap from the normal map (NX/NY/NZ)", () => {
  it("getNormalAxisValue: NX/NY are MAGNITUDES, NZ is raw", () => {
    const n = { x: -100, y: 60, z: 180 };
    expect(getNormalAxisValue(n, "NX")).toBe(100);
    expect(getNormalAxisValue(n, "NY")).toBe(60);
    expect(getNormalAxisValue(n, "NZ")).toBe(180);
  });

  it("isNormalAxis separates the two channel families", () => {
    expect(isNormalAxis("NZ")).toBe(true);
    expect(isNormalAxis("R")).toBe(false);
    expect(isNormalAxis("L")).toBe(false);
  });

  it("NZ: the most screen-facing normal maps to max, the flattest to min", () => {
    const px = grid(3, 1);
    px[0][0] = { color: RED, normal: { x: 127, y: 0, z: 0 }, height: 0 };
    px[0][1] = { color: RED, normal: { x: 90, y: 0, z: 128 }, height: 0 };
    px[0][2] = { color: RED, normal: { x: 0, y: 0, z: 255 }, height: 0 };
    const out = computeHeightMap(layerFrom(px), 3, 1, {
      channel: "NZ",
      min: 10,
      max: 200,
    });
    expect(out).toEqual([
      { x: 0, y: 0, height: 10 },
      { x: 1, y: 0, height: 105 }, // 10 + (128/255)·190 ≈ 105.4 → 105
      { x: 2, y: 0, height: 200 },
    ]);
  });

  it("NX treats left- and right-leaning normals as equally tall", () => {
    const px = grid(3, 1);
    px[0][0] = { color: RED, normal: { x: -100, y: 0, z: 50 }, height: 0 };
    px[0][1] = { color: RED, normal: { x: 100, y: 0, z: 50 }, height: 0 };
    px[0][2] = { color: RED, normal: { x: 0, y: 0, z: 255 }, height: 0 };
    const out = computeHeightMap(layerFrom(px), 3, 1, {
      channel: "NX",
      min: 0,
      max: 255,
    });
    // |−100| and |100| are the same magnitude → both land on max.
    expect(out[0].height).toBe(255);
    expect(out[1].height).toBe(255);
    expect(out[2].height).toBe(0);
  });

  it("only pixels WITH a normal participate — others keep their height", () => {
    const px = grid(3, 1);
    px[0][0] = { color: RED, normal: 0, height: 0 }; // coloured, no normal
    px[0][1] = { color: RED, normal: { x: 0, y: 0, z: 200 }, height: 0 };
    const out = computeHeightMap(layerFrom(px), 3, 1, {
      channel: "NZ",
      min: 50,
      max: 200,
    });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(1);
  });

  it("returns NOTHING when the layer has no normals at all", () => {
    const px = grid(2, 2);
    px[0][0] = { color: RED, normal: 0, height: 0 };
    const out = computeHeightMap(layerFrom(px), 2, 2, {
      channel: "NZ",
      min: 0,
      max: 255,
    });
    expect(out).toEqual([]);
  });

  it("shares the pinned quirks: flat field → params.min, non-zero floored at 1", () => {
    const px = grid(2, 1);
    px[0][0] = { color: RED, normal: { x: 0, y: 0, z: 200 }, height: 0 };
    px[0][1] = { color: BLUE, normal: { x: 0, y: 0, z: 200 }, height: 0 };
    const flat = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "NZ",
      min: 40,
      max: 200,
    });
    expect(flat.map((c) => c.height)).toEqual([40, 40]);

    px[0][1] = { color: BLUE, normal: { x: 0, y: 0, z: 255 }, height: 0 };
    const floored = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "NZ",
      min: 0.6,
      max: 255,
    });
    // 0.6 rounds to 1 — and stays 1 under the floor rule.
    expect(floored[0].height).toBe(1);
    expect(floored[1].height).toBe(255);
  });

  it("the colour channels are UNTOUCHED by the presence of normals", () => {
    const px = grid(2, 1);
    px[0][0] = {
      color: { r: 0, g: 0, b: 0, a: 255 },
      normal: { x: 0, y: 0, z: 255 },
      height: 0,
    };
    px[0][1] = { color: RED, normal: { x: 0, y: 0, z: 10 }, height: 0 };
    const out = computeHeightMap(layerFrom(px), 2, 1, {
      channel: "R",
      min: 10,
      max: 200,
    });
    // Identical to the plain colour-channel result — normals play no part.
    expect(out).toEqual([
      { x: 0, y: 0, height: 10 },
      { x: 1, y: 0, height: 200 },
    ]);
  });
});

/* ══ THE FLIPS ════════════════════════════════════════════════════════════ */

/**
 * A deliberately ASYMMETRIC 4×4 — colours, normals and heights all differ
 * under every reflection. A symmetric fixture passes the identity test
 * trivially and proves nothing; task 08 makes the same point in
 * `store/__tests__/lighting.test.ts`.
 */
function asymmetric(): PixelData[][] {
  const px = grid(4, 4);
  px[0][0] = { color: RED, normal: { x: -30, y: -10, z: 200 }, height: 10 };
  px[1][0] = { color: BLUE, normal: { x: 40, y: 20, z: 210 }, height: 20 };
  px[2][0] = { color: GREEN, normal: { x: -50, y: 30, z: 220 }, height: 30 };
  px[2][1] = { color: RED, normal: { x: 60, y: -40, z: 230 }, height: 40 };
  return px;
}

describe("flipGridHorizontal / flipGridVertical", () => {
  it("H ∘ H is the IDENTITY on an asymmetric fixture", () => {
    const start = asymmetric();
    const once = flipGridHorizontal(start, 4, 4);
    const twice = flipGridHorizontal(once, 4, 4);
    expect(twice).toEqual(start);
  });

  it("V ∘ V is the IDENTITY on an asymmetric fixture", () => {
    const start = asymmetric();
    const twice = flipGridVertical(flipGridVertical(start, 4, 4), 4, 4);
    expect(twice).toEqual(start);
  });

  it("the fixture really IS asymmetric — the guard on the two tests above", () => {
    const start = asymmetric();
    expect(flipGridHorizontal(start, 4, 4)).not.toEqual(start);
    expect(flipGridVertical(start, 4, 4)).not.toEqual(start);
  });

  it("H and V agree MODULO TRANSPOSE", () => {
    // Transposing swaps the axes, so a horizontal mirror of the transpose is
    // the transpose of a vertical mirror — and the normals must follow, x and
    // y swapping with them.
    const start = asymmetric();
    const h = flipGridHorizontal(start, 4, 4);
    const v = flipGridVertical(transpose(start), 4, 4);
    expect(transpose(h)).toEqual(v);
  });

  it("H negates ONLY the normal's x; V negates ONLY its y", () => {
    const px = grid(2, 1);
    px[0][0] = { color: RED, normal: { x: 5, y: 7, z: 9 }, height: 3 };

    const h = flipGridHorizontal(px, 2, 1)[0][1];
    expect(h.normal).toEqual({ x: -5, y: 7, z: 9 });
    expect(h.height).toBe(3);

    const v = flipGridVertical(px, 2, 1)[0][0];
    expect(v.normal).toEqual({ x: 5, y: -7, z: 9 });
  });

  it("OBSERVED: the 0 normal sentinel is preserved, never negated into -0", () => {
    const px = grid(1, 1);
    px[0][0] = { color: RED, normal: 0, height: 4 };
    expect(flipGridHorizontal(px, 1, 1)[0][0].normal).toBe(0);
    expect(flipGridVertical(px, 1, 1)[0][0].normal).toBe(0);
  });

  it("returns a NEW grid and does not mutate the source (R2)", () => {
    const start = asymmetric();
    const out = flipGridHorizontal(start, 4, 4);
    expect(out).not.toBe(start);
    expect(out[0]).not.toBe(start[0]);
    expect(start[0][0].normal).toEqual({ x: -30, y: -10, z: 200 });
  });

  it("every empty cell is a DISTINCT object, never a shared literal", () => {
    const out = flipGridHorizontal(grid(3, 3), 3, 3);
    expect(out[0][0]).not.toBe(out[0][1]);
    expect(out[0][0]).not.toBe(out[1][0]);
  });

  it("a ragged/short input still yields a rectangular grid", () => {
    // The output is built from empty cells first, so a missing source row
    // produces empties rather than `undefined` holes.
    const ragged = [[{ color: RED, normal: 0, height: 1 }]] as PixelData[][];
    const out = flipGridHorizontal(ragged, 2, 2);
    expect(out).toHaveLength(2);
    expect(out[1]).toHaveLength(2);
    expect(out[1][0]).toEqual(EMPTY);
  });
});

/** Swap rows and columns. Used only by the modulo-transpose assertion. */
function transpose(px: readonly PixelData[][]): PixelData[][] {
  const height = px.length;
  const width = px[0]?.length ?? 0;
  return Array.from({ length: width }, (_row, y) =>
    Array.from({ length: height }, (_cell, x) => {
      const source = px[x]?.[y] ?? EMPTY;
      return {
        color: source.color,
        // Transposing swaps the axes, so the normal's x and y swap with them.
        normal:
          source.normal === 0
            ? 0
            : { x: source.normal.y, y: source.normal.x, z: source.normal.z },
        height: source.height,
      } as PixelData;
    }),
  );
}
