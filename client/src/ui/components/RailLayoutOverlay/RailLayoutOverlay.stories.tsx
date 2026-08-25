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
    onScaleUp: () => {},
    onScaleDown: () => {},
    canScaleUp: true,
    canScaleDown: true,
    scaleStep: 2,
    scaleCount: 4,
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
    scaleStep: 1,
    canScaleDown: false,
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
  args: { scaleStep: 4, canScaleUp: false },
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
