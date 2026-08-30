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
 * ## Buffer in, buffer out
 *
 * Structurally this is `renderNormalEdit`: checkerboard the whole buffer, then
 * nearest-neighbour upscale the source by `zoom` with source-over compositing,
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
 * would make the hash a lie about a visible element.
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

import {
  paintCheckerboard,
  type BackgroundGeometry,
  type BackgroundTheme,
} from "./canvasBackground";
import type { PixelBuffer } from "./renderLightingPreview";

export type { PixelBuffer };

export interface DrawLitCompositeOptions {
  /** The already-lit composite, 1 px per object cell (`renderWithLighting`'s output). */
  source: PixelBuffer;
  /** The object's own cell dimensions — `source` is exactly this size. */
  objWidth: number;
  objHeight: number;
  /** Shared pixel scale. The pane is `objWidth * zoom` × `objHeight * zoom`. */
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

  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / zoom);
    if (sy < 0 || sy >= objHeight || sy >= source.height) continue;

    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / zoom);
      if (sx < 0 || sx >= objWidth || sx >= source.width) continue;

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
      data[idx] = Math.round(
        (source.data[sIdx] ?? 0) * a + (data[idx] ?? 0) * (1 - a),
      );
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
