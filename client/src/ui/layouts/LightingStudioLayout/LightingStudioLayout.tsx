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
 * Four of the pixel layout's twelve regions are absent, and one region exists
 * ONLY here: `previewPanel`, the floating lit-composite thumbnail extracted by
 * task 33.
 *
 * A merged layout would carry five props that are dead in one of its two modes
 * and a `mode` discriminant to say which — i.e. it would reconstruct
 * `App.tsx`'s runtime branch inside a component whose entire purpose was to
 * dissolve it. Two layouts make the difference a TYPE error instead: passing
 * `canvasInfo` here does not compile.
 *
 * ── `previewPanel` is optional, and usually absent ─────────────────────────
 *
 * ⚠️ In the running app this prop is **not** how the preview panel mounts.
 * `LightingPreviewPanelContainer` needs the thumbnail canvas ref and the
 * float-bounds ref, both of which live inside `LightingCanvasContainer`, so it
 * is rendered THERE (`LightingCanvasContainer.tsx:668`) — inside the `canvas`
 * region this layout receives as one opaque node.
 *
 * The prop exists so a story can place a stub panel in the canvas area without
 * standing up the whole canvas container, and so the arrangement is
 * expressible if the ref plumbing is ever hoisted. It is deliberately NOT
 * wired by `LightingStudioContainer`: doing so would mount the panel twice.
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
  /** The floating lit-composite thumbnail. See the header note — story-only. */
  previewPanel?: ReactNode;

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
  previewPanel,
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
      {previewPanel}
    </AppShell>
  );
}
