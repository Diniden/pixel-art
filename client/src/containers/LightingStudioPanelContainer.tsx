/**
 * LightingStudioPanelContainer (REFRESH task 27; PURIFIED task 36, W27).
 *
 * `LightingStudioPanel` used to read 4 store members through
 * the legacy Zustand hook. Task 36 made it pure and moved it to
 * `ui/components/LightingStudioPanel/`; this container is now the only place
 * that touches a store on its behalf.
 *
 * ── Why the children are passed as ELEMENTS ───────────────────────────────
 *
 * Task 27 deliberately gave `NormalPicker` and `LightControl` their OWN
 * containers so each is an independent `observer()` boundary — `NormalPicker`
 * especially, since it drives two independent store fields.
 *
 * A pure `ui/` component cannot import those containers: `containers/` imports
 * `mobx-react-lite`, so the import would pull MobX across the purity boundary
 * transitively (ESLint catches the direct import; the transitive one is a
 * design error the boundary probe would NOT catch). Passing them as
 * `normalPicker` / `lightControl` render props keeps the panel store-free AND
 * preserves the per-child observer seams exactly as task 27 built them.
 *
 * ⚠️ Rendering them here rather than inside the panel does NOT widen the
 * re-render surface: each child is still its own `observer()`, and this
 * container re-renders only on the 4 fields it actually reads.
 *
 * ── The defaults live HERE, not in the component ──────────────────────────
 *
 * `lightingDataLayerEditMode ?? "normals"` and `heightBrushValue ?? 128` were
 * inline in the component. They are applied here so there is exactly one
 * source of truth for each default — the component's props are non-optional.
 * Both fallbacks are transcribed unchanged from the pre-move component.
 */
import { observer } from "mobx-react-lite";
import { LightingStudioPanel } from "../ui/components/LightingStudioPanel/LightingStudioPanel";
import { SelectedNormalPickerContainer } from "./NormalPickerContainer";
import { LightControlContainer } from "./LightControlContainer";
import { useStores } from "../stores/context";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";

export const LightingStudioPanelContainer = observer(
  function LightingStudioPanelContainer() {
    const { ui, lightingUI } = useStores();

    return (
      <LightingStudioPanel
        brushSize={ui.tool.brushSize}
        normalBrushShape={lightingUI.normalBrushShape}
        // Defaults transcribed from the pre-purification component.
        editMode={lightingUI.lightingDataLayerEditMode ?? "normals"}
        heightBrushValue={lightingUI.heightBrushValue ?? 128}
        onBrushSizeChange={(size) => ui.tool.setBrushSize(size)}
        onNormalBrushShapeChange={(shape) =>
          lightingUI.setNormalBrushShape(shape)
        }
        onHeightBrushValueChange={(value) =>
          lightingUI.setHeightBrushValue(value)
        }
        normalPicker={<SelectedNormalPickerContainer enableScrollControl />}
        lightControl={<LightControlContainer />}
        onOtherHandBrush={
          ui.layout.otherHandAvailable
            ? () => ui.layout.enterOtherHand(OTHER_HAND_SECTIONS.tool)
            : undefined
        }
        onOtherHandLight={
          ui.layout.otherHandAvailable
            ? () => ui.layout.enterOtherHand(OTHER_HAND_SECTIONS.light)
            : undefined
        }
      />
    );
  },
);
