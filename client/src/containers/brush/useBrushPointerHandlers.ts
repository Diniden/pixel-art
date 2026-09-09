/**
 * useBrushPointerHandlers — the brush canvas's mouse and touch event layer
 * (Brush Studio plan, `docs/01-brush-studio`, task 20).
 *
 * Lifted VERBATIM out of `BrushCanvasContainer` when task 20's gesture
 * wiring pushed it past `max-lines`. The container keeps everything that
 * touches a store — the tool context, the gesture controller, the release
 * routines — and hands this hook plain values and callbacks; this hook owns
 * only what the DEVICES differ on:
 *
 *   - mouse: primary button only; the hover marker follows the pointer and
 *     hides during a stroke; the release is a WINDOW `mouseup` bound only
 *     while a gesture is open, because it may land over a rail or outside
 *     the window;
 *   - touch: a second finger is a pinch — it aborts any open stroke and
 *     zooms by the distance ratio on every move; a lift with a finger still
 *     down ends nothing; a cancel aborts.
 *
 * Both devices dispatch a press through `beginPointer` and a drag through
 * `continuePointer`, so what a tool DOES cannot diverge between them here
 * (`useCanvasPointer`'s rule, carried over).
 *
 * Store-free: no MobX, no store instance, no API — React and the pure
 * `touchDistance` only.
 */
import { useCallback, useEffect, useRef } from "react";
import type { Point } from "../../types";
import type { PointerDevice } from "../../ui/canvas/tools/toolHandlers";
import { touchDistance } from "./brushToolContext";

export interface BrushPointerHandlerArgs {
  /** `isBrushInertTool(tool)`: a press or a drag on an inert tool does nothing. */
  inert: boolean;
  /** A layer is selected. Without one a press does nothing. */
  hasLayer: boolean;
  /** `canvasInteraction.isDrawing` — a gesture (stroke or move drag) is open. */
  isDrawing: boolean;
  /** Screen → grid, `null` off the drawable area. */
  getCoords: (clientX: number, clientY: number) => Point | null;
  setHoverPixel: (p: Point | null) => void;
  /** Press: a gesture tool, else the handler table. */
  beginPointer: (
    clientX: number,
    clientY: number,
    device: PointerDevice,
  ) => void;
  /** Drag while a gesture is open. */
  continuePointer: (
    clientX: number,
    clientY: number,
    device: PointerDevice,
  ) => void;
  /** A genuine release: commit what the gesture owes and close it. */
  finishStroke: () => void;
  /** A pinch or a cancel: close the gesture, commit nothing new. */
  abortStroke: () => void;
  /** Pinch zoom, as a ratio of the new to the previous finger distance. */
  zoomBy: (ratio: number) => void;
}

export interface BrushPointerHandlers {
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchCancel: () => void;
}

export function useBrushPointerHandlers({
  inert,
  hasLayer,
  isDrawing,
  getCoords,
  setHoverPixel,
  beginPointer,
  continuePointer,
  finishStroke,
  abortStroke,
  zoomBy,
}: BrushPointerHandlerArgs): BrushPointerHandlers {
  const pinchDistanceRef = useRef<number | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 || inert || !hasLayer) return;
      beginPointer(e.clientX, e.clientY, "mouse");
    },
    [inert, hasLayer, beginPointer],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // A mouse leaves its cells visible, so the marker hides during a stroke.
      setHoverPixel(isDrawing ? null : getCoords(e.clientX, e.clientY));
      if (!isDrawing || inert) return;
      continuePointer(e.clientX, e.clientY, "mouse");
    },
    [setHoverPixel, isDrawing, inert, getCoords, continuePointer],
  );

  const onMouseLeave = useCallback(() => setHoverPixel(null), [setHoverPixel]);

  // The release may land anywhere — over a rail, outside the window — so it
  // is a window listener, bound only while a gesture is open.
  useEffect(() => {
    if (!isDrawing) return;
    const onUp = () => finishStroke();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDrawing, finishStroke]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length >= 2) {
        pinchDistanceRef.current = touchDistance(e.touches);
        if (isDrawing) abortStroke();
        return;
      }
      if (inert || !hasLayer) return;
      const t = e.touches[0];
      if (!t) return;
      // No hover marker on touch: the finger covers the cells anyway.
      beginPointer(t.clientX, t.clientY, "touch");
    },
    [isDrawing, abortStroke, inert, hasLayer, beginPointer],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length >= 2) {
        const d = touchDistance(e.touches);
        const last = pinchDistanceRef.current;
        if (last && last > 0) zoomBy(d / last);
        pinchDistanceRef.current = d;
        return;
      }
      if (!isDrawing || inert) return;
      const t = e.touches[0];
      if (!t) return;
      continuePointer(t.clientX, t.clientY, "touch");
    },
    [zoomBy, isDrawing, inert, continuePointer],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 0) return; // a finger remains
      pinchDistanceRef.current = null;
      if (isDrawing) finishStroke();
    },
    [isDrawing, finishStroke],
  );

  const onTouchCancel = useCallback(() => {
    pinchDistanceRef.current = null;
    abortStroke();
  }, [abortStroke]);

  return {
    onMouseDown,
    onMouseMove,
    onMouseLeave,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
