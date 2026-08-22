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
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { FrameTimeline } from "../ui/components/FrameTimeline/FrameTimeline";
import { FramesViewContainer } from "./FramesViewContainer";
import { TimelineViewContainer } from "./TimelineViewContainer";
import { VariantViewContainer } from "./VariantViewContainer";
import { useStores } from "../stores/context";
import type { TimelineProjectView } from "../types";

export const FrameTimelineContainer = observer(function FrameTimelineContainer() {
  const app = useStores();
  const { selection, ui } = app;

  /**
   * ══════════════════════════════════════════════════════════════════════
   *  `project` IS NOW A FOUR-FIELD VIEW BUILT FROM MobX (W29i)
   * ══════════════════════════════════════════════════════════════════════
   *
   * This line was the codebase's second-to-last real `useEditorStore` read,
   * and eight preparatory waves left it standing for two stated reasons.
   * Both are now resolved — by measurement, not by assertion.
   *
   * ── Blocker 1: "the comparators are live, so `project` cannot move" ─────
   *
   * TRUE, and still true: W29c measured `FrameThumbnail`'s `React.memo`
   * comparator against the owner's real project and found it LIVE — 7 variant
   * groups, 9 populated `variantFrameIndices` entries, and
   * `TimelineUIStore.setVariantFrameIndex` rebuilds that record as a NEW
   * object per write (`observableRef`), so the by-reference guard really does
   * gate re-renders. That is the OPPOSITE of W20's `ObjectThumbnail`, where
   * the same shape of guard was dead code.
   *
   * What no predecessor did was ask the NEXT question: *what does the
   * comparator actually observe?* It reads exactly
   * `project.uiState.variantFrameIndices` — and `FrameThumbnail`'s prop type
   * has ALWAYS been the structural minimum
   * `{ uiState?: { variantFrameIndices?: … } }` (`FramesView.tsx:28`), never
   * `Project`. The component was handed a domain node it never asked for.
   *
   * Enumerating every `project.*` access in the whole subtree —
   * `FrameTimeline`, `FramesView`, `VariantView`, `TimelineViewContainer` —
   * yields exactly FOUR fields, and that list is `TimelineProjectView`. So
   * the comparators keep observing the identical record, by the identical
   * reference, and nothing about their semantics changes.
   *
   * ⚠️ That claim is PINNED, not assumed:
   * `__tests__/frameThumbnailMemo.dom.test.tsx` counts real renders through
   * the real comparator across six cases — including two negative controls
   * (a new record with equal values; a change to a group outside `variants`)
   * that FAIL if the by-reference guard is flattened into a by-value one or
   * vice versa. The numbers were measured against the PRE-change code and are
   * reproduced exactly after it. Verified discriminating: deliberately
   * replacing the comparator's inner by-value loop with a bare reference
   * check turns cases 3 and 4 red.
   *
   * ── Blocker 2: "there is no MobX `project` to read" ─────────────────────
   *
   * Also true, and it stays true — `DomainStore` has NO `project` field, and
   * `currentProject()` is a METHOD that REBUILDS the 300,249-cell tree via
   * `treeToProject()` on every call. Calling it inside an `observer()` render
   * is precisely the modelling error R2 exists to prevent.
   *
   * ⚠️ **It is NOT called here, and must never be.** The four fields come off
   * four separate observables, none of which touches pixel data:
   *
   *     variants             → `domain.variants`        (observableShallow)
   *     selectedFrameId      → `selection.selectedFrameId`
   *     zoom                 → `ui.viewport.zoom`
   *     variantFrameIndices  → `timelineUI.variantFrameIndices` (observableRef)
   *
   * Reading them individually is also the granularity win R7 is about: this
   * container now re-renders on the four fields the timeline uses, instead of
   * on every unrelated Zustand `project` replacement.
   *
   * ── Why the `useMemo` is load-bearing ──────────────────────────────────
   *
   * `FrameItem` is a plain `memo` with a SHALLOW prop compare and it receives
   * this node directly (`FramesView.tsx:653`). A freshly-built object every
   * render would make that compare always fail and re-render every frame cell
   * on every timeline render — a REGRESSION, and one the whole-`Project` prop
   * did not have, since Zustand replaced that node only on a real change.
   *
   * The `useMemo` restores exactly that property: the wrapper's identity is
   * stable while its four fields are, and changes when any of them does.
   */
  const project = useMemo<TimelineProjectView>(
    () => ({
      variants: app.domain.variants,
      uiState: {
        selectedFrameId: selection.selectedFrameId,
        zoom: ui.viewport.zoom,
        variantFrameIndices: app.timelineUI.variantFrameIndices,
      },
    }),
    [
      app.domain.variants,
      selection.selectedFrameId,
      ui.viewport.zoom,
      app.timelineUI.variantFrameIndices,
    ],
  );

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
