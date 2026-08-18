import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check } from "lucide-react";
import { Badge } from "./Badge";
import { Icon } from "../Icon/Icon";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `badge` (primitive-local): `badge--selected` (the 20px " +
          "circular check — measured with THREE different fills across the " +
          "legacy sheets, green winning everywhere by cascade accident; the " +
          "`tone` prop makes the choice deliberate, ready for task 21's G7) " +
          "and `badge--current` (ObjectSelectModal's blue pill, the design " +
          "that currently wins at all three `.current-badge` sites). " +
          "Positioning stays with the consumer.",
      },
    },
  },
  args: {
    variant: "selected",
    children: <Icon icon={Check} size={12} />,
  },
  argTypes: {
    variant: { control: "select", options: ["selected", "current"] },
    tone: { control: "select", options: ["green", "violet"] },
    children: { control: false },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Both `--selected` tones. Green is what renders everywhere today. */
export const SelectedTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Badge variant="selected" ariaLabel="Selected (green)">
        <Icon icon={Check} size={12} />
      </Badge>
      <Badge variant="selected" tone="violet" ariaLabel="Selected (violet)">
        <Icon icon={Check} size={12} />
      </Badge>
    </div>
  ),
};

/** The `--current` pill. */
export const Current: Story = {
  args: { variant: "current", children: "Current" },
};

/** In context: absolutely positioned by the CONSUMER on a card corner. */
export const OnCard: Story = {
  render: () => (
    <div
      style={{
        position: "relative",
        width: 96,
        height: 96,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <span style={{ position: "absolute", top: 6, right: 6 }}>
        <Badge variant="selected" ariaLabel="Selected">
          <Icon icon={Check} size={12} />
        </Badge>
      </span>
      <span style={{ position: "absolute", top: 6, left: 6 }}>
        <Badge variant="current">Current</Badge>
      </span>
    </div>
  ),
};
