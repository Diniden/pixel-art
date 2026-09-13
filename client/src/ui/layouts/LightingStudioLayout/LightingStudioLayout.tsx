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
 *   - (`LayerColors` was a fourth, and is now retired everywhere — its
 *     swatches are `PaletteManager`'s "Current Palette" row, so the PIXEL
 *     layout has no such region either.)
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
  /**
   * The layout-mode picker over the canvas. Passed straight through like the
   * two above — the layout neither reads it nor knows what it contains.
   */
  canvasOverlay?: AppShellProps["canvasOverlay"];
  /** The per-rail × buttons, passed straight through to `AppShell`. */
  railDismiss?: AppShellProps["railDismiss"];
  /**
   * Which rails are hidden, by rail NAME (2026-08-30).
   *
   * ⚠️ THIS REPLACED THE `focusMode` BOOLEAN, and the widening is the point.
   * Focus mode used to be the only way a rail could be missing, so one flag
   * covered it; now a rail can also be dismissed on its own, and the layout
   * must not care which of the two happened. It asks one question per rail —
   * "is this hidden" — and focus mode becomes just one of the callers that
   * can answer yes.
   *
   * Absence still expresses hiding to `AppShell` (it has no `focusMode` prop
   * and never learned one); this prop only decides which regions are passed.
   */
  hiddenRails?: ReadonlySet<"left" | "right" | "bottom">;
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
  canvasOverlay,
  railDismiss,
  hiddenRails,
  canvasAreaRef,
}: LightingStudioLayoutProps) {
  return (
    <AppShell
      layout={layout}
      railOverlays={railOverlays}
      canvasOverlay={canvasOverlay}
      railDismiss={railDismiss}
      header={header}
      toolbar={toolbar}
      canvasAreaRef={canvasAreaRef}
      leftPanel={
        hiddenRails?.has("left") ? undefined : (
          <>
            {objectLibrary}
            {layerPanel}
          </>
        )
      }
      rightPanel={
        /* ⚠️ `rightPanel` is REQUIRED by `AppShell` (the shell has always had
           one), so hiding it passes `null` rather than omitting the prop —
           `renderSide` filters on `!= null` and treats both the same. */
        hiddenRails?.has("right") ? null : (
          <>
            {rightControls}
            {studioPanel}
          </>
        )
      }
      bottomPanel={hiddenRails?.has("bottom") ? undefined : timeline}
    >
      {canvas}
    </AppShell>
  );
}
