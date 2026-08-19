/**
 * PixelStudioToolsContainer (REFRESH task 24).
 *
 * `PixelStudioTools` reads 4 store members (`project`, `setTool`,
 * `flipHorizontal`, `flipVertical`). See `ToolbarContainer` for why this is
 * deliberately thin — purification is task 35/36's job, not this one's.
 */
import { observer } from "mobx-react-lite";
import { PixelStudioTools } from "../components/Toolbar/PixelStudioTools";
import type { ReferenceImageData } from "../types/referenceImage";

interface PixelStudioToolsContainerProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

export const PixelStudioToolsContainer = observer(
  function PixelStudioToolsContainer({
    onReferenceImageChange,
    hasReferenceImage,
  }: PixelStudioToolsContainerProps) {
    return (
      <PixelStudioTools
        onReferenceImageChange={onReferenceImageChange}
        hasReferenceImage={hasReferenceImage}
      />
    );
  },
);
