import type { Normal, Pixel, PixelData } from "@/types";
import { black, cyan, magenta, normalFlat, red, white } from "./colors";

/**
 * Pixel-grid builders.
 *
 * `PixelData[][]` is indexed `[y][x]`. Every builder returns a FRESH grid with
 * no shared row or cell references, so a test that paints into a fixture cannot
 * corrupt the next test's copy. That matters more here than anywhere else in
 * this module: a grid is the one fixture shape the app mutates in place.
 */

export const emptyPixel: PixelData = { color: 0, normal: 0, height: 0 };

export const makePixel = (
  color: Pixel | 0,
  normal: Normal | 0 = 0,
  height = 0,
): PixelData => ({
  color: color === 0 ? 0 : { ...color },
  normal: normal === 0 ? 0 : { ...normal },
  height,
});

/** An all-empty `width` x `height` grid. */
export function makeEmptyGrid(width: number, height: number): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      color: 0 as const,
      normal: 0 as const,
      height: 0,
    })),
  );
}

/** Every cell painted the same colour. Useful for fill / clear assertions. */
export function makeSolidGrid(
  width: number,
  height: number,
  color: Pixel = red,
): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => makePixel(color, 0, 1)),
  );
}

/**
 * Alternating two-colour checkerboard. The one grid where an off-by-one in a
 * blit, a flip or a variant offset is visible at a glance rather than needing a
 * diff.
 */
export function makeCheckerGrid(
  width: number,
  height: number,
  a: Pixel = black,
  b: Pixel = white,
): PixelData[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) =>
      makePixel((x + y) % 2 === 0 ? a : b, 0, 1),
    ),
  );
}

/**
 * A 1px border ring with an empty interior. Asserts edge handling: the four
 * corners, the four edges, and that the interior was left alone.
 */
export function makeBorderGrid(
  width: number,
  height: number,
  color: Pixel = cyan,
): PixelData[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) => {
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      return onEdge ? makePixel(color, 0, 1) : { ...emptyPixel };
    }),
  );
}

/**
 * A grid carrying normal AND height data on every painted cell — the lighting
 * studio's shape. Most fixtures leave `normal: 0` / `height: 0`; code paths that
 * only run when lighting data is present need this one.
 */
export function makeLitGrid(
  width: number,
  height: number,
  color: Pixel = magenta,
  normal: Normal = normalFlat,
): PixelData[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) =>
      makePixel(color, normal, 1 + ((x + y) % 8)),
    ),
  );
}

/**
 * A recognisable asymmetric 16x16 sprite: a filled square offset toward the
 * top-left, so a horizontal flip, a vertical flip and a 180-degree rotation all
 * produce visibly different results. Symmetric fixtures hide transform bugs.
 */
export function makeSpriteGrid(): PixelData[][] {
  const grid = makeEmptyGrid(16, 16);
  for (let y = 2; y < 9; y++) {
    for (let x = 3; x < 11; x++) {
      grid[y][x] = makePixel(cyan, 0, 1);
    }
  }
  // A single off-block marker pixel, so even a symmetric crop stays oriented.
  grid[12][13] = makePixel(magenta, 0, 1);
  return grid;
}

/** Count of cells whose `color` is not 0. The cheap "did anything paint?" check. */
export function countPaintedCells(grid: PixelData[][]): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.color !== 0) n++;
    }
  }
  return n;
}
