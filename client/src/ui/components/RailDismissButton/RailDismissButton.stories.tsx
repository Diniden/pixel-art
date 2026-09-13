import type { Meta, StoryObj } from "@storybook/react-vite";
import { RailDismissButton } from "./RailDismissButton";

/**
 * The handle is `position: absolute` against its RAIL and runs that rail's
 * full edge, so a story has to supply a stand-in rail — exactly as
 * `RailLayoutOverlay`'s stories do. Without one the strip resolves against
 * the whole Storybook canvas and the composition says nothing.
 */
function RailFrame({
  children,
  width = 240,
  height = 320,
  label = "rail contents",
}: {
  children: React.ReactNode;
  width?: number;
  height?: number;
  label?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "var(--bg-secondary)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 12, color: "var(--text-muted)" }}>{label}</div>
      {children}
    </div>
  );
}

const meta = {
  title: "Components/RailDismissButton",
  component: RailDismissButton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `rail-handle`. The rail's canvas-facing border, doubling " +
          "as a drawer handle: click the edge and the rail collapses. ⚠️ It " +
          "REPLACES the rail's own 1px border (`AppShell` suppresses it via " +
          "`--has-handle`) with a 3px strip, so at rest it reads as a " +
          "slightly heavier border and nothing more. **Hover it** to see the " +
          "grip and the accent — the affordance appears only once the pointer " +
          "is on it. Where there is no hover at all (the owner's iPad) the " +
          "grip shows permanently and the strip widens to a touch target.",
      },
    },
  },
  args: { label: "Objects & Layers", edge: "left", onDismiss: () => {} },
} satisfies Meta<typeof RailDismissButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A rail placed LEFT: it collapses leftward, so the handle is on its right. */
export const PlacedLeft: Story = {
  render: (args) => (
    <RailFrame label="left-placed rail">
      <RailDismissButton {...args} edge="left" />
    </RailFrame>
  ),
};

/** A rail placed RIGHT: the handle moves to its left, facing the canvas. */
export const PlacedRight: Story = {
  render: (args) => (
    <RailFrame label="right-placed rail">
      <RailDismissButton {...args} edge="right" />
    </RailFrame>
  ),
};

/** The timeline below the canvas — its inner edge is its top. */
export const Timeline: Story = {
  render: (args) => (
    <RailFrame width={420} height={140} label="timeline">
      <RailDismissButton {...args} label="Timeline" edge="bottom" />
    </RailFrame>
  ),
};

/** The timeline flipped ABOVE the canvas — its inner edge is its bottom. */
export const TimelineFlipped: Story = {
  render: (args) => (
    <RailFrame width={420} height={140} label="timeline, flipped to the top">
      <RailDismissButton {...args} label="Timeline" edge="top" />
    </RailFrame>
  ),
};

/**
 * ⭐ All four placements together — the composition to check when the shell's
 * own border rules change.
 */
export const EveryEdge: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {(["left", "right", "bottom", "top"] as const).map((edge) => (
        <RailFrame key={edge} width={180} height={200} label={edge}>
          <RailDismissButton {...args} edge={edge} />
        </RailFrame>
      ))}
    </div>
  ),
};
