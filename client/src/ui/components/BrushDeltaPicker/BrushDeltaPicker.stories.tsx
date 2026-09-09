/**
 * BrushDeltaPicker stories (Brush Studio plan, task 14). **No store provider.**
 *
 * One story per channel type, plus `Disabled` and `NoLayer`. The `Interactive`
 * story holds the delta in local state so dragging a slider visibly updates
 * the swatch — that is manual check 1 ("dragging a slider updates the
 * swatch"); check 2 is typing −300 into a number box and blurring: it clamps
 * to −255.
 *
 * Edge/Fill (follow-ups task 05): `EdgeActive`, `FillActive` and `WithSwap`
 * show the tab row; `Interactive` keeps BOTH slots and the target in local
 * state, so the owner's manual checks — tabs switch, the tab swatches follow
 * the sliders, swap exchanges them — are all on one story.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  BrushDeltaPicker,
  type BrushDeltaPickerProps,
  type BrushDeltaTarget,
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

const EDGE_DELTA: BrushDelta = [120, -60, 0, 255];
const FILL_DELTA: BrushDelta = [-90, 40, 200, 128];

export const EdgeActive: Story = {
  name: "Edge active (tab row, no swap)",
  args: {
    channelType: "rgb",
    value: EDGE_DELTA,
    target: "edge",
    onTargetChange: fn(),
    edgeValue: EDGE_DELTA,
    fillValue: FILL_DELTA,
  },
};

export const FillActive: Story = {
  name: "Fill active (tab row, no swap)",
  args: {
    channelType: "rgb",
    value: FILL_DELTA,
    target: "fill",
    onTargetChange: fn(),
    edgeValue: EDGE_DELTA,
    fillValue: FILL_DELTA,
  },
};

export const WithSwap: Story = {
  name: "With swap button",
  args: {
    channelType: "rgb",
    value: EDGE_DELTA,
    target: "edge",
    onTargetChange: fn(),
    edgeValue: EDGE_DELTA,
    fillValue: FILL_DELTA,
    onSwap: fn(),
  },
};

/**
 * Holds both slots and the target locally. `value` is always the slot named
 * by `target` — the same resolution the container performs.
 */
function InteractivePicker(props: BrushDeltaPickerProps) {
  const [edge, setEdge] = useState<BrushDelta>(props.edgeValue ?? props.value);
  const [fill, setFill] = useState<BrushDelta>(props.fillValue ?? props.value);
  const [target, setTarget] = useState<BrushDeltaTarget>(
    props.target ?? "edge",
  );
  const setActive = target === "edge" ? setEdge : setFill;
  return (
    <BrushDeltaPicker
      {...props}
      value={target === "edge" ? edge : fill}
      target={target}
      edgeValue={edge}
      fillValue={fill}
      onTargetChange={(next) => {
        props.onTargetChange?.(next);
        setTarget(next);
      }}
      onSwap={() => {
        props.onSwap?.();
        setEdge(fill);
        setFill(edge);
      }}
      onChange={(index, next) => {
        props.onChange(index, next);
        setActive((prev) => {
          const copy: BrushDelta = [...prev];
          copy[index] = next;
          return copy;
        });
      }}
      onReset={() => {
        props.onReset();
        setActive([0, 0, 0, 0]);
      }}
    />
  );
}

export const Interactive: Story = {
  name: "Interactive (tabs, sliders, swap)",
  args: {
    channelType: "hsl",
    value: EDGE_DELTA,
    target: "edge",
    onTargetChange: fn(),
    edgeValue: EDGE_DELTA,
    fillValue: FILL_DELTA,
    onSwap: fn(),
  },
  render: (args) => <InteractivePicker {...args} />,
};
