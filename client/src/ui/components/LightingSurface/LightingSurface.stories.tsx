/**
 * LightingSurface stories — and the PROOF that the `ui/` boundary holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2 OF REFRESH TASK 33: EVERY STORY BELOW RENDERS WITH NO STORE
 *  PROVIDER OF ANY KIND
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no `StoreProvider` here, no `ApplicationStore`, no `installBridge`,
 * no legacy store hook, no MobX import and no decorator that supplies any of
 * them — `.storybook/preview.tsx` provides only CSS, MSW and a full-height
 * wrapper. If `LightingSurface` had kept a single store read, every story would
 * throw on mount.
 *
 * `LightingCanvas.tsx` destructured **14 store members**; a component that still
 * needed one would be unstoryable, and "it is pure now" would be unfalsifiable.
 * Mounting it with nothing is the falsifiable version.
 *
 * ## The stories paint with the REAL renderers
 *
 * `CanvasSurface`'s stories hand-roll a `fillRect` painter. These do not: they
 * call `renderNormalEdit` and `paintBrushCells` — the same pure functions
 * `LightingCanvasContainer` calls — because those are store-free by
 * construction. So the stories double as a visual check on the renderers, and
 * `LightGridMode` shows the exact pixels the app now produces.
 *
 * ## ⚠️ 1:1 CANVASES AND A COMBINED SCALE (plan 05, task 08 — R7 closed)
 *
 * Every story now passes `cellWidth`/`cellHeight` in GRID CELLS and a single
 * `combinedScale` of `zoom * viewZoom`; the painters are called with a `zoom`
 * of one. That is the same model `CanvasSurface`'s stories use, and the two
 * engines finally interpret the shared `ViewportUIStore.zoom` identically.
 *
 * The grid and the brush OUTLINE left the canvas with it: at one pixel per
 * cell the raster grid is a flat wash of colour and the raster outline strokes
 * 0×0 rectangles and renders nothing. Both are `ui/canvas/svg/` paths passed as
 * props — the SAME emitters `CanvasSurface` renders, never a second copy.
 *
 * ## ⚠️ `Default` vs `LightGridMode` IS the Q3 sign-off
 *
 * Task 33's manual check 4 asks for `CanvasSurface`'s and `LightingSurface`'s
 * `Default` / `LightGridMode` stories side by side, and for the grids to AGREE.
 * They now do — both go through `backgroundTheme()`. Before this task
 * `LightingCanvas` had NO light mode at all, so `LightGridMode` below is a view
 * of behaviour that has never shipped. That is the change needing owner
 * sign-off.
 */
import { useCallback, useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LightingSurface } from "./LightingSurface";
import { CanvasViewControls } from "../CanvasViewControls/CanvasViewControls";
import type { LightingSurfaceProps } from "./LightingSurface";
import { backgroundTheme } from "../../canvas/render/canvasBackground";
import { renderNormalEdit } from "../../canvas/render/renderNormalEdit";
import { paintBrushCells } from "../../canvas/render/renderBrushOverlay";
import { gridOverlayPath } from "../../canvas/svg/gridOverlay";
import { brushOutlineOverlay } from "../../canvas/svg/chromeOverlay";

/** The shared pixel scale. A CSS scale factor now, never a backing-store size. */
const ZOOM = 14;
const GRID_W = 16;
const GRID_H = 16;

/**
 * The `zoom` the raster painters are called with: **one**.
 *
 * The same constant `LightingCanvasContainer` names `CELL_SCALE`, and for the
 * same reason — these stories deliberately call the REAL painters with the REAL
 * arguments the container passes, so a story that quietly kept `ZOOM` here
 * would be showing pixels the app no longer produces.
 */
const CELL_SCALE = 1;

/**
 * A synthetic NORMAL visualisation — the shape `renderNormalAsRGB` produces.
 * A dome: normals tilt away from the centre, so R and G sweep across the sprite
 * and the silhouette reads as a lit ball rather than as noise.
 */
function normalSource(ctx: CanvasRenderingContext2D): ImageData {
  const img = ctx.createImageData(GRID_W, GRID_H);
  const cx = (GRID_W - 1) / 2;
  const cy = (GRID_H - 1) / 2;
  const r = GRID_W / 2 - 1;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      const i = (y * GRID_W + x) * 4;
      if (d2 > 1) continue; // outside the dome — transparent
      const dz = Math.sqrt(1 - d2);
      img.data[i] = Math.round(dx * 127 + 128);
      img.data[i + 1] = Math.round(dy * 127 + 128);
      img.data[i + 2] = Math.round(dz * 255);
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/** A synthetic HEIGHT visualisation — grayscale, transparent where absent. */
function heightSource(ctx: CanvasRenderingContext2D): ImageData {
  const img = ctx.createImageData(GRID_W, GRID_H);
  for (let y = 2; y < GRID_H - 2; y++) {
    for (let x = 2; x < GRID_W - 2; x++) {
      const v = Math.round(((x + y) / (GRID_W + GRID_H - 8)) * 255);
      const i = (y * GRID_W + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

type SourceFn = (ctx: CanvasRenderingContext2D) => ImageData;

interface HarnessProps {
  /** Everything `LightingSurface` needs except the four refs. */
  surface: Omit<
    LightingSurfaceProps,
    "editCanvasRef" | "overlayCanvasRef" | "containerRef" | "rootRef"
  >;
  /** Which visualisation to paint. */
  source: SourceFn;
  /** `lightGridMode` — the checkerboard and grid theme. */
  light: boolean;
  /** Brush cells to show on the overlay, if any. */
  brushCells?: { x: number; y: number }[];
}

/**
 * Stands in for `LightingCanvasContainer` — holds the refs and drives the
 * imperative draw. It reads NO store; every value it forwards is a literal.
 */
function LightingHarness({ surface, source, light, brushCells }: HarnessProps) {
  const editCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { cellWidth, cellHeight } = surface;

  const paint = useCallback(() => {
    const ctx = editCanvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const theme = backgroundTheme(light);
      // ⚠️ 1:1 with the pixel data, and `CELL_SCALE` not `ZOOM` — exactly what
      // the container does. The magnification is the `combinedScale` transform
      // `LightingSurface` applies, so what these stories show on screen is the
      // GPU's upscale of these bytes, which is what ships.
      const buffer = ctx.createImageData(cellWidth, cellHeight);
      renderNormalEdit(buffer, {
        source: source(ctx),
        gridWidth: GRID_W,
        gridHeight: GRID_H,
        zoom: CELL_SCALE,
        theme,
      });
      ctx.putImageData(buffer, 0, 0);
      // ⚠️ NO `strokeGrid`. The grid is the `grid` PROP now — vector chrome
      // from `gridOverlayPath`, because at 1:1 the raster grid degenerates
      // into a flat wash of colour over the whole canvas. See `baseSurface`.
    }

    const overlayCtx = overlayCanvasRef.current?.getContext("2d");
    if (overlayCtx && brushCells?.length) {
      overlayCtx.clearRect(0, 0, cellWidth, cellHeight);
      const buffer = overlayCtx.createImageData(cellWidth, cellHeight);
      paintBrushCells(buffer, brushCells, CELL_SCALE);
      overlayCtx.putImageData(buffer, 0, 0);
      // ⚠️ NO `strokeBrushOutlines` either — at 1:1 it strokes 0x0 rectangles
      // and renders nothing. The outline is the `brushOutline` prop.
    }
  }, [source, light, brushCells, cellWidth, cellHeight]);

  useEffect(paint, [paint]);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <LightingSurface
        {...surface}
        editCanvasRef={editCanvasRef}
        overlayCanvasRef={overlayCanvasRef}
        containerRef={containerRef}
        rootRef={rootRef}
      />
    </div>
  );
}

/**
 * Props shared by every story; each overrides what it is demonstrating.
 *
 * ⚠️ `cellWidth`/`cellHeight` are GRID CELLS — 16, not 16 × 14. That is the
 * whole of task 08 in one line: the backing store dropped by a factor of
 * `ZOOM²` (196× here, and up to 2,500× at the zoom ceiling) and the pixels
 * that used to be written into it are now the GPU's problem, via
 * `combinedScale`. The sprite is exactly the same size on screen.
 */
const baseSurface: HarnessProps["surface"] = {
  cellWidth: GRID_W,
  cellHeight: GRID_H,
  viewPanOffset: { x: 24, y: 24 },
  // `zoom * viewZoom`, with view zoom 1. Every story that changes the view
  // zoom must change this, not a separate field — there is only one scale.
  combinedScale: ZOOM,
  // The REAL emitters, from `ui/canvas/svg/` — the same single implementations
  // `CanvasSurface` renders. The stories are a visual check on the vector
  // chrome exactly as they already were on the raster renderers.
  grid: gridOverlayPath({ cellWidth: GRID_W, cellHeight: GRID_H }, false),
  editMode: "normals",
  gridWidth: GRID_W,
  gridHeight: GRID_H,
  zoom: ZOOM,
  onMouseDown: () => {},
  onMouseMove: () => {},
  onMouseUp: () => {},
  onMouseLeave: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
};

const meta = {
  title: "UI/Canvas/LightingSurface",
  component: LightingHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LightingHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The normal-editing surface as it ships: dark checkerboard, 5% white grid. */
export const Default: Story = {
  args: { surface: baseSurface, source: normalSource, light: false },
};

/**
 * ⚠️ THE Q3 CHANGE. Compare against `CanvasSurface`'s `LightGridMode` — the two
 * grids must agree. `LightingCanvas` never honoured this setting; every colour
 * in it was hard-coded dark, so this appearance is new and is the item flagged
 * for owner sign-off in the task 33 report.
 */
export const LightGridMode: Story = {
  args: {
    surface: {
      ...baseSurface,
      // The grid's colour rule lives in `gridOverlayAttrs` (black 8% light,
      // white 5% dark), so the light theme has to be selected HERE as well as
      // in `backgroundTheme(light)` — the checkerboard and the grid are two
      // mechanisms now, and this story is the one that would catch them
      // disagreeing.
      grid: gridOverlayPath({ cellWidth: GRID_W, cellHeight: GRID_H }, true),
    },
    source: normalSource,
    light: true,
  },
};

/** The height brush's grayscale visualisation, and the info bar's other label. */
export const HeightMode: Story = {
  args: {
    surface: { ...baseSurface, editMode: "height" },
    source: heightSource,
    light: false,
  },
};

/** The brush footprint's cells — the shape both halves of the overlay draw. */
const BRUSH_CELLS = [
  { x: 7, y: 6 },
  { x: 6, y: 7 },
  { x: 7, y: 7 },
  { x: 8, y: 7 },
  { x: 7, y: 8 },
];

/**
 * The cyan brush footprint — a 3×3 circular brush.
 *
 * ⚠️ TWO MECHANISMS, DELIBERATELY. The FILL is the overlay canvas (a cell
 * fill, safe at 1:1); the OUTLINE is the `brushOutline` `<path>`, because the
 * raster outline sizes each rect `zoom - 1` and at 1:1 strokes 0×0 rectangles —
 * it renders nothing, silently. This story is where that would be visible.
 */
export const BrushOverlay: Story = {
  args: {
    surface: {
      ...baseSurface,
      brushOutline: brushOutlineOverlay(BRUSH_CELLS),
    },
    source: normalSource,
    light: false,
    brushCells: BRUSH_CELLS,
  },
};

/**
 * The pinch-zoom transform, which is CSS on the wrapper and not a redraw.
 *
 * ⚠️ `combinedScale: ZOOM * 1.75`, not `1.75`. The view zoom multiplies the
 * shared pixel scale rather than replacing it — that is what `zoom * viewZoom`
 * means, and passing 1.75 alone would shrink the sprite to an eighth of its
 * size rather than magnifying it.
 */
export const Zoomed: Story = {
  args: {
    surface: {
      ...baseSurface,
      combinedScale: ZOOM * 1.75,
      viewPanOffset: { x: 0, y: 0 },
    },
    source: normalSource,
    light: false,
  },
};

/** No object or frame selected — the container's `empty` branch. */
export const Empty: Story = {
  args: {
    surface: { ...baseSurface, empty: true },
    source: normalSource,
    light: false,
  },
};

/**
 * The `viewControls` slot, with the REAL `CanvasViewControls` cluster — the one
 * the lighting studio will render once the workspace splits.
 *
 * This story is the positioning proof and the reason it uses the real component
 * rather than a stub: the cluster is `position: absolute; left/bottom:
 * var(--space-3)`, so it lands in the bottom-left of `.lighting-canvas__viewport`
 * only because that element is now `position: relative`. `CanvasViewControls` is
 * a pure `ui/` component, so importing it here costs no store.
 *
 * ⚠️ It is a child of the VIEWPORT, not of `.lighting-canvas__surface` — the
 * transform lives on `__surface`, and controls placed there would pan and scale
 * with the sprite. Compare with `Zoomed`: the cluster must not move.
 */
export const WithViewControls: Story = {
  args: {
    surface: {
      ...baseSurface,
      viewControls: (
        <CanvasViewControls
          onResetView={fn()}
          modeButton={{
            kind: "open",
            label: "Open Preview view",
            onClick: fn(),
          }}
        />
      ),
    },
    source: normalSource,
    light: false,
  },
};
