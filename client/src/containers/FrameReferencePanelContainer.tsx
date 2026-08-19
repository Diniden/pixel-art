/**
 * FrameReferencePanelContainer (REFRESH task 29).
 *
 * Supplies the frame-reference panel's minimised state from
 * `ViewportUIStore.panels.frameReference`, replacing the local `useState`
 * mirror the component used to keep (task 29 constraint: the duplicate is
 * DELETED, not migrated).
 *
 * ⚠️ SCOPE NOTE — this container is deliberately THIN. `FrameReferencePanel`
 * still reads `project`, `getCurrentObject`, `getFrameReferenceObject` and the
 * four frame-trace members off `useEditorStore()`. Those are the trace-overlay
 * fields, which stay Phase A in this task because their other consumers —
 * `Canvas.tsx` (task 32), `CanvasInfo.tsx`, `RightSidebarTopControls.tsx` — are
 * outside this task's `Touches` list, and flipping a field while an unmigrated
 * consumer still reads Zustand's copy would give it two writers (R6). See
 * `ReferenceUIStore`'s header. This container therefore migrates exactly the
 * one duplicate the task names, and no more.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { FrameReferencePanel } from "../components/FrameReferencePanel/FrameReferencePanel";
import { useStores } from "../stores/context";

interface FrameReferencePanelContainerProps {
  onOverlayChange: (frameIndex: number | null) => void;
  overlayFrameIndex: number | null;
}

export const FrameReferencePanelContainer = observer(
  function FrameReferencePanelContainer({
    onOverlayChange,
    overlayFrameIndex,
  }: FrameReferencePanelContainerProps) {
    const { ui } = useStores();
    const panel = ui.viewport.panels.frameReference;

    return (
      <FrameReferencePanel
        onOverlayChange={onOverlayChange}
        overlayFrameIndex={overlayFrameIndex}
        frameReferencePanelMinimized={panel.minimized ?? false}
        onMinimizedChange={(minimized) =>
          ui.viewport.setPanel("frameReference", { minimized })
        }
      />
    );
  },
);
