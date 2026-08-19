/**
 * VariantViewContainer (REFRESH task 25).
 *
 * The other cheap win: like `FramesView`, every read arrives as a prop and
 * all 9 store members are ACTIONS (`selectFrame`, `selectVariantFrame`,
 * `duplicateVariantFrame`, `deleteVariantFrame`, `addVariantFrame`,
 * `moveVariantFrame`, `reorderFrame`, `reorderVariantFrame`,
 * `resizeVariant`).
 *
 * Two of them (`selectFrame`, `reorderFrame`) are migrated by this task;
 * the six `*VariantFrame*` actions belong to `VariantStore` (task 28), which
 * is precisely why this container exists now rather than later — the seam has
 * to be in place before the variant slice moves.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { VariantView } from "../components/FrameTimeline/VariantView";
import type { ComponentProps } from "react";

export const VariantViewContainer = observer(function VariantViewContainer(
  props: ComponentProps<typeof VariantView>,
) {
  return <VariantView {...props} />;
});
