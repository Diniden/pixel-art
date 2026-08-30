/**
 * LightingSurface — the lighting studio's `<canvas>` stack, and nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE POINT OF THIS FILE IS WHAT IT DOES *NOT* CONTAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingCanvas.tsx` was 785 lines with five fused responsibilities and
 * **14 store members in one destructure**. Task 33 took it apart; what survives
 * here is the markup: two `<canvas>` elements, the pan/zoom transform wrapper,
 * and the info bar.
 *
 * ── What "pure" means here, concretely ────────────────────────────────────
 *
 * The complete import list of this file is:
 *
 *     import type { MouseEvent, RefObject, TouchEvent } from "react";
 *     import "./LightingSurface.css";
 *
 * Two lines, one of them types-only and one a stylesheet. No store, no MobX, no
 * API, no `useContext`, no `observer()`, and — matching the bar `CanvasSurface`
 * set in W24 — not even a value import from React. That is what makes the
 * store-free stories next door **structurally guaranteed** rather than merely
 * asserted: there is no import through which a store could arrive.
 *
 * ── ⚠️ NO PIXEL GRID CROSSES THIS BOUNDARY ────────────────────────────────
 *
 * There is no `pixels` prop, no `layer` prop and no `frame` prop, and there
 * never may be. The owner's real project holds 300,249 cells; `layer.pixels` is
 * `observableRef` exactly so MobX never looks inside one (R2). Grids reach these
 * canvases through the imperative draw the container drives from a `reaction` on
 * `pixelVersion`, via `editCanvasRef.current` — not through React.
 *
 * This component therefore receives REFS and paints nothing itself.
 *
 * ── The two canvases ──────────────────────────────────────────────────────
 *
 * 1. `editCanvasRef`     the normal/height visualisation — the only one that
 *                        takes pointer events.
 * 2. `overlayCanvasRef`  the cyan brush-hover overlay, `pointer-events: none`.
 *
 * Both are ALWAYS mounted, unlike `CanvasSurface`'s three conditional overlays:
 * `LightingCanvas` had no conditional overlay, and inventing one here would be a
 * behaviour change.
 *
 * ── The empty state is a prop, not a store read ───────────────────────────
 *
 * `LightingCanvas.tsx:678-686` returned an "Select an object and frame" panel
 * when `project`, `frame` or `obj` was missing. Three store reads; one boolean
 * prop. The container decides, this component renders.
 *
 * ── The `viewControls` slot (2026-08-29, lighting preview split) ───────────
 *
 * `.lighting-canvas__viewport` is `position: relative` so it is the containing
 * block for the floating control cluster passed as `viewControls`, which
 * positions itself `absolute; left/bottom: var(--space-3)`. Without that, the
 * cluster would resolve against `.lighting-canvas` and — once the lighting
 * workspace splits into an Edit pane and a Preview pane — land over the wrong
 * pane entirely. This mirrors `CanvasSurface`/`.canvas__viewport` exactly.
 *
 * ⚠️ THE CONTROLS GO IN THE VIEWPORT, NEVER IN `.lighting-canvas__surface`.
 * That element carries the pan/zoom `transform`, so anything inside it is
 * panned and scaled with the sprite. A control whose whole job is to rescue a
 * lost view must not be reachable by the gesture that lost it.
 */

import type { MouseEvent, RefObject, TouchEvent } from "react";
import "./LightingSurface.css";

export interface LightingSurfaceProps {
  /* ── element refs (the imperative renderers' only handle) ──────────────── */
  /** The editable normal/height surface. */
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** The brush-hover overlay. */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The scroll/gesture viewport. `tabIndex={0}` is on this element so it can
   * hold focus, and `touch-action: none` is set on it in CSS so the browser
   * does not steal two-finger gestures for page scrolling.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * The component's outermost element. Kept as a separate ref from
   * `containerRef` because that one is the gesture viewport INSIDE the layout;
   * this one is the whole block, including the info bar.
   */
  rootRef: RefObject<HTMLDivElement | null>;

  /* ── dimensions ────────────────────────────────────────────────────────── */
  /** Backing-store width in device pixels (`gridWidth * zoom`). */
  canvasWidth: number;
  /** Backing-store height in device pixels. */
  canvasHeight: number;

  /* ── the view transform ────────────────────────────────────────────────── */
  /**
   * Pan, in CSS pixels, applied as a `translate`.
   *
   * ⚠️ Unlike `CanvasSurface`'s, this pan is purely local and is never
   * persisted: `LightingCanvas` passed no `onCommitPan` to `useCanvasViewport`,
   * so its pan died with the view. That difference is preserved.
   */
  viewPanOffset: { x: number; y: number };
  /** View scale, applied as a `scale`. */
  viewZoom: number;

  /* ── the info bar ──────────────────────────────────────────────────────── */
  /** `"height"` or `"normals"` — shown, not acted on. */
  editMode: "normals" | "height";
  /** Editable grid size, for the readout. */
  gridWidth: number;
  gridHeight: number;
  /** `uiState.zoom`, for the readout. Not the view transform's scale. */
  zoom: number;

  /* ── the empty state ───────────────────────────────────────────────────── */
  /** When true, renders only the placeholder. No canvas, no info bar. */
  empty?: boolean;

  /* ── the floating control cluster, injected as a child ─────────────────── */
  /**
   * Floating control cluster (reset view, mode/close buttons) drawn over this
   * pane. Rendered as a direct child of `.lighting-canvas__viewport`, which is
   * the containing block — so with a split region each pane's controls stay in
   * their own pane. Not rendered in the `empty` state.
   */
  viewControls?: React.ReactNode;

  /* ── pointer events (the hook's handlers, passed straight through) ─────── */
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLCanvasElement>) => void;
}

export function LightingSurface({
  editCanvasRef,
  overlayCanvasRef,
  containerRef,
  rootRef,
  canvasWidth,
  canvasHeight,
  viewPanOffset,
  viewZoom,
  editMode,
  gridWidth,
  gridHeight,
  zoom,
  empty = false,
  viewControls,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: LightingSurfaceProps) {
  if (empty) {
    return (
      <div className="lighting-canvas">
        <div className="lighting-canvas__empty">
          Select an object and frame to edit lighting
        </div>
      </div>
    );
  }

  return (
    <div className="lighting-canvas" ref={rootRef}>
      <div className="lighting-canvas__layout">
        <div
          className="lighting-canvas__viewport"
          ref={containerRef}
          tabIndex={0}
        >
          <div
            className="lighting-canvas__surface"
            style={{
              transform: `translate(${viewPanOffset.x}px, ${viewPanOffset.y}px) scale(${viewZoom})`,
              // `0 0` so the transform anchors at the sprite's top-left; the
              // pinch/wheel maths in `useCanvasViewport` assumes this origin.
              transformOrigin: "0 0",
            }}
          >
            <div className="lighting-canvas__stack">
              <canvas
                ref={editCanvasRef}
                className="lighting-canvas__edit-canvas"
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                // Releasing outside the canvas must still END the gesture, or a
                // stroke stays open and the next click extends it.
                onMouseLeave={onMouseLeave}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              />
              <canvas
                ref={overlayCanvasRef}
                className="lighting-canvas__overlay"
                width={canvasWidth}
                height={canvasHeight}
              />
            </div>
          </div>
          {/* Last child of the VIEWPORT, after `__surface`: paints above the
              sprite, outside the pan/zoom transform. */}
          {viewControls}
        </div>
      </div>

      <div className="lighting-canvas__info">
        <span>
          {editMode === "height" ? "Height" : "Normals"} • {gridWidth} ×{" "}
          {gridHeight}
        </span>
        <span className="lighting-canvas__separator">|</span>
        <span>Zoom: {zoom}x</span>
        <span className="lighting-canvas__separator">|</span>
        <span>
          Two-finger scroll to pan • Pinch to zoom • Shift = erase (height)
        </span>
      </div>
    </div>
  );
}
