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
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `previewPanel` IS DELIBERATELY NOT PASSED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingStudioLayout` accepts a `previewPanel` prop, and wiring it here
 * would be a bug. `LightingPreviewPanelContainer` needs two refs that exist
 * only inside `LightingCanvasContainer` — the thumbnail `<canvas>` it paints
 * through and the `LightingSurface` root it floats within — so task 33 mounts
 * it there (`LightingCanvasContainer.tsx:668`), inside the node this container
 * passes as `canvas`. Passing it again here would mount the panel TWICE: two
 * float-drag handlers writing the same persisted `lightingPreview` position,
 * and two canvases racing for one thumbnail.
 *
 * The prop exists so a story can show the arrangement with a stub. See
 * `LightingStudioLayout`'s header.
 *
 * ── Both W19 containers are rendered here ─────────────────────────────────
 *
 * `LightingCanvasContainer` (task 33) and `LightingStudioPanelContainer`
 * (tasks 27/36) were left deliberately unwired by W19 because their only
 * render sites were in `App.tsx`. This is that render site. Both take no
 * props, so the wiring is exactly the one-line import each that W19 predicted.
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
import { useStores } from "../stores/context";
import { OtherHandRailContainer } from "./OtherHandRailContainer";
import { useRailLayout } from "./hooks/useRailLayout";

export const LightingStudioContainer = observer(
  function LightingStudioContainer() {
    const { ui } = useStores();
    const railLayout = useRailLayout();

    return (
      <LightingStudioLayout
        {...railLayout}
        focusMode={ui.viewport.focusMode}
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
        canvas={<LightingCanvasContainer />}
      />
    );
  },
);
