/**
 * FrameTagsModalContainer (REFRESH task 25; PURIFIED task 36, W27).
 *
 * Task 25 called `FrameTagsModal` "the reference example" — the only component
 * already using selector-style subscriptions rather than destructuring the
 * whole store. That made it the cheapest of the six to purify.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE TWO TREE-WALKS LIVE HERE NOW — THAT IS THE POINT, NOT A DETAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The component used to compute `currentTags` and `projectTagSections` in two
 * `useMemo`s that scanned `project.objects` and `project.variants` — every
 * object, every frame, every variant, every tag. R2 forbids that work in
 * `ui/`, and W26 set the precedent of moving such derivations into the
 * container tier.
 *
 * They are now plain derivations inside an `observer()`, which is strictly
 * better than the `useMemo` they replace: the old memo keyed on the whole
 * `project` object, so ANY project mutation invalidated it. MobX tracks the
 * specific `tags` arrays that were read, so unrelated edits no longer
 * recompute the list.
 *
 * ⚠️ Both walks are transcribed EXACTLY, including the per-scope `Set` that
 * de-duplicates tags while keeping the FIRST frame's label, and the
 * `items.length > 0` guard that suppresses empty sections. The label formats
 * (`"${obj.name} · #${idx + 1} ${f.name}"` and
 * `"${vg.name} › ${v.name} · #${idx + 1}"`) are user-visible strings and are
 * reproduced character for character.
 *
 * ⚠️ The object-vs-variant BRANCH moved here too. The component now calls a
 * single `onAddTag` / `onRemoveTag`; this container knows which of the four
 * store actions that means, based on `context.type`.
 */
import { observer } from "mobx-react-lite";
import {
  FrameTagsModal,
  type FrameTagsContext,
  type ProjectTagSection,
} from "../ui/components/FrameTagsModal/FrameTagsModal";
import { useStores } from "../stores/context";

interface FrameTagsModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  context: FrameTagsContext;
}

export const FrameTagsModalContainer = observer(
  function FrameTagsModalContainer({
    isOpen,
    onClose,
    context,
  }: FrameTagsModalContainerProps) {
    const { domain, frames, variants } = useStores();

    // ── currentTags — transcribed from the component's first useMemo ───────
    let currentTags: string[] = [];
    if (context.type === "object") {
      const obj = domain.objects.find((o) =>
        o.frames.some((f) => f.id === context.frameId),
      );
      currentTags =
        obj?.frames.find((f) => f.id === context.frameId)?.tags ?? [];
    } else {
      const vg = domain.variants?.find((g) => g.id === context.variantGroupId);
      const v = vg?.variants.find((x) => x.id === context.variantId);
      currentTags = v?.frames.find((f) => f.id === context.frameId)?.tags ?? [];
    }

    // ── projectTagSections — transcribed from the second useMemo ───────────
    const projectTagSections: ProjectTagSection[] = [];

    for (const obj of domain.objects) {
      const seen = new Set<string>();
      const items: { tag: string; label?: string }[] = [];
      obj.frames.forEach((f, idx) => {
        (f.tags ?? []).forEach((tag) => {
          if (!seen.has(tag)) {
            seen.add(tag);
            items.push({ tag, label: `${obj.name} · #${idx + 1} ${f.name}` });
          }
        });
      });
      if (items.length > 0) {
        projectTagSections.push({
          key: `obj-${obj.id}`,
          label: obj.name,
          items,
        });
      }
    }

    if (domain.variants) {
      for (const vg of domain.variants) {
        for (const v of vg.variants) {
          const seen = new Set<string>();
          const items: { tag: string; label?: string }[] = [];
          v.frames.forEach((f, idx) => {
            (f.tags ?? []).forEach((tag) => {
              if (!seen.has(tag)) {
                seen.add(tag);
                items.push({
                  tag,
                  label: `${vg.name} › ${v.name} · #${idx + 1}`,
                });
              }
            });
          });
          if (items.length > 0) {
            projectTagSections.push({
              key: `v-${vg.id}-${v.id}`,
              label: `${vg.name} › ${v.name}`,
              items,
            });
          }
        }
      }
    }

    return (
      <FrameTagsModal
        isOpen={isOpen}
        onClose={onClose}
        context={context}
        currentTags={currentTags}
        projectTagSections={projectTagSections}
        onAddTag={(tag) => {
          if (context.type === "object") {
            frames.addFrameTag(context.frameId, tag);
          } else {
            variants.addVariantFrameTag(
              context.variantGroupId,
              context.variantId,
              context.frameId,
              tag,
            );
          }
        }}
        onRemoveTag={(tag) => {
          if (context.type === "object") {
            frames.removeFrameTag(context.frameId, tag);
          } else {
            variants.removeVariantFrameTag(
              context.variantGroupId,
              context.variantId,
              context.frameId,
              tag,
            );
          }
        }}
      />
    );
  },
);
