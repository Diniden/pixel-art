import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "./Slider";

const meta = {
  title: "Primitives/Slider",
  component: Slider,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM classes `slider`, `slider--thick`, `slider__hue` " +
          "(`styles/blocks/slider.css`, task 18 — the thick and hue variants " +
          "are compound selectors so they outrank reset.css's " +
          "`input[type=\"range\"]` rules, as measured). Replaces the 27 raw " +
          "range inputs. `onChange` receives the parsed number.",
      },
    },
  },
  args: {
    value: 40,
    min: 0,
    max: 100,
    step: 1,
    onChange: () => {},
    label: "Value",
  },
  argTypes: {
    thick: { control: "boolean" },
    hue: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

function ControlledSlider(props: {
  thick?: boolean;
  hue?: boolean;
  max?: number;
  initial?: number;
  label: string;
}) {
  const [value, setValue] = useState(props.initial ?? 40);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: 260 }}>
      <Slider
        value={value}
        onChange={setValue}
        min={0}
        max={props.max ?? 100}
        thick={props.thick ?? false}
        hue={props.hue ?? false}
        label={props.label}
      />
      <span
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          width: 28,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** ⌨️ Keyboard: Tab to the slider, Arrow keys move the value. */
export const Playground: Story = {
  render: () => <ControlledSlider label="Value" />,
};

/** LightControl's chunky `slider--thick` variant. */
export const Thick: Story = {
  render: () => <ControlledSlider thick label="Intensity" />,
};

/** The rainbow `slider__hue` track (0-360). */
export const Hue: Story = {
  render: () => <ControlledSlider hue max={360} initial={180} label="Hue" />,
};

export const Disabled: Story = {
  args: { disabled: true },
};
