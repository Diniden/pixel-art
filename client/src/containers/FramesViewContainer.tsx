/**
 * FramesViewContainer (REFRESH task 25; store seam closed by W29c).
 *
 * `FramesView` is one of the two cheapest wins in this wave: it is **already
 * prop-driven for reads** — `project` and `obj` arrive as props from
 * `FrameTimeline` — and its 8 store members are ALL ACTIONS
 * (`addFrame`, `deleteFrame`, `renameFrame`, `selectFrame`, `duplicateFrame`,
 * `moveFrame`, `reorderFrame`, `resizeObject`).
 *
 * ── W29c: those 8 actions now come in as PROPS from here ──────────────────
 *
 * Task 25 recorded that "only the action imports need lifting". This is that
 * lift. Every one of the eight was a PASS-THROUGH bridge delegate — five to
 * `FrameStore`, one to `TimelineUIStore.selectFrame`, one to
 * `ObjectStore.resizeObject` — so calling the MobX store directly here
 * duplicates NOTHING. That is the property that distinguishes these from the
 * canvas containers' `actions.*` sites, whose delegates assemble arguments
 * (`pixelWriteOptions()`, `selectionWriteOptions()`, `editableGrid()`) that
 * live only inside `stores/bridge/zustandBridge.ts`.
 *
 * ── W29i: `project` IS NO LONGER A DOMAIN NODE ────────────────────────────
 *
 * It is now `TimelineProjectView` — the four fields this subtree actually
 * reads, assembled from MobX observables by `FrameTimelineContainer`. The
 * comparator below still sees the identical `variantFrameIndices` record by
 * the identical reference, and the render counts are pinned by
 * `__tests__/frameThumbnailMemo.dom.test.tsx`.
 *
 * The measurement that made that safe, and that kept `project` whole for
 * eight waves before it:
 *
 *   `FrameThumbnail`'s `React.memo` comparator
 *   (`FramesView.tsx`) compares `project.uiState.variantFrameIndices` BY
 *   REFERENCE, and only when the cell is the selected frame. Against the
 *   owner's real project (`Base Unit.json`, v1.1.0) that guard is **LIVE**:
 *   7 variant groups and 9 populated `variantFrameIndices` entries, and
 *   `TimelineUIStore` rebuilds the record as a NEW object on every write
 *   (it is `observableRef`), so the reference comparison is meaningful.
 *
 *   This is the OPPOSITE of W20's `ObjectThumbnail` finding, where the
 *   comparator guarded on `variantGroups` — a field the v1.1.0 migration
 *   leaves `undefined` — and was therefore dead code. Same shape, different
 *   answer; the difference only shows up by measuring.
 *
 * What no predecessor asked was the NEXT question: what does the comparator
 * OBSERVE? Only `project.uiState.variantFrameIndices` — and `FrameThumbnail`'s
 * prop type was always the structural minimum
 * `{ uiState?: { variantFrameIndices?: … } }`, never `Project`. So narrowing
 * the wrapper leaves the observed record untouched. Pinned, not assumed: the
 * render-count test carries two negative controls that fail if the
 * by-reference guard is flattened into a by-value one or vice versa.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { FramesView } from "../components/FrameTimeline/FramesView";
import { useStores } from "../stores/context";
import type { ComponentProps } from "react";

type ForwardedProps = Omit<
  ComponentProps<typeof FramesView>,
  | "addFrame"
  | "deleteFrame"
  | "renameFrame"
  | "selectFrame"
  | "duplicateFrame"
  | "moveFrame"
  | "reorderFrame"
  | "resizeObject"
>;

export const FramesViewContainer = observer(function FramesViewContainer(
  props: ForwardedProps,
) {
  const app = useStores();

  return (
    <FramesView
      {...props}
      addFrame={(name, copyPrevious) => app.frames.addFrame(name, copyPrevious)}
      deleteFrame={(id) => app.frames.deleteFrame(id)}
      renameFrame={(id, name) => app.frames.renameFrame(id, name)}
      selectFrame={(id, syncVariants) =>
        app.timelineUI.selectFrame(id, syncVariants)
      }
      duplicateFrame={(id) => app.frames.duplicateFrame(id)}
      moveFrame={(id, direction) => app.frames.moveFrame(id, direction)}
      reorderFrame={(frameId, toIndex) =>
        app.frames.reorderFrame(frameId, toIndex)
      }
      resizeObject={(id, width, height, anchor) =>
        app.objects.resizeObject(id, width, height, anchor)
      }
    />
  );
});
