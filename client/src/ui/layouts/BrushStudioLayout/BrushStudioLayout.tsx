/**
 * BrushStudioLayout — the brush-authoring page (brush-studio task 15, MASTER D15).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: THIS RENDERS WITH NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Same three-line import list as `PixelStudioLayout` and `LightingStudioLayout`:
 * React types, `AppShell`, nothing else. Purity here is structural, not
 * asserted — there is no import through which a store could arrive.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHY THIS IS NOT `PixelStudioLayout` WITH A `mode` PROP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The same reasoning that split the lighting layout off (see its header): the
 * region SETS differ, so a merged layout would carry dead props plus a `mode`
 * discriminant — the runtime branch the layouts exist to dissolve. The brush
 * studio has:
 *
 *   - a **`brushLibrary`** where the other two have `objectLibrary` — the left
 *     rail lists brush FILES, not the project's objects (MASTER D16);
 *   - **no `FrameReferencePanel`** and **no `ReferenceImagePanel`** — those are
 *     pixel-project affordances with no brush-document counterpart;
 *   - an OPTIONAL **`canvasInfo`** strip, unlike the pixel layout (required)
 *     and the lighting layout (absent).
 *
 * A missing region is therefore a TYPE error rather than a runtime branch:
 * passing `objectLibrary` or `frameReferencePanel` here does not compile.
 *
 * ── Chrome pass-throughs ────────────────────────────────────────────────────
 *
 * Everything below the region props is handed to `AppShell` unread. The rail
 * system (`ui/layout/railLayout.ts`) is mode-agnostic, and `useRailLayout()`
 * returns exactly this bundle — `layout`, `railOverlays`, `canvasOverlay`,
 * `railDismiss`, `hiddenRails` — for the container to spread in, the same way
 * `LightingStudioContainer` does. Dropping any of them here would make that
 * spread a type error in the brush container for no gain.
 */
import type { ReactNode, RefObject } from "react";
import { AppShell } from "../../components/AppShell/AppShell";
import type { AppShellProps } from "../../components/AppShell/AppShell";

export interface BrushStudioLayoutProps {
  header: ReactNode;
  toolbar: ReactNode;
  /** The brush FILE list — the left rail's top section (MASTER D16). */
  brushLibrary: ReactNode;
  /** The brush layer panel — the left rail's bottom section (MASTER D16). */
  layerPanel: ReactNode;
  rightControls: ReactNode;
  /** The delta picker and friends — the right rail's bottom section. */
  studioPanel: ReactNode;
  timeline: ReactNode;
  canvas: ReactNode;
  /**
   * Optional info strip under the canvas. Optional (not required as in the
   * pixel layout) because the brush studio's first cut has no dedicated
   * strip; the slot exists so one can be added without touching this file.
   */
  canvasInfo?: ReactNode;

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
   * Which rails are hidden, by rail NAME.
   *
   * ⚠️ This is the widened form that REPLACED the `focusMode` boolean in the
   * other two layouts on 2026-08-30 (see `LightingStudioLayout`): focus mode
   * is one caller that hides `left` + `bottom`; a per-rail × is another that
   * hides any one of the three. The layout asks one question per rail —
   * "is this hidden" — and does not care which caller answered yes.
   *
   * Absence still expresses hiding to `AppShell` (it has no `focusMode` prop
   * and never learned one); this prop only decides which regions are passed.
   */
  hiddenRails?: ReadonlySet<"left" | "right" | "bottom">;
  canvasAreaRef?: RefObject<HTMLElement | null>;
}

export function BrushStudioLayout({
  header,
  toolbar,
  brushLibrary,
  layerPanel,
  rightControls,
  studioPanel,
  timeline,
  canvas,
  canvasInfo,
  layout,
  railOverlays,
  canvasOverlay,
  railDismiss,
  hiddenRails,
  canvasAreaRef,
}: BrushStudioLayoutProps) {
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
            {brushLibrary}
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
      {canvasInfo}
    </AppShell>
  );
}
