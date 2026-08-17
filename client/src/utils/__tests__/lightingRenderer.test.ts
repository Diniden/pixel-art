/**
 * Characterisation tests for `utils/lightingRenderer.ts`.
 *
 * ## Why an `ImageData` shim
 *
 * `composeLayers`, `renderWithLighting`, `renderNormalAsRGB` and
 * `renderHeightAsGrayscale` all construct `new ImageData(w, h)`. `ImageData` is
 * a DOM global and is **undefined** in the `unit` (node) project — verified:
 * `bun -e 'console.log(typeof ImageData)'` prints `undefined`.
 *
 * These four functions are otherwise pure buffer producers, and the plan is
 * explicit that they must NOT gain a canvas dependency. So the minimal shim
 * below is installed on `globalThis` BEFORE the module under test is imported.
 * It is structurally identical to the real `ImageData` for everything these
 * functions touch: `{ data: Uint8ClampedArray, width, height }`. The resulting
 * buffers are then hashed with the same `hashBuffer` used everywhere else.
 *
 * ⚠️ `vi.stubGlobal` is deliberately NOT used: `src/test/setup.unit.ts` calls
 * `vi.unstubAllGlobals()` in an `afterEach`, which would tear the shim down
 * between tests while the module under test still closes over the constructor.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { beforeAll, describe, expect, it } from "vitest";

class StubImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === "number") {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c!;
    }
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData = StubImageData;

import {
  composeLayers,
  renderHeightAsGrayscale,
  renderNormalAsRGB,
  renderWithLighting,
} from "@/utils/lightingRenderer";
import { hashBuffer, type PixelBuffer } from "@test/canvasStub";
import {
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_LIGHT_DIRECTION,
} from "@/types";
import type { Frame, Layer, Normal, PixelData, VariantGroup } from "@/types";

beforeAll(() => {
  // Guard: if the shim ever fails to install, every hash below would be
  // meaningless. Fail loudly instead.
  expect(typeof (globalThis as { ImageData?: unknown }).ImageData).toBe(
    "function",
  );
});

/* ── fixtures ────────────────────────────────────────────────────────────── */

const E = (): PixelData => ({ color: 0, normal: 0, height: 0 });

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

/** 4×4, opaque warm grey, normals fanning outward, a height ramp. */
const LIT_LAYER = mkLayer("lit", 4, 4, (x, y) => ({
  color: { r: 200, g: 180, b: 160, a: 255 },
  normal: { x: ((x - 1.5) * 40) | 0, y: ((y - 1.5) * 40) | 0, z: 200 },
  height: 1 + x * 40 + y * 10,
}));

const FRAME: Frame = { id: "f", name: "f", layers: [LIT_LAYER] };

/**
 * A FIXED lighting configuration. The task spec is explicit that fixed inputs
 * are essential; `DEFAULT_LIGHT_DIRECTION` is `{x:-64, y:-64, z:180}`
 * (types/index.ts:242).
 */
const PARAMS = {
  lightDirection: DEFAULT_LIGHT_DIRECTION,
  lightColor: DEFAULT_LIGHT_COLOR,
  ambientColor: DEFAULT_AMBIENT_COLOR,
  heightScale: 100,
};

const asBuffer = (img: ImageData): PixelBuffer =>
  img as unknown as PixelBuffer;

const frameOf = (...layers: Layer[]): Frame => ({
  id: "f",
  name: "f",
  layers,
});

/* ────────────────────────────────────────────────────────────────────────── */
/* composeLayers                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

describe("composeLayers", () => {
  it("hash tripwire — a single lit 4×4 layer", () => {
    const composed = composeLayers(FRAME, 4, 4);
    expect(composed.width).toBe(4);
    expect(composed.height).toBe(4);
    expect(hashBuffer(asBuffer(composed.colorBuffer))).toBe("4x4:70f11d25");
  });

  it("carries the height map through verbatim", () => {
    const composed = composeLayers(FRAME, 4, 4);
    expect(Array.from(composed.heightBuffer)).toEqual([
      1, 41, 81, 121, 11, 51, 91, 131, 21, 61, 101, 141, 31, 71, 111, 151,
    ]);
  });

  it("allocates a 3-float normal buffer per pixel, all zero when no normals", () => {
    const flat = mkLayer("flat", 4, 4, () => ({
      color: { r: 1, g: 2, b: 3, a: 255 },
      normal: 0,
      height: 0,
    }));
    const composed = composeLayers(frameOf(flat), 4, 4);
    expect(composed.normalBuffer).toHaveLength(48);
    expect(Array.from(composed.normalBuffer).every((v) => v === 0)).toBe(true);
    expect(Array.from(composed.heightBuffer).every((v) => v === 0)).toBe(true);
  });

  it("SKIPS hidden layers", () => {
    const hidden = { ...LIT_LAYER, visible: false };
    const composed = composeLayers(frameOf(hidden), 4, 4);
    expect(Array.from(composed.heightBuffer).every((v) => v === 0)).toBe(true);
    // An all-zero colour buffer: nothing was composited.
    expect(Array.from(composed.colorBuffer.data).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("skips the `color === 0` sentinel entirely", () => {
    const sparse = mkLayer("sparse", 2, 2, (x, y) =>
      x === 0 && y === 0
        ? { color: { r: 9, g: 9, b: 9, a: 255 }, normal: 0, height: 7 }
        : E(),
    );
    const composed = composeLayers(frameOf(sparse), 2, 2);
    expect(Array.from(composed.heightBuffer)).toEqual([7, 0, 0, 0]);
  });

  it('OBSERVED: "topmost non-zero" for normal and height means LAST WRITER WINS', () => {
    // The comments say "take topmost non-zero normal", but the loop runs bottom
    // to top and overwrites unconditionally when the value is non-zero — so the
    // TOP layer wins only because it is processed last. A refactor that
    // short-circuits on "already set" would change this. Recorded.
    const bottom = mkLayer("b", 1, 1, () => ({
      color: { r: 10, g: 10, b: 10, a: 255 },
      normal: { x: 10, y: 10, z: 100 },
      height: 50,
    }));
    const top = mkLayer("t", 1, 1, () => ({
      color: { r: 20, g: 20, b: 20, a: 255 },
      normal: { x: 20, y: 20, z: 200 },
      height: 90,
    }));
    const composed = composeLayers(frameOf(bottom, top), 1, 1);
    expect(composed.heightBuffer[0]).toBe(90);
    // Normalised {20, 20, 200} — z dominates.
    expect(composed.normalBuffer[2]).toBeGreaterThan(0.9);
  });

  it("a lower layer's height survives when the upper layer's height is 0", () => {
    const bottom = mkLayer("b", 1, 1, () => ({
      color: { r: 10, g: 10, b: 10, a: 255 },
      normal: 0,
      height: 50,
    }));
    const top = mkLayer("t", 1, 1, () => ({
      color: { r: 20, g: 20, b: 20, a: 128 },
      normal: 0,
      height: 0,
    }));
    expect(composeLayers(frameOf(bottom, top), 1, 1).heightBuffer[0]).toBe(50);
  });

  it("alpha-composites overlapping layers (its own inlined alphaBlend)", () => {
    const bottom = mkLayer("b", 1, 1, () => ({
      color: { r: 0, g: 0, b: 255, a: 255 },
      normal: 0,
      height: 0,
    }));
    const top = mkLayer("t", 1, 1, () => ({
      color: { r: 255, g: 0, b: 0, a: 128 },
      normal: 0,
      height: 0,
    }));
    const composed = composeLayers(frameOf(bottom, top), 1, 1);
    // DIVERGENCE NOTE: `utils/alphaBlend.ts`'s `blendPixels` composites the same
    // pair as {r:128, g:0, b:127, a:255} — see alphaBlend.test.ts. This module's
    // private `alphaBlend` (lightingRenderer.ts:46) drops the explicit
    // Math.max/min clamp that alphaBlend.ts:30-33 applies, and its result lands
    // in a Uint8ClampedArray afterwards. For this input both agree; the two are
    // still SEPARATE implementations and task 30 must prove parity, not assume
    // it.
    expect(Array.from(composed.colorBuffer.data)).toEqual([128, 0, 127, 255]);
  });

  it("returns an all-transparent buffer for an empty frame", () => {
    const composed = composeLayers(frameOf(), 3, 3);
    expect(Array.from(composed.colorBuffer.data).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("does not mutate the frame", () => {
    const before = JSON.stringify(FRAME);
    composeLayers(FRAME, 4, 4);
    expect(JSON.stringify(FRAME)).toBe(before);
  });
});

/* ── composeLayers: the variant-offset chain, as THIS module implements it ── */

describe("composeLayers — variant offset resolution", () => {
  const variantLayer = mkLayer("v", 1, 1, () => ({
    color: { r: 0, g: 0, b: 255, a: 255 },
    normal: 0,
    height: 42,
  }));
  const variants: VariantGroup[] = [
    {
      id: "vg1",
      name: "vg",
      variants: [
        {
          id: "v1",
          name: "v1",
          gridSize: { width: 1, height: 1 },
          frames: [{ id: "vf", layers: [variantLayer] }],
          baseFrameOffsets: { 0: { x: 0, y: 0 } },
        },
      ],
    },
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

  /** Which cell of a 3×3 did the 1×1 variant land in? */
  const landedAt = (layer: Layer, baseFrameIndex = 0, vs = variants) => {
    const composed = composeLayers(
      frameOf(layer),
      3,
      3,
      baseFrameIndex,
      vs,
      { vg1: 0 },
    );
    return Array.from(composed.heightBuffer).indexOf(42);
  };

  it("level 1 — variantOffsets[selectedVariantId] wins", () => {
    expect(
      landedAt({
        ...host,
        variantOffsets: { v1: { x: 2, y: 2 } },
        variantOffset: { x: 1, y: 1 },
      }),
    ).toBe(8);
  });

  it("level 2 — variantOffset (legacy) when level 1 is absent", () => {
    expect(landedAt({ ...host, variantOffset: { x: 1, y: 1 } })).toBe(4);
  });

  it("level 3 — baseFrameOffsets[baseFrameIndex] when 1 and 2 are absent", () => {
    const vs: VariantGroup[] = [
      {
        id: "vg1",
        name: "vg",
        variants: [
          {
            ...variants[0].variants[0],
            baseFrameOffsets: { 0: { x: 0, y: 0 }, 1: { x: 2, y: 2 } },
          },
        ],
      },
    ];
    expect(landedAt(host, 1, vs)).toBe(8);
  });

  it("level 4 — {x:0,y:0} when nothing resolves", () => {
    const vs: VariantGroup[] = [
      {
        id: "vg1",
        name: "vg",
        variants: [{ ...variants[0].variants[0], baseFrameOffsets: {} }],
      },
    ];
    expect(landedAt(host, 0, vs)).toBe(0);
  });

  // DIVERGENCE — recorded, not fixed. `store/helpers.ts:75-77` clamps a
  // negative base-frame index to 0; `lightingRenderer.ts:103` does not.
  it("DIVERGENCE from store/helpers.ts: does NOT clamp a negative baseFrameIndex", () => {
    const vs: VariantGroup[] = [
      {
        id: "vg1",
        name: "vg",
        variants: [
          {
            ...variants[0].variants[0],
            baseFrameOffsets: { 0: { x: 2, y: 2 } },
          },
        ],
      },
    ];
    // helpers.ts would clamp -1 -> 0 and land at index 8. This module lands at 0.
    expect(landedAt(host, -1, vs)).toBe(0);
  });

  it("clips variant pixels that fall outside the base grid", () => {
    const composed = composeLayers(
      frameOf({ ...host, variantOffsets: { v1: { x: 99, y: 99 } } }),
      3,
      3,
      0,
      variants,
      { vg1: 0 },
    );
    expect(Array.from(composed.heightBuffer).every((v) => v === 0)).toBe(true);
  });

  it("treats a variant layer as INVISIBLE when `variants` is not supplied", () => {
    const composed = composeLayers(frameOf(host), 3, 3);
    expect(Array.from(composed.heightBuffer).every((v) => v === 0)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* renderWithLighting                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderWithLighting", () => {
  const composed = () => composeLayers(FRAME, 4, 4);

  it("hash tripwire — the DEFAULT light direction/colour/ambient", () => {
    expect(hashBuffer(asBuffer(renderWithLighting(composed(), PARAMS)))).toBe(
      "4x4:c52bc483",
    );
  });

  it("hash tripwire — light GRAZING along +x", () => {
    expect(
      hashBuffer(
        asBuffer(
          renderWithLighting(composed(), {
            ...PARAMS,
            lightDirection: { x: 127, y: 0, z: 1 },
          }),
        ),
      ),
    ).toBe("4x4:8dc1f7c9");
  });

  it("hash tripwire — light DIRECTLY ON (straight down the z axis)", () => {
    expect(
      hashBuffer(
        asBuffer(
          renderWithLighting(composed(), {
            ...PARAMS,
            lightDirection: { x: 0, y: 0, z: 255 },
          }),
        ),
      ),
    ).toBe("4x4:c63e5655");
  });

  it("OBSERVED: light BEHIND (negative z) renders differently from in-front", () => {
    // `normalToVec3(dir, true)` negates z (lightingRenderer.ts:31-41), so a
    // caller passing z:-255 flips the Lambertian term's sign and every
    // outward-facing surface falls to ambient only. The Normal type documents z
    // as unsigned, so this is an out-of-contract input that the code
    // nonetheless accepts — recorded rather than guarded.
    const inFront = renderWithLighting(composed(), {
      ...PARAMS,
      lightDirection: { x: 0, y: 0, z: 255 },
    });
    const behind = renderWithLighting(composed(), {
      ...PARAMS,
      lightDirection: { x: 0, y: 0, z: -255 },
    });
    expect(hashBuffer(asBuffer(inFront))).not.toBe(hashBuffer(asBuffer(behind)));
    // In BOTH cases `calculateShadow` returns 1 immediately: its early return
    // (:233) only inspects lightDir x and y, which are zero here.
  });

  it("heightScale CHANGES the shadow term (calculateShadow on)", () => {
    const at0 = hashBuffer(
      asBuffer(renderWithLighting(composed(), { ...PARAMS, heightScale: 0 })),
    );
    const at100 = hashBuffer(
      asBuffer(renderWithLighting(composed(), { ...PARAMS, heightScale: 100 })),
    );
    expect(at0).toBe("4x4:3ce7b905");
    expect(at100).toBe("4x4:c52bc483");
    expect(at0).not.toBe(at100);
  });

  it("OBSERVED: heightScale 1000 renders identically to 100 (shadow saturates)", () => {
    expect(
      hashBuffer(
        asBuffer(renderWithLighting(composed(), { ...PARAMS, heightScale: 1000 })),
      ),
    ).toBe("4x4:c52bc483");
  });

  it("calculateShadow is OFF when the light has no lateral component", () => {
    // `if (currentHeight === 0 || (lightDir[0] === 0 && lightDir[1] === 0))
    // return 1` — lightingRenderer.ts:233-235. Height then cannot matter.
    const h0 = mkLayer("h", 2, 2, () => ({
      color: { r: 255, g: 255, b: 255, a: 255 },
      normal: { x: 0, y: 0, z: 255 },
      height: 0,
    }));
    const h255 = mkLayer("h", 2, 2, () => ({
      color: { r: 255, g: 255, b: 255, a: 255 },
      normal: { x: 0, y: 0, z: 255 },
      height: 255,
    }));
    const a = renderWithLighting(composeLayers(frameOf(h0), 2, 2), PARAMS);
    const b = renderWithLighting(composeLayers(frameOf(h255), 2, 2), PARAMS);
    expect(hashBuffer(asBuffer(a))).toBe("2x2:759e5f05");
    expect(hashBuffer(asBuffer(b))).toBe("2x2:759e5f05");
  });

  it("takes the AMBIENT-ONLY path for pixels with no normal data", () => {
    // `finalR = baseR * (ambientR + 0.5)` — the +0.5 "slight boost" at :349.
    const flat = mkLayer("flat", 4, 4, () => ({
      color: { r: 200, g: 180, b: 160, a: 255 },
      normal: 0,
      height: 0,
    }));
    expect(
      hashBuffer(
        asBuffer(renderWithLighting(composeLayers(frameOf(flat), 4, 4), PARAMS)),
      ),
    ).toBe("4x4:d3a69545");
  });

  it("leaves fully-transparent pixels transparent and black", () => {
    const sparse = mkLayer("s", 2, 2, (x, y) =>
      x === 0 && y === 0
        ? {
            color: { r: 255, g: 255, b: 255, a: 255 },
            normal: { x: 0, y: 0, z: 255 },
            height: 0,
          }
        : E(),
    );
    const out = renderWithLighting(composeLayers(frameOf(sparse), 2, 2), PARAMS);
    expect(Array.from(out.data.slice(4))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("PRESERVES the composited alpha channel unchanged", () => {
    const half = mkLayer("h", 1, 1, () => ({
      color: { r: 255, g: 255, b: 255, a: 128 },
      normal: { x: 0, y: 0, z: 255 },
      height: 0,
    }));
    const composedHalf = composeLayers(frameOf(half), 1, 1);
    const out = renderWithLighting(composedHalf, PARAMS);
    expect(out.data[3]).toBe(composedHalf.colorBuffer.data[3]);
    expect(out.data[3]).toBe(128);
  });

  it("defaults heightScale to 100 when omitted", () => {
    const { heightScale: _drop, ...noScale } = PARAMS;
    expect(hashBuffer(asBuffer(renderWithLighting(composed(), noScale)))).toBe(
      "4x4:c52bc483",
    );
  });

  it("light COLOUR changes the output", () => {
    const red = renderWithLighting(composed(), {
      ...PARAMS,
      lightColor: { r: 255, g: 0, b: 0, a: 255 },
    });
    expect(hashBuffer(asBuffer(red))).not.toBe("4x4:c52bc483");
  });

  it("ambient COLOUR changes the output", () => {
    const black = renderWithLighting(composed(), {
      ...PARAMS,
      ambientColor: { r: 0, g: 0, b: 0, a: 255 },
    });
    expect(hashBuffer(asBuffer(black))).not.toBe("4x4:c52bc483");
  });

  it("does not mutate the composed buffers it reads", () => {
    const c = composed();
    const before = hashBuffer(asBuffer(c.colorBuffer));
    renderWithLighting(c, PARAMS);
    expect(hashBuffer(asBuffer(c.colorBuffer))).toBe(before);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* renderNormalAsRGB                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderNormalAsRGB", () => {
  it("hash tripwire — the 4×4 lit fixture", () => {
    expect(hashBuffer(asBuffer(renderNormalAsRGB(LIT_LAYER, 4, 4)))).toBe(
      "4x4:46a4af25",
    );
  });

  it("maps x,y from -128..127 to 0..255 by +128, and z straight through", () => {
    const extremes = mkLayer("n", 2, 1, (x) => ({
      color: { r: 1, g: 1, b: 1, a: 255 },
      normal:
        x === 0
          ? ({ x: -128, y: -128, z: 0 } as Normal)
          : ({ x: 127, y: 127, z: 255 } as Normal),
      height: 0,
    }));
    expect(Array.from(renderNormalAsRGB(extremes, 2, 1).data)).toEqual([
      0, 0, 0, 255, 255, 255, 255, 255,
    ]);
  });

  it("emits fully transparent for a pixel with no colour or no normal", () => {
    const mixed = mkLayer("n", 3, 1, (x) => {
      if (x === 0) return E(); // no colour
      if (x === 1)
        return { color: { r: 1, g: 1, b: 1, a: 255 }, normal: 0, height: 0 };
      return {
        color: { r: 1, g: 1, b: 1, a: 255 },
        normal: { x: 0, y: 0, z: 255 },
        height: 0,
      };
    });
    const out = Array.from(renderNormalAsRGB(mixed, 3, 1).data);
    expect(out.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(out.slice(4, 8)).toEqual([0, 0, 0, 0]);
    expect(out.slice(8, 12)).toEqual([128, 128, 255, 255]);
  });

  it("returns an all-zero buffer for a wholly empty layer", () => {
    const out = renderNormalAsRGB(mkLayer("e", 2, 2, E), 2, 2);
    expect(Array.from(out.data).every((v) => v === 0)).toBe(true);
  });

  it("tolerates a layer shorter than the requested height", () => {
    const short = mkLayer("s", 2, 1, () => ({
      color: { r: 1, g: 1, b: 1, a: 255 },
      normal: { x: 0, y: 0, z: 255 },
      height: 0,
    }));
    // Row 1 does not exist; the `if (!row) continue` guard leaves it zeroed.
    const out = renderNormalAsRGB(short, 2, 2);
    expect(Array.from(out.data.slice(8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("OBSERVED: alpha is a hard 255 — the pixel's own alpha is ignored", () => {
    const faint = mkLayer("f", 1, 1, () => ({
      color: { r: 1, g: 1, b: 1, a: 1 },
      normal: { x: 0, y: 0, z: 255 },
      height: 0,
    }));
    expect(renderNormalAsRGB(faint, 1, 1).data[3]).toBe(255);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* renderHeightAsGrayscale                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

describe("renderHeightAsGrayscale", () => {
  it("hash tripwire — the 4×4 lit fixture", () => {
    expect(hashBuffer(asBuffer(renderHeightAsGrayscale(LIT_LAYER, 4, 4)))).toBe(
      "4x4:266f6a8e",
    );
  });

  it("maps height 0 to transparent, 1 to black, 255 to white", () => {
    const ramp = mkLayer("h", 3, 1, (x) => ({
      color: { r: 1, g: 1, b: 1, a: 255 },
      normal: 0,
      height: [0, 1, 255][x],
    }));
    expect(Array.from(renderHeightAsGrayscale(ramp, 3, 1).data)).toEqual([
      0, 0, 0, 0, // height 0 -> fully transparent, NOT black
      0, 0, 0, 255, // height 1 -> opaque black
      255, 255, 255, 255, // height 255 -> opaque white
    ]);
  });

  it("maps the midpoint linearly across the 1..255 range", () => {
    const mid = mkLayer("h", 1, 1, () => ({
      color: { r: 1, g: 1, b: 1, a: 255 },
      normal: 0,
      height: 128,
    }));
    // round(((128 - 1) / 254) * 255) = 128
    expect(Array.from(renderHeightAsGrayscale(mid, 1, 1).data)).toEqual([
      128, 128, 128, 255,
    ]);
  });

  it("emits transparent for a pixel with no colour, even if height is set", () => {
    const noColour = mkLayer("h", 1, 1, () => ({
      color: 0,
      normal: 0,
      height: 200,
    }));
    expect(Array.from(renderHeightAsGrayscale(noColour, 1, 1).data)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("returns an all-zero buffer for a wholly empty layer", () => {
    const out = renderHeightAsGrayscale(mkLayer("e", 2, 2, E), 2, 2);
    expect(Array.from(out.data).every((v) => v === 0)).toBe(true);
  });

  it("OBSERVED: alpha is a hard 255 — the pixel's own alpha is ignored", () => {
    const faint = mkLayer("f", 1, 1, () => ({
      color: { r: 1, g: 1, b: 1, a: 1 },
      normal: 0,
      height: 100,
    }));
    expect(renderHeightAsGrayscale(faint, 1, 1).data[3]).toBe(255);
  });
});
