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
 * ## ⚠️ THE APP CALLS THIS AT `zoom = 1`, AND THE UPSCALE IS DEAD CODE THERE
 *
 * **The comment that stood here is gone, and this replaces it.** It read:
 *
 * > `drawImage` with `imageSmoothingEnabled = false` is nearest-neighbour, and
 * > `canvasWidth === gridWidth * zoom` exactly (integer zoom), so the mapping
 * > is the exact `floor(x / zoom)` reproduced below.
 *
 * That invariant was retired by plan 05 task 08. `LightingCanvasContainer`'s
 * canvases are now **1:1 with the pixel data** — `canvasWidth === gridWidth`,
 * full stop — and every magnification is a CSS `scale(zoom * viewZoom)` on
 * `.lighting-canvas__surface`. Leaving the old text would have told the next
 * reader that a relationship holds which the only production caller has
 * stopped maintaining, which is a worse failure than no comment at all.
 *
 * So the honest statement of the mapping now is: at the `zoom = 1` the app
 * passes, `floor(y / zoom)` collapses to `y` and this whole function is a
 * source-over copy of `source` onto a checkerboard, one output pixel per
 * source pixel. That case is taken by the fast path below — not as an
 * optimisation for its own sake, but because a divide, two bounds tests and a
 * multiply per pixel that provably cannot change the answer are noise in a
 * function called on every committed pixel edit.
 *
 * ### Why `zoom` survives in the signature anyway
 *
 * The general upscale is kept, exact and tested, for two reasons. It is the
 * function's documented contract and the golden hashes in
 * `__tests__/renderNormalEdit.test.ts` pin it at zoom 4; and `zoom = 1` is a
 * caller's choice, not a law of this module — nothing here should forbid a
 * future caller (an export, a thumbnail) from asking for a scaled buffer. The
 * two paths are proven equivalent by construction: at `zoom = 1` the general
 * loop's `sx`/`sy` are `x`/`y` and its bounds tests are the fast path's.
 *
 * ## What stays with the caller
 *
 * The GRID. It was `strokeGrid(ctx, …)` at the call site; under 1:1 that
 * painter places one line per pixel column and degenerates into a flat wash of
 * `gridStroke` over the whole canvas — a SILENT failure, no error and no
 * artifact — so the caller now renders `ui/canvas/svg/gridOverlay`'s `<path>`
 * instead. Either way it is not this module's: strokes cannot be rasterised by
 * the test stub, which is the split `canvasBackground` already draws between
 * `paintCheckerboard` (buffer) and `strokeGrid` (context).
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
  /**
   * Pixels per cell.
   *
   * ⚠️ **The app passes 1.** See the header: the lighting canvases are 1:1 with
   * the pixel data and the CSS transform magnifies. Anything else is a caller
   * asking for a scaled buffer for its own reasons, which is still supported
   * and still exact.
   */
  zoom: number;
  /** The checkerboard palette, from `backgroundTheme(lightGridMode)`. */
  theme: BackgroundTheme;
}

/**
 * Source-over one source pixel onto an already-opaque destination pixel.
 *
 * Factored out so the 1:1 path and the upscaling path composite through the
 * SAME arithmetic — if they diverged, the golden hashes would only catch it at
 * the zoom they happen to test. Returns nothing; writes through `data`.
 */
export function compositeOver(
  data: Uint8ClampedArray,
  idx: number,
  src: Uint8ClampedArray,
  sIdx: number,
  alpha: number,
): void {
  if (alpha === 255) {
    data[idx] = src[sIdx] ?? 0;
    data[idx + 1] = src[sIdx + 1] ?? 0;
    data[idx + 2] = src[sIdx + 2] ?? 0;
    data[idx + 3] = 255;
    return;
  }

  // Source-over against an opaque destination: the destination stays opaque,
  // so the standard formula collapses to a plain lerp.
  const a = alpha / 255;
  data[idx] = Math.round((src[sIdx] ?? 0) * a + (data[idx] ?? 0) * (1 - a));
  data[idx + 1] = Math.round(
    (src[sIdx + 1] ?? 0) * a + (data[idx + 1] ?? 0) * (1 - a),
  );
  data[idx + 2] = Math.round(
    (src[sIdx + 2] ?? 0) * a + (data[idx + 2] ?? 0) * (1 - a),
  );
  data[idx + 3] = 255;
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

  // ── 1:1 — THE PATH THE APP TAKES ────────────────────────────────────────
  //
  // `floor(y / 1)` is `y`, so the inverse mapping is the identity and every
  // per-pixel divide, multiply and bounds test in the general loop below
  // provably cannot change the answer. Same arithmetic, same output, no
  // scaling machinery.
  if (zoom === 1) {
    const maxY = Math.min(height, gridHeight, source.height);
    const maxX = Math.min(width, gridWidth, source.width);

    for (let y = 0; y < maxY; y++) {
      const rowSrc = y * source.width;
      const rowDst = y * width;
      for (let x = 0; x < maxX; x++) {
        const sIdx = (rowSrc + x) * 4;
        const alpha = source.data[sIdx + 3] ?? 0;
        // Transparent leaves the checkerboard showing — an unpainted cell.
        if (alpha === 0) continue;
        compositeOver(data, (rowDst + x) * 4, source.data, sIdx, alpha);
      }
    }

    return buffer;
  }

  // ── the general nearest-neighbour upscale ───────────────────────────────
  //
  // Kept exact and tested; see the header for why it survives even though no
  // production caller reaches it.
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / zoom);
    if (sy < 0 || sy >= gridHeight || sy >= source.height) continue;

    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / zoom);
      if (sx < 0 || sx >= gridWidth || sx >= source.width) continue;

      const sIdx = (sy * source.width + sx) * 4;
      const alpha = source.data[sIdx + 3] ?? 0;
      if (alpha === 0) continue;

      compositeOver(data, (y * width + x) * 4, source.data, sIdx, alpha);
    }
  }

  return buffer;
}
