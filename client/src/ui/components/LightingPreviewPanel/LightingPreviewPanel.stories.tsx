/**
 * LightingPreviewPanel stories — the third floating panel, now on the primitive.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 NO STORE PROVIDER HERE EITHER (task 33, gate 2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The panel is pure: it takes `position` / `onPositionCommit` / `minimized` as
 * props and holds no `uiState` key. `LightingPreviewPanelContainer` is the only
 * place `lightingPreview` is named — which is exactly what makes "do not unify
 * the three panels' persistence keys" structurally impossible to violate rather
 * than merely documented.
 *
 * The thumbnail is painted through the ref by the harness, using the real
 * `renderLightingPreview`, because a lit composite is a pixel grid and may not
 * cross the `ui/` boundary as a prop (R2).
 *
 * ⚠️ The chrome is the `floating-panel` primitive's, not the legacy gradient +
 * `backdrop-filter` copy, and the minimise glyph is `Plus`/`Minus` rather than
 * `ChevronUp`/`ChevronDown`. Both are deliberate consequences of adopting the
 * primitive and are flagged for visual sign-off in the task 33 report.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LightingPreviewPanel } from "./LightingPreviewPanel";
import { backgroundTheme } from "../../canvas/render/canvasBackground";
import {
  renderLightingPreview,
  PREVIEW_THUMB_SIZE,
  PREVIEW_BORDER,
} from "../../canvas/render/renderLightingPreview";

const SPRITE = 16;

/**
 * A synthetic LIT sprite — the shape `renderWithLighting` produces: a warm
 * highlight top-left falling off to ambient blue-grey, which is what
 * `DEFAULT_LIGHT_DIRECTION` `{x:-64, y:-64, z:180}` actually looks like.
 */
function litSprite(ctx: CanvasRenderingContext2D): ImageData {
  const img = ctx.createImageData(SPRITE, SPRITE);
  const cx = (SPRITE - 1) / 2;
  const cy = (SPRITE - 1) / 2;
  const r = SPRITE / 2 - 1;

  for (let y = 0; y < SPRITE; y++) {
    for (let x = 0; x < SPRITE; x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      const i = (y * SPRITE + x) * 4;
      if (d2 > 1) continue;
      const dz = Math.sqrt(1 - d2);
      // Lambert against a normalised {-0.32, -0.32, 0.89}.
      const lambert = Math.max(0, dx * -0.32 + dy * -0.32 + dz * 0.89);
      img.data[i] = Math.round(40 + lambert * 215);
      img.data[i + 1] = Math.round(45 + lambert * 205);
      img.data[i + 2] = Math.round(60 + lambert * 180);
      img.data[i + 3] = 255;
    }
  }
  return img;
}

interface HarnessProps {
  /** Starting minimise state. The harness makes it controlled, as the app does. */
  minimized?: boolean;
  /** Persisted percent position, or `undefined` to use the 20/20 default. */
  position?: { topPercent: number; leftPercent: number };
}

/** Stands in for `LightingCanvasContainer` + `LightingPreviewPanelContainer`. */
function PanelHarness({ minimized = false, position }: HarnessProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMin, setIsMin] = useState(minimized);
  const [committed, setCommitted] = useState<string>("(not dragged yet)");

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const buffer = ctx.createImageData(PREVIEW_THUMB_SIZE, PREVIEW_THUMB_SIZE);
    renderLightingPreview(buffer, {
      lit: litSprite(ctx),
      objWidth: SPRITE,
      objHeight: SPRITE,
      // The thumbnail is deliberately NOT theme-aware — see
      // `LightingCanvasContainer`'s header.
      theme: backgroundTheme(false),
    });
    ctx.putImageData(buffer, 0, 0);
    ctx.strokeStyle = PREVIEW_BORDER.strokeStyle;
    ctx.lineWidth = PREVIEW_BORDER.lineWidth;
    ctx.strokeRect(0.5, 0.5, PREVIEW_THUMB_SIZE - 1, PREVIEW_THUMB_SIZE - 1);
  }, []);

  // Expanding re-mounts the canvas, so the repaint must follow the state — the
  // same coupling `LightingCanvasContainer` solves with `invalidatePreview()`.
  useEffect(() => {
    if (!isMin) paint();
  }, [isMin, paint]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "100vh",
        background: "var(--bg-primary, #0a0a0f)",
      }}
    >
      <LightingPreviewPanel
        canvasRef={canvasRef}
        containerRef={containerRef}
        position={position}
        onPositionCommit={(p) =>
          setCommitted(
            `top ${p.topPercent.toFixed(1)}% · left ${p.leftPercent.toFixed(1)}%`,
          )
        }
        minimized={isMin}
        onMinimizedChange={setIsMin}
      />
      <p
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          margin: 0,
          fontSize: 12,
          color: "var(--text-muted, #888)",
        }}
      >
        Last committed position (the container would persist this under
        `lightingPreviewPanelPosition`): {committed}
      </p>
    </div>
  );
}

const meta = {
  title: "UI/Canvas/LightingPreviewPanel",
  component: PanelHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PanelHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The panel as it opens: expanded, at the legacy 20/20 default. */
export const Default: Story = { args: {} };

/** Collapsed to its header — the body unmounts, canvas and all. */
export const Minimized: Story = { args: { minimized: true } };

/**
 * A restored position, as `uiState.lightingPreviewPanelPosition` supplies it.
 * Positions persist as PERCENTAGES so they survive a container resize
 * proportionally — the behaviour `useFloatingPanel` carried over from all
 * three legacy clones.
 */
export const RestoredPosition: Story = {
  args: { position: { topPercent: 45, leftPercent: 55 } },
};
