/**
 * CurrentPalette stories.
 *
 * 🏁 NO STORE PROVIDER — and note what that PROVES: the pixel scan that
 * produced these swatches lives in `containers/hooks/layerColorExtraction.ts`
 * (R2: nothing that walks pixels may live in `ui/`), so a story hands the
 * component a finished `LayerColorsData` and never touches a grid.
 *
 * This component replaces the retired `LayerColors` strip. Its stories are
 * that file's, plus the states the two new features introduce.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ MANUAL CHECKS — these cannot be automated here
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. KEYBOARD. In `Typical`, Tab to each of the two scope switches and press
 *     Space. Both must respond. They are the `Toggle` primitive, whose
 *     accessibility is structural (a real `<input type="checkbox"
 *     role="switch">` inside its `<label>`) — the strip's predecessors were
 *     `<div onClick>` wrappers that Tab never reached.
 *
 *  2. SINGLE vs DOUBLE TAP. This is the behaviour change users will feel, and
 *     it is timing-dependent, so a story is the only honest way to check it.
 *     In `Typical`, single-click a swatch: after ~250ms `onSelectColor` fires
 *     ONCE in the actions panel. Then double-click one: `onSelectColor` must
 *     NOT fire at all, and `onStartColorAdjustment` fires once with the two
 *     scope flags. A double-click that also logs `onSelectColor` means the
 *     deferral broke.
 *
 *  3. TOGGLING CLEARS AN ADJUSTMENT. In `Adjusting`, flip either scope
 *     switch: `onClearColorAdjustment` must fire. The adjustment holds a
 *     snapshot taken under the OLD scope, so leaving it open would keep
 *     recolouring cells the toggles no longer describe.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CurrentPalette } from "./CurrentPalette";
import type { Color } from "../../../types";

const swatch = (r: number, g: number, b: number, a = 255): Color => ({
  r,
  g,
  b,
  a,
});

/**
 * Already in display order, the way `sortPaletteColors` returns them.
 *
 * ⚠️ The component does NOT sort. Ordering — 10 most-recently-used first, then
 * by hue and darkest-to-lightest — is `sortPaletteColors`, applied in the
 * container. A story hands over a finished list, so re-ordering these args
 * changes what is rendered.
 */
const RAMP: Color[] = [
  swatch(20, 12, 28),
  swatch(64, 40, 72),
  swatch(120, 60, 90),
  swatch(190, 100, 90),
  swatch(230, 160, 110),
  swatch(250, 220, 180),
];

/** 240 distinct colours — a full hue sweep at four lightness steps. */
const WIDE_RAMP: Color[] = Array.from({ length: 240 }, (_, i) => {
  const hue = (i * 137.5) % 360;
  const level = 60 + (i % 4) * 45;
  const f = (n: number) => {
    const k = (n + hue / 60) % 6;
    return Math.round(level * (1 - Math.max(0, Math.min(k, 4 - k, 1)) * 0.75));
  };
  return swatch(f(5), f(3), f(1));
});

const meta = {
  component: CurrentPalette,
  args: {
    hasLayer: true,
    uniqueColorsData: { colors: RAMP, count: RAMP.length },
    currentPickerColor: undefined,
    colorAdjustment: false,
    colorAdjustmentAllFrames: false,
    colorAdjustmentAllLayers: false,
    expanded: true,
    onToggleExpanded: fn(),
    onExpandedChange: fn(),
    allFramesMode: false,
    onAllFramesModeChange: fn(),
    allLayersMode: false,
    onAllLayersModeChange: fn(),
    onSelectColor: fn(),
    onStartColorAdjustment: fn(),
    onClearColorAdjustment: fn(),
    onSaveAsPalette: fn(),
  },
} satisfies Meta<typeof CurrentPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TYPICAL: a six-colour ramp, both scopes off, nothing being adjusted. */
export const Typical: Story = {};

/**
 * COLLAPSED — and this is the state the container SCANS NOTHING in.
 *
 * ⚠️ The swatches are still passed here, and the row still shows a count,
 * because the component does not know why the data is what it is. In the real
 * app the container hands it `NO_COLORS` while collapsed; this story keeps the
 * data so the header's count badge is visible in the closed state.
 */
export const Collapsed: Story = {
  args: { expanded: false },
};

/** No layer selected at all — the empty state the strip also had. */
export const NoLayerSelected: Story = {
  args: {
    hasLayer: false,
    uniqueColorsData: { colors: [], count: 0 },
  },
};

/** A layer with nothing painted on it, in the current scope. */
export const NoColors: Story = {
  args: { uniqueColorsData: { colors: [], count: 0 } },
};

/**
 * EDGE: 240 colours — well past the 64-colour cap this component USED to have.
 *
 * ⚠️ This story is the removed cap's replacement, and it is the one that has
 * to be looked at. The old behaviour was to render "Too many colors to
 * display (65+)" and NO swatches; now every colour is drawn. What this story
 * checks is that the result is still usable: the swatch grid must wrap and
 * scroll inside the row rather than blowing out the right rail's width, and
 * the count badge must show the real number.
 */
export const ManyColors: Story = {
  args: {
    uniqueColorsData: { colors: WIDE_RAMP, count: WIDE_RAMP.length },
  },
};

/**
 * Colour-adjustment mode, entered by double-tapping the third swatch.
 *
 * `currentPickerColor` matching a swatch is what draws the ✎ marker on it.
 */
export const Adjusting: Story = {
  args: {
    colorAdjustment: true,
    currentPickerColor: RAMP[2],
  },
};

/** The widest scope, so the hint reads "all layers, all frames". */
export const AdjustingEverything: Story = {
  args: {
    colorAdjustment: true,
    colorAdjustmentAllFrames: true,
    colorAdjustmentAllLayers: true,
    currentPickerColor: RAMP[2],
    allFramesMode: true,
    allLayersMode: true,
  },
};

/** Both scope toggles on, with no adjustment running. */
export const BothScopesOn: Story = {
  args: { allFramesMode: true, allLayersMode: true },
};
