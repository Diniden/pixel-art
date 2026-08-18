import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "./Tooltip";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { Maximize2 } from "lucide-react";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `tooltip` (primitive-local; the skin is Toolbar's " +
          "measured portal tooltip). The ONE shared mechanism replacing 142 " +
          "`title=` attributes and the two bespoke portal tooltips " +
          "(CopyFromModal, Toolbar). Shows on hover AND keyboard focus, " +
          "hides on Escape (WCAG 1.4.13), names the trigger via " +
          "`aria-describedby`.",
      },
    },
  },
  args: {
    content: "Focus Mode (`)",
    children: <Button>Hover or focus me</Button>,
  },
  argTypes: {
    children: { control: false },
    container: { control: false },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ⌨️ THE KEYBOARD STORY — manual check 6. Tab to the button: the tooltip
 * appears on focus, which a `title=` attribute never does. Escape dismisses
 * it without moving focus.
 */
export const Playground: Story = {};

/** The Toolbar use case: an icon-only tool button. */
export const OnToolButton: Story = {
  render: () => (
    <Tooltip content="Focus Mode (`)">
      <IconButton icon={Maximize2} label="Focus Mode" />
    </Tooltip>
  ),
};

/** A wider gap between trigger and bubble. */
export const CustomOffset: Story = {
  args: {
    offset: 20,
    children: <Button variant="ghost">Offset 20</Button>,
  },
};
