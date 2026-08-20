/**
 * ObjectCreateDialog stories (REFRESH task 35). **No store provider.**
 *
 * Three of `ObjectLibrary`'s 15 `useState` calls (`newName`, `newWidth`,
 * `newHeight`) are this component's own state now. The parent keeps one
 * `showNewForm` flag.
 *
 * ⚠️ It is NOT a `Modal` — it renders in place inside the panel body, which
 * is where `object-library__new-form` always rendered.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectCreateDialog } from "./ObjectCreateDialog";
import "../ObjectLibrary.css";

const meta = {
  title: "Components/ObjectLibrary/Dialogs/ObjectCreateDialog",
  component: ObjectCreateDialog,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="panel object-library" style={{ width: 280 }}>
        <div className="panel__body">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { defaultName: "Object 3", onCreate: fn(), onCancel: fn() },
} satisfies Meta<typeof ObjectCreateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: name blank, sizes at their 32×32 defaults. Pressing Create emits the
 * DEFAULT name — the Actions panel shows `("Object 3", 32, 32)`, which is the
 * contract the caller relies on for "name it for me".
 */
export const Empty: Story = {};

/** Typical: the first object in a fresh project. */
export const FirstObject: Story = {
  args: { defaultName: "Object 1" },
};

/** Edge: a high default index — the state after 99 objects already exist. */
export const HighDefaultIndex: Story = {
  args: { defaultName: "Object 100" },
};
