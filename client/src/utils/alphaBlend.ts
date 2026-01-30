import { Pixel, PixelData } from '../types';

/**
 * Blends two pixels using proper alpha compositing.
 * This produces the same visual result as stacking layers.
 *
 * @param src - Source pixel (from upper layer)
 * @param dst - Destination pixel (from lower layer)
 * @returns Blended pixel
 */
export function alphaBlend(src: Pixel, dst: Pixel): Pixel {
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

