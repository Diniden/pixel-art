/**
 * TimelineViewContainer (REFRESH task 25).
 *
 * `TimelineView` is the most entangled consumer in this wave: 836 lines, 12
 * store members, six responsibilities, and it mutates layer structure across
 * **all** frames.
 *
 * ⚠️ **It is deliberately NOT split here.** The split is its own scheduled
 * task; purifying and splitting in one session makes the diff unreviewable,
 * and the spec names this constraint explicitly. This task gives it a
 * container and stops.
 *
 * All 12 of its members are migrated by task 25 —
 * `selectFrame`/`selectLayer` to `TimelineUIStore`, the four frame-scoped
 * layer ops and the two timeline-cell clipboard ops to `LayerStore`,
 * `setTimelineThumbnailMode` to `TimelineUIStore`, and
 * `timelineCellClipboard` to `SessionStore` (Phase B as of this task). So
 * this component's whole store surface is MobX-owned behind the bridge
 * delegates.
 *
 * ── Per-cell containers, when the split happens ──────────────────────────
 * The container rules call for mapping over a computed array of IDs and
 * rendering a per-item container, rather than wrapping a 360-cell grid in one
 * `observer` — one cell changing must not re-render the grid. That
 * restructuring belongs to the split task; doing it here would BE the split.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { TimelineView } from "../components/FrameTimeline/TimelineView";
import type { ComponentProps } from "react";

export const TimelineViewContainer = observer(function TimelineViewContainer(
  props: ComponentProps<typeof TimelineView>,
) {
  return <TimelineView {...props} />;
});
