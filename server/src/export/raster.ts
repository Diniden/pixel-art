/**
 * Layer rasterisation and PNG encoding.
 *
 * Moved VERBATIM from `src/routes/export.ts:420-484` (REFRESH task 11).
 *
 * ⚠️ THE MOST BYTE-SENSITIVE MODULE IN THE EXPORTER.
 *
 * `bufferHash` produces the texture FILENAMES (a content hash of the raw RGBA
 * buffer), so any change to the raster loops renames every texture and
 * invalidates every path recorded in `frames.json`.
 *
 * `writePng`'s sharp options are load-bearing. W2b measured that upgrading
 * sharp 0.33.5 → 0.35.3 changed 214 of 232 exported PNGs — decoded pixels were
 * bit-identical but libvips 8.15.3 → 8.18.3 re-emitted the zlib stream. That
 * upgrade is DEFERRED pending an owner decision (OPEN-QUESTIONS.md Q45); sharp
 * stays pinned at 0.33.5 and these options must not be touched.
 */

import * as crypto from "crypto";
import sharp from "sharp";

import type { CompactLayer } from "./exportTypes.js";
import {
  compactPixelToNormalHeight,
  compactPixelToRgba,
  normalizePixel,
} from "./pixelDecode.js";

export function bufferHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

export function renderLayerToColorBuffer(
  layer: CompactLayer,
  width: number,
  height: number,
): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  const pixels = layer.pixels;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const pixel = normalizePixel(row[x]);
      const rgba = compactPixelToRgba(pixel);
      const i = (y * width + x) * 4;
      buf[i] = rgba.r;
      buf[i + 1] = rgba.g;
      buf[i + 2] = rgba.b;
      buf[i + 3] = rgba.a;
    }
  }
  return buf;
}

export function renderLayerToNormalHeightBuffer(
  layer: CompactLayer,
  width: number,
  height: number,
): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  const pixels = layer.pixels;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const pixel = normalizePixel(row[x]);
      const rgba = compactPixelToNormalHeight(pixel);
      const i = (y * width + x) * 4;
      buf[i] = rgba.r;
      buf[i + 1] = rgba.g;
      buf[i + 2] = rgba.b;
      buf[i + 3] = rgba.a;
    }
  }
  return buf;
}

export async function writePng(
  buffer: Buffer,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  await sharp(buffer, { raw: { width, height, channels: 4 } })
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 100,
      effort: 10,
    })
    .toFile(outPath);
}
