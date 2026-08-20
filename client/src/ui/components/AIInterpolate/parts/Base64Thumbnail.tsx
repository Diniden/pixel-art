/**
 * Base64Thumbnail — a base64 PNG painted into a fixed-size square canvas
 * (REFRESH task 34, from `AIInterpolateModal.tsx:190-210`).
 *
 * PURE. Imports React and its block's CSS, nothing else — no store, no API,
 * no MobX.
 *
 * It draws imperatively rather than using an `<img>` because the source is
 * pixel art: `imageSmoothingEnabled = false` plus letterboxed nearest-neighbour
 * scaling is what keeps a 16×16 sprite crisp at 48 px. An `<img>` would
 * resample it smoothly.
 */
import { useEffect, useRef } from "react";

export interface Base64ThumbnailProps {
  /** Base64 PNG body, no `data:` prefix. Empty renders a blank canvas. */
  base64: string;
  /** Square edge length in CSS/backing pixels. */
  size: number;
}

export function Base64Thumbnail({ base64, size }: Base64ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base64) return;
    const ctx = canvas.getContext("2d");
    // ⚠️ jsdom returns null here; the original used `!` and would have thrown
    // in test. Guarding costs nothing and keeps the component mountable.
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      // Letterbox: preserve aspect, centre the result.
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    };
    img.src = `data:image/png;base64,${base64}`;
  }, [base64, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="ai-interpolate-modal__thumb-canvas"
    />
  );
}

export default Base64Thumbnail;
