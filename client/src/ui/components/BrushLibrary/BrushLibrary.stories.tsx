/**
 * BrushLibrary stories (Brush Studio plan, task 13). **No store provider.**
 *
 * The thumbnail is painted by a synthetic `thumbnailDraw` from
 * `storyFixtures`, exactly as the container will pass a bound
 * `renderBrushFrame` in the app — the component sees no grid either way.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrushLibrary, type BrushLibraryProps } from "./BrushLibrary";
import {
  TYPICAL_BRUSH_NAMES,
  MANY_BRUSH_NAMES,
  drawStoryBrushThumbnail,
} from "./storyFixtures";

const meta = {
  title: "Components/BrushLibrary/BrushLibrary",
  component: BrushLibrary,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The left-rail brush selector: brush file names with the current " +
          "one highlighted. Only the LOADED brush has data in memory, so only " +
          "its row shows a thumbnail and a size badge. The header `+` opens " +
          "an inline create form (name, width, height) that validates the " +
          "name client-side.",
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
    brushes: TYPICAL_BRUSH_NAMES,
    currentBrush: "Soft Round",
    currentSize: { width: 16, height: 16 },
    // Widened: `satisfies Meta` would otherwise pin this arg to the function
    // type and reject the `null` the Empty / CurrentWithoutDocument stories pass.
    thumbnailDraw:
      drawStoryBrushThumbnail as BrushLibraryProps["thumbnailDraw"],
    thumbnailRevision: 1,
    isLoading: false,
    onSelectBrush: fn(),
    onCreateBrush: fn(),
  },
} satisfies Meta<typeof BrushLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: three brushes, the last one loaded with a painted thumbnail. */
export const Typical: Story = {};

/** Empty: no brush files on disk — the `EmptyState` and the `+` only. */
export const Empty: Story = {
  args: {
    brushes: [],
    currentBrush: null,
    currentSize: null,
    thumbnailDraw: null,
  },
};

/**
 * Loading: a switch/create flow is in flight. Rows and the create form are
 * disabled and the header shows the status.
 */
export const Loading: Story = {
  args: { isLoading: true },
};

/**
 * Edge: a current brush whose document has not arrived yet — the row is
 * highlighted but carries neither a thumbnail nor a size badge.
 */
export const CurrentWithoutDocument: Story = {
  args: { currentSize: null, thumbnailDraw: null },
};

/** Edge: a long list with long names — scrolling and truncation. */
export const ManyLongNames: Story = {
  args: {
    brushes: MANY_BRUSH_NAMES,
    currentBrush: MANY_BRUSH_NAMES[5] ?? null,
    currentSize: { width: 64, height: 48 },
  },
};
