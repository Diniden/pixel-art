/**
 * Shared fixtures for the canvas golden-hash tests.
 *
 * Deliberately tiny (4×4 and 6×6 grids at zoom 2-4) so a hash change can be
 * localised by eye with `firstDifference` rather than only being "different".
 */

export interface TestPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A pixel CELL as the renderers see it: opaque, read via `getPixelColor`. */
export type TestCell = { color: TestPixel | 0 } | 0 | undefined;

/** The `getPixelColor` callback the real Canvas passes in. */
export function getPixelColor(cell: unknown): TestPixel | null {
  const pd = cell as { color: TestPixel | 0 } | undefined;
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

export const RED: TestPixel = { r: 255, g: 0, b: 0, a: 255 };
export const BLUE: TestPixel = { r: 0, g: 0, b: 255, a: 255 };
export const GREEN: TestPixel = { r: 0, g: 255, b: 0, a: 255 };
/** Half-transparent white — the pixel that makes blend-vs-overwrite visible. */
export const HALF_WHITE: TestPixel = { r: 255, g: 255, b: 255, a: 128 };

const cell = (p: TestPixel | null): TestCell => (p ? { color: p } : 0);

/**
 * Build a `height × width` grid of cells from a string map.
 * `.` is empty; any other character is looked up in `palette`.
 */
export function grid(
  rows: string[],
  palette: Record<string, TestPixel>,
): TestCell[][] {
  return rows.map((row) =>
    [...row].map((ch) => cell(ch === "." ? null : (palette[ch] ?? null))),
  );
}

/** A 4×4 layer with a red diagonal and one blue corner. */
export const DIAGONAL_4 = grid(["R...", ".R..", "..R.", "B..R"], {
  R: RED,
  B: BLUE,
});

/** A 2×2 variant layer, all green. */
export const VARIANT_2 = grid(["GG", "GG"], { G: GREEN });
