/** ReviewStep stories (REFRESH task 34). No store provider. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStep, type SequenceItem } from "./ReviewStep";
import { FRAME_THUMBNAILS, GENERATED_FRAMES } from "../storyFixtures";
import "../AIInterpolateModal.css";

/** Two keyframes with three generated frames between them. */
const SEQUENCE: SequenceItem[] = [
  { type: "keyframe", base64: FRAME_THUMBNAILS[0], keyIdx: 0 },
  ...GENERATED_FRAMES.map((base64) => ({ type: "generated" as const, base64 })),
  { type: "keyframe", base64: FRAME_THUMBNAILS[7], keyIdx: 7 },
];

const animationFrames = SEQUENCE.filter((s) => s.base64).map((s) => s.base64);
const keyframeSyncFrames = (() => {
  let held = "";
  return SEQUENCE.filter((s) => s.base64).map((s) => {
    if (s.type === "keyframe") held = s.base64;
    return held;
  });
})();

const meta = {
  title: "AIInterpolate/Steps/ReviewStep",
  component: ReviewStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The generated sequence strip plus the animation preview. Shown in " +
          "`review` AND during `generating` once a pair lands, which is why " +
          "it takes the whole sequence rather than a finished flag — cells " +
          "with no base64 yet render the spinner placeholder and fill in as " +
          "jobs complete (see `PartiallyGenerated`).",
      },
    },
  },
  args: {
    sequence: SEQUENCE,
    animationFrames,
    keyframeSyncFrames,
    previewFps: 8,
    onPreviewFpsChange: () => {},
  },
} satisfies Meta<typeof ReviewStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The finished review. */
export const Default: Story = {};

/** Mid-run: two frames have not arrived, so they show the placeholder. */
export const PartiallyGenerated: Story = {
  args: {
    sequence: [
      { type: "keyframe", base64: FRAME_THUMBNAILS[0], keyIdx: 0 },
      { type: "generated", base64: GENERATED_FRAMES[0] },
      { type: "generated", base64: "" },
      { type: "generated", base64: "" },
      { type: "keyframe", base64: FRAME_THUMBNAILS[7], keyIdx: 7 },
    ],
  },
};

/** Three keyframes, two generated runs — the multi-pair strip. */
export const MultiplePairs: Story = {
  args: {
    sequence: [
      { type: "keyframe", base64: FRAME_THUMBNAILS[0], keyIdx: 0 },
      { type: "generated", base64: GENERATED_FRAMES[0] },
      { type: "generated", base64: GENERATED_FRAMES[1] },
      { type: "keyframe", base64: FRAME_THUMBNAILS[4], keyIdx: 4 },
      { type: "generated", base64: GENERATED_FRAMES[1] },
      { type: "generated", base64: GENERATED_FRAMES[2] },
      { type: "keyframe", base64: FRAME_THUMBNAILS[7], keyIdx: 7 },
    ],
  },
};

/** A single frame: the animation block is hidden below 2 frames. */
export const NoAnimation: Story = {
  args: {
    sequence: [{ type: "keyframe", base64: FRAME_THUMBNAILS[0], keyIdx: 0 }],
    animationFrames: [FRAME_THUMBNAILS[0]],
    keyframeSyncFrames: [FRAME_THUMBNAILS[0]],
  },
};
