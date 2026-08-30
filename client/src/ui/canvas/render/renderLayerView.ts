/**
 * The per-layer painter — ONE layer's cells into ONE 1:1 canvas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS IS WHERE "EVERY PIXEL OF EVERY LAYER ON EVERY EDIT" DIED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Originally `drawLayerView`, the painter for the split-canvas Layer Render
 * Mode (2026-08-29). Plan 05 task 05 GENERALISED it — it did not replace it —
 * into the painter every branch of `CanvasContainer`'s render now goes
 * through: Full mode, Layer mode and variant-edit alike.
 *
 * What changed, and why each change was necessary:
 *
 *  1. **`paintLayerCells` paints into an `ImageData`, not with `fillRect`.**
 *     See the strategy note below. `drawLayerView` is retained on top of it
 *     as the `CanvasRenderingContext2D` entry point, unchanged in behaviour
 *     and still covered by its original tests.
 *  2. **A cell OFFSET** (`offsetX`/`offsetY`), so a variant's cells land at
 *     their `variantOffset` and the whole view can be shifted by `-viewMin`
 *     in variant-edit mode. `drawLayerView`'s callers passed neither before
 *     because the Layer view draws at the origin; both default to 0, so that
 *     caller is unaffected.
 *  3. **Onion-outline support** (`onionOutline`), the 4-neighbour emptiness
 *     test lifted verbatim from `CanvasContainer`'s `isOutlineCell`.
 *     ⚠️ Onion is NOT an opacity and must never be expressed as one — a
 *     dimmed layer is a solid silhouette, which is the opposite of an
 *     outline. It is a paint-time decision and it lives HERE.
 *  4. **A separate clip rectangle** (`clipWidth`/`clipHeight`), because the
 *     grid a cell is READ from and the surface it is DRAWN into are no longer
 *     the same rectangle once an offset exists.
 *
 * ── ⚠️ THE PAINTING STRATEGY, AND WHY IT IS `putImageData` ────────────────
 *
 * At 1:1 a cell is one device pixel, so `fillRect(x, y, 1, 1)` would work.
 * It is not what this does, for two measured reasons:
 *
 *   - **String allocation.** The old loop built one `rgba(r, g, b, a)` string
 *     per painted cell. On the owner's `Landscapes` project that is 57,344
 *     string allocations per repaint, per edit.
 *   - **Call count.** One `putImageData` replaces N `fillRect` calls.
 *
 * Measured under Bun on the JS half alone (256×224, the Landscapes grid):
 * building the strings costs **1.40 ms** per full repaint, writing the same
 * cells as `ImageData` indices costs **0.51 ms** — 2.7× before a single
 * canvas call is counted.
 *
 * ── ⚠️ AND WHY THAT DOES NOT CHANGE ALPHA COMPOSITING (RISK R4) ───────────
 *
 * `putImageData` REPLACES the destination; it does not composite. That is
 * safe here, and it is safe for one specific structural reason: **the caller
 * gives every non-overlapping cell set its own canvas.** A layer's pixel grid
 * holds exactly one cell per (x, y), so within one call no two writes can
 * land on the same pixel — the source-over blend below is reached only where
 * a caller deliberately paints two grids into one buffer, and
 * `CanvasContainer` never does (a variant's sub-layers each get a canvas of
 * their own).
 *
 * Cross-layer compositing is therefore the browser's, via the stacked
 * canvases and CSS `opacity` (D4), rather than a per-cell alpha multiply in
 * JS. That IS a real change for semi-transparent pixels — CSS `opacity`
 * applies to a composited layer as a whole where the old code multiplied per
 * cell before compositing — and it is plan 05's accepted risk R4, not
 * something introduced by the buffer.
 *
 * This is also why `renderScene.ts`'s compositor was deleted rather than
 * adopted (D10): its model was to composite EVERY layer into ONE buffer,
 * which is exactly the arrangement this replaces.
 *
 * Cells are opaque to this module: `getPixelColor` turns a cell into an
 * `RgbaPixel` or `null`, exactly as every other painter in this folder.
 * `pixels` is received by reference — never observed — and the caller redraws
 * on `pixelVersion`.
 *
 * Pure: no store, no MobX, no API.
 */

/** An RGBA colour, 0-255 per channel. */
export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A minimal structural stand-in for `ImageData`. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The slice of a layer the painter needs. `id` is only for `movesWithDrag`. */
export interface LayerViewLayer {
  visible: boolean;
  pixels?: ReadonlyArray<ReadonlyArray<unknown>> | undefined;
  id?: string | undefined;
}

/** What `paintLayerCells` needs to place one grid into one buffer. */
export interface PaintLayerOptions {
  /** The layer's own cell grid. Cells outside it are never read. */
  pixels: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Extent of THAT grid, in its own cells. */
  gridWidth: number;
  gridHeight: number;
  getPixelColor: (cell: unknown) => RgbaPixel | null;
  /**
   * Cell offset applied on the way into the buffer — the variant offset minus
   * the view origin, in `CanvasContainer`'s use. Default 0.
   */
  offsetX?: number;
  offsetY?: number;
  /**
   * Move-tool live preview: every cell is shifted by this much IN GRID SPACE
   * and any cell that leaves `gridWidth × gridHeight` is DROPPED — matching
   * what the eventual commit does. Default 0.
   */
  moveDx?: number;
  moveDy?: number;
  /**
   * Outline-only rendering (`layerFocusMode === "onion"`). A painted cell is
   * drawn only when at least one 4-adjacent neighbour is empty; out-of-bounds
   * neighbours count as empty, so a silhouette touching the grid border keeps
   * its edge.
   *
   * ⚠️ Evaluated on the UNSHIFTED cell, so a move preview does not change
   * which cells are outline cells — only where they land.
   */
  onionOutline?: boolean;
}

/**
 * Paint one layer's cells into `buffer`.
 *
 * The buffer is NOT cleared: the caller owns that, and painting two grids
 * into one buffer (source-over) is legal — see the header for when it is
 * safe. Writes are clipped to the buffer, so an offset that pushes cells off
 * the surface is harmless.
 */
export function paintLayerCells(
  buffer: PixelBuffer,
  opts: PaintLayerOptions,
): PixelBuffer {
  const { pixels, gridWidth, gridHeight, getPixelColor } = opts;
  const { data, width, height } = buffer;
  const offsetX = opts.offsetX ?? 0;
  const offsetY = opts.offsetY ?? 0;
  const moveDx = opts.moveDx ?? 0;
  const moveDy = opts.moveDy ?? 0;
  const onion = opts.onionOutline === true;

  const rows = Math.min(gridHeight, pixels.length);
  for (let y = 0; y < rows; y++) {
    const row = pixels[y];
    if (!row) continue;
    const cols = Math.min(gridWidth, row.length);

    for (let x = 0; x < cols; x++) {
      const color = getPixelColor(row[x]);
      if (!color || color.a === 0) continue;

      // Outline test on the UNSHIFTED cell — see `onionOutline`.
      if (onion && !isOutlineCell(pixels, x, y, gridWidth, gridHeight, getPixelColor)) {
        continue;
      }

      // The move preview clips in GRID space, before the offset.
      const sx = x + moveDx;
      const sy = y + moveDy;
      if (sx < 0 || sy < 0 || sx >= gridWidth || sy >= gridHeight) continue;

      const px = sx + offsetX;
      const py = sy + offsetY;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;

      const idx = (py * width + px) * 4;

      if (color.a === 255) {
        // The overwhelmingly common case: opaque. A straight write, no blend
        // and no division.
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 255;
        continue;
      }

      // Source-over into whatever is already there. Reached only when a
      // caller paints two grids into one buffer; a single layer's cells never
      // overlap, so `CanvasContainer` reaches this only for a cell landing on
      // an untouched (transparent) pixel, where it reduces to a plain write.
      const srcAlpha = color.a / 255;
      const dstAlpha = data[idx + 3] / 255;
      const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
      if (outAlpha <= 0) continue;
      const inv = 1 / outAlpha;
      const keep = dstAlpha * (1 - srcAlpha);
      data[idx] = (color.r * srcAlpha + data[idx] * keep) * inv;
      data[idx + 1] = (color.g * srcAlpha + data[idx + 1] * keep) * inv;
      data[idx + 2] = (color.b * srcAlpha + data[idx + 2] * keep) * inv;
      data[idx + 3] = outAlpha * 255;
    }
  }

  return buffer;
}

/**
 * A cell is EMPTY when it holds no colour (or alpha 0). Out-of-bounds counts
 * as empty. Moved verbatim from `CanvasContainer.tsx`, where it was the
 * private half of the onion-skin focus mode.
 */
function isEmptyCell(
  pixels: ReadonlyArray<ReadonlyArray<unknown>>,
  x: number,
  y: number,
  width: number,
  height: number,
  getPixelColor: (cell: unknown) => RgbaPixel | null,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return true;
  const pixel = getPixelColor(pixels[y]?.[x]);
  return !pixel || pixel.a === 0;
}

/**
 * A painted cell is an OUTLINE cell when at least one of its 4-adjacent
 * neighbours is empty.
 *
 * ⚠️ Exported because plan 05 task 07's dirty-region path has to DILATE an
 * edit rectangle by one cell in each direction when this is in play (D9): a
 * 1-cell write changes its neighbours' outline status, not just its own.
 */
export function isOutlineCell(
  pixels: ReadonlyArray<ReadonlyArray<unknown>>,
  x: number,
  y: number,
  width: number,
  height: number,
  getPixelColor: (cell: unknown) => RgbaPixel | null,
): boolean {
  return (
    isEmptyCell(pixels, x - 1, y, width, height, getPixelColor) ||
    isEmptyCell(pixels, x + 1, y, width, height, getPixelColor) ||
    isEmptyCell(pixels, x, y - 1, width, height, getPixelColor) ||
    isEmptyCell(pixels, x, y + 1, width, height, getPixelColor)
  );
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
 * ⚠️ RETAINED as the `fillRect` entry point, and deliberately so. Its
 * original tests are the characterisation of the pre-1:1 behaviour — they
 * assert the exact `fillRect(x*zoom, y*zoom, zoom, zoom)` calls and the
 * `rgba(...)` style in effect at each — so keeping the function keeps that
 * evidence executable. `CanvasContainer` no longer calls it on the hot path;
 * `paintLayerCells` above is what the per-layer canvases go through.
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
