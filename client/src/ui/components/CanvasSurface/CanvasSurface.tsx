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
 * markup: the per-layer canvas stack, the raster overlays, the SVG chrome, the
 * pan/zoom transform wrapper, and the cursor. Every prop is a plain value, an
 * id, a ref or a callback.
 *
 * A component that took all 47 members as props would have had a ~52-prop
 * interface and would have been a purification in name only. That is precisely
 * why tasks 30 and 31 came first: the props below are few because the work is
 * genuinely elsewhere, not because it was hidden in a context.
 *
 * ── What "pure" means here, concretely ────────────────────────────────────
 *
 * No store, no MobX, no API, no `useContext`, no `observer()`. ESLint (refresh
 * task 05) enforces every one of those against `src/ui/**`, and the rule is
 * probe-verified rather than assumed — a `no-restricted-imports` rule that
 * matches nothing looks exactly like a rule that passes.
 *
 * The practical consequence is the story file next door: every story mounts
 * this component with **no store provider at all**. That is the proof the
 * boundary holds, and it is task 32's second gate.
 *
 * ── ⚠️ NO PIXEL GRID CROSSES THIS BOUNDARY ────────────────────────────────
 *
 * There is no `pixels` prop, no `layers` prop, no `frame` prop, and there
 * never may be. The owner's real project holds 300,249 cells; `layer.pixels`
 * is `observableRef` exactly so MobX never looks inside one (R2). Grids reach
 * the canvas through the imperative draw call the container drives from a
 * `reaction` on `pixelVersion` — through a canvas element, not through React.
 * A `PixelData[][]` prop here would defeat the whole arrangement and present
 * as "MobX is slow".
 *
 * **This is the trap of the per-layer stack (plan 05, task 04, risk R8).** The
 * stack needs one `<canvas>` per layer, and the obvious way to get that is to
 * pass the layers in. It must not happen. What crosses instead is:
 *
 *   - `layerIds`            — `readonly string[]`, bottom → top. IDS ONLY.
 *   - `registerLayerCanvas` — a callback the container stores refs through.
 *   - `layerOpacity`        — `Record<string, number>`, a CSS opacity (D4).
 *   - `layerVisible`        — `Record<string, boolean>`.
 *
 * Ids, numbers, booleans and callbacks. No domain object, in any shape, ever.
 * ESLint's boundary rules see *imports*, not prop TYPES — a `layers: Layer[]`
 * prop would pass `lint:boundaries` and still be the regression this file
 * exists to prevent. That check is on the reviewer.
 *
 * This component therefore receives REFS and paints nothing itself. It is a
 * layout and an event surface.
 *
 * ── The stack, top to bottom, inside `.canvas__frame` ─────────────────────
 *
 * DOM order IS z-order here, deliberately: every absolutely-positioned block
 * shares `var(--z-canvas-overlay)`, so the LATER sibling wins. Do not reach
 * for a higher numeric z-index — it is redundant here and a stylelint error.
 *
 *   SVG chrome            grid, brush/hover outlines, lasso, marching ants,
 *                         origin cross, reflection guides — vectors (D5)
 *   reflection canvas     the animated guides' raster surface (see below)
 *   pose canvas           the 3D reference solid's raster surface, blitted
 *                         1:1 from an offscreen render target (plan 06, D10)
 *   frame trace overlay   raster (D6)
 *   frame overlay         raster (D6)
 *   reference overlay     raster (D6)
 *   hover canvas          raster — the hover/brush FILL only; the OUTLINE
 *                         moved to the SVG above (D5/D6 split)
 *   pointer surface       `canvasRef` — see below
 *   layer canvases        one per layer, bottom → top
 *   background DIV        the checkerboard, in CSS (task 06) — `--z-behind`
 *
 * ── ⚠️ `canvasRef` IS THE POINTER SURFACE. DO NOT "OPTIMISE" IT AWAY ──────
 *
 * It carries every pointer/touch handler AND it is the element
 * `ui/canvas/model/coords.ts`'s `screenToPixel` measures with
 * `getBoundingClientRect()` to turn a client coordinate into a cell. That
 * mapping goes through the measured rect's RATIOS — never through `zoom` —
 * precisely so the CSS transform is picked up for free.
 *
 * Once task 05 moves the artwork onto the per-layer canvases, this element may
 * well end up with nothing painted into it at all. **It still must exist, at
 * exactly `cellWidth × cellHeight`, and it must stay above the layer stack.**
 * A future reader who deletes "the empty canvas" breaks BOTH input and every
 * coordinate mapping in the editor, and does so silently — strokes simply land
 * on the wrong cell, or nowhere.
 *
 * ── The raster overlays, and which of them are conditionally mounted ──────
 *
 * The hover marker gets its OWN canvas rather than a pass in the main render,
 * and that is a performance decision, not a tidiness one. The main render in
 * `CanvasContainer` repaints every visible cell of every visible layer; on the
 * owner's real project that is a six-figure loop. An Apple Pencil emits hover
 * samples at the display's refresh rate whether or not it ever touches down,
 * so routing the marker through that pass would re-rasterise the whole sprite
 * continuously while the user's hand merely moved NEAR the screen. On its own
 * canvas the marker repaints a few dozen cells and the artwork is untouched.
 * It keeps the FILL; its outline is now `hoverOutline` in the SVG.
 *
 * The pose canvas is always mounted for the same reason, and sits directly
 * beneath the reflection canvas: above every layer and every trace overlay, so
 * the 3D reference the user is drawing from is not buried under an onion skin,
 * and below the SVG chrome, so the outline and marching ants that say where the
 * next stroke lands are never covered BY that reference. Its ref prop is
 * optional (plan 06, D10) purely so this file lands before its container
 * wiring; unlike the reflection canvas it is genuinely painted into.
 *
 * The reflection canvas is likewise always mounted so the dash ticker's
 * `invalidate()` always has a context. It is still painted by
 * `CanvasContainer`'s `renderReflection`; the SVG `reflectionGuides` prop is
 * the vector replacement, and the canvas may be removed once the container
 * stops drawing into it (task 05). Removing it from here first would leave
 * that painter writing into `null`.
 *
 * The three trace/onion overlays mount only when active, and their mutual
 * exclusions are preserved verbatim from `Canvas.tsx:2012-2039`: the frame
 * overlay hides while EITHER trace mode is on, because two semi-transparent
 * onion skins stacked on one sprite are unreadable. Passing the flags in
 * rather than deriving them keeps that policy where the store data lives.
 *
 * ── ⚠️ THE ORIGIN CROSS IS THE ONE OVERLAY WITH A TRANSFORM OF ITS OWN ────
 *
 * `vector-effect: non-scaling-stroke` exempts a stroke's WIDTH from the
 * transform. It does not exempt GEOMETRY. `ORIGIN_CROSS_SIZE = 12` emitted as
 * 12 user units would render 600 screen px at zoom 50 — the original bug in
 * new clothes. So `originCrossOverlay` returns the centre in CELL space plus
 * arm length and radius in SCREEN px, and this component wraps them in
 *
 *     <g transform="translate(cx cy) scale(1 / combinedScale)">
 *
 * inside which one user unit is one screen pixel again. Every other overlay
 * spreads straight onto a `<path>`; this one cannot. See
 * `ui/canvas/svg/chromeOverlay.ts`'s header and `docs/05-canvas-perf/HANDOFF.md`
 * finding 1.
 *
 * ── Layer count is unbounded ──────────────────────────────────────────────
 *
 * `LayerStore` caps nothing. Memory grows linearly in the layer count — at 1:1
 * that is ~3 KB per layer for Base Unit and ~224 KB per layer for Landscapes,
 * which is affordable, but it is linear and worth remembering before anyone
 * adds a "hidden layers still get a canvas" behaviour.
 *
 * Canvases are keyed by `layer.id`, which is stable across add, delete and
 * reorder (`types/domain.ts:25`; `LayerStore.moveLayer` and friends all
 * preserve ids). React's keyed reconciliation therefore does the pooling: a
 * reorder MOVES the DOM node rather than recreating it, so the painted bitmap
 * survives. **Do not build a manual pool.** `registerLayerCanvas(id, null)`
 * fires on unmount so the container can drop stale refs.
 */

import { useMemo } from "react";
import type {
  CSSProperties,
  MouseEvent,
  ReactNode,
  RefObject,
  TouchEvent,
} from "react";
import type {
  OriginCrossOverlay,
  ReflectionGuideOverlay,
  SvgPathSpec,
} from "@/ui/canvas/svg/chromeOverlay";
import "./CanvasSurface.css";

export interface CanvasSurfaceProps {
  /* ── element refs (the imperative renderers' only handle) ──────────────── */
  /**
   * The POINTER SURFACE. See the header: it carries every input handler and is
   * the element `screenToPixel` measures. It must stay mounted at
   * `cellWidth × cellHeight` above the layer stack even if nothing paints into
   * it once task 05 lands.
   */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Reference-image trace overlay. */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Frame onion-skin overlay (#8). */
  frameOverlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Frame-trace overlay (#9). */
  frameTraceOverlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The hover marker's FILL surface. See the header for why it is separate.
   *
   * Always mounted, unlike the three overlays above: hover can begin at any
   * moment without a mode being entered first, and mounting a canvas in
   * response to the first sample would drop that sample while React committed.
   *
   * ⚠️ Its OUTLINE moved to `hoverOutline` in the SVG chrome (D5) — at 1:1 the
   * canvas painter's edges are zero-length and render nothing at all.
   */
  hoverCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The reflection tool's animated guide lines, as a raster surface.
   *
   * ⚠️ OPTIONAL, deliberately (plan 03, locked decision D9). The canvas is
   * mounted unconditionally, but the PROP is not required, so this component
   * and `CanvasContainer` both compile before the container is taught to pass
   * a ref. When it is absent the canvas still exists and simply stays blank.
   *
   * ⚠️ SUPERSEDED BUT NOT YET UNUSED. `reflectionGuides` below is the vector
   * replacement (D5). `CanvasContainer.renderReflection` still paints into this
   * canvas, so it stays mounted until task 05 stops that painter. Do not remove
   * it before then — the painter would be writing into `null`.
   */
  reflectionCanvasRef?: RefObject<HTMLCanvasElement | null>;
  /**
   * The pose tool's 3D reference render, as a raster surface.
   *
   * The pose engine renders a solid into an offscreen WebGL target sized
   * exactly `cellWidth x cellHeight` — one texel per art pixel — and blits the
   * result here with `putImageData`. There is no scaling step anywhere in that
   * path; the magnification is the same CSS transform every other canvas in
   * this stack rides on, which is what makes the reference appear at the
   * artwork's own resolution rather than as a smooth render shrunk down.
   *
   * ⚠️ OPTIONAL, deliberately (plan 06, locked decision D10) — for the same
   * reason `reflectionCanvasRef` above is: the canvas is mounted
   * unconditionally, but the PROP is not required, so this component, the
   * stories, the DOM tests and `LightingCanvasContainer` all compile before
   * `CanvasContainer` is taught to pass a ref (plan 06, task 08). When it is
   * absent the canvas still exists and simply stays blank.
   *
   * ⚠️ UNLIKE `reflectionCanvasRef`, this one IS intended to be driven. The
   * reflection raster painter was retired in favour of the SVG chrome and that
   * canvas now mounts blank on purpose; pose is a genuine raster overlay — a
   * per-pixel image with no vector equivalent — and task 08 will pass its ref
   * and paint into it every frame of a light-orb drag. Do not "tidy" this into
   * the same superseded category.
   */
  poseCanvasRef?: RefObject<HTMLCanvasElement | null>;
  /**
   * The scroll/gesture viewport.
   *
   * `tabIndex={0}` is on this element so it can hold focus for the keyboard
   * shortcuts, and `touch-action: none` is set on it in CSS so the browser
   * does not steal two-finger gestures for page scrolling.
   */
  containerRef: RefObject<HTMLDivElement | null>;

  /* ── the layer stack (IDS ONLY — see the header) ───────────────────────── */
  /**
   * Layer ids, **bottom → top**, one `<canvas>` each.
   *
   * ⚠️ Ids. Never layer objects, never pixels, never a frame. The whole R8
   * mitigation is that this is a `string[]`.
   */
  layerIds?: readonly string[];
  /**
   * Register (or, with `null`, unregister) a layer's canvas element by id.
   *
   * The container keeps the map and paints imperatively, exactly as it does
   * today for the single surface. Called with the element on mount and with
   * `null` on unmount, so stale refs can be dropped.
   */
  registerLayerCanvas?: (id: string, el: HTMLCanvasElement | null) => void;
  /**
   * Per-layer CSS `opacity`, keyed by layer id (D4). Missing id → 1.
   *
   * This is where `layerFocusMode`'s dimming lives now: `normal` → 1,
   * `transparent` → 0.5, variant-other → 0.7, computed by the container from
   * the constants in `ui/theme/canvasTokens`. It is a compositor property, not
   * a per-cell alpha multiply in a six-figure loop.
   *
   * ⚠️ `onion` is NOT an opacity. It is an outline-only mode driven by
   * `isOutlineCell`'s neighbour tests and stays a PAINT-time decision in the
   * container. Do not try to express it here.
   */
  layerOpacity?: Readonly<Record<string, number>>;
  /**
   * Per-layer visibility, keyed by layer id. Missing id → visible.
   *
   * Applied as `display: none`, which keeps the element (and therefore its
   * painted bitmap and its registered ref) alive across a toggle.
   */
  layerVisible?: Readonly<Record<string, boolean>>;

  /* ── dimensions ────────────────────────────────────────────────────────── */
  /**
   * Backing-store width in GRID CELLS — one sprite pixel, one canvas pixel.
   *
   * ⚠️ 1:1, NOT `gridWidth * zoom` (plan 05, task 02). Magnification is the
   * CSS transform below and nothing else, which is what takes a Landscapes
   * layer from 546 MB at zoom 50 to 224 KB at any zoom. `image-rendering:
   * pixelated` in `CanvasSurface.css` is consequently load-bearing rather than
   * belt-and-braces: it is now the ONLY thing between this canvas and a blurry
   * upscale. Do not remove it.
   *
   * `viewWidth` while a variant is being edited, `gridWidth` otherwise — the
   * conditional lives in `useCanvasGeometry` and must survive (D1).
   */
  cellWidth: number;
  /** Backing-store height in grid cells. See `cellWidth`. */
  cellHeight: number;

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
  /**
   * The ONE scale the layout is magnified by: `zoom * viewZoom`.
   *
   * ⚠️ The caller multiplies the two and passes the product, rather than
   * passing both and multiplying here, so the combined scale is computed in
   * exactly one place. The two store fields stay separate on the other side of
   * this boundary and neither changes range, default or persistence (D2):
   * `zoom` ∈ [1,50] is the shared pixel scale, `viewZoom` ∈ [0.25,4] is the
   * per-pane gesture scale, and because they already multiplied, applying the
   * product here keeps the on-screen content box exactly the size every saved
   * `panOffset` was recorded against — so no project needs migrating.
   *
   * It is ALSO what the origin cross's counter-scale divides by. See the
   * header.
   */
  combinedScale: number;

  /* ── the background DIV (task 06, decision D11) ────────────────────────── */
  /**
   * The checkerboard palette: `true` = the light triple, `false` = the dark.
   *
   * ⚠️ NOT the UI theme. `lightGridMode` is a per-project toggle stored on
   * `ViewportUIStore` and it is TRI-STATE there (`undefined` = absent from
   * the project file). The container collapses it with `?? false` at the read
   * site exactly as it always has; the undefined never reaches this boundary
   * and is never persisted collapsed. Rendered as the
   * `canvas__background--light` modifier, which swaps three custom
   * properties — the JS `BackgroundTheme` does not cross into `ui/` at all.
   */
  lightGridMode?: boolean;
  /**
   * The checkerboard's world-space PHASE, as `{x, y}` each already reduced to
   * 0 or 1.
   *
   * ⚠️ This is the one piece of the old raster background that is easy to
   * lose. `paintCheckerboard` picked a square's colour from
   * `(offsetX + px + offsetY + py) % 2` — WORLD cells, not surface cells — so
   * a variant view scrolled by an ODD number of cells keeps the checker phase
   * it had in object space. Drop it and every odd-offset variant edit gets a
   * checkerboard inverted against the one the user saw a moment ago.
   *
   * It becomes a `background-position` of `{x}px {y}px` on a 2px tile: a
   * one-tile-pixel shift is exactly a parity flip. Supplying the reduced
   * value rather than the raw offset keeps the (negative-safe) modulo in the
   * container, where the offset actually lives.
   */
  checkerParity?: { x: number; y: number };

  /* ── cursor ────────────────────────────────────────────────────────────── */
  /** A CSS `cursor` value. Resolved by the container from the active tool. */
  cursor: string;

  /* ── which raster overlays are mounted ─────────────────────────────────── */
  showReferenceOverlay: boolean;
  showFrameOverlay: boolean;
  showFrameTraceOverlay: boolean;

  /* ── the SVG chrome (D5) ───────────────────────────────────────────────── */
  /**
   * The pixel grid, from `ui/canvas/svg/gridOverlay`'s `gridOverlayPath`.
   *
   * Path DATA — a `d` string plus SVG attributes. That is a string and a bag
   * of primitives, not a domain object, and it is O(grid perimeter) rather
   * than O(cells): a 256×224 grid is 482 line segments in one `d`, not 57,344
   * of anything.
   */
  grid?: SvgPathSpec | null;
  /** The brush footprint's outline, from `brushOutlineOverlay`. */
  brushOutline?: SvgPathSpec | null;
  /**
   * The hover marker's outer perimeter, from `hoverOutlineOverlay`.
   *
   * ⚠️ This is the overlay that rendered NOTHING after task 02 — at 1:1 every
   * edge of `strokeHoverOutline` is zero-length and `lineCap: "butt"` draws
   * none of them. Silent failure, no error. If it is invisible again, this is
   * the first prop to check.
   */
  hoverOutline?: SvgPathSpec | null;
  /** The lasso rubber band, from `lassoOverlay`. */
  lasso?: SvgPathSpec | null;
  /**
   * The marching-ants selection box, from `marchingAntsOverlay`: the same
   * rectangle stroked twice, half a dash period out of phase, which is what
   * reads as motion.
   */
  marchingAnts?: { outer: SvgPathSpec; inner: SvgPathSpec } | null;
  /**
   * The origin cross, from `originCrossOverlay`.
   *
   * ⚠️ The only overlay that is NOT a path spec, and the only one this
   * component applies a transform to. See the header.
   */
  originCross?: OriginCrossOverlay | null;
  /**
   * The reflection guides, from `reflectionGuideOverlays` — the vector
   * replacement for `reflectionCanvasRef`'s raster surface.
   */
  reflectionGuides?: readonly ReflectionGuideOverlay[] | null;

  /* ── pointer events (the hooks' handlers, passed straight through) ─────── */
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  /**
   * Optional: the pixel canvas ends strokes from a WINDOW-level `mouseup`
   * instead, so a release outside the canvas ends the gesture the same way a
   * release inside it does. Binding it here too would double-fire for every
   * release over the canvas. The lighting canvas still passes one.
   */
  onMouseUp?: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLCanvasElement>) => void;
  /**
   * The SYSTEM revoked the touch (edge swipe, incoming call, late palm
   * rejection). Distinct from `onTouchEnd`: a cancel is not a release, so a
   * shape in flight is abandoned rather than committed.
   */
  onTouchCancel?: (e: TouchEvent<HTMLCanvasElement>) => void;
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

/** Nothing to draw. Rendering an empty `d` is legal but pointlessly noisy. */
function hasPath(spec: SvgPathSpec | null | undefined): spec is SvgPathSpec {
  return !!spec && spec.d.length > 0;
}

/**
 * Stable, per-id `ref` callbacks for the layer canvases.
 *
 * ⚠️ NOT a micro-optimisation. React compares a ref callback by IDENTITY: a
 * fresh `(el) => register(id, el)` closure on every render makes React detach
 * the old one (calling `register(id, null)`) and attach the new one on EVERY
 * re-render, even when the element itself never moved. That would fire a
 * `null` through the container's ref map on every pan, zoom, cursor change
 * and hover sample — a map the imperative painter reads from — and the
 * pooling that keyed reconciliation buys at the DOM level would be thrown
 * away again at the ref level. The `does not re-register an unchanged layer
 * on reorder` test pins it.
 *
 * So the callbacks are memoised, one per id, and rebuilt only when the SET of
 * ids changes or `registerLayerCanvas` changes identity. A REORDER does not
 * rebuild them — the memo key is the ids joined in sorted order, so `[a,b,c]`
 * and `[c,a,b]` hash the same and the existing closures survive, which is
 * precisely the case the pooling proof cares about. Neither does an ordinary
 * pan/zoom/cursor re-render, which is the case that happens at pointer rate.
 *
 * ⚠️ ADDING or DELETING a layer DOES rebuild every closure, so React detaches
 * and reattaches the survivors: the container sees `(id, null)` then
 * `(id, element)` for each, with the SAME element both times — no remount, no
 * lost bitmap, and the map ends correct. That is a deliberate trade: an
 * order-sensitive key would rebuild on every reorder instead, and a reorder
 * can arrive from a drag. `unregisters a deleted layer and leaves the map
 * correct` pins the end state rather than the call sequence, because the end
 * state is the contract.
 *
 * ⚠️ The container must pass a `useCallback`-stable `registerLayerCanvas`. An
 * inline arrow there rebuilds every closure on every render and reintroduces
 * exactly the churn this exists to prevent.
 *
 * Built with `useMemo` and never mutated afterwards: an entry added to a
 * cached `Map` during a later render is a write-after-render, which React's
 * compiler rules reject and which is genuinely unsafe under concurrent
 * rendering.
 */
function useLayerRefs(
  layerIds: readonly string[] | undefined,
  registerLayerCanvas:
    | ((id: string, el: HTMLCanvasElement | null) => void)
    | undefined,
) {
  // Order-insensitive, so a reorder is not a rebuild. `join` on sorted ids is
  // enough: layer ids are opaque strings from `LayerStore`, and the only thing
  // that must invalidate the map is an id appearing or disappearing.
  const idKey = layerIds ? [...layerIds].sort().join("\u0000") : "";

  return useMemo(() => {
    const map = new Map<string, (el: HTMLCanvasElement | null) => void>();
    for (const id of layerIds ?? []) {
      if (map.has(id)) continue;
      map.set(id, (el) => registerLayerCanvas?.(id, el));
    }
    return map;
    // `idKey` stands in for `layerIds`: the array's identity changes on every
    // reorder, its CONTENT is what may invalidate these closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, registerLayerCanvas]);
}

/**
 * One stroked path from a task-03 overlay spec.
 *
 * The spec's `attrs` are already named as the SVG attributes they become
 * (`stroke-width`, `vector-effect`, …) so they spread verbatim. That is why
 * `ui/canvas/svg/` emits data instead of JSX: the geometry stays pure and
 * testable, and the rendering stays here.
 */
function OverlayPath({ spec }: { spec: SvgPathSpec }) {
  return <path d={spec.d} {...spec.attrs} />;
}

export function CanvasSurface({
  canvasRef,
  overlayCanvasRef,
  frameOverlayCanvasRef,
  frameTraceOverlayCanvasRef,
  hoverCanvasRef,
  reflectionCanvasRef,
  poseCanvasRef,
  containerRef,
  layerIds,
  registerLayerCanvas,
  layerOpacity,
  layerVisible,
  cellWidth,
  cellHeight,
  viewPanOffset,
  combinedScale,
  lightGridMode,
  checkerParity,
  cursor,
  showReferenceOverlay,
  showFrameOverlay,
  showFrameTraceOverlay,
  grid,
  brushOutline,
  hoverOutline,
  lasso,
  marchingAnts,
  originCross,
  reflectionGuides,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  viewControls,
}: CanvasSurfaceProps) {
  const layerRefs = useLayerRefs(layerIds, registerLayerCanvas);

  // The counter-scale for screen-constant decorations. Guarded because a zero
  // or missing scale would emit `scale(Infinity)` and blank the whole overlay.
  const inverseScale = combinedScale > 0 ? 1 / combinedScale : 1;

  const hasSvgChrome =
    hasPath(grid) ||
    hasPath(brushOutline) ||
    hasPath(hoverOutline) ||
    hasPath(lasso) ||
    !!marchingAnts ||
    !!originCross ||
    (reflectionGuides?.length ?? 0) > 0;

  return (
    <div className="canvas">
      <div className="canvas__viewport" ref={containerRef} tabIndex={0}>
        <div
          className="canvas__layout"
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
          <div className="canvas__frame">
            {/*
              ── the background: ONE DIV, no canvas, no cache, no blit ───────
              (plan 05, task 06, decision D11)

              This replaced an offscreen `<canvas>` that allocated a
              `cellWidth × cellHeight` `ImageData`, ran an O(w·h) base fill
              plus a per-cell block write, cached the result by key, and
              `drawImage`-blitted it on every repaint. It is now a
              `conic-gradient` on a 2px tile that the compositor draws for
              free and never repaints on pan or zoom.

              It sits INSIDE `.canvas__layout`, so it inherits
              `scale(zoom * viewZoom)` and the 2px tile is magnified to two
              cells — which is why `image-rendering: pixelated` in the
              stylesheet is load-bearing rather than decorative. Without it a
              2px pattern scaled 50× is grey mush.

              First child, and on `--z-behind`, so it is under the layer
              stack. Both matter: source order alone would not put it under
              `.canvas__layers` if that wrapper ever gained a z-index.

              ⚠️ The GRID IS NOT HERE. It is SVG chrome, below — see the
              `grid` prop's comment and `ui/canvas/svg/gridOverlay.ts`.
              Exactly one mechanism draws it.
            */}
            <div
              className={
                lightGridMode === true
                  ? "canvas__background canvas__background--light"
                  : "canvas__background"
              }
              style={{
                width: cellWidth,
                height: cellHeight,
                // The world-space checker phase (see `checkerParity`). A 1px
                // shift of a 2px tile IS the parity flip.
                backgroundPosition: `${checkerParity?.x ?? 0}px ${
                  checkerParity?.y ?? 0
                }px`,
              }}
              data-testid="canvas-background"
              aria-hidden="true"
            />

            {/*
              ── the layer stack, bottom → top ───────────────────────────────
              One 1:1 canvas per layer, keyed by `layer.id` so React's keyed
              reconciliation MOVES nodes on reorder rather than recreating
              them — that is the canvas pooling, and it is why no manual pool
              exists. Below every overlay, by source order.
            */}
            <div className="canvas__layers" style={OVERLAY_STYLE}>
              {layerIds?.map((id) => (
                <canvas
                  key={id}
                  ref={layerRefs.get(id)}
                  width={cellWidth}
                  height={cellHeight}
                  className="canvas__layer"
                  data-layer-id={id}
                  style={{
                    // Missing id → fully opaque / visible: a layer the
                    // container has not classified must never vanish.
                    opacity: layerOpacity?.[id] ?? 1,
                    display: layerVisible?.[id] === false ? "none" : "block",
                  }}
                />
              ))}
            </div>

            {/*
              ⚠️ THE POINTER SURFACE. Every handler and `getBoundingClientRect`
              measurement goes through this element. It stays even if nothing
              paints into it — see the header before deleting it.
            */}
            <canvas
              ref={canvasRef}
              width={cellWidth}
              height={cellHeight}
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
              onTouchCancel={onTouchCancel}
            />

            {/* The hover marker's FILL. Its outline is in the SVG below. */}
            <canvas
              ref={hoverCanvasRef}
              width={cellWidth}
              height={cellHeight}
              className="canvas__overlay canvas__overlay--hover"
              style={OVERLAY_STYLE}
            />

            {showReferenceOverlay && (
              <canvas
                ref={overlayCanvasRef}
                width={cellWidth}
                height={cellHeight}
                className="canvas__overlay"
              />
            )}

            {showFrameOverlay && (
              <canvas
                ref={frameOverlayCanvasRef}
                width={cellWidth}
                height={cellHeight}
                className="canvas__overlay"
                style={OVERLAY_STYLE}
              />
            )}

            {showFrameTraceOverlay && (
              <canvas
                ref={frameTraceOverlayCanvasRef}
                width={cellWidth}
                height={cellHeight}
                className="canvas__overlay"
              />
            )}

            {/*
              ── the pose tool's 3D reference (plan 06, D10) ─────────────────
              Its stacking position is the whole of this element's placement
              contract: IMMEDIATELY BEFORE the reflection overlay, and so above
              every layer canvas and every trace/onion overlay, but below the
              reflection guides and below the SVG chrome. DOM order IS z-order
              here — all of these share `var(--z-canvas-overlay)` and the later
              sibling wins — so moving this line moves the overlay, and no
              z-index may be added to say otherwise.

              Above the traces because the reference solid is what the user is
              drawing FROM and must not be buried under a semi-transparent
              onion skin. Below the chrome because the brush outline, marching
              ants and origin cross say where the next stroke LANDS, and those
              must never be covered by a reference.

              Mounted unconditionally, like the hover and reflection canvases:
              its painter repaints through `useCanvasRender(...).invalidate()`
              at pointer rate during an orb drag, and that needs a context to
              already exist rather than one arriving a commit late.

              1:1 with the pixel data, never `* combinedScale` — the render
              target upstream is `cellWidth x cellHeight` for exactly this
              reason, so the blit is a straight `putImageData` with no
              resampling anywhere.
            */}
            <canvas
              ref={poseCanvasRef}
              width={cellWidth}
              height={cellHeight}
              className="canvas__overlay canvas__overlay--pose"
              style={OVERLAY_STYLE}
            />

            {/*
              The reflection tool's RASTER guides. Superseded by the SVG
              `reflectionGuides` below, but still painted by
              `CanvasContainer.renderReflection`, so it stays mounted until
              task 05 stops that painter. Mounted unconditionally so the dash
              ticker's `invalidate()` always has a context.
            */}
            <canvas
              ref={reflectionCanvasRef}
              width={cellWidth}
              height={cellHeight}
              className="canvas__overlay canvas__overlay--reflection"
              style={OVERLAY_STYLE}
            />

            {/*
              ── the SVG chrome (D5) ─────────────────────────────────────────
              LAST in the frame, so it sits above every raster overlay by
              source order. One SVG user unit = one grid cell, matching the
              1:1 canvases; the element inherits `.canvas__layout`'s transform,
              and `vector-effect: non-scaling-stroke` (set per-path by
              `ui/canvas/svg/`) exempts the stroke WIDTHS from it. That pair is
              what gives the grid, outlines, ants and guides back the
              screen-constant hairline their canvas painters always documented
              and which task 02 inverted.
            */}
            {hasSvgChrome && (
              <svg
                className="canvas__svg"
                viewBox={`0 0 ${cellWidth} ${cellHeight}`}
                width={cellWidth}
                height={cellHeight}
                style={OVERLAY_STYLE}
                aria-hidden="true"
                focusable="false"
              >
                {hasPath(grid) && (
                  // The grid is the one path with a class of its own: it is
                  // the only overlay a test or a devtools inspection needs to
                  // pick out of the chrome by name.
                  <path className="canvas__svg-grid" d={grid.d} {...grid.attrs} />
                )}
                {hasPath(brushOutline) && <OverlayPath spec={brushOutline} />}
                {hasPath(hoverOutline) && <OverlayPath spec={hoverOutline} />}
                {hasPath(lasso) && <OverlayPath spec={lasso} />}
                {marchingAnts && hasPath(marchingAnts.outer) && (
                  <>
                    <OverlayPath spec={marchingAnts.outer} />
                    <OverlayPath spec={marchingAnts.inner} />
                  </>
                )}
                {reflectionGuides?.map((guide, i) => (
                  // Index keys: the guides are a positional list rebuilt on
                  // every phase tick and carry no identity of their own. There
                  // is nothing to preserve across a reorder — these are
                  // `<path>` elements with no state.
                  <g key={i} className="canvas__svg-guide">
                    <OverlayPath spec={guide.base} />
                    <OverlayPath spec={guide.highlight} />
                  </g>
                ))}
                {originCross && (
                  /*
                    ⚠️ THE COUNTER-SCALED GROUP. `non-scaling-stroke` exempts
                    stroke WIDTH from the transform, not GEOMETRY — 12 user
                    units would be 600 screen px at zoom 50. Translating to the
                    centre in CELL space and then scaling by `1/combinedScale`
                    makes one unit one SCREEN pixel inside this group, which is
                    the space `armLength` and `radius` are already expressed
                    in. HANDOFF finding 1; do not flatten this into a path.
                  */
                  <g
                    className="canvas__svg-origin"
                    transform={`translate(${originCross.centerX} ${originCross.centerY}) scale(${inverseScale})`}
                  >
                    <OverlayPath spec={originCross.arms} />
                    <circle
                      cx={originCross.circle.cx}
                      cy={originCross.circle.cy}
                      r={originCross.circle.r}
                      {...originCross.circle.attrs}
                    />
                  </g>
                )}
              </svg>
            )}
          </div>
        </div>
        {viewControls}
      </div>
    </div>
  );
}
