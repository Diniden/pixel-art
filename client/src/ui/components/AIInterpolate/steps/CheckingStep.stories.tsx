/** CheckingStep stories (REFRESH task 34). No store provider. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckingStep } from "./CheckingStep";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Steps/CheckingStep",
  component: CheckingStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The readiness spinner shown while the health check is in flight. " +
          "Imports NOTHING — the component that most obviously could not have " +
          "existed before the decomposition, because the check it waits on " +
          "used to be an effect in the same 1,267-line file.",
      },
    },
  },
} satisfies Meta<typeof CheckingStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
