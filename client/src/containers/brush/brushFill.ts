/**
 * brushFill — the flood fill for a brush layer (Brush Studio plan,
 * `docs/01-brush-studio`, task 20).
 *
 * The pixel studio's `floodFill` / `gaussianFloodFill` in
 * `components/Canvas/drawingUtils.ts` compare `PixelData` colours and are
 * deliberately NOT adapted: a brush layer stores signed delta cells (D3),
 * and "the same colour" here means "the same cell" — `0` equals `0`, and a
 * tuple equals a tuple slot for slot. Gaussian fill has no meaning on a
 * delta grid, so the container treats it as this fill (MASTER §1).
 *
 * The fill returns the REGION, not writes: the caller decides the value
 * (`buildBrushToolContext` hands the handlers the dummy colour, and
 * `setPixels` maps that to the selected delta — D19).
 *
 * Pure: no React, no MobX, no store. `cellsMatch` mirrors
 * `BrushPixelStore.brushCellsEqual` rather than importing it so this module
 * carries no runtime dependency on a store file (the same rule
 * `brushToolContext.ts` keeps).
 */
import type { BrushCell, Point } from "../../types";

/** Structural equality of two cells: `0` vs a 4-tuple, then slot by slot. */
export function cellsMatch(a: BrushCell, b: BrushCell): boolean {
  if (a === 0 || b === 0) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * The 4-connected region of cells equal to the cell at `(x, y)`, in
 * discovery order, `(x, y)` first. Empty when the seed is off the grid, not
 * an integer, or has no cell (a short row).
 *
 * `width × height` bound the walk — never `grid.length` — so a grid larger
 * than the document (a stale row) cannot leak cells the store would then
 * drop anyway, and a missing cell inside the bounds is simply never a match.
 */
export function brushFloodFill(
  grid: readonly (readonly BrushCell[])[],
  width: number,
  height: number,
  x: number,
  y: number,
): Point[] {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
  if (x < 0 || x >= width || y < 0 || y >= height) return [];
  const seed = grid[y]?.[x];
  if (seed === undefined) return [];

  const visited = new Uint8Array(width * height);
  const out: Point[] = [];
  const stack: number[] = [y * width + x];
  visited[y * width + x] = 1;

  while (stack.length > 0) {
    const key = stack.pop() as number;
    const cy = Math.floor(key / width);
    const cx = key - cy * width;
    const cell = grid[cy]?.[cx];
    if (cell === undefined || !cellsMatch(cell, seed)) continue;
    out.push({ x: cx, y: cy });

    if (cx > 0) visit(cx - 1, cy);
    if (cx < width - 1) visit(cx + 1, cy);
    if (cy > 0) visit(cx, cy - 1);
    if (cy < height - 1) visit(cx, cy + 1);
  }
  return out;

  function visit(nx: number, ny: number): void {
    const nk = ny * width + nx;
    if (visited[nk]) return;
    visited[nk] = 1;
    stack.push(nk);
  }
}
