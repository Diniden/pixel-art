/**
 * LightingCanvasContainer — the wiring that replaced `LightingCanvas.tsx`
 * (REFRESH task 33).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 `components/Canvas/LightingCanvas.tsx` NO LONGER EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It was 785 lines (952 before task 31 took its duplicated viewport engine)
 * with five fused responsibilities and 14 store members in one destructure.
 * Where each went:
 *
 *   (a) viewport pan/zoom      → `ui/hooks/useCanvasViewport`   (task 31)
 *   (b) three renderers        → `ui/canvas/render/renderLitComposite`,
 *                                `renderNormalEdit`, `renderBrushOverlay`
 *   (c) normal/height painting → `ui/hooks/useLightingPaint`
 *   (d) keyboard               → this file (see the note below)
 *   the markup                 → `ui/components/LightingSurface`
 *   the store binding          → **this file, the only place left**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `observer()` HERE, rAF-SCHEDULED REDRAW FOR THE PIXELS (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `observer()` wraps THIS component, which reads only scalars and small
 * `observableRef` objects — the zoom, the brush, the light direction, the
 * current layer's IDENTITY. It never reads a pixel grid, and there is no code
 * path by which it could: the grids are consumed only inside `renderEdit` and
 * `renderLitPane` below, which run from a scheduled animation frame and not
 * from React's render phase.
 *
 * The redraw signal is `useCanvasRender(render, deps)` with `pixelVersion` in
 * the deps — the counter `PixelStore` bumps once per committed mutation. That
 * counter is what MobX observes; the 300,249-cell tree is not.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔧 THE THREE W19 LATENT BUGS, ALL FIXED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **No rAF coalescing** (`grep -c renderRequestRef LightingCanvas.tsx` → 0).
 *    Its renders fired SYNCHRONOUSLY from two effects at `:341-348`, so a burst
 *    of store writes repainted the canvas once per write. Both renders now go
 *    through `useCanvasRender`, the same rAF scheduler `Canvas` uses, which
 *    coalesces a burst into one paint and cancels the pending frame on unmount.
 *
 * 2. **`lastPaintPixel` was `useState`** (`LightingCanvas.tsx:32`) — a React
 *    state write, and therefore a re-render of the whole 785-line component,
 *    once PER PIXEL of a stroke. It is a REF inside `useLightingPaint` now, as
 *    is `isPainting`. `hoverPixel` deliberately stays state: it drives the
 *    overlay repaint.
 *
 * 3. **Grid alpha `0.08` hard-coded, `lightGridMode` ignored.** W22 landed the
 *    first half by routing the background through `canvasBackground`, which
 *    made the grid `0.05`, but passed `false` unconditionally. This task lands
 *    the second half: `backgroundTheme(lightGridMode)` below reads the real
 *    setting, so the lighting studio finally honours it.
 *
 *    ⚠️ **THIS IS A VISIBLE CHANGE NEEDING OWNER SIGN-OFF.** With light grid
 *    mode ON, the lighting studio's checkerboard flips from `#1a1a25`/`#2a2a3a`
 *    /`#222230` to `#c8c8c8`/`#cccccc`/`#eeeeee` and its grid from white 5% to
 *    black 8%. `LightingCanvas` had NEVER done this — every colour in it was a
 *    hard-coded dark value — so a user with the setting on will see the
 *    lighting studio change appearance for the first time. It is what Q3's
 *    owner decision (2026-08-16, "unify onto Canvas's behaviour; both canvases
 *    honour `lightGridMode`") asks for, and it is flagged in the task report.
 *
 *    The PREVIEW PANE is deliberately NOT theme-aware: it stays
 *    `backgroundTheme(false)`. It shows the LIT SPRITE, not an editing grid,
 *    and its dark well is designed against the dark base. Q3 is about the two
 *    canvases' GRIDS agreeing, and the preview has no grid.
 *
 * ── ⚠️ THE KEYBOARD IS NOT `useCanvasKeyboard` ────────────────────────────
 *
 * `LightingCanvas`'s keyboard was three shortcuts: undo, and `.`/`,` for frame
 * navigation. `useCanvasKeyboard` (task 31) is `Canvas`'s: ~15 tool hotkeys,
 * selection deletion, WASD/arrow nudging, variant offsets, trace overlays.
 * Adopting it would give the lighting studio a dozen shortcuts it has never
 * had — a behaviour change, not a refactor — so the small effect stays here.
 * Reported as a deliberate non-reuse.
 *
 * ── W29d: STORE-FREE. The seven `actions.*` names are gone ───────────────
 *
 * W29c left all seven on `getState()` on the legacy Zustand hook and named the blocker
 * precisely: four of them needed something that existed ONLY as a closure
 * inside `stores/bridge/zustandBridge.ts`, so calling `app.pixels.*` here
 * meant re-deriving it — a SECOND implementation, which is the duplication
 * the migration exists to remove. W29d built the missing homes instead of
 * duplicating, and each name then had somewhere real to go:
 *
 *  - `setNormalPixels` / `setHeightPixels` — needed `pixelWriteOptions()`,
 *    which turned out to be a ONE-LINE delegation to `app.selectionUI
 *    .writeOptions`, an existing MobX computed. Passed directly now. It is
 *    NOT optional: it carries the mask and `selectionBehavior` across the
 *    one-directional boundary, since `PixelStore` may not read a UI store.
 *  - `undo` — had no delegate at all, and `app.history.undo()` is NOT a
 *    substitute: the bridge-era Phase B history mirror has exactly one writer
 *    and a bare `HistoryStore` call leaves it stale. W29d published
 *    `store/index.ts`'s existing glue as `historyControl` (the same technique
 *    `strokeControl` already used) and `ApplicationStore.undo` routes through
 *    it. Task 38 retires the mirror and the seam together.
 *  - `getCurrentObject` — `app.currentObject`, one of the six cross-store
 *    computeds since task 23. It never needed a delegate.
 *  - `setHeightBrushValue`, `selectFrame`, `advanceVariantFrames` — clean
 *    pass-throughs to `LightingUIStore` / `TimelineUIStore` all along. W29c
 *    declined to lift only these because the import site would not have
 *    closed; now it does.
 *
 * Values are still read off MobX directly — that is the R7 granularity win
 * and it is unchanged.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useStores } from "../stores/context";
import type { Point } from "../types";
// The four fallbacks below are the SAME constants `LightingCanvas.tsx:64-89`
// inlined by hand (`{x:0,y:0,z:255}`, `{x:-64,y:-64,z:180}`,
// `{r:255,g:250,b:240,a:255}`, `{r:40,g:45,b:60,a:255}`) — verified identical,
// and imported rather than re-typed so a future change to a default cannot
// diverge here silently.
import {
  DEFAULT_NORMAL,
  DEFAULT_LIGHT_DIRECTION,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_AMBIENT_COLOR,
} from "../types";
import {
  composeLayers,
  renderWithLighting,
  renderNormalAsRGB,
  renderHeightAsGrayscale,
} from "../utils/lightingRenderer";
import {
  getSquarePixels,
  getCirclePixels,
} from "../components/Canvas/drawingUtils";
import { backgroundTheme } from "../ui/canvas/render/canvasBackground";
import { renderNormalEdit } from "../ui/canvas/render/renderNormalEdit";
import { drawLitComposite } from "../ui/canvas/render/renderLitComposite";
import { paintBrushCells } from "../ui/canvas/render/renderBrushOverlay";
// ⚠️ THE GRID AND THE BRUSH OUTLINE ARE VECTORS NOW (plan 05, D5 + task 08).
// Both come from task 03's modules — the SAME implementations `CanvasSurface`
// renders. Reused, never reimplemented: a second grid is how the two engines
// drift apart again, which is the thing task 08 exists to stop.
import { gridOverlayPath } from "../ui/canvas/svg/gridOverlay";
import type { SvgPathSpec } from "../ui/canvas/svg/gridOverlay";
import { brushOutlineOverlay } from "../ui/canvas/svg/chromeOverlay";
import { stampAt } from "../ui/canvas/tools/brushStamp";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import {
  useCanvasViewport,
  viewZoomFloor,
} from "../ui/hooks/useCanvasViewport";
import { useLightingPaint } from "../ui/hooks/useLightingPaint";
import { LightingSurface } from "../ui/components/LightingSurface/LightingSurface";
import { CanvasViewControls } from "../ui/components/CanvasViewControls/CanvasViewControls";
import type { CanvasCamera } from "../stores/ui/CanvasCameraStore";
import type { LightingRenderMode } from "../stores/ui/LightingViewsUIStore";

/** The colour the brush shapes are asked for. Discarded — see `brushStamp`. */
const SHAPE_COLOR = { r: 0, g: 0, b: 0, a: 255 } as const;

/**
 * The `zoom` every raster painter in this file is now called with: **one**.
 *
 * Named rather than inlined so the constraint is greppable, exactly as
 * `chromeOverlay.ts`'s `CELL_SPACE_ZOOM` is. Every painter below writes into a
 * backing store that is 1:1 with the pixel data, so a `zoom` of 1 is what makes
 * one source pixel one canvas pixel; the magnification is the CSS transform's
 * job. Search for `CELL_SCALE` and you find every call site that had to opt in,
 * and any future `zoom` argument that is not this constant stands out as the
 * regression it would be.
 */
const CELL_SCALE = 1;

/**
 * The painter a scheduler is given when its surface does not exist in this
 * render mode, and the handler a read-only pane gives a required pointer prop.
 *
 * Module scope so its identity is STABLE — a fresh `() => {}` per render would
 * re-run `useCanvasRender`'s effect on every render. A `function` declaration
 * with a lower-case name rather than a `const` arrow, so `react-refresh` does
 * not read it as a component export.
 */
function noop(): void {}

/**
 * ⚠️ READ-ONLY PANE, NOT A DISABLED ONE.
 *
 * `LightingSurfaceProps` makes the seven pointer handlers REQUIRED, and that
 * file belongs to task 03 — so the Preview pane supplies no-ops rather than
 * widening a prop type in another task's scope. The effect is what the owner
 * asked for: a click, a drag or a touch on the Preview pane resolves no brush
 * cells, opens no history transaction and writes no pixel. There is
 * deliberately no hover marker either — `setHoverPixel` is never called from
 * here.
 *
 * One object at module scope, so the identity is stable across renders.
 */
const READ_ONLY_POINTERS = {
  onMouseDown: noop,
  onMouseMove: noop,
  onMouseUp: noop,
  onMouseLeave: noop,
  onTouchStart: noop,
  onTouchMove: noop,
  onTouchEnd: noop,
} as const;

export interface LightingCanvasContainerProps {
  /** Which mode this instance shows. `"edit"` (default) is today's painting canvas. */
  renderMode?: LightingRenderMode;
}

export const LightingCanvasContainer = observer(
  function LightingCanvasContainer({
    renderMode = "edit",
  }: LightingCanvasContainerProps) {
    const app = useStores();

    /* ── refs ────────────────────────────────────────────────────────────── */
    const rootRef = useRef<HTMLDivElement>(null);
    const editCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    /* ── observable reads ────────────────────────────────────────────────── */
    //
    // Each is a scalar or a small `observableRef`. Reading one here IS the MobX
    // subscription, so this container re-renders on exactly these fields.
    const obj = app.currentObject;
    const frame = app.currentFrame;
    const layer = app.currentLayer;
    const variantData = app.currentVariant;
    const editingVariant = app.isEditingVariant;

    const viewport = app.ui.viewport;
    const lighting = app.ui.lightingUI;
    const tool = app.ui.tool;

    // ── which pane this is, and the camera that belongs to it ──────────────
    //
    // ⚠️ `viewport.zoom` below stays the SHARED pixel scale for both panes
    // (MASTER D4). "Camera" here is pan + view zoom only, and each pane owns
    // its own — session-only, exactly as the lighting transform already was.
    const views = app.lightingViews;
    const previewMode = renderMode === "preview";
    const camera: CanvasCamera = views.cameraFor(renderMode);

    const zoom = viewport.zoom;
    // 🔧 W19 BUG 3, SECOND HALF. See the header — this is the read that
    // `LightingCanvas` never had.
    const lightGridMode = viewport.lightGridMode ?? false;

    // ⚠️ `ui.lightingUI` is NULLABLE — `UIStore` takes it as an optional
    // dependency, so a store built without the lighting slice has none. Each
    // fallback below is the exact `?? ` default `LightingCanvas.tsx:64-89` used
    // when `project` was absent, so the missing-slice path renders identically
    // to the missing-project path rather than throwing.
    const brushSize = tool.brushSize;
    const normalBrushShape = lighting?.normalBrushShape ?? "circle";
    const selectedNormal = lighting?.selectedNormal ?? DEFAULT_NORMAL;
    const heightBrushValue = lighting?.heightBrushValue ?? 128;
    const editMode = lighting?.lightingDataLayerEditMode ?? "normals";
    const lightDirection = lighting?.lightDirection ?? DEFAULT_LIGHT_DIRECTION;
    const lightColor = lighting?.lightColor ?? DEFAULT_LIGHT_COLOR;
    const ambientColor = lighting?.ambientColor ?? DEFAULT_AMBIENT_COLOR;
    const heightScale = lighting?.heightScale ?? 100;

    const variants = app.domain.variants;
    const variantFrameIndices = app.timelineUI.variantFrameIndices;

    // ⚠️ THE REDRAW SIGNAL. `PixelStore` bumps this once per committed
    // mutation; the 300k-cell tree is never observed.
    const pixelVersion = app.domain.pixelVersion;

    /* ── actions, straight onto MobX (W29d — see the module header) ─────── */

    /* ── geometry ────────────────────────────────────────────────────────── */
    const objWidth = obj?.gridSize.width ?? 32;
    const objHeight = obj?.gridSize.height ?? 32;
    const gridWidth =
      editingVariant && variantData
        ? variantData.variant.gridSize.width
        : objWidth;
    const gridHeight =
      editingVariant && variantData
        ? variantData.variant.gridSize.height
        : objHeight;

    // ⚠️ The Preview pane shows the WHOLE OBJECT composite — what the retiring
    // floating thumbnail showed — so it sizes from `objWidth/objHeight`, not
    // from the (possibly variant-cropped) edit grid. Cropping the preview to
    // the edit grid would make it a different thing (MASTER §1).
    const viewCellsX = previewMode ? objWidth : gridWidth;
    const viewCellsY = previewMode ? objHeight : gridHeight;

    // ══════════════════════════════════════════════════════════════════════
    //  ⚠️ THREE SIZES, AND THEY ARE NOT INTERCHANGEABLE (plan 05, task 08)
    // ══════════════════════════════════════════════════════════════════════
    //
    // 🏁 **RISK R7 IS CLOSED HERE.** From task 02 until this line, the pixel
    // canvas read `viewport.zoom` as a CSS scale factor while this container
    // read the SAME field as a backing-store multiplier — `zoom` meant two
    // things at once in one app. Both engines now interpret it identically:
    // backing stores are 1:1 with pixel data and ALL magnification is one CSS
    // transform. The divergence was contained (the lighting studio is a
    // separate mode, so the two canvases can never be on screen together) but
    // it is gone rather than merely contained.
    //
    //   - `cellWidth`/`cellHeight`      — GRID CELLS. The `<canvas>` backing
    //                                     store. One sprite pixel is one
    //                                     canvas pixel.
    //   - `contentWidth`/`contentHeight`— `cellWidth * zoom`. The on-screen
    //                                     CSS box at view zoom 1. This — NOT
    //                                     `cellWidth` — is what pan clamping
    //                                     and view centring measure against.
    //
    // The rename from `canvasWidth` is deliberate rather than cosmetic: under
    // the old name a stale `* zoom` would be invisible, and the compiler finds
    // every site under the new one. This mirrors `useCanvasGeometry`'s
    // post-task-02 shape exactly; it is NOT extracted into that hook because
    // this pane has no variant-edit view union, no `bgCacheKey` and no
    // `coordGeom` — the four fields it would actually share are two
    // multiplications, and reopening a finished wave-2 file to save them is a
    // worse trade than stating them here (task 08 step 1's explicit option).
    const cellWidth = viewCellsX;
    const cellHeight = viewCellsY;

    // ⚠️ `zoom` stays a multiplier here and is NOT renormalised (R1, D2). It
    // keeps the on-screen box the same size it has always been, which is what
    // makes the pan the shared viewport hook clamps — and this pane's own
    // reset-view centring — land exactly where they did before.
    const contentWidth = cellWidth * zoom;
    const contentHeight = cellHeight * zoom;

    /* ── the viewport engine (task 31) ───────────────────────────────────── */
    //
    // ⚠️ THE CAMERA IS NOW THE STORE'S, not the hook's (plan 04 task 05).
    // Until 2026-08-29 this passed a fresh `panOffset: {x:0,y:0}` literal with
    // no commit sinks and no `resyncKey`, so the lighting transform was
    // hook-local and unaddressable — it could not be reset, and two panes could
    // not hold two different views. It is STILL session-only (neither
    // `LightingViewsUIStore` camera is persisted, MASTER D3), so a reload comes
    // back to 1x at the origin exactly as before.
    const {
      viewZoom,
      viewPanOffset,
      setViewZoom,
      setViewPanOffset,
      // `beginPinch` / `updatePinch` / `endPinch` are bound by the hook
      // itself now; only the suppression flag is read here.
      isPinching,
    } = useCanvasViewport({
      containerRef,
      // ⚠️ The shared hook clamps against the ON-SCREEN box, never the backing
      // store. Until task 08 those were the same number here and the argument
      // was correct by coincidence; it is now correct by construction. Task
      // 02's pan-clamp fix lives inside this hook, so it already applied to
      // both panes — there is no separate clamp in this file to repair.
      contentWidth,
      contentHeight,
      panOffset: camera.panOffset,
      onCommitPan: (pan) => camera.setPanOffset(pan),
      viewZoom: camera.viewZoom,
      // ⚠️ The floor is passed IN. The store may not measure the DOM, so the
      // derived zoom-out limit (longest on-screen dimension down to
      // `MIN_CANVAS_SCREEN_PX`) is computed here, where the measurement
      // already is, and handed to the clamp. Omitting it would silently
      // re-impose the legacy flat 0.25 on the committed value while the
      // gesture itself went lower — the two clamps must agree.
      onCommitViewZoom: (z) =>
        camera.setViewZoom(z, viewZoomFloor(contentWidth, contentHeight)),
      resyncKey: `${app.timelineUI.selectedObjectId ?? ""}|${
        app.timelineUI.selectedFrameId ?? ""
      }|${renderMode}`,
    });

    /**
     * Recentre this pane and return its view to 100%.
     *
     * ⚠️ The centring MUST be MEASURED from the untransformed viewport box, not
     * assumed: the lighting studio's canvas area changes size with the rails and
     * — from task 06 — with the split, so a hard-coded offset would centre the
     * sprite in yesterday's viewport. A store may not read the DOM, so the pan
     * is computed here and `resetView` takes the result.
     *
     * ⚠️ `zoom` (the shared PIXEL scale) is deliberately not reset. This button
     * rescues a lost view; it does not discard the scale the user picked.
     */
    const handleResetView = useCallback(() => {
      const container = containerRef.current;
      // ⚠️ `contentWidth`, NOT `cellWidth`. This resets VIEW zoom to 1, so the
      // combined scale becomes `zoom * 1` and the on-screen content box is
      // `cellWidth * zoom` — which is exactly `contentWidth`. Centring against
      // the 1:1 backing size instead would offset the sprite by (zoom-1)/zoom
      // of its width, typically 90%: the sprite would sit almost entirely off
      // the left edge, which is the whole failure this note exists to prevent.
      //
      // The comment that stood here said "at view zoom 1 the content is
      // exactly canvasWidth × canvasHeight". That was TRUE only while the
      // backing store was itself pre-scaled, when one number was both things.
      // It is the same broken assumption task 02 found in `CanvasContainer`,
      // and it is corrected the same way. The arithmetic is unchanged —
      // `contentWidth` is the number the old `canvasWidth` held — so the reset
      // button centres a sprite exactly where it did before this task.
      const centered = container
        ? {
            x: Math.round((container.clientWidth - contentWidth) / 2),
            y: Math.round((container.clientHeight - contentHeight) / 2),
          }
        : { x: 0, y: 0 };
      setViewZoom(1);
      setViewPanOffset(centered);
      camera.resetView(centered);
    }, [contentWidth, contentHeight, setViewZoom, setViewPanOffset, camera]);

    /* ── the editable layer, and the grid reads ──────────────────────────── */
    //
    // THE ONLY place a pixel grid is touched. Everything below runs either
    // inside an rAF-scheduled render or inside a pointer handler — never in
    // React's render phase, and never through an observed proxy.
    const getEditLayer = useCallback(() => {
      if (!layer) return null;
      if (editingVariant && variantData)
        return variantData.variantFrame.layers[0];
      return layer;
    }, [layer, editingVariant, variantData]);

    /**
     * The cells the brush covers at `center`: `stampAt`'s geometry (task 31),
     * then the studio's own filter — paint only where a colour already exists.
     *
     * That second filter is why `stampAt` cannot be called from inside
     * `useLightingPaint`: it needs the pixel grid, which may not cross the
     * `ui/` boundary (R2). Resolving it here is what keeps the hook pure.
     *
     * ⚠️ `LightingCanvas` bounds-filtered and shape-filtered in the same pass
     * (`:159-171`); `stampAt` does the bounds half. The order differs, the
     * result does not — both are pure predicates over the same candidate set.
     */
    const resolveBrushCells = useCallback(
      (center: Point): Point[] => {
        const editLayer = getEditLayer();
        if (!editLayer) return [];
        const shape =
          normalBrushShape === "circle" ? getCirclePixels : getSquarePixels;
        return stampAt(center, {
          brushSize,
          shape,
          shapeColor: SHAPE_COLOR,
          gridWidth,
          gridHeight,
        }).filter((p) => editLayer.pixels[p.y]?.[p.x]?.color !== 0);
      },
      [getEditLayer, normalBrushShape, brushSize, gridWidth, gridHeight],
    );

    /* ── painting (concern c) ────────────────────────────────────────────── */
    const paintNormals = useCallback(
      (cells: ReadonlyArray<Point>) => {
        // ⚠️ `app.selectionUI.writeOptions` is NOT optional here. It is what
        // carries the selection mask and `selectionBehavior` down to
        // `PixelStore`, which is the ONE-DIRECTIONAL boundary: the domain
        // store never reads a UI store, so the caller assembles the bundle.
        // The bridge delegate this replaced passed exactly the same computed.
        app.pixels.setNormalPixels(
          cells.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
          app.selectionUI.writeOptions,
        );
      },
      [app, selectedNormal],
    );

    const paintHeights = useCallback(
      (cells: ReadonlyArray<Point>, erase: boolean) => {
        const value = erase ? 0 : heightBrushValue;
        app.pixels.setHeightPixels(
          cells.map((p) => ({ x: p.x, y: p.y, height: value })),
          app.selectionUI.writeOptions,
        );
      },
      [app, heightBrushValue],
    );

    const {
      hoverPixel,
      isPaintingRef,
      beginStroke,
      continueStroke,
      endStroke,
      setHoverPixel,
    } = useLightingPaint({
      editMode,
      resolveBrushCells,
      paintNormals,
      paintHeights,
      // ── ONE UNDO ENTRY PER STROKE (plan 04 task 02, owner's request) ─────
      //
      // Every `setNormalPixels` / `setHeightPixels` between these two calls
      // buffers into one `CompositeCommand`, so a drag across ten cells is a
      // single ⌘Z instead of ten. `ui/` may not import a store, so the
      // transaction crosses the boundary as callbacks.
      //
      // ⚠️ NEVER in Preview mode — that pane paints nothing, and an open
      // transaction it never closed would swallow every later edit in the app
      // (`PixelStore.ts:948-961`). The hook guards the close and also closes
      // on unmount; passing `undefined` here means it never opens one at all.
      onStrokeStart: previewMode
        ? undefined
        : (label: string) => app.history.beginTransaction(label),
      onStrokeEnd: previewMode ? undefined : () => app.history.endTransaction(),
    });

    /* ── coordinate mapping ──────────────────────────────────────────────── */
    //
    // Measured against the canvas's client RECT rather than through
    // `ui/canvas/model/coords`: `screenToPixel` maps through a pan offset and a
    // fixed zoom, which is Canvas's model. The lighting canvas has no persisted
    // pan and lives under a CSS `scale()`, so its mapping must be
    // rect-relative — `rect.width` already carries the view zoom. Using
    // `screenToPixel` here would break under pinch. Deliberate non-reuse.
    const getPixelCoordsFromClient = useCallback(
      (clientX: number, clientY: number): Point | null => {
        const canvas = editCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const x = Math.floor(((clientX - rect.left) / rect.width) * gridWidth);
        const y = Math.floor(((clientY - rect.top) / rect.height) * gridHeight);
        if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
        return { x, y };
      },
      [gridWidth, gridHeight],
    );

    /* ── render: the editable surface (concern b2) ───────────────────────── */
    const bgTheme = useMemo(
      () => backgroundTheme(lightGridMode),
      [lightGridMode],
    );

    const renderEdit = useCallback(() => {
      const canvas = editCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      const editLayer = getEditLayer();
      if (!canvas || !ctx || !editLayer) return;

      // ⚠️ 1:1 WITH THE PIXEL DATA (plan 05, task 08 — R7 closed). This was
      // `cellWidth * zoom`; at the ceiling zoom of 50 a 256x224 sprite asked
      // for a 12800x11200 backing store, i.e. 546 MB that the browser simply
      // cannot allocate. It is now 224 KB and the CSS transform on
      // `.lighting-canvas__surface` does the magnification on the GPU.
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      ctx.imageSmoothingEnabled = false;

      const source =
        editMode === "height"
          ? renderHeightAsGrayscale(editLayer, gridWidth, gridHeight)
          : renderNormalAsRGB(editLayer, gridWidth, gridHeight);

      // ⚠️ ONE `putImageData` replaces the legacy background + temp-canvas
      // `drawImage` pair. `renderNormalEdit` does the nearest-neighbour upscale
      // in arithmetic, so there is no second canvas allocated per frame and no
      // uncached O(w·h) `fillRect` checkerboard (W19 bug 1's second half, which
      // W22 had already addressed at the call site).
      //
      // ⚠️ `zoom: CELL_SCALE` — the upscale is GONE, and that is the point.
      // The renderer's `floor(y / zoom)` collapses to an identity copy at 1,
      // so what used to be a `zoom²`-times-larger write per source pixel is
      // now one write per source pixel. The checkerboard it paints underneath
      // likewise becomes one checker pixel per cell, magnified by the same
      // transform — which is why `image-rendering: pixelated` on
      // `.lighting-canvas__edit-canvas` is now LOAD-BEARING rather than
      // belt-and-braces: without it a 1px checker at 50x is grey mush.
      const buffer = ctx.createImageData(cellWidth, cellHeight);
      renderNormalEdit(buffer, {
        source,
        gridWidth,
        gridHeight,
        zoom: CELL_SCALE,
        theme: bgTheme,
      });
      ctx.putImageData(buffer, 0, 0);

      // ⚠️ THE GRID IS NO LONGER STROKED HERE. `strokeGrid` places its lines
      // at `x * zoom + 0.5`; at 1:1 that is one line per pixel column and the
      // grid degenerates into a flat wash of `gridStroke` over the entire
      // canvas — MASTER §4's first named SILENT failure, no error and no
      // artifact, just a grey rectangle. It is SVG chrome now (`gridPath`
      // below), reusing task 03's `gridOverlayPath` — the same single
      // implementation `CanvasSurface` renders. There is no third grid.
    }, [getEditLayer, gridWidth, gridHeight, cellWidth, cellHeight, editMode, bgTheme]);

    /* ── render: the Preview render mode's lit composite pane ────────────── */
    //
    // The SAME `composeLayers` → `renderWithLighting` pipeline the floating
    // thumbnail used, painted into THIS pane's main canvas at the editor's own
    // scale instead of a fixed 200 px square.
    //
    // ⚠️ NOT `renderLightingPreview`. Its `previewPlacement` picks an integer
    // fit into `PREVIEW_THUMB_SIZE` and CROPS anything larger — correct for a
    // thumbnail, wrong for a workspace pane, which is a real viewport driven by
    // the shared pixel scale and its own camera. `drawLitComposite` does no
    // fit, no centring and no crop (MASTER D9).
    const renderLitPane = useCallback(() => {
      const canvas = editCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !frame || !obj) return;

      // 1:1, exactly as `renderEdit` — see the note there.
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      ctx.imageSmoothingEnabled = false;

      const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);
      const composed = composeLayers(
        frame,
        objWidth,
        objHeight,
        baseFrameIndex >= 0 ? baseFrameIndex : 0,
        variants,
        variantFrameIndices,
      );
      const lit = renderWithLighting(composed, {
        lightDirection,
        lightColor,
        ambientColor,
        heightScale,
      });

      const buffer = ctx.createImageData(cellWidth, cellHeight);
      drawLitComposite(buffer, {
        source: lit,
        objWidth,
        objHeight,
        zoom: CELL_SCALE,
        theme: bgTheme,
      });
      ctx.putImageData(buffer, 0, 0);
    }, [
      frame,
      obj,
      objWidth,
      objHeight,
      variants,
      variantFrameIndices,
      lightDirection,
      lightColor,
      ambientColor,
      heightScale,
      cellWidth,
      cellHeight,
      bgTheme,
    ]);

    /* ── render: the brush overlay (concern b3) ──────────────────────────── */
    const renderBrushOverlay = useCallback(() => {
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // 1:1, exactly as `renderEdit`.
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      ctx.clearRect(0, 0, cellWidth, cellHeight);
      if (!hoverPixel) return;

      const cells = resolveBrushCells(hoverPixel);
      if (cells.length === 0) return;
      ctx.imageSmoothingEnabled = false;

      // The FILL stays raster: it is a cell fill, which is safe at 1:1 (D6) —
      // one cell is one pixel and `paintBrushCells`' inner `dy/dx` loops run
      // exactly once each.
      const buffer = ctx.createImageData(cellWidth, cellHeight);
      paintBrushCells(buffer, cells, CELL_SCALE);
      ctx.putImageData(buffer, 0, 0);

      // ⚠️ THE OUTLINE IS NO LONGER STROKED HERE (R3). `strokeBrushOutlines`
      // sizes each rect `zoom - 1`, so at 1:1 every call becomes
      // `strokeRect(x, y, 0, 0)` — it renders NOTHING, with no error and no
      // artifact. It is SVG chrome now (`brushOutline` below), reusing task
      // 03's `brushOutlineOverlay`, where `vector-effect: non-scaling-stroke`
      // gives it back the screen-constant hairline the raster painter always
      // documented as its intent.
    }, [cellWidth, cellHeight, hoverPixel, resolveBrushCells]);

    /* ── 🔧 W19 BUG 1: rAF COALESCING ────────────────────────────────────── */
    //
    // `LightingCanvas` called these renderers SYNCHRONOUSLY from two effects.
    // Both now go through the same scheduler `Canvas` uses: at most one paint
    // per animation frame, and the pending frame is cancelled on unmount.
    //
    // ⚠️ Which painter owns the MAIN canvas depends on the render mode. In
    // Preview mode `renderEdit`'s normal/height visualisation and the brush
    // overlay are BOTH skipped: the pane is read-only, so there is no hover
    // cell to mark and no editable channel to visualise. Each pane runs exactly
    // one main painter and, in Edit mode only, the overlay — the third
    // scheduler that used to drive the retired floating thumbnail is gone.
    useCanvasRender(previewMode ? renderLitPane : renderEdit, [
      previewMode,
      renderLitPane,
      renderEdit,
      pixelVersion,
    ]);
    useCanvasRender(previewMode ? noop : renderBrushOverlay, [
      previewMode,
      renderBrushOverlay,
    ]);

    /* ── pointer handling ────────────────────────────────────────────────── */
    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        const coords = getPixelCoordsFromClient(e.clientX, e.clientY);
        if (!coords) return;

        // Alt-click picks the height value while editing height. Verbatim.
        if (editMode === "height" && e.altKey) {
          const editLayer = getEditLayer();
          const h = editLayer?.pixels[coords.y]?.[coords.x]?.height;
          if (typeof h === "number")
            runInAction(() => app.lightingUI.setHeightBrushValue(h));
          return;
        }

        // ⚠️ The legacy MOUSE path tested `paintable.length === 0` BEFORE
        // starting the stroke, so a press on an empty cell began nothing.
        // Preserved by pre-checking here rather than inside the hook, which the
        // touch path (below) deliberately does not do.
        if (resolveBrushCells(coords).length === 0) return;
        beginStroke(coords, e.shiftKey);
      },
      [
        getPixelCoordsFromClient,
        editMode,
        getEditLayer,
        app,
        resolveBrushCells,
        beginStroke,
      ],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const coords = getPixelCoordsFromClient(e.clientX, e.clientY);
        if (isPaintingRef.current) {
          if (!coords) {
            setHoverPixel(null);
            return;
          }
          continueStroke(coords, e.shiftKey);
        } else {
          setHoverPixel(coords);
        }
      },
      [getPixelCoordsFromClient, isPaintingRef, setHoverPixel, continueStroke],
    );

    const handleMouseUp = useCallback(() => endStroke(), [endStroke]);

    const handleMouseLeave = useCallback(() => {
      endStroke();
      setHoverPixel(null);
    }, [endStroke, setHoverPixel]);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLCanvasElement>) => {
        // ⚠️ Two-finger gestures belong to the native, non-passive listener
        // on the viewport inside `useCanvasViewport` — same reasoning as
        // `CanvasContainer`: React's touch handlers are passive (so
        // `preventDefault` cannot claim the gesture from Safari) and are
        // bound to the transformed `<canvas>` (so they miss fingers placed
        // around a zoomed-out sprite). Bail out so a pinch never also paints.
        if (e.touches.length >= 2) return;

        const touch = e.touches[0];
        if (!touch) return;
        const coords = getPixelCoordsFromClient(touch.clientX, touch.clientY);
        if (!coords) return;

        // ⚠️ NO empty-cell pre-check, unlike the mouse path — the legacy touch
        // handler set `isPainting` before resolving the brush, so a touch on an
        // empty cell DID open a stroke that later moves could paint into. The
        // two devices genuinely disagree here; unifying them is a gesture
        // change, not a refactor, so both behaviours are preserved verbatim.
        beginStroke(coords, false);
      },
      [getPixelCoordsFromClient, beginStroke],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent<HTMLCanvasElement>) => {
        // Two fingers: the native viewport listener owns zoom and pan.
        if (e.touches.length >= 2 || isPinching()) return;

        if (!isPaintingRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const coords = getPixelCoordsFromClient(touch.clientX, touch.clientY);
        if (!coords) return;
        // Touch never carried Shift in the legacy handler.
        continueStroke(coords, false);
      },
      [isPinching, isPaintingRef, getPixelCoordsFromClient, continueStroke],
    );

    // The hook's own listener ends the gesture; this only closes the stroke.
    const handleTouchEnd = useCallback(() => {
      endStroke();
    }, [endStroke]);

    /* ── keyboard (concern d) ────────────────────────────────────────────── */
    //
    // Three shortcuts, verbatim. See the header for why `useCanvasKeyboard` is
    // NOT adopted here.
    useEffect(() => {
      // ⚠️ EXACTLY ONE PANE MAY BIND THIS. The listener is on `window`, so with
      // both panes mounted an ungated effect would register it twice and every
      // ⌘Z would undo twice and every `.` would step two frames. `keyboardOwner`
      // is Edit whenever Edit is open, else Preview (MASTER D12).
      if (views.keyboardOwner !== renderMode) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          return;
        if ((e.metaKey || e.ctrlKey) && e.key === "z") {
          e.preventDefault();
          // ⚠️ `app.undo()`, NOT `app.history.undo()` — the bridge-era Phase B
          // history mirror has one writer and a bare `HistoryStore` call would
          // leave it stale. See `ApplicationStore.undo`.
          app.undo();
          return;
        }
        if (e.key === "." || e.key === ",") {
          e.preventDefault();
          const currentObj = app.currentObject;
          if (!currentObj || currentObj.frames.length <= 1) return;
          const currentFrameId = app.timelineUI.selectedFrameId;
          const currentIndex = currentObj.frames.findIndex(
            (f) => f.id === currentFrameId,
          );
          if (currentIndex === -1) return;

          const length = currentObj.frames.length;
          const delta = e.key === "." ? 1 : -1;
          const newIndex = (currentIndex + delta + length) % length;
          const nextFrame = currentObj.frames[newIndex];
          if (!nextFrame) return;
          runInAction(() => {
            app.timelineUI.selectFrame(nextFrame.id, false);
            app.timelineUI.advanceVariantFrames(delta);
          });
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [app, app.timelineUI.selectedFrameId, views.keyboardOwner, renderMode]);

    /* ── per-pane view controls ──────────────────────────────────────────── */
    //
    // Mode button (open the other pane, or swap sides when both are open) above
    // close (only when both are open) above reset — the same cluster the pixel
    // studio grew in plan 02.
    //
    // ⚠️ NO `onNudgeOffset`. The variant-offset arrows are a pixel-studio
    // feature; the lighting studio has never had them and this plan does not
    // add them.
    const otherMode: LightingRenderMode = previewMode ? "edit" : "preview";
    const modeButton = views.bothOpen
      ? {
          kind: "swap" as const,
          label: "Swap pane sides",
          onClick: () => views.swap(),
        }
      : {
          kind: "open" as const,
          label: previewMode ? "Open Edit view" : "Open Preview view",
          onClick: () => views.openMode(otherMode),
        };
    const onClose = views.bothOpen
      ? {
          label: previewMode ? "Close Preview view" : "Close Edit view",
          onClick: () => views.closeMode(renderMode),
        }
      : undefined;

    /* ── the SVG chrome (D5) ─────────────────────────────────────────────── */
    //
    // Both paths live in CELL space — one SVG user unit is one grid cell,
    // matching the 1:1 canvases — and the element inherits the same
    // `scale(zoom * viewZoom)` the canvases do, with
    // `vector-effect: non-scaling-stroke` exempting the stroke WIDTHS from it.
    // That pair is what gives the grid and the brush outline back the
    // screen-constant hairline their canvas painters documented and which 1:1
    // would otherwise have destroyed silently.

    /**
     * The grid.
     *
     * ⚠️ No variant-offset sub-rectangle, unlike `CanvasContainer`'s. The
     * lighting studio's editable surface always starts at the grid origin —
     * `renderNormalEdit` passes `offsetX: 0` for exactly the same reason, and
     * a variant is rendered at its own 0,0 rather than at its object offset.
     * The Preview pane shows the whole object, so its grid is the object's.
     */
    const gridPath = useMemo(
      () => gridOverlayPath({ cellWidth, cellHeight }, lightGridMode),
      [cellWidth, cellHeight, lightGridMode],
    );

    /**
     * The brush footprint's outline. `null` in Preview mode (a read-only pane
     * has no hover cell) and whenever nothing is hovered, so the surface
     * renders no `<path>` at all rather than an empty `d`.
     */
    const brushOutline = useMemo<SvgPathSpec | null>(() => {
      if (previewMode || !hoverPixel) return null;
      const cells = resolveBrushCells(hoverPixel);
      if (cells.length === 0) return null;
      return brushOutlineOverlay(cells);
    }, [previewMode, hoverPixel, resolveBrushCells]);

    const empty = !obj || !frame;

    return (
      <LightingSurface
        editCanvasRef={editCanvasRef}
        overlayCanvasRef={overlayCanvasRef}
        containerRef={containerRef}
        rootRef={rootRef}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        viewPanOffset={viewPanOffset}
        // ⚠️ `zoom * viewZoom`, NOT `viewZoom` alone. The canvases are 1:1
        // now, so this one declaration carries ALL the magnification — the
        // pixel scale that used to live in the backing store included.
        combinedScale={zoom * viewZoom}
        grid={gridPath}
        brushOutline={brushOutline}
        editMode={editMode}
        // The readout describes what THIS pane shows: the edit grid in Edit
        // mode, the whole object in Preview mode.
        gridWidth={viewCellsX}
        gridHeight={viewCellsY}
        zoom={zoom}
        empty={empty}
        viewControls={
          <CanvasViewControls
            onResetView={handleResetView}
            modeButton={modeButton}
            onClose={onClose}
          />
        }
        {...(previewMode
          ? READ_ONLY_POINTERS
          : {
              onMouseDown: handleMouseDown,
              onMouseMove: handleMouseMove,
              onMouseUp: handleMouseUp,
              onMouseLeave: handleMouseLeave,
              onTouchStart: handleTouchStart,
              onTouchMove: handleTouchMove,
              onTouchEnd: handleTouchEnd,
            })}
      />
    );
  },
);
