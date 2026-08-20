/**
 * useLightingPaint — the lighting studio's normal / height brush.
 *
 * Extracted from `LightingCanvas.tsx`'s five painting handlers (the mouse
 * down/move/up/leave set at `:429-505` and the touch set at `:350-425`), REFRESH
 * task 33.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔧 W19 BUG 2 IS FIXED HERE: `lastPaintPixel` IS NOW A REF
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingCanvas.tsx:32` held the last painted cell in `useState`. Every
 * pointer move during a stroke therefore wrote React state and re-rendered the
 * whole 785-line component — once PER PIXEL — purely to remember a coordinate
 * that nothing renders. `Canvas.tsx` got this right with `lastStrokePixelRef`.
 *
 * `isPainting` moves to a ref for the identical reason: nothing renders it
 * either, and a state write per gesture-start is a state write the paint path
 * does not need. `hoverPixel` STAYS state, because it genuinely drives a redraw
 * — the brush overlay follows the cursor, so a change there must invalidate.
 *
 * ── What this hook is NOT ─────────────────────────────────────────────────
 *
 * It does not compute normals (task 27 moved that to `PixelStore` as a `flow`),
 * does not touch a store, and never sees a pixel grid. The two things it cannot
 * derive without one — which cells the brush covers, and whether a cell has a
 * colour to paint on — arrive as the injected `resolveBrushCells` callback. That
 * is what keeps this file inside the `ui/` boundary (R2, MASTER.md §10 rule 12).
 *
 * ── The brush geometry is `ui/canvas/tools/brushStamp` ────────────────────
 *
 * The caller's `resolveBrushCells` is expected to call `stampAt` and then apply
 * the studio's extra filter (paint only over cells that already hold a colour).
 * That filter is why `stampAt` cannot simply be called here: it needs the grid.
 *
 * ⚠️ NO LINE INTERPOLATION, deliberately. `Canvas.tsx` rasterises `prev → next`
 * with `stampSegment` so a fast drag leaves no gaps; `LightingCanvas` stamped
 * only the cell under the pointer and skipped a repeat of the previous cell.
 * The two genuinely differ, and closing the gap would change which pixels a
 * fast lighting stroke writes — a behaviour change, not a refactor. Preserved
 * as-is and flagged in the task 33 report.
 *
 * Pure: no store, no MobX, no API.
 */

import { useCallback, useRef, useState } from "react";

/** A whole-cell grid coordinate. */
export interface PaintPoint {
  x: number;
  y: number;
}

/** What one brush application writes. */
export type LightingEditMode = "normals" | "height";

export interface UseLightingPaintOptions {
  /** `"normals"` or `"height"` — which channel the brush writes. */
  editMode: LightingEditMode;
  /**
   * The cells the brush covers at `center`, already bounds-filtered AND
   * filtered to cells that hold a colour. Supplied by the container because it
   * needs the pixel grid, which may not cross into `ui/`.
   */
  resolveBrushCells: (center: PaintPoint) => PaintPoint[];
  /** Write the normal channel for a batch of cells. */
  paintNormals: (cells: ReadonlyArray<PaintPoint>) => void;
  /**
   * Write the height channel for a batch of cells. `erase` is true when the
   * gesture carried Shift, which the legacy handlers turned into a height of 0.
   */
  paintHeights: (cells: ReadonlyArray<PaintPoint>, erase: boolean) => void;
}

export interface UseLightingPaintResult {
  /** The cell the cursor is over, or `null`. Drives the brush overlay. */
  hoverPixel: PaintPoint | null;
  /** True while a stroke is in flight. Read through a ref, never rendered. */
  isPaintingRef: React.RefObject<boolean>;

  /** Begin a stroke at `cell`. `erase` maps to Shift on the height brush. */
  beginStroke: (cell: PaintPoint, erase: boolean) => void;
  /**
   * Continue a stroke to `cell`. A no-op if the stroke is not in flight or the
   * cell is the one already painted — the legacy repeat guard, verbatim.
   */
  continueStroke: (cell: PaintPoint, erase: boolean) => void;
  /** End the stroke. Safe to call when none is in flight. */
  endStroke: () => void;
  /** Set (or clear, with `null`) the hovered cell. */
  setHoverPixel: (cell: PaintPoint | null) => void;
}

export function useLightingPaint({
  editMode,
  resolveBrushCells,
  paintNormals,
  paintHeights,
}: UseLightingPaintOptions): UseLightingPaintResult {
  // ⚠️ BOTH ARE REFS. See the header — this is W19 bug 2.
  const isPaintingRef = useRef(false);
  const lastPaintPixelRef = useRef<PaintPoint | null>(null);

  // State, because the overlay renders from it.
  const [hoverPixel, setHoverPixel] = useState<PaintPoint | null>(null);

  const apply = useCallback(
    (cell: PaintPoint, erase: boolean) => {
      const cells = resolveBrushCells(cell);
      if (cells.length === 0) return false;
      if (editMode === "height") {
        paintHeights(cells, erase);
      } else {
        paintNormals(cells);
      }
      return true;
    },
    [editMode, resolveBrushCells, paintNormals, paintHeights],
  );

  const beginStroke = useCallback(
    (cell: PaintPoint, erase: boolean) => {
      // ⚠️ The legacy MOUSE path checked `paintable.length === 0` BEFORE setting
      // `isPainting`, so a press on an empty cell started no stroke; the TOUCH
      // path set `isPainting` first and started one regardless. That divergence
      // is preserved by ordering here as the mouse path did and letting the
      // touch caller decide — see `LightingCanvasContainer`, which documents
      // which of the two it uses. Unifying them changes gesture behaviour.
      isPaintingRef.current = true;
      lastPaintPixelRef.current = cell;
      setHoverPixel(null);
      apply(cell, erase);
    },
    [apply],
  );

  const continueStroke = useCallback(
    (cell: PaintPoint, erase: boolean) => {
      if (!isPaintingRef.current) return;
      const last = lastPaintPixelRef.current;
      if (last && last.x === cell.x && last.y === cell.y) return;
      // The legacy order: resolve first, and only advance `lastPaintPixel` if
      // there was something to paint. A drag across an empty region therefore
      // leaves `lastPaintPixel` on the last PAINTED cell, not the last visited
      // one. Preserved verbatim.
      const cells = resolveBrushCells(cell);
      if (cells.length === 0) return;
      lastPaintPixelRef.current = cell;
      if (editMode === "height") {
        paintHeights(cells, erase);
      } else {
        paintNormals(cells);
      }
    },
    [editMode, resolveBrushCells, paintNormals, paintHeights],
  );

  const endStroke = useCallback(() => {
    isPaintingRef.current = false;
    lastPaintPixelRef.current = null;
  }, []);

  return {
    hoverPixel,
    isPaintingRef,
    beginStroke,
    continueStroke,
    endStroke,
    setHoverPixel,
  };
}
