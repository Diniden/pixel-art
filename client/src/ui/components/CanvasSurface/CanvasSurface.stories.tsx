/**
 * CanvasSurface stories — and the PROOF that the `ui/` boundary holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2 OF REFRESH TASK 32: THESE FIVE STORIES RENDER WITH NO STORE
 *  PROVIDER OF ANY KIND
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
 * `CanvasSurface` paints NOTHING — it owns four `<canvas>` elements and hands
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
 * ## The five states
 *
 * | Story          | What it exercises                                       |
 * | -------------- | ------------------------------------------------------- |
 * | Default        | the plain editing surface; no overlay mounted            |
 * | VariantEdit    | the EXPANDED view — the union of object and variant      |
 * |                | bounds — with the object outline and the variant frame   |
 * | SelectionActive| the marching-ants box and the mask fill                  |
 * | FrameOverlay   | the onion-skin overlay canvas mounted above the surface  |
 * | LightGridMode  | the light checkerboard theme                             |
 *
 * ⚠️ `LightGridMode` is where task 02's `lightGridMode` round-trip fix first
 * becomes VISIBLE, and the task 32 spec nominates it as the manual
 * verification for that fix's persistence claim. The story shows what the
 * setting looks like; the persistence half still needs the running app (toggle,
 * wait for autosave, hard-reload) and is recorded as owed in the report.
 */
import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CanvasSurface } from "./CanvasSurface";
import type { CanvasSurfaceProps } from "./CanvasSurface";
import { projectTypical } from "../../../fixtures";
import type { Layer, PixelData } from "../../../types";

/* ── the painting harness (what the container does, in miniature) ────────── */

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
      ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
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
    ctx.moveTo(x * ZOOM + 0.5, 0);
    ctx.lineTo(x * ZOOM + 0.5, cellsY * ZOOM);
  }
  for (let y = 0; y <= cellsY; y++) {
    ctx.moveTo(0, y * ZOOM + 0.5);
    ctx.lineTo(cellsX * ZOOM, y * ZOOM + 0.5);
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
      ctx.fillRect((x + ox) * ZOOM, (y + oy) * ZOOM, ZOOM, ZOOM);
    }
  }
}

/** The task-10 fixture's first frame — the sprite every story draws. */
const heroFrame = projectTypical.objects[0].frames[0];
const GRID = projectTypical.objects[0].gridSize;

type PaintFn = (ctx: CanvasRenderingContext2D) => void;

interface HarnessProps {
  /** Everything `CanvasSurface` needs except the six refs. */
  surface: Omit<
    CanvasSurfaceProps,
    | "canvasRef"
    | "overlayCanvasRef"
    | "frameOverlayCanvasRef"
    | "frameTraceOverlayCanvasRef"
    | "hoverCanvasRef"
    | "containerRef"
  >;
  /** Draws the main surface. Runs once the refs are attached. */
  paint: PaintFn;
  /** Draws the frame-overlay canvas, when the story mounts one. */
  paintOverlay?: PaintFn;
}

/**
 * Stands in for `CanvasContainer` — holds the refs and drives the imperative
 * draw. It reads NO store; the values it forwards are literals from the story.
 */
function SurfaceHarness({ surface, paint, paintOverlay }: HarnessProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameTraceOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, [paint, paintOverlay]);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <CanvasSurface
        {...surface}
        canvasRef={canvasRef}
        overlayCanvasRef={overlayCanvasRef}
        frameOverlayCanvasRef={frameOverlayCanvasRef}
        frameTraceOverlayCanvasRef={frameTraceOverlayCanvasRef}
        hoverCanvasRef={hoverCanvasRef}
        containerRef={containerRef}
      />
    </div>
  );
}

/** Props shared by every story; each overrides what it is demonstrating. */
const baseSurface: HarnessProps["surface"] = {
  canvasWidth: GRID.width * ZOOM,
  canvasHeight: GRID.height * ZOOM,
  viewPanOffset: { x: 24, y: 24 },
  viewZoom: 1,
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
          "destructure). It owns the four-`<canvas>` stack, the pan/zoom " +
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
      canvasWidth: VIEW_W * ZOOM,
      canvasHeight: VIEW_H * ZOOM,
    },
    paint: (ctx) => {
      paintBackground(ctx, VIEW_W, VIEW_H, false);
      ctx.save();
      ctx.translate(-VIEW_MIN_X * ZOOM, -VIEW_MIN_Y * ZOOM);

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

      ctx.strokeStyle = "rgba(255, 171, 0, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, GRID.width * ZOOM, GRID.height * ZOOM);
      ctx.setLineDash([]);

      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        VARIANT_OFFSET.x * ZOOM,
        VARIANT_OFFSET.y * ZOOM,
        VARIANT_SIZE.width * ZOOM,
        VARIANT_SIZE.height * ZOOM,
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

      ctx.fillStyle = "rgba(0, 217, 255, 0.14)";
      ctx.fillRect(
        box.x * ZOOM,
        box.y * ZOOM,
        box.width * ZOOM,
        box.height * ZOOM,
      );

      // Marching ants: two offset dashes, matching
      // `ui/canvas/render/renderSelectionOverlay`.
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#00d9ff";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        box.x * ZOOM + 0.5,
        box.y * ZOOM + 0.5,
        box.width * ZOOM,
        box.height * ZOOM,
      );
      ctx.strokeStyle = "#001018";
      ctx.lineDashOffset = 4;
      ctx.strokeRect(
        box.x * ZOOM + 0.5,
        box.y * ZOOM + 0.5,
        box.width * ZOOM,
        box.height * ZOOM,
      );
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
      ctx.strokeRect(2 * ZOOM, 1 * ZOOM, GRID.width * ZOOM, GRID.height * ZOOM);
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
