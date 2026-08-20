/**
 * SyncedAnimatedPreview stories (REFRESH task 34). No store provider.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SyncedAnimatedPreview } from "./SyncedAnimatedPreview";
import { ballFrame, FRAME_THUMBNAILS } from "../storyFixtures";
import "../AIInterpolateModal.css";

/** 22 interpolated frames — the smooth result. */
const INTERPOLATED = Array.from({ length: 22 }, (_, i) => ballFrame(i / 21));
/** The keyframe held under each — index-aligned, so the pair stays in step. */
const HELD = INTERPOLATED.map((_, i) =>
  i < 11 ? FRAME_THUMBNAILS[0] : FRAME_THUMBNAILS[7],
);

const meta = {
  title: "AIInterpolate/Parts/SyncedAnimatedPreview",
  component: SyncedAnimatedPreview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Two canvases advancing on ONE interval, so the before/after " +
          "comparison stays in step. The left canvas holds the keyframe the " +
          "currently-shown generated frame sits after; the right plays the " +
          "interpolated sequence. That pairing is what makes the added " +
          "motion legible.",
      },
    },
  },
  args: {
    newFrames: INTERPOLATED,
    oldFrames: HELD,
    size: 128,
    fps: 8,
  },
} satisfies Meta<typeof SyncedAnimatedPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The review default. */
export const Default: Story = {};

/** Fast playback — the FPS control's upper end. */
export const FastPlayback: Story = { args: { fps: 24 } };

/** A shorter "original" list: the left canvas simply stops advancing. */
export const ShorterOriginal: Story = {
  args: { oldFrames: HELD.slice(0, 5) },
};
