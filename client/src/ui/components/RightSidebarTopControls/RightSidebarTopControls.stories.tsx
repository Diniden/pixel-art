/**
 * RightSidebarTopControls stories (REFRESH task 35). **No store provider.**
 *
 * The composition shell. These stories exercise the `show*` routing that is
 * now the ONLY logic left in this file — every story below differs from its
 * neighbours by `selectedTool` alone, which is the readable proof that the
 * routing survived the split intact.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RightSidebarTopControls } from "./RightSidebarTopControls";

const meta = {
  title: "Components/RightSidebarTopControls/RightSidebarTopControls",
  component: RightSidebarTopControls,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Composition only: Zoom always, Tool Options when the selected " +
          "tool has any. 403 lines and 16 store members became this shell " +
          "plus four focused groups, none of which can reach a store.",
      },
    },
  },
  args: {
    isPixelMode: true,
    selectedTool: "pencil",
    frameTraceActive: false,
    zoom: 8,
    onZoomChange: fn(),
    brushSize: 4,
    onBrushSizeChange: fn(),
    traceMax: 16,
    onTraceMaxChange: fn(),
    traceNudge: 10,
    onTraceNudgeChange: fn(),
    gaussianFill: { smoothing: 1.0, radius: 2.0, radiusMax: 16 },
    onGaussianFillChange: fn(),
    shapeMode: "outline",
    onShapeModeChange: fn(),
    borderRadius: 0,
    onBorderRadiusChange: fn(),
    moveAllLayers: false,
    onMoveAllLayersChange: fn(),
    selectionSummary: null,
    selectionMode: "rect",
    onSelectionModeChange: fn(),
    selectionBehavior: "movePixels",
    onSelectionBehaviorChange: fn(),
    onExpandSelection: fn(),
    onShrinkSelection: fn(),
    onClearSelection: fn(),
  },
} satisfies Meta<typeof RightSidebarTopControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: the pencil has no options, so the Tool Options panel is absent
 * entirely and Zoom stands alone. The most common state in the app.
 */
export const PencilNoOptions: Story = {};

/** Typical: the rectangle tool — shape mode plus corner radius. */
export const RectangleTool: Story = {
  args: { selectedTool: "rectangle", shapeMode: "both", borderRadius: 4 },
};

/** Typical: the selection tool with a live marquee. */
export const SelectionToolWithSelection: Story = {
  args: {
    selectedTool: "selection",
    selectionSummary: { width: 24, height: 16, pixelCount: 384 },
    selectionMode: "rect",
  },
};

/**
 * Edge — and the reason `showTraceBrush` is not a plain tool equality check:
 * `frameTraceActive` is true while the selected tool is `pencil`. A trace can
 * be live under another tool, so the trace group shows anyway. Getting this
 * one wrong would be invisible until someone traced a reference.
 */
export const TraceActiveUnderAnotherTool: Story = {
  args: { selectedTool: "pencil", frameTraceActive: true, brushSize: 8 },
};

/**
 * Edge: the LIGHTING studio. `isPixelMode` false kills every tool-option
 * group at once — including the trace group, `frameTraceActive`
 * notwithstanding — while Zoom survives. The whole Tool Options panel
 * disappears rather than rendering empty chrome.
 */
export const LightingStudio: Story = {
  args: {
    isPixelMode: false,
    selectedTool: "selection",
    frameTraceActive: true,
    selectionSummary: { width: 24, height: 16, pixelCount: 384 },
  },
};

/** Edge: gaussian fill at its widest, next to a fractional zoom. */
export const GaussianFillAtWidest: Story = {
  args: {
    selectedTool: "gaussian-fill",
    zoom: 3.5,
    gaussianFill: { smoothing: 5.0, radius: 128, radiusMax: 128 },
  },
};
