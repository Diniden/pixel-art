/** ConfigureStep stories (REFRESH task 34). No store provider. */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfigureStep, type ConfigTab } from "./ConfigureStep";
import { FRAME_THUMBNAILS } from "../storyFixtures";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Steps/ConfigureStep",
  component: ConfigureStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The keyframe strip and the settings tab. ⚠️ Thumbnails cross the " +
          "boundary as BASE64 STRINGS, never as pixel grids — R2: the " +
          "owner's real project is 300,249 cells. Frames that will be " +
          "REPLACED by generated output carry the `--between` modifier.",
      },
    },
  },
  args: {
    phase: "configure",
    frameThumbnails: FRAME_THUMBNAILS,
    sortedKeyframes: [0, 4, 7],
    isKeyframe: (idx: number) => [0, 4, 7].includes(idx),
    onFrameClick: () => {},
    activeTab: "keyframes",
    onTabChange: () => {},
    loopBack: false,
    onLoopBackChange: () => {},
    numFrames: 3,
    onNumFramesChange: () => {},
    scale: 16,
    onScaleChange: () => {},
    flowScale: 4.0,
    onFlowScaleChange: () => {},
    warningMessage:
      "5 frames between keyframes will be replaced. 6 frames will be generated.",
    isGenerating: false,
    selectedLayerName: "Base",
    onChangeLayer: () => {},
    pairJobs: [],
    completedPairs: 0,
    totalPairs: 0,
  },
} satisfies Meta<typeof ConfigureStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three keyframes chosen; the frames between them are marked for replacement. */
export const Default: Story = {};

/** No keyframes yet — no warning, nothing marked. */
export const NoKeyframes: Story = {
  args: {
    sortedKeyframes: [],
    isKeyframe: () => false,
    warningMessage: null,
  },
};

/**
 * Loop enabled: everything AFTER the last keyframe is marked for removal, and
 * the loop line is drawn by MEASURING the first/last keyframe elements after
 * layout — which is why this component owns that ref.
 */
export const LoopBack: Story = {
  args: {
    sortedKeyframes: [1, 5],
    isKeyframe: (idx: number) => [1, 5].includes(idx),
    loopBack: true,
    warningMessage:
      "3 frames between keyframes will be replaced and 2 frames after the last keyframe will be removed. 6 frames will be generated.",
  },
};

/** The settings tab. */
export const SettingsTab: Story = { args: { activeTab: "settings" } };

/** Mid-run: inputs disabled, and `GeneratingStep` renders inside the tab. */
export const Generating: Story = {
  args: {
    phase: "generating",
    isGenerating: true,
    completedPairs: 1,
    totalPairs: 2,
    pairJobs: [
      { pairIdx: 0, status: "completed" },
      { pairIdx: 1, status: "processing" },
    ],
  },
};

/** Variant mode has no layer bar — there is no layer choice to make. */
export const VariantMode: Story = {
  args: { selectedLayerName: null },
};

/** Interactive: click frames to toggle keyframes and switch tabs. */
export const Interactive: Story = {
  render: function InteractiveConfigure(args) {
    const [keys, setKeys] = useState<number[]>([0, 7]);
    const [tab, setTab] = useState<ConfigTab>("keyframes");
    const [loop, setLoop] = useState(false);
    return (
      <ConfigureStep
        {...args}
        sortedKeyframes={[...keys].sort((a, b) => a - b)}
        isKeyframe={(idx) => keys.includes(idx)}
        onFrameClick={(idx) =>
          setKeys((prev) =>
            prev.includes(idx) ? prev.filter((k) => k !== idx) : [...prev, idx],
          )
        }
        activeTab={tab}
        onTabChange={setTab}
        loopBack={loop}
        onLoopBackChange={setLoop}
      />
    );
  },
};
