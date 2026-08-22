/**
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE TASK-34 GATE — `frameEncoding` IS BYTE-IDENTICAL TO THE THREE
 *     ORIGINAL ENCODERS IT REPLACED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `AIInterpolateModal.tsx` held three near-identical base64 renderers
 * (`renderLayerToBase64` 38-66, `renderFrameToBase64` 68-107,
 * `renderVariantFrameToBase64` 109-147). Task 34 replaced all three with one
 * parameterised encoder. The AI service consumes these images, so a subtle
 * encoding change would NOT error — it would silently degrade interpolation
 * quality. That makes equality the gate, and it has to be a real comparison
 * rather than an inspection.
 *
 * ## What is compared, and why it is the strictest form available here
 *
 * The originals end `canvas.toDataURL("image/png").split(",")[1]`. jsdom has
 * NO canvas backend — MEASURED in this repo: `canvas.getContext("2d")` returns
 * `null` and `toDataURL` returns `null` (see `src/test/canvasStub.ts`'s
 * header, and `imageEncoding.dom.test.ts` which pins the same fact) — so the
 * PNG bytes are not observable in any lane.
 *
 * They do not need to be. The encoders are
 *
 *     base64  =  PNG( RGBA buffer )
 *
 * where `PNG(·)` is the browser's own deterministic encoder, identical on both
 * sides of the refactor and untouched by it. So the base64 differs **iff** the
 * RGBA buffer differs, and comparing the buffer is exact — strictly stronger
 * than comparing a hash, since a mismatch reports the byte index.
 *
 * The three ORIGINAL implementations are reproduced VERBATIM below (copied
 * from the pre-refactor file, only `putImageData`/`toDataURL` removed so they
 * run headless). They are the oracle. If someone "simplifies" the new encoder,
 * these copies do not move and the test fails.
 *
 * ## Coverage
 *
 * Three fixtures, one per original: a fixture LAYER, a fixture FRAME (with an
 * invisible layer and a variant layer, so the filter is exercised) and a
 * fixture VARIANT FRAME. Plus a 256-alpha sweep, because the two places the
 * shared `utils/alphaBlend.ts` would have diverged are both alpha-edge
 * behaviours — see `frameEncoding.ts`'s header for the measured numbers.
 */
import { describe, expect, it } from "vitest";
import type { Frame, Layer, PixelData, VariantFrame } from "@/types";
import {
  buildLayerBuffer,
  layersOfFrame,
  layersOfLayer,
  layersOfVariantFrame,
} from "@/ui/utils/frameEncoding";

/* ──────────────────────────────────────────────────────────────────────────
 * THE ORACLE — the three originals, verbatim from AIInterpolateModal.tsx
 * (pre-task-34), writing into a caller-supplied buffer instead of a canvas.
 * DO NOT "tidy" these. Their exact arithmetic is the specification.
 * ────────────────────────────────────────────────────────────────────────── */

/** `renderLayerToBase64`, lines 38-66. Straight channel assignment. */
function originalLayer(
  layer: Layer,
  width: number,
  height: number,
  data: Uint8ClampedArray,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pd = layer.pixels[y]?.[x];
      if (!pd || pd.color === 0) continue;
      const c = pd.color;
      const idx = (y * width + x) * 4;
      data[idx] = c.r;
      data[idx + 1] = c.g;
      data[idx + 2] = c.b;
      data[idx + 3] = c.a;
    }
  }
}

/** `renderFrameToBase64`, lines 68-107. Composites visible non-variant layers. */
function originalFrame(
  frame: Frame,
  width: number,
  height: number,
  data: Uint8ClampedArray,
): void {
  for (let layerIdx = 0; layerIdx < frame.layers.length; layerIdx++) {
    const layer = frame.layers[layerIdx];
    if (!layer.visible || layer.isVariant) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pd = layer.pixels[y]?.[x];
        if (!pd || pd.color === 0) continue;
        const c = pd.color;
        const idx = (y * width + x) * 4;
        const srcA = c.a / 255;
        const dstA = data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          data[idx] = (c.r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
          data[idx + 1] =
            (c.g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
          data[idx + 2] =
            (c.b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
          data[idx + 3] = outA * 255;
        }
      }
    }
  }
}

/** `renderVariantFrameToBase64`, lines 109-147. Composites visible layers. */
function originalVariantFrame(
  vFrame: VariantFrame,
  width: number,
  height: number,
  data: Uint8ClampedArray,
): void {
  for (const layer of vFrame.layers) {
    if (!layer.visible) continue;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pd = layer.pixels[y]?.[x];
        if (!pd || pd.color === 0) continue;
        const c = pd.color;
        const idx = (y * width + x) * 4;
        const srcA = c.a / 255;
        const dstA = data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          data[idx] = (c.r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
          data[idx + 1] =
            (c.g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
          data[idx + 2] =
            (c.b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
          data[idx + 3] = outA * 255;
        }
      }
    }
  }
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const W = 8;
const H = 6;

/** Deterministic pseudo-random cell; `seed` shifts the whole grid. */
function cell(x: number, y: number, seed: number): PixelData {
  const n = (x * 31 + y * 17 + seed * 7) % 256;
  if (n % 5 === 0) return { color: 0, normal: 0, height: 0 };
  return {
    color: {
      r: n,
      g: (n * 3 + 11) % 256,
      b: (n * 7 + 29) % 256,
      // Deliberately includes 0, 1 and 2 — the alphas where the shared
      // `blendOverChannels` cutoff would have diverged.
      a: (x + y + seed) % 4 === 0 ? (x + y + seed) % 3 : (n * 5) % 256,
    },
    normal: 0,
    height: 0,
  };
}

function grid(seed: number, width = W, height = H): PixelData[][] {
  const rows: PixelData[][] = [];
  for (let y = 0; y < height; y++) {
    const row: PixelData[] = [];
    for (let x = 0; x < width; x++) row.push(cell(x, y, seed));
    rows.push(row);
  }
  return rows;
}

function layer(id: string, seed: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    pixels: grid(seed),
    visible: true,
    ...extra,
  };
}

const fixtureLayer: Layer = layer("solo", 1);

/** Four layers: two that count, one hidden, one variant — the filter matters. */
const fixtureFrame: Frame = {
  id: "f1",
  name: "Frame 1",
  layers: [
    layer("base", 2),
    layer("hidden", 3, { visible: false }),
    layer("variant", 4, { isVariant: true }),
    layer("top", 5),
  ],
};

/** VariantFrame layers have no `isVariant`; only `visible` filters. */
const fixtureVariantFrame: VariantFrame = {
  id: "vf1",
  layers: [
    layer("v-base", 6),
    layer("v-hidden", 7, { visible: false }),
    layer("v-top", 8),
  ],
};

function buf(): Uint8ClampedArray {
  return new Uint8ClampedArray(W * H * 4);
}

/** Byte-exact comparison that names the first differing index on failure. */
function expectByteEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      throw new Error(
        `byte ${i} differs (pixel ${Math.floor(i / 4)}, channel ${i % 4}): ` +
          `original ${a[i]} vs frameEncoding ${b[i]}`,
      );
    }
  }
  expect(Array.from(b)).toEqual(Array.from(a));
}

/* ── The gate ────────────────────────────────────────────────────────────── */

describe("frameEncoding byte-equality gate (task 34)", () => {
  it("layer: matches renderLayerToBase64 byte for byte", () => {
    const expected = buf();
    originalLayer(fixtureLayer, W, H, expected);

    const actual = buf();
    buildLayerBuffer(layersOfLayer(fixtureLayer), W, H, actual, "assign");

    expectByteEqual(expected, actual);
  });

  it("frame: matches renderFrameToBase64 byte for byte, filter included", () => {
    const expected = buf();
    originalFrame(fixtureFrame, W, H, expected);

    const actual = buf();
    buildLayerBuffer(layersOfFrame(fixtureFrame), W, H, actual);

    expectByteEqual(expected, actual);
  });

  it("variant frame: matches renderVariantFrameToBase64 byte for byte", () => {
    const expected = buf();
    originalVariantFrame(fixtureVariantFrame, W, H, expected);

    const actual = buf();
    buildLayerBuffer(layersOfVariantFrame(fixtureVariantFrame), W, H, actual);

    expectByteEqual(expected, actual);
  });

  it("agrees across ALL 256 source alphas over ALL 256 destination alphas", () => {
    // The alpha edges are where the two candidate "reuse alphaBlend.ts"
    // simplifications diverged (module header: 21 differing outputs each).
    // This sweep is what makes that claim falsifiable rather than asserted.
    for (let srcA = 0; srcA < 256; srcA++) {
      const under: Layer = {
        id: "under",
        name: "under",
        visible: true,
        pixels: [
          Array.from({ length: 256 }, (_, dstA) => ({
            color: { r: 11, g: 222, b: 77, a: dstA },
            normal: 0 as const,
            height: 0,
          })),
        ],
      };
      const over: Layer = {
        id: "over",
        name: "over",
        visible: true,
        pixels: [
          Array.from({ length: 256 }, () => ({
            color: { r: 200, g: 5, b: 130, a: srcA },
            normal: 0 as const,
            height: 0,
          })),
        ],
      };
      const frame: Frame = { id: "f", name: "f", layers: [under, over] };

      const expected = new Uint8ClampedArray(256 * 4);
      originalFrame(frame, 256, 1, expected);
      const actual = new Uint8ClampedArray(256 * 4);
      buildLayerBuffer(layersOfFrame(frame), 256, 1, actual);

      expectByteEqual(expected, actual);
    }
  });

  it("the layer path matches the straight-assign original for every alpha", () => {
    const solo: Layer = {
      id: "solo",
      name: "solo",
      visible: true,
      pixels: [
        Array.from({ length: 256 }, (_, a) => ({
          color: { r: 240, g: 130, b: 3, a },
          normal: 0 as const,
          height: 0,
        })),
      ],
    };

    const expected = new Uint8ClampedArray(256 * 4);
    originalLayer(solo, 256, 1, expected);
    const actual = new Uint8ClampedArray(256 * 4);
    buildLayerBuffer(layersOfLayer(solo), 256, 1, actual, "assign");

    expectByteEqual(expected, actual);
  });

  it("PINS the gap this gate FOUND: assign and composite differ at a === 0", () => {
    // ⚠️ Regression guard for a real near-miss. Task 34 first modelled the
    // layer walk as "composite one layer over a zero buffer" and dropped the
    // write mode. The gate caught it: a cell that is PRESENT but fully
    // transparent (`color !== 0`, `a === 0`) is WRITTEN by
    // `renderLayerToBase64` — its RGB lands in the buffer and travels to the
    // AI service — and SKIPPED by the composite path, whose `outA > 0` test
    // fails.
    //
    // This test states the difference explicitly so nobody "simplifies" the
    // mode away again. If these two ever agree, `buildLayerBuffer` has
    // silently changed what the AI service receives.
    const transparentButColoured: Layer = {
      id: "ghost",
      name: "ghost",
      visible: true,
      pixels: [
        [{ color: { r: 36, g: 99, b: 200, a: 0 }, normal: 0, height: 0 }],
      ],
    };

    const assigned = new Uint8ClampedArray(4);
    buildLayerBuffer([transparentButColoured], 1, 1, assigned, "assign");
    const composited = new Uint8ClampedArray(4);
    buildLayerBuffer([transparentButColoured], 1, 1, composited, "composite");

    // The original layer renderer's behaviour — RGB preserved, alpha 0.
    expect(Array.from(assigned)).toEqual([36, 99, 200, 0]);
    // The original frame renderers' behaviour — untouched.
    expect(Array.from(composited)).toEqual([0, 0, 0, 0]);

    // And "assign" is what `renderLayerToBase64` actually did.
    const oracle = new Uint8ClampedArray(4);
    originalLayer(transparentButColoured, 1, 1, oracle);
    expectByteEqual(oracle, assigned);
  });

  it("selectors reproduce the originals' filters exactly", () => {
    expect(layersOfFrame(fixtureFrame).map((l) => l.id)).toEqual([
      "base",
      "top",
    ]);
    expect(layersOfVariantFrame(fixtureVariantFrame).map((l) => l.id)).toEqual([
      "v-base",
      "v-top",
    ]);
    expect(layersOfLayer(fixtureLayer)).toEqual([fixtureLayer]);
  });
});
