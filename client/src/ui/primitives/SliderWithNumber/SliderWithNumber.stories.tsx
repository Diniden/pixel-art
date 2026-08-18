import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SliderWithNumber } from "./SliderWithNumber";

const meta = {
  title: "Primitives/SliderWithNumber",
  component: SliderWithNumber,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM classes: `slider__row` (RESERVED by task 18, introduced by " +
          "this primitive's local stylesheet), `slider__label[--muted]`, and " +
          "the `slider`/`slider__input` family via the Slider and NumberInput " +
          "primitives. Replaces the 8 measured range+number rows " +
          "(LightControl ×4, ColorPicker ×5 — the same row twice over). One " +
          "value, one `onChange`, two synchronised views.",
      },
    },
  },
  args: {
    label: "R",
    value: 128,
    min: 0,
    max: 255,
    onChange: () => {},
  },
  argTypes: {
    thick: { control: "boolean" },
    labelMuted: { control: "boolean" },
    hue: { control: "boolean" },
  },
} satisfies Meta<typeof SliderWithNumber>;

export default meta;

type Story = StoryObj<typeof meta>;

function ChannelRows() {
  const [r, setR] = useState(0);
  const [g, setG] = useState(217);
  const [b, setB] = useState(255);
  return (
    <div style={{ display: "grid", gap: 6, width: 260 }}>
      <SliderWithNumber label="R" value={r} min={0} max={255} onChange={setR} />
      <SliderWithNumber label="G" value={g} min={0} max={255} onChange={setG} />
      <SliderWithNumber label="B" value={b} min={0} max={255} onChange={setB} />
      <div
        style={{
          height: 24,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-primary)",
          background: `rgb(${r}, ${g}, ${b})`,
        }}
      />
    </div>
  );
}

/** ⌨️ Slider arrows and typed+Entered numbers drive the same value. */
export const Playground: Story = {
  render: () => <ChannelRows />,
};

/** ColorPicker's channel-row stack — the 5-fold duplicated row. */
export const ChannelStack: Story = {
  render: () => <ChannelRows />,
};

function ThickRow() {
  const [value, setValue] = useState(60);
  return (
    <div style={{ width: 280 }}>
      <SliderWithNumber
        label="Intensity"
        labelMuted
        thick
        value={value}
        min={0}
        max={100}
        onChange={setValue}
      />
    </div>
  );
}

/** LightControl's variant: muted label, thick track, boxed input. */
export const ThickMuted: Story = {
  render: () => <ThickRow />,
};
