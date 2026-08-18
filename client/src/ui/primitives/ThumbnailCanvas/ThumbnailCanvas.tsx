import { memo, useEffect, useRef } from "react";
import { classNames } from "../../classNames";
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
 */

export interface ThumbnailCanvasProps {
  /** Canvas edge in px. Default 48 (the measured house thumbSize). */
  size?: number;
  /** Bumped by the caller whenever the thumbnail's content changes. */
  revision: number;
  /** Paints the thumbnail. Receives the 2d context and `size`. */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Accessible name; thumbnails are decorative by default. */
  label?: string;
  className?: string;
}

function ThumbnailCanvasImpl({
  size = 48,
  revision,
  draw,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: false });
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, size, size);
    drawRef.current(ctx, size);
  }, [revision, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={classNames("thumb-canvas", className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": "true" })}
    />
  );
}

/**
 * Repaint only when `revision`, `size`, `label` or `className` change —
 * never on `draw` identity. This comparator is 6 lines where the legacy one
 * was 91, because content-change detection moved to the caller's `revision`.
 */
export const ThumbnailCanvas = memo(
  ThumbnailCanvasImpl,
  (prev, next) =>
    prev.revision === next.revision &&
    prev.size === next.size &&
    prev.label === next.label &&
    prev.className === next.className,
);

export default ThumbnailCanvas;
