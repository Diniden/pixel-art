/**
 * rAF-coalesced render scheduling for a canvas, with dirty-region accumulation.
 *
 * ## What this replaces
 *
 * `Canvas.tsx` scheduled its main render with a `useEffect` that cancelled any
 * in-flight frame, requested a new one, and cancelled again on cleanup — with a
 * 19-entry dependency array acting as the invalidation signal. The mechanism and
 * the signal were tangled together in one effect.
 *
 * This hook keeps the mechanism and lets the caller supply the signal as a
 * `deps` array, so "when do we redraw" stays readable at the call site while
 * "how do we redraw at most once per frame" lives here once.
 *
 * ## Why the render function goes through a ref
 *
 * The scheduled callback must call the LATEST render function, not the one that
 * existed when the frame was requested — otherwise a redraw paints with stale
 * closure values. `Canvas.tsx` solved this with a `renderRef` that it reassigned
 * every render; that structure is preserved rather than adding `render` to the
 * dependency array, which would re-schedule on every render and defeat the
 * coalescing.
 *
 * ## StrictMode
 *
 * React 19 double-invokes effects in development. The cleanup cancels the
 * pending frame and clears the handle, so a double mount schedules, cancels,
 * and re-schedules — one paint, no leaked handle. This matches the behaviour
 * W2a's R11 audit confirmed was already correct in `Canvas.tsx:1524-1562`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DIRTY ACCUMULATOR (plan 05, task 07 — the payoff of the whole plan)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `invalidate()` says "something changed, repaint". `invalidateRegion(region)`
 * says "these cells of this layer changed". Both schedule the SAME frame; the
 * difference is only what the accumulator holds when that frame runs, which
 * the hook hands to `render` as its one argument.
 *
 * ## Why an accumulator is needed at all
 *
 * Several edits can land inside one animation frame — a fast pencil drag
 * samples faster than 60 Hz, and a coalesced pointer event delivers a whole
 * run of cells at once. The frame is coalesced, so the REGIONS must be too:
 * without accumulation the last publish before the frame fires would be the
 * only one painted, and every earlier cell in that frame would be dropped.
 * That failure is silent and looks like "the canvas skips pixels when I draw
 * fast" — which is the exact bug class this plan set out to remove, arriving
 * from the other direction.
 *
 * ## The four rules, and why each one is the way round it is
 *
 *  1. **Every published region merges in.** Union, never replace.
 *  2. **`null` promotes the accumulator to `"all"`, permanently — until the
 *     frame paints.** `null` is the store's honest "I replaced a grid
 *     wholesale and cannot name the cells" (plan risk R6). A path that cannot
 *     describe itself must not be narrowed by a later path that can.
 *  3. **`"all"` is NEVER downgraded back to `"cells"`.** This is rule 2's
 *     teeth and it is the single most important line in the file. Downgrading
 *     is how stale pixels reach the screen, and a stale pixel is a far worse
 *     outcome than a redundant repaint.
 *  4. **The accumulator is DETACHED before the paint, not cleared after it.**
 *     The scope handed to `render` is this frame's, complete and frozen,
 *     while `dirtyRef` goes straight back to empty. A region published DURING
 *     a paint (nothing does this today, but nothing prevents it either)
 *     therefore starts the NEXT frame's accumulator instead of merging into
 *     one that is about to be discarded — which would schedule the cell and
 *     then silently drop it. Nothing is copied: the scope keeps the same map.
 *
 * Anything that is not a pixel write — layer visibility, focus mode, zoom,
 * variant selection, tool change, project load — goes through plain
 * `invalidate()` and is therefore a full repaint. Only pixel writes take the
 * fast path. The `deps` effect calls `invalidate()`, so the hook's existing
 * contract is unchanged: a dependency change is still a full repaint.
 *
 * Pure: no store, no MobX, no API. The region type is structural — the store's
 * `PixelDirtyRegion` satisfies it without this module importing it.
 */

import { useEffect, useRef, useCallback } from "react";

/**
 * One published dirty region: the cells of ONE layer that changed.
 *
 * ⚠️ `null` means "repaint everything" and every consumer must handle it.
 * Structurally identical to `stores/domain/DomainStore`'s `PixelDirtyRegion`,
 * declared here so nothing under `ui/` imports a store.
 */
export interface DirtyRegion {
  /** The layer whose grid changed, in the caller's own id space. */
  layerId: string;
  /** Changed cells, in that layer's own grid space. */
  cells: readonly { x: number; y: number }[];
}

/**
 * What the accumulator holds when a frame paints — the argument `render`
 * receives.
 *
 * `"all"` is the safe answer and the initial state of every frame that was
 * scheduled by anything other than `invalidateRegion`.
 */
export type DirtyScope =
  | { kind: "all" }
  | {
      /**
       * Only these cells of only these layers changed. `byLayer` is keyed by
       * the region's `layerId`; the values are the CELLS THEMSELVES, kept as
       * `{x, y}` rather than a packed index because the hook does not know
       * any layer's grid width — layers in one paint can have different ones
       * (a variant sub-layer's grid is not the object's).
       */
      kind: "cells";
      byLayer: ReadonlyMap<string, ReadonlyArray<{ x: number; y: number }>>;
    };

/** The full-repaint scope, shared so callers can compare by reference. */
const ALL: DirtyScope = { kind: "all" };

export interface CanvasRenderScheduler {
  /**
   * Request a full redraw on the next animation frame, coalescing repeats.
   *
   * ⚠️ Promotes the pending frame's scope to `"all"` — see rule 2. Anything
   * that is not a pixel write belongs here.
   */
  invalidate: () => void;
  /**
   * Request a redraw of just `region`'s cells on the next animation frame.
   *
   * `null` is the caller's honest "I cannot name the cells" and promotes the
   * frame to a full repaint (rule 2).
   */
  invalidateRegion: (region: DirtyRegion | null) => void;
  /** Cancel any pending frame without drawing. */
  cancel: () => void;
}

/** The mutable half of {@link DirtyScope}, private to the accumulator. */
type Accumulator =
  | { kind: "all" }
  | { kind: "cells"; byLayer: Map<string, { x: number; y: number }[]> };

/**
 * Schedule `render` on the next animation frame whenever `deps` change.
 *
 * @param render The draw function. Re-read on every frame, never captured.
 *               Receives the accumulated {@link DirtyScope} for the frame; a
 *               caller that repaints everything unconditionally may ignore it.
 * @param deps   The invalidation signal, compared like any effect dependency.
 *               A change here is a FULL repaint, exactly as before.
 */
export function useCanvasRender(
  render: (scope: DirtyScope) => void,
  deps: React.DependencyList,
): CanvasRenderScheduler {
  const renderRef = useRef(render);
  // Deliberate render-phase write (see the module comment): the scheduled frame
  // must call the LATEST render function, and adding `render` to the effect's
  // dependencies would re-schedule every render and defeat the coalescing.
  // eslint-disable-next-line react-hooks/refs
  renderRef.current = render;

  const frameRef = useRef<number | null>(null);

  /**
   * The pending frame's scope. `null` means "no frame is accumulating" — it
   * is NOT the store's `null`, which means the opposite; the two never meet
   * because `invalidateRegion` translates before touching this.
   */
  const dirtyRef = useRef<Accumulator | null>(null);

  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    // ⚠️ The accumulator is DELIBERATELY NOT cleared here.
    //
    // Cleanup runs on every `deps` change and on StrictMode's synthetic
    // unmount, and the very next thing that happens is a re-schedule. Clearing
    // would discard regions published between the last paint and this cancel —
    // and since the re-scheduled frame is a full repaint anyway (the `deps`
    // effect calls `invalidate`), keeping them costs nothing and losing them
    // could cost a stale pixel. It is reset on paint, which is the one place
    // the cells are provably on screen.
  }, []);

  /** Schedule the frame if one is not already pending. */
  const schedule = useCallback(() => {
    if (frameRef.current !== null) {
      // A frame is already pending and the accumulator has just grown. Cancel
      // and re-request so the behaviour matches the pre-task-07 hook exactly:
      // repeated invalidations inside one frame still produce ONE paint.
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const acc = dirtyRef.current;
      const scope: DirtyScope =
        acc === null
          ? ALL
          : acc.kind === "all"
            ? ALL
            : { kind: "cells", byLayer: acc.byLayer };
      // Rule 4: the accumulator is DETACHED here — before `render` runs, not
      // after it returns.
      //
      // ⚠️ This ordering is the opposite of the obvious one and it is
      // deliberate. Resetting after the paint would let a region published
      // FROM INSIDE `render` merge into the accumulator that is about to be
      // thrown away, so that cell would be scheduled and then silently
      // dropped. Detaching first means the scope handed to `render` is this
      // frame's, complete and frozen, while anything published during the
      // paint starts the NEXT frame's accumulator from empty. The scope
      // object still holds the same `byLayer` map, so nothing is copied.
      dirtyRef.current = null;
      renderRef.current(scope);
    });
  }, []);

  const invalidate = useCallback(() => {
    // Rule 2/3: a full repaint request can only ever promote.
    dirtyRef.current = { kind: "all" };
    schedule();
  }, [schedule]);

  const invalidateRegion = useCallback(
    (region: DirtyRegion | null) => {
      const acc = dirtyRef.current;

      // Rule 3, first and loudest: once `"all"`, always `"all"`.
      if (acc !== null && acc.kind === "all") {
        schedule();
        return;
      }

      // Rule 2: the store could not name its cells — repaint everything.
      if (region === null) {
        dirtyRef.current = { kind: "all" };
        schedule();
        return;
      }

      const byLayer =
        acc === null ? new Map<string, { x: number; y: number }[]>() : acc.byLayer;
      let bucket = byLayer.get(region.layerId);
      if (!bucket) {
        bucket = [];
        byLayer.set(region.layerId, bucket);
      }
      // Rule 1: union. Duplicates are harmless — repainting one cell twice in
      // one frame is idempotent — and de-duplicating would cost a Set per
      // frame to save a handful of writes.
      for (const cell of region.cells) bucket.push({ x: cell.x, y: cell.y });

      dirtyRef.current = { kind: "cells", byLayer };
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    invalidate();
    return cancel;
    // `deps` IS the invalidation signal — spreading it is the point of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { invalidate, invalidateRegion, cancel };
}
