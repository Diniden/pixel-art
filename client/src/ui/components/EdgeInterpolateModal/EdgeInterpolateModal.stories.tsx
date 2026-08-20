/**
 * EdgeInterpolateModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. The modal collects three numbers plus a checkbox and
 * hands them to `onConfirm`; the pixel work happens in
 * `LightingStudioToolsContainer`, which is exactly why this file can render
 * the dialog with nothing but `fn()`s.
 *
 * ⚠️ `Slider` / `SliderWithNumber` were NOT adopted here. See the deliberate
 * non-adoption note in `LightControl` — the primitive hard-codes a
 * `slider__row` wrapper with different geometry, and W26 warned specifically
 * about swapping markup for a primitive without checking the rendered result.
 * Task 36 measured it and left the three hand-rolled rows alone.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EdgeInterpolateModal } from "./EdgeInterpolateModal";
import modalHost from "../../../../.storybook/decorators/modalHost";

const meta = {
  component: EdgeInterpolateModal,
  decorators: [modalHost],
  args: {
    isOpen: true,
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof EdgeInterpolateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: closed — nothing rendered. */
export const Closed: Story = {
  args: { isOpen: false },
};

/** TYPICAL: open at its defaults, which is what the tool button produces. */
export const Typical: Story = {};
