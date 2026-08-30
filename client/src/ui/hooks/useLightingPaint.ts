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
 * ── ONE STROKE = ONE UNDO ENTRY (plan 04 task 02) ─────────────────────────
 *
 * `paintNormals` / `paintHeights` each record their own history entry, so a
 * 40-cell drag used to cost 40 presses of ⌘Z. The optional `onStrokeStart` /
 * `onStrokeEnd` callbacks wrap a stroke in a history transaction, which
 * buffers those per-move commands and collapses them into ONE
 * `CompositeCommand` — the same invariant the pixel studio already holds
 * (`stores/domain/PixelStore.ts:52-56`).
 *
 * They are CALLBACKS, not a store handle, because this file lives under `ui/`
 * and may not import one. They are OPTIONAL, so the hook still works — and
 * still tests — with no history at all.
 *
 * ⚠️ An open transaction that is never closed swallows every subsequent edit
 * in the whole app (`PixelStore.ts:958-960`). Hence: the close is guarded so a
 * double `endStroke` (mouse-up AND mouse-leave both fire it) closes once, and
 * an unmount mid-stroke closes it too.
 *
 * Pure: no store, no MobX, no API.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
  /**
   * Open a history transaction for one stroke. Every paint call made between
   * this and `onStrokeEnd` collapses into a SINGLE undo entry. Optional so the
   * hook stays usable (and testable) without a history store.
   *
   * ⚠️ `ui/` may not import a store, so the transaction arrives as callbacks —
   * the container supplies `history.beginTransaction` / `endTransaction`.
   */
  onStrokeStart?: (label: string) => void;
  /** Close the transaction opened by `onStrokeStart`. Always called if it was. */
  onStrokeEnd?: () => void;
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
  onStrokeStart,
  onStrokeEnd,
}: UseLightingPaintOptions): UseLightingPaintResult {
  // ⚠️ BOTH ARE REFS. See the header — this is W19 bug 2.
  const isPaintingRef = useRef(false);
  const lastPaintPixelRef = useRef<PaintPoint | null>(null);

  // ⚠️ ALSO A REF, and for the same reason: nothing renders it, and a state
  // write per gesture would reintroduce exactly the bug this file pins.
  const strokeOpenRef = useRef(false);

  // The unmount cleanup below must close whatever transaction is open at the
  // time it runs, without re-subscribing on every render — a cleanup that
  // re-ran on every `onStrokeEnd` identity change would fire MID-STROKE and
  // close the transaction early. So the live closer is held in a ref, synced
  // from an effect (writing a ref during render is a `react-hooks/refs`
  // error), and the cleanup effect depends on nothing.
  const onStrokeEndRef = useRef(onStrokeEnd);
  useEffect(() => {
    onStrokeEndRef.current = onStrokeEnd;
  }, [onStrokeEnd]);

  /**
   * Close the open stroke transaction, at most once.
   *
   * ⚠️ Guarded because `endStroke` is invoked from BOTH `onMouseUp` and
   * `onMouseLeave`, so a double close is routine. Two `endTransaction()` calls
   * would be a no-op today, but the guard is the contract, not the accident.
   */
  const closeStroke = useCallback(() => {
    if (!strokeOpenRef.current) return;
    strokeOpenRef.current = false;
    onStrokeEndRef.current?.();
  }, []);

  // ⚠️ CRITICAL: an unmount mid-stroke would otherwise strand an open
  // transaction, and every subsequent edit in the app would buffer into it and
  // vanish (`PixelStore.ts:958-960`). Empty deps: this runs on unmount only.
  useEffect(() => closeStroke, [closeStroke]);

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

      // ⚠️ OPEN BEFORE THE FIRST `apply` — that first stamp must land inside
      // the transaction, or a drag is two undo entries rather than one.
      //
      // Opened UNCONDITIONALLY, even when the brush resolves to no cells. The
      // stroke itself starts regardless (`isPaintingRef` above is set before
      // `apply`, verbatim legacy ordering), so an unconditional open is the
      // only way begin/end stay symmetric. An empty transaction is free:
      // `HistoryStore.endTransaction` commits nothing when no command buffered.
      // The alternative — open lazily on the first successful paint — would
      // leave `endStroke` guessing, which is how transactions get stranded.
      //
      // We must NOT open a second transaction while one of ours is in flight:
      // `beginTransaction` COMMITS the outer one first (PixelStore.ts:948-961),
      // which would cut a stroke in two. `beginStroke` twice without an
      // intervening `endStroke` is not a gesture the container produces, but
      // the guard makes it harmless.
      if (!strokeOpenRef.current) {
        strokeOpenRef.current = true;
        onStrokeStart?.(
          editMode === "height" ? "Paint heights" : "Paint normals",
        );
      }

      apply(cell, erase);
    },
    [apply, editMode, onStrokeStart],
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
    // Close FIRST: the transaction is the thing that must not be stranded, and
    // clearing the other refs must not be able to skip it.
    closeStroke();
    isPaintingRef.current = false;
    lastPaintPixelRef.current = null;
  }, [closeStroke]);

  return {
    hoverPixel,
    isPaintingRef,
    beginStroke,
    continueStroke,
    endStroke,
    setHoverPixel,
  };
}
