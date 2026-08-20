/**
 * BrushControls stories (REFRESH task 35). **No store provider.**
 *
 * ⚠️ These stories are the pixel-identical check for the sliders (task 35,
 * gate 2). Until task 18 they were styled by `ColorPicker.css` *by accident*;
 * task 18 moved them onto `blocks/slider.css`'s `slider` class. Rendering
 * them here against the real stylesheet is how a phantom styling regression
 * gets caught in one look instead of "chased for hours".
 *
 * Every callback is `fn()`, which also documents the output contract: the
 * gaussian callbacks emit the WHOLE `{smoothing, radius, radiusMax}` record,
 * never a patch — the store replaces `gaussianFill` wholesale because it is
 * `observableRef`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrushControls } from "./BrushControls";
import {
  GAUSSIAN_RADIUS_MAX_OPTIONS,
  TRACE_MAX_OPTIONS,
  TRACE_NUDGE_OPTIONS,
} from "./brushOptions";

/** The widest option in each segmented row, read from the real arrays so a
 *  story cannot drift from the options the component actually renders. */
const WIDEST_TRACE_MAX = TRACE_MAX_OPTIONS[TRACE_MAX_OPTIONS.length - 1];
const WIDEST_NUDGE = TRACE_NUDGE_OPTIONS[TRACE_NUDGE_OPTIONS.length - 1];
const WIDEST_GAUSSIAN_RADIUS =
  GAUSSIAN_RADIUS_MAX_OPTIONS[GAUSSIAN_RADIUS_MAX_OPTIONS.length - 1];

const meta = {
  title: "Components/RightSidebarTopControls/BrushControls",
  component: BrushControls,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The three size-shaped tool-option groups: `fill-square` brush " +
          "size, the reference-trace size/max/nudge trio, and gaussian " +
          "fill. Never shown together in the app — `selectedTool` picks at " +
          "most one — but each `show*` flag is independent here so a story " +
          "can render any combination.",
      },
    },
  },
  args: {
    showBrushSize: false,
    showTraceBrush: false,
    showGaussianFill: false,
    brushSize: 4,
    onBrushSizeChange: fn(),
    traceMax: 16,
    onTraceMaxChange: fn(),
    traceNudge: 10,
    onTraceNudgeChange: fn(),
    gaussianFill: { smoothing: 1.0, radius: 2.0, radiusMax: 16 },
    onGaussianFillChange: fn(),
  },
} satisfies Meta<typeof BrushControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: every group hidden. The component renders a fragment with nothing
 * in it — which is exactly what the parent relies on when `selectedTool` is
 * one the brush groups do not serve.
 */
export const AllHidden: Story = {};

/** Typical: the plain brush-size slider, the `fill-square` case. */
export const BrushSizeOnly: Story = {
  args: { showBrushSize: true, brushSize: 4 },
};

/** The reference-trace trio at its defaults. */
export const TraceBrush: Story = {
  args: { showTraceBrush: true, brushSize: 8, traceMax: 16, traceNudge: 10 },
};

/** Gaussian fill at its defaults. */
export const GaussianFill: Story = {
  args: { showGaussianFill: true },
};

/**
 * Edge: `brushSize` (48) EXCEEDS `traceMax` (16). The trace slider clamps for
 * display with `Math.min` rather than emitting a correction, so the thumb
 * pins to the right and the readout shows 16 while the stored brush size
 * stays 48. Carried over verbatim — a story exists so the asymmetry is
 * visible rather than surprising.
 */
export const TraceSizeAboveMax: Story = {
  args: {
    showTraceBrush: true,
    brushSize: 48,
    traceMax: 16,
    traceNudge: WIDEST_NUDGE,
  },
};

/**
 * Edge: the widest gaussian radius with the smoothing floor. Together
 * with `TraceSizeAboveMax` this is the "both maxima selected" segmented-row
 * state, where five segments compete for a narrow sidebar.
 */
export const GaussianAtWidestRadius: Story = {
  args: {
    showGaussianFill: true,
    gaussianFill: {
      smoothing: 0.1,
      radius: WIDEST_GAUSSIAN_RADIUS,
      radiusMax: WIDEST_GAUSSIAN_RADIUS,
    },
  },
};

/**
 * Edge: trace AND gaussian visible at once. Unreachable through
 * `selectedTool` today, but it is the stacking case the shared
 * `__control` gap has to survive if a future tool enables both.
 */
export const TraceAndGaussianTogether: Story = {
  args: {
    showTraceBrush: true,
    showGaussianFill: true,
    brushSize: 12,
    traceMax: WIDEST_TRACE_MAX,
    traceNudge: 25,
    gaussianFill: { smoothing: 3.5, radius: 12, radiusMax: 32 },
  },
};
