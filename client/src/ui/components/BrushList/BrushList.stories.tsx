/**
 * BrushList stories (multi-brush plan, task 03). **No store provider.**
 *
 * Every row paints its thumbnail through a synthetic `draw` from
 * `storyFixtures`, exactly as the container will bind `renderBrushFrame`
 * per brush in the app — the component sees no grid either way.
 *
 * The manual checks live here: Typical shows three rows with thumbnails and
 * `W×H` badges and hovering a row reveals the four actions; SingleBrush
 * shows delete disabled ("Cannot delete the last brush"); WithForm opens the
 * create form, which validates the name inline.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { BrushList } from "./BrushList";
import {
  LONG_NAME_BRUSH,
  MANY_BRUSHES,
  TYPICAL_BRUSHES,
} from "./storyFixtures";

const meta = {
  title: "Components/BrushList/BrushList",
  component: BrushList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The brushes INSIDE the open project, as the left rail's top " +
          "panel: a stacked header with a `+` that opens an inline name / " +
          "W / H form, and one row per brush with a thumbnail, its name " +
          "(double-click to rename), a `W×H` badge and hover actions " +
          "(move up, move down, duplicate, delete). Delete is disabled on " +
          "the last brush. Display order is array order — index 0 on top.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    brushes: TYPICAL_BRUSHES,
    selectedBrushId: TYPICAL_BRUSHES[0].id,
    thumbnailRevision: 1,
    onSelect: fn(),
    onAdd: fn(),
    onRename: fn(),
    onDuplicate: fn(),
    onDelete: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
  },
} satisfies Meta<typeof BrushList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: three brushes of three sizes, the first selected. */
export const Typical: Story = {};

/** Edge: twelve brushes — the densest the rail gets. */
export const Many: Story = {
  args: {
    brushes: MANY_BRUSHES,
    selectedBrushId: MANY_BRUSHES[4].id,
  },
};

/** Edge: a name long enough to ellipsise; the badge and actions stay put. */
export const LongName: Story = {
  args: {
    brushes: [LONG_NAME_BRUSH, ...TYPICAL_BRUSHES],
    selectedBrushId: LONG_NAME_BRUSH.id,
  },
};

/** A project with one brush: delete is disabled, up and down both disabled. */
export const SingleBrush: Story = {
  args: {
    brushes: [TYPICAL_BRUSHES[0]],
    selectedBrushId: TYPICAL_BRUSHES[0].id,
  },
};

/** The inline create form, opened by pressing the header `+`. */
export const WithForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "New brush" }));
  },
};

/** Never happens in the app (a project always has ≥ 1 brush), but the empty copy exists. */
export const Empty: Story = {
  args: { brushes: [], selectedBrushId: null },
};
