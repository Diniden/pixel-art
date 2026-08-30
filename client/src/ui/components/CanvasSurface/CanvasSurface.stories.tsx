/**
 * CanvasSurface stories — and the PROOF that the `ui/` boundary holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2 OF REFRESH TASK 32: EVERY ONE OF THESE STORIES RENDERS WITH NO
 *  STORE PROVIDER OF ANY KIND
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no `StoreProvider` here, no `ApplicationStore`, no `installBridge`,
 * no legacy store hook, no MobX import and no decorator that supplies any of
 * them — `.storybook/preview.tsx` provides only CSS, MSW and a full-height
 * wrapper. If `CanvasSurface` had kept a single store read, every story below
 * would throw on mount.
 *
 * That is not a stylistic claim, it is the reason the file exists. `Canvas.tsx`
 * destructured **47 store members**; a component that still needed one of them
 * would be unstoryable, and "it is pure now" would be unfalsifiable. Mounting
 * it with nothing is the falsifiable version.
 *
 * ## How a pure canvas gets something to look at
 *
 * `CanvasSurface` paints NOTHING — it owns the `<canvas>` elements and hands
 * their refs out, because grids may never cross the `ui/` boundary as props
 * (R2: the owner's real project is 300,249 cells). In the app, the imperative
 * draw is driven by `CanvasContainer`'s `reaction` on `pixelVersion`.
 *
 * These stories play the container's part: a small harness holds the refs,
 * paints the fixture into them with a `useEffect`, and renders the surface. The
 * painting is plain `fillRect` against the SHARED task-10 fixtures
 * (`projectTypical`), never `Base Unit.json` — the owner's real 1.1 MB project
 * is migration-corpus data, not story data.
 *
 * ⚠️ That arrangement is what makes the PER-LAYER stack storyable without
 * breaking the rule it exists to protect. `LayerStack` below passes
 * `layerIds` — plain strings — plus a `registerLayerCanvas` callback, and the
 * harness paints the fixture layers through the elements that callback hands
 * it. The layer OBJECTS never reach `CanvasSurface`; they stay in the harness,
 * which is exactly where the container keeps them in the real app.
 *
 * ## The eight states
 *
 * | Story            | What it exercises                                       |
 * | ---------------- | ------------------------------------------------------- |
 * | Default          | the plain editing surface; no overlay mounted            |
 * | VariantEdit      | the EXPANDED view — the union of object and variant      |
 * |                  | bounds — with the object outline and the variant frame   |
 * | SelectionActive  | the marching-ants box and the mask fill                  |
 * | FrameOverlay     | the onion-skin overlay canvas mounted above the surface  |
 * | LightGridMode    | the light checkerboard theme                             |
 * | ReflectionGuides | the reflection guides, as SVG vectors, stacked last      |
 * | **LayerStack**   | **one 1:1 canvas per layer at DIFFERING opacities (D4)** |
 * | **SvgChrome**    | **every task-03 vector overlay at once, origin cross     |
 * |                  | included — the counter-scaled group under a live scale** |
 *
 * ⚠️ `LightGridMode` is where task 02's `lightGridMode` round-trip fix first
 * becomes VISIBLE, and the task 32 spec nominates it as the manual
 * verification for that fix's persistence claim. The story shows what the
 * setting looks like; the persistence half still needs the running app (toggle,
 * wait for autosave, hard-reload) and is recorded as owed in the report.
 */
import { useCallback, useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CanvasSurface } from "./CanvasSurface";
import type { CanvasSurfaceProps } from "./CanvasSurface";
import { gridOverlayPath } from "@/ui/canvas/svg/gridOverlay";
import {
  brushOutlineOverlay,
  hoverOutlineOverlay,
  lassoOverlay,
  marchingAntsOverlay,
  originCrossOverlay,
  reflectionGuideOverlays,
} from "@/ui/canvas/svg/chromeOverlay";
import { ORIGIN_CROSS_RED } from "@/ui/theme/canvasTokens";
import { projectTypical } from "../../../fixtures";
import type { Layer, PixelData } from "../../../types";

/* ── the painting harness (what the container does, in miniature) ────────── */

/**
 * The combined scale the LAYOUT is magnified by — `zoom * viewZoom` in the app.
 *
 * ⚠️ It is no longer a multiplier inside the painters below (plan 05, task 02).
 * Every `<canvas>` is 1:1 with the pixel data — `GRID.width x GRID.height`, not
 * `GRID.width * ZOOM` — and this number reaches the DOM once, as
 * `combinedScale` on `CanvasSurface`, where the GPU applies it. The painters
 * therefore fill ONE device pixel per cell and `image-rendering: pixelated`
 * keeps the upscale crisp.
 *
 * ⚠️ THE SUB-CELL CHROME HAS MOVED (plan 05, tasks 03 + 04). At 1:1 the canvas
 * painters degenerate exactly as `MASTER.md` §4 predicted — grid lines fall one
 * per pixel column and read as a flat wash, the marching ants' `[4, 4]` dash
 * spans four whole CELLS, the hover outline's edges are zero-length and render
 * NOTHING. All of it is now inline SVG with `vector-effect:
 * non-scaling-stroke` (D5), which gives it back the screen-constant stroke its
 * painters always documented. `SvgChrome` below shows the whole set.
 *
 * The raster `strokeGridLines` helper survives only where a story is
 * deliberately showing the OLD path for contrast; the ARTWORK — the cell fills
 * (D6), which is what these stories exist to frame — was always correct at
 * 1:1.
 */
const ZOOM = 12;

/** The light/dark checkerboard, matching `ui/canvas/render/canvasBackground`. */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  cellsX: number,
  cellsY: number,
  light: boolean,
) {
  const a = light ? "#f0f0f0" : "#2a2a32";
  const b = light ? "#d8d8d8" : "#22222a";
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function strokeGridLines(
  ctx: CanvasRenderingContext2D,
  cellsX: number,
  cellsY: number,
  light: boolean,
) {
  ctx.strokeStyle = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= cellsX; x++) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, cellsY);
  }
  for (let y = 0; y <= cellsY; y++) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(cellsX, y + 0.5);
  }
  ctx.stroke();
}

/** Paint one fixture layer at `(ox, oy)` cells, with an opacity multiplier. */
function paintLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  ox: number,
  oy: number,
  opacity = 1,
) {
  if (!layer.visible) return;
  for (let y = 0; y < layer.pixels.length; y++) {
    const row = layer.pixels[y] as PixelData[] | undefined;
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      // `PixelData.color` is `Pixel | 0` — `0` is the transparent sentinel,
      // which `!color` already covers.
      const color = cell?.color;
      if (!color || color.a === 0) continue;
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255) * opacity})`;
      ctx.fillRect(x + ox, y + oy, 1, 1);
    }
  }
}

/** The task-10 fixture's first frame — the sprite every story draws. */
const heroFrame = projectTypical.objects[0].frames[0];
const GRID = projectTypical.objects[0].gridSize;

type PaintFn = (ctx: CanvasRenderingContext2D) => void;

interface HarnessProps {
  /**
   * Everything `CanvasSurface` needs except the refs and the layer-ref
   * registration callback — the harness owns those, as the container does.
   */
  surface: Omit<
    CanvasSurfaceProps,
    | "canvasRef"
    | "overlayCanvasRef"
    | "frameOverlayCanvasRef"
    | "frameTraceOverlayCanvasRef"
    | "hoverCanvasRef"
    | "reflectionCanvasRef"
    | "containerRef"
    | "registerLayerCanvas"
  >;
  /** Draws the main surface. Runs once the refs are attached. */
  paint: PaintFn;
  /** Draws the frame-overlay canvas, when the story mounts one. */
  paintOverlay?: PaintFn;
  /**
   * Draws the reflection guide canvas.
   *
   * Optional because most stories have no guides — but the canvas is mounted
   * either way (see `CanvasSurface`'s header), so a story that omits this
   * still proves the surface is present and transparent rather than covering
   * the artwork.
   */
  paintReflection?: PaintFn;
  /**
   * Draws ONE layer's canvas, by layer id.
   *
   * ⚠️ This is the whole R8 arrangement in miniature. The harness knows the
   * layer objects; `CanvasSurface` knows only their ids. The element arrives
   * through `registerLayerCanvas`, the harness looks the layer up by id and
   * paints it — which is exactly what `CanvasContainer` does, at scale, driven
   * by a `reaction` on `pixelVersion`.
   */
  paintLayerCanvas?: (id: string, ctx: CanvasRenderingContext2D) => void;
}

/**
 * Stands in for `CanvasContainer` — holds the refs and drives the imperative
 * draw. It reads NO store; the values it forwards are literals from the story.
 */
function SurfaceHarness({
  surface,
  paint,
  paintOverlay,
  paintReflection,
  paintLayerCanvas,
}: HarnessProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const reflectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The container's layer-ref map, in miniature.
   *
   * A `Map<string, HTMLCanvasElement>` rather than React state: registering a
   * ref must not schedule a render, exactly as in `CanvasContainer`. The
   * `null` branch is what stops the map growing stale entries as layers are
   * deleted or reordered — `CanvasSurface` calls it on unmount for precisely
   * that reason.
   */
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());

  const registerLayerCanvas = useCallback(
    (id: string, el: HTMLCanvasElement | null) => {
      if (!el) {
        layerCanvases.current.delete(id);
        return;
      }
      layerCanvases.current.set(id, el);
      const ctx = el.getContext("2d");
      if (!ctx || !paintLayerCanvas) return;
      ctx.imageSmoothingEnabled = false;
      paintLayerCanvas(id, ctx);
    },
    [paintLayerCanvas],
  );

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      paint(ctx);
    }
    const overlayCtx = frameOverlayCanvasRef.current?.getContext("2d");
    if (overlayCtx && paintOverlay) {
      overlayCtx.imageSmoothingEnabled = false;
      paintOverlay(overlayCtx);
    }
    const reflectionCtx = reflectionCanvasRef.current?.getContext("2d");
    if (reflectionCtx && paintReflection) {
      reflectionCtx.imageSmoothingEnabled = false;
      paintReflection(reflectionCtx);
    }
  }, [paint, paintOverlay, paintReflection]);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <CanvasSurface
        {...surface}
        canvasRef={canvasRef}
        overlayCanvasRef={overlayCanvasRef}
        frameOverlayCanvasRef={frameOverlayCanvasRef}
        frameTraceOverlayCanvasRef={frameTraceOverlayCanvasRef}
        hoverCanvasRef={hoverCanvasRef}
        reflectionCanvasRef={reflectionCanvasRef}
        containerRef={containerRef}
        registerLayerCanvas={registerLayerCanvas}
      />
    </div>
  );
}

/** Props shared by every story; each overrides what it is demonstrating. */
const baseSurface: HarnessProps["surface"] = {
  // 1:1 with the pixel data. `combinedScale` does the magnification.
  cellWidth: GRID.width,
  cellHeight: GRID.height,
  viewPanOffset: { x: 24, y: 24 },
  combinedScale: ZOOM,
  cursor: "crosshair",
  showReferenceOverlay: false,
  showFrameOverlay: false,
  showFrameTraceOverlay: false,
  onMouseDown: () => {},
  onMouseMove: () => {},
  onMouseUp: () => {},
  onMouseLeave: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
};

const meta = {
  title: "Components/CanvasSurface",
  component: SurfaceHarness,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "BEM block `canvas`. The pure replacement for `Canvas.tsx` " +
          "(3,062 lines, 11 responsibilities, 47 store members in one " +
          "destructure). It owns the six-`<canvas>` stack, the pan/zoom " +
          "transform wrapper and the cursor — and nothing else. **No pixel " +
          "grid is ever a prop**: grids reach the canvas imperatively " +
          "through the refs, driven by `CanvasContainer`'s reaction on " +
          "`pixelVersion`. Every story below mounts with **no store " +
          "provider**, which is what proves the boundary.",
      },
    },
  },
} satisfies Meta<typeof SurfaceHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

/* ── 1. default ──────────────────────────────────────────────────────────── */

/** The plain editing surface: checkerboard, sprite, grid lines. */
export const Default: Story = {
  args: {
    surface: baseSurface,
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
      strokeGridLines(ctx, GRID.width, GRID.height, false);
    },
  },
};

/* ── 2. variant-edit mode ────────────────────────────────────────────────── */

const VARIANT_OFFSET = { x: -4, y: -3 };
const VARIANT_SIZE = { width: 12, height: 12 };
// The EXPANDED view: the union of the object's bounds and the offset variant's.
// This is exactly what `useCanvasGeometry` computes, so a variant hanging off
// the left edge stays visible and editable rather than being clipped.
const VIEW_MIN_X = Math.min(0, VARIANT_OFFSET.x);
const VIEW_MIN_Y = Math.min(0, VARIANT_OFFSET.y);
const VIEW_W =
  Math.max(GRID.width, VARIANT_OFFSET.x + VARIANT_SIZE.width) - VIEW_MIN_X;
const VIEW_H =
  Math.max(GRID.height, VARIANT_OFFSET.y + VARIANT_SIZE.height) - VIEW_MIN_Y;

/**
 * Editing a variant: the canvas grows to the union of the object's and the
 * variant's bounds, regular layers dim to 50 %, the object bounds are dashed
 * amber and the variant edit area is a violet frame.
 */
export const VariantEdit: Story = {
  args: {
    surface: {
      ...baseSurface,
      // The D1 conditional, in miniature: the canvas covers the UNION of the
      // object and the offset variant, so a variant hanging off the left edge
      // stays visible. Still 1:1 — the union is measured in cells.
      cellWidth: VIEW_W,
      cellHeight: VIEW_H,
    },
    paint: (ctx) => {
      paintBackground(ctx, VIEW_W, VIEW_H, false);
      ctx.save();
      ctx.translate(-VIEW_MIN_X, -VIEW_MIN_Y);

      // Regular layers dim to 0.5 while a variant is edited.
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0, 0.5);
      // The edited variant, at its offset, at full opacity.
      paintLayer(
        ctx,
        heroFrame.layers[0],
        VARIANT_OFFSET.x,
        VARIANT_OFFSET.y,
        1,
      );

      // Sub-cell chrome at 1:1 — hairlines until D5's SVG lands. See `ZOOM`.
      ctx.strokeStyle = "rgba(255, 171, 0, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, GRID.width, GRID.height);
      ctx.setLineDash([]);

      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        VARIANT_OFFSET.x,
        VARIANT_OFFSET.y,
        VARIANT_SIZE.width,
        VARIANT_SIZE.height,
      );
      ctx.restore();
    },
  },
};

/* ── 3. selection active ─────────────────────────────────────────────────── */

/**
 * A finalized rectangular selection: the cyan mask fill plus the marching-ants
 * outline.
 *
 * ⚠️ Only the CHROME is shown. The mask itself is a `Set` that reaches
 * 300,249 entries on the owner's real project and never crosses this
 * boundary — `CanvasInfoContainer` projects it to four numbers, and the canvas
 * paints it imperatively.
 */
export const SelectionActive: Story = {
  args: {
    surface: baseSurface,
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
      strokeGridLines(ctx, GRID.width, GRID.height, false);

      const box = { x: 3, y: 3, width: 8, height: 7 };

      // The mask FILL is a cell fill and stays correct at 1:1 (D6).
      ctx.fillStyle = "rgba(0, 217, 255, 0.14)";
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // Marching ants: two offset dashes, matching
      // `ui/canvas/render/renderSelectionOverlay`.
      //
      // ⚠️ The `[4, 4]` dash now spans FOUR CELLS rather than four screen
      // pixels, so the ants read as a coarse chase until D5's SVG replaces
      // them. Kept, degenerate and visible, rather than deleted — the story's
      // job is to show what the surface stacks, and hiding the regression
      // would hide exactly what tasks 03/04 exist to fix.
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#00d9ff";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width, box.height);
      ctx.strokeStyle = "#001018";
      ctx.lineDashOffset = 4;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width, box.height);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    },
  },
};

/* ── 4. frame overlay ────────────────────────────────────────────────────── */

/**
 * The onion-skin overlay (#8): a SECOND `<canvas>` mounts above the surface,
 * absolutely positioned and `pointer-events: none`, showing another frame at
 * reduced opacity with a dashed border.
 *
 * ⚠️ It hides whenever either trace mode is on — two semi-transparent onion
 * skins stacked on one sprite are unreadable. `CanvasSurface` receives that
 * decision as a boolean rather than deriving it, which keeps the policy where
 * the store data lives.
 */
export const FrameOverlay: Story = {
  args: {
    surface: { ...baseSurface, showFrameOverlay: true },
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
      strokeGridLines(ctx, GRID.width, GRID.height, false);
    },
    paintOverlay: (ctx) => {
      const other = projectTypical.objects[0].frames[1] ?? heroFrame;
      ctx.globalAlpha = 0.45;
      for (const layer of other.layers) paintLayer(ctx, layer, 2, 1);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "rgba(139, 92, 246, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(2, 1, GRID.width, GRID.height);
      ctx.setLineDash([]);
    },
  },
};

/* ── 5. light grid mode ──────────────────────────────────────────────────── */

/**
 * The LIGHT checkerboard theme.
 *
 * ⚠️ This is where task 02's `lightGridMode` round-trip fix first becomes
 * visible. Before that fix the field was dropped on reload AND on undo — a
 * live data-loss bug. This story shows the rendering half; the persistence
 * half needs the running app and is recorded as an owed manual check.
 */
export const LightGridMode: Story = {
  args: {
    surface: baseSurface,
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, true);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
      strokeGridLines(ctx, GRID.width, GRID.height, true);
    },
  },
};

/* ── 6. reflection guides ────────────────────────────────────────────────── */

/**
 * The reflection tool's guide lines — now as SVG VECTORS (plan 05, D5).
 *
 * ⚠️ What this story exists to show is the STACKING, and that claim survived
 * the move from raster to vector unchanged: the SVG mounts LAST inside
 * `.canvas__frame`, so the guides sit above the hover marker and above both
 * semi-transparent trace overlays. A guide the user cannot see is a guide that
 * cannot be trusted — it is the only indication of where the next stroke will
 * be mirrored.
 *
 * ⚠️ Why they had to leave the canvas: `REFLECTION_DASH = 4` is documented as
 * SCREEN-constant, and under the CSS `scale(combinedScale)` a 4px dash at
 * `ZOOM = 12` became a 48px one. `vector-effect: non-scaling-stroke` — set by
 * `reflectionGuideOverlays` itself — restores exactly the invariant the
 * painter's own comment always claimed.
 *
 * The dashes here are STATIC: `dashOffset` is a plain parameter, so a story
 * passes `0`. In the app `useDashTicker` advances it at ~12 fps and, because
 * the phase lives in a ref, React is never told anything happened.
 *
 * The endpoints are on the integer CORNER lattice, not on cell centres — the
 * line falls *between* pixel columns, which is what "reflect between pixels"
 * means geometrically.
 */
export const ReflectionGuides: Story = {
  args: {
    surface: {
      ...baseSurface,
      reflectionGuides: reflectionGuideOverlays(
        [
          { x1: GRID.width / 2, y1: 0, x2: GRID.width / 2, y2: GRID.height },
          { x1: 0, y1: 0, x2: GRID.width, y2: GRID.height },
        ],
        null,
        0,
        0,
        0,
      ),
    },
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
    },
  },
};

/* ── 7. the per-layer canvas stack ───────────────────────────────────────── */

/**
 * ONE 1:1 `<canvas>` PER LAYER, at differing opacities (plan 05, D3 + D4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS STORY IS THE R8 PROOF, AND IT PROVES IT BY WHAT IT PASSES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `CanvasSurface` receives `layerIds` — an array of STRINGS — plus a
 * `registerLayerCanvas` callback and two `Record<string, number|boolean>`
 * maps. It never sees a `Layer`. The harness holds the fixture layers, is
 * handed each canvas element as it mounts, looks the layer up by id and paints
 * it imperatively. That is precisely the arrangement `CanvasContainer` uses at
 * scale, and it is why a 300,249-cell project can be edited without MobX ever
 * looking inside a pixel grid.
 *
 * Three things this makes visible:
 *
 * 1. **Compositing is the browser's job now.** Each layer is its own 1:1
 *    canvas; the stack is composited by the compositor, not by a JS loop that
 *    walks every cell of every layer building an `rgba(...)` string per cell.
 * 2. **Dimming is CSS `opacity` (D4)**, not a per-cell alpha multiply. The
 *    third layer here sits at 0.5 — the `transparent` focus mode's value —
 *    and the second at 0.7, the variant-edit "other layers" value. Toggling
 *    either is a compositor property change, not a repaint.
 *    ⚠️ `onion` is deliberately absent: it is an outline-only mode driven by
 *    `isOutlineCell`'s neighbour tests and cannot be an opacity.
 * 3. **Visibility is `display: none`**, which keeps the element — and so its
 *    painted bitmap and its registered ref — alive across a toggle.
 */
export const LayerStack: Story = {
  args: {
    surface: {
      ...baseSurface,
      layerIds: heroFrame.layers.map((l) => l.id),
      layerOpacity: Object.fromEntries(
        heroFrame.layers.map((l, i) => [l.id, [1, 0.7, 0.5][i] ?? 1]),
      ),
      layerVisible: Object.fromEntries(
        heroFrame.layers.map((l) => [l.id, l.visible]),
      ),
      grid: gridOverlayPath(
        { cellWidth: GRID.width, cellHeight: GRID.height },
        false,
      ),
    },
    // The checkerboard still comes from the pointer surface until task 06
    // builds the background DIV. The ARTWORK is on the layer canvases below.
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
    },
    paintLayerCanvas: (id, ctx) => {
      const layer = heroFrame.layers.find((l) => l.id === id);
      if (!layer) return;
      // Opacity is NOT multiplied in here — that is the point of D4. It is a
      // CSS property on the element, applied by the compositor.
      paintLayer(ctx, layer, 0, 0, 1);
    },
  },
};

/* ── 8. the full SVG chrome ──────────────────────────────────────────────── */

const CHROME_BRUSH = [
  { x: 6, y: 4 },
  { x: 7, y: 4 },
  { x: 6, y: 5 },
  { x: 7, y: 5 },
];
const CHROME_HOVER = [
  { x: 14, y: 18 },
  { x: 15, y: 18 },
  { x: 14, y: 19 },
];

/**
 * EVERY task-03 vector overlay at once — the visual regression net for D5.
 *
 * The grid, the brush outline, the hover outline, the lasso, the marching ants
 * and the origin cross, all in the one `.canvas__svg` element, all under a
 * live `scale(12)`. Three of these rendered NOTHING at all after task 02, and
 * they did so silently:
 *
 * - `strokeHoverOutline`'s edges are zero-length at 1:1; with `lineCap: butt`
 *   the canvas drew none of them. No error, no artifact — just an absent
 *   marker. If the hover outline is missing here, that is the regression.
 * - `strokeBrushOutlines` collapsed to `strokeRect(x, y, 0, 0)`.
 * - `drawMarchingAnts`' inner rect was inset by one whole CELL and its
 *   `width - 2` inverted for any selection under three cells.
 *
 * ⚠️ THE ORIGIN CROSS IS THE ONE TO WATCH, and it is the reason this story
 * runs at `ZOOM = 12` rather than 1. `vector-effect: non-scaling-stroke`
 * exempts stroke WIDTH from the transform but NOT geometry, so its 12px arms
 * emitted as 12 user units would be 144 screen px here (and 600 at zoom 50).
 * `CanvasSurface` places them in a `<g>` counter-scaled by `1/combinedScale`,
 * inside which one unit is one screen pixel again. If the cross grows with the
 * zoom, that wrapper is gone. See `HANDOFF.md` finding 1.
 */
export const SvgChrome: Story = {
  args: {
    surface: {
      ...baseSurface,
      grid: gridOverlayPath(
        { cellWidth: GRID.width, cellHeight: GRID.height },
        false,
      ),
      brushOutline: brushOutlineOverlay(CHROME_BRUSH),
      hoverOutline: hoverOutlineOverlay(CHROME_HOVER),
      lasso: lassoOverlay(
        [
          { x: 2, y: 12 },
          { x: 6, y: 15 },
          { x: 3, y: 20 },
        ],
        0,
        0,
      ),
      marchingAnts: marchingAntsOverlay(
        { x: 3, y: 3, width: 8, height: 7 },
        0,
        0,
      ),
      // Deliberately off the top-left corner, so the counter-scaled group's
      // translate is visibly doing something.
      originCross: originCrossOverlay(
        { x: Math.round(GRID.width / 2), y: Math.round(GRID.height / 2) },
        ORIGIN_CROSS_RED,
      ),
    },
    paint: (ctx) => {
      paintBackground(ctx, GRID.width, GRID.height, false);
      for (const layer of heroFrame.layers) paintLayer(ctx, layer, 0, 0);
      // The selection mask FILL stays raster (D6) — only the ants are vectors.
      ctx.fillStyle = "rgba(0, 217, 255, 0.14)";
      ctx.fillRect(3, 3, 8, 7);
    },
  },
};
