/**
 * `usePixelBrush` — the pixel-studio Brush tool's state (plan 12, task 05;
 * MASTER D6, D9; plan 13, task 12: MASTER D12).
 *
 * What `CanvasContainer` needs from the brush stores, reduced to three memos:
 *
 *  - `scaled` — the open brush document's current frame, with every layer's
 *    grid resampled to the size and strategies in `ui.pixelBrush`. Computed
 *    once per (document, frame, versions, size, strategies), never at
 *    pointer rate.
 *  - `footprint` — the painted cells of the scaled frame, relative to the
 *    origin. Feeds the hover marker (`toolFootprint`'s class 4) so the marker
 *    is exactly what a press writes.
 *  - `stamp` — the footprint with a settled colour per cell for the current
 *    base colour. Handed to the tool handlers as `ToolContext.pixelBrushStamp`.
 *
 * ## Why `enabled` gates the memos
 *
 * The hook is called unconditionally (hooks must be), but every other tool
 * pays nothing for it: with `enabled === false` the memos short-circuit to
 * `null` before touching a grid, and `init()` is not called. A 64×64 brush
 * with 8 layers is 32k cells per walk — fine once per document / frame /
 * colour change, wasteful on every render of a pencil stroke.
 *
 * ## Why scaling runs here, and why identity keeps the same layers
 *
 * `scalePixelBrushLayers` runs INSIDE the `scaled` memo, keyed on the four
 * `ui.pixelBrush` scalars (`width`, `height`, `scaleX`, `scaleY`) read in the
 * render body. Those are observable and change at slider rate — never at
 * pointer rate — so the kernels run once per slider stop, not per pointer
 * move (risk R5). The unchanged `pixelBrushFootprint` / `resolvePixelBrushStamp`
 * are then fed the scaled layers at the scaled size. At native size the
 * request is an identity and `scalePixelBrushLayers` returns the frame's own
 * layer array, so nothing about the native path changes (risk R9).
 * `CanvasContainer`'s call site is unchanged: it never reads `ui.pixelBrush`.
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
 * the document REFERENCE, the selected frame id, the two version counters
 * (`pixelVersion` for cell writes, `domainVersion` for layer visibility /
 * structure) and the four `ui.pixelBrush` scalars. The frame's layer grids
 * are plain arrays read INSIDE the memos, at compute time, never in the
 * render body — the "read grids at compute time, never observe them" rule
 * (`containers/brush/brushPanes.ts`, `CLAUDE.md`).
 *
 * ## `init()` runs from an effect
 *
 * `BrushStore.init()` is StrictMode-safe (a second call while `loading` or
 * after `loaded` is a synchronous no-op) and never rejects, so it is fired
 * and forgotten from an effect keyed on `[app, enabled]` — exactly as
 * `BrushStudioContainer`'s mount effect does. Never from a render.
 *
 * ## The native-size reset runs from an effect (D12)
 *
 * A brush with different native dimensions resets the stamp size to native:
 * `ui.pixelBrush.resetSize()` from an effect keyed on the document's
 * `width` / `height`. It also fires on mount and when the document arrives
 * (`undefined → n`), which is a no-op at the defaults (`null → null`; MobX
 * does not even notify on an equal primitive). Under StrictMode the mount
 * effect runs twice; `resetSize` is idempotent (nulls to nulls, `lockedRatio`
 * to `null`), so the second run changes nothing and nothing observes a
 * transient. The strategies are kept (D11) — only the size follows the brush.
 *
 * Container tier: takes the `ApplicationStore`, so it may not live in `ui/`.
 * The caller must be an `observer` for the store reads to subscribe.
 */
import { useEffect, useMemo } from "react";
import type { ApplicationStore } from "../../stores/ApplicationStore";
import type { LoadState } from "../../stores/domain/DomainStore";
import { scalePixelBrushLayers } from "../../ui/canvas/tools/pixelBrushScale";
import {
  pixelBrushFootprint,
  resolvePixelBrushStamp,
} from "../../ui/canvas/tools/pixelBrushStamp";
import type {
  PixelBrushFootprint,
  PixelBrushSourceLayer,
  PixelBrushStamp,
} from "../../ui/canvas/tools/pixelBrushStamp";

/** The stamp's effective size in cells (the brush frame scaled per `ui.pixelBrush`). */
export interface PixelBrushSize {
  width: number;
  height: number;
}

export interface PixelBrushState {
  /** Painted cells of the current frame, or `null` with no document / disabled. */
  footprint: PixelBrushFootprint | null;
  /** The footprint settled for `base`, or `null` with no document / disabled. */
  stamp: PixelBrushStamp | null;
  /** The effective stamp size (the rail's readout), or `null` with no document / disabled. */
  size: PixelBrushSize | null;
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

/** The current frame's layers resampled to the effective size. */
interface ScaledFrame {
  layers: ReadonlyArray<PixelBrushSourceLayer>;
  width: number;
  height: number;
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
  // Slider-rate, never pointer-rate: the size and strategy scalars.
  const { width, height, scaleX, scaleY } = app.ui.pixelBrush;

  // See the header ("The native-size reset runs from an effect"): a no-op at
  // the defaults and on the StrictMode double-run; a real reset only when the
  // brush's own dimensions change.
  const nativeWidth = doc?.width;
  const nativeHeight = doc?.height;
  useEffect(() => {
    app.ui.pixelBrush.resetSize();
  }, [app, nativeWidth, nativeHeight]);

  const scaled = useMemo((): ScaledFrame | null => {
    if (!enabled || !doc) return null;
    const frame = app.brushUI.selectedFrameIn(doc);
    if (!frame) return null;
    const native = { width: doc.width, height: doc.height };
    const size = app.ui.pixelBrush.effectiveSize(native);
    const layers = scalePixelBrushLayers(frame.layers, {
      srcW: doc.width,
      srcH: doc.height,
      dstW: size.width,
      dstH: size.height,
      x: scaleX,
      y: scaleY,
    });
    return { layers, width: size.width, height: size.height };
    // `frameId`, `pv` and `dv` are the invalidation keys for the grids read
    // through `doc`, and `width` / `height` for the size `effectiveSize`
    // reads from the store — none is read in the body by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, enabled, doc, frameId, pv, dv, width, height, scaleX, scaleY]);

  const footprint = useMemo(() => {
    if (!enabled || !scaled) return null;
    return pixelBrushFootprint(scaled.layers, scaled.width, scaled.height);
  }, [enabled, scaled]);

  const { r, g, b, a } = base;
  const stamp = useMemo(() => {
    if (!enabled || !scaled) return null;
    return resolvePixelBrushStamp(scaled.layers, scaled.width, scaled.height, {
      r,
      g,
      b,
      a,
    });
  }, [enabled, scaled, r, g, b, a]);

  const size = useMemo(
    (): PixelBrushSize | null =>
      scaled ? { width: scaled.width, height: scaled.height } : null,
    [scaled],
  );

  return {
    footprint,
    stamp,
    size,
    loadState,
    brushName: doc ? brushName : null,
  };
}
