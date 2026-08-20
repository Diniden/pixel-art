/**
 * PixelStudioLayout stories — and the PROOF for gate 2 of REFRESH task 37.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: THESE FOUR STORIES RENDER WITH NO STORE PROVIDER OF ANY KIND
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no `StoreProvider` in this file, no `ApplicationStore`, no
 * `installBridge`, no `useEditorStore`, no MobX import and no decorator that
 * supplies any of them — `.storybook/preview.tsx` provides only CSS, MSW and a
 * full-height wrapper. If `PixelStudioLayout` or `AppShell` had kept a single
 * store read, every story below would throw on mount.
 *
 * That is the point, and it is the same argument W24 made for `CanvasSurface`:
 * `App.tsx` destructured **nine** store members and reached into
 * `project.uiState` three more times. A layout that still needed one of them
 * would be unstoryable, and "it is pure now" would be unfalsifiable. Mounting
 * it with nothing is the falsifiable version.
 *
 * ## What each story actually tests
 *
 * | Story        | Question it answers                                        |
 * | ------------ | ---------------------------------------------------------- |
 * | Empty        | does the arrangement hold with nothing in any region?       |
 * | Typical      | the default screen: 12 regions, two 320px rails             |
 * | Dense        | do overfull sidebars scroll instead of pushing the canvas?  |
 * | FocusMode    | ⭐ the left sidebar and the bottom timeline are GONE        |
 *
 * `FocusMode` is the one that can actually fail. The other three differ only
 * in how much stub furniture they hold; focus mode is a structural branch, and
 * comparing it against `Typical` is the check — two regions fewer, canvas
 * area wider, everything else identical.
 *
 * ⚠️ Regions are STUBS. See `../regionStubs.tsx` for why that is correct
 * rather than a shortcut.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PixelStudioLayout } from "./PixelStudioLayout";
import {
  StubCanvas,
  StubFloatingPanel,
  StubList,
  StubRegion,
  type Density,
} from "../regionStubs";

const meta = {
  title: "Layouts/PixelStudioLayout",
  component: PixelStudioLayout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PixelStudioLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every region of the pixel studio, filled to `density`. */
function regions(density: Density) {
  return {
    header: <StubRegion label="Header" height={48} />,
    toolbar: <StubRegion label="Toolbar" height={44} />,
    objectLibrary: <StubList label="ObjectLibrary" density={density} />,
    layerPanel: <StubList label="LayerPanel" density={density} grow />,
    rightControls: <StubRegion label="RightSidebarTopControls" height={64} />,
    studioPanel: <StubList label="PixelStudioPanel" density={density} grow />,
    timeline: <StubRegion label="FrameTimeline" height={120} />,
    canvas: <StubCanvas />,
    canvasInfo: <StubRegion label="CanvasInfo" height={28} />,
    layerColors: <StubRegion label="LayerColors" height={36} />,
    frameReferencePanel: (
      <StubFloatingPanel label="FrameReferencePanel" top={56} left={12} />
    ),
    referenceImagePanel: (
      <StubFloatingPanel label="ReferenceImagePanel" top={56} right={12} />
    ),
  };
}

export const Empty: Story = {
  args: {
    ...regions("empty"),
    focusMode: false,
    frameReferencePanelVisible: true,
  },
};

export const Typical: Story = {
  args: {
    ...regions("typical"),
    focusMode: false,
    frameReferencePanelVisible: true,
  },
};

export const Dense: Story = {
  args: {
    ...regions("dense"),
    focusMode: false,
    frameReferencePanelVisible: true,
  },
};

/**
 * ⭐ Focus mode — `` ` `` in the running app.
 *
 * Compare against `Typical`: the left sidebar and the bottom timeline are
 * absent, the canvas area is 320px wider, and the right rail is untouched.
 * Focus mode is expressed by the layout passing `AppShell` no `leftPanel` and
 * no `bottomPanel` — the shell has no `focusMode` prop and does not know the
 * concept exists.
 */
export const FocusMode: Story = {
  args: {
    ...regions("typical"),
    focusMode: true,
    frameReferencePanelVisible: true,
  },
};

/**
 * The frame-reference panel hidden — `frameReferencePanelVisible: false`.
 *
 * ⚠️ This is the resolved boolean, not the raw store field. The store's key is
 * tri-state and the app's rule is `!== false`, i.e. the panel is VISIBLE when
 * the key has never been written. That default is applied in
 * `PixelStudioContainer`, so the layout takes a plain boolean and this story
 * can express the hidden state without reproducing the fallback.
 */
export const FrameReferenceHidden: Story = {
  args: {
    ...regions("typical"),
    focusMode: false,
    frameReferencePanelVisible: false,
  },
};
