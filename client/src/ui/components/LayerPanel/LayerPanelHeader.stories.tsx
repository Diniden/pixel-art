/**
 * LayerPanelHeader stories (REFRESH task 35). **No store provider.**
 *
 * Five of the seven collapsed callbacks are these buttons. Every one of them
 * logs `scope: "allFrames"` in the Actions panel — put this story side by
 * side with `LayerRow`'s and the only difference in the log is that word,
 * which is the readable form of what §9.5 asked for.
 *
 * ⚠️ The all-frames STORE actions are still four distinct methods that
 * genuinely disagree (see `layerScope.ts`). Identical-looking callbacks here
 * do not mean identical behaviour there — both scopes need verifying in the
 * running app.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LayerPanelHeader } from "./LayerPanelHeader";

const meta = {
  title: "Components/LayerPanel/LayerPanelHeader",
  component: LayerPanelHeader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The header row and its eight action buttons — the `allFrames` " +
          "half of the 7→3 call-site collapse. The delete confirm is NOT " +
          "here: the button emits a callback and the container decides " +
          "whether to prompt, because a blocking `window.confirm` cannot be " +
          "rendered in a story.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel layer-panel" style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    selectedLayerId: "layer-1",
    allVisible: true,
    hasVariants: true,
    canMoveUp: true,
    canMoveDown: true,
    canSquashDown: true,
    canSquashUp: true,
    canDeleteAcrossAllFrames: true,
    onMoveLayer: fn(),
    onSquashLayer: fn(),
    onDeleteLayer: fn(),
    onToggleAllVisibility: fn(),
    onOpenCopyFrom: fn(),
    onOpenAddVariant: fn(),
    onAddLayer: fn(),
    layerFocusMode: "transparent",
    onLayerFocusModeChange: fn(),
  },
} satisfies Meta<typeof LayerPanelHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: NO layer selected and no variants in the project. Every all-frames
 * button is dead and the add-variant button carries `--disabled`. This is the
 * state a fresh project opens in, and it is the one where a missing guard
 * would let a click reach a store action with a null id.
 */
export const NothingSelected: Story = {
  args: {
    selectedLayerId: null,
    hasVariants: false,
    canMoveUp: false,
    canMoveDown: false,
    canSquashDown: false,
    canSquashUp: false,
    canDeleteAcrossAllFrames: false,
  },
};

/** Typical: a middle layer selected, everything live. */
export const Typical: Story = {};

/**
 * Modifier story: `--all-visible` off. The eye glyph flips to `EyeOff` and
 * the button's title becomes "Show all layers" — the toggle reads the
 * INVERSE of the current state, which is easy to get backwards.
 */
export const SomeLayersHidden: Story = {
  args: { allVisible: false },
};

/**
 * Edge: the selected layer is a VARIANT. Both squash buttons go dead while
 * the move buttons stay live — a variant cannot be squashed into or out of,
 * but it can still be reordered. The asymmetry is deliberate and is exactly
 * what the four `squash*` actions' guards encode.
 */
export const VariantSelected: Story = {
  args: { canSquashDown: false, canSquashUp: false },
};

/**
 * Edge: a single layer in the frame. Delete-across-all-frames is refused —
 * the store action itself also refuses (`frame.layers.length <= 1`), so this
 * is the guard agreeing with the store rather than replacing it.
 */
export const SingleLayer: Story = {
  args: {
    canMoveUp: false,
    canMoveDown: false,
    canSquashDown: false,
    canSquashUp: false,
    canDeleteAcrossAllFrames: false,
  },
};

/** Edge: the top layer — cannot move or squash up. */
export const TopLayerSelected: Story = {
  args: { canMoveUp: false, canSquashUp: false },
};

/**
 * The onion-skin focus mode selected: the third toggle carries `--active`.
 * The toggle row is presentation only — what it changes lives on the canvas.
 */
export const OnionFocusMode: Story = {
  args: { layerFocusMode: "onion" },
};
