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
import { FrameTimeline } from "../ui/components/FrameTimeline/FrameTimeline";
import { FramesViewContainer } from "./FramesViewContainer";
import { TimelineViewContainer } from "./TimelineViewContainer";
import { VariantViewContainer } from "./VariantViewContainer";
import { useStores } from "../stores/context";
import { useEditorStore } from "../store";

export const FrameTimelineContainer = observer(function FrameTimelineContainer() {
  const app = useStores();
  const { selection, ui } = app;

  /**
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ `project` IS STILL READ FROM ZUSTAND AND PASSED DOWN WHOLE
   * ══════════════════════════════════════════════════════════════════════
   *
   * This is a KNOWN, DELIBERATE deviation from "never pass a domain node",
   * and task 36 stopped here rather than forcing it.
   *
   * `FramesView` and `VariantView` — the last two unpurified components —
   * thread `project` into LIVE `React.memo` comparators
   * (`FramesView.tsx:109-110` and `:151-152`) that compare
   * `project.uiState.variantFrameIndices` BY REFERENCE, and only when the
   * cell is the selected frame. Projecting `project` to a flat view-model
   * changes what those comparators see and therefore which timeline cells
   * re-render — a behaviour change that cannot be verified by the type
   * checker or by the existing suite.
   *
   * W20 found a comparator in `ObjectThumbnail` that was DEAD CODE because it
   * guarded on a field the v1.1.0 migration leaves `undefined`; the standing
   * instruction is not to reintroduce comparators over the project tree
   * without measuring them. Doing that measurement, and purifying those two
   * 684/657-line files, needs a task that can verify the render behaviour
   * against the real project.
   *
   * `FrameTimeline` itself is pure: it only FORWARDS these values.
   */
  const project = useEditorStore((s) => s.project);

  return (
    <FrameTimeline
      project={project}
      obj={app.currentObject}
      layer={app.currentLayer}
      variantData={app.currentVariant}
      selectedFrameId={selection.selectedFrameId}
      // ⚠️ A counter, not an id — see the prop's own note.
      layerSelectionCounter={ui.viewport.layerSelectionCounter}
      onSelectFrame={(frameId, syncVariants) =>
        selection.selectFrame(frameId, syncVariants)
      }
      onAdvanceVariantFrames={(delta) => selection.advanceVariantFrames(delta)}
      framesView={(props) => <FramesViewContainer {...props} />}
      timelineView={(props) => <TimelineViewContainer {...props} />}
      variantView={(props) => <VariantViewContainer {...props} />}
    />
  );
});
