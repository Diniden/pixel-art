/**
 * ReferenceImagePanelContainer (REFRESH task 29).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PANEL THAT USED TO REACH INTO A MODAL'S GLOBAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ReferenceImagePanel` imported `adjustReferenceBoxSize`,
 * `shiftReferenceSelection` and `shiftReferenceSelectionBySize` directly from
 * `ReferenceImageModal.tsx` and called them at 16 sites. Each mutated the
 * modal's module-level singleton and returned freshly-extracted pixels, which
 * the panel then threaded back up through `onReferenceImageChange` by hand,
 * because mutating a plain object re-renders nothing.
 *
 * The three are now `ReferenceUIStore` actions, injected below. The panel is
 * pure presentation and imports no store.
 *
 * ── Its local `isMinimized` mirror is DELETED, not migrated ───────────────
 *
 * The panel held `useState(project?.uiState.referenceImagePanelMinimized)` plus
 * a `useEffect` that re-synced it — a duplicate that lagged the store by a
 * render. It now reads the value as a prop off `ViewportUIStore.panels`.
 *
 * ⚠️ ⚠️ THE THREE FLOATING PANELS KEEP THREE DISTINCT PERSISTENCE KEYS. This
 * container reads and writes ONLY `panels.referenceImage`; the wire keys
 * `referenceImagePanelPosition` / `referenceImagePanelMinimized` are unchanged
 * and are NOT unified with the frame-reference or lighting-preview panels
 * (task 29 constraint).
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { ReferenceImagePanel } from "../ui/components/ReferenceImagePanel/ReferenceImagePanel";
import { useStores } from "../stores/context";
import type { ReferenceImageData } from "../types/referenceImage";

interface ReferenceImagePanelContainerProps {
  referenceImage: ReferenceImageData | null;
  onReferenceImageChange: (data: ReferenceImageData | null) => void;
}

export const ReferenceImagePanelContainer = observer(
  function ReferenceImagePanelContainer({
    referenceImage,
    onReferenceImageChange,
  }: ReferenceImagePanelContainerProps) {
    const { referenceUI, ui } = useStores();
    const panel = ui.viewport.panels.referenceImage;

    return (
      <ReferenceImagePanel
        referenceImage={referenceImage}
        onReferenceImageChange={onReferenceImageChange}
        isReferenceTraceActive={ui.tool.selectedTool === "reference-trace"}
        zoom={ui.viewport.zoom ?? 10}
        isMinimized={panel.minimized ?? false}
        onMinimizedChange={(minimized) =>
          ui.viewport.setPanel("referenceImage", { minimized })
        }
        persistedPosition={panel.position}
        onPositionChange={(position) =>
          ui.viewport.setPanel("referenceImage", { position })
        }
        onSelectTool={(tool) => ui.tool.setTool(tool)}
        onAdjustBoxSize={(direction, increase) =>
          referenceUI.adjustBoxSize(direction, increase)
        }
        onShiftSelection={(dx, dy) => referenceUI.shiftSelection(dx, dy)}
        onShiftSelectionBySize={(dx, dy, width, height) =>
          referenceUI.shiftSelectionBySize(dx, dy, width, height)
        }
      />
    );
  },
);
