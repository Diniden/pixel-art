/**
 * The Brush Studio's frame compositor (Brush Studio plan, task 06).
 *
 * Turns a brush frame's layers — grids of signed delta cells — into ONE
 * `width × height` RGBA `PixelBuffer`: every cell is colourised through the
 * D5 mapping (`brushCellToRgba`, 127 = zero delta) and composited with
 * Porter-Duff "over", bottom layer first. `renderBrushLayer` is the
 * single-layer variant the timeline thumbnails use.
 *
 * ## Why this composites into one buffer when `renderLayerView` refused to
 *
 * `renderLayerView`'s header explains that the pixel studio gives every layer
 * its own canvas and lets the browser composite. The brush canvas does not:
 * task 16 feeds this buffer to `renderNormalEdit`, which takes exactly one
 * `source: PixelBuffer` and scales it onto the checkerboard. A brush is at most
 * a handful of small layers (16×16 by default), so per-cell JS compositing is
 * the simpler arrangement and costs nothing measurable.
 *
 * ## The compositing rule, byte for byte
 *
 * Every painted cell goes through `blendOverInto` — the ONE shared Porter-Duff
 * core (`utils/alphaBlend.ts`), including opaque cells. Two consequences that
 * are pinned by the tests and must stay true:
 *
 *  - An `hsl`/`rgb` cell with an A delta of `0` renders at alpha 127, so it
 *    genuinely BLENDS with whatever is below it (MASTER §1, "Alpha channel
 *    rendering").
 *  - An `hsl`/`rgb` cell with an A delta of `-255` renders at alpha 0.
 *    `blendOverInto` leaves the destination UNTOUCHED for an essentially
 *    transparent composite, so such a cell contributes nothing — it does not
 *    zero what is beneath it.
 *
 * ## Clipping
 *
 * Cells are read only inside `width × height` AND inside the buffer. A grid
 * larger than the document (a stale layer) is truncated; a buffer smaller than
 * the document is never overrun. Missing rows and `0` cells are skipped.
 *
 * Grids are received by reference and never observed — the caller redraws on
 * `pixelVersion` (MASTER D8).
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

import { brushCellToRgba } from "@/types/brush";
import type { BrushCell, BrushChannelType } from "@/types/brush";
import { blendOverInto } from "@/utils/alphaBlend";
// `PixelBuffer` is IMPORTED from the module task 16 hands this buffer to, so
// the two agree by construction rather than by structural coincidence. The
// task file names `./renderScene`, but that compositor was deleted by plan 05
// (see `renderLayerView.ts`'s header); `renderNormalEdit` is its consumer.
import type { PixelBuffer } from "./renderNormalEdit";

export type { PixelBuffer };

/** The slice of a `BrushLayer` the compositor needs. */
export interface BrushSceneLayer {
  /** Signed delta cells, `[y][x]`; `0` is unpainted. Read only, never observed. */
  pixels: ReadonlyArray<ReadonlyArray<BrushCell>>;
  channelType: BrushChannelType;
  visible: boolean;
}

export interface RenderBrushFrameOptions {
  /** Composited in array order (bottom → top). Hidden layers are skipped. */
  layers: ReadonlyArray<BrushSceneLayer>;
  /** The document's extent, in cells. Cells outside it are never read. */
  width: number;
  height: number;
}

/**
 * Allocate a zero-filled (fully transparent) `width × height` RGBA buffer,
 * exactly as a fresh canvas starts. Non-integer or negative sizes are floored
 * and clamped to 0 so a bad document size cannot throw from a `TypedArray`
 * constructor mid-render.
 */
export function createBrushBuffer(width: number, height: number): PixelBuffer {
  const w = Math.max(0, Math.floor(width)) || 0;
  const h = Math.max(0, Math.floor(height)) || 0;
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}

/**
 * Paint one layer's cells over whatever is already in `buffer`.
 *
 * Does NOT clear and does NOT consult `visible` — the two entry points below
 * own those decisions. Factored out so the frame and the single-layer paths
 * cannot drift: a drift here is a thumbnail that disagrees with the canvas.
 */
function paintBrushLayer(
  buffer: PixelBuffer,
  layer: BrushSceneLayer,
  width: number,
  height: number,
): void {
  const { pixels, channelType } = layer;
  const { data } = buffer;
  const rows = Math.min(height, buffer.height, pixels.length);
  const stride = buffer.width;

  for (let y = 0; y < rows; y++) {
    const row = pixels[y];
    if (!row) continue;
    const cols = Math.min(width, stride, row.length);
    for (let x = 0; x < cols; x++) {
      const cell = row[x];
      if (cell === 0 || cell === undefined) continue;
      const color = brushCellToRgba(cell, channelType);
      if (!color) continue;
      blendOverInto(
        data,
        (y * stride + x) * 4,
        color.r,
        color.g,
        color.b,
        color.a,
      );
    }
  }
}

/**
 * Clears `buffer` to transparent, then composites every VISIBLE layer
 * bottom → top. Returns `buffer` for chaining.
 */
export function renderBrushFrame(
  buffer: PixelBuffer,
  opts: RenderBrushFrameOptions,
): PixelBuffer {
  const { layers, width, height } = opts;
  buffer.data.fill(0);
  for (const layer of layers) {
    if (!layer.visible) continue;
    paintBrushLayer(buffer, layer, width, height);
  }
  return buffer;
}

/**
 * One layer, no compositing with siblings — for the timeline thumbnails and
 * the "solo" preview. Clears `buffer` first, then paints the layer whether or
 * not it is `visible`: a hidden layer's thumbnail still shows what it holds,
 * as the pixel studio's layer rows do. Returns `buffer`.
 */
export function renderBrushLayer(
  buffer: PixelBuffer,
  layer: BrushSceneLayer,
  width: number,
  height: number,
): PixelBuffer {
  buffer.data.fill(0);
  paintBrushLayer(buffer, layer, width, height);
  return buffer;
}
