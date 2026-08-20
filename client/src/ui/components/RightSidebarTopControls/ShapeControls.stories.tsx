/**
 * ShapeControls stories (REFRESH task 35). **No store provider.**
 *
 * The `--active` segment modifier and the checked/unchecked toggle both get
 * their own story, per the task rule that any component with a `--modifier`
 * in its BEM mapping needs a story for that modifier.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShapeControls } from "./ShapeControls";

const meta = {
  title: "Components/RightSidebarTopControls/ShapeControls",
  component: ShapeControls,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Shape mode (rectangle + ellipse), corner radius (rectangle only) " +
          "and the move-all-layers toggle (move tool only). The toggle keeps " +
          "its hand-rolled markup rather than adopting the `Toggle` " +
          "primitive — the primitive was derived FROM this markup, and " +
          "adopting it is task 36's job, not a split's.",
      },
    },
  },
  args: {
    showShapeMode: false,
    showBorderRadius: false,
    showMoveAllLayers: false,
    shapeMode: "outline",
    onShapeModeChange: fn(),
    borderRadius: 0,
    onBorderRadiusChange: fn(),
    moveAllLayers: false,
    onMoveAllLayersChange: fn(),
  },
} satisfies Meta<typeof ShapeControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: every group hidden — the fragment renders nothing. */
export const AllHidden: Story = {};

/** Typical: the ellipse case — shape mode alone, no radius. */
export const ShapeModeOnly: Story = {
  args: { showShapeMode: true, shapeMode: "outline" },
};

/**
 * Modifier story: `__segment--active` on the middle segment. The active
 * modifier is the only visual difference between the three segments, so it
 * needs to be seen on a non-first item to be trusted.
 */
export const ShapeModeFillActive: Story = {
  args: { showShapeMode: true, shapeMode: "fill" },
};

/**
 * Typical rectangle: shape mode AND the radius slider, which is the only
 * combination where two of these groups appear together in the real app.
 */
export const RectangleWithRadius: Story = {
  args: {
    showShapeMode: true,
    showBorderRadius: true,
    shapeMode: "both",
    borderRadius: 4,
  },
};

/** Edge: radius pinned to its maximum (16). */
export const RadiusAtMaximum: Story = {
  args: { showBorderRadius: true, borderRadius: 16 },
};

/** The move tool, toggle off. */
export const MoveAllLayersOff: Story = {
  args: { showMoveAllLayers: true, moveAllLayers: false },
};

/** Modifier story: the toggle in its checked state. */
export const MoveAllLayersOn: Story = {
  args: { showMoveAllLayers: true, moveAllLayers: true },
};
