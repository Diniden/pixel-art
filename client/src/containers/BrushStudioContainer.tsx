/**
 * BrushStudioContainer — wires `BrushStudioLayout` (brush-studio task 19).
 *
 * The third studio page, beside `PixelStudioContainer` and
 * `LightingStudioContainer`. It is shaped like the lighting one — one layout,
 * one child container per slot, no ephemeral state of its own — because the
 * brush studio has none of the pixel studio's reference-image plumbing: no
 * `CanvasInfo`, no `FrameReferencePanel`, no `ReferenceImagePanel` (MASTER
 * D15, and `BrushStudioLayout`'s header on why those slots do not exist).
 *
 * ── `brushes.init()` runs HERE, on mount ──────────────────────────────────
 *
 * `ApplicationStore` deliberately does not call it (task 11): the brush file
 * list is only needed once the user enters this mode, so entering the mode
 * is what loads it. The effect has no cleanup and no abort, exactly like
 * `AppContainer`'s `domain.initProject()` effect, and for the same reason:
 * `BrushStore.init()` returns synchronously when `loadState` is already
 * `loading` or `loaded`, so React 19 StrictMode's double-fired mount effect
 * cannot start a second racing load (manual check 8 — one `GET /api/brushes`).
 * Re-entering the mode later is also a no-op once loaded; `idle` (no brushes
 * on disk) and `failed` allow the retry.
 *
 * ── Shared chrome ─────────────────────────────────────────────────────────
 *
 * `HeaderContainer` and `ToolbarContainer` are the SAME containers the other
 * two studios mount; both read `lightingUI.studioMode` themselves and adapt
 * (the header's "Brushes" button and brush-name title, the toolbar's hidden
 * tools and brush-routed undo/flip). Nothing is threaded through here.
 *
 * `useRailLayout()` is spread in exactly as the other two containers do —
 * `hiddenRails` (focus mode + per-rail ×), the layout-mode scrims, the preset
 * picker — so focus mode and the Layout button work identically in brush
 * mode. The Other-Hand rail swap mirrors `PixelStudioContainer`'s: one section
 * takes the whole right rail while the mode is on.
 *
 * ⚠️ `useRailLayout`'s rail labels ("Objects & Layers") are hard-coded in
 * `hooks/useRailLayout.tsx` and read slightly wrong over the brush library —
 * cosmetic, out of this task's `Touches`, noted for the final sweep.
 *
 * ── The canvas region: one or two panes (follow-ups task 09, D5) ──────────
 * Exactly as `PixelStudioContainer` does it: one `BrushCanvasContainer` per
 * open mode of `app.brushViews`, in left→right order, inside `CanvasSplit`.
 * The pane `key` IS the mode string, so a swap is a reorder — React moves the
 * existing subtrees, nothing remounts, no flash — and a close unmounts only
 * the pane that went. Nothing here is persisted; a reload comes back to one
 * Full pane.
 */
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { BrushStudioLayout } from "../ui/layouts/BrushStudioLayout/BrushStudioLayout";
import { CanvasSplit } from "../ui/components/CanvasSplit/CanvasSplit";
import { HeaderContainer } from "./HeaderContainer";
import { ToolbarContainer } from "./ToolbarContainer";
import { BrushLibraryContainer } from "./BrushLibraryContainer";
import { BrushLayerPanelContainer } from "./BrushLayerPanelContainer";
import { RightSidebarTopControlsContainer } from "./RightSidebarTopControlsContainer";
import { BrushStudioPanelContainer } from "./BrushStudioPanelContainer";
import { BrushTimelineContainer } from "./BrushTimelineContainer";
import { BrushCanvasContainer } from "./BrushCanvasContainer";
import { OtherHandRailContainer } from "./OtherHandRailContainer";
import { useStores } from "../stores/context";
import { useRailLayout } from "./hooks/useRailLayout";

export const BrushStudioContainer = observer(function BrushStudioContainer() {
  const app = useStores();
  const { ui } = app;
  const railLayout = useRailLayout();

  // See the header: StrictMode-safe because the store guards on `loadState`.
  useEffect(() => {
    void app.brushes.init();
  }, [app]);

  // See `PixelStudioContainer` for why the toast is a sibling rather than a
  // layout prop: it is fixed over the window and belongs to no arrangement.
  const { toast, ...layoutProps } = railLayout;

  // One pane per open render mode; key = mode (see the header block).
  const panes = app.brushViews.openModes.map((mode) => ({
    key: mode,
    node: <BrushCanvasContainer renderMode={mode} />,
  }));

  return (
    <>
      <BrushStudioLayout
        {...layoutProps}
        header={<HeaderContainer />}
        toolbar={<ToolbarContainer />}
        brushLibrary={<BrushLibraryContainer />}
        layerPanel={<BrushLayerPanelContainer />}
        // Other Hand Mode hands the whole rail to one section — see
        // `PixelStudioContainer` for the same swap.
        rightControls={
          ui.layout.otherHandActive ? null : (
            <RightSidebarTopControlsContainer />
          )
        }
        studioPanel={
          ui.layout.otherHandActive ? (
            <OtherHandRailContainer />
          ) : (
            <BrushStudioPanelContainer />
          )
        }
        timeline={<BrushTimelineContainer />}
        canvas={<CanvasSplit panes={panes} />}
      />
      {toast}
    </>
  );
});
