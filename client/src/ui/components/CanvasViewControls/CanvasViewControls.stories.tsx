/**
 * CanvasViewControls stories — the four shapes the cluster takes.
 *
 * No store provider of any kind: the component takes strings and callbacks,
 * and `__tests__/CanvasViewControls.dom.test.tsx` mounts every story below
 * with nothing around it, which is what proves the `ui/` boundary holds.
 *
 * | Story                    | What it exercises                               |
 * | ------------------------ | ----------------------------------------------- |
 * | ResetOnly                | today's single button — the unchanged default   |
 * | OpenOtherMode            | [open] above [reset]                            |
 * | SwapAndClose             | both panes open: [swap] [close] [reset]         |
 * | FullModeWithOffsetArrows | [open] [reset] + the ← ↑ ↓ → row to the right   |
 *
 * The block is `position: absolute` against its containing block, so each
 * story wraps it in a relative, fixed-height box that stands in for
 * `.canvas__viewport`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CanvasViewControls } from "./CanvasViewControls";

const meta = {
  title: "Components/CanvasViewControls",
  component: CanvasViewControls,
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: 320,
          height: 200,
          background: "var(--bg-primary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "BEM block `canvas-view-controls`. The floating cluster in the " +
          "bottom-left of a canvas pane: a `__stack` column (mode → close? " +
          "→ reset) and, in Full mode with a variant selected, an " +
          "`__offsets` row of arrows that nudge the variant offset like WASD " +
          "(shift-click = all frames). Every story mounts with **no store " +
          "provider**.",
      },
    },
  },
} satisfies Meta<typeof CanvasViewControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResetOnly: Story = {
  args: { onResetView: fn() },
};

export const OpenOtherMode: Story = {
  args: {
    onResetView: fn(),
    modeButton: { kind: "open", label: "Open Layer view", onClick: fn() },
  },
};

export const SwapAndClose: Story = {
  args: {
    onResetView: fn(),
    modeButton: { kind: "swap", label: "Swap panes", onClick: fn() },
    onClose: { label: "Close Full view", onClick: fn() },
  },
};

export const FullModeWithOffsetArrows: Story = {
  args: {
    onResetView: fn(),
    modeButton: { kind: "open", label: "Open Layer view", onClick: fn() },
    onNudgeOffset: fn(),
  },
};
