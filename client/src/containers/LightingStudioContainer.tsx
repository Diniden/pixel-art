/**
 * LightingStudioContainer — wires `LightingStudioLayout` (REFRESH task 37).
 *
 * Transcribed from `App.tsx`'s lighting branch (`:252-253`, `:281`). It is far
 * smaller than `PixelStudioContainer` for a measured reason, not an oversight:
 * lighting mode renders **no** `CanvasInfo`, **no** `LayerColors`, **no**
 * `FrameReferencePanel` and **no** `ReferenceImagePanel` (`App.tsx:190-216`),
 * so none of the reference-image plumbing that dominates the pixel container
 * exists here at all. It reads exactly one layout-shaping field, `focusMode`.
 *
 * ── The canvas region is a `CanvasSplit` of `LightingCanvasContainer`s ─────
 *
 * `app.lightingViews.openModes` (left→right) is the third thing this container
 * reads; it changes only on open / close / swap. One `LightingCanvasContainer`
 * is rendered per open mode, and the pane `key` IS the mode string: a swap is
 * an array reorder with the same keys, so React moves the existing DOM nodes
 * and neither canvas remounts (offscreen state, the raw `window` keyboard
 * listener and each pane's camera all survive). The split state itself is
 * session-only (MASTER D3): nothing here is persisted, so a reload comes back
 * to a single Edit pane.
 *
 * ── The floating preview panel is GONE (2026-08-29, MASTER D7) ────────────
 *
 * The lit composite used to be a 200 px thumbnail floating over the edit
 * canvas, mounted from inside `LightingCanvasContainer`. It is now the
 * `"preview"` render mode — a real workspace pane with its own camera — so
 * both the panel and the layout's `previewPanel` slot that existed to express
 * it are retired. ⚠️ Its PERSISTED keys (`lightingPreviewPanelPosition` /
 * `lightingPreviewPanelMinimized`) deliberately REMAIN in the wire format and
 * simply stop being read: removing one would change `toPersistedUIState()`'s
 * output and move 151 corpus snapshot digests of the owner's real work.
 *
 * ── Both W19 containers are rendered here ─────────────────────────────────
 *
 * `LightingCanvasContainer` (task 33) and `LightingStudioPanelContainer`
 * (tasks 27/36) were left deliberately unwired by W19 because their only
 * render sites were in `App.tsx`. This is that render site.
 */
import { observer } from "mobx-react-lite";
import { LightingStudioLayout } from "../ui/layouts/LightingStudioLayout/LightingStudioLayout";
import { HeaderContainer } from "./HeaderContainer";
import { ToolbarContainer } from "./ToolbarContainer";
import { ObjectLibraryContainer } from "./ObjectLibraryContainer";
import { LayerPanelContainer } from "./LayerPanelContainer";
import { RightSidebarTopControlsContainer } from "./RightSidebarTopControlsContainer";
import { LightingStudioPanelContainer } from "./LightingStudioPanelContainer";
import { FrameTimelineContainer } from "./FrameTimelineContainer";
import { LightingCanvasContainer } from "./LightingCanvasContainer";
import { CanvasSplit } from "../ui/components/CanvasSplit/CanvasSplit";
import { useStores } from "../stores/context";
import { OtherHandRailContainer } from "./OtherHandRailContainer";
import { useRailLayout } from "./hooks/useRailLayout";

export const LightingStudioContainer = observer(
  function LightingStudioContainer() {
    const app = useStores();
    const { ui } = app;
    const railLayout = useRailLayout();

    // One pane per open render mode; key = mode (see the header block).
    const panes = app.lightingViews.openModes.map((mode) => ({
      key: mode,
      node: <LightingCanvasContainer renderMode={mode} />,
    }));

    // See `PixelStudioContainer` for why the toast is a sibling rather than a
    // layout prop: it is fixed over the window and belongs to no arrangement.
    const { toast, ...layoutProps } = railLayout;

    return (
      <>
      <LightingStudioLayout
        {...layoutProps}
        header={<HeaderContainer />}
        toolbar={<ToolbarContainer />}
        objectLibrary={<ObjectLibraryContainer />}
        layerPanel={<LayerPanelContainer />}
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
            <LightingStudioPanelContainer />
          )
        }
        timeline={<FrameTimelineContainer />}
        canvas={<CanvasSplit panes={panes} />}
      />
      {toast}
      </>
    );
  },
);
