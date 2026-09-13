/**
 * `usePixelBrush` — the pixel-studio Brush tool's state (plan 12, task 05;
 * MASTER D6, D9).
 *
 * What `CanvasContainer` needs from the brush stores, reduced to two memos:
 *
 *  - `footprint` — the painted cells of the open brush document's current
 *    frame, relative to the origin. Feeds the hover marker (`toolFootprint`'s
 *    class 4) so the marker is exactly what a press writes.
 *  - `stamp` — the footprint with a settled colour per cell for the current
 *    base colour. Handed to the tool handlers as `ToolContext.pixelBrushStamp`.
 *
 * ## Why `enabled` gates the memos
 *
 * The hook is called unconditionally (hooks must be), but every other tool
 * pays nothing for it: with `enabled === false` both memos short-circuit to
 * `null` before touching a grid, and `init()` is not called. A 64×64 brush
 * with 8 layers is 32k cells per walk — fine once per document / frame /
 * colour change, wasteful on every render of a pencil stroke.
 *
 * ## Why the base colour is spread into scalar deps
 *
 * `ui.tool.selectedColor` is an `observable.ref` object that is REPLACED on
 * every pick, and callers may well pass a fresh `{ r, g, b, a }` literal per
 * render. A memo keyed on the object would re-settle the stamp on every
 * render; keyed on the four scalars it re-settles only when the colour
 * actually changes. Referential stability of `stamp` matters downstream:
 * `getToolContext` lists it as a dependency, and that callback must not
 * rebuild at pointer rate (`CanvasContainer.tsx`, "pointer-rate values must
 * never be deps").
 *
 * ## Grids are read, never observed
 *
 * `brushes.document` is `observable.ref`; the reads here that subscribe are
 * the document REFERENCE, the selected frame id, and the two version
 * counters (`pixelVersion` for cell writes, `domainVersion` for layer
 * visibility / structure). The frame's layer grids are plain arrays read
 * INSIDE the memos, at compute time, never in the render body — the
 * "read grids at compute time, never observe them" rule
 * (`containers/brush/brushPanes.ts`, `CLAUDE.md`).
 *
 * ## `init()` runs from an effect
 *
 * `BrushStore.init()` is StrictMode-safe (a second call while `loading` or
 * after `loaded` is a synchronous no-op) and never rejects, so it is fired
 * and forgotten from an effect keyed on `[app, enabled]` — exactly as
 * `BrushStudioContainer`'s mount effect does. Never from a render.
 *
 * Container tier: takes the `ApplicationStore`, so it may not live in `ui/`.
 * The caller must be an `observer` for the store reads to subscribe.
 */
import { useEffect, useMemo } from "react";
import type { ApplicationStore } from "../../stores/ApplicationStore";
import type { LoadState } from "../../stores/domain/DomainStore";
import {
  pixelBrushFootprint,
  resolvePixelBrushStamp,
} from "../../ui/canvas/tools/pixelBrushStamp";
import type {
  PixelBrushFootprint,
  PixelBrushStamp,
} from "../../ui/canvas/tools/pixelBrushStamp";

export interface PixelBrushState {
  /** Painted cells of the current frame, or `null` with no document / disabled. */
  footprint: PixelBrushFootprint | null;
  /** The footprint settled for `base`, or `null` with no document / disabled. */
  stamp: PixelBrushStamp | null;
  /** `brushes.loadState` — for the rail's loading / failed states. */
  loadState: LoadState;
  /** `brushes.brushName`, or `null` when no document is loaded. */
  brushName: string | null;
}

/** The base colour, structurally — the domain `Color` has this shape. */
export interface PixelBrushBase {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function usePixelBrush(
  app: ApplicationStore,
  enabled: boolean,
  base: PixelBrushBase,
): PixelBrushState {
  // See the header: an effect, never a render; idempotent in the store.
  useEffect(() => {
    if (enabled) void app.brushes.init();
  }, [app, enabled]);

  // The subscribing reads. `doc` is the reference only — its grids are read
  // inside the memos below.
  const doc = app.brushes.document;
  const frameId = app.brushUI.selectedFrameId;
  const pv = app.brushes.pixelVersion;
  const dv = app.brushes.domainVersion;
  const loadState = app.brushes.loadState;
  const brushName = app.brushes.brushName;

  const footprint = useMemo(() => {
    if (!enabled || !doc) return null;
    const frame = app.brushUI.selectedFrameIn(doc);
    return frame
      ? pixelBrushFootprint(frame.layers, doc.width, doc.height)
      : null;
    // `frameId`, `pv` and `dv` are the invalidation keys for the grids read
    // through `doc` — they are not read in the body by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, enabled, doc, frameId, pv, dv]);

  const { r, g, b, a } = base;
  const stamp = useMemo(() => {
    if (!enabled || !doc) return null;
    const frame = app.brushUI.selectedFrameIn(doc);
    return frame
      ? resolvePixelBrushStamp(frame.layers, doc.width, doc.height, {
          r,
          g,
          b,
          a,
        })
      : null;
    // Same invalidation keys as the footprint, plus the four colour scalars.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, enabled, doc, frameId, pv, dv, r, g, b, a]);

  return {
    footprint,
    stamp,
    loadState,
    brushName: doc ? brushName : null,
  };
}
