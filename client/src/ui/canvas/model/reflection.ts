/**
 * Reflection-tool geometry — mirroring pixel writes across guide lines.
 *
 * The reflection tool lets the user drop guide lines BETWEEN pixels; every
 * subsequent pixel write is mirrored across every line, so drawing on one side
 * paints the same thing on the other. This module owns all of that geometry and
 * nothing else: no store, no MobX, no React, no DOM. Plain data in, plain data
 * out, so it can be unit-tested in the node lane.
 *
 * ## Coordinate frame (locked, MASTER §3 D2)
 *
 * Everything here is in the space of the EDITABLE grid — variant-local while a
 * variant is being edited, otherwise the object's grid. A cell `(x, y)` covers
 * the half-open box `[x, x+1) × [y, y+1)`, so its centre is `(x+0.5, y+0.5)`.
 *
 * "Between pixels" therefore means the INTEGER LATTICE of cell corners,
 * `0..gridWidth × 0..gridHeight` — which is what `screenToPixel`'s `"corner"`
 * mode produces for hand-drawn lines. Presets are not restricted to it: the
 * vertical centre line of a 17-wide grid is `x = 8.5`, a half-integer that maps
 * the middle column onto itself. The maths below is real-valued throughout and
 * makes no integrality assumption about the line.
 *
 * ## How a cell is reflected (locked, D3)
 *
 * Reflect the cell's CENTRE across the infinite line through `(x1,y1)-(x2,y2)`,
 * then floor both components to land back on a cell. Images that fall outside
 * `[0,w) × [0,h)` are dropped rather than clamped — the user's "infinite box"
 * simply runs off the grid there.
 *
 * For axis-aligned and 45° lines through lattice points this is EXACT: the
 * reflected centre is another cell centre. For arbitrary angles it is a rounding
 * approximation, which is accepted — a rotated mirror on a pixel grid cannot be
 * exact. A small epsilon is applied before flooring so a centre that lands on
 * `7.9999999999` through floating-point drift floors to 8, not 7.
 *
 * ## Several lines at once (locked, D4)
 *
 * Lines compose as a sequential closure, not as independent images:
 *
 *     S = writes;  for each line:  S = S ∪ reflect(S, line)
 *
 * so a vertical plus a horizontal line yields the full 4-fold symmetry (the
 * image across the vertical is itself reflected across the horizontal). The cost
 * is 2^N in the worst case, which is why `MAX_REFLECTION_LINES` caps N at 8.
 *
 * Output ORDER matters. `PixelStore.setPixels` lets a later write win over an
 * earlier one for the same cell, so if an image ever landed after the original
 * it wrote on, it would overwrite it. Originals therefore come first, images
 * follow in generation order, and de-duplication by `y*w + x` keeps the FIRST
 * occurrence. A cell sitting exactly on the mirror axis reflects onto itself and
 * is dropped as a duplicate of its own original.
 */

/** A guide line, stored in editable-grid space. Endpoints may be half-integers. */
export interface ReflectionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A whole-cell coordinate on the editable grid. */
export interface GridCell {
  x: number;
  y: number;
}

/**
 * Hard cap on simultaneous lines. Each line can double the write set, so 8 is a
 * 256× worst case on a single stroke — the point at which mirroring stops being
 * free within a 16 ms frame.
 */
export const MAX_REFLECTION_LINES = 8;

/** The line sets offered as one-click presets in the tool panel. */
export type ReflectionPreset =
  | "vertical"
  | "horizontal"
  | "both"
  | "diagonals"
  | "all";

/**
 * Guard against floating-point drift pushing an exact integer just below itself
 * before `Math.floor`. Larger than any error these few operations can produce,
 * far smaller than any distance that matters on a pixel grid.
 */
const EPSILON = 1e-9;

/**
 * A line with two coincident endpoints defines no axis and must be rejected —
 * both by the gesture (a tap is not a line) and by the presets on a 0-sized
 * grid.
 */
export function isDegenerate(
  line: Pick<ReflectionLine, "x1" | "y1" | "x2" | "y2">,
): boolean {
  return line.x1 === line.x2 && line.y1 === line.y2;
}

/**
 * Reflect an arbitrary point across the INFINITE line through the segment's two
 * endpoints. The segment's length and direction are irrelevant to the result;
 * only the line it lies on matters (the guide is drawn as the dragged segment,
 * but its effect extends forever — the user's "rotated box").
 *
 * Returns the point unchanged for a degenerate line, so callers that skip the
 * `isDegenerate` check still get something sane rather than `NaN`.
 */
export function reflectPoint(
  px: number,
  py: number,
  line: Pick<ReflectionLine, "x1" | "y1" | "x2" | "y2">,
): { x: number; y: number } {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: px, y: py };

  // Project (p - p1) onto the direction, then step twice the perpendicular gap.
  const vx = px - line.x1;
  const vy = py - line.y1;
  const t = (vx * dx + vy * dy) / lenSq;
  const projX = line.x1 + t * dx;
  const projY = line.y1 + t * dy;

  return { x: 2 * projX - px, y: 2 * projY - py };
}

/**
 * Reflect a whole cell across a line, returning the cell its mirror image lands
 * in — or `null` when that image falls off the grid.
 *
 * The cell's CENTRE is what gets reflected (D3): reflecting the corner would
 * shift the image by one cell for axis-aligned mirrors.
 */
export function reflectCell(
  cell: GridCell,
  line: Pick<ReflectionLine, "x1" | "y1" | "x2" | "y2">,
  w: number,
  h: number,
): GridCell | null {
  if (isDegenerate(line)) return null;

  const p = reflectPoint(cell.x + 0.5, cell.y + 0.5, line);
  const x = Math.floor(p.x + EPSILON);
  const y = Math.floor(p.y + EPSILON);

  if (x < 0 || x >= w || y < 0 || y >= h) return null;
  return { x, y };
}

/**
 * Expand a batch of writes into the closure of its images across every line.
 *
 * Generic in the write record so `{x, y, color}` pixel writes and `{x, y}`
 * preview points both pass through with their payload intact — each image is
 * the source record spread with new coordinates.
 *
 * Originals come first and de-duplication keeps the first occurrence, so an
 * image can never overwrite the original it was derived from once the batch
 * reaches `PixelStore.setPixels` (where later writes win). Lines beyond
 * `MAX_REFLECTION_LINES` and degenerate lines are ignored.
 */
export function expandWrites<T extends GridCell>(
  writes: readonly T[],
  lines: readonly ReflectionLine[],
  w: number,
  h: number,
): T[] {
  // De-dupe the originals too: a stroke can revisit a cell, and the seen-set has
  // to know about every cell already emitted for the ordering rule to hold.
  const seen = new Set<number>();
  let out: T[] = [];

  for (const write of writes) {
    const key = write.y * w + write.x;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(write);
  }

  const active = lines.slice(0, MAX_REFLECTION_LINES);

  for (const line of active) {
    if (isDegenerate(line)) continue;

    // Reflect the WHOLE accumulated set, not just the originals — that is what
    // makes two perpendicular lines produce 4-fold rather than 3-fold symmetry.
    const images: T[] = [];
    for (const source of out) {
      const image = reflectCell(source, line, w, h);
      if (!image) continue;
      const key = image.y * w + image.x;
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ ...source, x: image.x, y: image.y });
    }
    out = out.concat(images);
  }

  return out;
}

/**
 * The line set for a one-click preset, in editable-grid space.
 *
 * Centre lines use `w/2` / `h/2`, which is a half-integer on odd grids — the
 * only way a mirror can map a 17-wide grid's middle column onto itself. Ids come
 * from the caller so the module stays free of any id-generation dependency.
 */
export function presetLines(
  preset: ReflectionPreset,
  w: number,
  h: number,
  makeId: () => string,
): ReflectionLine[] {
  const vertical = (): ReflectionLine => ({
    id: makeId(),
    x1: w / 2,
    y1: 0,
    x2: w / 2,
    y2: h,
  });
  const horizontal = (): ReflectionLine => ({
    id: makeId(),
    x1: 0,
    y1: h / 2,
    x2: w,
    y2: h / 2,
  });
  const downDiagonal = (): ReflectionLine => ({
    id: makeId(),
    x1: 0,
    y1: 0,
    x2: w,
    y2: h,
  });
  const upDiagonal = (): ReflectionLine => ({
    id: makeId(),
    x1: w,
    y1: 0,
    x2: 0,
    y2: h,
  });

  switch (preset) {
    case "vertical":
      return [vertical()];
    case "horizontal":
      return [horizontal()];
    case "both":
      return [vertical(), horizontal()];
    case "diagonals":
      return [downDiagonal(), upDiagonal()];
    case "all":
      return [vertical(), horizontal(), downDiagonal(), upDiagonal()];
  }
}

/** Trim a coordinate for display: `8` stays `8`, `8.5` stays `8.5`. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}

/** A short human label for one line, e.g. `"(0,8) → (16,8)"`, for the panel list. */
export function describeLine(line: ReflectionLine): string {
  return `(${fmt(line.x1)},${fmt(line.y1)}) → (${fmt(line.x2)},${fmt(line.y2)})`;
}
