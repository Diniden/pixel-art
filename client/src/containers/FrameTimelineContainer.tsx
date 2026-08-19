/**
 * FrameTimelineContainer (REFRESH task 25).
 *
 * `FrameTimeline` reads 6 store members (`project`, `getCurrentObject`,
 * `getCurrentLayer`, `getCurrentVariant`, `selectFrame`,
 * `advanceVariantFrames`) and owns the playback loop. This container is the
 * `observer()` seam that will feed those as props once the component is
 * purified.
 *
 * ⚠️ **Playback stays in the component.** The `setInterval` that advances the
 * frame is a view concern with a cleanup contract; hoisting a timer into a
 * container would make the StrictMode double-mount semantics (W2a's R11 list)
 * harder to reason about, not easier — and the spec is explicit that the rAF /
 * interval stays put.
 *
 * ⚠️ Deliberately thin. Task 25's mandate is a container per consumer, NOT a
 * purification: converting the store reads to props, adopting the `ui/`
 * primitives and physically relocating the component are tasks 35/36's job,
 * interleaved per file exactly as `MASTER.md` §9.8 requires so no consumer is
 * edited twice in one wave.
 *
 * `observer()` lives here and only here — nothing under `components/` or
 * `ui/` may carry it (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { FrameTimeline } from "../components/FrameTimeline/FrameTimeline";

export const FrameTimelineContainer = observer(function FrameTimelineContainer() {
  return <FrameTimeline />;
});
