/**
 * TimelineView stories (REFRESH task 35). **No store provider.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 833 LINES, RENDERED WITHOUT A STORE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Before this task the component read 12 store members, kept a module-level
 * colour cache, installed a `window` keydown listener, walked pixel grids to
 * paint thumbnails, and imported `PreviewModal` with three domain trees. None
 * of that could be mounted in a story.
 *
 * What survives here takes an action bar's worth of props and two render
 * slots. The four non-presentational responsibilities are in
 * `TimelineViewContainer` and `containers/hooks/`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TimelineView } from "./TimelineView";
import { TimelineCell, TimelineEmptyCell } from "./TimelineCell";
import { TYPICAL, EMPTY, DENSE } from "./storyFixtures";
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

/** Stand-in for `FrameTimeline`'s real view-mode dropdown. */
const viewModeDropdown = (
  <select
    className="frame-timeline__view-mode"
    defaultValue="timeline"
    aria-label="View mode"
  >
    <option value="frames">Frames</option>
    <option value="timeline">Timeline</option>
    <option value="variant">Variant</option>
  </select>
);

const meta = {
  title: "Components/TimelineView/TimelineView",
  component: TimelineView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The action bar plus `TimelineGrid`. The preview modal is a SLOT " +
          "— the real one takes `obj`, `frames` and `variants`, whole domain " +
          "trees, and through them every pixel grid in the object.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="frame-timeline" style={{ maxWidth: 820 }}>
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
    hoveredLayerName: null,
    showThumbnails: false,
    onToggleThumbnails: fn(),
    isPlaying: false,
    onTogglePlayback: fn(),
    onOpenPreview: fn(),
    viewModeDropdown,
    newLayerName: "",
    onNewLayerNameChange: fn(),
    onAddLayer: fn(),
    canMoveUp: true,
    canMoveDown: true,
    onMoveLayerUp: fn(),
    onMoveLayerDown: fn(),
    onLayerHeaderClick: fn(),
    onLayerHeaderHover: fn(),
    renderCell,
    renderEmptyCell,
  },
} satisfies Meta<typeof TimelineView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: an object with no frames. The action bar stays — you can still name
 * and add a layer — but both move buttons are dead and there is no playhead.
 */
export const Empty: Story = {
  args: {
    grid: EMPTY.grid,
    frameIds: EMPTY.frameIds,
    maxLayers: EMPTY.maxLayers,
    layerHeaders: EMPTY.layerHeaders,
    selectedFrameIndex: -1,
    canMoveUp: false,
    canMoveDown: false,
  },
};

/** Typical: `projectTypical`'s hero object, playhead on frame 2. */
export const Typical: Story = {};

/** Playing: the play button becomes a stop square and picks up `--playing`. */
export const Playing: Story = {
  args: { isPlaying: true },
};

/** Thumbnail mode on — `--active` on the toggle, wider cells, shifted
 *  playhead. */
export const ThumbnailMode: Story = {
  args: { showThumbnails: true },
};

/** The top layer selected: move-up is disabled, move-down is live. */
export const TopLayerSelected: Story = {
  args: { canMoveUp: false, newLayerName: "Rim light" },
};

/**
 * Edge: **360 cells** — 30 frames × 12 rows with holes. The horizontal
 * scroll, the row striping across 12 rows, and the playhead at frame 24 all
 * have to survive at this size. This is the story that shows what the
 * per-cell containers are for.
 */
export const Dense360Cells: Story = {
  args: {
    grid: DENSE.grid,
    frameIds: DENSE.frameIds,
    maxLayers: DENSE.maxLayers,
    layerHeaders: DENSE.layerHeaders,
    selectedFrameIndex: 24,
    hoveredLayerName: DENSE.layerHeaders[4]?.name ?? null,
  },
};

/** A filled preview-modal slot, standing in for `PreviewModal`. */
export const WithPreviewSlot: Story = {
  args: {
    previewModal: (
      <div
        style={{
          padding: 12,
          margin: 8,
          border: "1px dashed currentColor",
          opacity: 0.7,
          fontSize: 12,
        }}
      >
        [slot] PreviewModal renders here
      </div>
    ),
  },
};
