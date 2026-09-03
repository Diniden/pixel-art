/**
 * Mouse + touch dispatch for the pixel canvas.
 *
 * ## What this replaces
 *
 * `Canvas.tsx`'s pointer section ran to ~1,030 lines across six handlers, and
 * the mouse and touch halves were near-duplicates that had already drifted
 * (R10 / Q44 — see `../canvas/tools/brushStamp.ts`). This hook keeps the parts
 * that genuinely differ between the two devices — button/alt-key panning versus
 * two-finger pinch, and which gestures each can express — and routes everything
 * that does NOT differ through one shared path:
 *
 *     mouse down ─┐                        ┌─ toolHandlers[tool].onDown
 *                 ├─ beginStroke(coords) ──┤
 *     touch start ┘                        └─ (identical, by construction)
 *
 * ## Device parity is structural
 *
 * `beginStroke`, `continueStroke` and `endStroke` take a `device` argument but
 * never branch on it. The only device-conditional code in this file is gesture
 * arbitration (pan/pinch), which is where the two input models legitimately
 * differ. Drawing behaviour cannot diverge again without someone deliberately
 * writing a branch.
 *
 * ## Touch is a deliberate subset — preserved
 *
 * The legacy touch handlers did NOT implement the eyedropper, the selection
 * tool, the origin tool, or the trace tools; a touch on any of them fell
 * through to plain drawing. That asymmetry is preserved rather than "fixed":
 * extending touch to those tools is a behaviour change, needs its own gesture
 * design (marquee-drag on a touchscreen conflicts with panning), and is well
 * outside a refactor's remit. `canDispatchTool` states it in one place instead
 * of leaving it implicit in which branches happen to be missing.
 *
 * ## Purity
 *
 * No store, no MobX, no API. Everything arrives as a callback or a value.
 */

import { useCallback, useRef } from "react";
import { getToolHandler } from "../canvas/tools/toolHandlers";
import type {
  ToolContext,
  ToolEvent,
  PointerDevice,
} from "../canvas/tools/toolHandlers";
import type { StampPoint } from "../canvas/tools/brushStamp";

/** Tools the touch path deliberately does not dispatch — see the module note. */
const MOUSE_ONLY_TOOLS = new Set([
  "eyedropper",
  "selection",
  "origin",
  "reference-trace",
]);

/** True when `tool` may be dispatched from `device`. */
export function canDispatchTool(tool: string, device: PointerDevice): boolean {
  return device === "mouse" || !MOUSE_ONLY_TOOLS.has(tool);
}

export interface UseCanvasPointerOptions {
  /** The active tool. */
  currentTool: string;
  /** Assembled per event by the caller; handed to the tool handlers as-is. */
  getToolContext: () => ToolContext;
  /** Screen → grid mapping. Returns `null` outside the drawable area. */
  getCoords: (clientX: number, clientY: number) => StampPoint | null;
  /** Opens a drawing gesture (sets `isDrawing` / `drawStartPoint`). */
  startDrawing: (coords: StampPoint) => void;
  /** True while a drawing gesture is open. */
  isDrawing: boolean;
  /** Where the current gesture began, for the shape tools' previews. */
  drawStartPoint: StampPoint | null;
}

export interface CanvasPointer {
  /** Dispatch a pointer-down for either device. Returns false if unhandled. */
  beginStroke: (
    clientX: number,
    clientY: number,
    device: PointerDevice,
  ) => boolean;
  /** Dispatch a pointer-move. Returns false if unhandled. */
  continueStroke: (
    clientX: number,
    clientY: number,
    device: PointerDevice,
  ) => boolean;
  /** Dispatch a pointer-up. */
  endStroke: (device: PointerDevice) => void;
  /** Last cell painted, or `null` between strokes. */
  lastStrokePixelRef: React.MutableRefObject<StampPoint | null>;
}

export function useCanvasPointer({
  currentTool,
  getToolContext,
  getCoords,
  startDrawing,
  isDrawing,
  drawStartPoint,
}: UseCanvasPointerOptions): CanvasPointer {
  const lastStrokePixelRef = useRef<StampPoint | null>(null);

  const makeEvent = useCallback(
    (coords: StampPoint, device: PointerDevice): ToolEvent => ({
      coords,
      device,
      drawStartPoint,
    }),
    [drawStartPoint],
  );

  const beginStroke = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (!canDispatchTool(currentTool, device)) return false;
      const coords = getCoords(clientX, clientY);
      if (!coords) return false;

      const handler = getToolHandler(currentTool);
      if (!handler) return false;

      /* ⚠️ THE GESTURE OPENS FOR ANY HANDLED TOOL, NOT ONLY ONES WITH `onDown`.
         The three shape tools (line/rectangle/ellipse) deliberately define ONLY
         `onMove` — they preview on drag and commit on release. Guarding this
         path on `onDown` therefore returned before `startDrawing`, so
         `isDrawing` stayed false and `drawStartPoint` stayed null; then
         `continueStroke`'s own `if (!isDrawing) return false` bailed on every
         move. The shapes previewed nothing and committed nothing (2026-09-01).
         `startDrawing` is what makes a drag a drag, so it must not be gated on
         a callback that the drag-only tools have no reason to define. */
      startDrawing(coords);
      handler.onDown?.(makeEvent(coords, device), getToolContext());
      return true;
    },
    [currentTool, getCoords, getToolContext, makeEvent, startDrawing],
  );

  const continueStroke = useCallback(
    (clientX: number, clientY: number, device: PointerDevice) => {
      if (!canDispatchTool(currentTool, device)) return false;

      const coords = getCoords(clientX, clientY);
      if (!coords) {
        // Leaving the drawable area mid-drag must not "bridge" a long gap when
        // the pointer re-enters — the legacy handlers both did exactly this.
        if (isDrawing) lastStrokePixelRef.current = null;
        return false;
      }
      if (!isDrawing) return false;

      const handler = getToolHandler(currentTool);
      if (!handler?.onMove) return false;

      handler.onMove(makeEvent(coords, device), getToolContext());
      return true;
    },
    [currentTool, getCoords, getToolContext, isDrawing, makeEvent],
  );

  const endStroke = useCallback(
    (device: PointerDevice) => {
      lastStrokePixelRef.current = null;
      const handler = getToolHandler(currentTool);
      if (!handler?.onUp) return;
      const coords = lastStrokePixelRef.current ?? { x: 0, y: 0 };
      handler.onUp(makeEvent(coords, device), getToolContext());
    },
    [currentTool, getToolContext, makeEvent],
  );

  return { beginStroke, continueStroke, endStroke, lastStrokePixelRef };
}
