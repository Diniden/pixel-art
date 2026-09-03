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
 * |  6 | Scene rendering             | this file's `renderLayers` (ONE canvas |
 * |    |                             | PER LAYER, plan 05 task 05) +          |
 * |    |                             | `renderChrome` + the SVG chrome in     |
 * |    |                             | `ui/canvas/svg`                        |
 * |  7 | Reference-trace overlay     | this file's `renderOverlay`            |
 * |  8 | Frame overlay               | `ui/canvas/render/renderFrameOverlay`  |
 * |  9 | Frame-trace overlay         | same module, parameterised              |
 * | 10 | Pointer / gesture handling  | `ui/hooks/useCanvasPointer` +          |
 * |    |                             | `ui/canvas/tools/toolHandlers` + the   |
 * |    |                             | gesture arbitration below              |
 * | 11 | Keyboard shortcuts          | `ui/hooks/useCanvasKeyboard`           |
 * | 13 | Reflection guides           | the SVG `reflectionGuides` prop + the  |
 * |    |                             | gesture branches. ⚠️ The RASTER        |
 * |    |                             | painter was retired by plan 05 task 05 |
 * |    |                             | — see the note where it used to be.    |
 *
 * (#12 is the hover marker, further down. #13 is the reflection tool, added
 * 2026-08-29: its own overlay canvas, its own scheduler and its own rAF phase
 * ticker, none of which touch `render` or `pixelVersion`. Its gesture is
 * arbitrated here like `origin`'s, and the mirroring of every pixel write
 * lives in one place — `actions.setPixels`.)
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
import { reaction } from "mobx";
import {
  ACCENT_PRIMARY_14,
  ACCENT_VARIANT,
  BLACK_12,
  PREVIEW_ALPHA,
  PREVIEW_RING,
  PREVIEW_RING_WIDTH,
  VARIANT_EDIT_OTHER_DIM,
  VARIANT_EDIT_REGULAR_DIM,
  WARN_ORANGE_40,
  WARN_ORANGE_60,
} from "../ui/theme/canvasTokens";
import { useStores } from "../stores/context";
import type { CanvasCamera } from "../stores/ui/CanvasCameraStore";
import type { CanvasRenderMode } from "../stores/ui/CanvasViewsUIStore";
import { CanvasViewControls } from "../ui/components/CanvasViewControls/CanvasViewControls";
import { strokeControl } from "../stores/history/editorHistory";
import type { Color, Point, SelectionBox, Pixel, PixelData } from "../types";
import type { Layer } from "../types";
import type { ReferenceImageData } from "../types/referenceImage";
import {
  getLinePixels,
  getRectanglePixels,
  getShapeOutlineKeys,
  getEllipsePixels,
  floodFill,
  gaussianFloodFill,
  getSquarePixels,
  getCirclePixels,
} from "../components/Canvas/drawingUtils";
import { resolveVariantOffset } from "../ui/canvas/model/variantOffset";
import { screenToPixel } from "../ui/canvas/model/coords";
import { expandWrites } from "../ui/canvas/model/reflection";
// ⚠️ NOTHING is imported from `ui/canvas/render/canvasBackground` any more.
// `backgroundTheme` and `paintCheckerboard` came out with `ensureBgCanvas`
// (task 06) — but they are NOT dead code: `renderNormalEdit.ts`,
// `renderLitComposite.ts` and `LightingCanvasContainer` (which also still
// calls `strokeGrid`) are the lighting studio's, and task 08 owns those.
import {
  renderFrameOverlay as renderFrameOverlayBuffer,
  overlayVariantFrameIndices,
  FRAME_OVERLAY_MODE,
  FRAME_TRACE_MODE,
} from "../ui/canvas/render/renderFrameOverlay";
import {
  paintLayerCells,
  clearLayerCells,
  dilateCells,
} from "../ui/canvas/render/renderLayerView";
import {
  lassoOverlay,
  marchingAntsOverlay,
  originCrossOverlay,
  reflectionGuideOverlays,
} from "../ui/canvas/svg/chromeOverlay";
import {
  gridOverlayAttrs,
  gridOverlayPathData,
} from "../ui/canvas/svg/gridOverlay";
import type { SelectionBounds } from "../ui/canvas/render/renderSelectionOverlay";
import { paintHoverCells } from "../ui/canvas/render/renderHoverMarker";
import { toolFootprint } from "../ui/canvas/tools/toolFootprint";
import { markerAction } from "../ui/canvas/model/markerPolicy";
import {
  drawingTouch,
  pinchTouches,
  touchesInContainer,
} from "../ui/canvas/model/canvasTouchFilter";
import { isTouchDevice } from "../ui/utils/pointerDevice";
import { stampTrace } from "../ui/canvas/tools/traceSampler";
import type { ToolContext } from "../ui/canvas/tools/toolHandlers";
import type { StampPoint } from "../ui/canvas/tools/brushStamp";
import { useCanvasGeometry } from "../ui/hooks/useCanvasGeometry";
import { useCanvasKeyboard } from "../ui/hooks/useCanvasKeyboard";
import { useCanvasPointer } from "../ui/hooks/useCanvasPointer";
import { useCanvasRender } from "../ui/hooks/useCanvasRender";
import type { DirtyScope } from "../ui/hooks/useCanvasRender";
import { useDashTicker } from "../ui/hooks/useDashTicker";
import { useCanvasViewport } from "../ui/hooks/useCanvasViewport";
import { usePencilHover } from "../ui/hooks/usePencilHover";
import { CanvasSurface } from "../ui/components/CanvasSurface/CanvasSurface";

/* ── the pose tool (pose-tool task 08, concern #14) ────────────────────────
 *
 * ⚠️ Every one of these is a TYPE-ONLY import except `poseEngine`'s and
 * `poseCamera`/`poseMeshes`/`poseStamp`'s pure functions — and NONE of them
 * pulls three into this module's graph. `PoseEngine` reaches three through a
 * dynamic `import("three")` (MASTER D2), which Vite emits as its own ~734 kB
 * chunk; a static `import ... from "three"` anywhere in this file would drag
 * that chunk into the main bundle for every user who never opens the tool.
 * The `import type` below is erased at build time and pulls in nothing.
 */
import { PoseEngine, loadThree } from "../ui/canvas/pose/poseEngine";
import type { PoseEngineCamera } from "../ui/canvas/pose/poseEngine";
import {
  applyCameraParams,
  fitCameraToMesh,
  getCameraPreset,
} from "../ui/canvas/pose/poseCamera";
import type { PoseCameraParams } from "../ui/canvas/pose/poseCamera";
import {
  UNIT_BOUNDS,
  applyMaterial,
  buildMesh,
} from "../ui/canvas/pose/poseMeshes";
import { applyOutline } from "../ui/canvas/pose/poseOutline";
import { buildStampCells } from "../ui/canvas/pose/poseStamp";
import type { PoseColor, PoseStampCell } from "../ui/canvas/pose/poseTypes";
import type { Object3D } from "three";

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
 * Tools whose gesture is arbitrated here rather than by `toolHandlers`.
 *
 * ⚠️ `reflection` is in this list AND has a branch of its own ahead of the
 * touch bail-outs below. The list is what stops `toolHandlers` dispatching a
 * pixel write for it; the branch is what makes the gesture actually work on
 * touch. Adding one without the other is the bug this ordering exists to
 * prevent (MASTER §9: "touch gesture-tool bail swallows the reflection
 * gesture") — every other member of this list simply does nothing on touch.
 *
 * ⚠️ `pose` (pose-tool task 08, D12) is the SECOND member with real touch
 * branches, and it is in this list for the same two reasons: its
 * `toolHandlers` entry is an empty `pose: {}`, and it must never open a
 * history stroke. Its drag PANS the 3D reference and its double-tap STAMPS —
 * neither is a pixel write through the tool table, and the stamp it does make
 * is one atomic `setPixelCells` commit rather than a stroke.
 */
/* ── the pose tool's tuning constants (pose-tool task 08) ──────────────────
 *
 * Module-level rather than inline so they are named, greppable, and cannot be
 * re-typed differently in the mouse and touch paths.
 */

/**
 * The double-click window (D12). Two pointer-downs closer together than this
 * — and within {@link POSE_DOUBLE_CLICK_CELLS} — are one stamp gesture.
 *
 * ⚠️ Detected explicitly rather than by listening for a `dblclick` event:
 * `dblclick` is not dispatched reliably on touch, and the owner uses an iPad.
 */
const POSE_DOUBLE_CLICK_MS = 400;

/** How far the two downs may drift and still count as one place (D12). */
const POSE_DOUBLE_CLICK_CELLS = 2;

/**
 * A texel is stamped iff its alpha is at least this (D8).
 *
 * The same threshold `poseStamp.ts` defaults to, restated here because the
 * container ALSO uses it to decide which texels contribute to the observed
 * depth range — the two must agree or the range would be measured over texels
 * that are never stamped.
 */
const POSE_ALPHA_THRESHOLD = 128;

/**
 * The auto-fit's padding: 10% total, so the fitted model fills 90% of the
 * shorter canvas axis (D7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ ZOOM IS NO LONGER FOLDED INTO THIS. THAT FOLD WAS THE BUG (MASTER E12)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pose-tool task 08 passed `padding: 1 - (1 - 0.1) * zoom` so that the fit
 * stayed the single owner of the framing. It reads plausibly and it is the
 * owner's headline complaint, because that expression is only a zoom over a
 * *narrow* interval and turns into nonsense outside it:
 *
 *   - `fitCameraToMesh` clamps padding to `[0, 0.95)`, so every zoom at or
 *     above `1 / 0.9 ≈ 1.111` produced padding `<= 0` — clamped to exactly 0.
 *     **Every zoom from 1.12 upward framed identically.** Deleting
 *     `POSE_ZOOM_MAX` could not help: the ceiling was arithmetic, not a clamp,
 *     and it sat an order of magnitude below the old cap of 10.
 *   - Below 1 it is not linear either: `padding = 1 - 0.9z` makes the model
 *     `(1 - padding) = 0.9z` of the frame, so it happened to behave, but only
 *     by coincidence of the same constant appearing twice.
 *   - And a *fit* re-derived the padding from the zoom every time, so pressing
 *     **Fit to canvas** while zoomed could never do anything but re-apply the
 *     zoom it was supposed to be independent of.
 *
 * Zoom is now a free multiplier applied to the fitted frustum AFTER the fit
 * (see `scaleCameraParams`), and this constant is a constant again.
 */
const DEFAULT_POSE_FIT_PADDING = 0.1;

/**
 * Apply a free zoom multiplier to an already-fitted camera (MASTER E12).
 *
 * The fit decides the frame; zoom scales it. `zoom > 1` means "draw the model
 * bigger", which means a **smaller** frustum, hence the division — and there
 * is no ceiling: at zoom 1000 the orthographic box is a thousandth of the
 * fitted one and the model overflows the canvas enormously, which is exactly
 * what the owner asked for.
 *
 * ⚠️ It scales the FRUSTUM, never the model or the camera distance:
 *
 *  - Orthographic framing is `left/right/top/bottom` and nothing else, so a
 *    dolly would change only the clipping, not the size. Scaling the box is
 *    the only thing that works, and it leaves `near`/`far` — which the fit
 *    sized to bracket the geometry — untouched.
 *  - For perspective, scaling `fov` the same way keeps the two projections
 *    behaving identically under the same slider. `tan` is used rather than the
 *    angle directly because screen size is proportional to `tan(fov/2)`, not
 *    to the angle; halving the angle does NOT double the model. The result is
 *    clamped to a legal FOV, which is a degeneracy guard and not a zoom cap:
 *    at the 179° end the model is vanishingly small and at the 1e-4° end it is
 *    ~10^6× the fitted size, both far outside anything usable.
 *
 * Returns a NEW object; `params` is not mutated.
 */
function scaleCameraParams(
  params: PoseCameraParams,
  zoom: number,
): PoseCameraParams {
  // A non-finite or non-positive zoom is the store's job to reject
  // (`sanitizeZoom`), but the render path must not produce NaN matrices if one
  // ever reaches it by another route.
  if (!Number.isFinite(zoom) || zoom <= 0 || zoom === 1) return params;

  if (params.projection === "orthographic" && params.orthographic) {
    const o = params.orthographic;
    return {
      ...params,
      orthographic: {
        left: o.left / zoom,
        right: o.right / zoom,
        top: o.top / zoom,
        bottom: o.bottom / zoom,
      },
    };
  }

  if (params.perspective) {
    const halfRadians = (params.perspective.fov * Math.PI) / 360;
    const scaledHalf = Math.atan(Math.tan(halfRadians) / zoom);
    const fov = Math.min(179, Math.max(1e-4, (scaledHalf * 360) / Math.PI));
    return { ...params, perspective: { ...params.perspective, fov } };
  }

  return params;
}

function isGestureTool(tool: string): boolean {
  return (
    tool === "move" ||
    tool === "selection" ||
    tool === "eyedropper" ||
    tool === "origin" ||
    tool === "reflection" ||
    tool === "pose"
  );
}

/*
 * ⚠️ THE SYNTHETIC `"::background"` LAYER ID IS GONE (task 06).
 *
 * Task 05 prepended one to `layerIds` so the checkerboard could get a canvas
 * BELOW the artwork — DOM order is z-order in `CanvasSurface.css`, and the
 * only surface under the layer stack was the layer stack. Its own comment
 * said task 06 would delete it, and this is that deletion: the checkerboard
 * is a CSS DIV on `--z-behind` now, so `layerIds` holds real `Layer.id`s and
 * nothing else again.
 */

/**
 * The one place 1:1-ness is still spelled out.
 *
 * Every backing store is now `cellWidth × cellHeight` — one sprite pixel, one
 * device pixel — and all magnification is the single CSS
 * `scale(zoom * viewZoom)` on `.canvas__layout` (D2). The pure painters under
 * `ui/canvas/render/` still take a `zoom` because they predate that, and at
 * `zoom = 1` their `x * zoom` collapses to `x`.
 *
 * ⚠️ Named, not inlined, so it is greppable: `CELL_SCALE` marks every call
 * site that had to opt in, and a surviving `* zoom` in a painter stands out
 * as the anomaly it would be. A stale one is exactly what clipped the artwork
 * to the top-left corner between tasks 02 and 05. `ui/canvas/svg/` uses the
 * same device for the same reason (`CELL_SPACE_ZOOM`).
 */
const CELL_SCALE = 1;

/**
 * Chrome stroke width and dash, in CELL units.
 *
 * ⚠️ Both are RASTER chrome that survives at 1:1 (D6) — full-cell-scale
 * rectangles, not sub-cell geometry. They are the two values the pre-1:1
 * render used, and they now mean cells rather than device pixels, so a 2-unit
 * border is two sprite pixels wide at every zoom instead of a hairline. That
 * is the same relationship the dashes and the rectangle always had to the
 * artwork; what changed is that the browser magnifies them with everything
 * else. The sub-cell chrome — grid, lasso, ants, origin cross — moved to SVG
 * instead, because it CANNOT survive at 1:1 (D5).
 */
const CHROME_STROKE = 2;

/** The object-bounds rectangle's dash, preserved verbatim. */
const OBJECT_BOUNDS_DASH = [6, 4];

/** The reference-trace border's dash, preserved verbatim. */
const TRACE_BORDER_DASH = [4, 4];

/**
 * Above this the selection fills are skipped. On the owner's real project a
 * select-all is 300,249 cells and painting it per frame would stall the drag.
 * Preserved verbatim from the pre-per-layer render.
 */
const SELECTION_FILL_CELL_LIMIT = 20000;

/** The origin cross's colour when the tool has none. Preserved verbatim. */
const DEFAULT_ORIGIN_COLOR = { r: 255, g: 50, b: 50, a: 255 };

/**
 * One entry in the per-layer paint plan: what gets a canvas, where its cells
 * land, and at what CSS opacity.
 *
 * ⚠️ `pixels` is held BY REFERENCE and never observed — it is read only from
 * `renderLayers`, imperatively, inside an animation frame. `layer.pixels` is
 * `observableRef` precisely so MobX never walks a 300,249-cell tree (R2).
 */
interface LayerPaintPlan {
  /** The id this layer's canvas is registered under. */
  key: string;
  /** Applied as `display: none`, which keeps the element and its bitmap. */
  visible: boolean;
  /** CSS `opacity` on the layer canvas — D4's dimming, not a per-cell alpha. */
  opacity: number;
  /**
   * The layer's cells. Every plan entry has them now: the `"background"`
   * kind that task 05 carried here was deleted in task 06 when the
   * checkerboard became a CSS DIV.
   */
  pixels?: PixelData[][];
  /** The SOURCE grid's extent, which is not the surface's. */
  gridWidth?: number;
  gridHeight?: number;
  /** Where the source grid's origin lands, in world cells. */
  offsetX?: number;
  offsetY?: number;
  /** Outline-only rendering. ⚠️ NOT an opacity — see `canvasTokens`. */
  onionOutline?: boolean;
  /** True when the move tool's live drag shifts this layer. */
  moves?: boolean;
}

export interface CanvasContainerProps {
  referenceImage?: ReferenceImageData | null;
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  overlayFrameIndex?: number | null;
  /**
   * Which render mode this instance shows (split-canvas 2026-08-29, task 05).
   * `"full"` (default) is the composite view exactly as before; `"layer"` is
   * just the editable grid — the variant's own canvas, or the current layer —
   * at origin. Each mode drives its own camera from `app.canvasViews`.
   */
  renderMode?: CanvasRenderMode;
}

export const CanvasContainer = observer(function CanvasContainer({
  referenceImage,
  overlayFrameIndex,
  renderMode = "full",
}: CanvasContainerProps) {
  const app = useStores();

  /* ── refs ──────────────────────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  // The pose tool's 3D reference overlay (task 04 mounted it; this passes the
  // ref). Always-mounted and blank until the tool is selected AND a mesh is
  // loaded — see the pose region below.
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⚠️ THE OFFSCREEN BACKGROUND CACHE AND ITS KEY ARE GONE (task 06). The
  // checkerboard is a CSS DIV now — no canvas, no `ImageData`, no cache
  // identity to keep in sync, and no `drawImage` on the repaint path.
  // `useCanvasGeometry` still returns `bgCacheKey` because the lighting
  // canvas (task 08) has not moved yet; this container no longer reads it.

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
  // The camera for THIS pane: the persisted `ViewportUIStore` for Full, the
  // session-only `layerCamera` for Layer. `zoom` (the pixel scale) is NOT
  // part of the camera — both panes share it.
  const views = app.canvasViews;
  const layerMode = renderMode === "layer";
  const camera: CanvasCamera = layerMode ? views.layerCamera : viewport;
  const referenceUI = app.referenceUI;
  const interaction = app.canvasInteraction;

  const currentTool = tool.selectedTool;
  /**
   * The EDGE colour — pencil, eraser-as-colour, line, and a shape's outline.
   *
   * ⚠️ ONE OF A PAIR since 2026-09-01. Anything that floods an AREA (the two
   * fills, and a shape's interior) uses `fillColor` below instead. When
   * picking which to use, ask what the pixels ARE, not which tool made them:
   * a rectangle in "both" mode writes with BOTH.
   */
  const currentColor = tool.selectedColor;
  /**
   * The FILL colour — bucket, gaussian fill, and a shape's interior.
   *
   * Falls back to the edge colour (`fillColorOrSelected`), so a project saved
   * before the split — which has no `fillColor` key — keeps behaving as it
   * did, with one colour driving both roles.
   */
  const fillColor = tool.fillColorOrSelected;
  const brushSize = tool.brushSize;
  const pencilBrushShape = tool.pencilBrushShape;
  const eraserShape = tool.eraserShape;
  const shapeMode = tool.shapeMode;
  const borderRadius = tool.borderRadiusOrZero;
  const selectionMode = tool.selectionMode;
  const selectionBehavior = tool.selectionBehavior;

  const zoom = viewport.zoom;
  const panOffset = camera.panOffset;
  const lightGridMode = viewport.lightGridMode ?? false;
  /* Pencil-only input (2026-08-31). Tri-state in the file: `undefined` means
     the project says nothing, and the DEFAULT is then device-dependent — on
     where there is a touch screen, off on a mouse-only desktop where no
     contact ever reports as a stylus and this would disable drawing outright.
     See `ui/utils/pointerDevice.ts`. */
  const pencilOnly = viewport.pencilOnly ?? isTouchDevice();
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

  // ── the reflection guides (reflection-tool task 07) ────────────────────
  //
  // Both are `observableRef` on `ReflectionUIStore` and are replaced
  // WHOLESALE, so reading them here subscribes this `observer()` to their
  // IDENTITY — the same signal `previewPixels` above uses, and the correct
  // one: the painter has to repaint exactly when the set of lines changes.
  //
  // ⚠️ This is the ONLY React-visible reflection state. The animation PHASE
  // is a ref (see `reflectionPhaseRef`), because a phase in state would
  // re-render this container ~12 times a second forever and re-create the
  // pointer handlers mid-drag — the 2026-08-28 "unable to slide and draw"
  // class of regression documented at `hoverPixelRef`.
  const reflectionLines = app.reflection.lines;
  const reflectionDraft = app.reflection.draft;

  // ── the pose tool's render inputs (pose-tool task 08) ──────────────────
  //
  // ⚠️ Read HERE, in the `observer()` body, and that is what makes the
  // overlay follow the rail's controls: every one of these is a scalar or an
  // `observableRef` replaced wholesale, so reading it subscribes this
  // container to its VALUE (or its identity) and a rail change re-renders us.
  //
  // ⚠️ That re-render is correct for DISCRETE changes (mesh, preset,
  // projection, outline width) and acceptable for the continuous ones (the two orb
  // drags, the zoom slider) ONLY because the pose render path is cheap: the
  // effects below hand the new value to the engine and call the POSE
  // scheduler's `invalidate()`. Nothing pose-related may ever appear in the
  // main `render`'s dependencies — that would re-rasterise every cell of
  // every layer per orb sample (D11, the measured 2026-08-28 bug class).
  //
  // ⚠️ The PAN is deliberately NOT read here. It is pointer-rate during a
  // drag, and a body read would put a full container re-render on every
  // sample — the same regression. The drag writes the store AND a ref, and
  // the painter reads the ref; see `posePanRef`.
  const pose = app.pose;
  const poseMeshId = pose.meshId;
  const poseRotation = pose.rotation;
  const poseLightDirection = pose.lightDirection;
  const poseLightColor = pose.lightColor;
  const poseProjection = pose.projection;
  const poseCameraPreset = pose.cameraPreset;
  const poseZoom = pose.zoom;
  const poseFov = pose.fov;
  const poseEdgeWidth = pose.edgeWidth;
  /**
   * The fit REQUEST counter (MASTER E14). Read here so the fit effect below
   * takes it as a dependency: `requestFit()` mutates nothing else, so the
   * counter changing IS the whole event, and a monotonic counter (never reset,
   * not even by `clear()`) means two presses are two fits.
   */
  const poseFitGeneration = pose.fitGeneration;

  /**
   * The model's and outline's colours are the APP's Fill and Edge slots
   * (MASTER E8/E9), NOT `pose.modelColor` — the owner asked to drive them from
   * the picker they already use.
   *
   * ⚠️ `fillColor` is `fillColorOrSelected`, already resolved above: `fillColor`
   * is tri-state and `undefined` on every project saved before the split, so
   * the fallback is what keeps the model from rendering with no colour at all.
   * **Never seed a default** — that would add a key to all 151 corpus
   * snapshots (E8).
   *
   * Converted to `PoseColor` here, at the container boundary, rather than
   * handing a pure module a live `observableRef` value or importing the domain
   * `Color` into one. Both are the same four numbers, so this is an explicit
   * conversion and not a cast.
   *
   * ⚠️ `useMemo` on the four CHANNELS, not on the store object. The effects
   * below take these as dependencies, and a fresh literal every render would
   * re-materialise the mesh on every unrelated re-render of this 5,300-line
   * container. Keying on the channels means the identity changes exactly when
   * the colour does — the same guarantee `observableRef` gives the fields that
   * do live on the pose store.
   */
  const poseModelColor = useMemo<PoseColor>(
    () => ({
      r: fillColor.r,
      g: fillColor.g,
      b: fillColor.b,
      a: fillColor.a,
    }),
    [fillColor.r, fillColor.g, fillColor.b, fillColor.a],
  );
  const poseEdgeColor = useMemo<PoseColor>(
    () => ({
      r: currentColor.r,
      g: currentColor.g,
      b: currentColor.b,
      a: currentColor.a,
    }),
    [currentColor.r, currentColor.g, currentColor.b, currentColor.a],
  );

  /**
   * Whether the pose overlay should paint at all.
   *
   * BOTH conditions: the tool has to be selected (deselecting hides the
   * reference without unloading it — manual check 20) and a mesh has to be
   * loaded (an empty pose paints nothing rather than a blank frame).
   */
  const poseActive = currentTool === "pose" && poseMeshId !== null;

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
      /* ══════════════════════════════════════════════════════════════════
       *  ⚠️ THE REFLECTION MIRROR LIVES HERE, AND ONLY HERE (D5)
       * ══════════════════════════════════════════════════════════════════
       *
       * All ten production write paths — pencil, eraser, square, flood,
       * gaussian, both trace modes and the three shape commits — funnel
       * through this one closure, which is why mirroring one function
       * mirrors every drawing tool without `PixelStore` or `toolHandlers`
       * learning that the feature exists.
       *
       * `expandWrites` is a no-op (one array copy, one `Set` pass) when
       * there are no lines, so the cost on the overwhelmingly common path
       * is a linear walk of a batch that is usually a handful of cells.
       *
       * ⚠️ MIRROR-THEN-MASK is the locked order. The expansion happens
       * BEFORE `writeOptions` reaches `PixelStore`, so images that land
       * outside an `editMask` selection are dropped by `PixelStore.allows`
       * rather than escaping the mask. That asymmetry (draw inside a
       * selection, the mirror lands outside, nothing appears) is
       * documented, intentional and manual check 10.
       *
       * ⚠️ Dimensions come from `app.editableGrid.dims`, read AT CALL TIME
       * — variant-local while a variant is being edited, exactly the frame
       * `lines` are stored in. Reading it here rather than closing over the
       * container's `gridWidth`/`gridHeight` keeps this memo's dependency
       * list at `[app]`; a captured dimension would have to be added to the
       * deps and would rebuild every action on a grid resize.
       *
       * ⚠️ `app.reflection.lines` is likewise read at call time. This memo
       * must NOT depend on it: rebuilding `actions` mid-stroke would
       * rebuild the tool context and the pointer handlers with it.
       *
       * NOT mirrored, deliberately (D5): `moveLayerPixels`,
       * `moveSelectedPixels`, `deleteSelectionPixels` and the lighting
       * studio. Those are layer-wide transforms, not drawing. */
      setPixels: (pixels: Parameters<typeof app.pixels.setPixels>[0]) => {
        const editable = app.editableGrid;
        const lines = app.reflection.lines;
        const mirrored =
          lines.length > 0 && editable
            ? expandWrites(
                pixels,
                lines,
                editable.dims.width,
                editable.dims.height,
              )
            : pixels;
        app.pixels.setPixels(mirrored, app.selectionUI.writeOptions);
      },

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
      /* Mirrored for the same reason `setPixels` is: a rectangle previewed
       * on one side of a guide but committed on both would misrepresent
       * what release is about to do. Same call-time reads, same no-op when
       * there are no lines.
       *
       * The double expansion this implies for the shape tools — the preview
       * is expanded here, then `finishDrawingStroke` hands the ALREADY
       * expanded preview to `setPixels`, which expands it again — is
       * harmless: a reflection group is closed under its own reflections,
       * so every image of an image is a cell already in the set and
       * `expandWrites`' seen-set drops it. Idempotent, not wasteful enough
       * to special-case. */
      setPreviewPixels: (
        pixels: Parameters<typeof app.canvasInteraction.setPreviewPixels>[0],
      ) => {
        const editable = app.editableGrid;
        const lines = app.reflection.lines;
        const mirrored =
          lines.length > 0 && editable
            ? expandWrites(
                pixels,
                lines,
                editable.dims.width,
                editable.dims.height,
              )
            : pixels;
        app.canvasInteraction.setPreviewPixels(mirrored);
      },
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
  // Two flags, deliberately (split-canvas task 05):
  //  - `hasVariantData` — DATA: a variant layer is selected and resolved, so
  //    fills sample and the eyedropper reads the variant's own grid. True in
  //    both render modes.
  //  - `isEditingVariantResolved` — VIEW: lay the canvas out as the object ∪
  //    variant union with the grid drawn at `variantOffset`. Forced false in
  //    Layer mode, where the view IS the editable grid at (0,0); that single
  //    flag already routes geometry, coordinates, background, selection and
  //    preview to "grid at origin".
  const hasVariantData = Boolean(editingVariant && variantData);
  const isEditingVariantResolved = !layerMode && hasVariantData;
  // Layer mode: the "object" the geometry sees is the grid itself.
  const geomObjWidth = layerMode ? gridWidth : objWidth;
  const geomObjHeight = layerMode ? gridHeight : objHeight;
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
    objWidth: geomObjWidth,
    objHeight: geomObjHeight,
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
    // ⚠️ `viewMaxX`/`viewMaxY` are no longer destructured, and that is a
    // SIMPLIFICATION, not a dropped behaviour. The variant-edit branch used
    // to test each cell's world position against `[viewMin, viewMax)` by
    // hand; `paintLayerCells` clips to the BUFFER, and the buffer is
    // `cellWidth × cellHeight`, which in variant-edit mode is exactly
    // `viewWidth × viewHeight` = `viewMax − viewMin` (`useCanvasGeometry`,
    // D1). Same rectangle, expressed once instead of at every call site.
    // They remain on the hook's contract for the lighting canvas (task 08).
    cellWidth,
    cellHeight,
    contentWidth,
    contentHeight,
    // `variantOffsetKey` is part of `useCanvasGeometry`'s contract but is not
    // destructured here: it existed to make the offset safe in a hand-written
    // dependency array, and `render`'s identity now carries that signal (see
    // the `useCanvasRender` call below). It stays on the hook because the
    // lighting canvas — task 33 — has the same hand-written-deps problem.
    //
    // ⚠️ `bgCacheKey` and `bgGeomRef` are likewise ON the hook but NOT taken
    // here any more (task 06). They existed for `ensureBgCanvas`, which is
    // gone: there is no cached bitmap to key and no imperative painter that
    // needs the geometry as-of-the-event. Only `bgGeom` itself is read now,
    // and only for the checkerboard's parity. Both stay on the contract for
    // the lighting canvas (task 08).
    bgGeom,
    coordGeomRef,
  } = geom;

  /**
   * ⚠️ THE TRANSITIONAL `canvasWidth = cellWidth * zoom` ALIAS IS GONE.
   *
   * Task 02 renamed the geometry to `cellWidth`/`cellHeight` (grid cells,
   * 1:1 with the pixel data) and left an alias here so this file's ~1000-line
   * render loop kept compiling verbatim while still emitting
   * `fillRect(x * zoom, y * zoom, zoom, zoom)`. The consequence was the
   * documented intermediate state between tasks 02 and 05: the artwork was
   * CLIPPED to the top-left `cellWidth × cellHeight` corner, because a
   * `zoom`-times-larger drawing was being made into a 1:1 backing store.
   *
   * This task converted every painter in this file to cell space, so the
   * alias is deleted rather than renamed — that deletion is what proves no
   * `* zoom` survived. `CELL_SCALE` below is the one place the 1:1-ness is
   * still spelled out, for the pure painters whose signatures take a `zoom`.
   *
   * `contentWidth`/`contentHeight` (from `useCanvasGeometry`) remain the
   * on-screen box for the sites that legitimately need it — pan clamping and
   * view centring — and are the box every persisted `panOffset` was recorded
   * against (R1).
   */

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
    // ⚠️ `clampPanToViewport` is deliberately NOT taken here. Panning is
    // unrestricted as of 2026-08-31 — see `handleTouchMove`. The hook still
    // exports the helper, and it is still covered by its own tests, so an
    // opt-in clamp remains possible without rebuilding it.
    // ⚠️ `beginPinch` / `updatePinch` / `endPinch` are deliberately NOT taken
    // here any more: the hook binds them itself, natively and non-passively,
    // on the viewport. `isPinching` is still read, to suppress drawing while
    // a two-finger gesture is in flight.
    isPinching,
  } = useCanvasViewport({
    containerRef,
    contentWidth,
    contentHeight,
    panOffset,
    onCommitPan: (pan) => camera.setPanOffset(pan),
    // The view scale is PROJECT state as of 2026-08-28, so it follows the
    // project across devices exactly as `panOffset` always has (Full mode;
    // the Layer camera is session-only).
    viewZoom: camera.viewZoom,
    onCommitViewZoom: (z) => camera.setViewZoom(z),
    resyncKey: `${app.timelineUI.selectedObjectId ?? ""}|${
      app.timelineUI.selectedFrameId ?? ""
    }|${app.ui.lightingUI?.studioMode ?? ""}|${renderMode}`,
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

  /**
   * Grid coords that keep going OUTSIDE the grid instead of returning `null`.
   *
   * ⚠️ For the shape tools' in-flight drag ONLY, and deliberately UNCLAMPED.
   * A line/rectangle/ellipse drag must keep tracking the real pointer once it
   * leaves the canvas — the user is sizing the shape against the cursor and
   * does not need all of it to fit on the stage. Clamping to the border would
   * pin the shape's far corner at the edge, so dragging further out would stop
   * changing it and the drag would read as dead.
   *
   * Off-grid cells cost nothing: `setPixels` filters out-of-bounds cells at
   * commit (see `PixelStore`), so the shape lands cropped to the canvas, which
   * is exactly what aiming past the edge means.
   *
   * Painting tools keep using `getPixelCoords`, whose `null` is what stops a
   * brush from smearing along the border while the pointer is outside.
   */
  const getUnboundedPixelCoords = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "pixel-unbounded",
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

  /**
   * Reflection coords, snapped to the integer CORNER lattice.
   *
   * ⚠️ `"corner"`, not `"origin"`. Both round rather than floor, but they
   * round in different SPACES: `"origin"` is object-space half-cells (where
   * the origin marker lives), while `"corner"` is editable-grid space and
   * lands on `0..gridWidth × 0..gridHeight` — the lattice BETWEEN pixels,
   * which is the whole premise of the tool (D2).
   *
   * ⚠️ It CLAMPS rather than returning `null` off-grid, unlike the other two
   * modes. Dragging a guide past the edge of the sprite must give a line that
   * spans the whole grid, not abandon the gesture — so this returns `null`
   * only when there is no canvas at all.
   */
  const getCornerCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return screenToPixel(
        clientX,
        clientY,
        canvas.getBoundingClientRect(),
        coordGeomRef.current,
        "corner",
      );
    },
    [coordGeomRef],
  );

  /* ── the background: NO CANVAS, NO CACHE, NO BLIT (task 06) ───────────── */
  //
  // ⚠️ Read this before reintroducing anything here.
  //
  // What stood in this slot was `ensureBgCanvas`: allocate a
  // `cellWidth × cellHeight` offscreen canvas, `createImageData`, run
  // `paintCheckerboard` (a base fill over EVERY pixel plus a per-cell block
  // write), `putImageData`, cache the bitmap under `bgCacheKey`, and
  // `drawImage` it into a synthetic bottom layer canvas on every repaint.
  //
  // It is a CSS DIV now — `.canvas__background`, one compositor-drawn
  // element with a 2px `conic-gradient` tile, sitting inside the same
  // `scale(zoom * viewZoom)` transform as everything else and therefore
  // repainting on neither pan nor zoom. The only thing this container still
  // owns is the PHASE (`checkerParity` below), because the variant offset
  // lives here.
  //
  // The grid is not here either, and was not before this task: it is SVG
  // chrome (`gridPath` below, D5), where `non-scaling-stroke` keeps the
  // hairline one SCREEN pixel at every zoom. At 1:1 the raster `strokeGrid`
  // drew a 1px line every 1px — a flat wash over the whole canvas, MASTER
  // §4's first named silent failure.
  //
  // `paintCheckerboard` / `backgroundTheme` are deliberately still imported
  // by NOBODY in this file, but they are NOT dead: `renderNormalEdit.ts` and
  // `renderLitComposite.ts` in the lighting studio still call them, and
  // `LightingCanvasContainer` still calls `strokeGrid`. Deleting them breaks
  // the lighting canvas (task 08 owns that migration).

  /**
   * The checkerboard's world-space phase, reduced to 0 or 1 per axis.
   *
   * ⚠️ THIS IS THE PARITY INVARIANT, and it is the one thing about the
   * background that is easy to lose. `paintCheckerboard` chose a square's
   * colour from `(offsetX + px + offsetY + py) % 2` — WORLD cells, not
   * surface cells — so a variant view scrolled by an ODD number of cells
   * keeps the phase it had in object space. The CSS DIV reproduces it with a
   * `background-position` shift on a 2px tile, where a one-pixel shift IS a
   * parity flip.
   *
   * `bgGeom.offsetX` is `Math.min(0, variantOffset.x)` in variant-edit mode
   * and 0 otherwise, so it can be NEGATIVE — hence the double modulo rather
   * than a bare `% 2`, which in JS returns -1 for -1 and would offset the
   * background by a negative pixel instead of flipping it.
   */
  const checkerParity = useMemo(
    () => ({
      x: ((bgGeom.offsetX % 2) + 2) % 2,
      y: ((bgGeom.offsetY % 2) + 2) % 2,
    }),
    [bgGeom.offsetX, bgGeom.offsetY],
  );

  /* ══════════════════════════════════════════════════════════════════════
   *  THE PER-LAYER RENDER (concern #6) — plan 05, task 05
   * ══════════════════════════════════════════════════════════════════════
   *
   * This replaced a ~1000-line `useCallback` with three branches (Layer,
   * variant-edit, normal), each of which walked EVERY cell of EVERY visible
   * layer, built an `rgba(...)` STRING per cell, and `fillRect`-ed it into one
   * shared canvas. On the owner's `Landscapes` project that was 57,344 string
   * allocations and 57,344 canvas calls per repaint — on every pixel edit.
   *
   * ── The shape now ────────────────────────────────────────────────────────
   *
   * Two functions with disjoint jobs, and the split is the point:
   *
   *   `renderLayers`  paints EACH layer into ITS OWN 1:1 canvas, and nothing
   *                   else. Cross-layer compositing is the browser's, via the
   *                   stacked `<canvas>` elements CanvasSurface mounts.
   *   `renderChrome`  paints everything that is not artwork — the selection
   *                   fills, the move/drag previews, the preview pixels, the
   *                   object bounds and the variant rectangle — onto the
   *                   shared pointer surface, which sits ABOVE the stack.
   *
   * Both still run from ONE `useCanvasRender(render, [render, pixelVersion])`
   * so the invalidation signal is unchanged (task 07 owns the dirty region;
   * `pixelDirty` is deliberately not consumed here).
   *
   * ── Dimming: JS → CSS (D4) ──────────────────────────────────────────────
   *
   * `layerFocusMode`'s per-cell `alpha * 0.5` / `* 0.7` multiply is gone from
   * the hot loop. `layerOpacity` below hands `CanvasSurface` a CSS `opacity`
   * per layer canvas and the compositor applies it. `VARIANT_EDIT_REGULAR_DIM`
   * and `VARIANT_EDIT_OTHER_DIM` are the same two constants, now in
   * `ui/theme/canvasTokens`.
   *
   * ⚠️ `onion` is NOT an opacity and is NOT in that table. It is outline-only
   * rendering via a 4-neighbour emptiness test, and it stays a PAINT-time
   * decision — `paintLayerCells`' `onionOutline` flag. Passing it as an
   * opacity renders solid silhouettes, which is the opposite of an outline.
   *
   * ── ⚠️ RISK R4: alpha compositing genuinely changes here ────────────────
   *
   * Two canvases stacked with CSS `opacity` do not composite identically to
   * one canvas with a per-cell alpha multiply: CSS applies the opacity to the
   * composited layer AS A WHOLE, where the old code multiplied per cell
   * BEFORE compositing. For a single layer the two agree. For overlapping
   * semi-transparent cells they can differ. The owner accepted this in
   * principle ("I don't really care about the gradient per pixel effect");
   * the side-by-side visual comparison is this wave's sign-off evidence and
   * is deferred to the consolidated pass after W6.
   *
   * ── The layer identity scheme, and why variants get one canvas EACH ─────
   *
   * `paintKey` is the id a layer's canvas is registered under. For a regular
   * layer it is `layer.id`. For a VARIANT layer it is
   * `${layer.id}::${variantSubLayer.id}` — one canvas per variant SUB-layer,
   * not one per variant layer.
   *
   * That is not tidiness. It is what makes `putImageData` safe: a single
   * pixel grid holds exactly one cell per (x, y), so no two writes in one
   * paint can land on the same device pixel. Compositing a variant's several
   * sub-layers into one buffer would reintroduce exactly the JS alpha
   * arithmetic R4 is about, in the one place it is avoidable.
   */

  /**
   * Does the move tool's live drag shift this layer?
   *
   * ⚠️ It answers "would `moveLayerPixels` shift it", NOT "is a drag in
   * flight" — the drag OFFSET is applied in `renderLayers`, which is the only
   * place that reads it. Keeping the two apart is what lets `layerPlan` be
   * memoised on the layer SHAPE and not rebuild on every pointer sample of a
   * move drag: `moveDragOffset` changes per sample, `moveAllLayers` and the
   * selected layer do not.
   *
   * Verbatim from the pre-per-layer `movesWithDrag`, minus the
   * `moveDx !== 0 || moveDy !== 0` term, which `renderLayers` now applies by
   * passing a zero offset.
   */
  const movesWithDragId = useCallback(
    (id: string) => tool.moveAllLayers || id === layer?.id,
    [tool.moveAllLayers, layer?.id],
  );

  /** Every layer canvas registered by `CanvasSurface`, keyed by `paintKey`. */
  const layerCanvasesRef = useRef(new Map<string, HTMLCanvasElement>());

  /**
   * ⚠️ MUST be `useCallback`-stable.
   *
   * `CanvasSurface.useLayerRefs` memoises one ref callback per id and rebuilds
   * the whole map when THIS function's identity changes. An inline arrow here
   * would rebuild every closure on every render, so React would detach and
   * reattach every layer canvas on every pan frame, wheel tick and hover
   * sample — firing `(id, null)` through this map at pointer rate and
   * discarding at the ref level exactly the pooling keyed reconciliation buys
   * at the DOM level. `CanvasSurface`'s header says so explicitly.
   */
  const registerLayerCanvas = useCallback(
    (id: string, el: HTMLCanvasElement | null) => {
      if (el) layerCanvasesRef.current.set(id, el);
      else layerCanvasesRef.current.delete(id);
    },
    [],
  );

  /**
   * What gets a canvas, in what order, at what opacity — the whole per-layer
   * plan, derived once and consumed by both the painter and the JSX.
   *
   * Ordered bottom → top: the background, then `frame.layers` in array order,
   * which is the z-order `CanvasSurface` renders them in (D3).
   *
   * ⚠️ This reads `frame.layers` and the variant tree, but it reads only their
   * SHAPE — ids, visibility, offsets, grid sizes. It never touches
   * `layer.pixels`, so nothing here deep-observes a 300k-cell grid (R2). The
   * pixels are read imperatively, in `renderLayers`, from an animation frame.
   */
  const layerPlan = useMemo((): LayerPaintPlan[] => {
    // ⚠️ Starts EMPTY. Task 05 seeded it with a synthetic `"::background"`
    // entry so the checkerboard could get a canvas under the artwork; task 06
    // deleted that when the checkerboard became a CSS DIV on `--z-behind`.
    // Every key in here is a real `Layer.id` (or a `parent::child` variant
    // sub-layer key) again.
    const plan: LayerPaintPlan[] = [];
    if (!frame || !obj) return plan;

    // Layer Render Mode: the editable grid at the origin and nothing else —
    // the variant's OWN layers (the set the Full view composites for it), or
    // the current layer on the object grid. No offset, no dimming, no object
    // outline. Verbatim from the branch `drawLayerView` used to serve.
    if (layerMode) {
      const layers =
        editingVariant && variantData
          ? variantData.variantFrame.layers
          : layer
            ? [layer]
            : [];
      for (const l of layers) {
        plan.push({
          key: l.id,
          visible: l.visible,
          opacity: 1,
          pixels: l.pixels,
          gridWidth,
          gridHeight,
          offsetX: 0,
          offsetY: 0,
          onionOutline: false,
          moves: movesWithDragId(l.id),
        });
      }
      return plan;
    }

    const editing = isEditingVariantResolved;
    const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

    for (const l of frame.layers) {
      if (l.isVariant && l.variantGroupId) {
        const vg = app.domain.variants?.find((g) => g.id === l.variantGroupId);
        const variant = vg?.variants.find((v) => v.id === l.selectedVariantId);
        const variantFrameIdx =
          app.timelineUI.variantFrameIndices?.[l.variantGroupId] ?? 0;
        const vFrame =
          variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];
        if (!variant || !vFrame) continue;

        const vOffset = resolveVariantOffset(l, variant, baseFrameIndex);
        const isCurrentLayer = l.id === layer?.id;
        // ── D4's table, verbatim ──────────────────────────────────────────
        // The edited variant always reads at full alpha; another variant
        // follows the focus mode. Outside variant-edit nothing is dimmed.
        const opacity =
          editing && !isCurrentLayer && layerFocusMode !== "normal"
            ? VARIANT_EDIT_OTHER_DIM
            : 1;
        // Onion is a PAINT decision, never an opacity — see the header.
        const onionOutline =
          editing && !isCurrentLayer && layerFocusMode === "onion";
        // In variant-edit mode `moveLayerPixels` shifts the VARIANT's frame
        // layers, clipped to the variant grid; outside it the variant layer
        // is composited untouched.
        const moves = editing && isCurrentLayer;

        for (const vl of vFrame.layers) {
          plan.push({
            // One canvas per variant SUB-layer: see the header on why this is
            // what makes `putImageData` safe.
            key: `${l.id}::${vl.id}`,
              visible: l.visible && vl.visible,
            opacity,
            pixels: vl.pixels,
            gridWidth: variant.gridSize.width,
            gridHeight: variant.gridSize.height,
            offsetX: vOffset.x,
            offsetY: vOffset.y,
            onionOutline,
            moves,
          });
        }
        continue;
      }

      // A regular layer. ⚠️ The bounds differ by mode and always did: in
      // variant-edit the editable grid is the VARIANT's, so walking it would
      // truncate the object — the object's own dimensions are the right ones.
      plan.push({
        key: l.id,
        visible: l.visible,
        opacity: editing && layerFocusMode !== "normal"
          ? VARIANT_EDIT_REGULAR_DIM
          : 1,
        pixels: l.pixels,
        gridWidth: editing ? objWidth : gridWidth,
        gridHeight: editing ? objHeight : gridHeight,
        offsetX: 0,
        offsetY: 0,
        onionOutline: editing && layerFocusMode === "onion",
        moves: movesWithDragId(l.id),
      });
    }

    return plan;
  }, [
    app.domain,
    app.timelineUI,
    frame,
    obj,
    layer,
    layerMode,
    editingVariant,
    variantData,
    isEditingVariantResolved,
    layerFocusMode,
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    movesWithDragId,
  ]);

  /** Ids only, bottom → top. The whole R8 mitigation is that this is strings. */
  const layerIds = useMemo(() => layerPlan.map((p) => p.key), [layerPlan]);

  /** CSS opacity per layer canvas (D4). */
  const layerOpacity = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of layerPlan) out[p.key] = p.opacity;
    return out;
  }, [layerPlan]);

  /** `display: none` per layer canvas — keeps the element and its bitmap. */
  const layerVisible = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const p of layerPlan) out[p.key] = p.visible;
    return out;
  }, [layerPlan]);

  /**
   * The CURRENT cell grid for a paint key, read imperatively from the live
   * tree — or `null` when the key names nothing there.
   *
   * ⚠️ Exists because `layerPlan` can be one write stale at paint time; see
   * the note at its call site in `renderLayers`. `null` is not an error: the
   * Layer-mode plan and the variant plan build keys the object frame does not
   * hold, and those fall back to the plan's own reference, which is correct
   * for them because nothing writes to them out of band.
   *
   * ⚠️ Reads `layer.pixels` — an `observableRef` — WITHOUT observing it. This
   * runs from an animation frame, never from a render, so no reaction is
   * being tracked and no cell is ever proxied (R2).
   */
  const livePixelsFor = useCallback(
    (key: string): PixelData[][] | null => {
      const frameNow = app.currentFrame;
      if (!frameNow) return null;

      const sep = key.lastIndexOf("::");
      if (sep === -1) {
        return frameNow.layers.find((l) => l.id === key)?.pixels ?? null;
      }

      // A variant sub-layer: `parentLayerId::subLayerId`. Resolve the parent
      // in the frame, then its selected variant's current frame, then the sub
      // layer — the same walk `layerPlan` does, against the live tree.
      const parent = frameNow.layers.find((l) => l.id === key.slice(0, sep));
      if (!parent?.variantGroupId) return null;
      const vg = app.domain.variants?.find((g) => g.id === parent.variantGroupId);
      const variant = vg?.variants.find((v) => v.id === parent.selectedVariantId);
      if (!variant || variant.frames.length === 0) return null;
      const idx =
        (app.timelineUI.variantFrameIndices?.[parent.variantGroupId] ?? 0) %
        variant.frames.length;
      const vFrame = variant.frames[idx];
      return (
        vFrame?.layers.find((vl) => vl.id === key.slice(sep + 2))?.pixels ?? null
      );
    },
    [app],
  );

  /**
   * Paint every layer into its own canvas — or, when `scope` names cells,
   * ONLY those cells on ONLY the layers they belong to.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THIS IS THE PAYOFF OF PLAN 05: "only the pixels affected"
   * ══════════════════════════════════════════════════════════════════════
   *
   * On the owner's `Landscapes` project (256x224, one layer) a one-cell
   * pencil dot used to walk 57,344 cells. Under `scope.kind === "cells"` it
   * walks the cells the store named, which for a dot is exactly one.
   *
   * ── The three things the incremental path must get right ───────────────
   *
   *  1. **The layer id must be matched, not assumed.** `pixelDirty.layerId`
   *     is a `Layer.id`. For a REGULAR layer that is the paint key. For a
   *     VARIANT sub-layer the paint key is `${parentLayer.id}::${subLayer.id}`
   *     and the store publishes the SUB-layer's id (`PixelStore.resolveTarget`
   *     returns `variantFrame.layers[0]` as its `layer`), so a plain map
   *     lookup would miss every variant edit — silently, leaving the variant's
   *     pixels stale until something forced a full repaint.
   *     `dirtyCellsFor` resolves both forms.
   *  2. **Clear before painting.** A cell that became transparent produces no
   *     write in `paintLayerCells` at all, so overpainting leaves the old
   *     colour — erasing would leave ghosts. `clearLayerCells` punches
   *     exactly the destinations the paint is about to fill.
   *  3. **Onion mode dilates (D9).** `isOutlineCell` reads four neighbours,
   *     so a one-cell write changes its NEIGHBOURS' outline status too.
   *     `dilateCells` grows the list before it is used, and the SAME grown
   *     list is cleared, so a neighbour that stopped being an outline cell is
   *     cleared and then not repainted.
   *
   * ── Why a bounding box, and why it is READ BACK ────────────────────────
   *
   * `createImageData(canvas.width, canvas.height)` for a one-cell edit would
   * allocate the whole surface — reintroducing the very cost this removes. So
   * the incremental path works on a buffer the size of the dirty cells'
   * BOUNDING BOX: 1x1 for a pencil dot, the stroke's extent for a drag.
   *
   * That buffer is `getImageData`, not `createImageData`, and the difference
   * is a correctness one rather than an optimisation — `putImageData`
   * replaces the whole rectangle, so a blank box would erase every pixel
   * inside it that was not dirty. See the note at the call.
   *
   * ⚠️ Reads `layer.pixels` IMPERATIVELY, from an animation frame — never
   * through `observer()`. `layer.pixels` is `observableRef` exactly so MobX
   * never walks a 300,249-cell tree (R2), and this is the only consumer.
   */
  const renderLayers = useCallback(
    (scope: DirtyScope) => {
      const moveDx = isDraggingPixels ? moveDragOffset.dx : 0;
      const moveDy = isDraggingPixels ? moveDragOffset.dy : 0;
      // The whole view is shifted so world (viewMinX, viewMinY) lands at
      // canvas (0, 0) — outside variant-edit both are 0 and this is a no-op.
      const viewOx = isEditingVariantResolved ? -viewMinX : 0;
      const viewOy = isEditingVariantResolved ? -viewMinY : 0;

      /**
       * The dirty cells for one paint key, or `null` for "repaint it whole".
       *
       * Returns `null` — never an empty array — when the scope is `"all"`, so
       * the caller cannot confuse "everything" with "nothing".
       */
      const dirtyCellsFor = (
        key: string,
      ): readonly { x: number; y: number }[] | null => {
        if (scope.kind === "all") return null;
        const direct = scope.byLayer.get(key);
        if (direct) return direct;
        // The variant form: the plan key is `parent::sub` and the store
        // published `sub`. See note 1 in the header.
        const sep = key.lastIndexOf("::");
        if (sep === -1) return null;
        const sub = scope.byLayer.get(key.slice(sep + 2));
        return sub ?? null;
      };

      for (const item of layerPlan) {
        const canvas = layerCanvasesRef.current.get(item.key);
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) continue;

        // ⚠️ NEAREST-NEIGHBOUR, ALWAYS. Every overlay context in this file
        // sets this; the per-layer artwork canvases were created by plan 05
        // and did not, which blurred the artwork's EDGES at every zoom rather
        // than only under the compositing path.
        //
        // This is a SEPARATE mechanism from `image-rendering: pixelated`,
        // which governs how the browser scales the finished bitmap.
        // `imageSmoothingEnabled` governs interpolation INSIDE the 2D context
        // — `drawImage` and the `putImageData`-adjacent paths below — so the
        // two are not alternatives and both are required. The default is
        // `true`, and it resets whenever a context's backing store is
        // resized, so it is set here on every acquisition rather than once at
        // creation.
        ctx.imageSmoothingEnabled = false;

        // ══════════════════════════════════════════════════════════════════
        //  ⚠️ THE GRID IS RE-READ FROM THE LIVE TREE, NOT TAKEN FROM THE PLAN
        // ══════════════════════════════════════════════════════════════════
        //
        // `layerPlan` is a `useMemo`, so its `pixels` are whatever React last
        // rendered with. The dirty reaction fires SYNCHRONOUSLY at the end of
        // the write action — before React has re-rendered — so a frame that
        // runs from that reaction can see a plan one write behind.
        //
        // In a browser rAF defers the paint past React's commit and the two
        // usually agree; "usually" is not a guarantee worth resting the
        // whole feature on, and under a synchronous scheduler they never
        // agree. Measured: the incremental path painted the OLD colour, so a
        // fresh stroke drew nothing at all while every `putImageData` call
        // looked perfectly correct.
        //
        // `livePixelsFor` resolves the key against the current tree. It is a
        // plain imperative read of an `observableRef` field — no proxying, no
        // observation, and nothing walks a cell (R2).
        const pixels = livePixelsFor(item.key) ?? item.pixels;

        const cells = scope.kind === "all" ? null : dirtyCellsFor(item.key);

        // ── The FAST PATH: this scope names cells, and none are ours ──────
        //
        // Nothing on this layer changed, so its canvas is already correct.
        // Leaving it entirely alone is the whole saving: on a 7-layer sprite
        // an edit now touches ONE canvas, not seven.
        if (scope.kind === "cells" && (!cells || cells.length === 0)) continue;

        if (cells === null) {
          // ⚠️ Cleared unconditionally, INCLUDING for a hidden layer.
          // `display: none` keeps the bitmap alive, so a layer that is
          // emptied or hidden while its canvas still holds paint would show
          // that paint again the moment it is re-shown. Clearing costs
          // nothing next to a repaint.
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (!item.visible) continue;
          if (!pixels) continue;

          const buffer = ctx.createImageData(canvas.width, canvas.height);
          paintLayerCells(buffer, {
            pixels,
            gridWidth: item.gridWidth ?? 0,
            gridHeight: item.gridHeight ?? 0,
            getPixelColor,
            offsetX: (item.offsetX ?? 0) + viewOx,
            offsetY: (item.offsetY ?? 0) + viewOy,
            moveDx: item.moves === true ? moveDx : 0,
            moveDy: item.moves === true ? moveDy : 0,
            onionOutline: item.onionOutline === true,
          });
          ctx.putImageData(buffer, 0, 0);
          continue;
        }

        // ── The INCREMENTAL PATH ─────────────────────────────────────────
        if (!item.visible || !pixels) {
          // A hidden or gridless layer under an incremental scope: the
          // full-repaint branch above would have cleared it, and it must
          // still be cleared here or paint from before it was hidden
          // survives. Cheap, and it cannot be skipped.
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          continue;
        }

        const gw = item.gridWidth ?? 0;
        const gh = item.gridHeight ?? 0;
        const ox = (item.offsetX ?? 0) + viewOx;
        const oy = (item.offsetY ?? 0) + viewOy;
        const mdx = item.moves === true ? moveDx : 0;
        const mdy = item.moves === true ? moveDy : 0;
        const onion = item.onionOutline === true;

        // D9: grow the list BEFORE it is used, and use the grown list for the
        // clear as well as the paint.
        const painted = onion ? dilateCells(cells) : cells;

        // The destination bounding box, in surface cells, clipped to the
        // surface. Computed on the SHIFTED, OFFSET positions because that is
        // where the writes land.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const cell of painted) {
          if (cell.x < 0 || cell.y < 0 || cell.x >= gw || cell.y >= gh) continue;
          const sx = cell.x + mdx;
          const sy = cell.y + mdy;
          if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) continue;
          const px = sx + ox;
          const py = sy + oy;
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
            continue;
          }
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
        // Every cell fell outside the surface — the clear above already did
        // whatever was needed and there is nothing to paint.
        if (minX === Infinity) continue;

        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;

        // ══════════════════════════════════════════════════════════════════
        //  ⚠️ THE BUFFER IS SEEDED FROM THE CANVAS, NOT CREATED BLANK
        // ══════════════════════════════════════════════════════════════════
        //
        // `putImageData` REPLACES every pixel of the rectangle it is given —
        // it does not composite. A blank `createImageData` box would
        // therefore ERASE every pixel inside the box that is not in
        // `painted`, and the box is only as tight as the dirty cells happen
        // to be: two dots at opposite corners of one frame produce a box
        // spanning the whole sprite, and everything between them would
        // vanish. That is the exact "stale/wrong pixel" failure this task
        // treats as strictly worse than a redundant repaint.
        //
        // So the box is READ BACK first. Untouched interior pixels are
        // written back byte-identical; the dirty ones are zeroed
        // (`clearLayerCells` below, which is what makes an erase to
        // transparent actually clear rather than leave a ghost) and then
        // repainted from the live grid.
        const buffer = ctx.getImageData(minX, minY, boxW, boxH);

        // Clear the dirty destinations INSIDE the read-back buffer. Same
        // clipping as the paint, so a cell whose move pushes it off the grid
        // is left alone here too.
        clearLayerCells(
          {
            clearRect: (cx: number, cy: number) => {
              const idx = ((cy - minY) * boxW + (cx - minX)) * 4;
              buffer.data[idx] = 0;
              buffer.data[idx + 1] = 0;
              buffer.data[idx + 2] = 0;
              buffer.data[idx + 3] = 0;
            },
          },
          {
            cells: painted,
            gridWidth: gw,
            gridHeight: gh,
            surfaceWidth: canvas.width,
            surfaceHeight: canvas.height,
            offsetX: ox,
            offsetY: oy,
            moveDx: mdx,
            moveDy: mdy,
          },
        );

        paintLayerCells(buffer, {
          pixels,
          gridWidth: gw,
          gridHeight: gh,
          getPixelColor,
          // Shift the destination into the box's own coordinates.
          offsetX: ox - minX,
          offsetY: oy - minY,
          moveDx: mdx,
          moveDy: mdy,
          onionOutline: onion,
          cells: painted,
        });
        ctx.putImageData(buffer, minX, minY);
      }
    },
    [
    layerPlan,
    livePixelsFor,
    isDraggingPixels,
    moveDragOffset.dx,
    moveDragOffset.dy,
    isEditingVariantResolved,
    viewMinX,
    viewMinY,
  ]);

  /**
   * Everything that is NOT artwork, on the shared pointer surface.
   *
   * That surface sits ABOVE the layer stack in DOM order (`CanvasSurface.css`
   * — no z-index is involved, source order is the z-order), so chrome painted
   * here lands over the sprite exactly as it did when one canvas held both.
   *
   * ⚠️ Everything is in CELL space: one unit, one device pixel, magnified by
   * the CSS transform. There is no `* zoom` anywhere below and there may not
   * be — a surviving one is what clipped the artwork between tasks 02 and 05.
   *
   * The GRID LINES are NOT here: at 1:1 a 1px line every 1px is a flat wash
   * over the whole surface. They are vector chrome now (`gridPath`, D5).
   */
  const renderChrome = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !frame || !obj) return;

    ctx.imageSmoothingEnabled = false;
    // ⚠️ CLEARED, not painted over with the background. The background moved
    // to its own canvas UNDER the layer stack; painting it here would hide
    // every layer beneath this surface.
    ctx.clearRect(0, 0, cellWidth, cellHeight);

    // View-space shift, as in `renderLayers`.
    if (isEditingVariantResolved) {
      ctx.save();
      ctx.translate(-viewMinX, -viewMinY);
    }

    /* The in-flight preview. Bounds-tested in GRID space, drawn in world
       space — the variant offset is applied after the test.

       ⚠️ IT MUST READ OVER ARTWORK, NOT BLEND INTO IT. This used to paint the
       whole preview at `PREVIEW_ALPHA` in the tool's own colour, which is
       nearly invisible wherever the shape crosses pixels of a similar colour
       — the operation looked like it was drawing UNDERNEATH the existing art
       (owner report, 2026-09-01). The surface canvas is already above the
       layer stack, so this was never a stacking-order problem; it was alpha.

       Two changes fix it: the affected cells are painted OPAQUE in the colour
       they will actually commit to, and the shape's silhouette is ringed in a
       contrasting outline so its extent is legible even against artwork the
       same colour as the preview.

       The per-pixel colour also makes the preview honest about the edge/fill
       split — a `"both"` rectangle previews in both colours, exactly as it
       will land. */
    if (previewPixels.length > 0) {
      const pox = isEditingVariantResolved ? variantOffset.x : 0;
      const poy = isEditingVariantResolved ? variantOffset.y : 0;

      // Which cells take the edge colour; `null` outside a "both" shape, where
      // one colour covers the whole preview. Mirrors `finishDrawingStroke`.
      const previewOutlineKeys =
        isShapeTool(currentTool) &&
        shapeMode === "both" &&
        drawStartPoint &&
        lastShapeAimRef.current
          ? getShapeOutlineKeys(
              currentTool as "line" | "rectangle" | "ellipse",
              drawStartPoint as Point,
              lastShapeAimRef.current,
              borderRadius,
            )
          : null;

      const soleColor = isShapeTool(currentTool)
        ? shapeMode === "fill"
          ? fillColor
          : currentColor
        : currentColor;

      const visible = previewPixels.filter(
        ({ x, y }) => x >= 0 && x < gridWidth && y >= 0 && y < gridHeight,
      );

      /* ⚠️ ONLY THE SHAPE TOOLS GO OPAQUE. The brush preview keeps
         `PREVIEW_ALPHA`: it tracks the cursor one dab at a time and is drawn
         where the user is already looking, so its translucency reads as
         "not committed yet" rather than as an occlusion problem. A shape spans
         the artwork and must be legible over all of it. */
      const previewAlpha = isShapeTool(currentTool) ? 1 : PREVIEW_ALPHA;

      for (const { x, y } of visible) {
        const c = previewOutlineKeys
          ? previewOutlineKeys.has(`${x},${y}`)
            ? currentColor
            : fillColor
          : soleColor;
        // `c.a` still honours a deliberately translucent colour.
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255) * previewAlpha})`;
        ctx.fillRect(x + pox, y + poy, 1, 1);
      }

      /* The silhouette ring — SHAPES ONLY, for the same reason the opacity is.
         Drawn as the outer edges of the affected cells (a cell contributes an
         edge wherever its neighbour is NOT part of the preview), so it traces
         the operation's true extent, holes included, rather than a bounding
         box. Hairline width in CELL space, because the whole surface is
         magnified by the CSS transform. */
      if (isShapeTool(currentTool)) {
        const inPreview = new Set(visible.map(({ x, y }) => `${x},${y}`));
        ctx.strokeStyle = PREVIEW_RING;
        ctx.lineWidth = PREVIEW_RING_WIDTH;
        ctx.beginPath();
        for (const { x, y } of visible) {
          const gx = x + pox;
          const gy = y + poy;
          if (!inPreview.has(`${x},${y - 1}`)) {
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + 1, gy);
          }
          if (!inPreview.has(`${x},${y + 1}`)) {
            ctx.moveTo(gx, gy + 1);
            ctx.lineTo(gx + 1, gy + 1);
          }
          if (!inPreview.has(`${x - 1},${y}`)) {
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx, gy + 1);
          }
          if (!inPreview.has(`${x + 1},${y}`)) {
            ctx.moveTo(gx + 1, gy);
            ctx.lineTo(gx + 1, gy + 1);
          }
        }
        ctx.stroke();
      }
    }

    if (isEditingVariantResolved) {
      // Object bounds — the dashed orange rectangle showing where the OBJECT
      // is while a variant that may overhang it is being edited.
      ctx.strokeStyle = WARN_ORANGE_40;
      ctx.lineWidth = CHROME_STROKE;
      ctx.setLineDash(OBJECT_BOUNDS_DASH);
      ctx.strokeRect(0, 0, objWidth, objHeight);
      ctx.setLineDash([]);

      // The variant editing area.
      ctx.strokeStyle = ACCENT_VARIANT;
      ctx.lineWidth = CHROME_STROKE;
      ctx.strokeRect(
        variantOffset.x,
        variantOffset.y,
        gridWidth,
        gridHeight,
      );
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
      if (selection.mask.size <= SELECTION_FILL_CELL_LIMIT) {
        ctx.fillStyle = ACCENT_PRIMARY_14;
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect(x + offsetX + dragDx, y + offsetY + dragDy, 1, 1);
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

      if (srcPixels && selection.mask.size <= SELECTION_FILL_CELL_LIMIT) {
        ctx.fillStyle = BLACK_12;
        for (const idx of selection.mask) {
          const x = idx % selection.width;
          const y = Math.floor(idx / selection.width);
          ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
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
          ctx.fillRect(destX + offsetX, destY + offsetY, 1, 1);
        }
      }
    }

    if (isEditingVariantResolved) {
      ctx.restore();
    }
  }, [
    frame,
    obj,
    layer,
    cellWidth,
    cellHeight,
    previewPixels,
    currentColor,
    // Read by the shape preview: it paints each cell the colour it will
    // COMMIT to, so the edge/fill pair and the shape settings that decide
    // which cell is which all have to invalidate this painter. Omitting them
    // renders the preview with whatever they were on the last unrelated
    // change — visibly wrong the moment the mode or a colour is switched
    // mid-drag.
    fillColor,
    currentTool,
    shapeMode,
    borderRadius,
    drawStartPoint,
    gridWidth,
    gridHeight,
    objWidth,
    objHeight,
    selection,
    previewSelection,
    isEditingVariantResolved,
    variantData,
    variantOffset,
    viewMinX,
    viewMinY,
    isDraggingSelection,
    selectionDragMode,
    pixelDragOffset.dx,
    pixelDragOffset.dy,
  ]);

  /**
   * The one entry point `useCanvasRender` drives, so the two halves stay in
   * lockstep on a single animation frame.
   */
  const render = useCallback(
    (scope: DirtyScope) => {
      renderLayers(scope);
      // ⚠️ CHROME IS ALWAYS REPAINTED IN FULL, and deliberately so.
      //
      // The chrome surface carries the brush preview, the selection fill, the
      // move preview and the variant rectangle. None of those is a pixel
      // write and none of them is described by `pixelDirty`, so narrowing
      // them by the dirty region would be narrowing them by an unrelated
      // signal. It is one `clearRect` plus a handful of `fillRect`s on the
      // cells the user is actually interacting with, not a sweep of the grid,
      // so there is nothing here worth the risk of getting wrong.
      renderChrome();
    },
    [renderLayers, renderChrome],
  );

  /* ── the hover marker (concern #12) ────────────────────────────────────── */
  //
  // ══════════════════════════════════════════════════════════════════════
  //  WHY THIS IS A SEPARATE CANVAS AND A SEPARATE SCHEDULER
  // ══════════════════════════════════════════════════════════════════════
  //
  // `render` above repaints every visible cell of every visible layer (it is
  // per-layer and buffer-based as of plan 05 task 05, but it is still a full
  // repaint until task 07 lands the dirty region). An Apple Pencil emits
  // hover samples continuously while the
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
      switch (markerAction({ device, phase, isDrawing, tool: currentTool })) {
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
    [isDrawing, setHoverPixel, currentTool],
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
    // ⚠️ The reflection tool is the ONE tool whose marker is suppressed
    // (reflection-tool task 07, recorded choice). `toolFootprint` gives it the
    // class-3 single-cell marker, which is not merely uninformative here but
    // actively WRONG: the gesture snaps to the corner LATTICE between cells,
    // so a filled cell outline sits half a cell away from where the guide will
    // land and reads as "this pixel will be edited". The draft guide on the
    // reflection overlay is the correct feedback and is already drawn.
    //
    // `origin` deliberately keeps its marker — it writes an object-space point
    // that is genuinely near the cell shown — so this is not "treat like
    // origin"; it is a divergence, made because the two snap to different
    // lattices.
    if (currentTool === "reflection") return [];
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

  /**
   * The hover marker's FILL. ⚠️ Its OUTLINE is no longer painted here.
   *
   * `strokeHoverOutline` computes every edge as `left + zoom - 1`, which at
   * 1:1 is a ZERO-LENGTH segment — and with `lineCap: "butt"` a zero-length
   * segment renders NOTHING, with no error and no artifact (MASTER §4, R3).
   * The outline is the SVG `hoverOutline` path (D5); this keeps the fill,
   * which is a cell fill and safe at 1:1 (D6).
   */
  /**
   * Place hover cells in the surface's coordinate space.
   *
   * Shared by the raster FILL below and the SVG `hoverOutline` further down,
   * so the two halves of one marker cannot disagree about where it is —
   * which they would the moment either grew its own copy of this offset.
   */
  const placeHoverCells = useCallback(
    (cells: readonly { x: number; y: number }[]) => {
      const offsetX = isEditingVariantResolved ? variantOffset.x - viewMinX : 0;
      const offsetY = isEditingVariantResolved ? variantOffset.y - viewMinY : 0;
      if (offsetX === 0 && offsetY === 0) return cells;
      return cells.map((c) => ({ x: c.x + offsetX, y: c.y + offsetY }));
    },
    [isEditingVariantResolved, variantOffset, viewMinX, viewMinY],
  );

  const renderHover = useCallback(() => {
    const canvas = hoverCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, cellWidth, cellHeight);
    const hoverCells = resolveHoverCells();
    if (hoverCells.length === 0) return;

    ctx.imageSmoothingEnabled = false;

    // The marker shares the main render's coordinate space, so it needs the
    // same variant-edit translation: while a variant is being edited the grid
    // is drawn at the variant's offset within an expanded view, and a marker
    // painted at raw cell coordinates would sit that offset away from the
    // cells the stroke will actually hit.
    const placed = placeHoverCells(hoverCells);

    // `createImageData` allocates per frame, as the lighting overlay does; the
    // marker repaints only when the hovered CELL changes, so this is not a
    // per-sample cost. `zoom: 1` — one cell, one device pixel.
    const buffer = ctx.createImageData(cellWidth, cellHeight);
    paintHoverCells(buffer, placed, CELL_SCALE);
    ctx.putImageData(buffer, 0, 0);
  }, [cellWidth, cellHeight, resolveHoverCells, placeHoverCells]);

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

  /* ══════════════════════════════════════════════════════════════════════
   *  CONCERN #14 — THE POSE TOOL'S 3D REFERENCE (pose-tool task 08)
   * ══════════════════════════════════════════════════════════════════════
   *
   * ONE contiguous region, deliberately: this file already carries thirteen
   * concerns and a fourteenth scattered through it would be unfindable.
   * Everything the pose overlay needs — the engine's lifecycle, the mesh, the
   * camera, the painter, the pan drag and the stamp — is between here and the
   * "end of concern #14" marker. Its GESTURE branches are the only exception,
   * and they have to live in the pointer handlers with the others.
   *
   * ── The shape of it, and why each piece is the way it is ────────────────
   *
   * 1. **Its own `useCanvasRender`** (D11), never the main `render`. Orb
   *    drags and pans are pointer-rate; routing them through `render` would
   *    repaint every visible cell of every visible layer per sample — the
   *    measured 2026-08-28 class of bug, restated for a third overlay. The
   *    hover marker and the reflection guides above made exactly this call.
   *
   * 2. **The render target is EXACTLY `cellWidth × cellHeight`** (D5) — one
   *    texel per art pixel, blitted with `putImageData` at 1:1. There is no
   *    `drawImage` anywhere on this path and there must never be one:
   *    magnification is the single CSS transform on `.canvas__layout` plus
   *    `image-rendering: pixelated`, exactly as for every other canvas in the
   *    stack. Rendering large and downsampling is the one thing that would
   *    defeat the whole feature.
   *
   * 3. **The engine is created LAZILY**, on first activation, and held in a
   *    ref. It pulls three's ~734 kB chunk; a user who never opens the tool
   *    must never pay for it. It is disposed on unmount — WebGL contexts are
   *    capped (~16 per page) and three does not GC GPU memory, so a leaked
   *    renderer per tool switch crashes the tab.
   *
   * 4. **Drag state lives in REFS**, and the repaint is `invalidate()`. Never
   *    `useState` per pointer sample — see `hoverPixelRef`'s header for the
   *    "unable to slide and draw" regression that discipline exists to
   *    prevent.
   */

  /**
   * The WebGL engine, or `null` before the tool has ever been selected.
   *
   * ⚠️ A REF, not state. Creating it must not re-render this container, and
   * nothing in the React tree depends on its identity — the effects below
   * reach it imperatively and the painter reads it at paint time.
   */
  const poseEngineRef = useRef<PoseEngine | null>(null);

  /**
   * The three namespace, cached once the chunk has loaded.
   *
   * `loadThree()` memoises the import itself, so this is not about avoiding a
   * second fetch — it is so the mesh effect can build geometry without
   * awaiting on the frames where the module is already in hand.
   */
  const poseThreeRef = useRef<Awaited<ReturnType<typeof loadThree>> | null>(
    null,
  );

  /**
   * The root object currently in the scene, so the stamp's normal and depth
   * passes can swap its materials without going through `setObject3D` (which
   * would dispose the very object it is handed back).
   */
  const poseRootRef = useRef<Object3D | null>(null);

  /**
   * The camera instance, rebuilt when the PROJECTION changes.
   *
   * Kept across fits rather than reallocated: `applyCameraParams` writes every
   * field a fit produces, so the only reason to build a new one is a switch
   * between `PerspectiveCamera` and `OrthographicCamera`. A camera holds no
   * GPU resource, so there is nothing to dispose when it is replaced.
   */
  const poseCameraRef = useRef<PoseEngineCamera | null>(null);

  /**
   * Monotonic token guarding every async step in this region.
   *
   * ⚠️ Load-bearing under StrictMode AND under fast clicking. `PoseEngine
   * .create()` and `buildMesh()` both await, so two activations (or a
   * dev-mode double-invoked effect) can have two builds in flight at once.
   * Each captures the token standing when it started and drops its result if
   * the token has since moved — which is what stops the SECOND mesh being
   * overwritten by the FIRST one's late arrival, and what stops a disposed
   * engine being handed a mesh it will never release.
   */
  const poseTokenRef = useRef(0);

  /**
   * The live pan, mirrored out of the store so the painter can read it at
   * pointer rate without a React render (see the store-read note above).
   *
   * The STORE remains the source of truth — the rail and `clear()` both write
   * it, and the effect below syncs this ref from it. This ref exists only so
   * a drag can update the picture between renders.
   */
  const posePanRef = useRef<{ x: number; y: number }>(pose.pan);

  /** Filled once the pose scheduler exists; see `invalidateHoverRef`. */
  const invalidatePoseRef = useRef<(() => void) | null>(null);

  /* ── the painter (D5) ───────────────────────────────────────────────────
   *
   * The established overlay recipe, with one addition: the frame comes from
   * the GPU rather than from an `ImageData` this file fills in.
   */
  const renderPose = useCallback(() => {
    const canvas = poseCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const engine = poseEngineRef.current;
    if (!poseActive || !engine || engine.isDisposed || !poseRootRef.current) {
      // Inert when the tool is not selected, or nothing is loaded. Clearing
      // through the canvas's OWN dimensions rather than `cellWidth` matters
      // here: on the frame a resize lands, the backing store may still be the
      // old size and a `cellWidth`-sized clear would leave a stale band.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // ⚠️ 1:1 — NEVER `* zoom`. Assigning `.width` also CLEARS the backing
    // store and RESETS `imageSmoothingEnabled` to `true`, which is why the
    // flag is re-disabled immediately afterwards on every single paint.
    if (canvas.width !== cellWidth) canvas.width = cellWidth;
    if (canvas.height !== cellHeight) canvas.height = cellHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cellWidth, cellHeight);

    if (cellWidth <= 0 || cellHeight <= 0) return;

    // Idempotent — a no-op when the size already matches, so calling it from
    // the paint path costs nothing and guarantees the target can never be out
    // of step with the canvas even if an effect has not run yet.
    engine.resize(cellWidth, cellHeight);

    const frame = engine.render();
    if (frame.length !== cellWidth * cellHeight * 4) return;

    /* ── the outline post-pass (MASTER E3/E4/E5/E6) ────────────────────────
     *
     * ⚠️ **AT 1:1, ON THE READ-BACK BUFFER, EXACTLY ONCE PER FRAME.**
     *
     *  - **1:1** — the buffer is `cellWidth × cellHeight` (D5), one texel per
     *    art pixel, so `outlineWidth` is whole ART pixels and the border is
     *    hard-edged with no fringing. There is no scaling anywhere on this
     *    path and there must never be one.
     *  - **EXACTLY ONCE** — `applyOutline` is deliberately NOT idempotent: it
     *    writes at alpha 255, so a second pass reads its own outline as model
     *    and rings it again (width 1 twice == width 2 once, measured by task
     *    04). Safe here because `engine.render()` hands back a buffer freshly
     *    read from the render target every frame. If a caller ever caches an
     *    outlined frame, this call must move or the slider silently gains a
     *    notch.
     *  - **SKIPPED AT WIDTH 0** — the off state (E4) costs one comparison per
     *    frame rather than a full `w*h` silhouette scan.
     *  - **DISPLAY ONLY, never stamped** (MASTER E7) — see `poseStamp`, which
     *    takes its own uncoloured read-back and never sees this write.
     *
     * ⚠️ It touches ONLY the colour read-back. The depth and normal passes in
     * `poseStamp` render their own frames with their own materials and are
     * unreachable from here, so the outline cannot perturb the depth-derived
     * heights — which matters because that path was reasoned from three's
     * shader source and has never been run on a GPU (plan 06 §7).
     */
    if (poseEdgeWidth > 0) {
      applyOutline(
        frame,
        cellWidth,
        cellHeight,
        poseEdgeWidth,
        poseEdgeColor,
        // Explicit rather than defaulted, so the coupling to the stamp's own
        // `>= 128` (D8/E6) is visible at the call site: the outline must trace
        // the same silhouette the stamp commits.
        { alphaThreshold: POSE_ALPHA_THRESHOLD },
      );
    }

    // ⚠️ `putImageData` ONLY, at 1:1, and never a scaling `drawImage` (D5).
    // `Uint8ClampedArray` over the SAME buffer, not a copy: `ImageData`
    // demands that view type and the engine's array is already the right
    // bytes. `putImageData` reads it synchronously, so sharing the engine's
    // reused readback buffer is safe.
    // ⚠️ `frame.buffer` is typed `ArrayBufferLike`, which `ImageData` refuses
    // because it could in principle be a `SharedArrayBuffer`. It never is — the
    // engine allocates a plain `Uint8Array` — so the assertion narrows a
    // possibility the runtime does not have, rather than papering over one.
    const image = new ImageData(
      new Uint8ClampedArray(
        frame.buffer as ArrayBuffer,
        frame.byteOffset,
        frame.length,
      ),
      cellWidth,
      cellHeight,
    );

    // ⚠️ The variant-edit view shift, exactly as the other overlays do it.
    // While a variant is being edited the grid is drawn at its offset inside
    // an expanded view; painting at raw target coordinates would put the
    // reference that offset away from the artwork it is a reference FOR.
    const ox = isEditingVariantResolved ? viewMinX : 0;
    const oy = isEditingVariantResolved ? viewMinY : 0;

    // The pan is applied HERE, as a whole-image translation, rather than by
    // moving the camera: a camera pan would re-fit and re-rasterise, and the
    // whole point of the drag is that it slides the picture the user is
    // already looking at. Rounded to whole cells so the reference stays
    // aligned to the pixel grid at every pan offset (manual check 3).
    const pan = posePanRef.current;
    const px = Math.round(pan.x) - ox;
    const py = Math.round(pan.y) - oy;

    ctx.putImageData(image, px, py);
  }, [
    poseActive,
    cellWidth,
    cellHeight,
    isEditingVariantResolved,
    viewMinX,
    viewMinY,
    poseEdgeWidth,
    poseEdgeColor,
  ]);

  /**
   * The pose overlay's OWN scheduler (D11).
   *
   * ⚠️ `renderPose` is the only dependency. Everything else that changes the
   * picture — a light drag, a rotation, a camera preset, a resize — reaches
   * it through the effects below, which push the value into the engine and
   * then call `invalidate()`. That indirection is what keeps a pointer-rate
   * input off React's render path.
   */
  const { invalidate: invalidatePose } = useCanvasRender(renderPose, [
    renderPose,
  ]);
  // Deliberate render-phase write, the same pattern as `invalidateHoverRef`:
  // the gesture handlers are built before the scheduler exists and must reach
  // the CURRENT `invalidate` rather than close over a stale one.
  invalidatePoseRef.current = invalidatePose;

  /* ── engine lifecycle ──────────────────────────────────────────────────── */

  /**
   * One re-render when the engine becomes available, so the mesh effect below
   * (which cannot run against a `null` engine) gets a chance to build.
   *
   * ⚠️ A counter, not the engine itself, and it ticks exactly ONCE per engine
   * — this is not on any pointer path.
   */
  const [poseEngineTick, setPoseEngineTick] = useState(0);

  /**
   * Create the engine on first activation; NEVER on mount.
   *
   * ⚠️ Idempotent under StrictMode's double-invoked effects. The guard is the
   * ref, not the effect body: a second invocation finds `poseEngineRef
   * .current` already set (or a create already in flight, caught by the
   * token) and does nothing, so exactly ONE WebGL context exists per mount.
   *
   * ⚠️ The cleanup deliberately does NOT dispose. Disposing on deactivation
   * would destroy and rebuild a context on every tool switch — 20 switches is
   * 20 contexts against a browser cap of ~16, which is manual check 22's leak
   * scenario arriving from the other direction. The engine is kept alive for
   * the container's lifetime and released once, on unmount, by the effect
   * below. It costs one idle context and renders nothing while inactive.
   */
  useEffect(() => {
    if (currentTool !== "pose") return;
    if (poseEngineRef.current) return;

    let cancelled = false;
    void (async () => {
      try {
        const [three, engine] = await Promise.all([
          loadThree(),
          PoseEngine.create(),
        ]);
        if (cancelled || poseEngineRef.current) {
          // A second create won the race (or the component unmounted while
          // this one was in flight). Release ours rather than leaking it.
          engine.dispose();
          return;
        }
        poseThreeRef.current = three;
        poseEngineRef.current = engine;
        invalidatePoseRef.current?.();
        // Bumping the token re-runs the mesh effect, which cannot have built
        // anything while the engine was still `null`.
        poseTokenRef.current += 1;
        setPoseEngineTick((t) => t + 1);
      } catch (error) {
        // WebGL unavailable, or the chunk failed to load. The tool simply
        // cannot run here; every other tool is unaffected, so this is a
        // warning and not a thrown error mid-render.
        console.warn("[pose] the 3D reference engine is unavailable", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTool]);

  /**
   * Dispose on unmount — the obligation `PoseEngine`'s header states.
   *
   * ⚠️ EMPTY dependency array, deliberately. A dependency here would run the
   * cleanup on that dependency's every change and destroy a live context
   * mid-session. StrictMode's synthetic unmount does dispose, and the create
   * effect above then builds a fresh one on the remount — which is the
   * correct behaviour and is precisely what manual check 23 looks for.
   */
  useEffect(() => {
    return () => {
      poseTokenRef.current += 1;
      poseRootRef.current = null;
      poseCameraRef.current = null;
      poseThreeRef.current = null;
      poseEngineRef.current?.dispose();
      poseEngineRef.current = null;
    };
  }, []);

  /* ── the mesh ──────────────────────────────────────────────────────────── */

  /**
   * Build (or unload) the reference solid whenever the mesh id changes.
   *
   * ⚠️ The MODEL COLOUR is handled here too, but by re-materialising in place
   * rather than by rebuilding the geometry — a colour change must not throw
   * away and re-upload a 9.6k-triangle mannequin. `applyMaterial` disposes
   * the outgoing materials as it goes.
   *
   * ⚠️ `setObject3D` TAKES OWNERSHIP and disposes whatever it replaces, so
   * routing every mesh through it is what keeps geometries from leaking on
   * repeated mesh changes (manual check 22).
   */
  useEffect(() => {
    const engine = poseEngineRef.current;
    const three = poseThreeRef.current;
    if (!engine || !three || engine.isDisposed) return;

    if (poseMeshId === null) {
      engine.clearObject3D();
      poseRootRef.current = null;
      invalidatePoseRef.current?.();
      return;
    }

    poseTokenRef.current += 1;
    const token = poseTokenRef.current;

    void (async () => {
      try {
        const object = await buildMesh(three, poseMeshId, poseModelColor);
        // ⚠️ The token check is what makes two overlapping builds safe. A
        // stale one disposes its own object rather than installing it over
        // the newer mesh — see `poseTokenRef`.
        const live = poseEngineRef.current;
        if (token !== poseTokenRef.current || !live || live.isDisposed) {
          object.traverse((node) => {
            const holder = node as Object3D & {
              geometry?: { dispose?: () => void };
              material?: { dispose?: () => void } | { dispose?: () => void }[];
            };
            holder.geometry?.dispose?.();
            const material = holder.material;
            if (Array.isArray(material)) for (const m of material) m?.dispose?.();
            else material?.dispose?.();
          });
          return;
        }
        live.setObject3D(object);
        poseRootRef.current = object;
        invalidatePoseRef.current?.();
      } catch (error) {
        // The mannequin is not vendored until task 09, so
        // `MannequinUnavailableError` is the EXPECTED failure here. Warn and
        // leave the previous mesh in place rather than blanking the overlay.
        console.warn("[pose] could not load the reference mesh", error);
      }
    })();
    // ⚠️ `poseModelColor` is deliberately NOT a dependency: it is handled by
    // the re-materialise effect below, which does not rebuild the geometry.
    // It is READ here so a freshly built mesh starts in the right colour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseMeshId, poseEngineTick]);

  /** Re-tint the existing mesh. No geometry rebuild — see the effect above. */
  useEffect(() => {
    const three = poseThreeRef.current;
    const root = poseRootRef.current;
    if (!three || !root) return;
    applyMaterial(three, root, poseModelColor);
    invalidatePoseRef.current?.();
  }, [poseModelColor, poseEngineTick, poseMeshId]);

  /* ── rotation, light, camera ───────────────────────────────────────────── */

  /** The model's orientation. Euler XYZ radians, three's default order. */
  useEffect(() => {
    const root = poseRootRef.current;
    if (!root) return;
    root.rotation.set(poseRotation.x, poseRotation.y, poseRotation.z);
    invalidatePoseRef.current?.();
  }, [poseRotation, poseEngineTick, poseMeshId]);

  /** The key light's direction and colour. */
  useEffect(() => {
    const engine = poseEngineRef.current;
    if (!engine || engine.isDisposed) return;
    engine.setLight(poseLightDirection, poseLightColor);
    invalidatePoseRef.current?.();
  }, [poseLightDirection, poseLightColor, poseEngineTick]);

  /* ── auto-fit (D7) ─────────────────────────────────────────────────────── */

  /**
   * Re-frame the model. Runs on mesh, projection, preset, rotation, zoom, FOV,
   * **`cellWidth`/`cellHeight`** and **`fitGeneration`** change.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ ZOOM IS APPLIED AFTER THE FIT, NOT FOLDED INTO IT (MASTER E12)
   * ══════════════════════════════════════════════════════════════════════
   *
   * This is the owner's headline complaint and the fix is the two-step shape
   * below: `fitCameraToMesh` frames the model at a FIXED
   * {@link DEFAULT_POSE_FIT_PADDING}, and then {@link scaleCameraParams}
   * multiplies the resulting frustum by the free zoom. See that constant's
   * header for exactly how the old fold capped out at zoom ≈ 1.12.
   *
   * ⚠️ **A FIT NEVER RESETS ZOOM OR PAN** (E15). Neither is written here — the
   * zoom is read and re-applied, and the pan is not touched at all — so
   * pressing **Fit to canvas** re-frames at the current rotation, projection,
   * preset and zoom, and pressing it twice is idempotent. Only
   * `PoseUIStore.setMesh` resets the pan.
   *
   * ⚠️ **`fitGeneration` IS A DEPENDENCY ON PURPOSE.** `requestFit()` mutates
   * nothing else, so without it the button would be a no-op: every other
   * dependency is unchanged by definition when the owner asks to re-frame at
   * the *current* settings. The counter is monotonic and `clear()` never
   * rewinds it, so it can only ever move forward — one fit per press.
   *
   * ⚠️ THE RESIZE PATH IS THE `cellWidth`/`cellHeight` DEPENDENCY, and that is
   * the whole answer to "respond to the object being resized". A grid resize
   * notifies through `domainVersion`, NOT `pixelVersion`, so there is no
   * pixel-side signal to observe — but `cellWidth`/`cellHeight` already flow
   * through this container as plain values and change when the object is
   * resized. Keying off them directly is both simpler and correct.
   *
   * ⚠️ THE PAN IS PRESERVED. It is neither read nor written here, so a resize
   * re-fits the model while leaving it wherever the user dragged it (manual
   * check 19). Only `PoseUIStore.setMesh` resets it — which is why a mesh
   * change recentres and a resize does not.
   *
   * ⚠️ The camera is rebuilt only when the PROJECTION changes. Four of the
   * five presets are orthographic (D14) and `OrthographicCamera` is a
   * different class, so the instance genuinely has to change — but a preset
   * that keeps the projection reuses the camera and only rewrites its fields.
   */
  useEffect(() => {
    const engine = poseEngineRef.current;
    const three = poseThreeRef.current;
    if (!engine || !three || engine.isDisposed) return;
    if (cellWidth <= 0 || cellHeight <= 0) return;

    // A preset OVERRIDES the projection and supplies the orbit; the store's
    // own `projection` is the fallback for a preset id that no longer exists.
    const preset = getCameraPreset(poseCameraPreset);
    const projection = preset?.projection ?? poseProjection;

    // ── step 1: FIT, at a fixed padding and the CURRENT rotation ────────
    //
    // Every mesh — primitive, whole mannequin, or a single part — is
    // normalised into the unit box by `poseMeshes.ts` before it reaches the
    // scene, so one bounds value covers all of them. (Framing's sub-boxes are
    // gone: a part is its own geometry now, not a crop of the whole figure.)
    const fitted = fitCameraToMesh({
      bounds: UNIT_BOUNDS,
      canvasWidth: cellWidth,
      canvasHeight: cellHeight,
      projection,
      rotation: poseRotation,
      fov: poseFov,
      pitch: preset?.pitch ?? 0,
      yaw: preset?.yaw ?? 0,
      padding: DEFAULT_POSE_FIT_PADDING,
    });

    // ── step 2: ZOOM, as a free multiplier over the fitted frame ────────
    const params = scaleCameraParams(fitted, poseZoom);

    // Rebuild the camera only on a genuine projection change.
    const current = poseCameraRef.current;
    const needsPerspective = params.projection === "perspective";
    // ⚠️ `in`, not a property read: each class declares only its OWN flag, as
    // the literal `true`, so neither exists on the other member of the union.
    const matches =
      current !== null &&
      (needsPerspective
        ? "isPerspectiveCamera" in current
        : "isOrthographicCamera" in current);

    if (!matches) {
      poseCameraRef.current = needsPerspective
        ? new three.PerspectiveCamera()
        : new three.OrthographicCamera(-1, 1, 1, -1);
    }

    const camera = poseCameraRef.current;
    if (!camera) return;
    applyCameraParams(camera, params);
    engine.setCamera(camera);
    invalidatePoseRef.current?.();
  }, [
    poseEngineTick,
    poseMeshId,
    poseFitGeneration,
    poseProjection,
    poseCameraPreset,
    poseRotation,
    poseZoom,
    poseFov,
    cellWidth,
    cellHeight,
  ]);

  /**
   * Keep the render target in step with the grid, and repaint.
   *
   * Separate from the fit above so the two concerns stay legible: this owns
   * the TARGET's dimensions, that owns the CAMERA's framing. `resize()` is
   * idempotent, so the overlap is free.
   */
  useEffect(() => {
    const engine = poseEngineRef.current;
    if (!engine || engine.isDisposed) return;
    engine.resize(cellWidth, cellHeight);
    invalidatePoseRef.current?.();
  }, [cellWidth, cellHeight, poseEngineTick]);

  /**
   * Adopt a pan written by anything other than a drag — `setMesh`'s reset and
   * `clear()`'s. The drag writes the ref itself and does not wait for this.
   */
  useEffect(() => {
    posePanRef.current = pose.pan;
    invalidatePoseRef.current?.();
  }, [pose.pan]);

  /* ── the gestures (D12) ────────────────────────────────────────────────── */

  /**
   * The in-flight pan drag: the last client point, or `null` when idle.
   *
   * ⚠️ A REF, per D11. A `useState` here would re-render this container on
   * every pointer sample, rebuilding `getToolContext`, the tool handlers and
   * `pointer` mid-gesture — the "unable to slide and draw" regression
   * documented at `hoverPixelRef`.
   */
  const poseDragRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * The previous pointer-down, for double-click detection.
   *
   * ⚠️ Detected EXPLICITLY as two downs within 400 ms and within 2 cells,
   * rather than by listening for `dblclick` (D12). `dblclick` is not
   * dispatched reliably for touch, and the owner uses an iPad — a
   * mouse-only stamp is a failed task.
   */
  const poseLastDownRef = useRef<{ t: number; x: number; y: number } | null>(
    null,
  );

  /**
   * Screen-space delta → grid-cell delta.
   *
   * ⚠️ Through the canvas RECT, never by dividing by `zoom`. The canvas
   * carries a CSS `transform: scale()` for pinch and only the rect reflects
   * it mid-gesture — the same reasoning `coords.ts` documents, and the reason
   * pose needs no new snap mode of its own.
   */
  const poseScreenToCellDelta = useCallback(
    (dx: number, dy: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      return {
        x: (dx * cellWidth) / rect.width,
        y: (dy * cellHeight) / rect.height,
      };
    },
    [cellWidth, cellHeight],
  );

  /**
   * `true` if this down is the second half of a double-click/tap.
   *
   * Consumes the record either way: a third rapid click starts a new pair
   * rather than stamping again, which is what a user tapping repeatedly
   * expects and what stops one gesture producing two undo entries.
   */
  const posePollDoubleClick = useCallback(
    (clientX: number, clientY: number): boolean => {
      const now = Date.now();
      const prev = poseLastDownRef.current;
      poseLastDownRef.current = { t: now, x: clientX, y: clientY };
      if (!prev) return false;
      if (now - prev.t > POSE_DOUBLE_CLICK_MS) return false;
      const delta = poseScreenToCellDelta(clientX - prev.x, clientY - prev.y);
      if (Math.hypot(delta.x, delta.y) > POSE_DOUBLE_CLICK_CELLS) return false;
      poseLastDownRef.current = null;
      return true;
    },
    [poseScreenToCellDelta],
  );

  /* ── the stamp (D8, D9) ────────────────────────────────────────────────── */

  /**
   * Render the colour, normal and depth passes and commit them as ONE cell
   * write.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THREE PASSES OVER THE SAME MESH, NOT THREE SCENES
   * ══════════════════════════════════════════════════════════════════════
   *
   * The engine holds one root and renders whatever material that root
   * carries, so the extra passes are done by SWAPPING the root's materials
   * and rendering again. The alternative — `scene.overrideMaterial` — is
   * private to the engine, and a second scene would mean a second copy of the
   * geometry. Every swapped-in material is disposed before the original is
   * restored, so the two extra passes leak nothing.
   *
   * ── The depth pass, and the D8 fallback ─────────────────────────────────
   *
   * `MeshDepthMaterial` with `BasicDepthPacking` writes `1 - ndcDepth` into
   * RGB as luminance — so the RGBA readback the engine already does IS the
   * depth buffer, with NEARER = LARGER. That sidesteps `readRenderTargetPixels`
   * being RGBA-only, which is what would otherwise have made depth
   * unavailable and forced the height = 0 fallback. The fallback is still
   * wired: if the pass throws or comes back the wrong size, `depth` is passed
   * as `null` and every cell's height becomes `0` (the project's "no data"
   * sentinel) while colour and normal still land.
   *
   * ⚠️ The height range is measured from the model's OWN observed depths, not
   * from the clip planes — D8 says "normalised across the model's own
   * near/far bounds", and the clip planes carry padding the model does not
   * occupy, which would compress every real height into a narrow band.
   *
   * ⚠️ NOT routed through `actions.setPixels`. That closure applies the
   * REFLECTION MIRROR and is for drawing; a stamp is a placement, in the same
   * category as `moveLayerPixels` and the lighting studio, which are
   * excluded for the same reason. `app.selectionUI.writeOptions` is passed so
   * an active selection still masks it (manual check 16).
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THE OUTLINE IS **NOT** STAMPED — DISPLAY ONLY (MASTER E7)
   * ══════════════════════════════════════════════════════════════════════
   *
   * The decision, taken here and recorded in the plan's HANDOFF where it was
   * left open. `renderPose` runs `applyOutline` on the buffer it blits to the
   * overlay; this function takes its OWN `engine.render()` read-back and never
   * calls it, so `buildStampCells` reads the pre-outline silhouette.
   *
   * Why display-only:
   *
   *  - **An outline pixel has no surface.** Every cell this writes carries a
   *    colour, a NORMAL and a HEIGHT, and the outline is a 2D dilation of a
   *    silhouette — there is no geometry under it, so there is no normal to
   *    encode and no depth to normalise. Stamping it would mean inventing
   *    both, and any invention (copy the nearest model normal? face the
   *    viewer? height 0 = "no data"?) is a lie the lighting studio would then
   *    shade as if it were real.
   *  - **`height: 0` is the project's "no data" sentinel**, so the only
   *    honest height for an outline pixel is the one that means "not part of
   *    the model" — at which point the cell is a bare colour with a fabricated
   *    normal, which is worse than not writing it.
   *  - **The owner asked for a reference affordance.** The outline exists to
   *    make the silhouette readable against the artwork underneath while
   *    tracing it; the artwork's own edge is something they draw.
   *  - **It stays reversible.** Nothing is lost: the outline is one
   *    `applyOutline` call away, and a future "stamp the outline too" option
   *    can be added without unpicking anything. Committing edge pixels with
   *    invented normals into 151 real projects could not be undone as easily.
   *
   * ⚠️ If this is ever reversed, the normal and height channels for outline
   * pixels must be DEFINED, not defaulted, and E6's shared `>= 128` threshold
   * keeps the two silhouettes in step.
   */
  const poseStamp = useCallback(() => {
    const engine = poseEngineRef.current;
    const three = poseThreeRef.current;
    const root = poseRootRef.current;
    if (!engine || !three || !root || engine.isDisposed) return;
    if (cellWidth <= 0 || cellHeight <= 0) return;
    if (!layer) return;

    const texels = cellWidth * cellHeight;

    // ── pass 1: the lit colour ─────────────────────────────────────────
    // Copied, because the engine REUSES its readback buffer across frames and
    // two more passes are about to overwrite it.
    engine.resize(cellWidth, cellHeight);
    const colorBuffer = Uint8Array.from(engine.render());
    if (colorBuffer.length !== texels * 4) return;

    /**
     * Render one pass with `material` swapped in for the root's own, then put
     * the originals back. Returns a COPY of the frame, or `null` if the pass
     * could not run — the caller decides how to degrade.
     */
    const renderWithMaterial = (
      material: { dispose?: () => void },
    ): Uint8Array | null => {
      const saved: {
        node: { material?: unknown };
        material: unknown;
      }[] = [];
      try {
        root.traverse((node) => {
          const holder = node as Object3D & { material?: unknown };
          if (holder.material === undefined) return;
          saved.push({ node: holder, material: holder.material });
          holder.material = material;
        });
        if (saved.length === 0) return null;
        const out = Uint8Array.from(engine.render());
        return out.length === texels * 4 ? out : null;
      } catch {
        return null;
      } finally {
        for (const entry of saved) entry.node.material = entry.material;
      }
    };

    // ── pass 2: the view-space normals ─────────────────────────────────
    // `MeshNormalMaterial` writes `n * 0.5 + 0.5` per channel. `poseStamp`'s
    // `decodeNormalTexel` undoes that AND negates Y — three is Y-up, this
    // project is Y-down. That convention is settled and verified in three
    // places; do not "correct" it here.
    const normalMaterial = new three.MeshNormalMaterial({
      flatShading: true,
      side: three.DoubleSide,
    });
    let normalBuffer: Uint8Array;
    try {
      normalBuffer = renderWithMaterial(normalMaterial) ?? new Uint8Array(0);
    } finally {
      normalMaterial.dispose();
    }

    // ── pass 3: depth ──────────────────────────────────────────────────
    const depthMaterial = new three.MeshDepthMaterial({
      depthPacking: three.BasicDepthPacking,
      side: three.DoubleSide,
    });
    let depthRgba: Uint8Array | null;
    try {
      depthRgba = renderWithMaterial(depthMaterial);
    } finally {
      depthMaterial.dispose();
    }

    // Restore the picture the user is looking at: the passes above rendered
    // over the target, and without this the overlay would show the depth pass
    // until the next invalidation.
    invalidatePoseRef.current?.();

    // One value per texel, taken from R (all three channels carry the same
    // luminance under `BasicDepthPacking`).
    //
    // ⚠️ The observed range is measured ONLY over texels the COLOUR pass says
    // were drawn. The target clears transparent, so every background texel
    // reads R = 0 — include those and the range becomes `[0, hi]` for every
    // model, which compresses the model's real depths into the top of the
    // scale and flattens the height field. Gating on the colour pass's alpha
    // is what makes this the model's OWN near/far bounds, as D8 requires.
    let depth: Uint8Array | null = null;
    let depthNear = 255;
    let depthFar = 0;
    if (depthRgba) {
      depth = new Uint8Array(texels);
      let seen = false;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < texels; i++) {
        const value = depthRgba[i * 4];
        depth[i] = value;
        if (colorBuffer[i * 4 + 3] < POSE_ALPHA_THRESHOLD) continue;
        seen = true;
        if (value < lo) lo = value;
        if (value > hi) hi = value;
      }
      if (!seen || hi === lo) {
        // A perfectly flat model (a face-on plane) has no gradient to
        // normalise across. `depthToHeight` answers HEIGHT_MAX for a
        // degenerate range, which is the right uniform slab.
        depthNear = 1;
        depthFar = 1;
      } else {
        // NEARER IS TALLER, and under `BasicDepthPacking` nearer is LARGER —
        // so the "near" bound of the range is the MAXIMUM observed value.
        depthNear = hi;
        depthFar = lo;
      }
    }

    // ⚠️ THE OFFSET MUST MATCH THE PAINTER'S, EXACTLY — this is manual check
    // 14 ("the stamped pixels land exactly where the model was drawn").
    //
    // Two terms, and BOTH are needed:
    //
    //  - the PAN, rounded to whole cells the same way `renderPose` rounds it.
    //    Rounding in only one of the two places would put the stamp up to a
    //    cell away from the picture at half-integer pans.
    //  - the VARIANT-EDIT SHIFT, which is `variantOffset` and NOT `viewMin`.
    //    Derived, not guessed, from `placeHoverCells` — the one place that
    //    already converts between these two spaces:
    //
    //      canvasX = gridX + (variantOffset.x - viewMinX)
    //
    //    The painter puts the render target's texel (0,0) at canvas column
    //    `round(pan.x) - viewMinX`, so inverting the line above gives that
    //    texel a GRID column of `round(pan.x) - variantOffset.x` — the
    //    `viewMinX` terms cancel exactly. `setPixelCells` writes the VARIANT's
    //    own grid while editing one (`PixelStore.resolveTarget`'s variant
    //    branch), which is that space. Using `viewMin` here instead would be
    //    wrong by `variantOffset - viewMin` and visible only while editing a
    //    variant — exactly the kind of offset bug that ships.
    const pan = posePanRef.current;
    const stampOx = isEditingVariantResolved ? variantOffset.x : 0;
    const stampOy = isEditingVariantResolved ? variantOffset.y : 0;
    const cells: PoseStampCell[] = buildStampCells({
      color: colorBuffer,
      normal: normalBuffer,
      depth,
      width: cellWidth,
      height: cellHeight,
      alphaThreshold: POSE_ALPHA_THRESHOLD,
      heightRange: { near: depthNear, far: depthFar },
      offsetX: Math.round(pan.x) - stampOx,
      offsetY: Math.round(pan.y) - stampOy,
    });
    if (cells.length === 0) return;

    // ⚠️ `buildStampCells` allocates a FRESH `color` and `normal` per cell,
    // which is required: `setPixelCells` stores the caller's objects in its
    // history patch without deep-copying, so a shared object mutated later
    // would corrupt an already-recorded undo entry.
    app.pixels.setPixelCells(cells, app.selectionUI.writeOptions);
  }, [app, cellWidth, cellHeight, layer, isEditingVariantResolved, variantOffset]);

  /**
   * A pointer went down with the pose tool selected.
   *
   * Returns `true` if the pose tool consumed the event, so the mouse and
   * touch handlers can share ONE arbitration and cannot drift apart.
   */
  const posePointerDown = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (currentTool !== "pose") return false;
      if (posePollDoubleClick(clientX, clientY)) {
        poseDragRef.current = null;
        poseStamp();
        return true;
      }
      poseDragRef.current = { x: clientX, y: clientY };
      return true;
    },
    [currentTool, posePollDoubleClick, poseStamp],
  );

  /** A pointer moved: pan the model, at pointer rate, through the refs. */
  const posePointerMove = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (currentTool !== "pose") return false;
      const from = poseDragRef.current;
      if (!from) return true;
      const delta = poseScreenToCellDelta(clientX - from.x, clientY - from.y);
      if (delta.x === 0 && delta.y === 0) return true;
      poseDragRef.current = { x: clientX, y: clientY };
      // The REF is what the painter reads, so it is updated first and the
      // repaint scheduled immediately; the store write is the durable record.
      const next = {
        x: posePanRef.current.x + delta.x,
        y: posePanRef.current.y + delta.y,
      };
      posePanRef.current = next;
      invalidatePoseRef.current?.();
      app.pose.setPan(next);
      return true;
    },
    [currentTool, poseScreenToCellDelta, app],
  );

  /** The gesture ended. Nothing to commit — the pan is already in the store. */
  const posePointerUp = useCallback((): boolean => {
    if (currentTool !== "pose") return false;
    poseDragRef.current = null;
    return true;
  }, [currentTool]);

  /* ── end of concern #14 ────────────────────────────────────────────────── */

  /* ── the reflection guides (concern #13, reflection-tool task 07) ───────── */
  //
  // ══════════════════════════════════════════════════════════════════════
  //  ⚠️ ITS OWN CANVAS, ITS OWN SCHEDULER, AND A PHASE IN A REF
  // ══════════════════════════════════════════════════════════════════════
  //
  // Three separate decisions, each of which the alternative gets wrong:
  //
  // 1. **Its own surface.** The guides animate continuously; `render` above
  //    still repaints every visible cell of every visible layer.
  //    Routing an animation through it would re-rasterise a 300k-cell sprite
  //    ~12 times a second forever. Same argument as the hover marker's.
  //
  // 2. **Its own `useCanvasRender`.** The guides must repaint when the LINES
  //    change and when the PHASE advances — two signals that have nothing to
  //    do with `pixelVersion`. Nothing reflection-related may appear in
  //    `[render, pixelVersion]`.
  //
  // 3. **The phase in a ref.** This is the load-bearing one and it is the
  //    2026-08-28 regression restated: a `useState` phase would re-render
  //    this container every 80 ms, rebuilding `getToolContext`, the tool
  //    handlers and `pointer` — including in the middle of a live touch
  //    stroke, which is exactly the "unable to slide and draw" failure
  //    documented at `hoverPixelRef` above. The ticker writes the ref and
  //    calls `invalidate()`; React is never told anything happened.
  const reflectionPhaseRef = useRef(0);

  /**
   * ⚠️ THE RASTER REFLECTION PAINTER IS RETIRED (plan 05, task 05).
   *
   * Task 04 mounted `reflectionGuides` — the SVG replacement (D5) — but could
   * not remove the raster painter, because `drawReflectionLines` lived here
   * and `CanvasContainer.tsx` was task 05's file: removing the canvas first
   * would have left that painter writing into `null`. So both existed for one
   * wave and the guides would have drawn TWICE — once raster and once vector.
   *
   * The raster pass is the one that goes, and it is not a coin toss which:
   * `REFLECTION_DASH = 4` is documented screen-constant in
   * `renderReflectionLines.ts`, and under the CSS transform a 4-unit dash is
   * 4 × `combinedScale` screen px — 200 px at zoom 50. `vector-effect:
   * non-scaling-stroke` on the SVG path restores exactly the invariant that
   * painter's own comment claims (R2).
   *
   * What survives is the PHASE and the ticker: `reflectionPhaseRef` still
   * advances at ~12 fps and still lives in a ref rather than state, for the
   * reason above. What changed is where it lands — it is now the `dashOffset`
   * ARGUMENT to `reflectionGuideOverlays`, which task 03 exposed as a
   * parameter precisely so this decision belonged to a consumer. Driving it
   * from React state instead would re-render this container 12 times a second
   * forever, rebuilding `getToolContext`, the tool handlers and `pointer`
   * mid-stroke: the 2026-08-28 "unable to slide and draw" regression.
   *
   * The counter that forces the re-render is a `useState`, NOT the phase
   * itself: the phase is read through the ref at build time, so the state's
   * VALUE is never used and only its change matters. That keeps the ~12 fps
   * re-render confined to the guides' own path.
   */
  const [reflectionTick, setReflectionTick] = useState(0);

  // ⚠️ `active` is false whenever there is nothing to animate, so the rAF loop
  // does not exist at all in the common case — manual check 8 is exactly this
  // (delete every line, no rAF left in the Performance panel).
  useDashTicker(reflectionLines.length > 0 || Boolean(reflectionDraft), (p) => {
    reflectionPhaseRef.current = p;
    // Only the CHANGE matters — `reflectionGuides` below reads the phase off
    // the ref. See the note above on why the phase itself is not state.
    setReflectionTick((t) => t + 1);
  });

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
  // The reference image is an object-space aid: never active in Layer mode.
  const isReferenceTraceActive =
    !layerMode && currentTool === "reference-trace" && referenceImage != null;

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
    if (
      !canvas ||
      !ctx ||
      !referenceImage ||
      !isReferenceTraceActive ||
      layerMode
    ) {
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // ⚠️ 1:1 (plan 05). The buffer is `cellWidth × cellHeight` and the CSS
    // transform magnifies it, so every coordinate below is in CELLS.
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cellWidth, cellHeight);

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
          const drawX = x + referenceOverlayOffset.x - ox;
          const drawY = y + referenceOverlayOffset.y - oy;
          if (
            drawX >= 0 &&
            drawX < cellWidth &&
            drawY >= 0 &&
            drawY < cellHeight
          ) {
            ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
            ctx.fillRect(drawX, drawY, CELL_SCALE, CELL_SCALE);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = WARN_ORANGE_60;
    ctx.lineWidth = CHROME_STROKE;
    ctx.setLineDash(TRACE_BORDER_DASH);
    ctx.strokeRect(
      referenceOverlayOffset.x - ox,
      referenceOverlayOffset.y - oy,
      referenceImage.width,
      referenceImage.height,
    );
    ctx.setLineDash([]);
  }, [
    referenceImage,
    isReferenceTraceActive,
    layerMode,
    cellWidth,
    cellHeight,
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
      // Frame overlays are object-space aids: cleared in Layer mode.
      if (
        !canvas ||
        !ctx ||
        !overlaySourceFrame ||
        !frameRefObj ||
        !active ||
        layerMode
      ) {
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const refObjWidth = frameRefObj.gridSize.width;
      const refObjHeight = frameRefObj.gridSize.height;

      const ox = isEditingVariantResolved ? viewMinX : 0;
      const oy = isEditingVariantResolved ? viewMinY : 0;

      // ⚠️ 1:1 (plan 05), for both this canvas and the scratch buffer.
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cellWidth, cellHeight);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = cellWidth;
      tempCanvas.height = cellHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      // The scratch buffer is `drawImage`d into `ctx` at integer offsets, so
      // nothing should interpolate — but a scratch canvas defaults to
      // smoothing ON, and it is one `drawX` rounding change away from
      // mattering. Set it to match every other context in this file.
      tempCtx.imageSmoothingEnabled = false;

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
      const imageData = tempCtx.createImageData(cellWidth, cellHeight);

      renderFrameOverlayBuffer(imageData, {
        layers: overlaySourceFrame.layers,
        refObjWidth,
        refObjHeight,
        zoom: CELL_SCALE,
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

      const drawX = drawOffset.x - ox;
      const drawY = drawOffset.y - oy;

      ctx.globalAlpha = mode.opacity;
      ctx.drawImage(tempCanvas, drawX, drawY);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = mode.borderColor;
      ctx.lineWidth = CHROME_STROKE;
      ctx.setLineDash([...mode.borderDash]);
      ctx.strokeRect(drawX, drawY, refObjWidth, refObjHeight);
      ctx.setLineDash([]);
    },
    [
      app.domain,
      cellWidth,
      cellHeight,
      frameRefObj,
      isEditingVariantResolved,
      layerMode,
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
  // ══════════════════════════════════════════════════════════════════════
  //  ⚠️ TASK 07: THE DEPS ARE NO LONGER THE INVALIDATION SIGNAL BY
  //     THEMSELVES — THEY ARE GATED, AND MEASUREMENT IS WHY
  // ══════════════════════════════════════════════════════════════════════
  //
  // The deps list is `[]` and invalidation is driven by the effect below.
  // The reason is a measured one, and it is not obvious from reading the
  // list that used to be here:
  //
  //   ⚠️ **`render`'s identity changes on EVERY PIXEL WRITE.**
  //
  // `render` closes over `layerPlan`, `layerPlan` holds each layer's
  // `pixels` array, and `PixelStore.writeGridInAction` REPLACES that array
  // (the grid is `observableRef` and is rebuilt, never mutated in place —
  // R2 depends on that). So a one-cell edit gives `layerPlan` a new
  // identity, which gives `render` a new identity, which fires the deps
  // effect, which calls `invalidate()` — a FULL repaint, in the same tick
  // as the dirty region.
  //
  // Measured before this gate was added: a one-cell edit on a 6x4 fixture
  // painted 25 cells (1 incremental + 24 full) and on a 64x64 fixture
  // painted 4,097 (1 + 4,096). The fast path ran correctly and was then
  // immediately overwritten by the very repaint it exists to avoid — the
  // whole plan, silently no-oping while every test passed.
  //
  // So the two channels are reconciled in ONE place instead of racing:
  // `paintTick` below decides, per tick, whether this was a pixel write
  // that named itself (fast path, already scheduled by the reaction) or
  // anything else (full repaint).
  //
  // `pixelVersion` is NOT removed from the invalidation path — it is read
  // by that effect and is still what covers every `PixelStore` write. It is
  // narrowed, exactly as the task requires.
  const { invalidate, invalidateRegion } = useCanvasRender(render, []);

  /* ── the dirty-region fast path (plan 05, task 07 — D7/D8/R6) ──────────── */
  //
  // ══════════════════════════════════════════════════════════════════════
  //  ⚠️ TWO CHANNELS, AND THE SECOND ONE DEFERS TO THE FIRST
  // ══════════════════════════════════════════════════════════════════════
  //
  // `pixelVersion` and `pixelDirty` describe the SAME write from two angles,
  // and `PixelStore` publishes them in a fixed order: `publishAndBump()` (the
  // version) and then `publishDirty(...)` (the region), inside one action. So
  // by the time either effect below runs, both values are settled.
  //
  //   - A write that CAN name its cells bumps the version AND publishes a
  //     region. The region is the better signal, so the version effect stands
  //     down — `coveredVersionRef` is how it knows to.
  //   - A write that CANNOT (a flip, an empty-patch lighting commit) bumps the
  //     version and publishes `null`. `null` promotes the accumulator to
  //     "all", so it is a full repaint either way (R6).
  //   - A write that goes through `DomainMutator` instead of `PixelStore` —
  //     `moveLayerPixels`, variant resize, `applyInterpolation`, a project
  //     load — publishes NEITHER. It bumps `domainVersion`, which changes
  //     `layerPlan`, which changes `render`'s identity, which is the deps
  //     effect above. Full repaint. See the audit in the task's report.
  //
  // ── ⚠️ D8: THE REGION IS THE ONLY SIGNAL UNDO HAS ───────────────────────
  //
  // `PixelStore.publishAndBump` does NOT bump `pixelVersion` during replay —
  // that is the no-save-on-undo gate (`autoSave.test.ts:225` pins it) — so on
  // undo and redo `pixelVersion` never changes and the version effect never
  // re-runs. `applyPatch` publishes the dirty region anyway, deliberately
  // outside that gate, and THIS reaction is what turns it into a repaint.
  // Break it and undo silently stops painting: the model is right, the
  // history is right, and the pixels on screen are stale.
  //
  // ── Why a `reaction` and not a read in the `observer()` body ────────────
  //
  // `pixelDirty` is `observableRef`, so reading it is cheap and the cell
  // array is never proxied (R2). But reading it in the render body would
  // re-render this ~3,000-line container on every pixel write, which is
  // exactly the cost the plan exists to remove. A `reaction` observes the
  // field without a React render.

  /**
   * Set by the dirty reaction to CLAIM the repaint that the React effect
   * below would otherwise schedule as a full one.
   *
   * ⚠️ A boolean claim, not a version comparison, and the difference is
   * UNDO. `publishAndBump` does not bump `pixelVersion` during replay, so an
   * undo leaves the version untouched while `layerPlan` — and therefore
   * `render` — still gets a new identity from the rewritten grid. A
   * version-based test would see "the version did not move, so this is not a
   * pixel write" and schedule a full repaint on every single undo. The claim
   * records what actually happened instead of inferring it.
   *
   * ⚠️ A REF, not state: writing state here would re-render this
   * ~3,000-line container on every pixel write, which is the cost this whole
   * task removes.
   */
  const dirtyClaimedRef = useRef(false);

  useEffect(() => {
    return reaction(
      () => app.domain.pixelDirty,
      (region) => {
        // ⚠️ The claim is made BEFORE scheduling and consumed by the effect
        // below. MobX runs this reaction synchronously at the end of the
        // write action, which is before React re-renders — so the claim is
        // always standing by the time the effect looks at it.
        dirtyClaimedRef.current = true;
        // `null` is the store's honest "I replaced a grid wholesale and
        // cannot name the cells" (R6). The hook promotes it to a full
        // repaint; passing it through unchanged is the whole contract.
        invalidateRegion(region);
      },
    );
    // ⚠️ `fireImmediately` is deliberately OFF: the value standing at mount is
    // whatever the last edit left there, and the mount already schedules a
    // full repaint through the effect below.
  }, [app.domain, invalidateRegion]);

  /* ── the reconciled invalidation gate ──────────────────────────────────── */
  //
  // ⚠️ THIS IS THE OLD `useCanvasRender(render, [render, pixelVersion])`
  // EFFECT, with one guard added. The dependency list is unchanged and it is
  // still the invalidation signal; what changed is that a tick already
  // described by the dirty channel does not ALSO get a full repaint.
  //
  // Correctness argument, which matters more than the saving:
  //
  //   - The claim is only ever set by a `pixelDirty` publish, and every such
  //     publish schedules a repaint of its own (a region, or `"all"` for
  //     `null`). So a claimed tick is never an unpainted tick.
  //   - The claim is cleared here, every time, whether or not it was used. A
  //     stale claim could otherwise swallow the NEXT full repaint — which
  //     would be a stale-pixel bug, so it is cleared unconditionally rather
  //     than inside the branch.
  //   - Anything that is not a `PixelStore` write never sets it, so layer
  //     visibility, focus mode, zoom, variant selection, tool changes,
  //     project loads and every `DomainMutator` path fall through to
  //     `invalidate()` exactly as they did before.
  /**
   * ⚠️ The hook's own `deps: []` effect already schedules the MOUNT paint, so
   * this effect must not schedule a second one for the same frame. Measured:
   * without this guard the mount painted every layer TWICE — 8,192 cells
   * instead of 4,096 on a 64x64 fixture — on the single most expensive paint
   * in a session, the first full sweep of every layer.
   */
  const mountedRef = useRef(false);

  useEffect(() => {
    const claimed = dirtyClaimedRef.current;
    dirtyClaimedRef.current = false;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (claimed) return;
    invalidate();
    // ⚠️ `render` and `pixelVersion` ARE the invalidation signal — the same
    // two the hook's own deps list carried before task 07 — and neither is
    // called in the body. They are listed because their CHANGING is the
    // event, which is the whole idiom of this hook.
  }, [render, pixelVersion, invalidate]);

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
    // Exactly ONE pane owns the window keyboard map (MASTER D12).
    enabled: views.keyboardOwner === renderMode,
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
    if (hasVariantData && variantData) {
      return variantData.variantFrame.layers[0]?.pixels ?? layer.pixels;
    }
    return layer.pixels;
  }, [layer, hasVariantData, variantData]);

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
        // The bucket FLOODS AN AREA, so it is a fill — not an edge.
        return floodFill(
          grid,
          p.x,
          p.y,
          gridWidth,
          gridHeight,
          fillColor,
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
          fillColor,
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

    // The origin tool snaps to half-pixels and writes immediately. Object-
    // space, so the Layer view of a variant does not place it.
    if (currentTool === "origin" && obj) {
      if (!(layerMode && editingVariant)) {
        const originCoords = getOriginCoords(e.clientX, e.clientY);
        if (originCoords) actions.setObjectOrigin(obj.id, originCoords);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  THE REFLECTION GESTURE — ARBITRATED HERE, AND NEVER A HISTORY STROKE
    // ══════════════════════════════════════════════════════════════════════
    //
    // Placed with `origin` ahead of the tool table (D7) for the same reason:
    // it snaps to a different lattice than `getPixelCoords` produces and it
    // writes no pixels, so there is nothing for `toolHandlers` to dispatch —
    // its entry there is deliberately empty.
    //
    // ⚠️ NO `beginStroke`, NO `startDrawing`. A guide line is session state,
    // not a pixel mutation: opening a history stroke here would put an empty
    // entry on the undo stack, and `startDrawing` would additionally set
    // `isDrawing`, which every branch below and in the two move handlers
    // tests. Adding a line is simply not undoable (D6).
    //
    // ⚠️ It runs BEFORE the `!layer` guard below. Guides are grid geometry and
    // are perfectly meaningful on an object with no layer selected.
    if (currentTool === "reflection") {
      const corner = getCornerCoords(e.clientX, e.clientY);
      if (corner) app.reflection.beginDraft(corner.x, corner.y);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  THE POSE GESTURE — ARBITRATED HERE TOO (pose-tool task 08, D12)
    // ══════════════════════════════════════════════════════════════════════
    //
    // Ahead of the tool table with `origin` and `reflection`, and for the
    // same reason: `pose`'s `toolHandlers` entry is deliberately empty, it
    // opens NO history stroke, and it writes no pixels through the table. A
    // drag pans the reference; a double-click stamps it, as ONE atomic
    // `setPixelCells` commit.
    //
    // ⚠️ Also ahead of the `!coords || !layer` guard below — but `poseStamp`
    // checks `layer` itself, because a stamp genuinely does need somewhere to
    // land while a PAN is perfectly meaningful with no layer selected.
    if (posePointerDown(e.clientX, e.clientY)) return;

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
      // `hasVariantData`, not the view flag: `coords` are variant-grid space
      // in BOTH render modes whenever a variant is selected.
      if (hasVariantData && variantData) {
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

      if (frame && !hasVariantData) {
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
        const canvasX = hasVariantData ? coords.x + variantOffset.x : coords.x;
        const canvasY = hasVariantData ? coords.y + variantOffset.y : coords.y;
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
      // ⚠️ DELIBERATELY UNCLAMPED — see `handleTouchMove`'s note below.
      const next = {
        x: viewPanRef.current.x + dx,
        y: viewPanRef.current.y + dy,
      };
      viewPanRef.current = next;
      setViewPanOffset(next);
      scheduleCommitPan();
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    // ⚠️ BEFORE the `getPixelCoords` bail below, not after. `"corner"` CLAMPS
    // where `"pixel"` returns `null`, and that difference is the feature:
    // dragging a guide out past the edge of the sprite must keep extending it
    // to the grid border, which a shared `!coords` early return would abort
    // mid-drag. Reads the store rather than a local flag — `draft` is the
    // gesture's only state and there is no second place for it to disagree.
    if (currentTool === "reflection") {
      if (!app.reflection.draft) return;
      const corner = getCornerCoords(e.clientX, e.clientY);
      if (corner) app.reflection.updateDraft(corner.x, corner.y);
      return;
    }

    // Pan the 3D reference. Before the `!coords` bail below for the same
    // reason reflection is: dragging past the sprite's edge must keep moving
    // the model rather than abandoning the gesture mid-drag.
    if (posePointerMove(e.clientX, e.clientY)) return;

    /* ⚠️ A SHAPE DRAG KEEPS TRACKING INSTEAD OF BAILING, and it must come
       BEFORE the `!coords` early return. Dragging a line/rectangle/ellipse
       past the edge keeps sizing it against the real pointer — the shape does
       not have to fit on the stage — and the part that lands off-grid is
       dropped by `setPixels` at commit. The old shared bail cleared the
       preview instead, so the shape vanished the moment the pointer left the
       canvas. Only tools that PAINT continuously need the `null`, which is
       what stops a brush smearing along the border. */
    if (isDrawing && drawStartPoint && isShapeTool(currentTool)) {
      const aim = getUnboundedPixelCoords(e.clientX, e.clientY);
      if (aim) {
        /* ⚠️ THIS BRANCH OWNS THE SHAPE PREVIEW — on-canvas as well as off.
           `getUnboundedPixelCoords` answers everywhere, so this returns before
           `pointer.continueStroke` for every sample of a shape drag, and
           `toolHandlers`' line/rectangle/ellipse `onMove` entries no longer
           run on this path. They are kept because the TOUCH path and the tool
           table's exhaustiveness check both still reference them, and because
           a handler that exists but is bypassed is less dangerous than a hole
           in the table.

           The preview cannot live in `toolHandlers`: that receives coords from
           `getCoords`, which is the `null`-returning `getPixelCoords`, so it
           cannot express an off-grid aim — and it has nowhere to record
           `lastShapeAimRef`, which the commit needs to tell outline from fill.
           Same generators, same `shapeMode`/`borderRadius`. */
        const from = drawStartPoint as Point;
        lastShapeAimRef.current = aim as Point;
        actions.setPreviewPixels(
          currentTool === "line"
            ? getLinePixels(from, aim)
            : currentTool === "rectangle"
              ? getRectanglePixels(from, aim, shapeMode, borderRadius)
              : getEllipsePixels(from, aim, shapeMode),
        );
        return;
      }
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
  /**
   * Where the current shape drag is AIMED — the point the preview was last
   * generated against, in grid space and possibly outside the grid.
   *
   * ⚠️ A ref, not state: it is written on every pointer move and read only at
   * commit, so making it reactive would re-render the canvas on each sample
   * for a value nothing displays. `finishDrawingStroke` needs it to ask the
   * generator which pixels are the OUTLINE, and `previewPixels` alone cannot
   * answer that — it is a flat list with no record of which role each pixel
   * played.
   */
  const lastShapeAimRef = useRef<Point | null>(null);

  /**
   * The three drag-to-draw shape tools.
   *
   * ⚠️ These END ONLY ON A GENUINE RELEASE. Leaving the canvas, leaving the
   * window, or an iPad touch that slides off the screen edge must NOT commit
   * the shape — the drag is bound to the POINTER, not to the element's
   * geometry (owner report, 2026-09-01). See `handleMouseLeave` and
   * `handleTouchEnd`.
   */
  const isShapeTool = (tool: string) =>
    tool === "line" || tool === "rectangle" || tool === "ellipse";

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
    if (previewPixels.length > 0 && isShapeTool(currentTool)) {
      /* ⚠️ TWO COLOURS, decided PER PIXEL — see `currentColor`/`fillColor`.
         In `"both"` mode a shape's edge and its interior are different roles
         and take different colours, so the commit cannot use one colour for
         the whole preview. In the single modes the question does not arise:
         `"outline"` is all edge and `"fill"` is all interior, so each takes
         the slot that shares its name.

         The outline set is asked of the SAME generator that drew the preview
         (`getShapeOutlineKeys`) rather than re-derived, so the two can never
         disagree and leave a seam. */
      const outlineKeys =
        shapeMode === "both" && drawStartPoint && lastShapeAimRef.current
          ? getShapeOutlineKeys(
              currentTool as "line" | "rectangle" | "ellipse",
              drawStartPoint as Point,
              lastShapeAimRef.current,
              borderRadius,
            )
          : null;

      actions.setPixels(
        previewPixels.map((p) => ({
          x: p.x,
          y: p.y,
          color: (outlineKeys
            ? outlineKeys.has(`${p.x},${p.y}`)
              ? currentColor
              : fillColor
            : shapeMode === "fill"
              ? fillColor
              : currentColor) as Color,
        })),
      );
    }

    actions.endStroke();
    actions.endDrawing();
  };

  /**
   * The pointer LEFT the canvas — which is not the end of anything.
   *
   * ⚠️ THIS IS NO LONGER `handleMouseUp`. It used to be bound directly to
   * `onMouseLeave`, so dragging a line/rectangle/ellipse off the canvas
   * COMMITTED it mid-drag (owner report, 2026-09-01). A gesture ends when the
   * button is released, never because the pointer crossed a border.
   *
   * The marker still clears — the cursor really has gone — but every gesture
   * stays open. Leaving during a shape drag keeps previewing against the
   * real pointer position (see `handleMouseMove`); the release that ends it is
   * caught by the window-level listener below, wherever it happens.
   */
  const handleMouseLeave = () => {
    applyMarker("mouse", "end", () => null);
  };

  const handleMouseUp = () => {
    lastStrokePixelRef.current = null;

    // Clearing the marker here covers the ordinary case; `handleMouseLeave`
    // covers the pointer leaving without a release.
    applyMarker("mouse", "end", () => null);

    // A real release, so the guide commits at its last position — the corner
    // lattice is clamped, so that already sits on the grid border, which is
    // where a user dragging off the edge means to put the line. `commitDraft`
    // is a no-op with no draft and rejects a degenerate (never-moved) one on
    // its own, so a plain click leaves nothing behind.
    if (currentTool === "reflection") {
      app.reflection.commitDraft();
      return;
    }

    // Ends the pan. Nothing to commit — `posePointerMove` already wrote every
    // sample to the store, so a release has no work beyond dropping the ref.
    if (posePointerUp()) return;

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

  /**
   * The release that ends a stroke, wherever in the document it happens.
   *
   * ⚠️ THE COUNTERPART TO NOT ENDING ON `onMouseLeave`. Now that leaving the
   * canvas keeps the gesture open, the mouse-up that finally ends it may land
   * anywhere — over a rail, over the page chrome, or outside the window
   * entirely. Without this the stroke would stay open and the next click would
   * extend it, which is the failure the old `onMouseLeave` binding was there
   * to prevent. This fixes it the right way round: end on the RELEASE, not on
   * the border crossing.
   *
   * Bound to `window` so a release outside the viewport still arrives, and
   * kept in a ref so the listener is attached once rather than re-bound on
   * every render — `handleMouseUp` closes over a dozen pieces of state and is
   * a new function each time.
   */
  const mouseUpRef = useRef(handleMouseUp);
  mouseUpRef.current = handleMouseUp;

  /**
   * Keep SIZING a shape while the cursor is off the canvas.
   *
   * ⚠️ THE OTHER HALF OF THE OFF-CANVAS DRAG. `onMouseMove` is bound to the
   * `<canvas>` element, so it stops firing the instant the pointer leaves it —
   * which meant the unbounded coordinate path never got a chance to run and
   * the shape froze at the border, even though the gesture was still open
   * (owner report, 2026-09-01). Ending on a window `mouseup` fixed the RELEASE;
   * this fixes the MOVE.
   *
   * ⚠️ Deliberately narrow: it forwards only while a shape drag is actually in
   * flight. Panning, painting, selection and the reflection guide all keep
   * their element-bound behaviour, where stopping at the edge is either
   * correct or long-established — a brush must not smear along the border, and
   * widening this would change all of them at once.
   */
  const mouseMoveRef = useRef(handleMouseMove);
  mouseMoveRef.current = handleMouseMove;

  const shapeDragOpen =
    isDrawing && drawStartPoint !== null && isShapeTool(currentTool);
  const shapeDragOpenRef = useRef(shapeDragOpen);
  shapeDragOpenRef.current = shapeDragOpen;

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!shapeDragOpenRef.current) return;
      // The canvas's own handler already ran if the pointer is over it; React
      // synthetic events do not fire from a native window listener, so there
      // is no double-dispatch to guard against here.
      if (e.target === canvasRef.current) return;
      mouseMoveRef.current(
        e as unknown as React.MouseEvent<HTMLCanvasElement>,
      );
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    return () => window.removeEventListener("mousemove", onWindowMouseMove);
  }, []);

  useEffect(() => {
    const onWindowMouseUp = () => mouseUpRef.current();
    /* `blur` covers the cases no mouse event reports: the window losing focus
       mid-drag (cmd-tab, a system dialog stealing the pointer). Ending the
       stroke there is right — the alternative is a gesture that silently
       survives into a different application and resumes on return. */
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("blur", onWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("blur", onWindowMouseUp);
    };
  }, []);

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
      // A second finger during a guide drag is a pinch, not a line. Drop the
      // draft so the zoom does not also leave a stray guide behind on release.
      app.reflection.cancelDraft();
      // Same for a pose pan: a pinch must zoom the VIEW, not drag the model
      // along with it, and a second contact must not pair with the first into
      // a phantom double-tap stamp.
      poseDragRef.current = null;
      poseLastDownRef.current = null;
      return;
    }

    // ⚠️ `pencilOnly` — a finger may pan and pinch here, but it may not paint.
    // Only the two STROKE call sites pass it; the marker and pan lookups below
    // deliberately do not, so a finger keeps moving the canvas and keeps
    // showing where a Pencil would land.
    const touch = drawingTouch(startTouches, pencilOnly);
    if (!touch) return;

    // ══════════════════════════════════════════════════════════════════════
    //  ⚠️ BEFORE THE GESTURE-TOOL BAIL BELOW — THIS ORDERING IS THE FEATURE
    // ══════════════════════════════════════════════════════════════════════
    //
    // `isGestureTool(currentTool)` now includes `"reflection"`, and the bail
    // further down returns for every member of that list. Reflection is the
    // FIRST gesture tool touch actually implements (the eyedropper, selection
    // and origin were never wired for it and fall through that bail doing
    // nothing), so its branch has to run first or the gesture is swallowed
    // silently — the highest-likelihood risk in MASTER §9.
    //
    // Also before the `!coords || !layer` guard: corner coords clamp and a
    // guide does not need a layer, so neither condition may abort it.
    if (currentTool === "reflection") {
      const corner = getCornerCoords(touch.clientX, touch.clientY);
      if (corner) app.reflection.beginDraft(corner.x, corner.y);
      return;
    }

    // ⚠️ POSE, ALSO BEFORE THE `isGestureTool` BAIL BELOW — the same ordering
    // rule, for the second tool that actually needs it. `pose` is in that
    // list, so the bail further down would swallow the whole gesture: no pan,
    // no double-tap stamp, silently. The owner uses an iPad; a mouse-only
    // pose tool is a failed task (D12).
    //
    // ⚠️ Also before the `!coords || !layer` guard, for the same reason as
    // the mouse path.
    if (posePointerDown(touch.clientX, touch.clientY)) return;

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
    if (pinchTouches(moveTouches).length >= 2 || isPinching()) {
      // ⚠️ Manual check 6: a pinch STARTED mid-drag has to kill the draft, or
      // the guide follows the zoom gesture and commits somewhere the user
      // never dragged. `cancelDraft` is a no-op with no draft, so this costs
      // nothing on the far more common pinch-with-no-guide-in-flight path.
      app.reflection.cancelDraft();
      poseDragRef.current = null;
      return;
    }

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
      // ⚠️ DELIBERATELY UNCLAMPED — DO NOT REINTRODUCE `clampPanToViewport`.
      //
      // Reported 2026-08-31: "our two finger panning and scrolling got messed
      // up. It tries to lock the region into place now and doesn't allow
      // complete freedom of panning."
      //
      // That was this clamp. It pinned the pan so the content's edges could
      // never travel inside the viewport frame, and — the part that reads as
      // "locked" — when the sprite is SMALLER than the viewport its min and max
      // collapse to the same number, so panning did nothing at all. A small
      // sprite simply could not be moved.
      //
      // The owner chose unrestricted panning (2026-08-31) over a
      // keep-a-margin compromise, accepting that the artwork can be pushed
      // fully off-screen. That is recoverable: the Reset View button in
      // `CanvasViewControls` recentres at view zoom 1, which is the job its own
      // header already describes as rescuing a lost view.
      //
      // ⚠️ MINUS, not plus — touch panning is inverted relative to the mouse
      // (the content follows the finger). Verbatim from `Canvas.tsx:1876`.
      const next = {
        x: viewPanRef.current.x - dx,
        y: viewPanRef.current.y - dy,
      };
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
    // ⚠️ `pencilOnly` again — see the note at the stroke's start. A finger
    // that is mid-drag simply produces no pixels rather than being treated as
    // an absent contact.
    const touch = drawingTouch(moveTouches, pencilOnly);
    if (!touch) return;

    // Before BOTH bails below — the `!coords` one (corner coords clamp; see
    // `handleMouseMove`) and the `isGestureTool` one at the end of this
    // handler, which would otherwise swallow every sample of the drag.
    if (currentTool === "reflection") {
      if (!app.reflection.draft) return;
      const corner = getCornerCoords(touch.clientX, touch.clientY);
      if (corner) app.reflection.updateDraft(corner.x, corner.y);
      return;
    }

    // ⚠️ Before BOTH bails below, exactly as reflection is: the `!coords` one
    // (a pan past the sprite's edge must keep panning) and the
    // `isGestureTool` one at the end of this handler, which would otherwise
    // discard every sample of the drag.
    if (posePointerMove(touch.clientX, touch.clientY)) return;

    // The shape tools keep tracking rather than bail — see `handleMouseMove`.
    // On the iPad this is the difference between a rectangle that keeps
    // following the Pencil past the bezel and one that vanishes.
    if (isDrawing && drawStartPoint && isShapeTool(currentTool)) {
      const aim = getUnboundedPixelCoords(touch.clientX, touch.clientY);
      if (aim) {
        const from = drawStartPoint as Point;
        lastShapeAimRef.current = aim as Point;
        actions.setPreviewPixels(
          currentTool === "line"
            ? getLinePixels(from, aim)
            : currentTool === "rectangle"
              ? getRectanglePixels(from, aim, shapeMode, borderRadius)
              : getEllipsePixels(from, aim, shapeMode),
        );
        return;
      }
    }

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

  /**
   * A touch ended.
   *
   * ⚠️ `touchend` IS THE GENUINE RELEASE on iOS — including the case where the
   * Pencil or finger slides off the screen edge, which reports `touchend` and
   * nothing else. There is no "left the screen" event to distinguish, so a
   * shape committed on a slide-off is committed on a real lift as far as the
   * DOM is concerned. What must NOT commit is a touch the SYSTEM took away
   * (`touchcancel` — a system-edge swipe, an incoming call, a palm rejected
   * after the fact); that abandons the shape instead. See `handleTouchCancel`.
   *
   * ⚠️ ONLY when the LAST contact lifts. `e.touches` is every touch still on
   * the page, so lifting one finger of a two-finger gesture — or a resting
   * palm coming off mid-stroke — used to end a shape that the user was still
   * drawing with the Pencil.
   */
  const handleTouchEnd = (e?: React.TouchEvent) => {
    if (e && canvasTouches(e).length > 0) return;
    lastStrokePixelRef.current = null;
    // The finger is gone, so the marker goes with it: unlike a mouse there is
    // no resting pointer position left to mark, and a marker still sitting on
    // the last cell reads as a selection rather than as a cursor. Set before
    // the early returns below so it clears on EVERY way a touch can end,
    // including a pan and a pixel-drag.
    applyMarker("touch", "end", () => null);

    // Before the `isGestureTool` bail this handler reaches via
    // `finishDrawingStroke`'s siblings, and before every early return below:
    // a reflection gesture sets none of `isPanning` / `isDraggingPixels` /
    // `isDrawing`, so without this branch the guide's draft would survive the
    // lift and keep following the next gesture. `commitDraft` clears it either
    // way and rejects a degenerate tap.
    if (currentTool === "reflection") {
      app.reflection.commitDraft();
      return;
    }

    // Before the `isGestureTool` bail this handler reaches through its
    // siblings, and before every early return below: a pose gesture sets none
    // of `isPanning` / `isDraggingPixels` / `isDrawing`, so without this the
    // drag ref would survive the lift and the NEXT touch would resume panning
    // from a stale origin.
    if (posePointerUp()) return;

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

  /**
   * The system took the touch away — ABANDON the shape, do not commit it.
   *
   * A `touchcancel` is not a release: the user never lifted, so committing
   * whatever the preview happened to show would place a shape they did not
   * finish drawing. The preview is dropped and the gesture closed.
   *
   * ⚠️ Without this binding the opposite bug appears: now that leaving the
   * canvas no longer ends a gesture, a cancelled touch would leave `isDrawing`
   * set forever and the next tap would extend the abandoned shape.
   */
  const handleTouchCancel = () => {
    lastStrokePixelRef.current = null;
    applyMarker("touch", "end", () => null);
    // The system took the touch away, so the pan drag ends where it is. It is
    // NOT rolled back: unlike a shape, every sample of a pan has already been
    // committed to the store and there is no in-flight preview to abandon.
    // The double-click record is dropped too, so a cancelled tap cannot pair
    // with the next one into a stamp the user never asked for.
    poseDragRef.current = null;
    poseLastDownRef.current = null;
    actions.clearPreviewPixels();
    setIsPanning(false);
    setLastPanPoint(null);
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
    // Explicit rather than left to the fallthrough, for the same documentary
    // reason the four branches above are: this list is the record of which
    // tools were considered, and a crosshair is genuinely right here — the
    // gesture places a point on the corner lattice.
    if (currentTool === "reflection") return "crosshair";
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
    // ⚠️ `contentWidth`, NOT `cellWidth`. This resets VIEW zoom to 1, so the
    // combined scale becomes `zoom * 1` and the on-screen content box is
    // `cellWidth * zoom` — which is exactly `contentWidth`. Centring against
    // the 1:1 backing size instead would offset every sprite by (zoom-1)/zoom
    // of its width, typically 90%. The old comment here said "at view zoom 1
    // the content is exactly canvasWidth x canvasHeight", which was true only
    // while the backing store was itself pre-scaled.
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

  /* ── per-pane view controls (split-canvas task 05) ─────────────────────── */
  //
  // Mode button (open the other pane, or swap sides when both are open) above
  // close (only when both are open) above reset; the Full pane adds the
  // `← ↑ ↓ →` variant-offset arrows, which call the SAME undoable action WASD
  // does — one history entry per press, shift = all frames.
  const otherMode: CanvasRenderMode = layerMode ? "full" : "layer";
  const modeButton = views.bothOpen
    ? {
        kind: "swap" as const,
        label: "Swap pane sides",
        onClick: () => views.swap(),
      }
    : {
        kind: "open" as const,
        label: layerMode ? "Open Full view" : "Open Layer view",
        onClick: () => views.openMode(otherMode),
      };
  const onClose = views.bothOpen
    ? {
        label: layerMode ? "Close Layer view" : "Close Full view",
        onClick: () => views.closeMode(renderMode),
      }
    : undefined;
  /* ══════════════════════════════════════════════════════════════════════
   *  THE SVG CHROME (D5) — the overlays that CANNOT survive at 1:1
   * ══════════════════════════════════════════════════════════════════════
   *
   * The grid, the hover outline, the lasso, the marching ants and the origin
   * cross are all SUB-CELL or SCREEN-CONSTANT geometry. Their canvas painters
   * degenerate at 1:1, and — this is why the whole detour exists — five of
   * the six degenerate SILENTLY (MASTER §4, risks R2 and R3):
   *
   *   grid          a 1px line every 1px: a flat wash over the whole canvas
   *   hover outline every edge zero-length; with `lineCap: butt`, NOTHING
   *   lasso         a 2px line with a `[3,3]` dash where a cell is 1px
   *   ants          a 1px inset is one whole cell; `width - 2` inverts under 3
   *   origin cross  a 12px constant becomes 12 × combinedScale on screen
   *
   * Task 03 emitted each as path DATA in cell space; task 04 mounted the SVG
   * and gave every path `vector-effect: non-scaling-stroke`, which exempts the
   * stroke WIDTH from the transform and gives these painters back exactly the
   * screen-constant hairline their own comments always claimed. This is where
   * the container finally feeds them.
   *
   * Cell FILLS stay on canvas (D6) — the hover fill, the selection mask, the
   * drag preview, the trace overlays. They are safe at 1:1 and cheap.
   */

  /**
   * The pixel grid.
   *
   * ⚠️ Two DIFFERENT grids, exactly as the raster version drew: outside
   * variant-edit the whole surface is gridded from the origin; while a
   * variant is being edited only the VARIANT EDIT AREA is, placed at
   * `variantOffset` inside the expanded view. `gridOverlayPathData` covers
   * the first case; the second needs the offset, which that function does not
   * take, so the placed lines are emitted here — the same `cells + 1` lines
   * per axis, in cell space, with no `+ 0.5` (SVG centres its own hairline).
   *
   * The COLOUR rule is not restated: `gridOverlayAttrs` owns it (black 8%
   * light, white 5% dark), so there is one source for it and not two.
   */
  const gridPath = useMemo(() => {
    const attrs = gridOverlayAttrs(lightGridMode);
    if (!isEditingVariantResolved) {
      return { d: gridOverlayPathData({ cellWidth, cellHeight }), attrs };
    }
    // View space: the variant's offset, less the view origin.
    const ox = variantOffset.x - viewMinX;
    const oy = variantOffset.y - viewMinY;
    const parts: string[] = [];
    for (let x = 0; x <= gridWidth; x++) {
      parts.push(`M${ox + x} ${oy}L${ox + x} ${oy + gridHeight}`);
    }
    for (let y = 0; y <= gridHeight; y++) {
      parts.push(`M${ox} ${oy + y}L${ox + gridWidth} ${oy + y}`);
    }
    return { d: parts.join(""), attrs };
  }, [
    lightGridMode,
    isEditingVariantResolved,
    cellWidth,
    cellHeight,
    gridWidth,
    gridHeight,
    variantOffset,
    viewMinX,
    viewMinY,
  ]);

  /**
   * ⚠️ THE HOVER OUTLINE IS DELIBERATELY NOT WIRED HERE. Read this before
   * "fixing" it.
   *
   * `strokeHoverOutline`'s raster half is gone — at 1:1 every edge is
   * zero-length and renders nothing — and `CanvasSurface` already accepts the
   * `hoverOutline` SVG prop (task 04) that replaces it. What is missing is
   * the RENDER SIGNAL, and supplying one is not free.
   *
   * The hovered cell lives in `hoverPixelRef`, a REF, and that is
   * load-bearing: `setHoverPixel` is called from `handleTouchMove`, so a
   * `useState` there re-renders this container mid-gesture and rebuilds
   * `getToolContext`, the tool handlers and `pointer` between the touches of
   * a single slide. That is the measured 2026-08-28 "unable to slide and
   * draw" regression, documented at `hoverPixelRef` above and again at
   * `reflectionPhaseRef`. Feeding an SVG prop needs React to be told the ref
   * moved, which is exactly the state write the ref exists to avoid.
   *
   * The reflection guides could take the vector path because they already
   * had a ~12 fps ticker whose cost was known and bounded. The hover marker
   * has a 120 Hz pointer stream behind it and no such budget, so the choice
   * belongs with whoever owns the marker's scheduling — not to a render
   * refactor. Until then the marker shows its FILL (raster, D6, correct at
   * 1:1) with no outline. Recorded as this task's one deferred item.
   */

  /* The selection chrome's shared placement — identical to `renderChrome`'s. */
  const selOffsetX = isEditingVariantResolved ? variantOffset.x - viewMinX : 0;
  const selOffsetY = isEditingVariantResolved ? variantOffset.y - viewMinY : 0;
  const selDragDx =
    isDraggingSelection && selectionDragMode === "pixels"
      ? pixelDragOffset.dx
      : 0;
  const selDragDy =
    isDraggingSelection && selectionDragMode === "pixels"
      ? pixelDragOffset.dy
      : 0;

  /** The lasso rubber band. */
  const lasso = useMemo(
    () =>
      isLassoSelecting
        ? lassoOverlay(lassoPoints, selOffsetX, selOffsetY)
        : null,
    [isLassoSelecting, lassoPoints, selOffsetX, selOffsetY],
  );

  /** The marching-ants selection box. */
  const marchingAnts = useMemo(() => {
    const selBox: SelectionBounds | null | undefined =
      previewSelection || selection?.bounds;
    if (!selBox) return null;
    return marchingAntsOverlay(
      selBox,
      selOffsetX,
      selOffsetY,
      selDragDx,
      selDragDy,
    );
  }, [
    previewSelection,
    selection,
    selOffsetX,
    selOffsetY,
    selDragDx,
    selDragDy,
  ]);

  /**
   * The origin cross — shown only while the origin tool is selected.
   *
   * It is OBJECT-space, so the Layer view of a VARIANT hides it; for a
   * regular layer the grid IS the object grid and it is correct as-is.
   * Preserved verbatim.
   *
   * ⚠️ `CanvasSurface` counter-scales this one by `1 / combinedScale`
   * (HANDOFF finding 1) — it is the only overlay whose GEOMETRY, not just its
   * stroke, must stay screen-constant.
   */
  const originCross = useMemo(() => {
    const originPos = obj?.origin;
    if (
      !originPos ||
      currentTool !== "origin" ||
      (layerMode && editingVariant)
    ) {
      return null;
    }
    const color = tool.originColor ?? DEFAULT_ORIGIN_COLOR;
    // View space, as every other overlay: the cross is in OBJECT cells and
    // the surface's origin is `viewMin` while a variant is being edited.
    const placed = isEditingVariantResolved
      ? { x: originPos.x - viewMinX, y: originPos.y - viewMinY }
      : originPos;
    return originCrossOverlay(
      placed,
      `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`,
    );
  }, [
    obj?.origin,
    currentTool,
    layerMode,
    editingVariant,
    tool.originColor,
    isEditingVariantResolved,
    viewMinX,
    viewMinY,
  ]);

  /**
   * The reflection guides — the VECTOR replacement for the retired raster
   * painter. The phase comes off the ref; `reflectionTick` is what makes this
   * memo recompute. See the note where the raster painter used to be.
   */
  const reflectionGuides = useMemo(() => {
    if (reflectionLines.length === 0 && !reflectionDraft) return null;
    // Lines are stored in EDITABLE-grid space, which in Layer mode is already
    // the view — hence `isEditingVariantResolved`, not `editingVariant`.
    const ox = isEditingVariantResolved ? viewMinX : 0;
    const oy = isEditingVariantResolved ? viewMinY : 0;
    return reflectionGuideOverlays(
      reflectionLines,
      reflectionDraft,
      ox,
      oy,
      reflectionPhaseRef.current,
    );
    // `reflectionPhaseRef` is a REF for the reason documented above; the tick
    // is the change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reflectionLines,
    reflectionDraft,
    isEditingVariantResolved,
    viewMinX,
    viewMinY,
    reflectionTick,
  ]);

  const onNudgeOffset =
    !layerMode && editingVariant
      ? (dx: number, dy: number, allFrames: boolean) =>
          actions.setVariantOffset(dx, dy, allFrames)
      : undefined;

  return (
    <CanvasSurface
      canvasRef={canvasRef}
      overlayCanvasRef={overlayCanvasRef}
      frameOverlayCanvasRef={frameOverlayCanvasRef}
      frameTraceOverlayCanvasRef={frameTraceOverlayCanvasRef}
      hoverCanvasRef={hoverCanvasRef}
      // The pose tool's 3D reference (task 04 mounted the canvas; this
      // supplies the ref). It sits above every layer and below the reflection
      // guides and the SVG chrome — DOM order is z-order in the stack, and
      // `CanvasSurface` inserts it accordingly (D10).
      poseCanvasRef={poseCanvasRef}
      containerRef={containerRef}
      // ⚠️ `reflectionCanvasRef` is DELIBERATELY NOT PASSED. `CanvasSurface`
      // mounts that canvas unconditionally and the prop is optional, so the
      // element still exists and simply stays blank — which is exactly what
      // its own header describes for the absent-prop case. The raster painter
      // that used to fill it is retired; `reflectionGuides` below is the
      // vector replacement (D5). Passing it again would draw the guides
      // twice, once wrong.
      //
      // ── ids only, never a layer object (R8) ────────────────────────────
      layerIds={layerIds}
      registerLayerCanvas={registerLayerCanvas}
      layerOpacity={layerOpacity}
      layerVisible={layerVisible}
      cellWidth={cellWidth}
      cellHeight={cellHeight}
      viewPanOffset={viewPanOffset}
      // ⚠️ ONE scale, multiplied here and nowhere else (D2). `zoom` (shared,
      // [1,50]) and `viewZoom` (per-pane, [0.25,4]) stay separate store
      // fields with unchanged ranges, defaults and persistence; only their
      // APPLICATION moved, from six backing stores into this transform.
      combinedScale={zoom * viewZoom}
      // ── the background DIV (task 06, D11) ──────────────────────────────
      // Two primitives, no theme object: `lightGridMode` picks the palette
      // via a modifier class in `CanvasSurface.css`, and `checkerParity`
      // carries the world-space phase the raster painter derived from
      // `(offsetX + px + offsetY + py) % 2`. The JS `BackgroundTheme` does
      // not cross the `ui/` boundary at all.
      lightGridMode={lightGridMode}
      checkerParity={checkerParity}
      cursor={cursor}
      // All three overlays are object-space aids — hidden in Layer mode.
      showReferenceOverlay={!layerMode && isReferenceTraceActive}
      // #8 hides while EITHER trace mode is on: two semi-transparent onion
      // skins stacked on one sprite are unreadable. Verbatim from
      // `Canvas.tsx:2022`.
      showFrameOverlay={
        !layerMode &&
        Boolean(overlayFrame) &&
        !isReferenceTraceActive &&
        !frameTraceActive
      }
      showFrameTraceOverlay={!layerMode && frameTraceActive}
      // ── the SVG chrome (D5): the overlays that cannot survive at 1:1 ────
      grid={gridPath}
      lasso={lasso}
      marchingAnts={marchingAnts}
      originCross={originCross}
      reflectionGuides={reflectionGuides}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      /* ⚠️ NO `onMouseUp` HERE — the window-level listener owns the release,
         so a mouse-up inside the canvas and one outside take the exact same
         path. Binding both would run `handleMouseUp` twice for every release
         inside the canvas (the canvas handler, then the same event bubbling
         to `window`). `onMouseLeave` no longer ends anything. */
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      viewControls={
        <CanvasViewControls
          onResetView={handleResetView}
          modeButton={modeButton}
          onClose={onClose}
          onNudgeOffset={onNudgeOffset}
        />
      }
    />
  );
});
