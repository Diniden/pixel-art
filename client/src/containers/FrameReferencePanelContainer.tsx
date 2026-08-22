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
 * four frame-trace members off the legacy Zustand hook. Those are the trace-overlay
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
import { FrameReferencePanel } from "../ui/components/FrameReferencePanel/FrameReferencePanel";
import { ObjectSelectModalContainer } from "./ObjectSelectModalContainer";
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
    const app = useStores();
    const { ui, domain, referenceUI, selection } = app;
    const panel = ui.viewport.panels.frameReference;

    /**
     * ⚠️ Transcribed from `store/referenceActions.ts:99-113`
     * (`getFrameReferenceObject`), INCLUDING the fallback:
     *
     *   - an explicit `frameReferenceObjectId` wins, and resolving it to a
     *     missing object yields null rather than falling through;
     *   - otherwise the panel references the CURRENTLY SELECTED object.
     *
     * Dropping the fallback makes the panel render blank until the user picks
     * an object, which is not how it behaves today.
     */
    const frameReferenceObjectId = referenceUI.frameReferenceObjectId;
    const referenceObject = frameReferenceObjectId
      ? (domain.objects.find((o) => o.id === frameReferenceObjectId) ?? null)
      : (app.currentObject ?? null);

    return (
      <FrameReferencePanel
        onOverlayChange={onOverlayChange}
        overlayFrameIndex={overlayFrameIndex}
        frameReferencePanelMinimized={panel.minimized ?? false}
        onMinimizedChange={(minimized) =>
          ui.viewport.setPanel("frameReference", { minimized })
        }
        currentObject={app.currentObject}
        referenceObject={referenceObject}
        variants={domain.variants}
        selectedFrameId={selection.selectedFrameId}
        // ⚠️ This panel's OWN position key — the three floating panels are
        // deliberately not unified (task 29 constraint, restated by task 36).
        panelPosition={panel.position}
        onPanelPositionChange={(position) =>
          ui.viewport.setPanel("frameReference", { position })
        }
        frameTraceActive={referenceUI.frameTraceActive}
        frameTraceFrameIndex={referenceUI.frameTraceFrameIndex}
        onFrameTraceActiveChange={(active, frameIndex) =>
          referenceUI.setFrameTraceActive(active, frameIndex ?? null)
        }
        frameReferenceObjectId={frameReferenceObjectId}
        onFrameReferenceObjectIdChange={(objectId) =>
          referenceUI.setFrameReferenceObjectId(objectId)
        }
        objectSelectModal={(props) => <ObjectSelectModalContainer {...props} />}
      />
    );
  },
);
