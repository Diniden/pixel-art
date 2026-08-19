/**
 * LightControlContainer (REFRESH task 27).
 *
 * `LightControl` reads 4 store members (`project`, `setLightColor`,
 * `setAmbientColor`, `setHeightScale`) — three of the nine fields
 * `LightingUIStore` now owns, and three of the EIGHT that never autosaved
 * before W8. They persist structurally now; see `LightingUIStore`'s header.
 *
 * Thin by design — see `LightingStudioPanelContainer`.
 */
import { observer } from "mobx-react-lite";
import { LightControl } from "../components/LightingStudioPanel/LightControl";

export const LightControlContainer = observer(function LightControlContainer() {
  return <LightControl />;
});
