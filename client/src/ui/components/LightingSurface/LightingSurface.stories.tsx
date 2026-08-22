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
import { LightingSurface } from "./LightingSurface";
import type { LightingSurfaceProps } from "./LightingSurface";
import {
  backgroundTheme,
  strokeGrid,
} from "../../canvas/render/canvasBackground";
import { renderNormalEdit } from "../../canvas/render/renderNormalEdit";
import {
  paintBrushCells,
  strokeBrushOutlines,
} from "../../canvas/render/renderBrushOverlay";

const ZOOM = 14;
const GRID_W = 16;
const GRID_H = 16;

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

  const { canvasWidth, canvasHeight } = surface;

  const paint = useCallback(() => {
    const ctx = editCanvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const theme = backgroundTheme(light);
      const buffer = ctx.createImageData(canvasWidth, canvasHeight);
      renderNormalEdit(buffer, {
        source: source(ctx),
        gridWidth: GRID_W,
        gridHeight: GRID_H,
        zoom: ZOOM,
        theme,
      });
      ctx.putImageData(buffer, 0, 0);
      strokeGrid(
        ctx,
        {
          canvasWidth,
          canvasHeight,
          cellsX: GRID_W,
          cellsY: GRID_H,
          offsetX: 0,
          offsetY: 0,
          zoom: ZOOM,
        },
        theme,
      );
    }

    const overlayCtx = overlayCanvasRef.current?.getContext("2d");
    if (overlayCtx && brushCells?.length) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      const buffer = overlayCtx.createImageData(canvasWidth, canvasHeight);
      paintBrushCells(buffer, brushCells, ZOOM);
      overlayCtx.putImageData(buffer, 0, 0);
      strokeBrushOutlines(overlayCtx, brushCells, ZOOM);
    }
  }, [source, light, brushCells, canvasWidth, canvasHeight]);

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

/** Props shared by every story; each overrides what it is demonstrating. */
const baseSurface: HarnessProps["surface"] = {
  canvasWidth: GRID_W * ZOOM,
  canvasHeight: GRID_H * ZOOM,
  viewPanOffset: { x: 24, y: 24 },
  viewZoom: 1,
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
  args: { surface: baseSurface, source: normalSource, light: true },
};

/** The height brush's grayscale visualisation, and the info bar's other label. */
export const HeightMode: Story = {
  args: {
    surface: { ...baseSurface, editMode: "height" },
    source: heightSource,
    light: false,
  },
};

/** The cyan brush footprint on the overlay canvas — a 3×3 circular brush. */
export const BrushOverlay: Story = {
  args: {
    surface: baseSurface,
    source: normalSource,
    light: false,
    brushCells: [
      { x: 7, y: 6 },
      { x: 6, y: 7 },
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 8 },
    ],
  },
};

/** The pinch-zoom transform, which is CSS on the wrapper and not a redraw. */
export const Zoomed: Story = {
  args: {
    surface: { ...baseSurface, viewZoom: 1.75, viewPanOffset: { x: 0, y: 0 } },
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
