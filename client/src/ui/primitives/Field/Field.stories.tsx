import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "./Field";
import { NumberInput } from "../NumberInput/NumberInput";
import { Dropdown } from "../Dropdown/Dropdown";

const meta = {
  title: "Primitives/Field",
  component: Field,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `field` (primitive-local): `field[--inline] > " +
          "field__label + field__control + field__hint[--error]`. Replaces " +
          "the ~30 measured ad-hoc label+control sites — and, unlike almost " +
          "all of them, actually ASSOCIATES the label with its control " +
          "(generated id + `htmlFor`, `aria-describedby` for hint/error, " +
          "`aria-invalid` on error).",
      },
    },
  },
  args: {
    label: "Width",
    children: <input type="text" defaultValue="32" />,
  },
  argTypes: {
    children: { control: false },
    inline: { control: "boolean" },
  },
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

function NumberField(props: { error?: string; hint?: string }) {
  const [value, setValue] = useState(32);
  return (
    <Field
      label="Canvas width"
      {...(props.hint !== undefined ? { hint: props.hint } : {})}
      {...(props.error !== undefined ? { error: props.error } : {})}
    >
      <NumberInput value={value} min={1} max={512} onChange={setValue} />
    </Field>
  );
}

/** ⌨️ Clicking the label focuses the control (the generated-id wiring). */
export const Playground: Story = {};

export const WithHint: Story = {
  render: () => <NumberField hint="1-512 pixels. Resizing is destructive." />,
};

/** Error text flags the control `aria-invalid` and recolours the hint. */
export const WithError: Story = {
  render: () => <NumberField error="Width must be between 1 and 512." />,
};

function InlineFields() {
  const [mode, setMode] = useState("frames");
  const [fps, setFps] = useState(12);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Field label="View" inline>
        <Dropdown
          options={[
            { value: "frames", label: "Frames" },
            { value: "timeline", label: "Timeline" },
          ]}
          value={mode}
          onChange={setMode}
          label="View"
        />
      </Field>
      <Field label="FPS" inline>
        <NumberInput value={fps} min={1} max={60} onChange={setFps} />
      </Field>
    </div>
  );
}

/** `field--inline`: label and control on one row. */
export const Inline: Story = {
  render: () => <InlineFields />,
};
