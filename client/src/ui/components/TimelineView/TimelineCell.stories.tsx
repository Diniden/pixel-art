/**
 * TimelineCell stories (REFRESH task 35). **No store provider.**
 *
 * ⚠️ The thumbnail stories paint through `draw` — a callback the story
 * supplies, exactly as `TimelineCellContainer` does in the app. That is the
 * evidence for the boundary claim: a cell can render a real thumbnail while
 * having no access whatsoever to a pixel grid, because the painting happens
 * on the caller's side of the line.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TimelineCell, TIMELINE_THUMB_SIZE } from "./TimelineCell";
import "../../../components/FrameTimeline/FrameTimeline.css";

/** A synthetic 20x20 sprite — a diagonal gradient with a transparent corner. */
function drawSprite(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x + y < size / 3) continue; // transparent corner
      const t = (x + y) / (size * 2);
      ctx.fillStyle = `rgb(${Math.round(60 + t * 180)}, ${Math.round(
        90 + t * 120,
      )}, ${Math.round(200 - t * 90)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const meta = {
  title: "Components/TimelineView/TimelineCell",
  component: TimelineCell,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One occupied grid cell. Renders a colour dot, or a thumbnail " +
          "painted by a `draw` callback through the `ThumbnailCanvas` " +
          "primitive. `memo`'d on plain props so one cell changing does not " +
          "re-render its row.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="timeline-view">
        <div className="timeline-view__grid">
          <div className="timeline-view__row timeline-view__row--even">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    frameId: "frame-1",
    layerId: "layer-1",
    rowIndex: 2,
    color: "hsl(200, 70%, 55%)",
    isVariant: false,
    isSelected: false,
    isHighlighted: false,
    showThumbnail: false,
    onSelect: fn(),
    onDragStart: fn(),
    onDragOver: fn(),
    onDrop: fn(),
    onDragEnd: fn(),
  },
} satisfies Meta<typeof TimelineCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typical: the colour-dot cell, which is what the grid shows by default. */
export const Dot: Story = {};

/** Modifier story: `--selected`. */
export const Selected: Story = {
  args: { isSelected: true },
};

/**
 * Modifier story: `--highlighted`. Set when the hovered layer HEADER matches
 * this cell's layer name, so hovering one header lights the whole row's
 * occurrences across every frame.
 */
export const Highlighted: Story = {
  args: { isHighlighted: true },
};

/** Modifier story: `--variant`. */
export const Variant: Story = {
  args: { isVariant: true, color: "hsl(320, 70%, 55%)" },
};

/**
 * Modifier story: `--with-thumbnail`. The cell is wider in this mode (28px
 * vs 24px), which is why `TimelineGrid` uses a different playhead pitch when
 * thumbnails are on.
 */
export const WithThumbnail: Story = {
  args: { showThumbnail: true, draw: drawSprite, thumbnailRevision: 1 },
};

/**
 * Edge: `showThumbnail` is true but NO `draw` was supplied — the state a cell
 * lands in when its layer has been deleted out from under it mid-render. It
 * falls back to the dot rather than rendering an empty canvas.
 */
export const ThumbnailWithoutDraw: Story = {
  args: { showThumbnail: true, draw: undefined },
};

/** Edge: selected AND highlighted AND a variant, all modifiers stacked. */
export const AllModifiers: Story = {
  args: {
    isSelected: true,
    isHighlighted: true,
    isVariant: true,
    showThumbnail: true,
    draw: drawSprite,
    thumbnailRevision: TIMELINE_THUMB_SIZE,
  },
};
