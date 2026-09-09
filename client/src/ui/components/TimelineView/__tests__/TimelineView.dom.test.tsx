/**
 * TimelineView — the `minRows` floor contract (docs/11-brush-studio-followups
 * task 01).
 *
 * The brush studio's bottom rail is content-sized, so a one-layer brush used
 * to collapse it to a single 32px row. `minRows` is the opt-in floor: it puts
 * the `timeline-view--min-rows` modifier on the root and the row count in the
 * `--timeline-min-rows` custom property, which `FrameTimeline.css` turns into
 * a `min-height` on the scroll area. jsdom does not lay out, so these tests
 * assert the class and the property — never pixel heights — and that a
 * timeline WITHOUT the prop (the pixel studio's) carries neither.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TimelineView, type TimelineViewProps } from "../TimelineView";
import type { TimelineCellData } from "../timelineTypes";

const noop = () => {};

const ONE_CELL: TimelineCellData = {
  frameId: "frame-1",
  frameIndex: 0,
  layerId: "layer-1",
  layerName: "Base",
  rowIndex: 0,
  isVariant: false,
  color: "hsl(200, 70%, 55%)",
};

function baseProps(): TimelineViewProps {
  return {
    grid: [[ONE_CELL]],
    frameIds: ["frame-1"],
    maxLayers: 1,
    selectedFrameIndex: 0,
    layerHeaders: [
      {
        name: "Base",
        firstDisplayRow: 0,
        typicalRow: 0,
        color: ONE_CELL.color,
      },
    ],
    hoveredLayerName: null,
    showThumbnails: false,
    onToggleThumbnails: noop,
    isPlaying: false,
    onTogglePlayback: noop,
    onOpenPreview: noop,
    viewModeDropdown: <span>Timeline</span>,
    onAddLayer: noop,
    canMoveUp: false,
    canMoveDown: false,
    onMoveLayerUp: noop,
    onMoveLayerDown: noop,
    onLayerHeaderClick: noop,
    onLayerHeaderHover: noop,
    editingLayerName: null,
    editingLayerDraft: "",
    onStartLayerRename: noop,
    onEditingLayerDraftChange: noop,
    onFinishLayerRename: noop,
    onCancelLayerRename: noop,
    renderCell: (cell) => (
      <div key={`${cell.frameId}-${cell.layerId}`} data-testid="cell" />
    ),
    renderEmptyCell: (frameId, rowIndex) => (
      <div key={`${frameId}-${rowIndex}`} data-testid="empty-cell" />
    ),
  };
}

function renderView(overrides: Partial<TimelineViewProps> = {}) {
  const { container } = render(
    <TimelineView {...baseProps()} {...overrides} />,
  );
  const root = container.querySelector<HTMLElement>(".timeline-view");
  if (!root) throw new Error("timeline-view root not rendered");
  return root;
}

describe("TimelineView minRows floor", () => {
  it("with minRows={5} sets the modifier class and the custom property", () => {
    const root = renderView({ minRows: 5 });
    expect(root.classList.contains("timeline-view--min-rows")).toBe(true);
    expect(root.style.getPropertyValue("--timeline-min-rows")).toBe("5");
  });

  it("without minRows carries neither the modifier nor the property", () => {
    const root = renderView();
    expect(root.classList.contains("timeline-view--min-rows")).toBe(false);
    expect(root.style.getPropertyValue("--timeline-min-rows")).toBe("");
    expect(root.getAttribute("style")).toBeNull();
  });

  it("still renders the single layer row under the floor", () => {
    const root = renderView({ minRows: 5 });
    expect(root.querySelectorAll('[data-testid="cell"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-testid="empty-cell"]')).toHaveLength(0);
  });
});
