/**
 * PixelStudioBrushSection stories — the rail's Brush section in every state
 * (brush-scale task 13).
 *
 * No store provider of any kind: the section takes plain values and
 * callbacks, and `__tests__/PixelStudioBrushSection.dom.test.tsx` mounts every
 * story below with nothing around it, which is what proves the `ui/` boundary
 * holds.
 *
 * | Story          | What it exercises                                              |
 * | -------------- | -------------------------------------------------------------- |
 * | Loaded         | native 16×16, locked, Nearest — "Native size" disabled          |
 * | LoadedUnlocked | 24×12 on a 16×16 brush, unlocked — Scale X / Scale Y, LZ3 / BIL |
 * | PixelArtScaler | 32×32 on 16×16, locked, EPX on both axes                        |
 * | Empty          | no brush document: the idle message, no size block              |
 * | Loading        | the loading message, no size block                              |
 *
 * The loaded stories wrap the section in a `useState` holder so the sliders
 * MOVE in the canvas: it mirrors `PixelBrushUIStore`'s lock rule (locked →
 * the other side follows at the ratio in force) closely enough to review
 * the layout, and forwards every intent to the story's `fn()` spies so the
 * dom test can still assert on the calls. The rules themselves are the
 * store's and are tested there — this is a stand-in, not a second copy.
 *
 * The decorator reproduces the rail's real width: the section is a rail
 * resident and looks wrong reviewed full-bleed.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PixelStudioBrushSection } from "./PixelStudioBrushSection";
import type {
  PixelStudioBrushInfo,
  PixelStudioBrushSectionProps,
  PixelStudioBrushSizeControls,
} from "./PixelStudioBrushSection";
import { isPixelBrush2DStrategy } from "../../canvas/tools/pixelBrushScale";

const NATIVE = { width: 16, height: 16 };

/** `pixelBrushSliderMax(16×16)` = min(256, max(64, 4 × 16)) = 64. */
const SLIDER_MAX = 64;

function sizeControls(
  overrides: Partial<PixelStudioBrushSizeControls> = {},
): PixelStudioBrushSizeControls {
  return {
    width: NATIVE.width,
    height: NATIVE.height,
    nativeWidth: NATIVE.width,
    nativeHeight: NATIVE.height,
    max: SLIDER_MAX,
    lockRatio: true,
    scaleX: "nearest",
    scaleY: "nearest",
    onWidthChange: fn(),
    onHeightChange: fn(),
    onLockRatioChange: fn(),
    onScaleChange: fn(),
    onResetSize: fn(),
    ...overrides,
  };
}

function loadedInfo(size: PixelStudioBrushSizeControls): PixelStudioBrushInfo {
  return {
    loadState: "loaded",
    brushName: "soft-round",
    width: NATIVE.width,
    height: NATIVE.height,
    frameName: "Frame 1",
    frameIndex: 0,
    frameCount: 1,
    layerCount: 2,
    onOpenBrushStudio: fn(),
    size,
  };
}

function emptyInfo(
  loadState: PixelStudioBrushInfo["loadState"],
): PixelStudioBrushInfo {
  return {
    loadState,
    brushName: null,
    width: null,
    height: null,
    frameName: null,
    frameIndex: null,
    frameCount: 0,
    layerCount: 0,
    onOpenBrushStudio: fn(),
  };
}

const clamp = (n: number) => Math.min(256, Math.max(1, Math.round(n)));

/**
 * The `useState` holder. Starts from the story's `size` args and applies a
 * stand-in of the store's rules so the controls respond in the canvas.
 */
function StatefulSection(props: PixelStudioBrushSectionProps) {
  const initial = props.pixelBrush.size;
  if (!initial) return <PixelStudioBrushSection {...props} />;
  return <StatefulSize {...props} initial={initial} />;
}

function StatefulSize({
  initial,
  ...props
}: PixelStudioBrushSectionProps & { initial: PixelStudioBrushSizeControls }) {
  const [size, setSize] = useState<PixelStudioBrushSizeControls>(initial);

  const ratio = size.lockRatio ? size.height / size.width : null;
  const live: PixelStudioBrushSizeControls = {
    ...size,
    onWidthChange: (w) => {
      initial.onWidthChange(w);
      setSize((s) => ({
        ...s,
        width: clamp(w),
        height: ratio === null ? s.height : clamp(w * ratio),
      }));
    },
    onHeightChange: (h) => {
      initial.onHeightChange(h);
      setSize((s) => ({
        ...s,
        height: clamp(h),
        width: ratio === null ? s.width : clamp(h / ratio),
      }));
    },
    onLockRatioChange: (locked) => {
      initial.onLockRatioChange(locked);
      setSize((s) => ({ ...s, lockRatio: locked }));
    },
    onScaleChange: (axis, id) => {
      initial.onScaleChange(axis, id);
      setSize((s) => {
        if (isPixelBrush2DStrategy(id) || s.lockRatio) {
          return { ...s, scaleX: id, scaleY: id };
        }
        const other = axis === "x" ? s.scaleY : s.scaleX;
        const demoted = isPixelBrush2DStrategy(other) ? "nearest" : other;
        return axis === "x"
          ? { ...s, scaleX: id, scaleY: demoted }
          : { ...s, scaleY: id, scaleX: demoted };
      });
    },
    onResetSize: () => {
      initial.onResetSize();
      setSize((s) => ({ ...s, width: s.nativeWidth, height: s.nativeHeight }));
    },
  };

  return (
    <PixelStudioBrushSection
      {...props}
      pixelBrush={{ ...props.pixelBrush, size: live }}
    />
  );
}

const meta = {
  title: "Components/PixelStudioBrushSection",
  component: PixelStudioBrushSection,
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "BEM elements under `pixel-studio-panel__brush*`. The right-rail " +
          "section shown while the Brush tool is selected: the project / " +
          "size / frame / layers rows, then (with a document loaded) the " +
          "stamp-size block — W and H `SliderWithNumber`s with the ratio " +
          "lock between them, one **Scaling** dropdown while locked or " +
          "**Scale X** / **Scale Y** when free (a disabled separator " +
          "precedes the 2-D pixel-art scalers), **Native size**, and a " +
          "readout — then Open Brush Studio and the hint. Every value is " +
          "resolved by the container; every story mounts with **no store " +
          "provider**.",
      },
    },
  },
} satisfies Meta<typeof PixelStudioBrushSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  render: (args) => <StatefulSection {...args} />,
  args: {
    pixelBrush: loadedInfo(sizeControls()),
    onOtherHand: fn(),
  },
};

export const LoadedUnlocked: Story = {
  render: (args) => <StatefulSection {...args} />,
  args: {
    pixelBrush: loadedInfo(
      sizeControls({
        width: 24,
        height: 12,
        lockRatio: false,
        scaleX: "lanczos3",
        scaleY: "bilinear",
      }),
    ),
    onOtherHand: fn(),
  },
};

export const PixelArtScaler: Story = {
  render: (args) => <StatefulSection {...args} />,
  args: {
    pixelBrush: loadedInfo(
      sizeControls({
        width: 32,
        height: 32,
        scaleX: "epx",
        scaleY: "epx",
      }),
    ),
    onOtherHand: fn(),
  },
};

export const Empty: Story = {
  args: {
    pixelBrush: emptyInfo("idle"),
  },
};

export const Loading: Story = {
  args: {
    pixelBrush: emptyInfo("loading"),
  },
};
