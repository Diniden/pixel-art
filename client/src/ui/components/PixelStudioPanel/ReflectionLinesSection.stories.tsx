/**
 * ReflectionLinesSection stories — the three states the section has.
 *
 * No store provider of any kind: the section takes plain records and
 * callbacks, and `__tests__/ReflectionLinesSection.dom.test.tsx` mounts every
 * story below with nothing around it, which is what proves the `ui/` boundary
 * holds.
 *
 * | Story      | What it exercises                                          |
 * | ---------- | ---------------------------------------------------------- |
 * | Empty      | no lines yet: the hint, the presets, no Clear all           |
 * | TwoLines   | the ordinary case — rows with ✕, Clear all, presets live    |
 * | AtCapacity | 8 lines: every preset disabled, rows and Clear all still on |
 *
 * The labels are real `describeLine()` output, so the story doubles as a check
 * that a coordinate pair fits the rail's width.
 *
 * The decorator reproduces the `.panel` card `PixelStudioPanel` wraps the
 * section in, at the rail's real width — the section is a rail resident and
 * looks wrong reviewed full-bleed.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReflectionLinesSection } from "./ReflectionLinesSection";

const meta = {
  title: "Components/ReflectionLinesSection",
  component: ReflectionLinesSection,
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <div className="panel">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Reflection</span>
          </div>
          <div className="panel__body panel__body--dense">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "BEM block `reflection-lines`. The right-rail section shown while " +
          "the Reflection tool is selected: a wrapping row of preset buttons " +
          "(Vertical, Horizontal, Both, Diagonals, All), the list of " +
          "committed guide lines each with a ✕, and Clear all. Presets are " +
          "disabled at `MAX_REFLECTION_LINES` (8). Preset GEOMETRY is not " +
          "computed here — the section emits the preset name and the " +
          "container calls `presetLines()` with the grid size. Every story " +
          "mounts with **no store provider**.",
      },
    },
  },
} satisfies Meta<typeof ReflectionLinesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    lines: [],
    atCapacity: false,
    onRemoveLine: fn(),
    onClearAll: fn(),
    onApplyPreset: fn(),
  },
};

export const TwoLines: Story = {
  args: {
    lines: [
      { id: "refl-0", label: "(16,0) → (16,32)" },
      { id: "refl-1", label: "(0,16) → (32,16)" },
    ],
    atCapacity: false,
    onRemoveLine: fn(),
    onClearAll: fn(),
    onApplyPreset: fn(),
  },
};

export const AtCapacity: Story = {
  args: {
    lines: Array.from({ length: 8 }, (_, i) => ({
      id: `refl-${i}`,
      label: `(${i},0) → (${i},32)`,
    })),
    atCapacity: true,
    onRemoveLine: fn(),
    onClearAll: fn(),
    onApplyPreset: fn(),
  },
};
