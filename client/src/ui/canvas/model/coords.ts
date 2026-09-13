/**
 * Screen → grid coordinate mapping for the pixel canvas.
 *
 * Extracted from `Canvas.tsx`'s `getPixelCoords` (289-325) and `getOriginCoords`
 * (328-365), which repeated the same rect math with two different snapping and
 * bounds rules. This module keeps ONE mapping and parameterises the two ways it
 * differed.
 *
 * ## Why the rect, not the zoom
 *
 * Both originals mapped through `canvas.getBoundingClientRect()` rather than
 * multiplying by `zoom`. That is deliberate and preserved: the canvas carries a
 * CSS `transform: scale()` for pinch/gesture view-zoom, so the rect is the only
 * source that already includes it. A `zoom`-based mapping would silently break
 * while a pinch is in flight.
 *
 * ## The three modes
 *
 * - `"pixel"` — floors to a whole cell, maps into VARIANT-LOCAL space when
 *   editing a variant (it subtracts the variant offset), and rejects anything
 *   outside `[0, gridWidth) × [0, gridHeight)` by returning `null`.
 * - `"origin"` — snaps to the nearest HALF cell (`Math.round(v * 2) / 2`), stays
 *   in OBJECT space (it does NOT subtract the variant offset), and allows one
 *   cell of slop outside the object on every side.
 * - `"corner"` — snaps to the nearest CELL CORNER (`Math.round`), in the same
 *   variant-local space as `"pixel"`, and CLAMPS to `[0, gridWidth] ×
 *   [0, gridHeight]` instead of rejecting out-of-range points.
 *
 * These are genuinely different rules, not an accident: an origin marker is
 * placed on the object, may sit on a half-pixel, and may be dragged slightly
 * off the object; a paint coordinate must be a whole cell inside the variant
 * being edited. Pure: no store, no MobX, no DOM beyond the rect passed in.
 *
 * ## Why `"corner"` clamps rather than returning null
 *
 * It exists for the reflection tool, whose lines are drawn BETWEEN pixels — on
 * the integer lattice of cell corners, which runs `0..gridWidth` inclusive, one
 * larger in each axis than the cell range `"pixel"` uses. Dragging a mirror line
 * out past the edge of the canvas is the normal way to place it ON the edge, so
 * the out-of-range case is clamped to the boundary corner instead of failing.
 * A degenerate rect still returns `null`, as in the other two modes.
 */

/** A whole- or half-cell coordinate. */
export interface GridPoint {
  x: number;
  y: number;
}

/** The part of a `DOMRect` the mapping needs. Structural, so tests pass a literal. */
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The view geometry the mapping runs against — the same values `Canvas.tsx`
 * derives for its render pass, passed in rather than read from a store.
 */
export interface CanvasViewGeometry {
  /** Editable grid size. Variant grid size while editing a variant, else the object's. */
  gridWidth: number;
  gridHeight: number;
  /** The object's own grid size. Used by `"origin"` bounds. */
  objWidth: number;
  objHeight: number;
  /** True when a variant is being edited AND variant data resolved. */
  editingVariant: boolean;
  /** Offset of the variant being edited, in object cells. */
  variantOffset: GridPoint;
  /** World-space bounds of the expanded variant-edit view. */
  viewMinX: number;
  viewMinY: number;
  viewWidth: number;
  viewHeight: number;
}

export type SnapMode = "pixel" | "pixel-unbounded" | "origin" | "corner";

/**
 * Map a client (screen) coordinate to a grid coordinate.
 *
 * Returns `null` when the rect is degenerate (zero width/height — an unmounted
 * or display:none canvas) or when the point falls outside the mode's bounds.
 */
export function screenToPixel(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  geom: CanvasViewGeometry,
  mode: SnapMode,
): GridPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;

  const {
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    editingVariant,
    variantOffset,
    viewMinX,
    viewMinY,
    viewWidth,
    viewHeight,
  } = geom;

  /* `"pixel-unbounded"` shares EVERY line of `"pixel"`'s mapping and differs
     only in the last step: it returns the cell it computed, however far
     outside the grid that lands, where `"pixel"` returns `null`.
     
     ⚠️ UNBOUNDED, NOT CLAMPED. A shape drag has to keep tracking the real
     pointer once it leaves the canvas: the user is sizing a circle against the
     cursor and does not need the whole shape to fit on the stage (owner,
     2026-09-01). Clamping to the border instead PINS the shape's corner at the
     edge, so dragging further out stops changing it — which reads as the drag
     having died. Off-grid cells are dropped when the shape is committed, not
     when it is aimed. */
  if (mode === "pixel" || mode === "pixel-unbounded") {
    let x: number;
    let y: number;

    if (editingVariant) {
      // Expanded variant view: map through world space, then into variant-local
      // space by subtracting the variant's offset.
      const localViewX = ((clientX - rect.left) / rect.width) * viewWidth;
      const localViewY = ((clientY - rect.top) / rect.height) * viewHeight;
      const worldX = viewMinX + localViewX;
      const worldY = viewMinY + localViewY;
      x = Math.floor(worldX - variantOffset.x);
      y = Math.floor(worldY - variantOffset.y);
    } else {
      x = Math.floor(((clientX - rect.left) / rect.width) * gridWidth);
      y = Math.floor(((clientY - rect.top) / rect.height) * gridHeight);
    }

    if (mode === "pixel-unbounded") return { x, y };

    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
    return { x, y };
  }

  if (mode === "corner") {
    // Same space as "pixel" (variant-local while editing a variant), but snapped
    // to the nearest cell CORNER and clamped rather than rejected.
    let x: number;
    let y: number;

    if (editingVariant) {
      const localViewX = ((clientX - rect.left) / rect.width) * viewWidth;
      const localViewY = ((clientY - rect.top) / rect.height) * viewHeight;
      const worldX = viewMinX + localViewX;
      const worldY = viewMinY + localViewY;
      x = Math.round(worldX - variantOffset.x);
      y = Math.round(worldY - variantOffset.y);
    } else {
      x = Math.round(((clientX - rect.left) / rect.width) * gridWidth);
      y = Math.round(((clientY - rect.top) / rect.height) * gridHeight);
    }

    // The corner lattice is INCLUSIVE of gridWidth/gridHeight — there are
    // `gridWidth + 1` corners along a row of `gridWidth` cells.
    return {
      x: Math.min(gridWidth, Math.max(0, x)),
      y: Math.min(gridHeight, Math.max(0, y)),
    };
  }

  // mode === "origin": OBJECT space, half-cell snapping, one cell of slop.
  let rawX: number;
  let rawY: number;

  if (editingVariant) {
    const localViewX = ((clientX - rect.left) / rect.width) * viewWidth;
    const localViewY = ((clientY - rect.top) / rect.height) * viewHeight;
    rawX = viewMinX + localViewX;
    rawY = viewMinY + localViewY;
  } else {
    // NOTE: object dimensions, not grid dimensions. In normal mode these are
    // equal; the distinction only shows while editing a variant, where this
    // branch is not taken. Preserved exactly as `getOriginCoords` had it.
    rawX = ((clientX - rect.left) / rect.width) * objWidth;
    rawY = ((clientY - rect.top) / rect.height) * objHeight;
  }

  const x = Math.round(rawX * 2) / 2;
  const y = Math.round(rawY * 2) / 2;

  if (x < -1 || x > objWidth + 1 || y < -1 || y > objHeight + 1) return null;
  return { x, y };
}
