import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorSwatch } from "./ColorSwatch";

const meta = {
  title: "Primitives/ColorSwatch",
  component: ColorSwatch,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `swatch` (primitive-local): `swatch[--selected] > " +
          "swatch__bg (checkerboard) + swatch__color`. Unifies the 3 " +
          "measured swatch implementations; the character-for-character " +
          "duplicated `rgba(...)` background and hex-`title` expressions " +
          "from LayerColors/ColorPicker now live here once. Channels arrive " +
          "as plain 0-255 numbers — never a domain type.",
      },
    },
  },
  args: {
    r: 0,
    g: 217,
    b: 255,
    a: 255,
    onClick: () => {},
  },
  argTypes: {
    r: { control: { type: "range", min: 0, max: 255 } },
    g: { control: { type: "range", min: 0, max: 255 } },
    b: { control: { type: "range", min: 0, max: 255 } },
    a: { control: { type: "range", min: 0, max: 255 } },
    size: { control: { type: "number", min: 12, max: 48 } },
    selected: { control: "boolean" },
  },
} satisfies Meta<typeof ColorSwatch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Half-alpha shows the checkerboard through the colour. */
export const Translucent: Story = {
  args: { r: 255, g: 51, b: 102, a: 128, size: 28 },
};

function PaletteRow() {
  const palette = [
    { r: 0, g: 217, b: 255, a: 255 },
    { r: 139, g: 92, b: 246, a: 255 },
    { r: 16, g: 185, b: 129, a: 255 },
    { r: 245, g: 158, b: 11, a: 255 },
    { r: 255, g: 51, b: 102, a: 255 },
    { r: 232, g: 232, b: 240, a: 96 },
  ];
  const [selected, setSelected] = useState(0);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {palette.map((c, i) => (
        <ColorSwatch
          key={i}
          {...c}
          selected={i === selected}
          onClick={() => setSelected(i)}
        />
      ))}
    </div>
  );
}

/**
 * ⌨️ A palette row of real buttons: Tab moves between swatches, Enter/Space
 * selects, and each announces its hex value as its name.
 */
export const PaletteRowStory: Story = {
  name: "Palette row",
  render: () => <PaletteRow />,
};
