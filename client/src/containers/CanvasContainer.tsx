/**
 * CanvasContainer — the wiring that replaced `Canvas.tsx` (REFRESH task 32).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 `components/Canvas/Canvas.tsx` NO LONGER EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It was 3,062 lines, eleven responsibilities and **47 store members in one
 * destructure** — `MASTER.md` §3's largest client file and §11's R10, the
 * highest-risk single file in the plan. Three sequential tasks took it apart:
 *
 *   task 30 (W22)  the pure layer      → `ui/canvas/{model,render,tools}`
 *   task 31 (W23)  the hooks           → `ui/hooks/useCanvas*`
 *   task 32 (HERE) the store binding   → this file
 *                  the markup          → `ui/components/CanvasSurface`
 *                  the gesture state   → `stores/ui/CanvasInteractionStore`
 *
 * ── Where the eleven responsibilities went ────────────────────────────────
 *
 * |  # | Concern                     | Now lives in                          |
 * | -: | --------------------------- | ------------------------------------- |
 * |  1 | Store binding (47 members)  | **this file** — the only place left    |
 * |  2 | Grid/view geometry          | `ui/hooks/useCanvasGeometry`           |
 * |  3 | Offscreen bg/grid caches    | this file (the CACHE; the painters are |
 * |    |                             | `ui/canvas/render/canvasBackground`)   |
 * |  4 | Coordinate mapping          | `ui/canvas/model/coords`               |
 * |  5 | Variant-offset resolution   | `ui/canvas/model/variantOffset`        |
 * |  6 | Scene rendering             | this file's `render` + the selection / |
 * |    |                             | origin painters in `ui/canvas/render`  |
 * |  7 | Reference-trace overlay     | this file's `renderOverlay`            |
 * |  8 | Frame overlay               | `ui/canvas/render/renderFrameOverlay`  |
 * |  9 | Frame-trace overlay         | same module, parameterised              |
 * | 10 | Pointer / gesture handling  | `ui/hooks/useCanvasPointer` +          |
 * |    |                             | `ui/canvas/tools/toolHandlers` + the   |
 * |    |                             | gesture arbitration below              |
 * | 11 | Keyboard shortcuts          | `ui/hooks/useCanvasKeyboard`           |
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `observer()` HERE, `reaction` FOR THE PIXELS — AND THE DIFFERENCE
 *  BETWEEN THEM IS THE WHOLE POINT (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `observer()` wraps THIS component, which reads only scalars and small
 * `observableRef` objects — zoom, the tool, the colour, the selection state's
 * identity. It never reads a pixel grid, and there is no code path by which it
 * could: `layer.pixels` is `observableRef` and the only consumer is the
 * imperative `render()` below, which runs from a scheduled animation frame and
 * not from React's render phase.
 *
 * The redraw signal is therefore `useCanvasRender(render, deps)` — an
 * rAF-coalesced effect whose dependency list includes `pixelVersion`, the
 * counter `PixelStore` bumps once per committed mutation. That counter is what
 * MobX observes; the 300,249-cell tree is not. An `observer()` that touched
 * grid CONTENT would build ~1M proxies and present as "MobX is slow" rather
 * than as the modelling error it is.
 *
 * ── ⚠️ THE ACTION SEAM IS DELIBERATE, AND IT IS NOT LAZINESS ──────────────
 *
 * Values are read off MobX directly (`app.ui.tool.selectedTool`, …) — that is
 * the granularity win R7 is about, and it is why this container re-renders on
 * the fields it uses instead of on every store change like the 33 legacy
 * consumers did.
 *
 * ACTIONS are assembled from the MobX stores directly (W29i; the bridge that
 * once mediated them is gone since task 38). During the bridge era several
 * delegates assembled non-trivial arguments the MobX actions require —
 * `pixelWriteOptions()`, `selectionWriteOptions()`, `editableGrid()`, and
 * the two-step
 * `moveSelectedPixels` that moves the mask after the pixels
 * (`zustandBridge.ts:1006-1105`). Re-deriving those here would create a SECOND
 * implementation of each, which is precisely the duplication the migration
 * exists to remove, and `stores/bridge/` is outside this task's `Touches`.
 * When task 38 retires Zustand it retires these call sites with it, in one
 * place. See the task 32 report.
 *
 * ── W29c LEFT IT ALONE; W29d REMOVED THE ARGUMENT-ASSEMBLY BLOCKER BUT
 *    FOUND A SECOND, LARGER ONE ────────────────────────────────────────────
 *
 * W29c's stated blocker was argument assembly: four helpers
 * (`pixelWriteOptions()`, `selectionWriteOptions()`, `selectionDims()`,
 * `editableGrid()`) existed ONLY as closures in `zustandBridge.ts`, so calling
 * `app.pixels.*` here meant a second implementation of each. **W29d resolved
 * that**: `pixelWriteOptions` was already a one-line delegation to
 * `app.selectionUI.writeOptions`, and the other three now live on their store
 * homes as `SelectionUIStore.maskWriteOptions`,
 * `ApplicationStore.editableGrid` and `ApplicationStore.selectionDims`.
 * `LightingCanvasContainer` migrated on the strength of exactly that.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  W29e: THE RE-HYDRATION CLOBBER IS FIXED — WHAT REMAINS, AND WHY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * W29d recorded that `zustandBridge.ts` called `app.ui.hydrate(...)` on EVERY
 * Zustand change, so a MobX-only write to any of the ~30 UI fields was
 * reverted by the next unrelated change. W29e fixed that: `hydrate` now runs
 * behind the same ECHO-CHECK seam the clipboards, the nine lighting settings
 * and `variantFrameIndices` already use, so it adopts a genuine external
 * write (a load, a legacy setter) and ignores the mirror's own echo.
 * `rehydrationClobber.test.ts` pins it — the four repros FAILED before it.
 *
 * Consequently `setTool`, `revertToPreviousTool` and `setBorderRadius` are no
 * longer clobber hazards: a MobX write to them now survives. W29e ALSO fixed
 * the fourth name on W29d's list, which turned out to be a DIFFERENT defect —
 * see the overlay note at the shortcut wiring below.
 *
 * ── What still kept the legacy Zustand hook in this file ────────────────────────
 *
 * NOT the clobber, and after W29f (task 38) not the six actions either.
 *
 * ── W29f: the last six Phase A writes in this file are GONE ───────────────
 *
 * `setTool`, `revertToPreviousTool`, `setBorderRadius`,
 * `setColorAndAddToHistory`, `addToColorHistory` and `undo` now call their
 * MobX owners (`app.ui.tool.*`, `app.setColorAndAddToHistory`,
 * `app.session.addToColorHistory`, `app.undo()`).
 *
 * This is NOT the second-writer hazard the previous note warned about,
 * because the two things that made it one were both fixed first:
 *
 *  1. `selectedTool`/`borderRadius`/`selectedColor` are among the ~30 UI
 *     fields that sit in NEITHER phase list and are mediated by W29e's
 *     echo-checked `adoptUIState`. W29e PINNED the survival of exactly these
 *     writes — `rehydrationClobber.test.ts` has "setTool +
 *     revertToPreviousTool survive — the eyedropper round trip",
 *     "setBorderRadius survives" and "a pure-MobX setColor survives WITHOUT
 *     writing the Zustand source". Two other containers
 *     (`PixelStudioToolsContainer`, `RightSidebarTopControlsContainer`)
 *     already wrote them this way, so this file was the ODD ONE OUT — the
 *     two entry points had drifted onto different stores exactly as the
 *     frame-trace overlay had.
 *  2. `colorHistory` IS a genuine `PHASE_A_FIELDS` member, so it is reached
 *     through `ApplicationStore.setColorAndAddToHistory`, which deliberately
 *     writes the ZUSTAND SOURCE (see its note) and lets the mirror carry the
 *     value back. That is Phase A's direction, not a second writer.
 *  3. A MobX UI write now actually SAVES: W29d found `AutoSaveController`
 *     never observed `persistedUIVersion`, so a UI-only write produced zero
 *     saves. Fixed and pinned, which is what makes flipping these safe at all.
 *
 * The 21 remaining `actions.*` names reached the MobX stores through bridge
 * delegates until task 38 deleted the bridge; they now call those stores
 * directly (see the ACTIONS block below) — the same implementations, one
 * fewer hop.
 *
 * ── Gesture arbitration stays here, and `useCanvasPointer` handles the rest ─
 *
 * `toolHandlers` (task 31) covers the eight tools that are pure pixel
 * transforms: pixel, eraser, fill-square, flood-fill, gaussian-fill, line,
 * rectangle, ellipse. `useCanvasPointer` dispatches them for BOTH devices
 * through one code path, which is what structurally prevents the mouse/touch
 * drift R10 warned about and Q44 measured.
 *
 * What it deliberately does NOT cover, and what therefore arbitrates below:
 * panning (button/alt vs two-finger), the four selection modes, selection
 * dragging, the move tool, the eyedropper, the origin tool and the two trace
 * modes. Those consume the event BEFORE any tool is consulted — exactly the
 * order `Canvas.tsx` used — because each is a gesture, not a brush.
 *
 * ⚠️ Touch remains a deliberate SUBSET: the legacy touch handlers never
 * implemented the eyedropper, selection, origin or trace tools, and
 * `canDispatchTool()` states that in one place rather than leaving it implicit
 * in which branches happen to be missing. Extending touch to them is a
 * behaviour change needing its own gesture design, not a refactor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  ACCENT_PRIMARY_14,
  ACCENT_VARIANT,
  BLACK_12,
  WARN_ORANGE_40,
  WARN_ORANGE_60,
  WHITE_08,
} from "../ui/theme/canvasTokens";
import { useStores } from "../stores/context";
import { CanvasViewControls } from "../ui/components/CanvasViewControls/CanvasViewControls";
import { strokeControl } from "../stores/history/editorHistory";
import type { Color, Point, SelectionBox, Pixel, PixelData } from "../types";
import type { Layer } from "../types";
import type { ReferenceImageData } from "../types/referenceImage";
import {
  getLinePixels,
  getRectanglePixels,
  getEllipsePixels,
  floodFill,
  gaussianFloodFill,
  getSquarePixels,
  getCirclePixels,
} from "../components/Canvas/drawingUtils";
import { resolveVariantOffset } from "../ui/canvas/model/variantOffset";
import { screenToPixel } from "../ui/canvas/model/coords";
import {
  backgroundTheme,
  paintCheckerboard,
  strokeGrid,
} from "../ui/canvas/render/canvasBackground";
import {
  renderFrameOverlay as renderFrameOverlayBuffer,
  overlayVariantFrameIndices,
  FRAME_OVERLAY_MODE,
  FRAME_TRACE_MODE,
} from "../ui/canvas/render/renderFrameOverlay";
import { drawOriginCross } from "../ui/canvas/render/renderOriginCross";
import {
  drawLasso,
  drawMarchingAnts,
} from "../ui/canvas/render/renderSelectionOverlay";
import {
  paintHoverCells,
  strokeHoverOutline,
} from "../ui/canvas/render/renderHoverMarker";
import { toolFootprint } from "../ui/canvas/tools/toolFootprint";
import { markerAction } from "../ui/canvas/model/markerPolicy";
import {
  drawingTouch,
  pinchTouches,
  touchesInContainer,
} from "../ui/canvas/model/canvasTouchFilter";
import { stampTrace } from "../ui/canvas/tools/traceSampler";
import type { ToolContext } from "../ui/canvas/tools/toolHandlers";
import type { StampPoint } from "../ui/canvas/tools/brushStamp";
import { useCanvasGeometry } from "../ui/hooks/useCanvasGeometry";
import { useCanvasKeyboard } from "../ui/hooks/useCanvasKeyboard";
import { useCanvasPointer } from "../ui/hooks/useCanvasPointer";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import { useCanvasViewport } from "../ui/hooks/useCanvasViewport";
import { usePencilHover } from "../ui/hooks/usePencilHover";
import { CanvasSurface } from "../ui/components/CanvasSurface/CanvasSurface";

/**
 * Narrow a pixel cell.
 *
 * The pure renderers under `ui/canvas/` deliberately do not import the domain
 * `PixelData` type — they treat a cell as opaque and delegate reading it to
 * this callback, which is what keeps `ui/` free of a domain dependency. Moved
 * verbatim from `Canvas.tsx:47-51`.
 */
function getPixelColor(cell: unknown): Pixel | null {
  const pd = cell as PixelData | undefined;
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

/**
 * Onion-skin support for the layer focus mode. A cell is EMPTY when it holds
 * no colour (or alpha 0); a painted cell is an OUTLINE cell when at least one
 * of its 4-adjacent neighbours is empty. Out-of-bounds neighbours count as
 * empty, so a silhouette touching the grid border keeps its edge.
 */
function isEmptyCell(
  pixels: PixelData[][],
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return true;
  const pixel = getPixelColor(pixels[y]?.[x]);
  return !pixel || pixel.a === 0;
}

function isOutlineCell(
  pixels: PixelData[][],
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return (
    isEmptyCell(pixels, x - 1, y, width, height) ||
    isEmptyCell(pixels, x + 1, y, width, height) ||
    isEmptyCell(pixels, x, y - 1, width, height) ||
    isEmptyCell(pixels, x, y + 1, width, height)
  );
}

/** Tools whose gesture is arbitrated here rather than by `toolHandlers`. */
function isGestureTool(tool: string): boolean {
  return (
    tool === "move" ||
    tool === "selection" ||
    tool === "eyedropper" ||
    tool === "origin"
  );
}

export interface CanvasContainerProps {
  referenceImage?: ReferenceImageData | null;
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  overlayFrameIndex?: number | null;
}

export const CanvasContainer = observer(function CanvasContainer({
  referenceImage,
  overlayFrameIndex,
}: CanvasContainerProps) {
  const app = useStores();

  /* ── refs ──────────────────────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Offscreen caches for the static checkerboard and grid lines. Concern #3:
  // the PAINTERS are pure functions in `ui/canvas/render/canvasBackground`;
  // only the cache lives here, because a cache is state.
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheKeyRef = useRef<string>("");
  const gridCacheKeyRef = useRef<string>("");

  /* ── the gesture arbitration state ─────────────────────────────────────── */
  //
  // These are LOCAL, not store state, and deliberately so. Every one is
  // scratch data for a gesture that is already in flight: it has no meaning
  // between events, is never persisted, never serialized and read by nothing
  // outside this component. Promoting them to MobX would add observability
  // that no second consumer wants and would put a `setState`-per-mousemove
  // through the store. The THREE fields that genuinely are shared gesture
  // state — `isDrawing`, `drawStartPoint`, `previewPixels` — did move, to
  // `CanvasInteractionStore`, because the tool handlers write them.
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [isDraggingPixels, setIsDraggingPixels] = useState(false);
  const [lastDragPixel, setLastDragPixel] = useState<Point | null>(null);
  // The move tool's in-flight offset. The pixels are NOT moved while the
  // pointer is down: `moveLayerPixels` clips at the grid edge on every call,
  // so committing each cell of movement silently ate whatever was dragged
  // past an edge and back. The drag is previewed here and committed ONCE, on
  // release, as a single shift — one history entry, one clip.
  const [moveDragOffset, setMoveDragOffset] = useState<{
    dx: number;
    dy: number;
  }>({ dx: 0, dy: 0 });
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [previewSelection, setPreviewSelection] = useState<SelectionBox | null>(
    null,
  );
  const [isLassoSelecting, setIsLassoSelecting] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionDragMode, setSelectionDragMode] = useState<
    "pixels" | "selection" | null
  >(null);
  const [lastSelectionDragPixel, setLastSelectionDragPixel] =
    useState<Point | null>(null);
  const [pixelDragOffset, setPixelDragOffset] = useState<{
    dx: number;
    dy: number;
  }>({ dx: 0, dy: 0 });
  const [isTracing, setIsTracing] = useState(false);

  /* ── observable reads ──────────────────────────────────────────────────── */
  //
  // Each is a SCALAR or a small `observableRef`. Reading one here IS the MobX
  // subscription, so this container re-renders on exactly these fields — the
  // R7 granularity win over the legacy 47-member destructure, which
  // re-rendered on every store change of any kind.
  const obj = app.currentObject;
  const frame = app.currentFrame;
  const layer = app.currentLayer;
  const variantData = app.currentVariant;
  const editingVariant = app.isEditingVariant;

  const tool = app.ui.tool;
  const viewport = app.ui.viewport;
  const referenceUI = app.referenceUI;
  const interaction = app.canvasInteraction;

  const currentTool = tool.selectedTool;
  const currentColor = tool.selectedColor;
  const brushSize = tool.brushSize;
  const pencilBrushShape = tool.pencilBrushShape;
  const eraserShape = tool.eraserShape;
  const shapeMode = tool.shapeMode;
  const borderRadius = tool.borderRadiusOrZero;
  const selectionMode = tool.selectionMode;
  const selectionBehavior = tool.selectionBehavior;

  const zoom = viewport.zoom;
  const panOffset = viewport.panOffset;
  const lightGridMode = viewport.lightGridMode ?? false;
  const layerFocusMode = viewport.layerFocusMode;

  const selection = app.selectionUI.selection;

  const frameTraceActive = referenceUI.frameTraceActive;
  const frameTraceFrameIndex = referenceUI.frameTraceFrameIndex;
  const frameOverlayOffset = referenceUI.frameOverlayOffset;
  const referenceOverlayOffset = referenceUI.overlayOffset;
  const traceNudgeAmount = referenceUI.traceNudgeAmount;

  // ⚠️ THE REDRAW SIGNAL. `PixelStore` bumps this counter once per committed
  // mutation; the 300k-cell tree is never observed. Read here so the
  // `observer()` subscribes to the counter, and listed in the render deps
  // below so a pixel write schedules exactly one animation frame.
  const pixelVersion = app.domain.pixelVersion;

  // The 3 TRANSIENT gesture fields, off `CanvasInteractionStore`.
  // `previewPixels` is `observableRef` there, so this reads the ARRAY'S
  // IDENTITY — which is the correct signal, since it is always replaced
  // wholesale and never mutated.
  const isDrawing = interaction.isDrawing;
  const drawStartPoint = interaction.drawStartPoint;
  const previewPixels = interaction.previewPixels;

  /* ══════════════════════════════════════════════════════════════════════
   *  ACTIONS — now assembled from the MobX stores (W29i)
   * ══════════════════════════════════════════════════════════════════════
   *
   * This was `getState()` on the legacy Zustand hook, the codebase's last real
   * legacy-store read outside the bridge itself.
   *
   * ── Why it could not move before, and why it can now ───────────────────
   *
   * W29c's stated blocker was ARGUMENT ASSEMBLY: four helpers
   * (`pixelWriteOptions()`, `selectionWriteOptions()`, `selectionDims()`,
   * `editableGrid()`) existed ONLY as closures in `zustandBridge.ts`, so
   * calling `app.pixels.*` here meant a SECOND implementation of each —
   * precisely the duplication the migration exists to remove.
   *
   * **W29d dissolved that blocker** by giving all four a store home:
   * `SelectionUIStore.writeOptions`, `SelectionUIStore.maskWriteOptions`,
   * `ApplicationStore.editableGrid` and `ApplicationStore.selectionDims`.
   * `LightingCanvasContainer` migrated on exactly that basis. This file is
   * the same migration; nothing below re-derives anything.
   *
   * ⚠️ `beginStroke`/`endStroke` go through `strokeControl`
   * (`stores/history/editorHistory.ts`), NOT `HistoryStore` methods spelled
   * out here: the seam owns the deferred-empty-snapshot rule ("beginStroke
   * ALWAYS snapshots, even on a stroke that paints nothing" — pinned by task
   * 08), so one drag stays exactly one undo entry. During the bridge era the
   * same closure also kept the legacy history mirror consistent; task 38
   * retired the mirror and re-homed the seam.
   *
   * ⚠️ `moveSelectedPixels` is TWO STEPS, in this order — the pixels move,
   * then the MASK moves with them. Verbatim from the bridge delegate, which
   * took it verbatim from `selectionActions.ts:577,648`. Dropping the second
   * step detaches the selection outline from the art it describes.
   *
   * ⚠️ `startDrawing` performs a COUPLED write and both halves are kept.
   * Besides the gesture flag it clears the pending colour adjustment, and
   * `colorAdjustment` is in NEITHER phase list — Zustand's copy and
   * `ToolUIStore`'s are two INDEPENDENT storage locations that the bridge
   * mirrors in no direction. The live UI reads the MobX one after W29h, while
   * the legacy `store/colorAdjustmentActions.ts` still reads its own, so
   * clearing one is a real regression in either direction (W29h fixed exactly
   * that defect at this call site).
   *
   * `app.clearColorAdjustment()` clears BOTH: W29i hoisted the paired
   * implementation out of the `TimelineUIStore` context literal — where it
   * was reachable only via `selectLayer` — onto `ApplicationStore`, so the
   * public lifecycle surface and the `selectLayer` path finally agree.
   * `drawing.test.ts:520` pins the Zustand half and still passes.
   */
  const actions = useMemo(
    () => ({
      /* pixel writes — `writeOptions` is the mask/behaviour/variant-index
       * bundle, read on the UI side and passed DOWN, so `PixelStore` never
       * reads a UI store (the one-directional boundary). */
      setPixels: (pixels: Parameters<typeof app.pixels.setPixels>[0]) =>
        app.pixels.setPixels(pixels, app.selectionUI.writeOptions),

      /* selection geometry */
      setSelection: (box: SelectionBox | null) =>
        app.selectionUI.setSelection(box, app.selectionDims),
      clearSelection: () => app.selectionUI.clearSelection(),
      moveSelection: (dx: number, dy: number) =>
        app.selectionUI.moveSelection(dx, dy),
      selectLasso: (points: Point[]) =>
        app.selectionUI.selectLasso(points, app.selectionDims),

      /* the two pixel-sampling selects — both no-op without an editable grid,
       * exactly as the bridge delegates did. */
      selectFloodFillAt: (x: number, y: number) => {
        const editable = app.editableGrid;
        if (!editable) return;
        app.selectionUI.selectFloodFillAt(x, y, editable.grid, editable.dims);
      },
      selectAllByColorAt: (x: number, y: number) => {
        const editable = app.editableGrid;
        if (!editable) return;
        app.selectionUI.selectAllByColorAt(x, y, editable.grid, editable.dims);
      },

      /* the two that ALWAYS act on the mask — `selectionBehavior` does not
       * gate them, which is why this is `maskWriteOptions` and not
       * `writeOptions`. */
      deleteSelectionPixels: () =>
        app.pixels.deleteSelectionPixels(app.selectionUI.maskWriteOptions),
      moveSelectedPixels: (dx: number, dy: number) => {
        app.pixels.moveSelectedPixels(dx, dy, app.selectionUI.maskWriteOptions);
        app.selectionUI.moveSelection(dx, dy);
      },

      /* stroke batching — see the note above. */
      beginStroke: () => strokeControl.begin(),
      endStroke: () => strokeControl.end(),

      /* gesture state */
      endDrawing: () => app.canvasInteraction.endDrawing(),
      setPreviewPixels: (
        pixels: Parameters<typeof app.canvasInteraction.setPreviewPixels>[0],
      ) => app.canvasInteraction.setPreviewPixels(pixels),
      clearPreviewPixels: () => app.canvasInteraction.clearPreviewPixels(),

      /* layer / object / variant / frame */
      moveLayerPixels: (dx: number, dy: number) =>
        app.layers.moveLayerPixels(dx, dy),
      setObjectOrigin: (id: string, origin: { x: number; y: number }) =>
        app.objects.setObjectOrigin(id, origin),
      setVariantOffset: (dx: number, dy: number, allFrames?: boolean) =>
        app.variants.setVariantOffset(dx, dy, allFrames),
      deleteSelectedFrame: () => app.frames.deleteSelectedFrame(),
      selectFrame: (id: string, syncVariants?: boolean) =>
        app.timelineUI.selectFrame(id, syncVariants),
      advanceVariantFrames: (delta: number) =>
        app.timelineUI.advanceVariantFrames(delta),

      /* the coupled write — see the note above. */
      startDrawing: (point: Point) => {
        app.canvasInteraction.startDrawing(point);
        app.clearColorAdjustment();
      },
    }),
    [app],
  );

  /* ── geometry (concern #2) ─────────────────────────────────────────────── */
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
  const isEditingVariantResolved = Boolean(editingVariant && variantData);
  // Memoised on its two SCALARS, not on `variantData.offset`'s identity: the
  // computed rebuilds the offset object on every read, so an unmemoised value
  // here would invalidate `render`, `traceSpace` and the geometry on every
  // render — which is precisely what `variantOffsetKey` exists to avoid.
  const rawOffsetX = editingVariant && variantData ? variantData.offset.x : 0;
  const rawOffsetY = editingVariant && variantData ? variantData.offset.y : 0;
  const variantOffset = useMemo(
    () => ({ x: rawOffsetX, y: rawOffsetY }),
    [rawOffsetX, rawOffsetY],
  );

  const geom = useCanvasGeometry({
    objWidth,
    objHeight,
    gridWidth,
    gridHeight,
    editingVariant: isEditingVariantResolved,
    variantOffset,
    zoom,
    lightGridMode,
  });
  const {
    viewMinX,
    viewMinY,
    viewMaxX,
    viewMaxY,
    canvasWidth,
    canvasHeight,
    // `variantOffsetKey` is part of `useCanvasGeometry`'s contract but is not
    // destructured here: it existed to make the offset safe in a hand-written
    // dependency array, and `render`'s identity now carries that signal (see
    // the `useCanvasRender` call below). It stays on the hook because the
    // lighting canvas — task 33 — has the same hand-written-deps problem.
    bgCacheKey,
    coordGeomRef,
    bgGeomRef,
  } = geom;

  /* ── the viewport engine ───────────────────────────────────────────────── */
  //
  // `onCommitPan` is what gives this canvas the trailing pan commit that
  // `LightingCanvas`'s copy deliberately lacks — the single real functional
  // difference between the two engines, expressed by supplying the callback
  // here and omitting it there.
  const {
    viewZoom,
    viewPanOffset,
    setViewPanOffset,
    setViewZoom,
    viewPanRef,
    scheduleCommitPan,
    clampPanToViewport,
    // ⚠️ `beginPinch` / `updatePinch` / `endPinch` are deliberately NOT taken
    // here any more: the hook binds them itself, natively and non-passively,
    // on the viewport. `isPinching` is still read, to suppress drawing while
    // a two-finger gesture is in flight.
    isPinching,
  } = useCanvasViewport({
    containerRef,
    canvasWidth,
    canvasHeight,
    panOffset,
    onCommitPan: (pan) => viewport.setPanOffset(pan),
    // The view scale is PROJECT state as of 2026-08-28, so it follows the
    // project across devices exactly as `panOffset` always has.
    viewZoom: viewport.viewZoom,
    onCommitViewZoom: (z) => viewport.setViewZoom(z),
    resyncKey: `${app.timelineUI.selectedObjectId ?? ""}|${
      app.timelineUI.selectedFrameId ?? ""
    }|${app.ui.lightingUI?.studioMode ?? ""}`,
  });

  /* ── coordinate mapping (concern #4) ───────────────────────────────────── */
  //
  // Both read `coordGeomRef.current`, so both are stable across renders — an
  // EMPTY dependency array. That is load-bearing: a handler rebuilt on every
  // render would be re-attached mid-drag.
  const getPixelCoords = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "pixel",
      );
    },
    [coordGeomRef],
  );

  /** Origin coords, snapped to the nearest half-pixel. */
  const getOriginCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "origin",
      );
    },
    [coordGeomRef],
  );

  /* ── the offscreen caches (concern #3) ─────────────────────────────────── */
  const ensureBgCanvas = useCallback(() => {
    if (bgCacheKeyRef.current === bgCacheKey && bgCanvasRef.current) {
      return bgCanvasRef.current;
    }
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement("canvas");
    }
    const bgCanvas = bgCanvasRef.current;
    bgCanvas.width = canvasWidth;
    bgCanvas.height = canvasHeight;
    const bgCtx = bgCanvas.getContext("2d");
    if (!bgCtx) return bgCanvas;

    const imageData = bgCtx.createImageData(canvasWidth, canvasHeight);
    paintCheckerboard(
      imageData,
      bgGeomRef.current,
      backgroundTheme(lightGridMode),
    );
    bgCtx.putImageData(imageData, 0, 0);

    bgCacheKeyRef.current = bgCacheKey;
    return bgCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, lightGridMode, bgGeomRef]);

  const ensureGridCanvas = useCallback(() => {
    if (gridCacheKeyRef.current === bgCacheKey && gridCanvasRef.current) {
      return gridCanvasRef.current;
    }
    if (!gridCanvasRef.current) {
      gridCanvasRef.current = document.createElement("canvas");
    }
    const gridCanvas = gridCanvasRef.current;
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    const gridCtx = gridCanvas.getContext("2d");
    if (!gridCtx) return gridCanvas;

    gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    strokeGrid(gridCtx, bgGeomRef.current, backgroundTheme(lightGridMode));

    gridCacheKeyRef.current = bgCacheKey;
    return gridCanvas;
  }, [bgCacheKey, canvasWidth, canvasHeight, lightGridMode, bgGeomRef]);

  /* ── the main render (concern #6) ──────────────────────────────────────── */
  //
  // ⚠️ Moved VERBATIM from `Canvas.tsx:388-755`, including its `fillRect`
  // loops. It is deliberately NOT swapped onto `ui/canvas/render/renderScene`,
  // which task 30 extracted and hash-tested but never adopted: `renderScene`
  // is a BUFFER renderer that composites into `ImageData`, and swapping a
  // `fillRect` path for an alpha-composited buffer path is a VISIBLE change to
  // every semi-transparent pixel in variant-edit mode. That belongs to a task
  // with an owner-reviewed visual diff, not to a decomposition. Recorded in
  // the task 32 report.
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !frame || !obj) return;

    ctx.imageSmoothingEnabled = false;

    const bgCanvas = ensureBgCanvas();
    ctx.drawImage(bgCanvas, 0, 0);

    // The move tool's live preview: the layers `moveLayerPixels` WOULD shift
    // are drawn displaced by `moveDragOffset`, and cells displaced off the
    // grid are simply not drawn — which is what the eventual commit does too.
    const moveDx = isDraggingPixels ? moveDragOffset.dx : 0;
    const moveDy = isDraggingPixels ? moveDragOffset.dy : 0;
    const movesWithDrag = (l: { id: string }) =>
      (moveDx !== 0 || moveDy !== 0) &&
      (tool.moveAllLayers || l.id === layer?.id);

    // In variant-edit mode, translate so world (viewMinX, viewMinY) lands at
    // canvas (0,0) — the whole variant area stays visible.
    if (isEditingVariantResolved) {
      ctx.save();
      ctx.translate(-viewMinX * zoom, -viewMinY * zoom);
    }

    if (isEditingVariantResolved && variantData) {
      for (const l of frame.layers) {
        if (!l.visible) continue;

        if (l.isVariant && l.variantGroupId) {
          const vg = app.domain.variants?.find(
            (g) => g.id === l.variantGroupId,
          );
          const variant = vg?.variants.find(
            (v) => v.id === l.selectedVariantId,
          );
          const variantFrameIdx =
            app.timelineUI.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

          if (variant && vFrame) {
            const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);
            const isCurrentLayer = l.id === layer?.id;
            // In variant-edit mode `moveLayerPixels` shifts the VARIANT's
            // frame layers, clipped to the variant grid.
            const vdx = isCurrentLayer ? moveDx : 0;
            const vdy = isCurrentLayer ? moveDy : 0;

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = getPixelColor(row[x]);
                  if (pixel && pixel.a > 0) {
                    const sx = x + vdx;
                    const sy = y + vdy;
                    if (
                      sx < 0 ||
                      sx >= variant.gridSize.width ||
                      sy < 0 ||
                      sy >= variant.gridSize.height
                    ) {
                      continue;
                    }
                    const drawX = (sx + vOffset.x) * zoom;
                    const drawY = (sy + vOffset.y) * zoom;
                    const worldX = sx + vOffset.x;
                    const worldY = sy + vOffset.y;
                    const inView =
                      worldX >= viewMinX &&
                      worldX < viewMaxX &&
                      worldY >= viewMinY &&
                      worldY < viewMaxY;
                    if (inView) {
                      // Non-edited variant layers follow the focus-mode
                      // setting; the edited layer always reads at full alpha.
                      if (
                        !isCurrentLayer &&
                        layerFocusMode === "onion" &&
                        !isOutlineCell(
                          vl.pixels,
                          x,
                          y,
                          variant.gridSize.width,
                          variant.gridSize.height,
                        )
                      ) {
                        continue;
                      }
                      const alpha =
                        isCurrentLayer || layerFocusMode === "normal"
                          ? pixel.a / 255
                          : (pixel.a / 255) * 0.7;
                      ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${alpha})`;
                      ctx.fillRect(drawX, drawY, zoom, zoom);
                    }
                  }
                }
              }
            }
          }
        } else {
          // A regular layer while a variant is being edited, rendered per the
          // focus-mode setting (normal / transparent dim / onion outline).
          const alphaMul = layerFocusMode === "normal" ? 1 : 0.5;
          const ldx = movesWithDrag(l) ? moveDx : 0;
          const ldy = movesWithDrag(l) ? moveDy : 0;
          for (let y = 0; y < objHeight; y++) {
            const row = l.pixels[y];
            if (!row) continue;

            for (let x = 0; x < objWidth; x++) {
              const pixel = getPixelColor(row[x]);
              if (pixel && pixel.a > 0) {
                if (
                  layerFocusMode === "onion" &&
                  !isOutlineCell(l.pixels, x, y, objWidth, objHeight)
                ) {
                  continue;
                }
                const sx = x + ldx;
                const sy = y + ldy;
                if (sx < 0 || sx >= objWidth || sy < 0 || sy >= objHeight) {
                  continue;
                }
                ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${(pixel.a / 255) * alphaMul})`;
                ctx.fillRect(sx * zoom, sy * zoom, zoom, zoom);
              }
            }
          }
        }
      }

      if (previewPixels.length > 0) {
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${(currentColor.a / 255) * 0.6})`;
        for (const { x, y } of previewPixels) {
          if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            ctx.fillRect(
              (x + variantOffset.x) * zoom,
              (y + variantOffset.y) * zoom,
              zoom,
              zoom,
            );
          }
        }
      }

      // Grid lines over the variant edit area only.
      ctx.strokeStyle = WHITE_08;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= gridWidth; x++) {
        const px = (variantOffset.x + x) * zoom + 0.5;
        ctx.moveTo(px, variantOffset.y * zoom);
        ctx.lineTo(px, (variantOffset.y + gridHeight) * zoom);
      }
      for (let y = 0; y <= gridHeight; y++) {
        const py = (variantOffset.y + y) * zoom + 0.5;
        ctx.moveTo(variantOffset.x * zoom, py);
        ctx.lineTo((variantOffset.x + gridWidth) * zoom, py);
      }
      ctx.stroke();

      // Object bounds.
      ctx.strokeStyle = WARN_ORANGE_40;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, objWidth * zoom, objHeight * zoom);
      ctx.setLineDash([]);

      // The variant editing area.
      ctx.strokeStyle = ACCENT_VARIANT;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        variantOffset.x * zoom,
        variantOffset.y * zoom,
        gridWidth * zoom,
        gridHeight * zoom,
      );
    } else {
      const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

      for (const l of frame.layers) {
        if (!l.visible) continue;

        if (l.isVariant && l.variantGroupId) {
          const vg = app.domain.variants?.find(
            (g) => g.id === l.variantGroupId,
          );
          const variant = vg?.variants.find(
            (v) => v.id === l.selectedVariantId,
          );
          const variantFrameIdx =
            app.timelineUI.variantFrameIndices?.[l.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          if (variant && vFrame) {
            const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);

            for (const vl of vFrame.layers) {
              if (!vl.visible) continue;

              for (let y = 0; y < variant.gridSize.height; y++) {
                const row = vl.pixels[y];
                if (!row) continue;

                for (let x = 0; x < variant.gridSize.width; x++) {
                  const pixel = getPixelColor(row[x]);
                  if (pixel && pixel.a > 0) {
                    const drawX = (x + vOffset.x) * zoom;
                    const drawY = (y + vOffset.y) * zoom;
                    if (
                      drawX >= 0 &&
                      drawX < canvasWidth &&
                      drawY >= 0 &&
                      drawY < canvasHeight
                    ) {
                      ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
                      ctx.fillRect(drawX, drawY, zoom, zoom);
                    }
                  }
                }
              }
            }
          }
        } else {
          const ldx = movesWithDrag(l) ? moveDx : 0;
          const ldy = movesWithDrag(l) ? moveDy : 0;
          for (let y = 0; y < gridHeight; y++) {
            const row = l.pixels[y];
            if (!row) continue;

            for (let x = 0; x < gridWidth; x++) {
              const pixel = getPixelColor(row[x]);
              if (pixel && pixel.a > 0) {
                const sx = x + ldx;
                const sy = y + ldy;
                if (sx < 0 || sx >= gridWidth || sy < 0 || sy >= gridHeight) {
                  continue;
                }
                ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
                ctx.fillRect(sx * zoom, sy * zoom, zoom, zoom);
              }
            }
          }
        }
      }

      if (previewPixels.length > 0) {
        ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${(currentColor.a / 255) * 0.6})`;
        for (const { x, y } of previewPixels) {
          if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }

      const gridCanvas = ensureGridCanvas();
      ctx.drawImage(gridCanvas, 0, 0);
    }

    const offsetX = isEditingVariantResolved ? variantOffset.x : 0;
    const offsetY = isEditingVariantResolved ? variantOffset.y : 0;
    const dragDx =
      isDraggingSelection && selectionDragMode === "pixels"
        ? pixelDragOffset.dx
        : 0;
    const dragDy =
      isDraggingSelection && selectionDragMode === "pixels"
        ? pixelDragOffset.dy
        : 0;

    // Selection mask fill (finalized selections only).
    if (
      selection &&
      !previewSelection &&
      selection.width === gridWidth &&
      selection.height === gridHeight
    ) {
      // Skipped above 20,000 cells — on the owner's real project a select-all
      // is 300,249 and painting it per frame would stall the drag.
      if (selection.mask.size <= 20000) {
        ctx.fillStyle = ACCENT_PRIMARY_14;
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect(
            (x + offsetX + dragDx) * zoom,
            (y + offsetY + dragDy) * zoom,
            zoom,
            zoom,
          );
        }
      }
    }

    // A NON-DESTRUCTIVE preview while dragging "move pixels"; the real move is
    // committed on pointer-up.
    if (
      isDraggingSelection &&
      selectionDragMode === "pixels" &&
      selection &&
      (dragDx !== 0 || dragDy !== 0) &&
      selection.width === gridWidth &&
      selection.height === gridHeight
    ) {
      const srcPixels = isEditingVariantResolved
        ? variantData?.variantFrame.layers[0]?.pixels
        : layer?.pixels;

      if (srcPixels && selection.mask.size <= 20000) {
        ctx.fillStyle = BLACK_12;
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect((x + offsetX) * zoom, (y + offsetY) * zoom, zoom, zoom);
        }

        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          const destX = x + dragDx;
          const destY = y + dragDy;
          if (
            destX < 0 ||
            destX >= gridWidth ||
            destY < 0 ||
            destY >= gridHeight
          )
            continue;
          const pixel = getPixelColor(srcPixels[y]?.[x]);
          if (!pixel || pixel.a === 0) continue;
          ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
          ctx.fillRect(
            (destX + offsetX) * zoom,
            (destY + offsetY) * zoom,
            zoom,
            zoom,
          );
        }
      }
    }

    if (isLassoSelecting) {
      drawLasso(ctx, lassoPoints, zoom, offsetX, offsetY);
    }

    const selBox = previewSelection || selection?.bounds;
    if (selBox) {
      drawMarchingAnts(ctx, selBox, zoom, offsetX, offsetY, dragDx, dragDy);
    }

    // The origin cross shows only while the origin tool is selected.
    const originPos = obj.origin;
    if (originPos && currentTool === "origin") {
      drawOriginCross(
        ctx,
        originPos,
        zoom,
        tool.originColor ?? { r: 255, g: 50, b: 50, a: 255 },
      );
    }

    if (isEditingVariantResolved) {
      ctx.restore();
    }
  }, [
    app.domain,
    app.timelineUI,
    frame,
    obj,
    layer,
    previewPixels,
    currentColor,
    zoom,
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    canvasWidth,
    canvasHeight,
    ensureBgCanvas,
    ensureGridCanvas,
    selection,
    previewSelection,
    isEditingVariantResolved,
    variantData,
    variantOffset,
    layerFocusMode,
    viewMinX,
    viewMinY,
    viewMaxX,
    viewMaxY,
    currentTool,
    tool.originColor,
    isDraggingSelection,
    selectionDragMode,
    pixelDragOffset.dx,
    pixelDragOffset.dy,
    isDraggingPixels,
    moveDragOffset.dx,
    moveDragOffset.dy,
    tool.moveAllLayers,
    isLassoSelecting,
    lassoPoints,
  ]);

  /* ── the hover marker (concern #12) ────────────────────────────────────── */
  //
  // ══════════════════════════════════════════════════════════════════════
  //  WHY THIS IS A SEPARATE CANVAS AND A SEPARATE SCHEDULER
  // ══════════════════════════════════════════════════════════════════════
  //
  // `render` above repaints every visible cell of every visible layer with
  // `fillRect`. An Apple Pencil emits hover samples continuously while the
  // user's hand is merely NEAR the glass — before anything is drawn, and
  // whether or not it ever touches down. Feeding those samples into `render`
  // would re-rasterise the whole sprite at pointer rate for a hand that is not
  // even drawing. So the marker owns `hoverCanvasRef` and its own
  // `useCanvasRender`, exactly as the lighting studio's brush overlay owns
  // its own (task 33): two surfaces, two invalidation signals.
  //
  // ── Why `useState`, when every other gesture value here is a ref ────────
  //
  // ══════════════════════════════════════════════════════════════════════
  //  ⚠️ A REF, NOT `useState` — AND THAT IS LOAD-BEARING FOR DRAWING
  // ══════════════════════════════════════════════════════════════════════
  //
  // This was `useState` when the marker only followed the MOUSE, where it is
  // harmless: the mouse path clears the marker to a stable `null` while a
  // stroke is in flight, so it sets state at most once per gesture.
  //
  // Tracking it during a TOUCH stroke changed that. `handleTouchMove` runs
  // per pointer sample, so a state setter there re-rendered this container in
  // the middle of a live gesture — rebuilding `getToolContext`, the tool
  // handlers, and `pointer` between the touches of a single slide. Drawing
  // became unreliable exactly while sliding: the observed 2026-08-28 report
  // was "unable to slide and draw".
  //
  // A ref plus an explicit `invalidate()` gives the overlay what it actually
  // needs — a repaint — without telling React anything happened. This is the
  // same discipline the rest of this file already follows for gesture state,
  // and the same reason `layer.pixels` is `observable.ref`: the canvas is
  // driven imperatively, and putting per-sample data through React's render
  // cycle is the modelling error, not a performance detail.
  const hoverPixelRef = useRef<Point | null>(null);

  /**
   * Set the hovered cell and repaint the overlay, ignoring a sample that
   * lands on the cell already marked.
   *
   * The dedupe still matters: it keeps a 120 Hz pointer stream from
   * scheduling a canvas frame for a marker that has not moved. What it no
   * longer does is gate a React render, because there is not one.
   *
   * `invalidateHoverRef` is filled in below, once the scheduler exists — the
   * renderer has to be declared before it can be scheduled, and this setter
   * has to exist before the handlers that call it.
   */
  const invalidateHoverRef = useRef<(() => void) | null>(null);
  const setHoverPixel = useCallback((next: Point | null) => {
    const prev = hoverPixelRef.current;
    if (prev === next) return;
    if (prev && next && prev.x === next.x && prev.y === next.y) return;
    hoverPixelRef.current = next;
    invalidateHoverRef.current?.();
  }, []);

  /**
   * Apply `markerPolicy`'s decision for one event.
   *
   * ⚠️ Every marker write goes through here. The rule is asymmetric by device
   * and has already shipped wrong once — the touch path cleared on start and
   * end but never SET on move, so the marker was permanently null during a
   * touch stroke. Routing all four call sites through one policy function
   * makes that decision unit-testable (`markerPolicy.test.ts`) instead of
   * being spread across handlers that need a canvas and a store to exercise.
   */
  const applyMarker = useCallback(
    (
      device: "mouse" | "touch" | "pencil-hover",
      phase: "start" | "move" | "end",
      locate: () => Point | null,
    ) => {
      switch (markerAction({ device, phase, isDrawing })) {
        case "track":
          setHoverPixel(locate());
          break;
        case "clear":
          setHoverPixel(null);
          break;
        case "ignore":
          break;
      }
    },
    [isDrawing, setHoverPixel],
  );

  /**
   * The cells the active tool would edit at `hoverPixel`.
   *
   * ⚠️ This does NOT read the pixel grid, and must not start to. The lighting
   * studio's `resolveBrushCells` filters to cells that already hold a colour,
   * because a normal-map brush only has meaning over existing artwork. The
   * pixel canvas has no such restriction — a pencil paints empty cells, which
   * is most of what it does — and reading `layer.pixels` here would put a
   * 300k-cell grid on the hover path (R2).
   */
  // ⚠️ A CALLBACK, not a `useMemo` on `hoverPixel`. The hovered cell lives in
  // a ref now (see above), so there is no render to memoise against — the
  // renderer calls this when it paints, and reads the ref's CURRENT value.
  const resolveHoverCells = useCallback((): StampPoint[] => {
    const center = hoverPixelRef.current;
    if (!center || !layer) return [];
    return toolFootprint(center, {
      tool: currentTool,
      brushSize,
      pencilShape: pencilBrushShape,
      eraserShape,
      circle: getCirclePixels,
      square: getSquarePixels,
      gridWidth,
      gridHeight,
    });
  }, [
    layer,
    currentTool,
    brushSize,
    pencilBrushShape,
    eraserShape,
    gridWidth,
    gridHeight,
  ]);

  const renderHover = useCallback(() => {
    const canvas = hoverCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const hoverCells = resolveHoverCells();
    if (hoverCells.length === 0) return;

    ctx.imageSmoothingEnabled = false;

    // The marker shares the main render's coordinate space, so it needs the
    // same variant-edit translation: while a variant is being edited the grid
    // is drawn at the variant's offset within an expanded view, and a marker
    // painted at raw cell coordinates would sit that offset away from the
    // cells the stroke will actually hit.
    const offsetX = isEditingVariantResolved ? variantOffset.x - viewMinX : 0;
    const offsetY = isEditingVariantResolved ? variantOffset.y - viewMinY : 0;
    const placed =
      offsetX === 0 && offsetY === 0
        ? hoverCells
        : hoverCells.map((c) => ({ x: c.x + offsetX, y: c.y + offsetY }));

    // Buffer for the fill, strokes for the outline — the split
    // `renderHoverMarker` documents. `createImageData` allocates per frame, as
    // the lighting overlay does; the marker repaints only when the hovered
    // CELL changes, so this is not a per-sample cost.
    const buffer = ctx.createImageData(canvasWidth, canvasHeight);
    paintHoverCells(buffer, placed, zoom);
    ctx.putImageData(buffer, 0, 0);
    strokeHoverOutline(ctx, placed, zoom);
  }, [
    canvasWidth,
    canvasHeight,
    resolveHoverCells,
    zoom,
    isEditingVariantResolved,
    variantOffset,
    viewMinX,
    viewMinY,
  ]);

  // The scheduler repaints when any of `renderHover`'s inputs change — a tool
  // or brush-size switch, a zoom, a variant-edit toggle. Pointer movement does
  // NOT go through here: it writes the ref and calls `invalidate` directly,
  // which is the whole point of the ref (see `hoverPixelRef`).
  const { invalidate: invalidateHover } = useCanvasRender(renderHover, [
    renderHover,
  ]);
  // Deliberate render-phase write, same pattern as `useCanvasRender`'s own
  // `renderRef`: `setHoverPixel` is created before the scheduler exists, so it
  // reaches the current `invalidate` through this ref rather than by closing
  // over one that would go stale.
  invalidateHoverRef.current = invalidateHover;

  /**
   * Bridged Apple Pencil hover (iPad companion app only).
   *
   * The samples arrive in CLIENT coordinates, which is exactly what
   * `getPixelCoords` takes — so the pencil and the mouse converge on one
   * mapping and cannot disagree about which cell is under the pointer.
   *
   * ⚠️ Suppressed while a stroke is in flight, and this is what keeps ONE
   * writer on the marker at a time. A pencil that has touched down keeps
   * reporting hover samples, so without the guard two sources would drive the
   * marker at once during a stroke: these samples (tracking the tip in the
   * air) and `handleTouchMove` (tracking the contact point). They disagree
   * whenever the pencil is tilted, which would show as a marker jittering
   * between two cells. During a stroke the touch handlers own the marker —
   * `handleTouchMove` sets it, `handleMouseMove` clears it — and hover
   * resumes on the first sample after the stroke ends.
   */
  usePencilHover(
    useCallback(
      (sample) => {
        applyMarker("pencil-hover", sample ? "move" : "end", () =>
          sample ? getPixelCoords(sample.x, sample.y) : null,
        );
      },
      [applyMarker, getPixelCoords],
    ),
  );

  /* ── the reference-trace overlay (concern #7) ──────────────────────────── */
  const isReferenceTraceActive =
    currentTool === "reference-trace" && referenceImage != null;

  const frameRefObj = useMemo(() => {
    const id = referenceUI.frameReferenceObjectId;
    if (!id) return obj;
    return app.domain.objects?.find((o) => o.id === id) ?? obj;
  }, [referenceUI.frameReferenceObjectId, app.domain.objects, obj]);

  const overlayFrame =
    overlayFrameIndex !== null && overlayFrameIndex !== undefined && frameRefObj
      ? frameRefObj.frames[overlayFrameIndex]
      : null;

  const frameTraceFrame =
    frameTraceActive && frameTraceFrameIndex !== null && frameRefObj
      ? frameRefObj.frames[frameTraceFrameIndex]
      : null;

  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !referenceImage || !isReferenceTraceActive) {
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // In variant-edit mode the overlay shares the expanded view, so it draws
    // in view space (world − viewMin).
    const ox = isEditingVariantResolved ? viewMinX : 0;
    const oy = isEditingVariantResolved ? viewMinY : 0;

    ctx.globalAlpha = 0.5;
    for (let y = 0; y < referenceImage.height; y++) {
      const row = referenceImage.pixels[y];
      if (!row) continue;
      for (let x = 0; x < referenceImage.width; x++) {
        const pixel = row[x];
        if (pixel && pixel.a > 0) {
          const drawX = (x + referenceOverlayOffset.x - ox) * zoom;
          const drawY = (y + referenceOverlayOffset.y - oy) * zoom;
          if (
            drawX >= 0 &&
            drawX < canvasWidth &&
            drawY >= 0 &&
            drawY < canvasHeight
          ) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(drawX, drawY, zoom, zoom);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = WARN_ORANGE_60;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      (referenceOverlayOffset.x - ox) * zoom,
      (referenceOverlayOffset.y - oy) * zoom,
      referenceImage.width * zoom,
      referenceImage.height * zoom,
    );
    ctx.setLineDash([]);
  }, [
    referenceImage,
    isReferenceTraceActive,
    canvasWidth,
    canvasHeight,
    zoom,
    referenceOverlayOffset,
    isEditingVariantResolved,
    viewMinX,
    viewMinY,
  ]);

  /* ── the two frame overlays (concerns #8 and #9) ───────────────────────── */
  //
  // These were ~200 lines of near-duplicate code. Both now call ONE
  // parameterised buffer renderer (`ui/canvas/render/renderFrameOverlay`),
  // which documents the six ways they genuinely differ.
  const drawOverlayCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      overlaySourceFrame: { id: string; layers: Layer[] } | null | undefined,
      mode: typeof FRAME_OVERLAY_MODE | typeof FRAME_TRACE_MODE,
      drawOffset: { x: number; y: number },
      active: boolean,
    ) => {
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !overlaySourceFrame || !frameRefObj || !active) {
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const refObjWidth = frameRefObj.gridSize.width;
      const refObjHeight = frameRefObj.gridSize.height;

      const ox = isEditingVariantResolved ? viewMinX : 0;
      const oy = isEditingVariantResolved ? viewMinY : 0;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      const frameIndex = frameRefObj.frames.findIndex(
        (f) => f.id === overlaySourceFrame.id,
      );
      const variants = app.domain.variants;
      const variantFrameIndices = overlayVariantFrameIndices(
        variants,
        frameIndex,
      );

      // `createImageData` is already zero-filled — the original's explicit
      // transparent-fill loop was redundant.
      const imageData = tempCtx.createImageData(canvasWidth, canvasHeight);

      renderFrameOverlayBuffer(imageData, {
        layers: overlaySourceFrame.layers,
        refObjWidth,
        refObjHeight,
        zoom,
        ox,
        oy,
        variants,
        variantFrameIndices,
        frameIndex,
        getPixelColor,
        composite: mode.composite,
        clipToObject: mode.clipToObject,
        cellFill: mode.cellFill,
        renderOrphanVariantLayers: mode.renderOrphanVariantLayers,
      });

      tempCtx.putImageData(imageData, 0, 0);

      const drawX = (drawOffset.x - ox) * zoom;
      const drawY = (drawOffset.y - oy) * zoom;

      ctx.globalAlpha = mode.opacity;
      ctx.drawImage(tempCanvas, drawX, drawY);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = mode.borderColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([...mode.borderDash]);
      ctx.strokeRect(drawX, drawY, refObjWidth * zoom, refObjHeight * zoom);
      ctx.setLineDash([]);
    },
    [
      app.domain,
      canvasWidth,
      canvasHeight,
      zoom,
      frameRefObj,
      isEditingVariantResolved,
      viewMinX,
      viewMinY,
    ],
  );

  const renderFrameOverlay = useCallback(() => {
    drawOverlayCanvas(
      frameOverlayCanvasRef.current,
      overlayFrame,
      FRAME_OVERLAY_MODE,
      // #8 draws at the origin — it does NOT honour `frameOverlayOffset`.
      { x: 0, y: 0 },
      Boolean(overlayFrame),
    );
  }, [drawOverlayCanvas, overlayFrame]);

  const renderFrameTraceOverlay = useCallback(() => {
    drawOverlayCanvas(
      frameTraceOverlayCanvasRef.current,
      frameTraceFrame,
      FRAME_TRACE_MODE,
      // #9 DOES honour the user-nudgeable trace offset.
      frameOverlayOffset,
      Boolean(frameTraceFrame && frameTraceActive),
    );
  }, [
    drawOverlayCanvas,
    frameTraceFrame,
    frameTraceActive,
    frameOverlayOffset,
  ]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay, referenceOverlayOffset, isReferenceTraceActive]);

  useEffect(() => {
    renderFrameTraceOverlay();
  }, [renderFrameTraceOverlay]);

  useEffect(() => {
    renderFrameOverlay();
  }, [renderFrameOverlay, overlayFrameIndex]);

  /* ── the rAF-coalesced main render ─────────────────────────────────────── */
  //
  // ⚠️ THE DEPENDENCY LIST IS THE INVALIDATION SIGNAL.
  //
  // `render` is a `useCallback` whose own dependency list already names every
  // value it reads, so its IDENTITY is the complete "the drawing would differ"
  // signal. The legacy `Canvas.tsx` could not use that — its `render` closed
  // over the whole Zustand `project`, so the identity changed on every
  // mutation of any kind and it had to re-list 19 members by hand to stay
  // sane.
  //
  // `pixelVersion` is the one member `render`'s identity does NOT cover, and
  // it is the crux of R2: pixel CONTENT changes without any observed
  // reference changing, because `layer.pixels` is `observableRef` precisely so
  // MobX never looks inside a 300,249-cell grid. `PixelStore` bumps this
  // counter once per committed mutation, and the counter is what is observed.
  //
  // Two entries, not nineteen — and listing `render`'s inputs again alongside
  // `render` would be redundant, not safer: the rAF scheduler cancels any
  // pending frame before requesting a new one, so a redundant dependency buys
  // an extra cancel/reschedule inside the same frame and never a second paint.
  useCanvasRender(render, [render, pixelVersion]);

  // Clear a selection whose grid no longer matches — prevents a stale mask
  // surviving a mode switch.
  useEffect(() => {
    if (
      selection &&
      (selection.width !== gridWidth || selection.height !== gridHeight)
    ) {
      actions.clearSelection();
    }
  }, [selection, gridWidth, gridHeight, actions]);

  /* ── keyboard (concern #11) ────────────────────────────────────────────── */
  //
  // ⚠️ `useCapture = true` inside the hook is LOAD-BEARING and preserved: the
  // canvas must see WASD and the arrows before anything else does. W23 added
  // the dialog guard that stops it swallowing Escape from an open modal.
  useCanvasKeyboard({
    currentTool,
    hasSelection: Boolean(selection),
    selectionBehavior,
    isReferenceTraceActive,
    frameTraceActive,
    editingVariant: Boolean(editingVariant),
    traceNudgeAmount,
    borderRadius,
    undo: () => app.undo(),
    deleteSelectionPixels: actions.deleteSelectionPixels,
    deleteSelectedFrame: actions.deleteSelectedFrame,
    setTool: (t) => app.ui.tool.setTool(t),
    clearSelection: actions.clearSelection,
    // ── W29e: the three overlay actions route to their MobX OWNER ───────
    //
    // `ReferenceUIStore` owns `overlayOffset`, `frameOverlayOffset`,
    // `frameTraceActive` and `frameTraceFrameIndex`; this container READS all
    // four off it (lines ~298-300). But the legacy `referenceActions` write
    // only the Zustand copies and are NOT bridge delegates — the four fields
    // appear in neither phase list, so nothing carries a legacy write across.
    //
    // Measured W29e: with the bridge installed,
    // `dispatch("setFrameTraceActive", true, 2)` left
    // `app.referenceUI.frameTraceActive === false`, so the keyboard shortcut
    // moved an overlay this component never re-read. `FrameReferencePanel-
    // Container` already calls `referenceUI.setFrameTraceActive` directly, so
    // the two entry points had drifted onto different stores.
    //
    // Read and write now agree on one owner.
    moveReferenceOverlay: (dx, dy) => referenceUI.moveOverlay(dx, dy),
    moveFrameOverlay: (dx, dy) => referenceUI.moveFrameOverlay(dx, dy),
    setVariantOffset: actions.setVariantOffset,
    setBorderRadius: (r) => app.ui.tool.setBorderRadius(r),
    moveSelection: actions.moveSelection,
    moveSelectedPixels: actions.moveSelectedPixels,
    moveLayerPixels: actions.moveLayerPixels,
    setFrameTraceActive: (active, frameIndex) =>
      referenceUI.setFrameTraceActive(active, frameIndex),
    stepFrame: (delta) => {
      const currentObj = app.currentObject;
      if (!currentObj || currentObj.frames.length <= 1) return;
      const currentIndex = currentObj.frames.findIndex(
        (f) => f.id === app.timelineUI.selectedFrameId,
      );
      if (currentIndex === -1) return;
      const count = currentObj.frames.length;
      const newIndex = (currentIndex + delta + count) % count;
      // Variants advance INDEPENDENTLY of base frames here, same as playback.
      actions.selectFrame(currentObj.frames[newIndex].id, false);
      actions.advanceVariantFrames(delta);
    },
  });

  /* ── the two trace samplers ────────────────────────────────────────────── */
  const getRefPixelAtCoord = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!referenceImage) return null;
      const refX = canvasX - referenceOverlayOffset.x;
      const refY = canvasY - referenceOverlayOffset.y;
      if (
        refX < 0 ||
        refX >= referenceImage.width ||
        refY < 0 ||
        refY >= referenceImage.height
      ) {
        return null;
      }
      return referenceImage.pixels[refY]?.[refX] ?? 0;
    },
    [referenceImage, referenceOverlayOffset],
  );

  const getFrameTracePixelAtCoord = useCallback(
    (canvasX: number, canvasY: number): Pixel | null => {
      if (!frameTraceFrame || !obj) return null;

      const frameX = canvasX - frameOverlayOffset.x;
      const frameY = canvasY - frameOverlayOffset.y;
      if (
        frameX < 0 ||
        frameX >= objWidth ||
        frameY < 0 ||
        frameY >= objHeight
      ) {
        return null;
      }

      const traceFrameIndex = obj.frames.findIndex(
        (f) => f.id === frameTraceFrame.id,
      );
      const variants = app.domain.variants;
      let variantFrameIndices: { [key: string]: number } | undefined;

      if (variants) {
        variantFrameIndices = {};
        for (const vg of variants) {
          const variant = vg.variants[0];
          if (variant && variant.frames.length > 0) {
            variantFrameIndices[vg.id] =
              traceFrameIndex % variant.frames.length;
          }
        }
      }

      // Top-down: layers render bottom-to-top, so sampling walks in reverse.
      for (
        let layerIdx = frameTraceFrame.layers.length - 1;
        layerIdx >= 0;
        layerIdx--
      ) {
        const traceLayer: Layer = frameTraceFrame.layers[layerIdx];
        if (!traceLayer.visible) continue;

        if (
          traceLayer.isVariant &&
          traceLayer.variantGroupId &&
          variants &&
          variantFrameIndices
        ) {
          const vg = variants.find((g) => g.id === traceLayer.variantGroupId);
          const variant = vg?.variants.find(
            (v) => v.id === traceLayer.selectedVariantId,
          );
          const variantFrameIdx =
            variantFrameIndices[traceLayer.variantGroupId] ?? 0;
          const vFrame =
            variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

          if (variant && vFrame) {
            const traceVariantOffset = resolveVariantOffset(
              traceLayer,
              variant,
              traceFrameIndex,
            );
            const vX = frameX - traceVariantOffset.x;
            const vY = frameY - traceVariantOffset.y;

            if (
              vX >= 0 &&
              vX < variant.gridSize.width &&
              vY >= 0 &&
              vY < variant.gridSize.height
            ) {
              for (let vlIdx = vFrame.layers.length - 1; vlIdx >= 0; vlIdx--) {
                const vl = vFrame.layers[vlIdx];
                if (!vl.visible) continue;
                const pixel = getPixelColor(vl.pixels[vY]?.[vX]);
                if (pixel && pixel.a > 0) return pixel;
              }
            }
          }
        } else {
          const pixel = getPixelColor(traceLayer.pixels[frameY]?.[frameX]);
          if (pixel && pixel.a > 0) return pixel;
        }
      }

      return null;
    },
    [frameTraceFrame, obj, objWidth, objHeight, frameOverlayOffset, app.domain],
  );

  /* ── the brush/trace inputs both devices share ─────────────────────────── */
  //
  // ONE assembly point. Both devices and both paint tools go through
  // `stampAt`/`stampSegment`, which ALWAYS bounds-filter — the Q44 / R10 fix:
  // the touch eraser used to skip the filter the mouse path applied.
  const brushStampOptions = useCallback(
    (shape: "circle" | "square") => ({
      gridWidth,
      gridHeight,
      brushSize,
      shape: shape === "circle" ? getCirclePixels : getSquarePixels,
      shapeColor: currentColor,
    }),
    [gridWidth, gridHeight, brushSize, currentColor],
  );

  const traceSpace = useMemo(
    () => ({
      editingVariant: isEditingVariantResolved,
      variantOffset,
    }),
    [isEditingVariantResolved, variantOffset],
  );

  /* ── the editable grid the fills sample ────────────────────────────────── */
  const editableGrid = useCallback((): PixelData[][] | null => {
    if (!layer) return null;
    if (isEditingVariantResolved && variantData) {
      return variantData.variantFrame.layers[0]?.pixels ?? layer.pixels;
    }
    return layer.pixels;
  }, [layer, isEditingVariantResolved, variantData]);

  /**
   * The stroke cursor — the last cell painted, or `null` between strokes.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THERE MUST BE EXACTLY ONE OF THESE, AND THIS IS IT
   * ══════════════════════════════════════════════════════════════════════
   *
   * `useCanvasPointer` also allocates a cursor ref internally and returns it.
   * Its own closures capture THAT one — notably the guard at
   * `useCanvasPointer.ts:139`, which nulls the cursor when the pointer leaves
   * the drawable area so a re-entry does not "bridge" a long line across the
   * sprite.
   *
   * If the container kept a SECOND ref for the tool handlers to read, the two
   * would diverge on exactly that path: the hook would clear its copy, the
   * handlers would keep reading the stale container copy, and the next move
   * would rasterise a line from wherever the pointer left to wherever it came
   * back — a visible, hard-to-reproduce drawing bug.
   *
   * So the container does NOT allocate one. It declares the binding here (so
   * `getToolContext` below is not reaching forward into a temporal dead zone)
   * and fills it from the hook's return value on the line after the hook call.
   * One ref, one writer set, one cursor.
   */
  const strokeCursor = useRef<{
    ref: React.MutableRefObject<StampPoint | null> | null;
  }>({ ref: null });

  /* ══ THE TOOL CONTEXT — the one place tool effects are bound ═══════════ */
  //
  // Assembled per event and handed to `toolHandlers` as-is. Every member is a
  // plain value or a plain callback, which is what keeps `ui/canvas/tools/`
  // free of any store import while still writing real pixels.
  const getToolContext = useCallback(
    (): ToolContext => ({
      gridWidth,
      gridHeight,
      brushSize,
      currentColor,
      pencilShape:
        pencilBrushShape === "circle" ? getCirclePixels : getSquarePixels,
      eraserShapeFn:
        eraserShape === "circle" ? getCirclePixels : getSquarePixels,
      line: getLinePixels,
      shapeMode,
      borderRadius,
      lastStrokePixel: strokeCursor.current.ref?.current ?? null,
      setLastStrokePixel: (p) => {
        const ref = strokeCursor.current.ref;
        if (ref) ref.current = p;
      },
      beginStroke: () => actions.beginStroke(),
      endDrawing: () => actions.endDrawing(),
      setPixels: (writes) => actions.setPixels(writes as never),
      setPreviewPixels: (points) => actions.setPreviewPixels(points),
      floodFillAt: (p) => {
        const grid = editableGrid();
        if (!grid) return [];
        return floodFill(
          grid,
          p.x,
          p.y,
          gridWidth,
          gridHeight,
          currentColor,
        ) as never;
      },
      gaussianFillAt: (p) => {
        const grid = editableGrid();
        if (!grid) return [];
        const gaussian = tool.gaussianFill ?? { smoothing: 1.0, radius: 2.0 };
        return gaussianFloodFill(
          grid,
          p.x,
          p.y,
          gridWidth,
          gridHeight,
          gaussian.smoothing,
          gaussian.radius,
          currentColor,
        ) as never;
      },
      squarePixelsAt: (p) =>
        getSquarePixels(p as Point, brushSize, currentColor) as never,
      rectanglePreview: (from, to) =>
        getRectanglePixels(from as Point, to as Point, shapeMode, borderRadius),
      ellipsePreview: (from, to) =>
        getEllipsePixels(from as Point, to as Point, shapeMode),
      linePreview: (from, to) => getLinePixels(from as Point, to as Point),
    }),
    [
      gridWidth,
      gridHeight,
      brushSize,
      currentColor,
      pencilBrushShape,
      eraserShape,
      shapeMode,
      borderRadius,
      editableGrid,
      tool.gaussianFill,
      actions,
    ],
  );

  /* ══ THE POINTER ENGINE — now WIRED (task 32) ═════════════════════════ */
  //
  // ⚠️ `useCanvasPointer` shipped in W23 but was NOT wired: the ~600 lines of
  // gesture arbitration below were inseparable from `Canvas.tsx`'s local
  // `useState` cluster, and W23 stopped at its scope boundary rather than
  // forcing it. `CanvasInteractionStore` is what made the wiring possible —
  // the hook needs `isDrawing`/`drawStartPoint` as VALUES and `startDrawing`
  // as a callback, which is exactly what a small transient store provides.
  //
  // The eight pixel-transform tools now dispatch through ONE code path for
  // both devices. Everything the hook does not claim is arbitrated before it
  // is consulted, in the order the legacy handlers used.
  const pointer = useCanvasPointer({
    currentTool,
    getToolContext,
    getCoords: getPixelCoords,
    startDrawing: (coords) => actions.startDrawing(coords as Point),
    isDrawing,
    drawStartPoint,
  });
  // Bind the ONE cursor: the tool handlers now read and write the very ref
  // the hook's re-entry guard clears. See `strokeCursor`'s comment above.
  strokeCursor.current.ref = pointer.lastStrokePixelRef;
  const lastStrokePixelRef = pointer.lastStrokePixelRef;

  /* ── mouse ─────────────────────────────────────────────────────────────── */
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle button, or alt+left, pans.
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (e.button !== 0) return;

    // The origin tool snaps to half-pixels and writes immediately.
    if (currentTool === "origin" && obj) {
      const originCoords = getOriginCoords(e.clientX, e.clientY);
      if (originCoords) actions.setObjectOrigin(obj.id, originCoords);
      return;
    }

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords || !layer) return;

    // ⚠️ THE TWO TRACE MODES TAKE PRECEDENCE OVER THE SELECTED TOOL. That is
    // why `toolHandlers` has an empty `reference-trace` entry: it is a MODE,
    // not a pointer tool, and the legacy handlers tested it before reading
    // `currentTool` too.
    if (isReferenceTraceActive) {
      actions.beginStroke();
      setIsTracing(true);
      lastStrokePixelRef.current = coords;
      const out = stampTrace(
        null,
        coords,
        getLinePixels,
        brushStampOptions(pencilBrushShape),
        traceSpace,
        getRefPixelAtCoord,
      );
      if (out.length > 0) actions.setPixels(out as never);
      return;
    }

    if (frameTraceActive) {
      actions.beginStroke();
      setIsTracing(true);
      lastStrokePixelRef.current = coords;
      const out = stampTrace(
        null,
        coords,
        getLinePixels,
        brushStampOptions(pencilBrushShape),
        traceSpace,
        getFrameTracePixelAtCoord,
      );
      if (out.length > 0) actions.setPixels(out as never);
      return;
    }

    // Eyedropper: first visible layer, top to bottom, then the reference image.
    if (currentTool === "eyedropper") {
      if (isEditingVariantResolved && variantData) {
        const variantLayer = variantData.variantFrame.layers[0];
        if (variantLayer) {
          const pixel = getPixelColor(
            variantLayer.pixels[coords.y]?.[coords.x],
          );
          if (pixel && pixel.a > 0) {
            app.setColorAndAddToHistory(pixel);
            app.ui.tool.revertToPreviousTool();
            return;
          }
        }
      }

      if (frame && !isEditingVariantResolved) {
        for (let i = frame.layers.length - 1; i >= 0; i--) {
          const l = frame.layers[i];
          if (!l.visible) continue;
          const pixel = getPixelColor(l.pixels[coords.y]?.[coords.x]);
          if (pixel && pixel.a > 0) {
            app.setColorAndAddToHistory(pixel);
            app.ui.tool.revertToPreviousTool();
            return;
          }
        }
      }

      if (referenceImage) {
        // In variant-edit mode `coords` are variant-grid space; the sampler
        // wants object space, so add the offset back.
        const canvasX = isEditingVariantResolved
          ? coords.x + variantOffset.x
          : coords.x;
        const canvasY = isEditingVariantResolved
          ? coords.y + variantOffset.y
          : coords.y;
        const refPixel = getRefPixelAtCoord(canvasX, canvasY);
        if (refPixel && refPixel.a > 0) {
          app.setColorAndAddToHistory(refPixel);
          app.ui.tool.revertToPreviousTool();
        }
      }
      return;
    }

    if (currentTool === "move") {
      setIsDraggingPixels(true);
      setLastDragPixel(coords);
      setMoveDragOffset({ dx: 0, dy: 0 });
      return;
    }

    if (currentTool === "selection") {
      const canUseSelectionMask =
        selection &&
        selection.width === gridWidth &&
        selection.height === gridHeight;
      const isInsideSelection =
        canUseSelectionMask &&
        selection.mask.has(coords.y * gridWidth + coords.x);

      // Clicking INSIDE a selection drags it — unless edit-mask mode is on,
      // where a click inside must not disturb the mask.
      if (isInsideSelection && selectionBehavior !== "editMask") {
        setIsDraggingSelection(true);
        setSelectionDragMode(
          selectionBehavior === "moveSelection" ? "selection" : "pixels",
        );
        setPixelDragOffset({ dx: 0, dy: 0 });
        setLastSelectionDragPixel(coords);
        return;
      }
      if (isInsideSelection && selectionBehavior === "editMask") return;

      if (selectionMode === "rect") {
        setIsSelectingRegion(true);
        setSelectionStart(coords);
        setPreviewSelection({ x: coords.x, y: coords.y, width: 1, height: 1 });
        setIsLassoSelecting(false);
        setLassoPoints([]);
        actions.clearSelection();
        return;
      }

      if (selectionMode === "flood") {
        setIsSelectingRegion(false);
        setSelectionStart(null);
        setPreviewSelection(null);
        setIsLassoSelecting(false);
        setLassoPoints([]);
        actions.selectFloodFillAt(coords.x, coords.y);
        return;
      }

      if (selectionMode === "color") {
        setIsSelectingRegion(false);
        setSelectionStart(null);
        setPreviewSelection(null);
        setIsLassoSelecting(false);
        setLassoPoints([]);
        actions.selectAllByColorAt(coords.x, coords.y);
        return;
      }

      // lasso
      setIsSelectingRegion(false);
      setSelectionStart(null);
      setPreviewSelection(null);
      setIsLassoSelecting(true);
      setLassoPoints([coords]);
      actions.clearSelection();
      return;
    }

    // Everything past here is a pixel-transform tool: ONE dispatch, both
    // devices, via `useCanvasPointer` → `toolHandlers`.
    if (currentTool !== "eraser") app.session.addToColorHistory(currentColor);
    pointer.beginStroke(e.clientX, e.clientY, "mouse");
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // The hover marker, on the desktop path. Updated BEFORE the gesture
    // arbitration below because every one of those branches returns early,
    // and the marker has to keep following the pointer through all of them —
    // including a pan, where the artwork moves under a stationary cursor and
    // the cell beneath it genuinely changes.
    //
    // ⚠️ On the MOUSE path the marker is cleared while a stroke is in flight,
    // and on the TOUCH path it is not (see `handleTouchMove`). That asymmetry
    // is deliberate and is about occlusion, not consistency: a mouse leaves
    // the cells visible and puts a cursor on them, so a marker during a drag
    // only doubles what the stroke already shows. A finger or a pencil COVERS
    // the cells it is painting, so during a touch stroke the marker is the
    // only indication of where the edit is actually landing.
    applyMarker("mouse", "move", () => getPixelCoords(e.clientX, e.clientY));

    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      const next = clampPanToViewport(
        { x: viewPanRef.current.x + dx, y: viewPanRef.current.y + dy },
        canvasWidth * viewZoom,
        canvasHeight * viewZoom,
      );
      viewPanRef.current = next;
      setViewPanOffset(next);
      scheduleCommitPan();
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getPixelCoords(e.clientX, e.clientY);
    if (!coords) {
      // Leaving the drawable area mid-drag must not "bridge" a long gap when
      // the pointer re-enters.
      if (isDrawing) lastStrokePixelRef.current = null;
      actions.clearPreviewPixels();
      return;
    }

    if (isTracing && isReferenceTraceActive) {
      const out = stampTrace(
        lastStrokePixelRef.current,
        coords,
        getLinePixels,
        brushStampOptions(pencilBrushShape),
        traceSpace,
        getRefPixelAtCoord,
      );
      if (out.length > 0) actions.setPixels(out as never);
      lastStrokePixelRef.current = coords;
      return;
    }

    if (isTracing && frameTraceActive) {
      const out = stampTrace(
        lastStrokePixelRef.current,
        coords,
        getLinePixels,
        brushStampOptions(pencilBrushShape),
        traceSpace,
        getFrameTracePixelAtCoord,
      );
      if (out.length > 0) actions.setPixels(out as never);
      lastStrokePixelRef.current = coords;
      return;
    }

    if (isDraggingPixels && lastDragPixel) {
      const dx = coords.x - lastDragPixel.x;
      const dy = coords.y - lastDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        // Preview only — see `moveDragOffset`. Nothing is written until release.
        setMoveDragOffset((prev) => ({ dx: prev.dx + dx, dy: prev.dy + dy }));
        setLastDragPixel(coords);
      }
      return;
    }

    if (isDraggingSelection && lastSelectionDragPixel && selectionDragMode) {
      const dx = coords.x - lastSelectionDragPixel.x;
      const dy = coords.y - lastSelectionDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        if (selectionDragMode === "pixels") {
          // Non-destructive preview; the real move commits on mouse-up.
          setPixelDragOffset((prev) => ({
            dx: prev.dx + dx,
            dy: prev.dy + dy,
          }));
        } else {
          actions.moveSelection(dx, dy);
        }
        setLastSelectionDragPixel(coords);
      }
      return;
    }

    if (isSelectingRegion && selectionStart) {
      const minX = Math.min(selectionStart.x, coords.x);
      const minY = Math.min(selectionStart.y, coords.y);
      const maxX = Math.max(selectionStart.x, coords.x);
      const maxY = Math.max(selectionStart.y, coords.y);
      setPreviewSelection({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
      return;
    }

    if (isLassoSelecting) {
      setLassoPoints((prev) => {
        const last = prev[prev.length - 1];
        // Drop jitter: only a CHANGED cell extends the path, or the array
        // grows unboundedly during a slow drag.
        if (last && last.x === coords.x && last.y === coords.y) return prev;
        return [...prev, coords];
      });
      return;
    }

    if (!isDrawing || !drawStartPoint) {
      // The hover preview for fill-square, which previews without a gesture.
      if (currentTool === "fill-square") {
        actions.setPreviewPixels(
          getSquarePixels(coords, brushSize, currentColor).map((p) => ({
            x: p.x,
            y: p.y,
          })),
        );
      }
      return;
    }

    pointer.continueStroke(e.clientX, e.clientY, "mouse");
  };

  /**
   * The move tool's release: commit the previewed offset as ONE shift.
   * Shared by the mouse and touch paths so both clip exactly once.
   */
  const finishMoveDrag = () => {
    const { dx, dy } = moveDragOffset;
    if (dx !== 0 || dy !== 0) actions.moveLayerPixels(dx, dy);
    setIsDraggingPixels(false);
    setLastDragPixel(null);
    setMoveDragOffset({ dx: 0, dy: 0 });
  };

  /**
   * The end of a pixel-transform stroke, for BOTH devices.
   *
   * The three shape tools commit their preview on release. This stays here
   * rather than in `toolHandlers` because committing a preview is a store
   * write against `previewPixels`, which the handlers only ever WRITE.
   *
   * ⚠️ Shared on purpose: the touch path used to end a stroke WITHOUT this
   * commit, so a Pencil rectangle or ellipse previewed and then vanished on
   * lift (2026-08-29). One release routine means one set of tools that work.
   */
  const finishDrawingStroke = () => {
    if (
      previewPixels.length > 0 &&
      (currentTool === "line" ||
        currentTool === "rectangle" ||
        currentTool === "ellipse")
    ) {
      actions.setPixels(
        previewPixels.map((p) => ({
          x: p.x,
          y: p.y,
          color: currentColor as Color,
        })),
      );
    }

    actions.endStroke();
    actions.endDrawing();
  };

  const handleMouseUp = () => {
    lastStrokePixelRef.current = null;

    // ⚠️ This handler is bound to BOTH `onMouseUp` and `onMouseLeave` (see the
    // `CanvasSurface` call site). Clearing the marker here is therefore what
    // removes it when the pointer leaves the canvas — without it, the marker
    // would stay frozen at the last cell touched, reading as a stuck cursor.
    // On a genuine mouse-up the next move re-establishes it immediately.
    applyMarker("mouse", "end", () => null);

    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isTracing) {
      actions.endStroke();
      setIsTracing(false);
      return;
    }

    if (isDraggingPixels) {
      finishMoveDrag();
      return;
    }

    if (isDraggingSelection) {
      if (selectionDragMode === "pixels") {
        const { dx, dy } = pixelDragOffset;
        // ⚠️ The bridge delegate moves the MASK after the pixels; without the
        // second step the outline detaches from the art it describes.
        if (dx !== 0 || dy !== 0) actions.moveSelectedPixels(dx, dy);
      }
      setIsDraggingSelection(false);
      setSelectionDragMode(null);
      setLastSelectionDragPixel(null);
      setPixelDragOffset({ dx: 0, dy: 0 });
      return;
    }

    if (isSelectingRegion && previewSelection) {
      actions.setSelection(previewSelection);
      setIsSelectingRegion(false);
      setSelectionStart(null);
      setPreviewSelection(null);
      return;
    }

    if (isLassoSelecting) {
      if (lassoPoints.length > 1) actions.selectLasso(lassoPoints);
      setIsLassoSelecting(false);
      setLassoPoints([]);
      return;
    }

    if (!isDrawing || !drawStartPoint) return;
    finishDrawingStroke();
  };

  /* ── touch ─────────────────────────────────────────────────────────────── */
  /**
   * The touches that belong to a CANVAS gesture.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THIS MUST MATCH `useCanvasViewport`'s `touchesHere` EXACTLY
   * ══════════════════════════════════════════════════════════════════════
   *
   * Both this file and the viewport's native pinch listener have to agree on
   * "how many fingers are on this gesture", and they count from different
   * events. When they disagree, one of them thinks a pinch is in flight while
   * the other thinks a stroke is — and the stroke dies.
   *
   * `e.targetTouches` is NOT the right filter, though it looks like it. It
   * holds only touches whose `target` is the element the handler is bound to,
   * which here is the `<canvas>`. The pinch listener is bound to the VIEWPORT
   * and counts anything inside it — including the floating canvas controls,
   * which render inside `canvas__viewport` but outside the `<canvas>`.
   *
   * So a second finger on those controls (or anywhere in the viewport that is
   * not the sprite) is invisible to `targetTouches` but IS a pinch to the
   * viewport listener. `isPinching()` then goes true, `handleTouchMove`
   * returns on its first line, and the stroke stops mid-slide while the
   * finger is still down — observed 2026-08-28 as "unable to slide and draw".
   *
   * `e.touches` is not right either: that is every touch on the PAGE, which
   * is what the Other Hand Mode change correctly moved away from — a thumb on
   * a rail slider outside the viewport must not cancel a stroke.
   *
   * The correct set is the middle one, and it is the viewport's: touches
   * inside the container. Same predicate, same source of truth.
   */
  const canvasTouches = useCallback(
    (e: React.TouchEvent): React.Touch[] =>
      touchesInContainer(Array.from(e.touches), containerRef.current),
    [containerRef],
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    // Drop any marker left over from HOVERING before re-establishing it from
    // the touch itself on the first `handleTouchMove`.
    //
    // The clear matters even though the move handler is about to set it: a
    // press that never moves (a single tap to place one pixel) should not
    // leave the pre-touch hover marker sitting a few cells away from where
    // the tap actually landed.
    applyMarker("touch", "start", () => null);

    // ⚠️ TWO-FINGER GESTURES ARE NOT HANDLED HERE ANY MORE (2026-08-25).
    //
    // They are owned by a native, non-passive listener on the canvas
    // VIEWPORT inside `useCanvasViewport` — React's synthetic touch handlers
    // are passive, so the `e.preventDefault()` that used to sit here could
    // not actually stop Safari claiming the gesture for its own page zoom,
    // and these handlers are bound to the `<canvas>`, which is inside the
    // pan/zoom transform and therefore misses fingers placed in the empty
    // space around a zoomed-out sprite. See that hook's header.
    //
    // What remains here is the single-touch half: drawing and the move tool.
    // Bailing out on a second finger is still required, so a pinch does not
    // also lay down a stroke with whichever finger landed first.
    //
    // ⚠️ `canvasTouches`, NOT `e.touches` (Other Hand Mode, 2026-08-28).
    // `touches` is every touch on the PAGE. A thumb working a rail slider
    // while the Pencil draws is a second touch — and counting it here
    // cancelled the stroke as a pinch, which is exactly the "change the brush
    // mid-stroke" gesture the mode exists for.
    //
    // ⚠️ It is not `targetTouches` either — see `canvasTouches` above for why
    // that set is too NARROW and broke sliding in a different way.
    // ⚠️ TWO FINGERS is a pinch; a PENCIL plus fingers is still a stroke.
    // Counting raw contacts here is what stopped the Pencil drawing whenever
    // a finger was also on the screen (2026-08-28) — see `canvasTouchFilter`.
    const startTouches = canvasTouches(e);
    if (pinchTouches(startTouches).length >= 2) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    const touch = drawingTouch(startTouches);
    if (!touch) return;
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords || !layer) return;

    // The move tool is the ONE gesture tool touch implements.
    if (currentTool === "move") {
      setIsDraggingPixels(true);
      setLastDragPixel(coords);
      setMoveDragOffset({ dx: 0, dy: 0 });
      return;
    }

    // ⚠️ Touch is a deliberate SUBSET (see the module header): the eyedropper,
    // selection, origin and trace tools were never implemented for it and a
    // touch on any of them falls through here. `canDispatchTool()` inside the
    // hook returns false for them, so nothing happens — which is exactly what
    // the legacy handlers did by simply not having the branches.
    if (isGestureTool(currentTool)) return;

    pointer.beginStroke(touch.clientX, touch.clientY, "touch");
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Two FINGERS: the native viewport listener owns zoom AND pan. Bail out so
    // a pinch never also draws — see `handleTouchStart`.
    //
    // ⚠️ `pinchTouches`, not the raw count. A Pencil and a resting finger are
    // two contacts and were being discarded as a pinch, which is the
    // "unable to slide and draw" report of 2026-08-28.
    const moveTouches = canvasTouches(e);
    if (pinchTouches(moveTouches).length >= 2 || isPinching()) return;

    // ══════════════════════════════════════════════════════════════════════
    //  THE MARKER DURING A TOUCH STROKE — the mirror of the mouse path's
    //  decision, for the OPPOSITE reason.
    // ══════════════════════════════════════════════════════════════════════
    //
    // `handleMouseMove` CLEARS the marker while drawing, because a mouse
    // leaves the cells visible and puts a cursor on them. A finger or a
    // pencil tip COVERS the cells it is painting, so during a touch stroke
    // the marker is the only indication of where the edit is landing. It
    // matters most for the eraser, which paints nothing to look at: without
    // the marker there is no feedback at all under the hand.
    //
    // ⚠️ Placed HERE, immediately after the two-finger bail-out and before
    // every other branch, because each branch below returns early: a
    // one-finger pan, a pixel-drag and an off-grid move all leave via their
    // own `return`, and the marker has to keep tracking through all of them.
    // A pinch is excluded above on purpose — `getPixelCoords` maps through a
    // rect that is mid-transform during one.
    //
    // ⚠️ Set unconditionally rather than only while `isDrawing`. A pencil
    // resting on the glass between strokes still reports moves, and marking
    // where the NEXT edit would land is the whole point of the feature.
    // The marker follows whichever contact is DRAWING — the Pencil when one is
    // down, not whichever finger happens to be first in the list.
    const markerTouch = drawingTouch(moveTouches);
    if (markerTouch) {
      applyMarker("touch", "move", () =>
        getPixelCoords(markerTouch.clientX, markerTouch.clientY),
      );
    }

    const panTouch = drawingTouch(moveTouches);
    if (isPanning && lastPanPoint && panTouch) {
      const touch = panTouch;
      const dx = touch.clientX - lastPanPoint.x;
      const dy = touch.clientY - lastPanPoint.y;
      const next = clampPanToViewport(
        // ⚠️ MINUS, not plus — touch panning is inverted relative to the mouse
        // (the content follows the finger). Verbatim from `Canvas.tsx:1876`.
        { x: viewPanRef.current.x - dx, y: viewPanRef.current.y - dy },
        canvasWidth * viewZoom,
        canvasHeight * viewZoom,
      );
      viewPanRef.current = next;
      setViewPanOffset(next);
      scheduleCommitPan();
      setLastPanPoint({ x: touch.clientX, y: touch.clientY });
      return;
    }

    // ⚠️ NOT `moveTouches.length !== 1`. That rejected a Pencil stroke the
    // moment a finger touched down anywhere in the viewport. `drawingTouch`
    // returns the stylus when there is one and a lone finger otherwise, so a
    // Pencil keeps drawing through any number of resting fingers.
    const touch = drawingTouch(moveTouches);
    if (!touch) return;
    const coords = getPixelCoords(touch.clientX, touch.clientY);
    if (!coords) {
      if (isDrawing) lastStrokePixelRef.current = null;
      return;
    }

    if (isDraggingPixels && lastDragPixel) {
      const dx = coords.x - lastDragPixel.x;
      const dy = coords.y - lastDragPixel.y;
      if (dx !== 0 || dy !== 0) {
        // Preview only — see `moveDragOffset`. Nothing is written until release.
        setMoveDragOffset((prev) => ({ dx: prev.dx + dx, dy: prev.dy + dy }));
        setLastDragPixel(coords);
      }
      return;
    }

    if (!isDrawing) return;
    if (isGestureTool(currentTool)) return;

    pointer.continueStroke(touch.clientX, touch.clientY, "touch");
  };

  const handleTouchEnd = () => {
    lastStrokePixelRef.current = null;
    // The finger is gone, so the marker goes with it: unlike a mouse there is
    // no resting pointer position left to mark, and a marker still sitting on
    // the last cell reads as a selection rather than as a cursor. Set before
    // the early returns below so it clears on EVERY way a touch can end,
    // including a pan and a pixel-drag.
    applyMarker("touch", "end", () => null);

    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }
    if (isDraggingPixels) {
      finishMoveDrag();
      return;
    }
    if (isDrawing && drawStartPoint) {
      finishDrawingStroke();
      return;
    }
    actions.endStroke();
    actions.endDrawing();
  };

  /* ── cursor ────────────────────────────────────────────────────────────── */
  //
  // Every branch resolves to `crosshair` except `move` and the two copy
  // modes. Preserved verbatim rather than collapsed, because the branch list
  // documents which tools were considered.
  const cursor = (() => {
    if (currentTool === "move") return "move";
    if (currentTool === "reference-trace") return "copy";
    if (frameTraceActive) return "copy";
    if (currentTool === "eyedropper") return "crosshair";
    if (currentTool === "selection") return "crosshair";
    if (currentTool === "origin") return "crosshair";
    return "crosshair";
  })();

  /**
   * Recentre the workspace at 100% view zoom.
   *
   * ⚠️ The centring MUST be measured, not assumed. The canvas area's size
   * changes with focus mode, the rail layout and every rail scale step, so a
   * hard-coded offset would put the sprite in the middle of yesterday's
   * viewport. `containerRef` is the untransformed viewport box, which is the
   * only correct thing to centre against.
   *
   * The pan is computed HERE rather than in the store because it needs the
   * DOM, and a store may not read it. `resetView` takes the result.
   *
   * ⚠️ `zoom` (the pixel scale) is deliberately NOT reset — see
   * `CanvasViewControls`' header. This button rescues a lost VIEW; it does
   * not discard the scale the user picked for this sprite.
   */
  const handleResetView = useCallback(() => {
    const container = containerRef.current;
    // At view zoom 1 the content is exactly `canvasWidth × canvasHeight`.
    const centered = container
      ? {
          x: Math.round((container.clientWidth - canvasWidth) / 2),
          y: Math.round((container.clientHeight - canvasHeight) / 2),
        }
      : { x: 0, y: 0 };
    setViewZoom(1);
    setViewPanOffset(centered);
    viewport.resetView(centered);
  }, [
    containerRef,
    canvasWidth,
    canvasHeight,
    setViewZoom,
    setViewPanOffset,
    viewport,
  ]);

  return (
    <CanvasSurface
      canvasRef={canvasRef}
      overlayCanvasRef={overlayCanvasRef}
      frameOverlayCanvasRef={frameOverlayCanvasRef}
      frameTraceOverlayCanvasRef={frameTraceOverlayCanvasRef}
      hoverCanvasRef={hoverCanvasRef}
      containerRef={containerRef}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      viewPanOffset={viewPanOffset}
      viewZoom={viewZoom}
      cursor={cursor}
      showReferenceOverlay={isReferenceTraceActive}
      // #8 hides while EITHER trace mode is on: two semi-transparent onion
      // skins stacked on one sprite are unreadable. Verbatim from
      // `Canvas.tsx:2022`.
      showFrameOverlay={
        Boolean(overlayFrame) && !isReferenceTraceActive && !frameTraceActive
      }
      showFrameTraceOverlay={frameTraceActive}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      viewControls={<CanvasViewControls onResetView={handleResetView} />}
    />
  );
});
