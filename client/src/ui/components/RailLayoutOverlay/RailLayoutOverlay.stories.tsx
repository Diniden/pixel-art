import type { Meta, StoryObj } from "@storybook/react-vite";
import { RailLayoutOverlay } from "./RailLayoutOverlay";

/**
 * The overlay is `position: absolute; inset: 0` against its RAIL, so a story
 * has to supply a stand-in rail or the scrim resolves against the whole
 * canvas and the composition tells you nothing about how it really sits.
 */
function RailFrame({
  children,
  width = 320,
  height = 420,
}: {
  children: React.ReactNode;
  width?: number | string;
  height?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 12, color: "var(--text-muted)" }}>
        rail contents behind the scrim
      </div>
      {children}
    </div>
  );
}

const meta = {
  title: "Components/RailLayoutOverlay",
  component: RailLayoutOverlay,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `rail-overlay`. The dark scrim + controls shown over ONE " +
          "rail while layout mode is on. It renders INSIDE the rail it " +
          "controls, so it follows that rail through every slot change and " +
          "size step with no measurement and no resize listener. Side rails " +
          "get two arrows; the bottom rail gets a single flip button.",
      },
    },
  },
  args: {
    label: "Objects & Layers",
    scale: {
      onScaleUp: () => {},
      onScaleDown: () => {},
      canScaleUp: true,
      canScaleDown: true,
      step: 2,
      count: 4,
    },
    move: {
      kind: "arrows",
      onMoveLeft: () => {},
      onMoveRight: () => {},
      canMoveLeft: true,
      canMoveRight: true,
    },
  },
} satisfies Meta<typeof RailLayoutOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A side rail in the middle of the track: every control is available. */
export const SideRail: Story = {
  render: (args) => (
    <RailFrame>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/**
 * The default arrangement's left rail: it cannot go further left, and it is
 * already at the smallest-but-one size. Disabled arrows are how the clamp is
 * communicated — the alternative is a button that silently does nothing.
 */
export const AtTheEndOfTheTrack: Story = {
  args: {
    scale: {
      onScaleUp: () => {},
      onScaleDown: () => {},
      canScaleUp: true,
      canScaleDown: false,
      step: 1,
      count: 4,
    },
    move: {
      kind: "arrows",
      onMoveLeft: () => {},
      onMoveRight: () => {},
      canMoveLeft: false,
      canMoveRight: true,
    },
  },
  render: (args) => (
    <RailFrame>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/** The largest step: the grow button is spent. */
export const LargestSize: Story = {
  args: {
    scale: {
      onScaleUp: () => {},
      onScaleDown: () => {},
      canScaleUp: false,
      canScaleDown: true,
      step: 4,
      count: 4,
    },
  },
  render: (args) => (
    <RailFrame width={480}>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/**
 * The bottom rail: one flip button instead of two arrows, and the controls
 * laid out in a row because the rail is short and wide.
 */
export const BottomRail: Story = {
  args: {
    label: "Timeline",
    horizontal: true,
    move: { kind: "flip", onFlip: () => {}, edge: "bottom" },
  },
  render: (args) => (
    <RailFrame width={720} height={180}>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/** Already flipped to the top — the button offers the way back down. */
export const BottomRailAtTop: Story = {
  args: {
    label: "Timeline",
    horizontal: true,
    move: { kind: "flip", onFlip: () => {}, edge: "top" },
  },
  render: (args) => (
    <RailFrame width={720} height={180}>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/**
 * ⭐ The canvas TOOLBAR: four edge arrows in a straight line, no resize pair,
 * and no label. It locks to an edge rather than stepping through an order, it
 * is sized by its own controls so a scale step would apply to nothing, and
 * its rail is 36px tall — which is why the arrows are a row and not a cross.
 */
export const ToolbarEdges: Story = {
  args: {
    label: "Toolbar",
    compact: true,
    scale: undefined,
    move: { kind: "edges", edge: "top", onSetEdge: () => {} },
  },
  render: (args) => (
    <RailFrame width={900} height={36}>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};

/** Docked vertically: the same row, in a narrow rail, wrapping to fit. */
export const ToolbarEdgesVertical: Story = {
  args: {
    label: "Toolbar",
    compact: true,
    scale: undefined,
    move: { kind: "edges", edge: "left", onSetEdge: () => {} },
  },
  render: (args) => (
    <RailFrame width={64} height={480}>
      <RailLayoutOverlay {...args} />
    </RailFrame>
  ),
};
