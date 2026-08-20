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
