/**
 * FrameTagsModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER — and this one is the clearest demonstration in the
 * wave. The modal used to compute BOTH `currentTags` and `projectTagSections`
 * itself, in two `useMemo`s that walked every object, frame and variant in
 * the project. Those moved to `FrameTagsModalContainer` (R2), so a story now
 * hands the component two finished arrays.
 *
 * ⚠️ The object-vs-variant BRANCH also moved to the container: the component
 * calls a single `onAddTag`/`onRemoveTag` and the container decides which of
 * the four store actions that means. The `context` prop still selects the
 * TITLE, which is why both context shapes get a story.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FrameTagsModal } from "./FrameTagsModal";
import type { ProjectTagSection } from "./FrameTagsModal";
import modalHost from "../../../../.storybook/decorators/modalHost";

const SECTIONS: ProjectTagSection[] = [
  {
    key: "obj-hero",
    label: "Hero",
    items: [
      { tag: "idle", label: "Hero · #1 stand" },
      { tag: "walk", label: "Hero · #2 step" },
      { tag: "attack", label: "Hero · #4 swing" },
    ],
  },
  {
    key: "v-headwear-hat",
    label: "Headwear › Hat",
    items: [{ tag: "idle", label: "Headwear › Hat · #1" }],
  },
];

const meta = {
  component: FrameTagsModal,
  decorators: [modalHost],
  args: {
    isOpen: true,
    onClose: fn(),
    context: { type: "object", frameId: "frame-1", frameName: "stand" },
    currentTags: ["idle"],
    projectTagSections: SECTIONS,
    onAddTag: fn(),
    onRemoveTag: fn(),
  },
} satisfies Meta<typeof FrameTagsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: no tags on this frame and none anywhere in the project. */
export const NoTags: Story = {
  args: { currentTags: [], projectTagSections: [] },
};

/** TYPICAL: one tag on the frame, more available elsewhere. */
export const Typical: Story = {};

/**
 * A VARIANT frame. ⚠️ The title differs ("Variant frame tags · #N") — the
 * component still branches on `context` for that.
 */
export const VariantFrameContext: Story = {
  args: {
    context: {
      type: "variant",
      variantGroupId: "vg-headwear",
      variantId: "variant-hat",
      frameId: "vframe-1",
      frameIndex: 2,
    },
  },
};

/** An object frame with no name — the title must degrade gracefully. */
export const ObjectFrameWithoutName: Story = {
  args: { context: { type: "object", frameId: "frame-9" } },
};

/** EDGE: many tags, long names — wrapping in both the chip row and the list. */
export const ManyLongTags: Story = {
  args: {
    currentTags: Array.from({ length: 12 }, (_, i) => `long-tag-name-${i + 1}`),
    projectTagSections: Array.from({ length: 8 }, (_, s) => ({
      key: `obj-${s}`,
      label: `Object ${s + 1} with a rather long display name`,
      items: Array.from({ length: 6 }, (_, i) => ({
        tag: `tag-${s}-${i}`,
        label: `Object ${s + 1} · #${i + 1} frame name`,
      })),
    })),
  },
};

/** Closed — renders nothing. */
export const Closed: Story = {
  args: { isOpen: false },
};
