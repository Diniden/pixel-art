/**
 * SyncedAnimatedPreview — the side-by-side original/interpolated animation
 * (REFRESH task 34, from `AIInterpolateModal.tsx:212-290`).
 *
 * PURE. Imports React and its block's CSS, nothing else.
 *
 * Two canvases advance on ONE interval so the comparison stays in step: the
 * "Original" canvas holds the keyframe that the currently-shown generated
 * frame sits after, which is what makes the interpolation legible. The old
 * canvas simply stops advancing when `oldFrames` is the shorter list.
 *
 * ⚠️ The images live in refs, not state. Re-decoding a base64 PNG on every
 * tick would be the obvious way to write this and would also make the preview
 * stutter; the decode happens once per `frames` change.
 */
import { useEffect, useRef } from "react";

export interface SyncedAnimatedPreviewProps {
  /** Interpolated sequence, base64 PNG bodies. Drives the frame count. */
  newFrames: string[];
  /** Keyframe-held sequence, index-aligned with `newFrames`. */
  oldFrames: string[];
  /** Square edge length of each canvas. */
  size: number;
  /** Playback rate; the interval is `1000 / fps`. */
  fps?: number;
}

export function SyncedAnimatedPreview({
  newFrames,
  oldFrames,
  size,
  fps = 8,
}: SyncedAnimatedPreviewProps) {
  const newCanvasRef = useRef<HTMLCanvasElement>(null);
  const oldCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameIdxRef = useRef(0);
  const newImagesRef = useRef<HTMLImageElement[]>([]);
  const oldImagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    newImagesRef.current = newFrames.map((b64) => {
      const img = new Image();
      img.src = b64 ? `data:image/png;base64,${b64}` : "";
      return img;
    });
  }, [newFrames]);

  useEffect(() => {
    oldImagesRef.current = oldFrames.map((b64) => {
      const img = new Image();
      img.src = b64 ? `data:image/png;base64,${b64}` : "";
      return img;
    });
  }, [oldFrames]);

  useEffect(() => {
    const newCanvas = newCanvasRef.current;
    const oldCanvas = oldCanvasRef.current;
    if (!newCanvas || !oldCanvas || newFrames.length === 0) return;
    const newCtx = newCanvas.getContext("2d");
    const oldCtx = oldCanvas.getContext("2d");
    // jsdom has no canvas backend — see `Base64Thumbnail`.
    if (!newCtx || !oldCtx) return;
    newCtx.imageSmoothingEnabled = false;
    oldCtx.imageSmoothingEnabled = false;

    frameIdxRef.current = 0;

    const drawFrame = (
      ctx: CanvasRenderingContext2D,
      img: HTMLImageElement | undefined,
    ) => {
      ctx.clearRect(0, 0, size, size);
      if (img && img.complete && img.naturalWidth > 0) {
        const s = Math.min(size / img.width, size / img.height);
        const w = img.width * s;
        const h = img.height * s;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      }
    };

    const interval = setInterval(() => {
      const idx = frameIdxRef.current % newFrames.length;
      drawFrame(newCtx, newImagesRef.current[idx]);
      if (idx < oldFrames.length) {
        drawFrame(oldCtx, oldImagesRef.current[idx]);
      }
      frameIdxRef.current = idx + 1;
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [newFrames, oldFrames, size, fps]);

  return (
    <div className="ai-interpolate-modal__synced">
      <div className="ai-interpolate-modal__synced-item">
        <span className="ai-interpolate-modal__synced-label">Original</span>
        <canvas
          ref={oldCanvasRef}
          width={size}
          height={size}
          className="ai-interpolate-modal__preview-canvas"
        />
      </div>
      <div className="ai-interpolate-modal__synced-item">
        <span className="ai-interpolate-modal__synced-label">Interpolated</span>
        <canvas
          ref={newCanvasRef}
          width={size}
          height={size}
          className="ai-interpolate-modal__preview-canvas"
        />
      </div>
    </div>
  );
}

export default SyncedAnimatedPreview;
