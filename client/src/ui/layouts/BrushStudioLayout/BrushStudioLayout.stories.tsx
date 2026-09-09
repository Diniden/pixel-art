/**
 * BrushStudioLayout stories — brush-studio task 15, third layout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: NO STORE PROVIDER HERE EITHER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No `StoreProvider`, no `ApplicationStore`, no `installBridge`, no MobX
 * import, no decorator supplying any of them.
 *
 * ## What the stories show
 *
 * Open this beside `Layouts/PixelStudioLayout` and `Layouts/LightingStudioLayout`:
 * the arrangement is identical — same shell, same rails, same timeline slot —
 * but the left rail's top section reads **BrushLibrary** rather than
 * `ObjectLibrary`, and the two reference panels are absent. That is the
 * whole point of a third layout: the difference is a TYPE error (there is no
 * `objectLibrary` prop to pass) rather than a `mode` branch at runtime.
 *
 * | Story        | Question it answers                                        |
 * | ------------ | ---------------------------------------------------------- |
 * | Empty        | the arrangement with nothing in any region                  |
 * | Typical      | the default brush screen                                    |
 * | Dense        | overfull sidebars scroll; the canvas still grows            |
 * | FocusMode    | ⭐ left sidebar and bottom timeline GONE, right rail kept   |
 *
 * The stubs are placeholders, deliberately: a layout story verifies
 * ARRANGEMENT, and the real regions have their own stories.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrushStudioLayout } from "./BrushStudioLayout";
import { StubCanvas, StubList, StubRegion, type Density } from "../regionStubs";

const meta = {
  title: "Layouts/BrushStudioLayout",
  component: BrushStudioLayout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BrushStudioLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every region of the brush studio, one placeholder box per slot. */
function regions(density: Density) {
  return {
    header: <StubRegion label="Header" height={48} />,
    toolbar: <StubRegion label="Toolbar" height={44} />,
    brushLibrary: <StubList label="BrushLibrary" density={density} />,
    layerPanel: <StubList label="BrushLayerPanel" density={density} grow />,
    rightControls: <StubRegion label="RightSidebarTopControls" height={64} />,
    studioPanel: <StubList label="BrushDeltaPicker" density={density} grow />,
    timeline: <StubRegion label="BrushTimeline" height={120} />,
    canvas: <StubCanvas label="BrushCanvas" />,
    canvasInfo: <StubRegion label="CanvasInfo" height={28} />,
  };
}

export const Empty: Story = {
  args: {
    ...regions("empty"),
    hiddenRails: new Set<"left" | "right" | "bottom">(),
  },
};

export const Typical: Story = {
  args: {
    ...regions("typical"),
    hiddenRails: new Set<"left" | "right" | "bottom">(),
  },
};

export const Dense: Story = {
  args: {
    ...regions("dense"),
    hiddenRails: new Set<"left" | "right" | "bottom">(),
  },
};

/**
 * ⭐ Focus mode — `` ` `` in the running app.
 *
 * Compare against `Typical`: the left sidebar (brush library + layer panel)
 * and the bottom timeline are gone; the right rail and the canvas stay.
 */
export const FocusMode: Story = {
  args: {
    ...regions("typical"),
    hiddenRails: new Set<"left" | "right" | "bottom">(["left", "bottom"]),
  },
};
