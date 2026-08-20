/**
 * LightControlContainer (REFRESH task 27).
 *
 * `LightControl` reads 4 store members (`project`, `setLightColor`,
 * `setAmbientColor`, `setHeightScale`) — three of the nine fields
 * `LightingUIStore` now owns, and three of the EIGHT that never autosaved
 * before W8. They persist structurally now; see `LightingUIStore`'s header.
 *
 * REFRESH task 36 (W27): the component is pure now — all three values and
 * their setters are props, and `LightDirectionPickerContainer` is injected as
 * an ELEMENT (a `ui/` module may not import a container).
 */
import { observer } from "mobx-react-lite";
import { LightControl } from "../ui/components/LightingStudioPanel/LightControl";
import { LightDirectionPickerContainer } from "./NormalPickerContainer";
import { useStores } from "../stores/context";

export const LightControlContainer = observer(function LightControlContainer() {
  const { lightingUI } = useStores();
  return (
    <LightControl
      lightColor={lightingUI.lightColor}
      ambientColor={lightingUI.ambientColor}
      heightScale={lightingUI.heightScale}
      onLightColorChange={(color) => lightingUI.setLightColor(color)}
      onAmbientColorChange={(color) => lightingUI.setAmbientColor(color)}
      onHeightScaleChange={(scale) => lightingUI.setHeightScale(scale)}
      lightDirectionPicker={<LightDirectionPickerContainer />}
    />
  );
});
