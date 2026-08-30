/**
 * TimelineGrid stories (REFRESH task 35). **No store provider.**
 *
 * The `renderCell` prop here mounts the plain `TimelineCell`. In the app it
 * mounts a `TimelineCellContainer` — one `observer()` per cell — which is the
 * task's per-item-container requirement. The grid cannot tell the difference,
 * which is the point: it decides WHERE cells go and never what they read.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineCell, TimelineEmptyCell } from "./TimelineCell";
import { TYPICAL, EMPTY, DENSE, COLLIDING_HEADERS } from "./storyFixtures";
import type { TimelineCellData } from "./timelineTypes";
import "../FrameTimeline/FrameTimeline.css";

const renderCell = (cell: TimelineCellData) => (
  <TimelineCell
    key={`${cell.frameId}-${cell.layerId}`}
    frameId={cell.frameId}
    layerId={cell.layerId}
    rowIndex={cell.rowIndex}
    color={cell.color}
    isVariant={cell.isVariant}
    isSelected={false}
    isHighlighted={false}
    showThumbnail={false}
    onSelect={fn()}
    onDragStart={fn()}
    onDragOver={fn()}
    onDrop={fn()}
    onDragEnd={fn()}
  />
);

const renderEmptyCell = (frameId: string, rowIndex: number) => (
  <TimelineEmptyCell
    key={`${frameId}-${rowIndex}`}
    frameId={frameId}
    rowIndex={rowIndex}
    isSelected={false}
    onSelect={fn()}
    onDragOver={fn()}
    onDrop={fn()}
  />
);

const meta = {
  title: "Components/TimelineView/TimelineGrid",
  component: TimelineGrid,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The layer-header column, the playhead, and the cell grid. Cells " +
          "arrive through `renderCell` / `renderEmptyCell` slots so a pure " +
          "grid can host per-item containers without importing one.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="timeline-view" style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    grid: TYPICAL.grid,
    frameIds: TYPICAL.frameIds,
    maxLayers: TYPICAL.maxLayers,
    layerHeaders: TYPICAL.layerHeaders,
    selectedFrameIndex: 1,
    showThumbnails: false,
    hoveredLayerName: null,
    onLayerHeaderClick: fn(),
    onLayerHeaderHover: fn(),
    editingLayerName: null,
    editingLayerDraft: "",
    onStartLayerRename: fn(),
    onEditingLayerDraftChange: fn(),
    onFinishLayerRename: fn(),
    onCancelLayerRename: fn(),
    renderCell,
    renderEmptyCell,
  },
} satisfies Meta<typeof TimelineGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: no frames, no layers, no playhead (`selectedFrameIndex` -1). One
 * empty header spacer renders because `maxLayers` floors at 1.
 */
export const Empty: Story = {
  args: {
    grid: EMPTY.grid,
    frameIds: EMPTY.frameIds,
    maxLayers: EMPTY.maxLayers,
    layerHeaders: EMPTY.layerHeaders,
    selectedFrameIndex: -1,
  },
};

/** Typical: `projectTypical`'s hero object with the playhead on frame 2. */
export const Typical: Story = {};

/** A layer header hovered — `--hovered` on the header, and the matching
 *  cells across every frame pick up `--highlighted` in the real grid. */
export const HeaderHovered: Story = {
  args: { hoveredLayerName: TYPICAL.layerHeaders[0]?.name ?? null },
};

/**
 * Thumbnail mode. The cell pitch changes from 26px to 30px, so the PLAYHEAD
 * offset changes with it — the two constants have to move together or the
 * playhead drifts across the timeline.
 */
export const ThumbnailMode: Story = {
  args: { showThumbnails: true, selectedFrameIndex: 2 },
};

/**
 * Edge: three headers all wanting display row 1. The packing loop pushes the
 * second and third outward — below first, then above — and this is the only
 * story that exercises that branch.
 */
export const CollidingHeaders: Story = {
  args: { layerHeaders: COLLIDING_HEADERS },
};

/**
 * Edge: **360 cells** — 30 frames × 12 rows, every third position empty.
 * This is the scale at which one `observer` over the whole grid becomes the
 * performance bug the per-cell containers exist to prevent, and the story to
 * look at when judging the split. Row striping must still alternate cleanly
 * across all 12 rows, and the playhead must land on frame 17.
 */
export const Dense360Cells: Story = {
  args: {
    grid: DENSE.grid,
    frameIds: DENSE.frameIds,
    maxLayers: DENSE.maxLayers,
    layerHeaders: DENSE.layerHeaders,
    selectedFrameIndex: 17,
  },
};
