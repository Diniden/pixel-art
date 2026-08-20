/** SelectLayerStep stories (REFRESH task 34). No store provider. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectLayerStep } from "./SelectLayerStep";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Steps/SelectLayerStep",
  component: SelectLayerStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Pick which layer's frames feed the interpolation (base mode only). " +
          "⚠️ Layer NAMES cross the boundary, never layers — R2 forbids " +
          "handing a pixel grid to a `ui/` component as a prop, and the name " +
          "is all this step needs.",
      },
    },
  },
  args: {
    layerNames: ["Base", "Outline", "Highlights"],
    selectedLayerName: null,
    onSelect: () => {},
  },
} satisfies Meta<typeof SelectLayerStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing chosen yet. */
export const Default: Story = {};

/** The `--selected` modifier. */
export const WithSelection: Story = {
  args: { selectedLayerName: "Outline" },
};

/** The empty state: every layer in the frame is a variant layer. */
export const NoLayers: Story = { args: { layerNames: [] } };
