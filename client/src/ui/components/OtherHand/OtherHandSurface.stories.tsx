import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OtherHandSurface } from "./OtherHandSurface";
import { ColorModelExtras } from "./ColorModelExtras";
import type { OtherHandSurfacePosition } from "./otherHandGeometry";
import type { ThumbWidgetSpec } from "./thumbWidgets";

/**
 * The surface fills a RAIL, so a story needs a stand-in rail of realistic
 * proportions — an iPad-landscape right rail is roughly 320×760.
 */
function RailFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 320,
        height: 760,
        display: "flex",
        flexDirection: "column",
        padding: 8,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
      }}
    >
      {children}
    </div>
  );
}

function usePositions() {
  const [positions, setPositions] = useState<
    Record<string, OtherHandSurfacePosition>
  >({});
  return {
    positions,
    onPositionChange: (id: string, pos: OtherHandSurfacePosition) =>
      setPositions((p) => ({ ...p, [id]: pos })),
    onResetPositions: () => setPositions({}),
  };
}

const meta: Meta<typeof OtherHandSurface> = {
  title: "Components/OtherHandSurface",
  component: OtherHandSurface,
  decorators: [
    (Story) => (
      <RailFrame>
        <Story />
      </RailFrame>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof OtherHandSurface>;

function PencilDemo() {
  const [size, setSize] = useState(4);
  const [shape, setShape] = useState<"circle" | "square">("square");
  const [max, setMax] = useState<8 | 16 | 32 | 64 | 128>(16);
  const layout = usePositions();
  const widgets: ThumbWidgetSpec[] = [
    {
      kind: "slider",
      id: "size",
      label: "Size",
      value: size,
      min: 1,
      max,
      onChange: setSize,
    },
    {
      kind: "buttons",
      id: "shape",
      label: "Shape",
      buttons: [
        {
          id: "circle",
          label: "⭕",
          active: shape === "circle",
          onClick: () => setShape("circle"),
        },
        {
          id: "square",
          label: "⬜",
          active: shape === "square",
          onClick: () => setShape("square"),
        },
      ],
    },
    {
      kind: "buttons",
      id: "max",
      label: "Max",
      buttons: ([8, 16, 32, 64, 128] as const).map((n) => ({
        id: String(n),
        label: String(n),
        active: max === n,
        onClick: () => setMax(n),
      })),
    },
  ];
  return (
    <OtherHandSurface
      title="Pencil"
      widgets={widgets}
      {...layout}
      onExit={() => {}}
    />
  );
}

export const Pencil: Story = { render: () => <PencilDemo /> };

function ColorDemo() {
  const [hsl, setHsl] = useState({ h: 200, s: 80, l: 50 });
  const [alpha, setAlpha] = useState(255);
  const [model, setModel] = useState<"hsl" | "rgb">("hsl");
  const [includeAlpha, setIncludeAlpha] = useState(false);
  const layout = usePositions();
  const widgets: ThumbWidgetSpec[] = [
    {
      kind: "slider",
      id: "h",
      label: "H",
      value: hsl.h,
      min: 0,
      max: 360,
      trackBackground:
        "linear-gradient(to top, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
      onChange: (h) => setHsl({ ...hsl, h }),
    },
    {
      kind: "slider",
      id: "s",
      label: "S",
      value: hsl.s,
      min: 0,
      max: 100,
      trackBackground: `linear-gradient(to top, hsl(${hsl.h},0%,${hsl.l}%), hsl(${hsl.h},100%,${hsl.l}%))`,
      onChange: (s) => setHsl({ ...hsl, s }),
    },
    {
      kind: "slider",
      id: "l",
      label: "L",
      value: hsl.l,
      min: 0,
      max: 100,
      trackBackground: `linear-gradient(to top, hsl(${hsl.h},${hsl.s}%,0%), hsl(${hsl.h},${hsl.s}%,50%), hsl(${hsl.h},${hsl.s}%,100%))`,
      onChange: (l) => setHsl({ ...hsl, l }),
    },
  ];
  if (includeAlpha) {
    widgets.push({
      kind: "slider",
      id: "a",
      label: "A",
      value: alpha,
      min: 0,
      max: 255,
      onChange: setAlpha,
    });
  }
  return (
    <OtherHandSurface
      title="Color"
      widgets={widgets}
      {...layout}
      onExit={() => {}}
      extras={
        <ColorModelExtras
          model={model}
          onModel={setModel}
          includeAlpha={includeAlpha}
          onIncludeAlpha={setIncludeAlpha}
        />
      }
    />
  );
}

export const Color: Story = { render: () => <ColorDemo /> };

export const Empty: Story = {
  args: {
    title: "Line",
    widgets: [],
    positions: {},
    onPositionChange: () => {},
    onResetPositions: () => {},
    onExit: () => {},
    emptyMessage:
      "Line has no thumb controls. Pick another tool, or leave Other Hand Mode.",
  },
};
