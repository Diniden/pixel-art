/**
 * drawLayerView — the painter for the Layer Render Mode (split-canvas plan,
 * 2026-08-29, task 04). Called from the Layer render branch of
 * `containers/CanvasContainer.tsx` (task 05).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NO OFFSET, NO DIMMING, NO VIEW UNION — THE LAYER'S OWN CANVAS ONLY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The Full view composites every layer of the object and places a variant
 * inside the union of the object grid and the variant's offset rectangle. The
 * Layer view is the opposite: it draws ONE canvas — the selected variant's own
 * `gridSize`, or a regular layer on the object grid — at the origin, with no
 * `variantOffset` applied, no `layerFocusMode` dimming (there is nothing else
 * on screen to dim against) and nothing clipped to a union rectangle.
 *
 * Technique: `ctx.fillStyle = rgba(...)` + `ctx.fillRect` per cell, the same
 * as the Full render in `CanvasContainer`, and deliberately NOT the buffer
 * compositor in `renderScene.ts` — alpha compositing differs visibly between
 * the two (see the comment above `render` in `CanvasContainer`), and the two
 * panes must agree on what a half-transparent pixel looks like.
 *
 * Cells are opaque to this module: `getPixelColor` turns a cell into an
 * `RgbaPixel` or `null`, exactly as every other painter in this folder.
 * `pixels` is received by reference — never observed — and the caller redraws
 * on `pixelVersion`.
 *
 * Pure: no store, no MobX, no API.
 */

import type { RgbaPixel } from "./renderScene";

/** The slice of a layer the painter needs. `id` is only for `movesWithDrag`. */
export interface LayerViewLayer {
  visible: boolean;
  pixels?: ReadonlyArray<ReadonlyArray<unknown>> | undefined;
  id?: string | undefined;
}

export interface DrawLayerViewOptions {
  /** Painted in array order (bottom → top). */
  layers: ReadonlyArray<LayerViewLayer>;
  /** The layer's OWN canvas size — cells outside it are never painted. */
  gridWidth: number;
  gridHeight: number;
  /** Pixel scale: screen pixels per cell. */
  zoom: number;
  getPixelColor: (cell: unknown) => RgbaPixel | null;
  /** Move-tool live preview: shift cells of layers for which `movesWithDrag(layer)` is true. */
  moveDx?: number;
  moveDy?: number;
  movesWithDrag?: (layer: LayerViewLayer) => boolean;
}

/**
 * Paint `layers` into `ctx` at `zoom`, cell by cell.
 *
 * Skips invisible layers, missing rows, `null` cells and fully transparent
 * cells. A layer selected by `movesWithDrag` is shifted by `moveDx`/`moveDy`
 * and any cell that leaves the grid is dropped, matching the Full render's
 * move preview.
 */
export function drawLayerView(
  ctx: CanvasRenderingContext2D,
  opts: DrawLayerViewOptions,
): void {
  const { layers, gridWidth, gridHeight, zoom, getPixelColor } = opts;
  const moveDx = opts.moveDx ?? 0;
  const moveDy = opts.moveDy ?? 0;

  for (const layer of layers) {
    if (!layer.visible) continue;
    const pixels = layer.pixels;
    if (!pixels) continue;

    const shifted =
      (moveDx !== 0 || moveDy !== 0) && opts.movesWithDrag?.(layer) === true;
    const dx = shifted ? moveDx : 0;
    const dy = shifted ? moveDy : 0;

    const rows = Math.min(gridHeight, pixels.length);
    for (let y = 0; y < rows; y++) {
      const row = pixels[y];
      if (!row) continue;
      const cols = Math.min(gridWidth, row.length);
      for (let x = 0; x < cols; x++) {
        const color = getPixelColor(row[x]);
        if (!color || color.a === 0) continue;

        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= gridWidth || py >= gridHeight) continue;

        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }
  }
}
