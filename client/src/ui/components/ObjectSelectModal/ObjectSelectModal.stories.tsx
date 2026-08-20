/**
 * ObjectSelectModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. The spec calls this "the single easiest purification
 * in the codebase" — one store member (`project`) — and task 23 already gave
 * it a container. These stories render it from fixtures alone.
 *
 * ⚠️ `modalHost` is required — `position: fixed`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectSelectModal } from "./ObjectSelectModal";
import { projectTypical, makeEmptyObject } from "../../../fixtures";
import modalHost from "../../../../.storybook/decorators/modalHost";

const objects = projectTypical.objects;

const meta = {
  component: ObjectSelectModal,
  decorators: [modalHost],
  args: {
    onSelect: fn(),
    onClose: fn(),
    objects,
    variants: projectTypical.variants,
    selectedObjectId: objects[0]?.id ?? null,
    currentObjectId: objects[0]?.id ?? null,
  },
} satisfies Meta<typeof ObjectSelectModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: a project with no objects at all. */
export const NoObjects: Story = {
  args: { objects: [], selectedObjectId: null, currentObjectId: null },
};

/** TYPICAL: the shared fixture project. */
export const Typical: Story = {};

/**
 * The "current" marker and the selection are DIFFERENT objects — the case
 * that catches a component which conflates the two.
 */
export const SelectionDiffersFromCurrent: Story = {
  args: {
    selectedObjectId: objects[1]?.id ?? null,
    currentObjectId: objects[0]?.id ?? null,
  },
};

/** EDGE: many objects with long names, to exercise scrolling and truncation. */
export const ManyLongNames: Story = {
  args: {
    objects: Array.from({ length: 24 }, (_, i) =>
      makeEmptyObject(
        `obj-${i}`,
        `Heavy Assault Walker — variant rig mk ${i + 1} (long name)`,
      ),
    ),
    selectedObjectId: "obj-3",
    currentObjectId: "obj-0",
  },
};
