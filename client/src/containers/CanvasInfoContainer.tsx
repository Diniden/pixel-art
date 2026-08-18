/**
 * CanvasInfoContainer (REFRESH task 23).
 *
 * `CanvasInfo` reads 7 store members and — uniquely among the seven consumers
 * — calls `useEditorStore()` TWICE (once at the top, once mid-body for
 * `setCanvasInfoHidden`). The spec calls for collapsing that to one container;
 * the three computeds it needs are supplied here, and the second call site is
 * folded into the first destructure inside the component.
 *
 * `selection`, `referenceOverlayOffset` and the `uiState` reads stay on
 * Zustand — they are UI state migrating with tasks 24/28.
 */
import { observer } from "mobx-react-lite";
import { CanvasInfo } from "../components/Canvas/CanvasInfo";
import type { ReferenceImageData } from "../components/ReferenceImageModal/ReferenceImageModal";
import { useStores } from "../stores/context";

interface CanvasInfoContainerProps {
  referenceImage?: ReferenceImageData | null;
}

export const CanvasInfoContainer = observer(function CanvasInfoContainer({
  referenceImage,
}: CanvasInfoContainerProps) {
  const app = useStores();
  return (
    <CanvasInfo
      referenceImage={referenceImage}
      object={app.currentObject}
      variantData={app.currentVariant}
      editingVariant={app.isEditingVariant}
    />
  );
});
