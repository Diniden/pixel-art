/**
 * VariantViewContainer (REFRESH tasks 25 → 28).
 *
 * Task 25 created this as an inert `observer()` pass-through, deliberately:
 * every read `VariantView` makes already arrives as a prop, and all 9 of its
 * store members were ACTIONS — so the seam had to exist before the variant
 * slice moved, but there was nothing yet to wire into it.
 *
 * Task 28 filled it in. The nine actions now arrive as props:
 *
 *   7 → `VariantStore`      the `*VariantFrame*` family + `resizeVariant`
 *   1 → `TimelineUIStore`   `selectVariantFrame` (pure selection)
 *   1 → `TimelineUIStore`   `selectFrame`        (task 25)
 *   1 → `FrameStore`        `reorderFrame`       (task 25)
 *
 * `VariantView` is 617 lines and the spec forbids splitting it here (task 35
 * owns that); only the action imports were lifted.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import type { ComponentProps } from "react";
import { VariantView } from "../components/FrameTimeline/VariantView";
import { useStores } from "../stores/context";

type OwnProps = Omit<
  ComponentProps<typeof VariantView>,
  | "onSelectFrame"
  | "onSelectVariantFrame"
  | "onDuplicateVariantFrame"
  | "onDeleteVariantFrame"
  | "onAddVariantFrame"
  | "onMoveVariantFrame"
  | "onReorderFrame"
  | "onReorderVariantFrame"
  | "onResizeVariant"
>;

export const VariantViewContainer = observer(function VariantViewContainer(
  props: OwnProps,
) {
  const { variants, timelineUI, frames } = useStores();
  return (
    <VariantView
      {...props}
      onSelectFrame={(id, syncVariants) =>
        timelineUI.selectFrame(id, syncVariants)
      }
      onSelectVariantFrame={(groupId, frameIndex) =>
        timelineUI.selectVariantFrame(groupId, frameIndex)
      }
      onDuplicateVariantFrame={(groupId, variantId, frameId) =>
        variants.duplicateVariantFrame(groupId, variantId, frameId)
      }
      onDeleteVariantFrame={(groupId, variantId, frameId) =>
        variants.deleteVariantFrame(groupId, variantId, frameId)
      }
      onAddVariantFrame={(groupId, variantId, copyPrevious) =>
        variants.addVariantFrame(groupId, variantId, copyPrevious)
      }
      onMoveVariantFrame={(groupId, variantId, frameId, direction) =>
        variants.moveVariantFrame(groupId, variantId, frameId, direction)
      }
      onReorderFrame={(frameId, toIndex) =>
        frames.reorderFrame(frameId, toIndex)
      }
      onReorderVariantFrame={(groupId, variantId, frameId, toIndex) =>
        variants.reorderVariantFrame(groupId, variantId, frameId, toIndex)
      }
      onResizeVariant={(groupId, variantId, width, height, anchor) =>
        variants.resizeVariant(groupId, variantId, width, height, anchor)
      }
    />
  );
});
