/**
 * CanvasInteractionStore — the three TRANSIENT gesture fields (REFRESH task 32).
 *
 * Replaces the gesture half of `store/drawingActions.ts` (`:59-81`), the only
 * part of that module task 26 deliberately left behind. The pixel writes
 * (`setPixel`/`setPixels`) and the stroke transaction (`beginStroke`/
 * `endStroke`) already live in `PixelStore`/`HistoryStore`; what remained were
 * three fields that describe *an in-flight gesture* and nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS STORE NEVER ENTERS HISTORY AND NEVER TRIGGERS A SAVE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It holds no `HistoryStore` reference and no `AutoSaveController` reference,
 * by construction rather than by discipline. None of its fields is read by
 * `toPersistedUIState()`, so `persistedUIVersion` does not move when they
 * change and `AutoSaveController` cannot fire. That is the whole point: a
 * mousemove must not cost an undo entry or a 1.1 MB write.
 *
 * The legacy actions were already history-free and save-free — task 08 pins it
 * ("none of them touch the project or the history", `store/__tests__/
 * drawing.test.ts:509`). That pin still passes, because the legacy actions are
 * now bridge-installed delegates into this store.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `previewPixels` IS `observableRef`, AND THAT IS MANDATORY (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `previewPixels` is REWRITTEN ON EVERY MOUSEMOVE while a shape tool drags —
 * `getEllipsePixels` over a 64x64 drag returns hundreds of `{x, y}` records,
 * several times a second. Under a deep `observable` MobX would build a proxy
 * per array AND a proxy per element, tear them all down on the next move, and
 * present as "MobX is slow" rather than as the modelling error it is.
 *
 * `observableRef` plus WHOLE-ARRAY replacement is the contract:
 *   - every writer below assigns a fresh array; nothing pushes, splices or
 *     mutates an element in place;
 *   - consumers react to the array's IDENTITY, which is exactly the signal a
 *     canvas redraw wants.
 *
 * `drawStartPoint` is `observableRef` for the same reason at a smaller scale:
 * it is a `Point` replaced wholesale, never edited field-by-field. `isDrawing`
 * is a plain `observable` boolean — there is nothing inside it to proxy, and
 * the container re-renders the tool cursor on it.
 *
 * ── The `colorAdjustment` coupling, preserved ─────────────────────────────
 *
 * ⚠️ Legacy `startDrawing` did TWO things: it opened the gesture AND cleared
 * `colorAdjustment` (`drawingActions.ts:63`). `colorAdjustment` belongs to the
 * palette/colour slice, not here, so this store does NOT own it — the coupled
 * write is preserved at the bridge delegate, the same technique task 27 used
 * for `setStudioMode`'s two-phase write. Task 08 pins the coupling
 * ("startDrawing CLEARS any active colour adjustment", `drawing.test.ts:520`),
 * and that test fails if the delegate drops the second half.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import type { Point } from "../../types";

export class CanvasInteractionStore {
  /**
   * True while a drawing gesture is open (pointer-down through pointer-up).
   *
   * Plain `observable`: a boolean has no interior to proxy, and
   * `CanvasContainer` reads it in render to decide the cursor and to gate the
   * move/up dispatch.
   */
  isDrawing = false;

  /**
   * Where the current gesture began — the anchor the three shape tools
   * (line / rectangle / ellipse) preview against.
   *
   * `observableRef`: replaced wholesale by `startDrawing`/`updateDrawing`,
   * never edited in place.
   */
  drawStartPoint: Point | null = null;

  /**
   * The in-flight, uncommitted cells a shape or hover preview would write.
   *
   * ⚠️ `observableRef` — see the module header. Rewritten on every mousemove;
   * always replaced, never mutated.
   */
  previewPixels: Point[] = [];

  constructor() {
    makeObservable(this, {
      isDrawing: observable,
      drawStartPoint: observableRef,
      previewPixels: observableRef,

      startDrawing: action,
      updateDrawing: action,
      endDrawing: action,
      setPreviewPixels: action,
      clearPreviewPixels: action,
    });
  }

  /**
   * Open a gesture at `point`.
   *
   * ⚠️ The legacy action ALSO cleared `colorAdjustment`. That half is applied
   * by the bridge delegate — see the module header.
   */
  startDrawing(point: Point): void {
    this.isDrawing = true;
    this.drawStartPoint = point;
  }

  /** Move the gesture anchor. Whole-object replacement. */
  updateDrawing(point: Point): void {
    this.drawStartPoint = point;
  }

  /**
   * Close the gesture and drop the preview.
   *
   * Verbatim from `drawingActions.ts:70-72`: all three fields reset together,
   * and `previewPixels` becomes a NEW empty array rather than being emptied in
   * place.
   */
  endDrawing(): void {
    this.isDrawing = false;
    this.drawStartPoint = null;
    this.previewPixels = [];
  }

  /** Replace the preview wholesale. The array is never mutated afterwards. */
  setPreviewPixels(pixels: Point[]): void {
    this.previewPixels = pixels;
  }

  /** Drop the preview. A fresh empty array, not `length = 0`. */
  clearPreviewPixels(): void {
    this.previewPixels = [];
  }
}
