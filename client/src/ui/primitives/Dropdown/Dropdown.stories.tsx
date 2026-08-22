import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dropdown } from "./Dropdown";

const meta = {
  title: "Primitives/Dropdown",
  component: Dropdown,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `dropdown` (primitive-local; the design is " +
          "FrameTimeline's inlined ViewModeDropdown, generalised): " +
          "`dropdown__trigger > __value + __arrow`, `dropdown__menu > " +
          "__item[--selected|--active]`. Adds what the inline version " +
          "lacked: `aria-haspopup`/`aria-expanded`, a labelled listbox with " +
          "`aria-selected`, arrow-key navigation, Enter/Space commit, Escape " +
          "close-and-refocus.",
      },
    },
  },
  args: {
    options: [
      { value: "frames", label: "Frames" },
      { value: "timeline", label: "Timeline" },
      { value: "variant", label: "Variant" },
    ],
    value: "frames",
    onChange: () => {},
    label: "View mode",
  },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Dropdown>;

export default meta;

type Story = StoryObj<typeof meta>;

function ControlledDropdown(props: {
  options: { value: string; label: string; disabled?: boolean }[];
  initial: string;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <Dropdown
      options={props.options}
      value={value}
      onChange={setValue}
      label="View mode"
    />
  );
}

/**
 * ⌨️ THE KEYBOARD STORY. Tab to the trigger; Enter/Space/ArrowDown opens;
 * arrows move the active option; Enter commits; Escape closes and refocuses
 * the trigger. The inlined legacy version was mouse-only.
 */
export const Playground: Story = {
  render: () => (
    <ControlledDropdown
      options={[
        { value: "frames", label: "Frames" },
        { value: "timeline", label: "Timeline" },
        { value: "variant", label: "Variant" },
      ]}
      initial="frames"
    />
  ),
};

/** A disabled option is skipped by keyboard navigation. */
export const WithDisabledOption: Story = {
  render: () => (
    <ControlledDropdown
      options={[
        { value: "frames", label: "Frames" },
        { value: "timeline", label: "Timeline" },
        {
          value: "variant",
          label: "Variant (no variant layer)",
          disabled: true,
        },
      ]}
      initial="timeline"
    />
  ),
};

/** Disabled trigger. */
export const Disabled: Story = {
  args: { disabled: true },
};
