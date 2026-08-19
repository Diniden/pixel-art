/**
 * The canvas viewport engine — pan, view-zoom, wheel, and pinch gesture math.
 *
 * ## Why this hook exists
 *
 * This engine was written **three times**: `Canvas.tsx`, `LightingCanvas.tsx`,
 * and a partial third copy in `ReferenceImageModal.tsx`. Task 31 measured the
 * first two at ~185 lines, ≥95% identical. Verified again at W23's HEAD before
 * extraction, and the spec's measurements hold exactly:
 *
 * - `clampPanToViewport` — byte-identical apart from the container ref's name
 *   (`containerRef` vs `editorContainerRef`).
 * - `getTouchCenter` / `getTouchDistance` — same, one identifier apart.
 * - The wheel handler — token-for-token identical after normalising brace style
 *   and one comment, **except** for Canvas's two extra `scheduleCommitPan()`
 *   calls. That is the single real functional difference, and it is preserved:
 *   see `commitPan` below.
 *
 * ## Why `wheelStateRef` survives the extraction
 *
 * The wheel listener is registered natively with `{ passive: false }` — React's
 * synthetic `onWheel` is passive, so `preventDefault()` on a ctrl+wheel pinch
 * would not work through it. A native listener that closed over `viewZoom` and
 * `viewPanOffset` would capture them at registration time and go stale, so both
 * copies funnelled current values through a mutable ref, re-registering only
 * when the debounce callback changed. That structure is kept verbatim rather
 * than "modernised" — it is load-bearing for gesture smoothness.
 *
 * ## The zoom anchor lock, and why pinch does not clamp
 *
 * Both copies locked the zoom focal point for `ZOOM_ANCHOR_MS` after each step.
 * Without it, per-event re-derivation of the anchor makes a pinch jitter and
 * drift. Both copies also deliberately skip `clampPanToViewport` while zooming
 * (the comment "clamping fights the anchor and causes jitter/drift" is theirs).
 * Both behaviours are preserved exactly.
 *
 * ## Purity
 *
 * No store, no MobX, no API. Pan and zoom are local React state; committing pan
 * outward is the caller's `onCommitPan` callback, which is how the store stays
 * on the other side of the `ui/` boundary.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ViewPoint {
  x: number;
  y: number;
}

/** How long the zoom focal point stays locked after a zoom step, in ms. */
export const ZOOM_ANCHOR_MS = 100;

/** View-zoom limits. Both legacy copies used exactly this range. */
export const MIN_VIEW_ZOOM = 0.25;
export const MAX_VIEW_ZOOM = 4;

/**
 * How long pan settles before being committed outward, in ms. Canvas debounced
 * the store write so a gesture does not cause a heavy re-render per frame.
 */
const PAN_COMMIT_MS = 150;

/** Wheel zoom sensitivity — `Math.exp(-deltaY * WHEEL_ZOOM_RATE)`. */
const WHEEL_ZOOM_RATE = 0.012;

/**
 * Pinch response curve. The exponent above 1 makes a pinch feel proportional
 * rather than sluggish; it is the legacy value and is not a tuning knob here.
 */
const PINCH_EXPONENT = 1.15;

export interface UseCanvasViewportOptions {
  /** The element the gesture is measured against and the wheel is bound to. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Unscaled content size in px. Multiplied by view zoom to clamp panning. */
  canvasWidth: number;
  canvasHeight: number;
  /** Pan owned by the caller (typically persisted). Seeds and re-syncs local pan. */
  panOffset: ViewPoint;
  /**
   * Commit debounced pan outward. When omitted, pan stays local — which is how
   * `LightingCanvas` behaved, and the reason its wheel handler had no
   * `scheduleCommitPan()` calls. Supplying it reproduces Canvas's behaviour.
   */
  onCommitPan?: (pan: ViewPoint) => void;
  /**
   * Bump to force local pan back to `panOffset` — Canvas re-synced whenever the
   * selected object, frame, or studio mode changed. Changing this value cancels
   * any pending commit, exactly as the legacy effect did.
   */
  resyncKey?: string;
}

export interface CanvasViewport {
  /** Current view zoom (CSS transform scale). */
  viewZoom: number;
  setViewZoom: React.Dispatch<React.SetStateAction<number>>;
  /** Current local pan, in px. */
  viewPanOffset: ViewPoint;
  setViewPanOffset: (pan: ViewPoint) => void;
  /** Live pan, readable inside native listeners without a stale closure. */
  viewPanRef: React.MutableRefObject<ViewPoint>;
  /** Debounced outward commit. No-op when `onCommitPan` was not supplied. */
  scheduleCommitPan: () => void;
  /** Clamp a pan so scaled content stays reachable inside the container. */
  clampPanToViewport: (
    offset: ViewPoint,
    contentWidth: number,
    contentHeight: number,
  ) => ViewPoint;
  /** Midpoint of a two-finger gesture, relative to the container. */
  getTouchCenter: (touches: React.TouchList) => ViewPoint;
  /** Distance between the first two touches. */
  getTouchDistance: (touches: React.TouchList) => number;
  /** Begin a pinch. Call from `touchstart` when two touches are down. */
  beginPinch: (touches: React.TouchList) => void;
  /** Advance a pinch. Returns false when no pinch is in flight. */
  updatePinch: (touches: React.TouchList) => boolean;
  /** End a pinch. */
  endPinch: () => void;
  /** True while a pinch is being tracked. */
  isPinching: () => boolean;
}

export function useCanvasViewport({
  containerRef,
  canvasWidth,
  canvasHeight,
  panOffset,
  onCommitPan,
  resyncKey,
}: UseCanvasViewportOptions): CanvasViewport {
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPanOffset, setViewPanOffsetState] = useState<ViewPoint>(panOffset);
  const viewPanRef = useRef<ViewPoint>(viewPanOffset);

  const panCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pinchStartRef = useRef<{
    distance: number;
    center: ViewPoint;
    viewZoom: number;
    pan: ViewPoint;
  } | null>(null);
  const zoomAnchorLockRef = useRef<{
    anchor: ViewPoint;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // `onCommitPan` is read through a ref so a caller passing an inline function
  // does not re-register the native wheel listener on every render.
  //
  // The three ref writes in this hook are flagged by `react-hooks/refs`, which
  // objects to writing a ref during render. They are deliberate and preserved
  // from the legacy code: the native wheel listener is registered ONCE (it must
  // be, to stay non-passive and avoid tearing down mid-gesture), so the only
  // way it can see current values is a ref updated on every render. Deferring
  // these writes into an effect would make the listener act on values one frame
  // stale, which is visible as pan/zoom lag during a gesture.
  const commitPanRef = useRef(onCommitPan);
  // eslint-disable-next-line react-hooks/refs
  commitPanRef.current = onCommitPan;

  const setViewPanOffset = useCallback((pan: ViewPoint) => {
    viewPanRef.current = pan;
    setViewPanOffsetState(pan);
  }, []);

  const scheduleCommitPan = useCallback(() => {
    if (!commitPanRef.current) return;
    if (panCommitTimeoutRef.current) clearTimeout(panCommitTimeoutRef.current);
    panCommitTimeoutRef.current = setTimeout(() => {
      commitPanRef.current?.(viewPanRef.current);
    }, PAN_COMMIT_MS);
  }, []);

  useEffect(() => {
    viewPanRef.current = viewPanOffset;
  }, [viewPanOffset]);

  // Re-sync local pan when the caller's context changes (object/frame/mode).
  useEffect(() => {
    if (resyncKey === undefined) return;
    viewPanRef.current = panOffset;
    // A synchronous setState in an effect is what the legacy re-sync did, and
    // it is correct here: the pan must land before the next paint or the canvas
    // visibly jumps to the old offset and back when the object/frame changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewPanOffsetState(panOffset);
    if (panCommitTimeoutRef.current) {
      clearTimeout(panCommitTimeoutRef.current);
      panCommitTimeoutRef.current = null;
    }
    // `panOffset` is deliberately NOT a dependency: the legacy effect keyed on
    // the context identifiers alone, so an incoming pan echo does not clobber a
    // gesture in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncKey]);

  // Clear the pending commit on unmount so it cannot fire into a dead tree.
  useEffect(() => {
    return () => {
      if (panCommitTimeoutRef.current) {
        clearTimeout(panCommitTimeoutRef.current);
        panCommitTimeoutRef.current = null;
      }
    };
  }, []);

  const clampPanToViewport = useCallback(
    (offset: ViewPoint, contentWidth: number, contentHeight: number) => {
      const container = containerRef.current;
      if (!container) return offset;
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const minX = Math.min(0, viewW - contentWidth);
      const maxX = Math.max(0, viewW - contentWidth);
      const minY = Math.min(0, viewH - contentHeight);
      const maxY = Math.max(0, viewH - contentHeight);
      return {
        x: Math.max(minX, Math.min(maxX, offset.x)),
        y: Math.max(minY, Math.min(maxY, offset.y)),
      };
    },
    [containerRef],
  );

  /* ── the native wheel listener ─────────────────────────────────────────── */

  const wheelStateRef = useRef({
    viewPanOffset: { x: 0, y: 0 } as ViewPoint,
    canvasWidth,
    canvasHeight,
    viewZoom,
    clampPanToViewport,
  });
  // See the note above `commitPanRef`: this render-phase write is what keeps
  // the once-registered native wheel listener reading current values.
  /* eslint-disable react-hooks/refs */
  wheelStateRef.current = {
    viewPanOffset: viewPanRef.current,
    canvasWidth,
    canvasHeight,
    viewZoom,
    clampPanToViewport,
  };
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: WheelEvent) => {
      const state = wheelStateRef.current;
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        if (!zoomAnchorLockRef.current) {
          zoomAnchorLockRef.current = {
            anchor: { x: cursorX, y: cursorY },
            timeoutId: null,
          };
        }
        if (zoomAnchorLockRef.current.timeoutId) {
          clearTimeout(zoomAnchorLockRef.current.timeoutId);
        }
        zoomAnchorLockRef.current.timeoutId = setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS);
        const anchor = zoomAnchorLockRef.current.anchor;

        const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_RATE);
        const newViewZoom = Math.max(
          MIN_VIEW_ZOOM,
          Math.min(MAX_VIEW_ZOOM, state.viewZoom * factor),
        );
        const ratio = newViewZoom / state.viewZoom;
        // Don't clamp during pinch — clamping fights the anchor and causes jitter/drift
        const newPan = {
          x: anchor.x * (1 - ratio) + state.viewPanOffset.x * ratio,
          y: anchor.y * (1 - ratio) + state.viewPanOffset.y * ratio,
        };
        setViewZoom(newViewZoom);
        viewPanRef.current = newPan;
        setViewPanOffsetState(newPan);
        scheduleCommitPan();
      } else {
        e.preventDefault();
        const displayedW = state.canvasWidth * state.viewZoom;
        const displayedH = state.canvasHeight * state.viewZoom;
        const next = state.clampPanToViewport(
          {
            x: state.viewPanOffset.x - e.deltaX,
            y: state.viewPanOffset.y - e.deltaY,
          },
          displayedW,
          displayedH,
        );
        viewPanRef.current = next;
        setViewPanOffsetState(next);
        scheduleCommitPan();
      }
    };

    container.addEventListener("wheel", handler, { passive: false });
    return () => {
      container.removeEventListener("wheel", handler);
      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
    };
  }, [containerRef, scheduleCommitPan]);

  /* ── touch gesture math ────────────────────────────────────────────────── */

  const getTouchCenter = useCallback(
    (touches: React.TouchList): ViewPoint => {
      const container = containerRef.current;
      if (!container || touches.length < 2) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      return { x, y };
    },
    [containerRef],
  );

  const getTouchDistance = useCallback((touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.hypot(dx, dy);
  }, []);

  const beginPinch = useCallback(
    (touches: React.TouchList) => {
      const center = getTouchCenter(touches);
      pinchStartRef.current = {
        distance: getTouchDistance(touches),
        center,
        viewZoom,
        pan: { ...viewPanRef.current },
      };
      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
      zoomAnchorLockRef.current = {
        anchor: center,
        timeoutId: setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS),
      };
    },
    [getTouchCenter, getTouchDistance, viewZoom],
  );

  const updatePinch = useCallback(
    (touches: React.TouchList): boolean => {
      const start = pinchStartRef.current;
      if (!start) return false;

      const dist = getTouchDistance(touches);
      const center = getTouchCenter(touches);
      // A zero/negative distance means the touches coincide; scaling by it
      // would divide by zero. The legacy code returned without ending the
      // pinch, so the gesture resumes when the fingers separate again.
      if (dist <= 0) return true;

      if (zoomAnchorLockRef.current?.timeoutId) {
        clearTimeout(zoomAnchorLockRef.current.timeoutId);
      }
      if (zoomAnchorLockRef.current) {
        zoomAnchorLockRef.current.timeoutId = setTimeout(() => {
          zoomAnchorLockRef.current = null;
        }, ZOOM_ANCHOR_MS);
      } else {
        zoomAnchorLockRef.current = {
          anchor: center,
          timeoutId: setTimeout(() => {
            zoomAnchorLockRef.current = null;
          }, ZOOM_ANCHOR_MS),
        };
      }
      const anchor = zoomAnchorLockRef.current.anchor;

      const scale = Math.pow(dist / start.distance, PINCH_EXPONENT);
      const newViewZoom = Math.max(
        MIN_VIEW_ZOOM,
        Math.min(MAX_VIEW_ZOOM, start.viewZoom * scale),
      );
      const zoomRatio = newViewZoom / start.viewZoom;
      // Don't clamp during pinch — clamping fights the anchor and causes jitter/drift
      const newPan = {
        x: anchor.x * (1 - zoomRatio) + start.pan.x * zoomRatio,
        y: anchor.y * (1 - zoomRatio) + start.pan.y * zoomRatio,
      };
      setViewZoom(newViewZoom);
      viewPanRef.current = newPan;
      setViewPanOffsetState(newPan);
      scheduleCommitPan();
      pinchStartRef.current = {
        distance: dist,
        center,
        viewZoom: newViewZoom,
        pan: newPan,
      };
      return true;
    },
    [getTouchCenter, getTouchDistance, scheduleCommitPan],
  );

  const endPinch = useCallback(() => {
    pinchStartRef.current = null;
  }, []);

  const isPinching = useCallback(() => pinchStartRef.current !== null, []);

  return {
    viewZoom,
    setViewZoom,
    viewPanOffset,
    setViewPanOffset,
    viewPanRef,
    scheduleCommitPan,
    clampPanToViewport,
    getTouchCenter,
    getTouchDistance,
    beginPinch,
    updatePinch,
    endPinch,
    isPinching,
  };
}
