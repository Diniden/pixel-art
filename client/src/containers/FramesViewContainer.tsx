/**
 * FramesViewContainer (REFRESH task 25).
 *
 * `FramesView` is one of the two cheapest wins in this wave: it is **already
 * prop-driven for reads** — `project` and `obj` arrive as props from
 * `FrameTimeline` — and its 8 store members are ALL ACTIONS
 * (`addFrame`, `deleteFrame`, `renameFrame`, `selectFrame`, `duplicateFrame`,
 * `moveFrame`, `reorderFrame`, `resizeObject`). Only the action imports need
 * lifting, which tasks 35/36 do.
 *
 * Five of those eight now resolve to `FrameStore`, one to
 * `TimelineUIStore.selectFrame` and one to `ObjectStore.resizeObject`, all
 * through bridge delegates — so the behaviour behind this container is
 * already MobX-owned even though the component still calls
 * `useEditorStore()`.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { FramesView } from "../components/FrameTimeline/FramesView";
import type { ComponentProps } from "react";

export const FramesViewContainer = observer(function FramesViewContainer(
  props: ComponentProps<typeof FramesView>,
) {
  return <FramesView {...props} />;
});
