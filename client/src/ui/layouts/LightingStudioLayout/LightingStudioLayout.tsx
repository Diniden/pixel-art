/**
 * LightingStudioLayout — the normal/height-authoring page (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: THIS RENDERS WITH NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Same three-line import list as `PixelStudioLayout`: React types, `AppShell`,
 * nothing else. Purity here is structural, not asserted.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHY THIS IS NOT `PixelStudioLayout` WITH A `mode` PROP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Because the region SETS genuinely differ, and the differences were measured
 * off `App.tsx:190-216` rather than assumed. Lighting mode renders:
 *
 *   - **no `CanvasInfo`**          (`App.tsx:273`, gated `!isLightingMode`)
 *   - **no `LayerColors`**         (`App.tsx:274`, same gate)
 *   - **no `FrameReferencePanel`** (inside the `!isLightingMode` fragment)
 *   - **no `ReferenceImagePanel`** (same fragment)
 *
 * Four of the pixel layout's twelve regions are absent.
 *
 * A merged layout would carry four props that are dead in one of its two modes
 * and a `mode` discriminant to say which — i.e. it would reconstruct
 * `App.tsx`'s runtime branch inside a component whose entire purpose was to
 * dissolve it. Two layouts make the difference a TYPE error instead: passing
 * `canvasInfo` here does not compile.
 *
 * ── 🏁 THE `previewPanel` SLOT IS GONE (2026-08-29, MASTER D7) ─────────────
 *
 * This layout used to carry an optional `previewPanel` region for the floating
 * 200 px lit-composite thumbnail. That panel was retired when the lit
 * composite became a real workspace pane: `LightingStudioContainer` now passes
 * a `CanvasSplit` of `LightingCanvasContainer`s as `canvas`, and the preview
 * is one of them. There is no floating panel left to slot in, so the layout is
 * back to a single canvas region.
 */
import type { ReactNode, RefObject } from "react";
import { AppShell } from "../../components/AppShell/AppShell";
import type { AppShellProps } from "../../components/AppShell/AppShell";

export interface LightingStudioLayoutProps {
  header: ReactNode;
  toolbar: ReactNode;
  objectLibrary: ReactNode;
  layerPanel: ReactNode;
  rightControls: ReactNode;
  studioPanel: ReactNode;
  timeline: ReactNode;
  canvas: ReactNode;

  /**
   * Rail placement + sizes, and the layout-mode scrims. Both are passed
   * straight through to `AppShell`, which owns the arrangement — the layout
   * neither reads nor branches on them. Omitted, the shell renders the
   * historical arrangement.
   */
  layout?: AppShellProps["layout"];
  railOverlays?: AppShellProps["railOverlays"];
  /** `App.tsx:229` — hides the left sidebar AND the bottom timeline. */
  focusMode: boolean;
  canvasAreaRef?: RefObject<HTMLElement | null>;
}

export function LightingStudioLayout({
  header,
  toolbar,
  objectLibrary,
  layerPanel,
  rightControls,
  studioPanel,
  timeline,
  canvas,
  layout,
  railOverlays,
  focusMode,
  canvasAreaRef,
}: LightingStudioLayoutProps) {
  return (
    <AppShell
      layout={layout}
      railOverlays={railOverlays}
      header={header}
      toolbar={toolbar}
      canvasAreaRef={canvasAreaRef}
      leftPanel={
        focusMode ? undefined : (
          <>
            {objectLibrary}
            {layerPanel}
          </>
        )
      }
      rightPanel={
        <>
          {rightControls}
          {studioPanel}
        </>
      }
      bottomPanel={focusMode ? undefined : timeline}
    >
      {canvas}
    </AppShell>
  );
}
