/**
 * NormalPicker stories (REFRESH task 36, W27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE POINT OF THESE STORIES: THE FIELD IS A PROP NOW
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This widget drives EITHER `selectedNormal` (what the pencil stamps) OR
 * `lightDirection` (where the preview light comes from). Task 27 warned that
 * wiring the wrong one is INVISIBLE — the picker looks and behaves correctly,
 * the two settings just start tracking each other.
 *
 * Before task 36 the component chose the field itself off `isLightDirection`.
 * Now the container passes `normal` + `onNormalChange` directly, so the
 * mistake is structurally impossible rather than merely tested.
 * `isLightDirection` survives as PRESENTATION only: header label and
 * indicator colour (amber `#f59e0b` vs cyan `#00d9ff`).
 *
 * The two stories below therefore differ ONLY in colour and label — never in
 * which state they touch. That is the invariant.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NormalPicker } from "./NormalPicker";

const meta = {
  component: NormalPicker,
  args: {
    normal: { x: 0, y: 0, z: 255 },
    onNormalChange: fn(),
  },
} satisfies Meta<typeof NormalPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TYPICAL: the selected-normal picker, pointing straight out of the screen. */
export const SelectedNormal: Story = {};

/** The SAME widget in light-direction dress — amber, different header. */
export const LightDirection: Story = {
  args: {
    isLightDirection: true,
    normal: { x: -64, y: -64, z: 180 },
  },
};

/** Scroll-wheel adjustment enabled (the lighting studio panel's variant). */
export const WithScrollControl: Story = {
  args: { enableScrollControl: true },
};

/**
 * EDGE: a normal on the rim of the unit sphere (z ≈ 0). The indicator sits at
 * the circle's edge, which is where clamping bugs show up.
 */
export const EdgeOfSphere: Story = {
  args: { normal: { x: 127, y: 0, z: 0 } },
};

/** EDGE: pointing down-left, to confirm both axes are signed correctly. */
export const DownLeft: Story = {
  args: { normal: { x: -90, y: 90, z: 120 } },
};
