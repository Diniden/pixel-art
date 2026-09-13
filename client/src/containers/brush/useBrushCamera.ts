/**
 * useBrushCamera — the brush canvas's camera, as a thin adapter over the
 * shared viewport engine (Brush follow-ups, `docs/11-brush-studio-followups`,
 * task 06; MASTER D1 / D2 / D3).
 *
 * Until this task the brush canvas had its own wheel listener and its own
 * pinch (`useBrushPointerHandlers` multiplied `brushUI.zoom` by the finger
 * distance ratio). That gave it none of what the pixel canvas has — no
 * two-finger pan, no anchored pinch, no zoom-out floor, no commit debounce,
 * no re-sync key — and left `zoom` NON-integer after every pinch (11.83 px
 * per cell, the measured "blur"). Now `useCanvasViewport` drives it exactly
 * as it drives the pixel and lighting canvases, and the brush store is the
 * camera it commits into (`BrushUIStore implements CanvasCamera`, task 03).
 *
 * Two zooms, as everywhere else: `zoom` is the pixel scale (screen px per
 * cell, `brushUI.zoom`) and `viewZoom` is the gesture scale the engine owns.
 * Pinch and ctrl/⌘-wheel change `viewZoom` only; nothing in the brush studio
 * changes `zoom` any more (there is no zoom control — `brushUI.zoomBy` is
 * left unused). `combinedScale = zoom * viewZoom` is computed HERE and
 * nowhere else (D3).
 *
 * ── Why this hook owns `containerRef` ────────────────────────────────────
 * `useCanvasViewport` binds its native wheel and two-finger listeners in an
 * effect keyed on the ref OBJECT, not on the element. The brush surface is
 * conditionally mounted (an empty state stands in until a brush is chosen),
 * so a ref created once would be `null` when that effect first runs and the
 * listeners would never bind. The ref is therefore re-created whenever
 * `enabled` flips: the fresh object reaches `CanvasSurface` and the engine in
 * the same render, the element lands at commit, and the engine's effect
 * re-runs against a ref that is now populated.
 *
 * Store-free in the sense the sibling hooks are: the camera arrives as the
 * `CanvasCamera` INTERFACE, read by the observer container that calls this.
 */
import { useCallback, useMemo } from "react";
import type { RefObject } from "react";
import type { CanvasCamera } from "../../stores/ui/CanvasCameraStore";
import {
  useCanvasViewport,
  viewZoomFloor,
} from "../../ui/hooks/useCanvasViewport";
import type { CanvasViewport } from "../../ui/hooks/useCanvasViewport";

export interface BrushCameraArgs {
  /** A document is open — the surface (and so the listeners' element) exists. */
  enabled: boolean;
  /** Brush size in cells: the 1:1 backing store. */
  width: number;
  height: number;
  /** `brushUI.zoom` — screen px per cell at view zoom 1. */
  zoom: number;
  /** `brushUI` — the pan/view-zoom the engine seeds from and commits into. */
  camera: CanvasCamera;
  /** Changing this re-seats the live pan/zoom from the store (brush, frame). */
  resyncKey: string;
}

export interface BrushCamera extends CanvasViewport {
  /** `CanvasSurface`'s viewport element — the wheel and two-finger target. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** `cellWidth * zoom`: the on-screen box at view zoom 1, never the backing store. */
  contentWidth: number;
  contentHeight: number;
  /** THE one scale the surface is magnified by: `zoom * viewZoom`. */
  combinedScale: number;
  /** The zoom-out floor for this content (`viewZoomFloor`). */
  viewZoomFloor: number;
  /** Recentre and return the view to 100%; `zoom` is untouched. */
  handleResetView: () => void;
}

export function useBrushCamera({
  enabled,
  width,
  height,
  zoom,
  camera,
  resyncKey,
}: BrushCameraArgs): BrushCamera {
  // A fresh ref object per mount of the surface — see the header.
  const containerRef = useMemo<RefObject<HTMLDivElement | null>>(
    () => ({ current: null }),
    // `enabled` is the whole point of the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  // ⚠️ `cellWidth * zoom`, NOT the 1:1 backing store: the engine clamps and
  // floors against the ON-SCREEN box (`useCanvasViewport.ts` options).
  const contentWidth = width * zoom;
  const contentHeight = height * zoom;
  const floor = viewZoomFloor(contentWidth, contentHeight);

  const viewport = useCanvasViewport({
    containerRef,
    contentWidth,
    contentHeight,
    panOffset: camera.panOffset,
    onCommitPan: (pan) => camera.setPanOffset(pan),
    viewZoom: camera.viewZoom,
    // The floor is passed IN: the store may not measure the DOM, and the
    // committed clamp must agree with the gesture's.
    onCommitViewZoom: (z) => camera.setViewZoom(z, floor),
    resyncKey,
  });
  const { viewZoom, setViewZoom, setViewPanOffset } = viewport;

  /**
   * Recentre this pane and return its view to 100%. Copied from
   * `LightingCanvasContainer.handleResetView`: the centring is MEASURED from
   * the untransformed viewport box against `contentWidth` (the box at view
   * zoom 1), and the store's `resetView` takes the result.
   */
  const handleResetView = useCallback(() => {
    const container = containerRef.current;
    const centered = container
      ? {
          x: Math.round((container.clientWidth - contentWidth) / 2),
          y: Math.round((container.clientHeight - contentHeight) / 2),
        }
      : { x: 0, y: 0 };
    setViewZoom(1);
    setViewPanOffset(centered);
    camera.resetView(centered);
  }, [
    containerRef,
    contentWidth,
    contentHeight,
    setViewZoom,
    setViewPanOffset,
    camera,
  ]);

  return {
    ...viewport,
    containerRef,
    contentWidth,
    contentHeight,
    combinedScale: zoom * viewZoom,
    viewZoomFloor: floor,
    handleResetView,
  };
}
