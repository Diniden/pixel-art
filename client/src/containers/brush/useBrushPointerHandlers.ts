/**
 * useBrushPointerHandlers — the brush canvas's mouse and touch event layer
 * (Brush Studio plan, `docs/01-brush-studio`, task 20; touch arbitration and
 * the mouse pan from the follow-ups, `docs/11-brush-studio-followups`, task
 * 06 — MASTER D4).
 *
 * Lifted VERBATIM out of `BrushCanvasContainer` when task 20's gesture
 * wiring pushed it past `max-lines`. The container keeps everything that
 * touches a store — the tool context, the gesture controller, the release
 * routines — and hands this hook plain values and callbacks; this hook owns
 * only what the DEVICES differ on:
 *
 *   - mouse: primary button draws; the middle button, or alt + primary,
 *     PANS (the pixel canvas's rule, `CanvasContainer.tsx:4705-4711`) with
 *     `+dx/+dy` through the viewport engine's live pan ref; the hover marker
 *     follows the pointer and hides during a stroke; the release is a WINDOW
 *     `mouseup` bound only while a gesture or a pan is open, because it may
 *     land over a rail or outside the window;
 *   - touch: arbitrated by `canvasTouchFilter`, the same predicates the
 *     pixel canvas and `useCanvasViewport`'s native listener use. Two FINGERS
 *     are a pinch — it aborts any open stroke here and opens none; the
 *     engine's non-passive listener on the viewport container runs the zoom
 *     and the two-finger pan. A stylus plus any number of fingers is a stroke
 *     by the stylus. Under `pencilOnly` a lone finger neither draws nor pans
 *     (measured: the pixel canvas has no single-finger pan — MASTER §1). A
 *     lift with a contact still on the viewport ends nothing; a cancel aborts.
 *
 * Both devices dispatch a press through `beginPointer` and a drag through
 * `continuePointer`, so what a tool DOES cannot diverge between them here
 * (`useCanvasPointer`'s rule, carried over).
 *
 * Store-free: no MobX, no store instance, no API — React and the pure
 * `canvasTouchFilter` only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { Point } from "../../types";
import {
  drawingTouch,
  pinchTouches,
  touchesInContainer,
} from "../../ui/canvas/model/canvasTouchFilter";
import type { PointerDevice } from "../../ui/canvas/tools/toolHandlers";

export interface BrushPointerHandlerArgs {
  /** `isBrushInertTool(tool)`: a press or a drag on an inert tool does nothing. */
  inert: boolean;
  /** A layer is selected. Without one a press does nothing. */
  hasLayer: boolean;
  /** `canvasInteraction.isDrawing` — a gesture (stroke or move drag) is open. */
  isDrawing: boolean;
  /**
   * The viewport container — the box touches are counted against
   * (`touchesInContainer`). `null` counts every touch, as the filter does.
   */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * `app.ui.viewport.pencilOnly ?? isTouchDevice()`, resolved by the
   * container: a finger may pinch but may not paint.
   */
  pencilOnly: boolean;
  /** The engine's `isPinching` — a two-finger gesture is in flight. */
  isPinching: () => boolean;
  /** The engine's live pan and its setters, for the mouse pan. */
  viewPanRef: MutableRefObject<Point>;
  setViewPanOffset: (pan: Point) => void;
  scheduleCommitPan: () => void;
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

export interface BrushPointerResult {
  handlers: BrushPointerHandlers;
  /** A middle / alt drag is in flight — the container shows `grabbing`. */
  isPanning: boolean;
}

/** The pixel canvas's rule: the middle button, or alt + primary, pans. */
function isPanPress(e: React.MouseEvent): boolean {
  return e.button === 1 || (e.button === 0 && e.altKey);
}

export function useBrushPointerHandlers({
  inert,
  hasLayer,
  isDrawing,
  containerRef,
  pencilOnly,
  isPinching,
  viewPanRef,
  setViewPanOffset,
  scheduleCommitPan,
  getCoords,
  setHoverPixel,
  beginPointer,
  continuePointer,
  finishStroke,
  abortStroke,
}: BrushPointerHandlerArgs): BrushPointerResult {
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPointRef = useRef<Point | null>(null);

  /* ── mouse ─────────────────────────────────────────────────────────────── */
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanPress(e)) {
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        return;
      }
      if (e.button !== 0 || inert || !hasLayer) return;
      beginPointer(e.clientX, e.clientY, "mouse");
    },
    [inert, hasLayer, beginPointer],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // A mouse leaves its cells visible, so the marker hides during a stroke.
      setHoverPixel(isDrawing ? null : getCoords(e.clientX, e.clientY));
      const last = lastPanPointRef.current;
      if (isPanning && last) {
        // ⚠️ DELIBERATELY UNCLAMPED, as the pixel canvas's pan is
        // (`CanvasContainer.tsx:4884-4896`); Reset View is the recovery.
        const next = {
          x: viewPanRef.current.x + (e.clientX - last.x),
          y: viewPanRef.current.y + (e.clientY - last.y),
        };
        setViewPanOffset(next);
        scheduleCommitPan();
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!isDrawing || inert) return;
      continuePointer(e.clientX, e.clientY, "mouse");
    },
    [
      setHoverPixel,
      isDrawing,
      inert,
      getCoords,
      continuePointer,
      isPanning,
      viewPanRef,
      setViewPanOffset,
      scheduleCommitPan,
    ],
  );

  const onMouseLeave = useCallback(() => setHoverPixel(null), [setHoverPixel]);

  // The release may land anywhere — over a rail, outside the window — so it
  // is a window listener, bound only while a gesture or a pan is open. A pan
  // release closes the pan and nothing else: a pan press never opened a
  // stroke, so there is nothing to finish.
  useEffect(() => {
    if (!isDrawing && !isPanning) return;
    const onUp = () => {
      if (isPanning) {
        lastPanPointRef.current = null;
        setIsPanning(false);
        return;
      }
      finishStroke();
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDrawing, isPanning, finishStroke]);

  /* ── touch ─────────────────────────────────────────────────────────────── */
  // ⚠️ The touches ON THE VIEWPORT, not `e.touches` (every touch on the
  // page) and not `targetTouches` (only the transformed `<canvas>`) — the
  // same predicate the engine's native listener counts with, so the two
  // sides never disagree about what is a pinch. See `canvasTouchFilter`.
  const canvasTouches = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>): React.Touch[] =>
      touchesInContainer(Array.from(e.touches), containerRef.current),
    [containerRef],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const startTouches = canvasTouches(e);
      // Two FINGERS are a pinch (a stylus never counts toward one): the
      // engine owns it; here it only aborts whatever was open, so the first
      // finger does not also lay down a stroke.
      if (pinchTouches(startTouches).length >= 2) {
        if (isDrawing) abortStroke();
        return;
      }
      if (inert || !hasLayer) return;
      // A stylus wins over any resting finger; a lone finger draws unless
      // `pencilOnly`, in which case it does nothing at all here.
      const t = drawingTouch(startTouches, pencilOnly);
      if (!t) return;
      // No hover marker on touch: the finger covers the cells anyway.
      beginPointer(t.clientX, t.clientY, "touch");
    },
    [
      canvasTouches,
      isDrawing,
      abortStroke,
      inert,
      hasLayer,
      pencilOnly,
      beginPointer,
    ],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const moveTouches = canvasTouches(e);
      // `pinchTouches`, not the raw count: a Pencil and a resting finger are
      // two contacts and one stroke.
      if (pinchTouches(moveTouches).length >= 2 || isPinching()) return;
      if (!isDrawing || inert) return;
      const t = drawingTouch(moveTouches, pencilOnly);
      if (!t) return;
      continuePointer(t.clientX, t.clientY, "touch");
    },
    [canvasTouches, isPinching, isDrawing, inert, pencilOnly, continuePointer],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      // A contact remains on the viewport — the pixel canvas's rule.
      if (canvasTouches(e).length > 0) return;
      if (isDrawing) finishStroke();
    },
    [canvasTouches, isDrawing, finishStroke],
  );

  const onTouchCancel = useCallback(() => abortStroke(), [abortStroke]);

  return {
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseLeave,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
    isPanning,
  };
}
