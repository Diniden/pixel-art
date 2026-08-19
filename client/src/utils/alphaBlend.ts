import { Pixel, PixelData } from '../types';

/**
 * Blends two pixels using proper alpha compositing.
 * This produces the same visual result as stacking layers.
 *
 * @param src - Source pixel (from upper layer)
 * @param dst - Destination pixel (from lower layer)
 * @returns Blended pixel
 */
function alphaBlend(src: Pixel, dst: Pixel): Pixel {
  const srcAlpha = src.a / 255;
  const dstAlpha = dst.a / 255;

  // Calculate output alpha using Porter-Duff "over" operator
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  // If output is fully transparent, return transparent
  if (outAlpha < 0.01) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Calculate blended color using premultiplied alpha
  const invOutAlpha = 1 / outAlpha;
  const r = (src.r * srcAlpha + dst.r * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
  const g = (src.g * srcAlpha + dst.g * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
  const b = (src.b * srcAlpha + dst.b * dstAlpha * (1 - srcAlpha)) * invOutAlpha;

  return {
    r: Math.round(Math.max(0, Math.min(255, r))),
    g: Math.round(Math.max(0, Math.min(255, g))),
    b: Math.round(Math.max(0, Math.min(255, b))),
    a: Math.round(Math.max(0, Math.min(255, outAlpha * 255)))
  };
}

/**
 * Blends two PixelData objects, handling transparent pixels.
 * Blends colors, takes topmost normal and height.
 *
 * @param src - Source pixel data (from upper layer)
 * @param dst - Destination pixel data (from lower layer)
 * @returns Blended pixel data
 */
export function blendPixels(src: PixelData, dst: PixelData): PixelData {
  const srcColor = src.color;
  const dstColor = dst.color;

  // If both have no color, return empty
  if (srcColor === 0 && dstColor === 0) {
    return { color: 0, normal: 0, height: 0 };
  }

  // If src has no color, return dst
  if (srcColor === 0) {
    return dst;
  }

  // If dst has no color, return src
  if (dstColor === 0) {
    return src;
  }

  // Both have colors, blend them
  const blendedColor = alphaBlend(srcColor, dstColor);

  // For normal and height, take the src (topmost) if available, otherwise dst
  const normal = src.normal !== 0 ? src.normal : dst.normal;
  const height = src.height !== 0 ? src.height : dst.height;

  return {
    color: blendedColor,
    normal,
    height
  };
}


/* ──────────────────────────────────────────────────────────────────────────
 * Buffer-level compositing — the shared implementation (task 30, §9.12)
 *
 * Alpha compositing existed FIVE times in this codebase: the `alphaBlend`
 * above, a private `alphaBlend` in `utils/lightingRenderer.ts`, an inline copy
 * in `Canvas.tsx`'s frame overlay, one in `AIInterpolateModal.tsx`, and the
 * server export path. Task 08 pinned each BEFORE unifying, because they did not
 * all agree.
 *
 * ## Where the pinned implementations disagreed, and what was kept
 *
 * All copies compute the same Porter-Duff "over" operator. They differ at the
 * EDGES:
 *
 * 1. **Clamping.** `alphaBlend` above clamps each output channel to 0-255 and
 *    rounds; `lightingRenderer`'s copy rounds but does NOT clamp; the Canvas
 *    inline copy neither rounds nor clamps — it assigns straight into a
 *    `Uint8ClampedArray`, which clamps and rounds-half-to-even in hardware.
 * 2. **The transparent cutoff.** `alphaBlend` and `lightingRenderer` return
 *    fully transparent when `outAlpha < 0.01`. The Canvas inline copy inverts
 *    the test (`if (outAlpha > 0.01)`) and, when it fails, LEAVES THE
 *    DESTINATION UNTOUCHED rather than zeroing it.
 *
 * `blendOverInto` below keeps the **Canvas inline copy's** behaviour, because it
 * is the one that writes into an RGBA byte buffer and it is the one whose
 * pixels the golden-hash tests pin. Specifically it preserves the
 * leave-destination-alone branch: zeroing instead would ERASE an existing
 * near-transparent pixel that the original kept. `Uint8ClampedArray` supplies
 * the clamping, so no explicit clamp is needed or wanted — adding one would
 * change rounding from half-to-even to half-up.
 *
 * The `Pixel`-level `alphaBlend`/`blendPixels` above are untouched: they return
 * objects, not buffer writes, and their clamping is pinned by task 08's tests.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Composite one source colour OVER the RGBA pixel at `idx` in `data`, in place.
 *
 * Porter-Duff "over". When the result would be essentially transparent
 * (`outAlpha <= 0.01`) the destination is left exactly as it was.
 *
 * @param data - destination RGBA buffer
 * @param idx - byte index of the destination pixel (already `* 4`)
 * @param r,g,b - source colour, 0-255
 * @param a - source alpha, 0-255
 */
export function blendOverInto(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const blended = blendOverChannels(
    r, g, b, a,
    data[idx], data[idx + 1], data[idx + 2], data[idx + 3]
  );

  // NOTE: no else-branch. When the result is essentially transparent the
  // destination is LEFT ALONE, not zeroed. Pinned from Canvas.tsx:1173-1196.
  if (blended) {
    // Unrounded on purpose: `Uint8ClampedArray` clamps and rounds half-to-even
    // on assignment, which is what the original relied on.
    data[idx] = blended[0];
    data[idx + 1] = blended[1];
    data[idx + 2] = blended[2];
    data[idx + 3] = blended[3] * 255;
  }
}

/**
 * The ONE Porter-Duff "over" core, shared by every compositing site.
 *
 * Returns unrounded, unclamped channels plus the output alpha as a 0-1 float,
 * or `null` when the composite is essentially transparent (`outAlpha <= 0.01`).
 * Callers apply their own rounding/clamping and decide what "essentially
 * transparent" should produce — the two behaviours the five original copies
 * disagreed about.
 *
 * @returns `[r, g, b, outAlpha01]` or `null`
 */
export function blendOverChannels(
  srcR: number, srcG: number, srcB: number, srcA: number,
  dstR: number, dstG: number, dstB: number, dstA: number
): [number, number, number, number] | null {
  const srcAlpha = srcA / 255;
  const dstAlpha = dstA / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (!(outAlpha > 0.01)) {
    return null;
  }

  const invOutAlpha = 1 / outAlpha;
  return [
    (srcR * srcAlpha + dstR * dstAlpha * (1 - srcAlpha)) * invOutAlpha,
    (srcG * srcAlpha + dstG * dstAlpha * (1 - srcAlpha)) * invOutAlpha,
    (srcB * srcAlpha + dstB * dstAlpha * (1 - srcAlpha)) * invOutAlpha,
    outAlpha,
  ];
}

/**
 * Overwrite the RGBA pixel at `idx` with a source colour — no compositing.
 *
 * This is the frame-TRACE overlay's rule: the last visible layer wins outright,
 * so a semi-transparent pixel REPLACES what is under it instead of blending.
 * Pinned from Canvas.tsx:1422-1431.
 */
export function writeOverInto(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}
