import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toast } from "./Toast";

const meta = {
  title: "Components/Toast",
  component: Toast,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "BEM block `toast`. A brief, self-dismissing announcement over the " +
          "workspace. ⚠️ It holds NO timer — it shows whenever it is mounted, " +
          "which is what lets a story display one indefinitely; " +
          "`useTransientMessage` owns the clock in the app. It is also " +
          "`pointer-events: none`, so it can never swallow a click meant for " +
          "the canvas underneath.",
      },
    },
  },
  args: { children: "Entered focus mode. Use toolbar to get rails back." },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ⭐ The real message, shown when the first rail is collapsed. */
export const FocusMode: Story = {};

/** At the top, for a message about something below the fold. */
export const Top: Story = { args: { position: "top" } };

/** A long message — the body caps its width and wraps rather than spanning. */
export const LongMessage: Story = {
  args: {
    children:
      "A considerably longer announcement, to check that the body wraps " +
      "inside its max-width instead of stretching across the whole window.",
  },
};
