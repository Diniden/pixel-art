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
 *     import type { SvgPathSpec } from "../../canvas/svg/gridOverlay";
 *     import "./LightingSurface.css";
 *
 * Three lines, two of them types-only and one a stylesheet. No store, no MobX,
 * no API, no `useContext`, no `observer()`, and — matching the bar
 * `CanvasSurface` set in W24 — not even a value import from React. That is what
 * makes the store-free stories next door **structurally guaranteed** rather than
 * merely asserted: there is no import through which a store could arrive.
 * (`SvgPathSpec` is a type from `ui/canvas/svg/`, a sibling pure module with the
 * same prohibition; it erases at compile time and carries no runtime edge.)
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
 * ── The two canvases, and the SVG above them ──────────────────────────────
 *
 * 1. `editCanvasRef`     the normal/height visualisation — the only one that
 *                        takes pointer events.
 * 2. `overlayCanvasRef`  the cyan brush-hover overlay FILL, `pointer-events:
 *                        none`.
 * 3. the SVG chrome      the grid and the brush OUTLINE, as `<path>` data
 *                        supplied by the container.
 *
 * Both canvases are ALWAYS mounted, unlike `CanvasSurface`'s three conditional
 * overlays: `LightingCanvas` had no conditional overlay, and inventing one here
 * would be a behaviour change.
 *
 * ── ⚠️ THE CANVASES ARE 1:1 WITH THE PIXEL DATA (plan 05, task 08) ─────────
 *
 * `cellWidth`/`cellHeight` are GRID CELLS, not device pixels: one sprite pixel
 * is one canvas pixel, and ALL magnification is the single
 * `scale(combinedScale)` on `.lighting-canvas__surface`, where `combinedScale`
 * is `zoom * viewZoom`. That closed risk R7 — until task 08 this component took
 * a pre-scaled `canvasWidth` and applied only `viewZoom`, so the shared
 * `ViewportUIStore.zoom` meant "backing-store multiplier" here and "CSS scale
 * factor" in `CanvasSurface`. Both engines now interpret it identically.
 *
 * The consequence for this file: `image-rendering: pixelated` in the stylesheet
 * is LOAD-BEARING, not decorative. It is the only thing between a 1:1 canvas
 * and a blurry mess at 50x. Never remove it.
 *
 * The SVG uses `viewBox="0 0 cellWidth cellHeight"`, so one user unit is one
 * cell — the same coordinate model `CanvasSurface` uses, which is what lets the
 * two share `ui/canvas/svg/`'s path emitters unchanged.
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
import type { SvgPathSpec } from "../../canvas/svg/gridOverlay";
import "./LightingSurface.css";

/** Nothing to draw. Rendering an empty `d` is legal but pointlessly noisy. */
function hasPath(spec: SvgPathSpec | null | undefined): spec is SvgPathSpec {
  return !!spec && spec.d.length > 0;
}

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
  /**
   * Backing-store width in GRID CELLS — 1:1 with the pixel data.
   *
   * ⚠️ NOT `gridWidth * zoom`. This was `canvasWidth` and was pre-scaled until
   * plan 05 task 08; the rename is deliberate, because a stale `* zoom` would
   * have been invisible under the old name. `zoom` reaches the DOM only
   * through `combinedScale`.
   */
  cellWidth: number;
  /** Backing-store height in grid cells. See `cellWidth`. */
  cellHeight: number;

  /* ── the view transform ────────────────────────────────────────────────── */
  /**
   * Pan, in CSS pixels, applied as a `translate`.
   *
   * ⚠️ Unlike `CanvasSurface`'s, this pan is purely local and is never
   * persisted: `LightingCanvas` passed no `onCommitPan` to `useCanvasViewport`,
   * so its pan died with the view. That difference is preserved.
   */
  viewPanOffset: { x: number; y: number };
  /**
   * The COMBINED scale, `zoom * viewZoom`, applied as one `scale()`.
   *
   * ⚠️ This was `viewZoom` alone. With the canvases 1:1 the shared pixel scale
   * has nowhere else to be applied, so it multiplies in here — which is
   * precisely how `CanvasSurface` has carried it since task 02, and why the
   * two engines finally agree on what `ViewportUIStore.zoom` means (R7).
   */
  combinedScale: number;

  /* ── the SVG chrome (plan 05, decision D5) ─────────────────────────────── */
  /**
   * The pixel grid, as one `<path>`.
   *
   * Vector rather than raster because at 1:1 `strokeGrid`'s lines land one per
   * pixel column and the grid becomes a flat wash of colour over the whole
   * canvas — a SILENT failure with no error and no artifact. Supplied by the
   * container from `ui/canvas/svg/gridOverlay`; this component renders it and
   * decides nothing about it.
   */
  grid?: SvgPathSpec | null;
  /**
   * The brush footprint's outline, as one `<path>`.
   *
   * Also vector, for the sharper version of the same reason: the raster
   * painter sizes each rect `zoom - 1`, so at 1:1 it strokes 0x0 rectangles and
   * renders NOTHING. The footprint's FILL is still a canvas overlay — cell
   * fills are safe at 1:1; sub-cell strokes are not.
   */
  brushOutline?: SvgPathSpec | null;

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
  cellWidth,
  cellHeight,
  viewPanOffset,
  combinedScale,
  grid,
  brushOutline,
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
              // ⚠️ `combinedScale` is `zoom * viewZoom` — the GPU does ALL the
              // magnification now, because the canvases below are 1:1 with the
              // pixel data. This one declaration is what replaced allocating a
              // `zoom`-times-larger backing store per canvas.
              transform: `translate(${viewPanOffset.x}px, ${viewPanOffset.y}px) scale(${combinedScale})`,
              // `0 0` so the transform anchors at the sprite's top-left; the
              // pinch/wheel maths in `useCanvasViewport` assumes this origin.
              transformOrigin: "0 0",
            }}
          >
            <div className="lighting-canvas__stack">
              <canvas
                ref={editCanvasRef}
                className="lighting-canvas__edit-canvas"
                width={cellWidth}
                height={cellHeight}
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
                width={cellWidth}
                height={cellHeight}
              />
              {/*
                ── the SVG chrome (D5) ───────────────────────────────────────
                LAST in the stack, so it sits above both canvases by source
                order. One user unit = one grid cell, matching the 1:1
                canvases; the element inherits `.lighting-canvas__surface`'s
                transform, and `vector-effect: non-scaling-stroke` (set
                per-path by `ui/canvas/svg/`) exempts the stroke WIDTHS from
                it. That pair is what gives the grid and the brush outline
                back the screen-constant hairline their canvas painters
                documented and which going 1:1 would otherwise have destroyed
                silently.
              */}
              {(hasPath(grid) || hasPath(brushOutline)) && (
                <svg
                  className="lighting-canvas__svg"
                  viewBox={`0 0 ${cellWidth} ${cellHeight}`}
                  width={cellWidth}
                  height={cellHeight}
                  aria-hidden="true"
                  focusable="false"
                >
                  {hasPath(grid) && (
                    // The one path with a class of its own: it is the only
                    // overlay a test or a devtools inspection needs to pick
                    // out of the chrome by name.
                    <path
                      className="lighting-canvas__svg-grid"
                      d={grid.d}
                      {...grid.attrs}
                    />
                  )}
                  {hasPath(brushOutline) && (
                    <path d={brushOutline.d} {...brushOutline.attrs} />
                  )}
                </svg>
              )}
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
