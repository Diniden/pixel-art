/**
 * The checkerboard background and the pixel grid, as pure buffer producers.
 *
 * Extracted from `Canvas.tsx:368-491` (`ensureBgCanvas` / `ensureGridCanvas`),
 * which was the better of the codebase's implementations: it builds the
 * checkerboard once into an `ImageData` and caches it by key, where
 * `LightingCanvas` re-ran an O(w·h) `fillRect` loop on every render.
 *
 * ## Buffer in, buffer out
 *
 * `paintCheckerboard` writes into a caller-supplied RGBA buffer and returns it,
 * so it is testable by hashing the bytes with no canvas backend present
 * (MASTER.md §9.10). The grid is different: it is STROKED, and strokes cannot be
 * rasterised by the test stub, so `gridLinePath` returns the line geometry as
 * data and the caller does the stroking. That keeps the computation testable
 * even though the drawing is not.
 *
 * ⚠️ Grid alpha, measured 2026-08-19 — this CORRECTS the task-30 spec. The spec
 * (and OPEN-QUESTIONS Q3) states `Canvas` uses `0.05` and `LightingCanvas`
 * hard-codes `0.08`. `Canvas.tsx:400-402` actually used **both**: `0.08` black in
 * light mode and `0.05` white in dark mode. `LightingCanvas`'s `0.08` white is
 * therefore the same alpha as Canvas's LIGHT branch but the colour of its DARK
 * branch. The unified rule below is Canvas's, verbatim.
 *
 * Pure: no store, no MobX, no API, no DOM.
 */

/** A minimal structural stand-in for `ImageData`. */
import { BLACK_08, WHITE_05 } from "../../theme/canvasTokens";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** An RGB triple, 0-255. */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Geometry of the checkerboard: how many cells, where they start, how big. */
export interface BackgroundGeometry {
  /** Full pixel size of the target buffer. */
  canvasWidth: number;
  canvasHeight: number;
  /** Number of grid CELLS across and down. */
  cellsX: number;
  cellsY: number;
  /**
   * World-space cell offset of the top-left cell. Drives checker PARITY, so a
   * variant view scrolled by an odd number of cells keeps the checker phase it
   * had in object space. Non-zero only while editing a variant.
   */
  offsetX: number;
  offsetY: number;
  /** Pixels per cell. */
  zoom: number;
}

/** The palette, chosen by `lightGridMode`. */
export interface BackgroundTheme {
  /** Base fill painted under the checkerboard. */
  base: Rgb;
  /** Checker colour on even parity. */
  color1: Rgb;
  /** Checker colour on odd parity. */
  color2: Rgb;
  /** Stroke style for the grid lines, as a CSS colour string. */
  gridStroke: string;
}

const DARK_THEME: BackgroundTheme = {
  base: { r: 26, g: 26, b: 37 }, // #1a1a25
  color1: { r: 42, g: 42, b: 58 }, // #2a2a3a
  color2: { r: 34, g: 34, b: 48 }, // #222230
  gridStroke: WHITE_05,
};

const LIGHT_THEME: BackgroundTheme = {
  base: { r: 200, g: 200, b: 200 }, // #c8c8c8
  color1: { r: 204, g: 204, b: 204 }, // #cccccc
  color2: { r: 238, g: 238, b: 238 }, // #eeeeee
  gridStroke: BLACK_08,
};

/**
 * The palette for a `lightGridMode` value. The single place the two themes are
 * defined — previously spread across `Canvas.tsx` and `LightingCanvas.tsx`.
 */
export function backgroundTheme(lightGridMode: boolean): BackgroundTheme {
  return lightGridMode ? LIGHT_THEME : DARK_THEME;
}

/**
 * Paint base colour + checkerboard into `buffer`, returning it.
 *
 * Every pixel of the buffer is written opaque: the base fill covers the whole
 * canvas first, then each cell overwrites its own `zoom × zoom` block. Cells are
 * clipped to the buffer, so a geometry larger than the buffer is safe.
 */
export function paintCheckerboard(
  buffer: PixelBuffer,
  geom: BackgroundGeometry,
  theme: BackgroundTheme,
): PixelBuffer {
  const { data, width, height } = buffer;
  const { cellsX, cellsY, offsetX, offsetY, zoom } = geom;

  // Base colour across the whole buffer — this is what shows through anywhere
  // the checker cells do not reach (a canvas sized larger than cellsX*zoom).
  const { base } = theme;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = base.r;
    data[i + 1] = base.g;
    data[i + 2] = base.b;
    data[i + 3] = 255;
  }

  for (let py = 0; py < cellsY; py++) {
    for (let px = 0; px < cellsX; px++) {
      // Parity is computed in WORLD cells so the phase survives a variant view.
      const color =
        (offsetX + px + (offsetY + py)) % 2 === 0 ? theme.color1 : theme.color2;
      const startX = px * zoom;
      const startY = py * zoom;

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

  return buffer;
}

/** One grid line, in buffer pixel coordinates. */
export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The grid line geometry for a background, as data.
 *
 * Lines are offset by the canonical half pixel (`+ 0.5`) so a 1px stroke lands
 * on the pixel centre instead of straddling two and rendering 2px blurry.
 *
 * There are `cells + 1` lines per axis — both outer edges are drawn.
 */
export function gridLinePath(geom: BackgroundGeometry): GridLine[] {
  const { canvasWidth, canvasHeight, cellsX, cellsY, zoom } = geom;
  const lines: GridLine[] = [];

  for (let x = 0; x <= cellsX; x++) {
    const px = x * zoom + 0.5;
    lines.push({ x1: px, y1: 0, x2: px, y2: canvasHeight });
  }
  for (let y = 0; y <= cellsY; y++) {
    const py = y * zoom + 0.5;
    lines.push({ x1: 0, y1: py, x2: canvasWidth, y2: py });
  }

  return lines;
}

/**
 * Stroke a grid onto a real 2D context. Separated from `gridLinePath` so the
 * geometry stays unit-testable while the (unhashable) stroking stays here.
 */
export function strokeGrid(
  ctx: CanvasRenderingContext2D,
  geom: BackgroundGeometry,
  theme: BackgroundTheme,
): void {
  ctx.strokeStyle = theme.gridStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const line of gridLinePath(geom)) {
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
  }
  ctx.stroke();
}
