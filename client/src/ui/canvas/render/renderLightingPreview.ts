/**
 * The floating lighting-preview thumbnail: a lit composite of the current
 * frame, letterboxed inside a fixed square.
 *
 * Extracted from `LightingCanvas.tsx:212-247` (`renderPreview`), REFRESH task 33.
 *
 * ## Buffer in, buffer out (MASTER.md §9.10)
 *
 * The original was `ctx` work end to end: a base `fillRect`, an O(w·h) `fillRect`
 * checkerboard, a `drawImage` of the lit `ImageData` upscaled by an integer
 * factor, and a stroked border. Everything but the border is exactly expressible
 * as buffer writes, so it is, and the renderer hashes with no canvas backend.
 *
 * ⚠️ THE BORDER IS NOT DRAWN HERE. `ctx.strokeRect(0.5, 0.5, …)` is a stroke;
 * `canvasStub` records strokes but does not rasterise them, so including it
 * would make the hash a lie about a visible element. It stays at the call site
 * with the other unhashable drawing, and {@link PREVIEW_BORDER} carries the
 * settled values so the two cannot drift apart silently.
 *
 * ## The lit image is passed IN
 *
 * `composeLayers` + `renderWithLighting` (`utils/lightingRenderer`) read frames,
 * layers and variant groups — domain types holding pixel grids, which R2 forbids
 * crossing into `ui/`. The caller runs them and hands the result over as a flat
 * RGBA buffer. This module's job is placement, background and scaling.
 *
 * ## What the ORIGINAL did that is preserved exactly
 *
 * - The thumbnail is 200×200 and the fit factor is `max(1, floor(200 / max(w,h)))`
 *   — an INTEGER zoom, so the upscale stays nearest-neighbour and the sprite
 *   stays crisp. A sprite larger than 200 gets factor 1 and is CROPPED, not
 *   shrunk. That is the legacy behaviour, kept.
 * - The checkerboard is drawn only under the sprite's rect, not across the whole
 *   thumbnail — the surrounding margin keeps the flat base colour.
 * - The checker parity and colours come from the SHARED `backgroundTheme`, whose
 *   dark values (`#1a1a25` / `#2a2a3a` / `#222230`) are byte-identical to the
 *   three the original hard-coded.
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

import { ACCENT_PRIMARY_25 } from "../../theme/canvasTokens";
import type { BackgroundTheme } from "./canvasBackground";

/** A minimal structural stand-in for `ImageData`. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The thumbnail's side, in pixels. `LightingCanvas.tsx:216`. */
export const PREVIEW_THUMB_SIZE = 200;

/**
 * The border the CALLER strokes after this renderer runs, verbatim from
 * `LightingCanvas.tsx:244-246`. Here because it is unhashable, not because it
 * is optional.
 */
export const PREVIEW_BORDER = {
  strokeStyle: ACCENT_PRIMARY_25,
  lineWidth: 2,
} as const;

export interface PreviewPlacement {
  /** Integer upscale factor. */
  zoom: number;
  /** Top-left of the sprite inside the thumbnail. */
  offsetX: number;
  offsetY: number;
  /** Drawn size of the sprite. */
  drawWidth: number;
  drawHeight: number;
}

/**
 * Where the sprite lands inside the thumbnail — the original's fit maths,
 * lifted out so it can be asserted directly rather than only through a hash.
 */
export function previewPlacement(
  objWidth: number,
  objHeight: number,
  thumbSize: number = PREVIEW_THUMB_SIZE,
): PreviewPlacement {
  const zoom = Math.max(
    1,
    Math.floor(thumbSize / Math.max(objWidth, objHeight)),
  );
  const drawWidth = objWidth * zoom;
  const drawHeight = objHeight * zoom;
  return {
    zoom,
    offsetX: Math.floor((thumbSize - drawWidth) / 2),
    offsetY: Math.floor((thumbSize - drawHeight) / 2),
    drawWidth,
    drawHeight,
  };
}

export interface RenderLightingPreviewOptions {
  /**
   * The lit composite at 1:1, `objWidth × objHeight`, as
   * `renderWithLighting(composeLayers(…), …)` returns it.
   */
  lit: PixelBuffer;
  /** The BASE OBJECT's grid size — the preview never uses the variant's. */
  objWidth: number;
  objHeight: number;
  /** The checkerboard palette. Dark reproduces the legacy hard-coded colours. */
  theme: BackgroundTheme;
  /** Thumbnail side. Defaults to the legacy 200. */
  thumbSize?: number;
}

/**
 * Paint the lighting-preview thumbnail into `buffer`, returning it.
 *
 * `buffer` must be `thumbSize × thumbSize`. Every pixel is written, so a reused
 * buffer needs no clearing — matching the original, which `clearRect`ed and then
 * immediately covered the whole square with its base fill.
 */
export function renderLightingPreview(
  buffer: PixelBuffer,
  opts: RenderLightingPreviewOptions,
): PixelBuffer {
  const {
    lit,
    objWidth,
    objHeight,
    theme,
    thumbSize = PREVIEW_THUMB_SIZE,
  } = opts;
  const { data, width, height } = buffer;

  // 1. Base fill across the whole thumbnail (`#1a1a25` in the dark theme —
  //    the exact colour the original hard-coded).
  const { base } = theme;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = base.r;
    data[i + 1] = base.g;
    data[i + 2] = base.b;
    data[i + 3] = 255;
  }

  const { zoom, offsetX, offsetY } = previewPlacement(
    objWidth,
    objHeight,
    thumbSize,
  );

  // 2. Checkerboard, UNDER THE SPRITE ONLY — the original looped `objHeight ×
  //    objWidth` cells starting at (offsetX, offsetY), leaving the margin flat.
  for (let py = 0; py < objHeight; py++) {
    for (let px = 0; px < objWidth; px++) {
      const color = (px + py) % 2 === 0 ? theme.color1 : theme.color2;
      const startX = offsetX + px * zoom;
      const startY = offsetY + py * zoom;

      for (let dy = 0; dy < zoom; dy++) {
        const y = startY + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = 0; dx < zoom; dx++) {
          const x = startX + dx;
          if (x < 0 || x >= width) continue;
          const idx = (y * width + x) * 4;
          data[idx] = color.r;
          data[idx + 1] = color.g;
          data[idx + 2] = color.b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  // 3. The lit sprite, nearest-neighbour upscaled and source-over composited.
  for (let py = 0; py < objHeight; py++) {
    if (py >= lit.height) break;
    for (let px = 0; px < objWidth; px++) {
      if (px >= lit.width) break;

      const sIdx = (py * lit.width + px) * 4;
      const alpha = lit.data[sIdx + 3] ?? 0;
      if (alpha === 0) continue;

      const a = alpha / 255;
      const sr = lit.data[sIdx] ?? 0;
      const sg = lit.data[sIdx + 1] ?? 0;
      const sb = lit.data[sIdx + 2] ?? 0;

      const startX = offsetX + px * zoom;
      const startY = offsetY + py * zoom;

      for (let dy = 0; dy < zoom; dy++) {
        const y = startY + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = 0; dx < zoom; dx++) {
          const x = startX + dx;
          if (x < 0 || x >= width) continue;
          const idx = (y * width + x) * 4;
          if (alpha === 255) {
            data[idx] = sr;
            data[idx + 1] = sg;
            data[idx + 2] = sb;
          } else {
            // Destination is opaque, so source-over is a plain lerp.
            data[idx] = Math.round(sr * a + (data[idx] ?? 0) * (1 - a));
            data[idx + 1] = Math.round(sg * a + (data[idx + 1] ?? 0) * (1 - a));
            data[idx + 2] = Math.round(sb * a + (data[idx + 2] ?? 0) * (1 - a));
          }
          data[idx + 3] = 255;
        }
      }
    }
  }

  return buffer;
}
