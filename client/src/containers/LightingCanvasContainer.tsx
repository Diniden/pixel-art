/**
 * LightingCanvasContainer (REFRESH task 27).
 *
 * `LightingCanvas` is 937 lines and reads 14 `uiState` sub-fields. It is NOT
 * split here — that is task 33's job, and task 27's constraints say so
 * explicitly.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE CANVAS MUST BE DRIVEN BY THE `pixelVersion` REACTION, NOT BY
 *  `observer()` ON GRID DATA (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `observer()` here wraps the container, which reads NO grid. The canvas
 * itself stays an imperative renderer: it must never become a component that
 * re-renders because a pixel changed. The owner's project holds 300,249
 * cells, and `layer.pixels` is `observableRef` precisely so MobX never looks
 * inside one — an `observer()` that touched grid CONTENT would defeat that
 * and present as "MobX is slow" rather than as the modelling error it is.
 *
 * ── The three latent bugs in `LightingCanvas`: RECORDED, NOT FIXED ────────
 *
 * Task 27's Definition of Done requires them recorded here and fixed in the
 * canvas task (33). All three are measured, and none is touched by this task:
 *
 *  1. **No rAF coalescing.** `grep -c renderRequestRef LightingCanvas.tsx`
 *     returns 0. Renders fire synchronously from effects at `:369-376`, each
 *     redrawing an uncached O(w·h) `fillRect` checkerboard (`:298-305`) —
 *     the very pattern `Canvas.tsx` abandoned for `ImageData` at `:387-423`.
 *  2. **`lastPaintPixel` is React STATE** (line 25), not a ref, so a stroke
 *     re-renders the component once PER PIXEL. `Canvas.tsx` gets this right
 *     with `lastStrokePixelRef` (line 38).
 *  3. **Grid alpha is hard-coded `0.08`** (line 322) against `Canvas.tsx`'s
 *     `0.05`, and `lightGridMode` is ignored entirely — so the two canvases
 *     visibly disagree. ⚠️ Unifying them is a VISIBLE DESIGN DECISION and
 *     needs owner sign-off, not a refactor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ CREATED BUT NOT YET WIRED — ITS RENDER SITE IS OUTSIDE THIS TASK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingCanvas` is rendered by `App.tsx:222`.
 * That file is NOT in task 27's `Touches` list, and §10 rule 6 says to stop
 * rather than widen scope — the collision matrix is only valid if `Touches`
 * is accurate. The container is therefore complete and ready; the one-line
 * import swap belongs to the task that owns the render site.
 *
 * ⚠️ Nothing is broken by the delay. The component still renders and still
 * works — it reads Zustand, whose lighting fields the bridge keeps mirrored
 * from MobX (Phase B). What is deferred is only the `observer()` boundary,
 * i.e. the render-granularity win, not correctness.
 */
import { observer } from "mobx-react-lite";
import { LightingCanvas } from "../components/Canvas/LightingCanvas";

export const LightingCanvasContainer = observer(
  function LightingCanvasContainer() {
    return <LightingCanvas />;
  },
);
