/**
 * ToolbarContainer (REFRESH task 24; PURIFIED task 36, W27).
 *
 * Task 24 created this as a deliberately thin `observer()` seam and said so
 * explicitly: relocating `Toolbar` into `ui/`, adopting the `Tooltip`
 * primitive, and converting its reads to props were "the purification task's
 * job (35/36)". This is that task.
 *
 * All five store members are now projected to flat props. The two child tool
 * groups are passed as ELEMENTS rather than imported by the component: both
 * are containers, and a `ui/` module importing a container would pull MobX
 * across the purity boundary transitively — ESLint catches the direct import,
 * but not the transitive one, so the discipline has to be deliberate.
 *
 * ⚠️ `frameReferencePanelVisible` has NO getter on `ViewportUIStore`; the flag
 * lives at `panels.frameReference.visible` and is `undefined` until first
 * toggled. The `?? true` default is transcribed from
 * `ViewportUIStore.toggleFrameReferencePanelVisible`, which computes its next
 * value the same way. Reading it without the fallback makes the Frame
 * Reference button render inactive on a fresh project while the panel is in
 * fact showing.
 *
 * ⚠️ `if (!hasProject) return null` is transcribed from the component's
 * pre-purification `if (!project) return null`.
 */
import { observer } from "mobx-react-lite";
import { Toolbar } from "../ui/components/Toolbar/Toolbar";
import { PixelStudioToolsContainer } from "./PixelStudioToolsContainer";
import { LightingStudioToolsContainer } from "./LightingStudioToolsContainer";
import { useStores } from "../stores/context";
import type { ReferenceImageData } from "../types/referenceImage";

interface ToolbarContainerProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

export const ToolbarContainer = observer(function ToolbarContainer({
  onReferenceImageChange,
  hasReferenceImage,
}: ToolbarContainerProps) {
  const { domain, ui, lightingUI } = useStores();

  if (!domain.hasProject) return null;

  const viewport = ui.viewport;

  return (
    <Toolbar
      isLightingMode={lightingUI.studioMode === "lighting"}
      isFocusMode={viewport.focusMode}
      isLightGrid={viewport.lightGridMode ?? false}
      isFrameReferenceVisible={viewport.panels.frameReference.visible ?? true}
      onSetStudioMode={(mode) => lightingUI.setStudioMode(mode)}
      onToggleFocusMode={() => viewport.toggleFocusMode()}
      onToggleLightGridMode={() => viewport.toggleLightGridMode()}
      onToggleFrameReferencePanelVisible={() =>
        viewport.toggleFrameReferencePanelVisible()
      }
      pixelStudioTools={
        <PixelStudioToolsContainer
          onReferenceImageChange={onReferenceImageChange}
          hasReferenceImage={hasReferenceImage}
        />
      }
      lightingStudioTools={<LightingStudioToolsContainer />}
      // Which edge the user locked it to. `AppShell` positions the dock; the
      // toolbar re-flows itself (vertical is a re-flow, not a rotation).
      edge={ui.layout.layout.toolbar.edge}
      spread={ui.layout.layout.toolbar.spread}
    />
  );
});
