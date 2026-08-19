/**
 * RightSidebarTopControlsContainer (REFRESH task 24).
 *
 * `RightSidebarTopControls` reads **16 store members** — the union of every
 * tool's option surface, and the largest single store destructure among the
 * four consumers. It also has **zero internal hooks**, so nothing stateful
 * can break: it is the cheapest big win of the four.
 *
 * ⚠️ It is a strong candidate for splitting into `ZoomControls` +
 * `BrushControls` + `ShapeControls` + `SelectionControls` (each taking 3-5
 * props, so the split REDUCES total props). **That split is scheduled as its
 * own later task and must NOT happen here** — the spec is explicit: do not
 * split and purify in the same session.
 */
import { observer } from "mobx-react-lite";
import { RightSidebarTopControls } from "../components/RightSidebarTopControls/RightSidebarTopControls";

export const RightSidebarTopControlsContainer = observer(
  function RightSidebarTopControlsContainer() {
    return <RightSidebarTopControls />;
  },
);
