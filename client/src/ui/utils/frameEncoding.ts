/**
 * frameEncoding — ONE parameterised base64 encoder replacing the three
 * near-identical renderers that lived in `AIInterpolateModal.tsx` (REFRESH
 * task 34, lines 38-147 of the old file).
 *
 * `renderLayerToBase64`, `renderFrameToBase64` and `renderVariantFrameToBase64`
 * shared the same scaffold — create a canvas, build an `ImageData`, walk a
 * source, produce base64 — and differed ONLY in which source they walked and
 * whether they composited. That difference is now a parameter: callers hand in
 * an ordered list of `EncodableLayer`s, and {@link encodeLayersToBase64} does
 * the rest.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE TASK-34 GATE: THIS OUTPUT IS BYTE-IDENTICAL TO THE THREE ORIGINALS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The AI service consumes these images. A subtle encoding change would not
 * error — it would silently degrade interpolation quality — so the equality is
 * pinned by `__tests__/frameEncoding.dom.test.ts`, which reproduces all three
 * ORIGINAL implementations verbatim and asserts the RGBA buffers match byte for
 * byte (see that file's header for why comparing buffers is the strictest
 * available form of the assertion in this environment).
 *
 * ── ⚠️ TWO MEASURED REASONS THIS FILE DOES NOT CALL `utils/alphaBlend.ts` ──
 *
 * The task 34 spec says this file held one of the codebase's five alpha
 * compositing copies and directs it onto the task-30 shared implementation.
 * Doing so **breaks byte-equality**, measured exhaustively, in two independent
 * ways. Both are documented here because the pull to "just use the shared one"
 * will recur:
 *
 * 1. **The transparent cutoff.** `blendOverChannels` bails when
 *    `outAlpha <= 0.01`; these encoders bail only when `outAlpha <= 0`. There
 *    are exactly **5** byte-alpha pairs in the gap — `(srcA,dstA)` of
 *    `(0,1) (0,2) (1,0) (1,1) (2,0)` — and on those the shared version leaves
 *    the destination untouched while the original WRITES a near-transparent
 *    pixel. Measured: 21 differing outputs over a 3-colour × 65,536 alpha-pair
 *    sweep.
 * 2. **Reciprocal vs division.** `blendOverChannels` computes `1/outAlpha`
 *    once and multiplies; the originals divide by `outAlpha` per channel.
 *    Those are NOT the same in IEEE-754, and the difference survives the
 *    round-to-byte: measured **21 differing pixels** over 327,680 sampled
 *    composites even after the cutoff was aligned. Switching to division while
 *    keeping the `> 0` cutoff gives **0 differences over 786,432 cases** —
 *    which is what the loop below does.
 *
 * So the duplication here is deliberate and load-bearing, not an oversight.
 * Unifying it is a behaviour change that needs its own task and owner sign-off,
 * exactly like the four pinned migration bugs.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * No store, no API, no MobX. It touches `document.createElement("canvas")`,
 * which is DOM, not state — the same category as `ui/hooks/useCanvasRender`.
 */
import type { Layer, Pixel, PixelData, VariantFrame, Frame } from "../../types";

/**
 * The minimum a source must expose to be encoded: a pixel grid.
 *
 * ⚠️ `pixels` is passed BY REFERENCE and only read. R2 forbids deep-observing
 * a grid, and nothing here writes one.
 */
export interface EncodableLayer {
  readonly pixels: PixelData[][];
  /**
   * Carried through only so a caller (and the byte-equality test) can identify
   * which layers a selector kept. Never read by the encoder itself.
   */
  readonly id?: string;
}

/**
 * How a source pixel is written into the buffer.
 *
 * ⚠️ These two are NOT interchangeable, and the difference is byte-visible —
 * it is the one behavioural gap the byte-equality test FOUND rather than
 * confirmed. See {@link buildLayerBuffer}.
 *
 * - `"assign"`  — `renderLayerToBase64`'s rule: overwrite all four channels.
 * - `"composite"` — `renderFrameToBase64` / `renderVariantFrameToBase64`'s
 *   rule: Porter-Duff "over" against what is already there.
 */
export type WriteMode = "assign" | "composite";

/**
 * Encode an ordered list of layers to a base64 PNG payload (no data-URL
 * prefix), painting them bottom-to-top.
 *
 * The caller has already filtered and ordered the list, and chosen the write
 * mode — those two choices are the ONLY things the three original renderers
 * disagreed about, so they live in the three selector helpers below rather
 * than being re-derived here.
 *
 * @param layers Bottom-to-top; `layers[0]` is painted first.
 * @param width  Grid width in cells.
 * @param height Grid height in cells.
 * @param mode   see {@link WriteMode}; defaults to `"composite"`.
 * @returns the base64 body of a PNG data URL.
 */
export function encodeLayersToBase64(
  layers: readonly EncodableLayer[],
  width: number,
  height: number,
  mode: WriteMode = "composite",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  buildLayerBuffer(layers, width, height, imageData.data, mode);

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}

/**
 * The pixel half of {@link encodeLayersToBase64}, split out so the
 * byte-equality test can compare RGBA buffers exactly — jsdom has no canvas
 * backend, so `toDataURL` returns `null` there and the PNG bytes are not
 * observable in test (see `src/test/canvasStub.ts`'s header).
 *
 * Paints `layers` bottom-to-top into `data` in place.
 *
 * ── ⚠️ WHY `"assign"` EXISTS — THE GAP THE GATE TEST FOUND ────────────────
 *
 * It is tempting to treat the single-layer case as "compositing one layer over
 * a zeroed buffer" and drop the mode. That is WRONG, and the byte-equality
 * test caught it on the first run.
 *
 * When a cell is present but FULLY TRANSPARENT (`color !== 0` and `a === 0`),
 * `renderLayerToBase64` still ran, writing `(r, g, b, 0)` — the RGB channels
 * land in the buffer and are carried into the PNG. The composite path skips
 * that cell entirely (`outA > 0` is false), leaving `(0, 0, 0, 0)`. Measured
 * on the fixture grid: byte 156 differed, original `36` vs composite `0`.
 *
 * Those bytes are not academic — they go to the AI service. Pixel art
 * routinely carries `a === 0` cells with leftover colour, so the two modes
 * stay distinct.
 *
 * ⚠️ Every line of the composite branch is byte-pinned. See the module header
 * before touching the arithmetic — in particular the per-channel DIVISION by
 * `outA` and the `outA > 0` cutoff are both load-bearing.
 */
export function buildLayerBuffer(
  layers: readonly EncodableLayer[],
  width: number,
  height: number,
  data: Uint8ClampedArray,
  mode: WriteMode = "composite",
): void {
  for (const layer of layers) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pd = layer.pixels[y]?.[x];
        if (!pd || pd.color === 0) continue;
        const c = pd.color as Pixel;
        const idx = (y * width + x) * 4;

        if (mode === "assign") {
          data[idx] = c.r;
          data[idx + 1] = c.g;
          data[idx + 2] = c.b;
          data[idx + 3] = c.a;
          continue;
        }

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

/* ──────────────────────────────────────────────────────────────────────────
 * The three source walks — the ONLY thing that differed between the originals
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A single layer, as `renderLayerToBase64` walked it. Pair it with the
 * `"assign"` write mode — see {@link buildLayerBuffer} for why compositing a
 * lone layer is NOT equivalent.
 */
export function layersOfLayer(layer: Layer): EncodableLayer[] {
  return [layer];
}

/**
 * A base frame, as `renderFrameToBase64` walked it: every VISIBLE,
 * NON-VARIANT layer, in array order.
 */
export function layersOfFrame(frame: Frame): EncodableLayer[] {
  return frame.layers.filter((l) => l.visible && !l.isVariant);
}

/**
 * A variant frame, as `renderVariantFrameToBase64` walked it: every VISIBLE
 * layer. `VariantFrame` layers have no `isVariant` flag, so there is no second
 * predicate — the asymmetry with {@link layersOfFrame} is in the original.
 */
export function layersOfVariantFrame(vFrame: VariantFrame): EncodableLayer[] {
  return vFrame.layers.filter((l) => l.visible);
}

/* ── Convenience wrappers, one per original call shape ──────────────────── */

/** `renderLayerToBase64`'s replacement. */
export function encodeLayerToBase64(
  layer: Layer,
  width: number,
  height: number,
): string {
  return encodeLayersToBase64(layersOfLayer(layer), width, height, "assign");
}

/** `renderFrameToBase64`'s replacement. */
export function encodeFrameToBase64(
  frame: Frame,
  width: number,
  height: number,
): string {
  return encodeLayersToBase64(layersOfFrame(frame), width, height);
}

/** `renderVariantFrameToBase64`'s replacement. */
export function encodeVariantFrameToBase64(
  vFrame: VariantFrame,
  width: number,
  height: number,
): string {
  return encodeLayersToBase64(layersOfVariantFrame(vFrame), width, height);
}

/**
 * Decode a base64 PNG back into a `PixelData` grid — the inverse used when
 * accepting generated frames (moved verbatim from the modal's
 * `base64ToPixelData`).
 *
 * ⚠️ Returns rank 2 (`PixelData[][]`) — ONE frame's grid. The caller collects
 * these into rank 4 (`pairs → frames → rows → cells`). W1 found the modal's
 * `allPixelDataPairs` annotation had been wrong about that rank; the VALUES
 * were always correct. Do not "correct" the rank again.
 */
export async function base64ToPixelData(
  base64: string,
  width: number,
  height: number,
): Promise<PixelData[][]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const pixels: PixelData[][] = [];
      for (let y = 0; y < height; y++) {
        const row: PixelData[] = [];
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          if (a === 0) {
            row.push({ color: 0, normal: 0, height: 0 });
          } else {
            row.push({ color: { r, g, b, a }, normal: 0, height: 0 });
          }
        }
        pixels.push(row);
      }
      resolve(pixels);
    };
    img.onerror = () => reject(new Error("Failed to decode generated frame"));
    img.src = `data:image/png;base64,${base64}`;
  });
}
