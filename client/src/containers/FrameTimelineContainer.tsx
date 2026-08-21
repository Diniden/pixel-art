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
   *
   * ── W29c: the comparator was MEASURED, and it is LIVE ───────────────────
   *
   * W29c did the measurement this note asks for, against the owner's real
   * project (`server/src/data/Base Unit.json`, v1.1.0):
   *
   *     variants:                     7 groups
   *     uiState.variantFrameIndices:  9 populated entries
   *
   * and `TimelineUIStore.setVariantFrameIndex` rebuilds the record as a NEW
   * object on every write (it is `observableRef`), so the by-reference
   * comparison in `FramesView`'s `FrameThumbnail` comparator is meaningful
   * and really does gate re-renders. This is the OPPOSITE of W20's
   * `ObjectThumbnail` result, where the guard read a field the v1.1.0
   * migration leaves `undefined` and the branch was dead. Same shape,
   * different answer — only measuring separates them.
   *
   * So `project` STAYS. W29c migrated `FramesView`'s eight ACTIONS to props
   * (all were pass-through bridge delegates) without touching the read path,
   * which is the part the comparators observe.
   *
   * ⚠️ AND THERE IS A SECOND, HARDER REASON THIS LINE CANNOT MOVE YET:
   * there is no MobX `project` to read. Task 23 split the tree into five
   * observable members specifically so no reader could take the whole thing.
   * `DomainStore` has NO `project` field, and `currentProject()` is a METHOD
   * (`DomainStore.ts:323`) that REBUILDS the 300,249-cell tree through
   * `treeToProject()` on every call. Calling it in render — inside an
   * `observer()`, on every timeline re-render — is exactly the modelling
   * error the "never deep-observe a pixel grid" rule exists to prevent.
   *
   * Removing this read therefore needs `FramesView`/`VariantView` to stop
   * needing a whole `Project`, i.e. the comparator redesign above — NOT a
   * different store call.
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
