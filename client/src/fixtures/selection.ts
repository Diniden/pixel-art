import type {
  Point,
  SelectionBehavior,
  SelectionBox,
  SelectionMode,
} from "@/types";

/**
 * Selection fixtures.
 *
 * A selection is a `SelectionBox` (x, y, width, height) plus, for non-rect
 * modes, a boolean mask. The mask is `boolean[][]` indexed `[y][x]`, matching
 * the pixel grid convention — masks and grids MUST agree on index order or an
 * off-by-transpose bug hides until a non-square selection appears. Every box
 * here is therefore deliberately NON-SQUARE.
 */

export function makeSelectionBox(
  x: number,
  y: number,
  width: number,
  height: number,
): SelectionBox {
  return { x, y, width, height };
}

/** Non-square, offset from the origin: catches transposes and off-by-ones. */
export const selectionRect: SelectionBox = makeSelectionBox(3, 5, 7, 4);

/** Flush against the grid origin — the boundary case at 0,0. */
export const selectionAtOrigin: SelectionBox = makeSelectionBox(0, 0, 4, 2);

/** A 1x1 selection — degenerate but legal. */
export const selectionSingle: SelectionBox = makeSelectionBox(8, 8, 1, 1);

/** Covers a whole 16x16 grid. */
export const selectionFull: SelectionBox = makeSelectionBox(0, 0, 16, 16);

/**
 * A mask matching `selectionRect` exactly — all true inside the box, false
 * outside — over a 16x16 grid.
 */
export function makeRectMask(
  box: SelectionBox,
  width = 16,
  height = 16,
): boolean[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from(
      { length: width },
      (_cell, x) =>
        x >= box.x &&
        x < box.x + box.width &&
        y >= box.y &&
        y < box.y + box.height,
    ),
  );
}

/**
 * A NON-rectangular mask: a diagonal band. The rect mask cannot distinguish a
 * mask-aware code path from one that only reads the bounding box; this one can.
 */
export function makeDiagonalMask(width = 16, height = 16): boolean[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) => Math.abs(x - y) <= 2),
  );
}

export const selectionModes: SelectionMode[] = [
  "rect",
  "flood",
  "lasso",
  "color",
];

export const selectionBehaviors: SelectionBehavior[] = [
  "movePixels",
  "moveSelection",
  "editMask",
];

/** A short drag path, for gesture fixtures. Not collinear — bends at (6,4). */
export const dragPath: Point[] = [
  { x: 2, y: 2 },
  { x: 4, y: 3 },
  { x: 6, y: 4 },
  { x: 6, y: 7 },
  { x: 5, y: 9 },
];
