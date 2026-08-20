/**
 * Base64Thumbnail stories (REFRESH task 34).
 *
 * ⚠️ NO STORE PROVIDER, NO `installBridge`, NO MobX — see the shell's
 * `AIInterpolateModal.stories.tsx` header for why that is the point of these
 * 9 files rather than a stylistic note.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Base64Thumbnail } from "./Base64Thumbnail";
import { FRAME_THUMBNAILS } from "../storyFixtures";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Parts/Base64Thumbnail",
  component: Base64Thumbnail,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Paints a base64 PNG into a fixed square canvas with " +
          "`imageSmoothingEnabled = false`, so pixel art scales up crisp " +
          "rather than blurred. Letterboxed: aspect ratio is preserved and " +
          "the result centred.",
      },
    },
  },
  args: { base64: FRAME_THUMBNAILS[0], size: 48 },
} satisfies Meta<typeof Base64Thumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The size the keyframe strip uses. */
export const Default: Story = {};

/** Scaled up — the nearest-neighbour behaviour is obvious here. */
export const Large: Story = { args: { size: 128 } };

/** Empty base64 renders a blank canvas rather than throwing. */
export const Empty: Story = { args: { base64: "" } };

/** Every source frame, as the keyframe strip shows them. */
export const Strip: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 8 }}>
      {FRAME_THUMBNAILS.map((b64, i) => (
        <Base64Thumbnail key={i} base64={b64} size={args.size} />
      ))}
    </div>
  ),
};
