/**
 * useBrushCamera — the brush canvas's wheel camera (Brush Studio plan,
 * `docs/01-brush-studio`, task 21 lift; the code is task 16's).
 *
 * Lifted VERBATIM out of `BrushCanvasContainer` when task 21's selection
 * wiring pushed it past `max-lines`. The brush studio's zoom/pan is
 * `brushUI`'s session-only camera (task 10), not `ViewportUIStore`'s, so
 * this is a native, non-passive `wheel` listener on the viewport element:
 * ctrl/meta + wheel zooms (the same rate as `useCanvasViewport`), a plain
 * wheel pans. Pinch zoom arrives through `useBrushPointerHandlers` and lands
 * on the same `zoomBy`. There is no space/middle-drag pan (task 16 reported
 * it omitted).
 *
 * Store-free: the camera reads and writes are injected callbacks, read
 * through a ref at event time so the container may pass fresh lambdas each
 * render without the listener re-binding (the `useCanvasKeyboard` pattern).
 */
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Point } from "../../types";

/** Same feel as `useCanvasViewport`'s ctrl+wheel. */
const WHEEL_ZOOM_RATE = 0.012;

export interface BrushCameraArgs {
  /** A document is open — the listener binds only then. */
  enabled: boolean;
  /** `brushUI.zoomBy`. */
  zoomBy: (ratio: number) => void;
  /** `brushUI.panOffset`, read at event time. */
  panOffset: () => Point;
  /** `brushUI.setPanOffset`. */
  setPanOffset: (offset: Point) => void;
}

export interface BrushCamera {
  /** `CanvasSurface`'s viewport element — the wheel target. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Stable pinch-zoom callback for the pointer layer. */
  zoomBy: (ratio: number) => void;
}

export function useBrushCamera({
  enabled,
  zoomBy,
  panOffset,
  setPanOffset,
}: BrushCameraArgs): BrushCamera {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef({ zoomBy, panOffset, setPanOffset });
  useEffect(() => {
    cameraRef.current = { zoomBy, panOffset, setPanOffset };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const camera = cameraRef.current;
      if (e.ctrlKey || e.metaKey) {
        camera.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_RATE));
      } else {
        const pan = camera.panOffset();
        camera.setPanOffset({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled]);

  const stableZoomBy = useCallback(
    (ratio: number) => cameraRef.current.zoomBy(ratio),
    [],
  );

  return { containerRef, zoomBy: stableZoomBy };
}
