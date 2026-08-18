import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toggle } from "./Toggle";

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `toggle` (primitive-local; the design is " +
          "RightSidebarTopControls' measured `.compact-toggle` pill): " +
          "`toggle > toggle__input + toggle__track + toggle__label`. " +
          "Replaces the 9 measured sites in 3 incompatible idioms, including " +
          "LayerColors' keyboard-INACCESSIBLE div-onClick toggles. The " +
          "control is a real `<input type=\"checkbox\" role=\"switch\">`, so " +
          "Tab + Space work natively.",
      },
    },
  },
  args: {
    checked: true,
    onChange: () => {},
    label: "Move all layers",
  },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Toggle>;

export default meta;

type Story = StoryObj<typeof meta>;

function ControlledToggle(props: { label?: string; ariaLabel?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <Toggle
      checked={checked}
      onChange={setChecked}
      {...(props.label !== undefined ? { label: props.label } : {})}
      {...(props.ariaLabel ? { ariaLabel: props.ariaLabel } : {})}
    />
  );
}

/**
 * ⌨️ THE KEYBOARD STORY — manual check 5's fix. Tab reaches the switch (the
 * focus ring projects onto the track) and Space flips it. The three
 * LayerColors toggles cannot do this today; adopting this primitive in task
 * 36 is what fixes them.
 */
export const Playground: Story = {
  render: () => <ControlledToggle label="Apply to all frames" />,
};

/** Without a visible label the accessible name comes from `ariaLabel`. */
export const Unlabelled: Story = {
  render: () => <ControlledToggle ariaLabel="Layer color visibility" />,
};

export const Disabled: Story = {
  args: { disabled: true, checked: true, label: "Locked setting" },
};

/** A settings-style stack, each switch independently keyboard-operable. */
export const Stack: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <ControlledToggle label="Show light grid" />
      <ControlledToggle label="Move all layers" />
      <ControlledToggle label="Loop playback" />
    </div>
  ),
};
