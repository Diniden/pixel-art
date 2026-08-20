/**
 * ZoomControls stories (REFRESH task 35). **No store provider.**
 *
 * The component imports nothing but its own stylesheet, so "renders with no
 * store provider" is structurally guaranteed here rather than asserted — the
 * same bar W24's `CanvasSurface` and W25's `LightingSurface` set.
 *
 * `onZoomChange` is wired to `fn()` so the Actions panel shows the output
 * contract: the component emits an ALREADY-STEPPED absolute zoom, never a
 * delta. Click `+` at 4x and the panel logs `6`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ZoomControls, ZOOM_MIN, ZOOM_MAX } from "./ZoomControls";

const meta = {
  title: "Components/RightSidebarTopControls/ZoomControls",
  component: ZoomControls,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The zoom stepper. Two props. Extracted from the 403-line " +
          "`RightSidebarTopControls`, which read 16 store members; each of " +
          "the four groups needs 3-5, so the split REDUCES the total prop " +
          "surface rather than relocating it.",
      },
    },
  },
  args: { onZoomChange: fn() },
} satisfies Meta<typeof ZoomControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Floor of the range: zoom-out is disabled, zoom-in is live. */
export const AtMinimum: Story = {
  args: { zoom: ZOOM_MIN },
};

/** The everyday case — both buttons live. */
export const Typical: Story = {
  args: { zoom: 8 },
};

/**
 * Edge: the ceiling, plus a FRACTIONAL zoom. Pinch-zoom writes non-integers,
 * and the readout has always rounded for display while the ± step rounds
 * first and then adds 2. 49.6 therefore reads "50x" but is still under the
 * `>= 50` cutoff, so zoom-in remains enabled — behaviour carried over
 * verbatim from the pre-split file.
 */
export const FractionalNearMaximum: Story = {
  args: { zoom: ZOOM_MAX - 0.4 },
};

/** The hard ceiling: zoom-in disabled. */
export const AtMaximum: Story = {
  args: { zoom: ZOOM_MAX },
};
