import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LayoutPresetPicker } from "./LayoutPresetPicker";
import { LayoutThumbnail } from "./LayoutThumbnail";
import {
  presetsForDevice,
  applyPreset,
  type LayoutPreset,
} from "../../layout/layoutPresets";
import { DEFAULT_RAIL_LAYOUT, type RailLayout } from "../../layout/railLayout";

/**
 * The picker is `position: absolute; inset: 0` against the CANVAS AREA, so a
 * story has to supply a stand-in for it — exactly as `RailLayoutOverlay`'s
 * stories supply a stand-in rail. Without one the scrim resolves against the
 * whole Storybook canvas and the composition says nothing about how it
 * really sits inside the shell.
 */
function CanvasFrame({
  children,
  width = 760,
  height = 460,
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
        background: "var(--bg-primary)",
        border: "1px solid var(--border-primary)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 12, color: "var(--text-muted)" }}>
        canvas behind the scrim
      </div>
      {children}
    </div>
  );
}

const meta = {
  title: "Components/LayoutPresetPicker",
  component: LayoutPresetPicker,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM blocks `layout-presets` + `layout-thumb`. The overlay shown " +
          "over the CANVAS while layout mode is on — the fourth scrim, and " +
          "the only one that is not per-rail, because a preset sets all four " +
          "rails at once. Each card's thumbnail is RENDERED FROM that " +
          "preset's own `RailLayout` rather than drawn by hand, so it cannot " +
          "drift from what applying the card actually does. ⚠️ It opens " +
          "COLLAPSED, as one small button — press it in any story below to " +
          "see the grid. Layout mode's primary job is the per-rail controls, " +
          "and a wall of cards over the canvas buries them.",
      },
    },
  },
  args: {
    presets: presetsForDevice("desktop"),
    current: DEFAULT_RAIL_LAYOUT,
    activeId: "classic",
    deviceLabel: "Desktop layouts",
    onApply: () => {},
    onSaveCurrent: () => {},
    onDeletePreset: () => {},
  },
  render: (args) => (
    <CanvasFrame>
      <LayoutPresetPicker {...args} />
    </CanvasFrame>
  ),
} satisfies Meta<typeof LayoutPresetPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ⭐ The default state: one "Layout Presets" button, no scrim, the canvas
 * fully visible behind it. Press it to reach every other composition here.
 */
export const Collapsed: Story = {};

/** The desktop shortlist — wide arrangements, no grip in sight. */
export const Desktop: Story = {};

/**
 * ⭐ The iPad's shortlist, and the point of the whole split: every card is
 * named for a GRIP, because that is what the user is choosing between when
 * the device is held rather than sat on a desk.
 */
export const Tablet: Story = {
  args: {
    presets: presetsForDevice("tablet"),
    deviceLabel: "Tablet layouts",
  },
};

/** With saved layouts of the user's own — these, and only these, get a bin. */
export const WithSavedLayouts: Story = {
  args: {
    presets: [
      ...presetsForDevice("desktop"),
      {
        id: "custom-1",
        name: "Sunday Sprites",
        description: "Your saved layout.",
        custom: true,
        layout: {
          ...DEFAULT_RAIL_LAYOUT,
          left: { slot: "rightInner", scale: "large" },
          right: { slot: "rightOuter", scale: "large" },
          toolbar: { edge: "left", scale: "regular", spread: 2 },
        },
      },
    ],
    activeId: null,
  },
};

/**
 * A narrow canvas — both rails stacked on one side leaves the picker very
 * little room. The grid is `auto-fill`, so it re-columns rather than
 * overflowing.
 */
export const NarrowCanvas: Story = {
  render: (args) => (
    <CanvasFrame width={330}>
      <LayoutPresetPicker {...args} />
    </CanvasFrame>
  ),
};

/**
 * ⭐ INTERACTIVE — apply a card and watch the save card's thumbnail follow.
 *
 * This is the story that demonstrates the design claim: the thumbnails are
 * generated from the layout data, so the "Save current" preview shows the
 * arrangement you just applied without a line of per-preset artwork.
 */
export const Interactive: Story = {
  render: function Interactive(args) {
    const [layout, setLayout] = useState<RailLayout>(DEFAULT_RAIL_LAYOUT);
    const [saved, setSaved] = useState<LayoutPreset[]>([]);
    const presets = [...presetsForDevice("desktop"), ...saved];

    return (
      <CanvasFrame>
        <LayoutPresetPicker
          {...args}
          presets={presets}
          current={layout}
          activeId={null}
          onApply={(preset) => setLayout(applyPreset(layout, preset))}
          onSaveCurrent={(name) =>
            setSaved([
              ...saved,
              {
                id: `custom-${saved.length + 1}`,
                name,
                description: "Your saved layout.",
                custom: true,
                layout,
              },
            ])
          }
          onDeletePreset={(preset) =>
            setSaved(saved.filter((p) => p.id !== preset.id))
          }
        />
      </CanvasFrame>
    );
  },
};

/**
 * The thumbnail on its own, at every arrangement it has to draw — this is
 * the composition to check when the shell's own layout rules change.
 */
export const Thumbnails: StoryObj = {
  render: () => {
    const cases: [string, RailLayout][] = [
      ["Classic", DEFAULT_RAIL_LAYOUT],
      [
        "Both rails right",
        {
          ...DEFAULT_RAIL_LAYOUT,
          left: { slot: "rightInner", scale: "regular" },
          right: { slot: "rightOuter", scale: "regular" },
        },
      ],
      [
        "Toolbar left, timeline top",
        {
          ...DEFAULT_RAIL_LAYOUT,
          bottom: { edge: "top", scale: "regular" },
          toolbar: { edge: "left", scale: "regular", spread: 1 },
        },
      ],
      [
        "Huge rails",
        {
          ...DEFAULT_RAIL_LAYOUT,
          left: { slot: "leftOuter", scale: "huge" },
          right: { slot: "rightOuter", scale: "huge" },
          bottom: { edge: "bottom", scale: "huge" },
          toolbar: { edge: "right", scale: "regular", spread: 2 },
        },
      ],
      [
        "Compact, toolbar bottom",
        {
          ...DEFAULT_RAIL_LAYOUT,
          left: { slot: "leftOuter", scale: "compact" },
          right: { slot: "rightOuter", scale: "compact" },
          bottom: { edge: "bottom", scale: "compact" },
          toolbar: { edge: "bottom", scale: "regular", spread: 1 },
        },
      ],
    ];
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 150px)",
          gap: 16,
        }}
      >
        {cases.map(([name, layout]) => (
          <div key={name}>
            <LayoutThumbnail layout={layout} accent fit="standalone" />
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {name}
            </div>
          </div>
        ))}
      </div>
    );
  },
};
