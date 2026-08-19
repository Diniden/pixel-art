/**
 * FrameTagsModalContainer (REFRESH task 25).
 *
 * `FrameTagsModal` is **the reference example in this codebase**: it is the
 * only component that already uses selector-style subscriptions
 * (`useEditorStore((s) => s.project)` at `:40-45`) rather than destructuring
 * the whole store. That is exactly the read granularity `observer()` gives
 * for free, which is why it is the cheapest of the six to purify later.
 *
 * Two of its five members (`addFrameTag`, `removeFrameTag`) are migrated to
 * `FrameStore` by this task; the two `*VariantFrameTag` actions belong to
 * `VariantStore` (task 28).
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { FrameTagsModal } from "../components/FrameTagsModal/FrameTagsModal";
import type { ComponentProps } from "react";

export const FrameTagsModalContainer = observer(
  function FrameTagsModalContainer(
    props: ComponentProps<typeof FrameTagsModal>,
  ) {
    return <FrameTagsModal {...props} />;
  },
);
