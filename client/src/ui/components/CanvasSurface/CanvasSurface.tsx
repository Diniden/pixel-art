/**
 * CanvasSurface — the pixel editor's `<canvas>` stack, and nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE POINT OF THIS FILE IS WHAT IT DOES *NOT* CONTAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `Canvas.tsx` was 3,062 lines with eleven responsibilities and **47 store
 * members in a single destructure** — the largest coupling site in the
 * application. Tasks 30, 31 and 32 took it apart. What survives here is the
 * markup: six `<canvas>` elements, the pan/zoom transform wrapper, and the
 * cursor. Roughly 15 props, every one a plain value or a callback.
 *
 * A component that took all 47 members as props would have had a ~52-prop
 * interface and would have been a purification in name only. That is precisely
 * why tasks 30 and 31 came first: the props below are few because the work is
 * genuinely elsewhere, not because it was hidden in a context.
 *
 * ── What "pure" means here, concretely ────────────────────────────────────
 *
 * No store, no MobX, no API, no `useContext`, no `observer()`. ESLint (task
 * 05) enforces every one of those against `src/ui/**`, and the rule is
 * probe-verified rather than assumed — a `no-restricted-imports` rule that
 * matches nothing looks exactly like a rule that passes.
 *
 * The practical consequence is the story file next door: all six stories
 * mount this component with **no store provider at all**. That is the proof
 * the boundary holds, and it is task 32's second gate.
 *
 * ── ⚠️ NO PIXEL GRID CROSSES THIS BOUNDARY ────────────────────────────────
 *
 * There is no `pixels` prop, no `layers` prop, no `frame` prop, and there
 * never may be. The owner's real project holds 300,249 cells; `layer.pixels`
 * is `observableRef` exactly so MobX never looks inside one (R2). Grids reach
 * the canvas through the imperative draw call the container drives from a
 * `reaction` on `pixelVersion` — through `canvasRef.current`, not through
 * React. A `PixelData[][]` prop here would defeat the whole arrangement and
 * present as "MobX is slow".
 *
 * This component therefore receives REFS and paints nothing itself. It is a
 * layout and an event surface.
 *
 * ── The six canvases, and which of them are conditionally mounted ────────
 *
 * 1. `canvasRef`                  the editable surface — always present, and
 *                                 the only one that takes pointer events.
 * 2. `overlayCanvasRef`           reference-image trace overlay.
 * 3. `frameOverlayCanvasRef`      onion-skin of another frame (#8).
 * 4. `frameTraceOverlayCanvasRef` the nudgeable frame-trace overlay (#9).
 * 5. `hoverCanvasRef`             the pencil/mouse hover marker.
 * 6. `reflectionCanvasRef`        the reflection tool's animated guide lines.
 *
 * The reflection guides get their own always-mounted canvas for the same
 * reason the hover marker does, only more sharply: they ANIMATE. The dashes
 * crawl at ~12 fps for as long as any line exists, and routing that through
 * the main `render` would re-rasterise 300,249 cells several times a second
 * while the user is not even drawing. On a dedicated canvas each tick repaints
 * a handful of line segments and the artwork underneath is never touched. It
 * is mounted unconditionally (rather than behind a `hasReflectionLines` flag)
 * so the painter's `invalidate()` always has a context to draw into, exactly
 * as the hover marker's does.
 *
 * The hover marker gets its OWN canvas rather than being drawn into the main
 * render pass, and that is a performance decision, not a tidiness one. The
 * main `render` in `CanvasContainer` repaints every visible cell of every
 * visible layer with `fillRect`; on the owner's real project that is a
 * six-figure loop. An Apple Pencil emits hover samples at the display's
 * refresh rate whether or not it ever touches down, so routing the marker
 * through that pass would re-rasterise the whole sprite continuously while the
 * user's hand merely moved NEAR the screen. On its own canvas the marker
 * repaints a few dozen cells and the artwork underneath is not touched.
 *
 * The three overlays mount only when active, and their mutual exclusions are
 * preserved verbatim from `Canvas.tsx:2012-2039`: the frame overlay hides
 * while EITHER trace mode is on, because two semi-transparent onion skins
 * stacked on one sprite are unreadable. Passing the flags in rather than
 * deriving them keeps that policy where the store data lives.
 */

import type {
  CSSProperties,
  MouseEvent,
  ReactNode,
  RefObject,
  TouchEvent,
} from "react";
import "./CanvasSurface.css";

export interface CanvasSurfaceProps {
  /* ── element refs (the imperative renderers' only handle) ──────────────── */
  /** The editable surface. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Reference-image trace overlay. */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Frame onion-skin overlay (#8). */
  frameOverlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Frame-trace overlay (#9). */
  frameTraceOverlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The hover marker's surface. See the header for why it is separate.
   *
   * Always mounted, unlike the three overlays above: hover can begin at any
   * moment without a mode being entered first, and mounting a canvas in
   * response to the first sample would drop that sample while React committed.
   */
  hoverCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The reflection tool's animated guide lines. See the header for why the
   * dashes get a surface of their own rather than a pass in the main `render`.
   *
   * ⚠️ OPTIONAL, deliberately (plan 03, locked decision D9). The canvas is
   * mounted unconditionally, but the PROP is not required, so this component
   * and `CanvasContainer` both compile before the container is taught to pass
   * a ref. When it is absent the canvas still exists and simply stays blank —
   * nothing paints into it. Do not tighten this to a required prop without
   * checking every call site; there is no behavioural gain in doing so.
   */
  reflectionCanvasRef?: RefObject<HTMLCanvasElement | null>;
  /**
   * The scroll/gesture viewport.
   *
   * `tabIndex={0}` is on this element so it can hold focus for the keyboard
   * shortcuts, and `touch-action: none` is set on it in CSS so the browser
   * does not steal two-finger gestures for page scrolling.
   */
  containerRef: RefObject<HTMLDivElement | null>;

  /* ── dimensions ────────────────────────────────────────────────────────── */
  /** Backing-store width in device pixels (`viewWidth * zoom`). */
  canvasWidth: number;
  /** Backing-store height in device pixels. */
  canvasHeight: number;

  /* ── the view transform ────────────────────────────────────────────────── */
  /**
   * Pan, in CSS pixels, applied as a `translate`.
   *
   * ⚠️ This is the *view* pan (the transform), not the persisted
   * `uiState.panOffset`. They are separate on purpose: the transform updates
   * at pointer rate, the persisted value is committed on a trailing schedule,
   * so a drag does not write to the project sixty times a second.
   */
  viewPanOffset: { x: number; y: number };
  /** View scale, applied as a `scale`. Also separate from `uiState.zoom`. */
  viewZoom: number;

  /* ── cursor ────────────────────────────────────────────────────────────── */
  /** A CSS `cursor` value. Resolved by the container from the active tool. */
  cursor: string;

  /* ── which overlays are mounted ────────────────────────────────────────── */
  showReferenceOverlay: boolean;
  showFrameOverlay: boolean;
  showFrameTraceOverlay: boolean;

  /* ── pointer events (the hooks' handlers, passed straight through) ─────── */
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLCanvasElement>) => void;
  /**
   * Floating controls over the viewport (the bottom-left column).
   *
   * ⚠️ Rendered as a SIBLING of `canvas__layout`, never inside it — that
   * element carries the pan/zoom transform, and a control placed within it
   * would be scaled and panned with the artwork. See `CanvasViewControls.css`.
   */
  viewControls?: ReactNode;
}

/** `pointer-events: none` is also in CSS; kept inline as `Canvas.tsx` had it. */
const OVERLAY_STYLE: CSSProperties = { pointerEvents: "none" };

export function CanvasSurface({
  canvasRef,
  overlayCanvasRef,
  frameOverlayCanvasRef,
  frameTraceOverlayCanvasRef,
  hoverCanvasRef,
  reflectionCanvasRef,
  containerRef,
  canvasWidth,
  canvasHeight,
  viewPanOffset,
  viewZoom,
  cursor,
  showReferenceOverlay,
  showFrameOverlay,
  showFrameTraceOverlay,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  viewControls,
}: CanvasSurfaceProps) {
  return (
    <div className="canvas">
      <div className="canvas__viewport" ref={containerRef} tabIndex={0}>
        <div
          className="canvas__layout"
          style={{
            transform: `translate(${viewPanOffset.x}px, ${viewPanOffset.y}px) scale(${viewZoom})`,
            // `0 0` so the transform anchors at the sprite's top-left; the
            // pinch/wheel maths in `useCanvasViewport` assumes this origin.
            transformOrigin: "0 0",
          }}
        >
          <div className="canvas__frame">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="canvas__surface"
              style={{ cursor }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              // Releasing outside the canvas must still END the gesture, or a
              // stroke stays open and the next click extends it. Verbatim
              // from `Canvas.tsx:2007`.
              onMouseLeave={onMouseLeave}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />

            <canvas
              ref={hoverCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="canvas__overlay canvas__overlay--hover"
              style={OVERLAY_STYLE}
            />

            {showReferenceOverlay && (
              <canvas
                ref={overlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="canvas__overlay"
              />
            )}

            {showFrameOverlay && (
              <canvas
                ref={frameOverlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="canvas__overlay"
                style={OVERLAY_STYLE}
              />
            )}

            {showFrameTraceOverlay && (
              <canvas
                ref={frameTraceOverlayCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="canvas__overlay"
              />
            )}

            {/*
              LAST in the frame, and that ordering is the whole point: these
              siblings are absolutely positioned, so DOM order IS z-order.
              The guides mark where every subsequent stroke will be mirrored,
              which is useless information if the hover marker or a
              semi-transparent trace/onion overlay can cover it. Mounted
              unconditionally so the painter's `invalidate()` always has a
              context, exactly as the hover marker is.
            */}
            <canvas
              ref={reflectionCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="canvas__overlay canvas__overlay--reflection"
              style={OVERLAY_STYLE}
            />
          </div>
        </div>
        {viewControls}
      </div>
    </div>
  );
}
