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
 *   (b) three renderers        → `ui/canvas/render/renderLightingPreview`,
 *                                `renderNormalEdit`, `renderBrushOverlay`
 *   (c) normal/height painting → `ui/hooks/useLightingPaint`
 *   (d) keyboard               → this file (see the note below)
 *   (e) the floating panel     → `ui/components/LightingPreviewPanel` on the
 *                                task-19 `FloatingPanel` primitive, wired by
 *                                `LightingPreviewPanelContainer`
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
 * `renderPreview` below, which run from a scheduled animation frame and not
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
 *    The FLOATING PREVIEW is deliberately NOT theme-aware: it stays
 *    `backgroundTheme(false)`. It is a thumbnail of the LIT SPRITE, not an
 *    editing grid, and its cyan border and dark well are designed against the
 *    dark base. Q3 is about the two canvases' GRIDS agreeing, and the preview
 *    has no grid.
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
 * ── The action seam, as in `CanvasContainer` ──────────────────────────────
 *
 * Values are read off MobX directly (the R7 granularity win). ACTIONS go
 * through `useEditorStore.getState()`, whose names are all bridge DELEGATES
 * landing in MobX, because several assemble arguments that live in
 * `stores/bridge/zustandBridge.ts` (`pixelWriteOptions()`). Task 38 retires
 * these call sites with Zustand, in one place. `zustandBridge.ts` is owned by
 * task 34 this wave and is not touched.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores/context";
import { useEditorStore } from "../store";
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
import { getSquarePixels, getCirclePixels } from "../components/Canvas/drawingUtils";
import {
  backgroundTheme,
  strokeGrid,
} from "../ui/canvas/render/canvasBackground";
import type { BackgroundGeometry } from "../ui/canvas/render/canvasBackground";
import {
  renderLightingPreview,
  PREVIEW_THUMB_SIZE,
  PREVIEW_BORDER,
} from "../ui/canvas/render/renderLightingPreview";
import { renderNormalEdit } from "../ui/canvas/render/renderNormalEdit";
import {
  paintBrushCells,
  strokeBrushOutlines,
} from "../ui/canvas/render/renderBrushOverlay";
import { stampAt } from "../ui/canvas/tools/brushStamp";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import { useCanvasViewport } from "../ui/hooks/useCanvasViewport";
import { useLightingPaint } from "../ui/hooks/useLightingPaint";
import { LightingSurface } from "../ui/components/LightingSurface/LightingSurface";
import { LightingPreviewPanelContainer } from "./LightingPreviewPanelContainer";

/** The colour the brush shapes are asked for. Discarded — see `brushStamp`. */
const SHAPE_COLOR = { r: 0, g: 0, b: 0, a: 255 } as const;

export const LightingCanvasContainer = observer(
  function LightingCanvasContainer() {
    const app = useStores();

    /* ── refs ────────────────────────────────────────────────────────────── */
    const rootRef = useRef<HTMLDivElement>(null);
    const editCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
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

    /* ── actions, through the bridge seam (see the module header) ────────── */
    const actions = useEditorStore.getState();

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

    const canvasWidth = gridWidth * zoom;
    const canvasHeight = gridHeight * zoom;

    /* ── the viewport engine (task 31) ───────────────────────────────────── */
    //
    // ⚠️ NO `onCommitPan`, exactly as `LightingCanvas` behaved: its pan stayed
    // local and its wheel handler had none of `Canvas`'s `scheduleCommitPan()`
    // calls. Supplying one here would silently start persisting the lighting
    // studio's pan.
    const {
      viewZoom,
      viewPanOffset,
      beginPinch,
      updatePinch,
      endPinch,
      isPinching,
    } = useCanvasViewport({
      containerRef,
      canvasWidth,
      canvasHeight,
      panOffset: { x: 0, y: 0 },
    });

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
        actions.setNormalPixels(
          cells.map((p) => ({ x: p.x, y: p.y, normal: selectedNormal })),
        );
      },
      [actions, selectedNormal],
    );

    const paintHeights = useCallback(
      (cells: ReadonlyArray<Point>, erase: boolean) => {
        const value = erase ? 0 : heightBrushValue;
        actions.setHeightPixels(
          cells.map((p) => ({ x: p.x, y: p.y, height: value })),
        );
      },
      [actions, heightBrushValue],
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

    /* ── render: the floating lit thumbnail (concern b1) ─────────────────── */
    const renderPreview = useCallback(() => {
      const canvas = previewCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !frame || !obj) return;

      canvas.width = PREVIEW_THUMB_SIZE;
      canvas.height = PREVIEW_THUMB_SIZE;
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

      const buffer = ctx.createImageData(
        PREVIEW_THUMB_SIZE,
        PREVIEW_THUMB_SIZE,
      );
      renderLightingPreview(buffer, {
        lit,
        objWidth,
        objHeight,
        // Deliberately NOT `lightGridMode` — see the header. The thumbnail is a
        // lit-sprite preview, not an editing grid.
        theme: backgroundTheme(false),
      });
      ctx.putImageData(buffer, 0, 0);

      // The border is a STROKE, so it stays here: `canvasStub` cannot rasterise
      // it and hashing it would be a lie. `PREVIEW_BORDER` keeps the values with
      // the renderer so the two cannot drift.
      ctx.strokeStyle = PREVIEW_BORDER.strokeStyle;
      ctx.lineWidth = PREVIEW_BORDER.lineWidth;
      ctx.strokeRect(0.5, 0.5, PREVIEW_THUMB_SIZE - 1, PREVIEW_THUMB_SIZE - 1);
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
    ]);

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

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
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
      const buffer = ctx.createImageData(canvasWidth, canvasHeight);
      renderNormalEdit(buffer, {
        source,
        gridWidth,
        gridHeight,
        zoom,
        theme: bgTheme,
      });
      ctx.putImageData(buffer, 0, 0);

      const geom: BackgroundGeometry = {
        canvasWidth,
        canvasHeight,
        cellsX: gridWidth,
        cellsY: gridHeight,
        offsetX: 0,
        offsetY: 0,
        zoom,
      };
      // 🔧 W19 BUG 3 COMPLETE: the grid is now `bgTheme`'s, i.e. white 5% in
      // dark mode and black 8% in light mode — Canvas's rule, verbatim.
      strokeGrid(ctx, geom, bgTheme);
    }, [
      getEditLayer,
      gridWidth,
      gridHeight,
      canvasWidth,
      canvasHeight,
      zoom,
      editMode,
      bgTheme,
    ]);

    /* ── render: the brush overlay (concern b3) ──────────────────────────── */
    const renderBrushOverlay = useCallback(() => {
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (!hoverPixel) return;

      const cells = resolveBrushCells(hoverPixel);
      if (cells.length === 0) return;
      ctx.imageSmoothingEnabled = false;

      const buffer = ctx.createImageData(canvasWidth, canvasHeight);
      paintBrushCells(buffer, cells, zoom);
      ctx.putImageData(buffer, 0, 0);
      // The outlines are strokes; see `renderBrushOverlay`'s header for why the
      // module splits fill from outline.
      strokeBrushOutlines(ctx, cells, zoom);
    }, [canvasWidth, canvasHeight, hoverPixel, resolveBrushCells, zoom]);

    /* ── 🔧 W19 BUG 1: rAF COALESCING ────────────────────────────────────── */
    //
    // `LightingCanvas` called these renderers SYNCHRONOUSLY from two effects.
    // Both now go through the same scheduler `Canvas` uses: at most one paint
    // per animation frame, and the pending frame is cancelled on unmount.
    //
    // Two schedulers, not one, because the two surfaces invalidate on different
    // signals — the preview depends on the LIGHTING parameters, the edit canvas
    // on the grid and the theme. Merging them would repaint a 200x200 lit
    // composite every time the cursor changed the brush overlay.
    const { invalidate: invalidatePreview } = useCanvasRender(renderPreview, [
      renderPreview,
      pixelVersion,
    ]);
    useCanvasRender(renderEdit, [renderEdit, pixelVersion]);
    useCanvasRender(renderBrushOverlay, [renderBrushOverlay]);

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
          if (typeof h === "number") actions.setHeightBrushValue(h);
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
        actions,
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
        if (e.touches.length === 2) {
          e.preventDefault();
          beginPinch(e.touches);
          return;
        }
        endPinch();

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
      [beginPinch, endPinch, getPixelCoordsFromClient, beginStroke],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.touches.length === 2 && isPinching()) {
          e.preventDefault();
          updatePinch(e.touches);
          return;
        }
        if (e.touches.length < 2) endPinch();

        if (!isPaintingRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const coords = getPixelCoordsFromClient(touch.clientX, touch.clientY);
        if (!coords) return;
        // Touch never carried Shift in the legacy handler.
        continueStroke(coords, false);
      },
      [
        isPinching,
        updatePinch,
        endPinch,
        isPaintingRef,
        getPixelCoordsFromClient,
        continueStroke,
      ],
    );

    const handleTouchEnd = useCallback(() => {
      endPinch();
      endStroke();
    }, [endPinch, endStroke]);

    /* ── keyboard (concern d) ────────────────────────────────────────────── */
    //
    // Three shortcuts, verbatim. See the header for why `useCanvasKeyboard` is
    // NOT adopted here.
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          return;
        if ((e.metaKey || e.ctrlKey) && e.key === "z") {
          e.preventDefault();
          actions.undo();
          return;
        }
        if (e.key === "." || e.key === ",") {
          e.preventDefault();
          const currentObj = actions.getCurrentObject();
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
          actions.selectFrame(nextFrame.id, false);
          actions.advanceVariantFrames(delta);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [actions, app.timelineUI.selectedFrameId]);

    /* ── the panel, and its one imperative coupling ──────────────────────── */
    //
    // Expanding the panel re-mounts the thumbnail canvas, so the ref it was
    // painted through is a NEW element with a blank backing store. The legacy
    // code re-rendered on the next frame (`LightingCanvas.tsx:565-570`);
    // `invalidate()` is the same thing through the scheduler.
    const handlePanelMinimizedChange = useCallback(
      (next: boolean) => {
        if (!next) invalidatePreview();
      },
      [invalidatePreview],
    );

    const empty = !obj || !frame;

    return (
      <LightingSurface
        editCanvasRef={editCanvasRef}
        overlayCanvasRef={overlayCanvasRef}
        containerRef={containerRef}
        rootRef={rootRef}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        viewPanOffset={viewPanOffset}
        viewZoom={viewZoom}
        editMode={editMode}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        zoom={zoom}
        empty={empty}
        previewPanel={
          <LightingPreviewPanelContainer
            canvasRef={previewCanvasRef}
            containerRef={rootRef}
            onMinimizedChange={handlePanelMinimizedChange}
          />
        }
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    );
  },
);
