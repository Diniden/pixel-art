import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloatingPanel } from "./FloatingPanel";
import type { PercentPosition } from "../../hooks/useFloatingPanel";

const meta = {
  title: "Primitives/FloatingPanel",
  component: FloatingPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "BEM block `floating-panel` (primitive-local): `__header (drag " +
          "handle) > __title + __controls (__minimize)`, `__body`. Replaces " +
          "the 3 measured drag+minimise+%-persistence clones (LightingCanvas " +
          "preview, FrameReferencePanel, ReferenceImagePanel) on top of " +
          "`ui/hooks/useFloatingPanel`. Position persists as percentages " +
          "through `onPositionCommit` — the caller owns its OWN uiState key; " +
          "the three legacy keys stay distinct by construction.",
      },
    },
  },
  args: {
    title: "Preview",
    children: null,
    // Placeholder for the required prop; every story's render supplies a
    // real container ref.
    containerRef: { current: null },
  },
  argTypes: {
    containerRef: { control: false },
    children: { control: false },
  },
} satisfies Meta<typeof FloatingPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

function FloatingPanelDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [committed, setCommitted] = useState<PercentPosition | null>(null);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: 360,
        background: "var(--bg-primary)",
        border: "1px dashed var(--border-primary)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <FloatingPanel
        title="Lighting preview"
        containerRef={containerRef}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onPositionCommit={setCommitted}
      >
        <div
          style={{
            width: 140,
            height: 90,
            display: "grid",
            placeItems: "center",
            background: "var(--bg-primary)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
            fontSize: "0.7rem",
          }}
        >
          preview canvas
        </div>
      </FloatingPanel>
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 12,
          color: "var(--text-muted)",
          fontSize: "0.7rem",
          fontFamily: "var(--font-mono)",
        }}
      >
        {committed
          ? `committed: ${committed.topPercent.toFixed(1)}% / ${committed.leftPercent.toFixed(1)}%`
          : "drag the header, release to commit a % position"}
      </div>
    </div>
  );
}

/**
 * Drag the header to move the panel (clamped inside the container); release
 * to commit the percent position; the minimise button collapses the body
 * without starting a drag.
 */
export const Playground: Story = {
  render: () => <FloatingPanelDemo />,
};

function MinimizedDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(true);
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: 200,
        background: "var(--bg-primary)",
        border: "1px dashed var(--border-primary)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <FloatingPanel
        title="Reference"
        containerRef={containerRef}
        minimized={minimized}
        onMinimizedChange={setMinimized}
      >
        <div style={{ width: 140, height: 60 }} />
      </FloatingPanel>
    </div>
  );
}

/** Starts minimised — only the header bar renders. */
export const Minimized: Story = {
  render: () => <MinimizedDemo />,
};
