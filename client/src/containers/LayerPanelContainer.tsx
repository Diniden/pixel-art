/**
 * LayerPanelContainer (REFRESH task 25).
 *
 * `LayerPanel` has **22 store members — the highest count outside `Canvas`** —
 * plus a global `keydown` handler. Seven of the 22 are the `squash*`/`move*`
 * variants.
 *
 * ⚠️ **It is deliberately NOT split here**, and the seven variant callbacks
 * are deliberately NOT collapsed: both are scheduled as their own tasks (35
 * for the call-site collapse, a later one for the split). The four `squash*`
 * STORE actions were ported one-for-one into `LayerStore` for the same
 * reason — task 08 measured that they disagree, so collapsing while porting
 * would make a regression impossible to attribute.
 *
 * ⚠️ `layerClipboard` — the paste shortcut this component's keydown handler
 * drives — reads the CROSS-PROJECT buffer on `SessionStore` (R14). It
 * survives a project switch by construction, and nothing in this container or
 * in `LayerStore` may clear it.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { LayerPanel } from "../components/LayerPanel/LayerPanel";

export const LayerPanelContainer = observer(function LayerPanelContainer() {
  return <LayerPanel />;
});
