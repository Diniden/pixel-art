/**
 * LightingStudioPanel stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. The two children are CONTAINERS, so they arrive as
 * element props — which is exactly what lets these stories substitute plain
 * placeholders and render the panel with nothing wired up.
 *
 * ⚠️ The `?? "normals"` / `?? 128` defaults live in the CONTAINER, not here,
 * so both props are required and every story states them explicitly.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LightingStudioPanel } from "./LightingStudioPanel";

const Placeholder = ({ label }: { label: string }) => (
  <div className="panel__body">{label}</div>
);

const meta = {
  component: LightingStudioPanel,
  args: {
    brushSize: 4,
    normalBrushShape: "circle",
    editMode: "normals",
    heightBrushValue: 128,
    onBrushSizeChange: fn(),
    onNormalBrushShapeChange: fn(),
    onHeightBrushValueChange: fn(),
    normalPicker: <Placeholder label="NormalPicker (container)" />,
    lightControl: <Placeholder label="LightControl (container)" />,
  },
} satisfies Meta<typeof LightingStudioPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TYPICAL: normals mode — the normal picker is shown. */
export const NormalsMode: Story = {};

/**
 * Height mode. ⚠️ The normal picker is REPLACED by the height-value slider,
 * not merely hidden — a story that only ever renders normals mode would not
 * catch a regression in that branch.
 */
export const HeightMode: Story = {
  args: { editMode: "height" },
};

/** The square brush modifier, opposite of the default circle. */
export const SquareBrush: Story = {
  args: { normalBrushShape: "square" },
};

/** EDGE: both sliders at their extremes (brush 20, height 255). */
export const Extremes: Story = {
  args: { editMode: "height", brushSize: 20, heightBrushValue: 255 },
};

/** EDGE: height value at zero — the "erase" end of the range. */
export const ZeroHeight: Story = {
  args: { editMode: "height", heightBrushValue: 0 },
};
