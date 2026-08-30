/**
 * The lit composite at the editor's own scale: the Preview render mode's
 * painter for the lighting studio's split workspace pane.
 *
 * Added 2026-08-29 (plan 04 — lighting preview split, task 04, decision D9).
 *
 * ## ⚠️ This is deliberately NOT `renderLightingPreview`
 *
 * `renderLightingPreview.ts` exists to letterbox a sprite into the retiring
 * 200 px floating panel: its `previewPlacement` picks
 * `zoom = max(1, floor(thumbSize / max(w, h)))` and centres the result, so an
 * object larger than the thumb gets factor 1 and is **CROPPED, not shrunk**.
 * That is correct for a fixed-size thumbnail and wrong for a workspace pane,
 * which is a real viewport driven by the shared pixel scale and its own camera.
 *
 * So this painter does no fit, no centring and no crop: the buffer **is**
 * `objWidth * zoom` × `objHeight * zoom` and the whole object is drawn into it.
 * `renderLightingPreview` stays untouched — the floating panel still uses it,
 * and its golden hashes must not move.
 *
 * ## ⚠️ THE APP CALLS THIS AT `zoom = 1` (plan 05, task 08)
 *
 * The Preview pane's canvas is now **1:1 with the pixel data** — the buffer is
 * `objWidth × objHeight` — and all magnification is a CSS
 * `scale(zoom * viewZoom)` on `.lighting-canvas__surface`. So the sentence
 * above describes the general contract, not what production does: at `zoom = 1`
 * the inverse mapping `floor(y / zoom)` collapses to the identity and this
 * whole function is a source-over copy of the lit image onto a checkerboard.
 *
 * That case is taken by the fast path below, and the general upscale is kept
 * exact and tested behind it — `__tests__/renderLitComposite.test.ts` pins the
 * golden hashes at zoom 4, and `zoom = 1` is a caller's choice rather than a
 * law of this module. The two paths composite through the SAME
 * `compositeOver` helper, so they cannot drift apart at a zoom no test happens
 * to cover. See `renderNormalEdit`'s header for the full argument; this module
 * is deliberately its structural twin.
 *
 * ## Buffer in, buffer out
 *
 * Structurally this is `renderNormalEdit`: checkerboard the whole buffer, then
 * copy (or nearest-neighbour upscale) the source with source-over compositing,
 * so a transparent lit pixel leaves the checker showing. Everything it draws is
 * `putImageData` work, so it hashes exactly under `canvasStub` with no canvas
 * backend present.
 *
 * ## The lit image is passed IN
 *
 * `composeLayers` + `renderWithLighting` (`utils/lightingRenderer`) read frames,
 * layers and variant groups — domain types holding pixel grids, which may not
 * cross into `ui/`. The container runs the lighting pipeline and hands the flat
 * RGBA result over. This module only scales and backgrounds it.
 *
 * ## What stays with the caller
 *
 * The grid lines and the pane border, exactly as in `renderNormalEdit`: both are
 * STROKED, strokes are not rasterised by the test stub, and including them here
 * would make the hash a lie about a visible element. (Those strokes are now
 * SVG chrome at the call site rather than canvas strokes — at 1:1 a stroked
 * grid degenerates into a flat wash of colour — but the split is the same and
 * for the same reason.)
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

import {
  paintCheckerboard,
  type BackgroundGeometry,
  type BackgroundTheme,
} from "./canvasBackground";
// ⚠️ ONE compositing rule, shared with this module's structural twin. Written
// twice it would be two rules that merely agree today; the golden hashes here
// and there test different zooms, so a divergence could sit green for a long
// time. `renderNormalEdit` owns it because that is where it was written first.
import { compositeOver } from "./renderNormalEdit";
import type { PixelBuffer } from "./renderLightingPreview";

export type { PixelBuffer };

export interface DrawLitCompositeOptions {
  /** The already-lit composite, 1 px per object cell (`renderWithLighting`'s output). */
  source: PixelBuffer;
  /** The object's own cell dimensions — `source` is exactly this size. */
  objWidth: number;
  objHeight: number;
  /**
   * Pixels per object cell.
   *
   * ⚠️ **The app passes 1** — the pane's canvas is 1:1 with the pixel data and
   * the CSS transform magnifies (task 08). The general contract, that the pane
   * is `objWidth * zoom` × `objHeight * zoom`, still holds for any caller that
   * wants a scaled buffer.
   */
  zoom: number;
  theme: BackgroundTheme;
}

/**
 * Composite `source` over a checkerboard into `buffer`, scaled by `zoom`.
 *
 * The background is painted first and fully opaque (as `paintCheckerboard`
 * guarantees), then each source pixel is alpha-composited over it — matching
 * `drawImage`'s default `source-over`. A fully transparent source pixel leaves
 * the checkerboard showing, which is how an empty cell reads in the preview.
 */
export function drawLitComposite(
  buffer: PixelBuffer,
  opts: DrawLitCompositeOptions,
): PixelBuffer {
  const { source, objWidth, objHeight, zoom, theme } = opts;
  const { data, width, height } = buffer;

  const geom: BackgroundGeometry = {
    canvasWidth: width,
    canvasHeight: height,
    cellsX: objWidth,
    cellsY: objHeight,
    // The preview always shows the WHOLE object starting at its own origin, so
    // the checker phase never scrolls — there is no variant offset to preserve
    // here, unlike the pixel studio's layer view.
    offsetX: 0,
    offsetY: 0,
    zoom,
  };
  paintCheckerboard(buffer, geom, theme);

  // ── 1:1 — THE PATH THE APP TAKES ────────────────────────────────────────
  //
  // `floor(y / 1)` is `y`, so the inverse mapping is the identity and the
  // general loop's per-pixel divide, multiply and bounds tests provably cannot
  // change the answer. Same arithmetic, same output.
  if (zoom === 1) {
    const maxY = Math.min(height, objHeight, source.height);
    const maxX = Math.min(width, objWidth, source.width);

    for (let y = 0; y < maxY; y++) {
      const rowSrc = y * source.width;
      const rowDst = y * width;
      for (let x = 0; x < maxX; x++) {
        const sIdx = (rowSrc + x) * 4;
        const alpha = source.data[sIdx + 3] ?? 0;
        // Transparent leaves the checkerboard showing — an empty cell.
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
    if (sy < 0 || sy >= objHeight || sy >= source.height) continue;

    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / zoom);
      if (sx < 0 || sx >= objWidth || sx >= source.width) continue;

      const sIdx = (sy * source.width + sx) * 4;
      const alpha = source.data[sIdx + 3] ?? 0;
      if (alpha === 0) continue;

      compositeOver(data, (y * width + x) * 4, source.data, sIdx, alpha);
    }
  }

  return buffer;
}
