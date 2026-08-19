/**
 * PixelStudioPanelContainer (REFRESH task 24).
 *
 * `PixelStudioPanel` reads 8 store members across **two separate
 * `useEditorStore()` calls** — one in the panel itself (5) and one in its
 * private `OriginColorPicker` (3). The spec calls for collapsing those into
 * ONE container; this is it. The second call site is folded into the panel
 * when the component is purified (task 35/36) — doing both in one session is
 * exactly what §9.8 warns against.
 */
import { observer } from "mobx-react-lite";
import { PixelStudioPanel } from "../components/PixelStudioPanel/PixelStudioPanel";

export const PixelStudioPanelContainer = observer(
  function PixelStudioPanelContainer() {
    return <PixelStudioPanel />;
  },
);
