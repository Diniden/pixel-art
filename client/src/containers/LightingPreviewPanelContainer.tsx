/**
 * LightingPreviewPanelContainer — the lighting preview panel's store wiring
 * (REFRESH task 33).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS FILE IS THE ONLY PLACE `lightingPreview` IS NAMED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The three floating panels persist to three DISTINCT `uiState` keys —
 * `frameReferencePanelPosition`, `referenceImagePanelPosition` and
 * `lightingPreviewPanelPosition` (`types/domain.ts:166-175`) — and unifying
 * them is a bug the task 33 spec names explicitly.
 *
 * The arrangement makes that bug unreachable rather than merely discouraged:
 * `useFloatingPanel` and `FloatingPanel` are pure and hold no key, and
 * `LightingPreviewPanel` receives `position` / `onPositionCommit` as props. The
 * key exists exactly once, on the two `setPanel("lightingPreview", …)` calls
 * below. `ViewportUIStore` groups the three panels internally but
 * `UIStore.toPersistedUIState()` flattens them back to the same 7 flat keys, so
 * the WIRE FORMAT is unchanged (R3).
 *
 * ── Why the canvas arrives as a REF ───────────────────────────────────────
 *
 * The thumbnail is a lit composite of the current frame — a 300k-cell project
 * in the owner's case — and a pixel grid may not cross the `ui/` boundary as a
 * prop (R2). `LightingCanvasContainer` owns the ref and paints through it from
 * its rAF-scheduled `renderPreview`; this container only supplies panel state.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import type { RefObject } from "react";
import { useStores } from "../stores/context";
import { LightingPreviewPanel } from "../ui/components/LightingPreviewPanel/LightingPreviewPanel";

interface LightingPreviewPanelContainerProps {
  /** The thumbnail canvas, painted by `LightingCanvasContainer`. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The element the panel floats inside — `LightingSurface`'s root. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Notified after the minimise state is persisted, so the canvas container can
   * repaint the thumbnail when the panel expands and re-mounts its canvas.
   */
  onMinimizedChange?: (minimized: boolean) => void;
}

export const LightingPreviewPanelContainer = observer(
  function LightingPreviewPanelContainer({
    canvasRef,
    containerRef,
    onMinimizedChange,
  }: LightingPreviewPanelContainerProps) {
    const { ui } = useStores();
    const panel = ui.viewport.panels.lightingPreview;

    return (
      <LightingPreviewPanel
        canvasRef={canvasRef}
        containerRef={containerRef}
        position={panel.position}
        onPositionCommit={(position) =>
          ui.viewport.setPanel("lightingPreview", { position })
        }
        minimized={panel.minimized ?? false}
        onMinimizedChange={(minimized) => {
          ui.viewport.setPanel("lightingPreview", { minimized });
          onMinimizedChange?.(minimized);
        }}
      />
    );
  },
);
