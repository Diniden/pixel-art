import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings } from "lucide-react";
import { Panel } from "./Panel";
import { IconButton } from "../IconButton/IconButton";

const meta = {
  title: "Primitives/Panel",
  component: Panel,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `panel` (`styles/blocks/panel.css`, task 18): " +
          "`panel__header[--stacked|--compact] > panel__title`, " +
          "`panel__body[--stack|--dense]`. Replaces the 12 measured sites " +
          "whose header markup disagreed on nesting (LightingStudioPanel " +
          "used both forms in one file); this component always renders the " +
          "container form.",
      },
    },
  },
  args: {
    title: "Layers",
    children: "Panel body content.",
  },
  argTypes: {
    headerVariant: {
      control: "select",
      options: ["default", "stacked", "compact"],
    },
    bodyVariant: { control: "select", options: ["default", "stack", "dense"] },
    headerActions: { control: false },
  },
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every header × body variant combination is reachable via controls. */
export const Playground: Story = {
  render: (args) => (
    <div style={{ width: 260 }}>
      <Panel {...args} />
    </div>
  ),
};

/** Header actions sit after the title in the header row. */
export const WithHeaderActions: Story = {
  render: () => (
    <div style={{ width: 260 }}>
      <Panel
        title="Color"
        headerActions={<IconButton icon={Settings} label="Palette settings" />}
      >
        Body content.
      </Panel>
    </div>
  ),
};

/** LayerPanel's `--stacked` header: column layout, full-width title. */
export const StackedHeader: Story = {
  render: () => (
    <div style={{ width: 260 }}>
      <Panel
        title="Layers"
        headerVariant="stacked"
        headerActions={
          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            3 visible
          </span>
        }
      >
        Body content.
      </Panel>
    </div>
  ),
};

/** PixelStudioPanel's `--compact` header + `--dense` body. */
export const CompactDense: Story = {
  render: () => (
    <div style={{ width: 200 }}>
      <Panel title="Tools" headerVariant="compact" bodyVariant="dense">
        <span>tool grid</span>
        <span>brush size</span>
      </Panel>
    </div>
  ),
};
