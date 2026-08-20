/**
 * ObjectResizeDialog stories (REFRESH task 35). **No store provider.**
 *
 * Five of `ObjectLibrary`'s 15 `useState` calls were this panel. They are
 * this component's own three now, seeded from `currentWidth`/`currentHeight`.
 *
 * ⚠️ Not a `Modal` — it renders inside the object's list entry, directly
 * beneath the row being resized, so the anchor grid sits next to the
 * thumbnail it describes.
 *
 * ⚠️ `AnchorGrid` draws the CURRENT box inside the NEW one, so it needs both.
 * The current size arrives as props and is never derived from the editable
 * fields — which is exactly what the old `originalWidth`/`originalHeight`
 * pair existed for, and what makes the grow/shrink stories below differ
 * visibly rather than just numerically.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectResizeDialog } from "./ObjectResizeDialog";
import "../ObjectLibrary.css";

const meta = {
  title: "Components/ObjectLibrary/Dialogs/ObjectResizeDialog",
  component: ObjectResizeDialog,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="panel object-library" style={{ width: 280 }}>
        <div className="panel__body">
          <div className="object-library__entry">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    currentWidth: 32,
    currentHeight: 32,
    onApply: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ObjectResizeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Typical: a 32×32 object. The fields open seeded to the CURRENT size, so
 * Apply without touching anything is a no-op resize at `middle-center`.
 */
export const Typical: Story = {};

/** Edge: the smallest possible object, 1×1 — every anchor grows from it. */
export const TinyObject: Story = {
  args: { currentWidth: 1, currentHeight: 1 },
};

/** Edge: the largest supported grid, 256×256 — every anchor shrinks. */
export const LargestObject: Story = {
  args: { currentWidth: 256, currentHeight: 256 },
};

/**
 * Edge: an extreme aspect ratio (512×16). The anchor grid has to render a
 * reference box far wider than it is tall, which is the case most likely to
 * break its own layout.
 */
export const ExtremeAspectRatio: Story = {
  args: { currentWidth: 512, currentHeight: 16 },
};
