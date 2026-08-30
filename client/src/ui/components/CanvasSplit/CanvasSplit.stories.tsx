/**
 * CanvasSplit stories — one pane, two panes, and the same two panes swapped.
 *
 * No store provider of any kind: the component is pure and the stub panes are
 * inline-styled boxes (inline styles only — `scripts/check-classes.mjs` audits
 * declared-vs-referenced class names, so stubs must not introduce any).
 */
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CanvasSplit } from "./CanvasSplit";
import type { CanvasSplitPane } from "./CanvasSplit";

const stubStyle = (background: string): CSSProperties => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background,
  color: "#fff",
  font: "600 20px system-ui, sans-serif",
  minHeight: 240,
});

const fullPane: CanvasSplitPane = {
  key: "full",
  node: <div style={stubStyle("#3b5bdb")}>Full</div>,
};

const layerPane: CanvasSplitPane = {
  key: "layer",
  node: <div style={stubStyle("#2b8a3e")}>Layer</div>,
};

const meta: Meta<typeof CanvasSplit> = {
  title: "Components/CanvasSplit",
  component: CanvasSplit,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", height: "100vh", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CanvasSplit>;

export const Single: Story = {
  args: { panes: [fullPane] },
};

export const Dual: Story = {
  args: { panes: [fullPane, layerPane] },
};

export const DualSwapped: Story = {
  args: { panes: [layerPane, fullPane] },
};
