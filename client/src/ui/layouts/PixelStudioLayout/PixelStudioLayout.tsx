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
 * ── Why `canvasInfo` is not an optional prop ───────────────────────────────
 *
 * It is unconditional in pixel mode (`App.tsx:273` gated it on
 * `!isLightingMode`, which is always true here — the branch existed because
 * ONE component served both studios). Splitting the studios into two layouts
 * turns that runtime branch into a type-level one: pixel mode has this
 * region, lighting mode does not have the prop at all.
 *
 * ⚠️ `layerColors` WAS a second such region and is GONE. The "Layer Colors"
 * strip is retired: its swatches are now the pinned "Current Palette" row of
 * `PaletteManager`, inside the right rail's studio panel, so the layout has
 * no region for them any more. Nothing replaced it here — the row below the
 * canvas is simply one shorter.
 */
import type { ReactNode, RefObject } from "react";
import { AppShell } from "../../components/AppShell/AppShell";
import type { AppShellProps } from "../../components/AppShell/AppShell";

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
  frameReferencePanel?: ReactNode;
  referenceImagePanel?: ReactNode;

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
  frameReferencePanel,
  referenceImagePanel,
  layout,
  railOverlays,
  canvasOverlay,
  railDismiss,
  hiddenRails,
  frameReferencePanelVisible,
  canvasAreaRef,
}: PixelStudioLayoutProps) {
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
      {frameReferencePanelVisible ? frameReferencePanel : null}
      {referenceImagePanel}
      {canvasInfo}
    </AppShell>
  );
}
