import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  X,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Play,
  Pause,
  Layers,
  Sun,
  Maximize2,
} from "lucide-react";
import { Icon } from "./Icon";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The lucide-react wrapper, moved VERBATIM from " +
          "`components/Icon/` to `ui/primitives/Icon/` by task 19 (it was " +
          "already the codebase's only shared component). Renders the " +
          "`icon` class plus any extra `className`; size defaults to 14, " +
          "the measured house value.",
      },
    },
  },
  args: {
    icon: X,
    size: 14,
  },
  argTypes: {
    icon: { control: false },
    size: { control: { type: "number", min: 10, max: 48 } },
    strokeWidth: { control: { type: "number", min: 1, max: 4, step: 0.5 } },
  },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** A sample of the icons the editor actually uses. */
export const Gallery: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 12,
        color: "var(--text-secondary)",
        alignItems: "center",
      }}
    >
      <Icon icon={X} />
      <Icon icon={Eye} />
      <Icon icon={EyeOff} />
      <Icon icon={Trash2} />
      <Icon icon={Copy} />
      <Icon icon={Play} />
      <Icon icon={Pause} />
      <Icon icon={Layers} />
      <Icon icon={Sun} />
      <Icon icon={Maximize2} />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        color: "var(--text-secondary)",
      }}
    >
      <Icon icon={Sun} size={12} />
      <Icon icon={Sun} size={14} />
      <Icon icon={Sun} size={20} />
      <Icon icon={Sun} size={32} />
    </div>
  ),
};
