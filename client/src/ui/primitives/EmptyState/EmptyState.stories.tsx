import type { Meta, StoryObj } from "@storybook/react-vite";
import { Layers, Palette } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Icon } from "../Icon/Icon";
import { Button } from "../Button/Button";

const meta = {
  title: "Primitives/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `empty-state` (primitive-local): `empty-state > " +
          "__icon + __text`. The styling measured DEFINED IDENTICALLY in " +
          "LayerPanel.css, ObjectLibrary.css and PaletteManager.css, " +
          "extracted once.",
      },
    },
  },
  args: {
    children: "No layers yet.",
  },
  argTypes: {
    icon: { control: false },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <Icon icon={Layers} size={20} />,
    children: "No layers yet. Add one to start drawing.",
  },
};

/** Composed with an action, the common in-panel arrangement. */
export const WithAction: Story = {
  render: () => (
    <div
      style={{
        width: 240,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <EmptyState icon={<Icon icon={Palette} size={20} />}>
        <div style={{ marginBottom: 12 }}>No palettes saved.</div>
        <Button variant="primary">Create palette</Button>
      </EmptyState>
    </div>
  ),
};
