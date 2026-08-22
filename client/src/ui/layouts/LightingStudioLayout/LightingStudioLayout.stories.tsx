/**
 * LightingStudioLayout stories — gate 2 of REFRESH task 37, second layout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: NO STORE PROVIDER HERE EITHER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No `StoreProvider`, no `ApplicationStore`, no `installBridge`, no MobX
 * import, no decorator supplying any of them.
 *
 * ## The point of having a SECOND layout is visible by comparison
 *
 * Open this beside `Layouts/PixelStudioLayout` and count the regions. Lighting
 * mode has **four fewer** — no `CanvasInfo`, no `LayerColors`, no
 * `FrameReferencePanel`, no `ReferenceImagePanel` — and one the pixel studio
 * does not have at all, the floating `LightingPreviewPanel`. That asymmetry
 * was measured off `App.tsx:190-216`, and it is why the two layouts were not
 * merged into one parameterised layout: five of twelve props would be dead in
 * one of the two modes.
 *
 * Here the difference is a TYPE error rather than a runtime branch — there is
 * no `canvasInfo` prop to pass.
 *
 * ## What each story tests
 *
 * | Story        | Question it answers                                        |
 * | ------------ | ---------------------------------------------------------- |
 * | Empty        | the arrangement with nothing in any region                  |
 * | Typical      | the default lighting screen, preview panel floating         |
 * | Dense        | overfull sidebars scroll; the canvas still grows            |
 * | FocusMode    | ⭐ left sidebar and bottom timeline GONE, preview retained  |
 *
 * ⚠️ `previewPanel` is supplied here as a STUB, and only here. In the running
 * app the real panel mounts inside `LightingCanvasContainer` (it needs two
 * refs that exist only there), so `LightingStudioContainer` deliberately does
 * NOT pass this prop — passing it would mount the panel twice. The prop exists
 * so the arrangement is expressible in a story without standing up the whole
 * canvas container. See the layout's header.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LightingStudioLayout } from "./LightingStudioLayout";
import {
  StubCanvas,
  StubFloatingPanel,
  StubList,
  StubRegion,
  type Density,
} from "../regionStubs";

const meta = {
  title: "Layouts/LightingStudioLayout",
  component: LightingStudioLayout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LightingStudioLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every region of the lighting studio — four fewer than the pixel studio. */
function regions(density: Density) {
  return {
    header: <StubRegion label="Header" height={48} />,
    toolbar: <StubRegion label="Toolbar" height={44} />,
    objectLibrary: <StubList label="ObjectLibrary" density={density} />,
    layerPanel: <StubList label="LayerPanel" density={density} grow />,
    rightControls: <StubRegion label="RightSidebarTopControls" height={64} />,
    studioPanel: (
      <StubList label="LightingStudioPanel" density={density} grow />
    ),
    timeline: <StubRegion label="FrameTimeline" height={120} />,
    canvas: <StubCanvas label="LightingSurface" />,
    previewPanel: (
      <StubFloatingPanel label="LightingPreviewPanel" top={56} right={12} />
    ),
  };
}

export const Empty: Story = {
  args: { ...regions("empty"), focusMode: false },
};

export const Typical: Story = {
  args: { ...regions("typical"), focusMode: false },
};

export const Dense: Story = {
  args: { ...regions("dense"), focusMode: false },
};

/**
 * ⭐ Focus mode — `` ` `` in the running app.
 *
 * Compare against `Typical`: the left sidebar and the bottom timeline are
 * gone. The floating preview panel is NOT hidden by focus mode — it lives
 * inside the canvas area, which focus mode widens rather than removes.
 */
export const FocusMode: Story = {
  args: { ...regions("typical"), focusMode: true },
};
