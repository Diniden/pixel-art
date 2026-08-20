/**
 * LayerColors stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER — and note what that PROVES here: the pixel scan that
 * produced these swatches used to run inside this component. It now lives in
 * `containers/hooks/layerColorExtraction.ts` (R2: nothing that walks pixels
 * may live in `ui/`), so a story can hand the component a finished
 * `LayerColorsData` and never touch a grid.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE 3 KEYBOARD-INOPERABLE TOGGLES ARE FIXED — TEST THEM HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * All three "All Frames" toggles were `<div onClick>` wrappers around a
 * checkbox with a no-op `onChange`: not focusable, so Tab never reached them
 * and Space never flipped them. They are the `Toggle` primitive now, whose
 * accessibility is structural (a real `<input type="checkbox" role="switch">`
 * inside its `<label>`).
 *
 * Manual check 5 is: in EACH of the three stories below — `NoLayerSelected`
 * is the exception, it has no toggle — Tab to the switch and press Space. All
 * must respond. The three states render three DIFFERENT toggle instances, so
 * checking only the typical one would miss a regression in the other two.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LayerColors } from "./LayerColors";
import type { Color } from "../../../types";

const swatch = (r: number, g: number, b: number, a = 255): Color => ({
  r,
  g,
  b,
  a,
});

/** Luminance-ordered, the way the extraction hook returns them. */
const RAMP: Color[] = [
  swatch(20, 12, 28),
  swatch(64, 40, 72),
  swatch(120, 60, 90),
  swatch(190, 100, 90),
  swatch(230, 160, 110),
  swatch(250, 220, 180),
];

const meta = {
  component: LayerColors,
  args: {
    hasLayer: true,
    uniqueColorsData: { colors: RAMP, exceeded: false, count: RAMP.length },
    currentPickerColor: undefined,
    colorAdjustment: false,
    colorAdjustmentAllFrames: false,
    allFramesMode: false,
    onAllFramesModeChange: fn(),
    onStartColorAdjustment: fn(),
    onClearColorAdjustment: fn(),
  },
} satisfies Meta<typeof LayerColors>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY (1 of 2): nothing selected. This state has NO toggle by design. */
export const NoLayerSelected: Story = {
  args: { hasLayer: false },
};

/**
 * EMPTY (2 of 2): a layer IS selected but holds no colours. ⚠️ Toggle #2 of
 * the three fixed ones — Tab + Space here.
 */
export const EmptyLayer: Story = {
  args: {
    uniqueColorsData: { colors: [], exceeded: false, count: 0 },
  },
};

/** TYPICAL: a six-colour ramp. ⚠️ Toggle #3 of the three fixed ones. */
export const Typical: Story = {};

/**
 * EDGE: past the 64-colour display cap. ⚠️ Toggle #1 of the three fixed ones.
 *
 * `colors` is EMPTY while `exceeded` is true — that is the extraction hook's
 * contract, not a bug: it bails out of the scan the moment it passes the cap,
 * so the list it collected is deliberately discarded rather than shown
 * truncated.
 */
export const TooManyColors: Story = {
  args: {
    uniqueColorsData: { colors: [], exceeded: true, count: 65 },
  },
};

/** A colour adjustment is active on one swatch — the `--selected` modifier. */
export const AdjustingOneColor: Story = {
  args: {
    colorAdjustment: true,
    colorAdjustmentAllFrames: false,
    currentPickerColor: RAMP[3],
  },
};

/**
 * Adjusting across ALL frames — the hint text differs from the story above.
 *
 * ⚠️ `colorAdjustmentAllFrames` is deliberately independent of
 * `allFramesMode`: the former is what the adjustment STARTED with, the latter
 * is the toggle's current position. They diverge the moment a user flips the
 * toggle mid-adjustment, which is why the component clears the adjustment
 * when that happens.
 */
export const AdjustingAllFrames: Story = {
  args: {
    colorAdjustment: true,
    colorAdjustmentAllFrames: true,
    allFramesMode: true,
    currentPickerColor: RAMP[1],
  },
};
