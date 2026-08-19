/**
 * ToolbarContainer (REFRESH task 24).
 *
 * `Toolbar` reads 5 store members (`project`, `setStudioMode`,
 * `toggleFocusMode`, `toggleLightGridMode`,
 * `toggleFrameReferencePanelVisible`). This container is the `observer()`
 * seam that will feed them as props once the component is purified.
 *
 * ⚠️ Deliberately thin. The spec is explicit that this task gives the four
 * consumers a container and stops there — physically relocating them into
 * `ui/components/`, adopting the `Tooltip` primitive in place of `Toolbar`'s
 * bespoke portal tooltip, and converting their reads to props are the
 * purification task's job (35/36), interleaved per file exactly as
 * `MASTER.md` §9.8 requires so no consumer is edited twice in one wave.
 *
 * `observer()` lives here and only here — nothing under `components/` or
 * `ui/` may carry it (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { Toolbar } from "../components/Toolbar/Toolbar";
import type { ReferenceImageData } from "../types/referenceImage";

interface ToolbarContainerProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

export const ToolbarContainer = observer(function ToolbarContainer({
  onReferenceImageChange,
  hasReferenceImage,
}: ToolbarContainerProps) {
  return (
    <Toolbar
      onReferenceImageChange={onReferenceImageChange}
      hasReferenceImage={hasReferenceImage}
    />
  );
});
