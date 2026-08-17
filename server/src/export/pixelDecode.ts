/**
 * Pure pixel decoding for the exporter.
 *
 * Moved VERBATIM from `src/routes/export.ts:372-418` (REFRESH task 11).
 *
 * ⚠️ `normalizePixel` is a SECOND implementation of the client's legacy-pixel
 * migration (M7). Unlike the client's `migrateLegacyPixel`
 * (`client/src/types/index.ts:1061-1069`), this one IS array-safe: the
 * `Array.isArray(pixel) && pixel.length >= 3` guard runs BEFORE the number
 * branch, so an already-migrated `[c,n,h]` tuple is returned unchanged rather
 * than being re-wrapped into `[[c,n,h], 0, 1]`.
 *
 * Task 07 pinned BOTH implementations as characterisation tests. Do NOT "fix"
 * this one, and do NOT make it call the client's — the two disagree
 * deliberately and the disagreement is pinned, not resolved.
 */

import type { CompactPixelData } from "./exportTypes.js";

// Decode compact pixel to RGBA color (0,0,0,0 for empty)
export function compactPixelToRgba(pixel: CompactPixelData): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (pixel === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const [colorHex] = pixel;
  if (colorHex === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (colorHex >>> 24) & 0xff,
    g: (colorHex >>> 16) & 0xff,
    b: (colorHex >>> 8) & 0xff,
    a: colorHex & 0xff,
  };
}

// Decode compact pixel to normal+height RGBA (R=x+128, G=y+128, B=z, A=height; 0,0,0,0 if empty)
export function compactPixelToNormalHeight(pixel: CompactPixelData): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (pixel === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const [, normalPacked, height] = pixel;
  if (normalPacked === 0 && height === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const x = ((normalPacked >>> 16) & 0xff) - 128;
  const y = ((normalPacked >>> 8) & 0xff) - 128;
  const z = normalPacked & 0xff;
  return {
    r: Math.max(0, Math.min(255, x + 128)),
    g: Math.max(0, Math.min(255, y + 128)),
    b: z,
    a: Math.max(0, Math.min(255, height)),
  };
}

// Migrate legacy pixel (single number) to compact tuple
export function normalizePixel(pixel: unknown): CompactPixelData {
  if (pixel === 0 || pixel === null || pixel === undefined) return 0;
  if (Array.isArray(pixel) && pixel.length >= 3)
    return pixel as CompactPixelData;
  if (typeof pixel === "number") return [pixel, 0, 1]; // legacy: color only
  return 0;
}
