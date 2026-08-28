import type { Meta, StoryObj } from "@storybook/react-vite";
import { SaveStatusDot } from "./SaveStatusDot";

const meta = {
  title: "Components/SaveStatusDot",
  component: SaveStatusDot,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `save-status-dot`. Persistence health as one always-" +
          "present coloured dot beside the project title, replacing the " +
          "text pill that appeared and disappeared (reflowing the header " +
          "each time). Green = saved, orange = not on disk yet (scheduled " +
          "OR in flight), red = the save failed. The detail opens on CLICK, " +
          "never hover — a hover tooltip is unreachable on the iPad this " +
          "editor also runs on.",
      },
    },
  },
  args: { status: "saved" },
} satisfies Meta<typeof SaveStatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything is on disk. */
export const Saved: Story = {};

/** Freshly loaded — also green: nothing is outstanding. */
export const Idle: Story = { args: { status: "idle" } };

/** Edits are waiting out the debounce. */
export const Pending: Story = { args: { status: "pending" } };

/** The write is in flight — same orange, because it is still not on disk. */
export const Saving: Story = { args: { status: "saving" } };

/** The one state that needs the user to act. */
export const Failed: Story = {
  args: { status: "error", errorDetail: "Server returned 500." },
};

/** Saving is paused for a rename/switch/delete — explains a still dot. */
export const Suspended: Story = {
  args: { status: "pending", suspended: true },
};
