/**
 * PixelStudioLayout — the pixel-editing page (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: THIS RENDERS WITH NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The import list is the whole proof, and it is three lines: React types,
 * `AppShell`, and nothing else. No CSS of its own — every class this page
 * shows belongs to `AppShell`'s `app` block or to a region's own sheet.
 *
 * W24's `CanvasSurface`, W25's `LightingSurface` and W26's `ZoomControls` set
 * the bar by importing only React types and their own CSS. A layout should be
 * the EASIEST case of all three, because it is pure composition — it holds no
 * canvas, no ref plumbing and no imperative draw. It clears the bar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ REGIONS ARRIVE AS `ReactNode`, AND THAT IS A PERFORMANCE DECISION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious alternative — pass `project`, `layers`, `frames`, `palettes`,
 * `selection` down and let the layout build its children — costs three things:
 *
 *  1. a ~40-prop interface instead of 14;
 *  2. **the loss of MobX's per-region `observer()` granularity.** Each region
 *     is its own observer container today, so a palette change re-renders the
 *     palette and nothing else. Threading data through the layout makes the
 *     layout an observer of everything, so every state change anywhere
 *     re-renders the whole tree. On a project with 300,249 pixel cells that is
 *     not a micro-optimisation;
 *  3. the store, transitively, in `ui/` — which is the boundary this whole
 *     refresh exists to draw.
 *
 * Injecting elements keeps all three problems out at once.
 *
 * **The cost, stated plainly:** a layout story shows STUBS, not the real
 * editor. That is correct. A layout story's job is to verify *arrangement* —
 * focus mode hides two regions, the canvas area is the flex-grow child, the
 * floating panels sit inside the canvas area and not beside it. Re-verifying
 * every child is the region stories' job, and re-verifying the whole screen is
 * the app's.
 *
 * ── Why `canvasInfo` / `layerColors` are not optional props ────────────────
 *
 * They are unconditional in pixel mode (`App.tsx:273-274` gates them on
 * `!isLightingMode`, which is always true here — the branch existed because
 * ONE component served both studios). Splitting the studios into two layouts
 * turns that runtime branch into a type-level one: pixel mode has these
 * regions, lighting mode does not have the props at all.
 */
import type { ReactNode, RefObject } from "react";
import { AppShell } from "../../components/AppShell/AppShell";

export interface PixelStudioLayoutProps {
  header: ReactNode;
  toolbar: ReactNode;
  objectLibrary: ReactNode;
  layerPanel: ReactNode;
  rightControls: ReactNode;
  studioPanel: ReactNode;
  timeline: ReactNode;
  canvas: ReactNode;
  canvasInfo: ReactNode;
  layerColors: ReactNode;
  frameReferencePanel?: ReactNode;
  referenceImagePanel?: ReactNode;

  /** `App.tsx:229` — hides the left sidebar AND the bottom timeline. */
  focusMode: boolean;
  /**
   * `App.tsx:261` — `uiState.frameReferencePanelVisible !== false`, i.e. the
   * panel is visible when the key is absent. The `!== false` default lives in
   * the container; this prop is the resolved boolean.
   */
  frameReferencePanelVisible: boolean;
  /**
   * `App.tsx:177`'s tri-state, threaded through. ⚠️ It does NOT gate
   * `canvasInfo` here: the legacy markup rendered `CanvasInfo` unconditionally
   * in pixel mode and let the component hide ITSELF from the same store field.
   * Duplicating the gate in the layout would double-apply it — harmless today,
   * but it would silently diverge the moment the component's fallback changed.
   * The prop is carried so a story can express the state, and is consumed only
   * as a hook for that.
   */
  canvasInfoHidden?: boolean;
  canvasAreaRef?: RefObject<HTMLElement | null>;
}

export function PixelStudioLayout({
  header,
  toolbar,
  objectLibrary,
  layerPanel,
  rightControls,
  studioPanel,
  timeline,
  canvas,
  canvasInfo,
  layerColors,
  frameReferencePanel,
  referenceImagePanel,
  focusMode,
  frameReferencePanelVisible,
  canvasAreaRef,
}: PixelStudioLayoutProps) {
  return (
    <AppShell
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
      {frameReferencePanelVisible ? frameReferencePanel : null}
      {referenceImagePanel}
      {canvasInfo}
      {layerColors}
    </AppShell>
  );
}
