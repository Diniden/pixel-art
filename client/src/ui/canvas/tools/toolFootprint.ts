/**
 * The cells a tool would edit if it fired right now — the geometry behind the
 * hover marker.
 *
 * ## Why this is its own module
 *
 * `CanvasContainer` already knows how to stamp a brush: `brushStampOptions`
 * assembles `StampOptions` for the pencil and the eraser, and `getToolContext`
 * binds the shape functions. But both are built for the DRAWING path — they
 * carry a colour, they mutate through `setPixels`, and they only exist for the
 * two paint tools.
 *
 * The hover marker needs the same footprint for a tool that has NOT fired, for
 * every tool in the toolbar, including the ones that have no brush at all. That
 * is a different question with the same arithmetic, so it lives here rather
 * than growing a second mode inside the drawing path.
 *
 * ## The four footprint classes, and why the third is not "nothing"
 *
 * 1. **Brush tools** — `pixel` and `eraser`. Footprint is `stampAt` with the
 *    tool's OWN shape: `pencilBrushShape` for the pencil, `eraserShape` for the
 *    eraser. The two settings are independent in `ToolUIStore` (one is square
 *    by default, the other circle), so a marker that read one for both would
 *    lie to the user about half the time.
 *
 * 2. **`fill-square`** — always the SQUARE stamp regardless of
 *    `pencilBrushShape`, because `CanvasContainer:1928` calls `getSquarePixels`
 *    unconditionally. The marker follows the code, not the setting.
 *
 * 3. **Everything else** — `flood-fill`, `gaussian-fill`, `line`, `rectangle`,
 *    `ellipse`, `eyedropper`, `move`, `selection`, `origin`,
 *    `reference-trace`, and the three lighting tools — resolve to the SINGLE
 *    cell under the pointer (owner decision, 2026-08-28).
 *
 *    This is deliberately not an empty list. A flood fill's real footprint is
 *    unknowable without reading the pixel grid, which may not cross into `ui/`
 *    (R2), and an eyedropper's is genuinely one cell. Showing nothing would
 *    make the Apple Pencil invisible on half the toolbar — the marker's whole
 *    job is telling the user where the pencil is pointing before it touches
 *    down. One cell answers that honestly for every tool; it just does not
 *    promise a fill's extent, which no marker could.
 *
 * 4. **`brush`** — the pixel-studio Brush tool (docs/12-pixel-brush-tool,
 *    task 05). Its footprint is INJECTED: `pixelBrushOffsets` is the brush
 *    document's painted cells relative to the brush origin (computed once by
 *    `pixelBrushFootprint` in the container, never here), translated to the
 *    cursor cell and bounds-filtered. `null` / `undefined` means no brush is
 *    loaded, and the answer is an EMPTY footprint — not the class-3 single
 *    cell — because with no document a stroke writes nothing, and the marker
 *    must promise exactly what the stroke does. The brush is NOT a member of
 *    `isBrushTool`: that predicate means "scales with `brushSize`", which the
 *    stamp does not.
 *
 * Pure: no store, no MobX, no DOM. The shape generators live in
 * `components/Canvas/drawingUtils.ts`, OUTSIDE the `ui/` boundary, so they are
 * INJECTED exactly as `brushStamp` injects them.
 */

import type { BrushShapeFn, StampBounds, StampPoint } from "./brushStamp";
import { inBounds, stampAt } from "./brushStamp";

/** The `Tool` union, structurally — `ui/` does not import `types/domain`. */
export type FootprintTool = string;

/** A brush shape setting, as `ToolUIStore` stores it. */
export type BrushShape = "circle" | "square";

/** Everything the footprint needs that it will not import for itself. */
export interface FootprintOptions extends StampBounds {
  /** The active tool. */
  tool: FootprintTool;
  /** Brush diameter in cells. `<= 1` means the single cell under the pointer. */
  brushSize: number;
  /** `ToolUIStore.pencilBrushShape`. */
  pencilShape: BrushShape;
  /** `ToolUIStore.eraserShape`. */
  eraserShape: BrushShape;
  /** `getCirclePixels`, injected. */
  circle: BrushShapeFn;
  /** `getSquarePixels`, injected. */
  square: BrushShapeFn;
  /**
   * Class 4 — injected cells for the `brush` tool, relative to the brush
   * origin. `null` / `undefined` = no brush loaded → empty footprint. Ignored
   * by every other tool.
   */
  pixelBrushOffsets?: ReadonlyArray<{ dx: number; dy: number }> | null;
}

/**
 * The colour handed to the injected shape generators.
 *
 * The generators take a colour only to populate a field `stampAt` discards, so
 * the value cannot affect the geometry. A constant is used rather than
 * threading the real `selectedColor` through, which would rebuild the marker's
 * memo every time the user picked a swatch for no change in output.
 */
const SHAPE_COLOR = { r: 0, g: 0, b: 0, a: 0 } as const;

/** True when the tool paints with the brush, i.e. its footprint scales with `brushSize`. */
export function isBrushTool(tool: FootprintTool): boolean {
  return tool === "pixel" || tool === "eraser" || tool === "fill-square";
}

/**
 * The cells `tool` would write if it fired at `center`, bounds-filtered.
 *
 * Returns an empty array when `center` falls outside the grid — `stampAt`
 * filters, and a single cell outside bounds filters to nothing. That is the
 * correct answer: there is nothing to mark off-grid.
 */
export function toolFootprint(
  center: StampPoint,
  options: FootprintOptions,
): StampPoint[] {
  const {
    tool,
    brushSize,
    pencilShape,
    eraserShape,
    circle,
    square,
    gridWidth,
    gridHeight,
  } = options;

  const bounds = { gridWidth, gridHeight };

  if (tool === "brush") {
    // Class 4: the injected stamp footprint, translated and clipped. Empty —
    // deliberately not one cell — when no brush document is loaded.
    const offs = options.pixelBrushOffsets;
    if (!offs) return [];
    return offs
      .map((o) => ({ x: center.x + o.dx, y: center.y + o.dy }))
      .filter((p) => inBounds(p, bounds));
  }

  if (!isBrushTool(tool)) {
    // Class 3: one cell, still bounds-filtered. `stampAt` at size 1 is exactly
    // that, and routing through it keeps ONE bounds rule in the codebase.
    return stampAt(center, {
      ...bounds,
      brushSize: 1,
      shape: square,
      shapeColor: SHAPE_COLOR,
    });
  }

  // `fill-square` ignores `pencilBrushShape` because the drawing path does.
  const shapeName: BrushShape =
    tool === "eraser"
      ? eraserShape
      : tool === "fill-square"
        ? "square"
        : pencilShape;

  return stampAt(center, {
    ...bounds,
    brushSize,
    shape: shapeName === "circle" ? circle : square,
    shapeColor: SHAPE_COLOR,
  });
}
