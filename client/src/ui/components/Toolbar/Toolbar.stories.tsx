/**
 * Toolbar stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. All five store members are props, and the two tool
 * groups arrive as ELEMENTS — so a story can pass plain `<div>`s and the
 * toolbar renders without any container in the tree. That substitution is the
 * proof: if `Toolbar` still imported a container, no story could do this.
 *
 * ⚠️ PRIMITIVE ADOPTION: the five bespoke portal tooltips are now the shared
 * `Tooltip` primitive. `.tooltip`'s declarations are byte-identical to the
 * `.toolbar__fixed-tooltip` they replace (task 19 built the primitive from
 * this component), so the swap is visually a no-op — but it also adds
 * KEYBOARD focus and Escape dismissal, which the hand-rolled version lacked.
 * Tab through the buttons in the story canvas to see it.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Toolbar } from "./Toolbar";

/** Stand-ins for the two tool-group CONTAINERS. */
const PixelTools = (
  <div className="toolbar__section">
    <div className="toolbar__group">
      <button className="toolbar__tool-btn toolbar__tool-btn--active">
        <span className="toolbar__tool-hotkey">1</span>
      </button>
      <button className="toolbar__tool-btn">
        <span className="toolbar__tool-hotkey">2</span>
      </button>
    </div>
  </div>
);

const LightingTools = (
  <div className="toolbar__section">
    <div className="toolbar__group">
      <button className="toolbar__tool-btn toolbar__tool-btn--active">
        <span className="toolbar__tool-hotkey">N</span>
      </button>
    </div>
  </div>
);

const meta = {
  component: Toolbar,
  args: {
    studioMode: "pixel",
    isFocusMode: false,
    isLightGrid: false,
    isFrameReferenceVisible: true,
    onSetStudioMode: fn(),
    onToggleFocusMode: fn(),
    onToggleLightGridMode: fn(),
    onToggleFrameReferencePanelVisible: fn(),
    pixelStudioTools: PixelTools,
    lightingStudioTools: LightingTools,
  },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TYPICAL: pixel studio, nothing toggled. */
export const PixelStudio: Story = {};

/**
 * Lighting mode. ⚠️ The Frame Reference button is HIDDEN here — it renders
 * only outside lighting mode. A story that never enters lighting mode would
 * not catch a regression that made it always visible.
 */
export const LightingStudio: Story = {
  args: { studioMode: "lighting" },
};

/**
 * Brush mode (brush-studio task 03). The third studio button is active with
 * its own tint; the Frame Reference button is hidden (pixel-only), and the
 * PIXEL tool group shows because the brush studio shares that tool table.
 */
export const BrushStudio: Story = {
  args: { studioMode: "brush" },
};

/** Every toggle ON — exercises all the `--active` modifiers at once. */
export const AllTogglesActive: Story = {
  args: {
    isFocusMode: true,
    isLightGrid: true,
    isFrameReferenceVisible: true,
  },
};

/**
 * EDGE: light-grid on swaps both the icon (Moon → Sun) AND the tooltip text,
 * and adds `toolbar__tool-btn--light-grid` on top of `--active`.
 */
export const LightGridModifier: Story = {
  args: { isLightGrid: true },
};

/** Frame reference hidden — the tooltip text flips to "Show Frame Reference". */
export const FrameReferenceHidden: Story = {
  args: { isFrameReferenceVisible: false },
};
