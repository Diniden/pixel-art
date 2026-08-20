/**
 * The lighting studio's EDITABLE surface: the normal / height visualisation,
 * scaled onto the checkerboard background.
 *
 * Extracted from `LightingCanvas.tsx:249-312` (`renderEdit`), which is the last
 * of the file's three renderers to reach `ui/canvas/render/` (REFRESH task 33).
 *
 * ## Buffer in, buffer out (MASTER.md §9.10)
 *
 * The original drew through a `ctx`: `putImageData` for the checkerboard, then a
 * `drawImage` of a 1:1 temp canvas scaled up by `zoom`, then a stroked grid.
 * Only the middle step is genuinely canvas work, and only because `drawImage`
 * was doing the nearest-neighbour upscale. That upscale is four lines of
 * arithmetic, so it is done here instead and the whole renderer becomes a pure
 * buffer producer — hashable by `canvasStub` with no canvas backend present.
 *
 * ⚠️ `drawImage` with `imageSmoothingEnabled = false` is nearest-neighbour, and
 * `canvasWidth === gridWidth * zoom` exactly (integer zoom), so the mapping is
 * the exact `floor(x / zoom)` reproduced below. There is no resampling to drift
 * from. The one case the original could hit and this cannot is a non-integer
 * zoom, which `uiState.zoom` never holds.
 *
 * ## What stays with the caller
 *
 * The GRID is stroked, and strokes cannot be rasterised by the stub, so it stays
 * `strokeGrid(ctx, …)` at the call site exactly as `Canvas` does it — the same
 * split `canvasBackground` already draws between `paintCheckerboard` (buffer)
 * and `strokeGrid` (context).
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

import {
  paintCheckerboard,
  type BackgroundGeometry,
  type BackgroundTheme,
} from "./canvasBackground";

/** A minimal structural stand-in for `ImageData`. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RenderNormalEditOptions {
  /**
   * The 1:1 visualisation of the layer's normal or height channel, exactly as
   * `renderNormalAsRGB` / `renderHeightAsGrayscale` produce it. `gridWidth ×
   * gridHeight`.
   *
   * ⚠️ It is passed IN rather than computed here on purpose: those two
   * functions read a `Layer`, i.e. a domain type and a pixel grid, and R2 says
   * a grid may not cross into `ui/`. The caller reads the grid; this module
   * only scales the result.
   */
  source: PixelBuffer;
  /** Cells across and down — `source`'s dimensions. */
  gridWidth: number;
  gridHeight: number;
  /** Pixels per cell. */
  zoom: number;
  /** The checkerboard palette, from `backgroundTheme(lightGridMode)`. */
  theme: BackgroundTheme;
}

/**
 * Composite `source` over a checkerboard into `buffer`, scaled by `zoom`.
 *
 * The background is painted first and fully opaque (as `paintCheckerboard`
 * guarantees), then each source pixel is alpha-composited over it — matching
 * `drawImage`'s default `source-over`. A fully transparent source pixel leaves
 * the checkerboard showing, which is how an unpainted cell reads in the studio.
 */
export function renderNormalEdit(
  buffer: PixelBuffer,
  opts: RenderNormalEditOptions,
): PixelBuffer {
  const { source, gridWidth, gridHeight, zoom, theme } = opts;
  const { data, width, height } = buffer;

  const geom: BackgroundGeometry = {
    canvasWidth: width,
    canvasHeight: height,
    cellsX: gridWidth,
    cellsY: gridHeight,
    // The lighting studio never scrolls its checker phase: the editable surface
    // always starts at the grid origin, in object space AND in variant-edit
    // mode (the variant is rendered at its own 0,0, not at its object offset).
    // `LightingCanvas` had no offset concept at all; passing 0 preserves that.
    offsetX: 0,
    offsetY: 0,
    zoom,
  };
  paintCheckerboard(buffer, geom, theme);

  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / zoom);
    if (sy < 0 || sy >= gridHeight || sy >= source.height) continue;

    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / zoom);
      if (sx < 0 || sx >= gridWidth || sx >= source.width) continue;

      const sIdx = (sy * source.width + sx) * 4;
      const alpha = source.data[sIdx + 3] ?? 0;
      if (alpha === 0) continue;

      const idx = (y * width + x) * 4;
      if (alpha === 255) {
        data[idx] = source.data[sIdx] ?? 0;
        data[idx + 1] = source.data[sIdx + 1] ?? 0;
        data[idx + 2] = source.data[sIdx + 2] ?? 0;
        data[idx + 3] = 255;
        continue;
      }

      // Source-over against an opaque destination: the destination stays
      // opaque, so the standard formula collapses to a plain lerp.
      const a = alpha / 255;
      data[idx] = Math.round((source.data[sIdx] ?? 0) * a + (data[idx] ?? 0) * (1 - a));
      data[idx + 1] = Math.round(
        (source.data[sIdx + 1] ?? 0) * a + (data[idx + 1] ?? 0) * (1 - a),
      );
      data[idx + 2] = Math.round(
        (source.data[sIdx + 2] ?? 0) * a + (data[idx + 2] ?? 0) * (1 - a),
      );
      data[idx + 3] = 255;
    }
  }

  return buffer;
}
