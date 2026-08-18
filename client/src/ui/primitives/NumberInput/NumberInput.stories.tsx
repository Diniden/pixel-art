import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NumberInput } from "./NumberInput";

const meta = {
  title: "Primitives/NumberInput",
  component: NumberInput,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM classes `slider__input` and `slider__input--boxed` " +
          "(`styles/blocks/slider.css`, task 18 — number-input styling " +
          "belongs to the slider family). Replaces the 21 raw number inputs " +
          "and centralises the clamp that ResizeModal, PreviewModal and " +
          "ExportPreviewModal each hand-rolled: type freely while focused, " +
          "clamped commit on blur or Enter.",
      },
    },
  },
  args: {
    value: 12,
    min: 1,
    max: 60,
    step: 1,
    onChange: () => {},
    label: "FPS",
  },
  argTypes: {
    boxed: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof NumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

function ClampDemo(props: { boxed?: boolean }) {
  const [value, setValue] = useState(12);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <NumberInput
        value={value}
        onChange={setValue}
        min={1}
        max={60}
        boxed={props.boxed ?? false}
        label="FPS"
      />
      <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
        committed: {value} (clamped 1-60 on blur/Enter)
      </span>
    </div>
  );
}

/**
 * ⌨️ Keyboard: type `999`, press Enter — the value commits as 60. Arrow keys
 * step within the clamp. This is the FPS clamp duplicated verbatim at
 * PreviewModal:449 and ExportPreviewModal:506.
 */
export const Playground: Story = {
  render: () => <ClampDemo />,
};

/** LightControl's centered boxed variant. */
export const Boxed: Story = {
  render: () => <ClampDemo boxed />,
};

export const Disabled: Story = {
  args: { disabled: true },
};
