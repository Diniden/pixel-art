/**
 * PaletteManager stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. The panel's last two Zustand reads
 * (`uiState.selectedColor` / `setColor`) became the `selectedColor` prop and
 * the `onSelectColor` callback in task 36.
 *
 * ⚠️ The `if (!project) return null` guard MOVED TO THE CONTAINER, so there is
 * no "no project" story here — that state is now unrepresentable in this
 * component, which is the point of the move.
 *
 * ⚠️ All five palette actions are NON-UNDOABLE (task 17, pinned). The stories
 * wire them to `fn()` and assert nothing about history.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PaletteManager } from "./PaletteManager";
import {
  paletteBasic,
  paletteMono,
  paletteEmpty,
  paletteLarge,
  red,
} from "../../../fixtures";

const meta = {
  component: PaletteManager,
  args: {
    palettes: [paletteBasic, paletteMono],
    selectedColor: red,
    onAddPalette: fn(),
    onDeletePalette: fn(),
    onRenamePalette: fn(),
    onAddColorToPalette: fn(),
    onRemoveColorFromPalette: fn(),
    onSelectColor: fn(),
  },
} satisfies Meta<typeof PaletteManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: no palettes yet — only the "add palette" affordance. */
export const NoPalettes: Story = {
  args: { palettes: [] },
};

/** TYPICAL: two palettes with colours. */
export const Typical: Story = {};

/** A palette that exists but holds no colours — distinct from "no palettes". */
export const EmptyPalette: Story = {
  args: { palettes: [paletteEmpty] },
};

/** EDGE: a large palette, to exercise swatch wrapping. */
export const LargePalette: Story = {
  args: { palettes: [paletteLarge, paletteBasic] },
};

/**
 * WITH THE PINNED "CURRENT PALETTE" ROW — the retired `LayerColors` strip.
 *
 * ⚠️ The row is drawn ONLY when `currentPalette` is supplied. Every story
 * above omits it, which is the point: the prop is optional so this panel is
 * still usable outside the pixel studio, and the many existing callers did not
 * have to be rewritten for a row they do not exercise.
 *
 * `CurrentPalette.stories.tsx` exercises the row's own states; this story is
 * about its PLACEMENT — it must sit above the real palettes, and opening a
 * real row must collapse it (the list allows one open row, and the synthetic
 * row shares that state).
 */
export const WithCurrentPalette: Story = {
  args: {
    currentPalette: {
      hasLayer: true,
      uniqueColorsData: {
        colors: paletteBasic.colors,
        count: paletteBasic.colors.length,
      },
      currentPickerColor: undefined,
      colorAdjustment: false,
      colorAdjustmentAllFrames: false,
      colorAdjustmentAllLayers: false,
      onExpandedChange: fn(),
      allFramesMode: false,
      onAllFramesModeChange: fn(),
      allLayersMode: false,
      onAllLayersModeChange: fn(),
      onStartColorAdjustment: fn(),
      onClearColorAdjustment: fn(),
      onSaveAsPalette: fn(),
    },
  },
};
