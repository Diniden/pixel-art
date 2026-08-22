import type { Meta, StoryObj } from "@storybook/react-vite";
import { X, Trash2, Copy, Settings } from "lucide-react";
import { IconButton } from "./IconButton";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `icon-btn` (primitive-local). The skin is the " +
          "13-fold-duplicated modal close button; `Modal` renders its close " +
          'control through this component with `className="modal__close"` ' +
          "(the task 18 vocabulary name). `label` is required and becomes " +
          "`aria-label` — 12 of the 13 legacy close buttons had none.",
      },
    },
  },
  args: {
    icon: X,
    label: "Close",
  },
  argTypes: {
    icon: { control: false },
    size: { control: { type: "number", min: 10, max: 24 } },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The exact rendering `Modal` uses for its header close control. */
export const AsModalClose: Story = {
  args: { className: "modal__close" },
};

/** Different icons; each carries its own accessible name. */
export const CommonActions: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <IconButton icon={X} label="Close" />
      <IconButton icon={Trash2} label="Delete" />
      <IconButton icon={Copy} label="Duplicate" />
      <IconButton icon={Settings} label="Settings" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};
