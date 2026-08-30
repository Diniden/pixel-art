/**
 * PixelStudioToolsContainer (REFRESH task 24; PURIFIED task 36, W27).
 *
 * `PixelStudioTools` read 4 store members (`project`, `setTool`,
 * `flipHorizontal`, `flipVertical`). Task 24 created the `observer()` seam and
 * left purification to 35/36; this is that task.
 *
 * ⚠️ `referenceImageModal` is a RENDER PROP, not a child element. The modal's
 * open/close state is owned by `PixelStudioTools` itself (a genuine piece of
 * local view state, not a store mirror), so the container cannot construct the
 * element up-front — it has to be a function the component calls with its own
 * state. `ReferenceImageContainer` is a container, and `ui/` may not import
 * one, so the indirection is required rather than stylistic.
 *
 * ⚠️ `if (!hasProject) return null` is transcribed from the component's
 * pre-purification `if (!project) return null`.
 */
import { observer } from "mobx-react-lite";
import { PixelStudioTools } from "../ui/components/Toolbar/PixelStudioTools";
import { ReferenceImageContainer } from "./ReferenceImageContainer";
import { useStores } from "../stores/context";
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
    const app = useStores();
    const { domain, ui, pixels } = app;

    if (!domain.hasProject) return null;

    return (
      <PixelStudioTools
        onReferenceImageChange={onReferenceImageChange}
        hasReferenceImage={hasReferenceImage}
        selectedTool={ui.tool.selectedTool}
        onSelectTool={(tool) => ui.tool.setTool(tool)}
        alternateTool={ui.tool.alternateTool}
        onSelectAlternateTool={(tool) => ui.tool.setAlternateTool(tool)}
        onSwapTools={() => ui.tool.swapTools()}
        // ⚠️ `eyedropperModeOrDefault`, not the raw field: the store keeps it
        // `undefined` until the user picks a mode, so that projects which
        // never touched it gain no wire-format key. The UI needs a concrete
        // mode to tick, and "revert" is the historical behaviour.
        eyedropperMode={ui.tool.eyedropperModeOrDefault}
        onSelectEyedropperMode={(mode) => ui.tool.setEyedropperMode(mode)}
        // Read straight from the layout store rather than threaded down from
        // `ToolbarContainer`: this component is injected into `Toolbar` as an
        // opaque ELEMENT (the purity boundary — see the header), so the
        // toolbar cannot hand its own `edge` to a child it never renders.
        // Both containers read the one source, so they cannot disagree.
        edge={ui.layout.layout.toolbar.edge}
        // ⚠️ `app.undo()`, NOT `history.undo()` — the history mirror has a
        // single writer and calling the store directly leaves it describing
        // the pre-undo stack. See `ApplicationStore.undo`'s header.
        onUndo={() => app.undo()}
        onRedo={() => app.redo()}
        canUndo={app.history.canUndo}
        canRedo={app.history.canRedo}
        onFlipHorizontal={() => pixels.flipHorizontal()}
        onFlipVertical={() => pixels.flipVertical()}
        referenceImageModal={(modalProps) => (
          <ReferenceImageContainer {...modalProps} />
        )}
      />
    );
  },
);
