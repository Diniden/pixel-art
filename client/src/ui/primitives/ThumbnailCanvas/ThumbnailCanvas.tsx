import { memo, useEffect, useRef } from "react";
import { classNames } from "../../classNames";
import {
  clampThumbnailSize,
  getCachedThumbnail,
} from "../../canvas/thumbnailCache";
import "./ThumbnailCanvas.css";

/**
 * ThumbnailCanvas — the shared preview canvas (task 19).
 *
 * BEM block: `thumb-canvas` (local stylesheet — `image-rendering: pixelated`,
 * the one styling every legacy thumbnail canvas needs).
 *
 * Replaces the 5 measured sites — including the 91-LINE memo comparator at
 * `FramesView.tsx:15-163`, plus `VariantView.tsx:16-75`,
 * `TimelineView.tsx:47-128`, `ObjectSelectModal` and `CopyFromModal`
 * (~150 lines).
 *
 * The design that makes it a primitive: the component knows NOTHING about
 * frames, layers or variants. The caller supplies
 *
 * - `draw(ctx, size)` — a callback that paints the thumbnail (the container
 *   closes over its domain data there), and
 * - `revision` — a number that changes exactly when the thumbnail's content
 *   changes.
 *
 * `revision` IS the replacement for the 91-line comparator: instead of
 * deep-diffing layers/offsets/indices here, the container (which owns the
 * domain model, e.g. MobX's `pixelVersion`) states when content changed.
 * The memo ignores `draw`'s identity churn by design — a new closure with
 * the same `revision` must not repaint (manual check 7: bump `revision` in a
 * story and watch the thumbnail update).
 *
 * ── The optional `cacheKey` ───────────────────────────────────────────────
 *
 * `revision` stops a REMOUNTED or re-keyed thumbnail from re-running `draw`
 * only within one component instance's lifetime — the effect re-fires on
 * mount regardless. Sites that paint the same content in several places at
 * once (the layer siderail and the timeline both show the current frame's
 * layers) can pass `cacheKey`, and the paint is then served from the shared
 * `thumbnailCache` LRU, which is bounded in both entries and total pixels
 * and clamps the side to `MAX_THUMBNAIL_SIZE`.
 *
 * `cacheKey` must already encode `revision` — use `thumbnailCacheKey(id,
 * revision, size)` — because the cache does not see this component's props.
 * Omitting `cacheKey` keeps the original always-repaint behaviour, which is
 * what a one-off preview wants.
 */

export interface ThumbnailCanvasProps {
  /** Canvas edge in px. Default 48 (the measured house thumbSize). */
  size?: number;
  /** Bumped by the caller whenever the thumbnail's content changes. */
  revision: number;
  /** Paints the thumbnail. Receives the 2d context and `size`. */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
  /**
   * Opt into the shared thumbnail LRU. Must encode the content identity AND
   * the revision — build it with `thumbnailCacheKey`. Omit for no caching.
   */
  cacheKey?: string;
  /** Accessible name; thumbnails are decorative by default. */
  label?: string;
  className?: string;
}

function ThumbnailCanvasImpl({
  size = 48,
  revision,
  draw,
  cacheKey,
  label,
  className,
}: ThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep the latest draw closure without letting its identity trigger the
  // paint effect (the whole point of `revision`).
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const side = clampThumbnailSize(size);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: false });
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, side, side);

    if (cacheKey) {
      // The cache paints through the same `draw`, so a miss costs exactly
      // what the uncached path costs; a hit is one blit.
      const cached = getCachedThumbnail(cacheKey, side, (c, s) =>
        drawRef.current(c, s),
      );
      if (cached) {
        ctx.drawImage(cached, 0, 0);
        return;
      }
      // No 2d context available for the offscreen canvas — fall through and
      // paint directly rather than rendering nothing.
    }

    drawRef.current(ctx, side);
  }, [revision, side, cacheKey]);

  return (
    <canvas
      ref={canvasRef}
      width={side}
      height={side}
      className={classNames("thumb-canvas", className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": "true" })}
    />
  );
}

/**
 * Repaint only when `revision`, `size`, `cacheKey`, `label` or `className`
 * change — never on `draw` identity. This comparator is 7 lines where the
 * legacy one was 91, because content-change detection moved to the caller's
 * `revision`.
 */
export const ThumbnailCanvas = memo(
  ThumbnailCanvasImpl,
  (prev, next) =>
    prev.revision === next.revision &&
    prev.size === next.size &&
    prev.cacheKey === next.cacheKey &&
    prev.label === next.label &&
    prev.className === next.className,
);

export default ThumbnailCanvas;
