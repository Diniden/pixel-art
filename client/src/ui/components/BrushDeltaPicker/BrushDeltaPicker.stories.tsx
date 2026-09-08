/**
 * BrushDeltaPicker stories (Brush Studio plan, task 14). **No store provider.**
 *
 * One story per channel type, plus `Disabled` and `NoLayer`. The `Interactive`
 * story holds the delta in local state so dragging a slider visibly updates
 * the swatch — that is manual check 1 ("dragging a slider updates the
 * swatch"); check 2 is typing −300 into a number box and blurring: it clamps
 * to −255.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  BrushDeltaPicker,
  type BrushDeltaPickerProps,
} from "./BrushDeltaPicker";
import type { BrushDelta } from "../../../types";

const meta = {
  title: "Components/BrushDeltaPicker",
  component: BrushDeltaPicker,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Per-channel delta sliders (−255..255) with a colourised swatch. " +
          "Replaces the colour picker in brush mode. The delta is UI state: " +
          "no undo debounce, every change fires `onChange(index, value)`.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel" style={{ width: 240 }}>
        <div className="panel__body">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    channelType: "hsl",
    value: [0, 0, 0, 0],
    onChange: fn(),
    onReset: fn(),
    disabled: false,
  },
} satisfies Meta<typeof BrushDeltaPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hsl: Story = {
  args: { channelType: "hsl", value: [100, -100, 0, 255] },
};

export const Rgb: Story = {
  args: { channelType: "rgb", value: [255, 0, -255, 0] },
};

export const Normal: Story = {
  args: { channelType: "normal", value: [0, 128, 255, 0] },
};

export const Heightmap: Story = {
  args: { channelType: "heightmap", value: [-128, 0, 0, 0] },
};

export const AllZero: Story = {
  name: "All zero (mid-grey, Reset disabled)",
  args: { channelType: "rgb", value: [0, 0, 0, 0] },
};

export const Disabled: Story = {
  args: { channelType: "rgb", value: [60, -60, 120, 200], disabled: true },
};

export const NoLayer: Story = {
  name: "No layer selected",
  args: { channelType: null },
};

function InteractivePicker(props: BrushDeltaPickerProps) {
  const [value, setValue] = useState<BrushDelta>(props.value);
  return (
    <BrushDeltaPicker
      {...props}
      value={value}
      onChange={(index, next) => {
        props.onChange(index, next);
        setValue((prev) => {
          const copy: BrushDelta = [...prev];
          copy[index] = next;
          return copy;
        });
      }}
      onReset={() => {
        props.onReset();
        setValue([0, 0, 0, 0]);
      }}
    />
  );
}

export const Interactive: Story = {
  name: "Interactive (drag to update the swatch)",
  args: { channelType: "hsl", value: [40, -80, 120, 255] },
  render: (args) => <InteractivePicker {...args} />,
};
