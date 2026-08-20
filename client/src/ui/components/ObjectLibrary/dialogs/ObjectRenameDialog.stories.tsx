/**
 * ObjectRenameDialog stories (REFRESH task 35). **No store provider.**
 *
 * ⚠️ Not an overlay — an in-place `<input>`, which is what renaming in this
 * panel has always been. See the component header for why it was not promoted
 * to a `Modal`.
 *
 * The `size` prop picks between two LIVE class names with different sizing
 * (`__name-input` and `__name-input-small`), so both get a story.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectRenameDialog } from "./ObjectRenameDialog";
import "../ObjectLibrary.css";

const meta = {
  title: "Components/ObjectLibrary/Dialogs/ObjectRenameDialog",
  component: ObjectRenameDialog,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="panel object-library" style={{ width: 280 }}>
        <div className="panel__body">
          <div className="object-library__list">
            <div className="object-library__item">
              <div className="object-library__content">
                <div className="object-library__name-row">
                  <Story />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  ],
  args: { initialName: "Hero", onRename: fn(), onCancel: fn() },
} satisfies Meta<typeof ObjectRenameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: the field starts blank. Committing an empty value calls `onCancel`
 * rather than `onRename` — an object may not be renamed to nothing, and that
 * guard is why the two callbacks are separate.
 */
export const EmptyName: Story = {
  args: { initialName: "" },
};

/** Typical: renaming an existing object, normal list sizing. */
export const Typical: Story = {};

/** Modifier story: the `small` variant used by the small-rows list. */
export const SmallVariant: Story = {
  args: { size: "small" },
};

/**
 * Edge: a name long enough to overflow the input. The field scrolls rather
 * than growing, which is what keeps the row height stable mid-edit.
 */
export const VeryLongName: Story = {
  args: {
    initialName:
      "Protagonist — idle / walk / run cycle sheet (working draft v3)",
  },
};

/**
 * Edge: leading and trailing whitespace. It is TRIMMED before `onRename`
 * fires — watch the Actions panel — so a stray space cannot create a name
 * that looks identical to another but compares unequal.
 */
export const WhitespacePadded: Story = {
  args: { initialName: "   Hero   " },
};
