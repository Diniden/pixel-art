import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

/**
 * The real `Button` primitive (task 19), rebuilt on the task 18 block
 * vocabulary. Task 10's proof-of-harness version (with its dead `.btn--sm`)
 * is gone; every class rendered here is declared in
 * `src/styles/blocks/btn.css` and loaded globally via `src/index.css`.
 */
const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `btn` (`styles/blocks/btn.css`, task 18). Modifiers: " +
          "`btn--lg` (size) and the skins `btn--primary`, `btn--neutral`, " +
          "`btn--ghost`, `btn--muted`, `btn--danger`, `btn--danger-outline`, " +
          "`btn--gradient`. The bare block inherits the global `button` rule " +
          "from `reset.css`. Replaces the 197 measured raw `<button>`s.",
      },
    },
  },
  args: {
    children: "Button",
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "primary",
        "neutral",
        "ghost",
        "muted",
        "danger",
        "danger-outline",
        "gradient",
      ],
    },
    size: { control: "select", options: ["md", "lg"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every variant × size combination is reachable through the controls. */
export const Playground: Story = {};

/** All eight skins, side by side. */
export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Button>Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="neutral">Neutral</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="muted">Muted</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="danger-outline">Danger outline</Button>
      <Button variant="gradient">Gradient</Button>
    </div>
  ),
};

/** `btn--lg` is the modal-footer size. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button variant="primary">Medium</Button>
      <Button variant="primary" size="lg">
        Large
      </Button>
    </div>
  ),
};

/** State the controls cannot express alongside every skin at once. */
export const Disabled: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Button disabled>Default</Button>
      <Button disabled variant="primary">
        Primary
      </Button>
      <Button disabled variant="danger">
        Danger
      </Button>
      <Button disabled variant="gradient">
        Gradient
      </Button>
    </div>
  ),
};
