/**
 * CameraAdvanced stories — the four states task 06 asks for.
 *
 * No store provider anywhere: the component takes plain numbers and callbacks,
 * which is what proves the `ui/` boundary holds. The decorator reproduces the
 * `.panel` card at the rail's real **240px**, because the whole layout risk
 * here is six numeric boxes in a narrow column — reviewed full-bleed they
 * would look fine and ship broken.
 *
 * | Story          | What it exercises                                       |
 * | -------------- | ------------------------------------------------------- |
 * | Collapsed      | the default: one disclosure button, nothing else         |
 * | Orthographic   | `near`/`far` plus the four side planes, six boxes at 240 |
 * | Perspective    | `near`/`far` plus `fov`/`aspect` — and NO ortho boxes    |
 * | Invalid        | `far < near`: the values are ILLEGAL on arrival, so the  |
 * |                | frustum a container could hand back is visible as-is     |
 *
 * ⚠️ `Invalid` renders values that are already illegal rather than typing a
 * bad one, because the invalid *styling* only appears once a field is being
 * drafted — the component never marks the container's own values red, it
 * marks the owner's in-flight entry. The story is here so the layout of that
 * state is reviewable; the DOM test drives the real typing path.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CameraAdvanced } from "./CameraAdvanced";

/** Every callback, stubbed. Spread into each story so none is forgotten. */
const handlers = {
  onChange: fn(),
  onSaveAsPreset: fn(),
  onReset: fn(),
};

const meta = {
  title: "Components/CameraAdvanced",
  component: CameraAdvanced,
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <div className="panel">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Pose</span>
          </div>
          <div className="panel__body panel__body--dense">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Exact numeric entry for the camera's projection values (plan 08, " +
          "**F16**). ⚠️ These fields **are** the projection matrix: " +
          "`applyCameraParams` writes the camera's fields and then calls " +
          "`updateProjectionMatrix()`, which rebuilds the matrix from them — " +
          "so a hand-typed 4×4 would be overwritten on the next frame and a " +
          "matrix input would silently do nothing. Only the CURRENT " +
          "projection's fields are shown; `near`/`far` are shared. An entry " +
          "that is empty, unparseable or illegal is marked invalid and " +
          "**emits nothing** — it is never clamped into legality. Saving is " +
          "a callback only: **storage belongs to task 08**.",
      },
    },
  },
} satisfies Meta<typeof CameraAdvanced>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: advanced mode is not always on screen. */
export const Collapsed: Story = {
  args: {
    ...handlers,
    projection: "perspective",
    near: 0.1,
    far: 100,
    perspective: { fov: 50, aspect: 1 },
  },
};

/** Six boxes at 240px — the narrow-width check the task names. */
export const Orthographic: Story = {
  args: {
    ...handlers,
    projection: "orthographic",
    near: 0.1,
    far: 100,
    orthographic: { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2 },
    defaultOpen: true,
  },
};

/** `fov`/`aspect` only — the ortho planes must NOT appear here. */
export const Perspective: Story = {
  args: {
    ...handlers,
    projection: "perspective",
    near: 0.1,
    far: 100,
    perspective: { fov: 50, aspect: 1 },
    defaultOpen: true,
  },
};

/** An illegal frustum on arrival: `far` below `near`. */
export const Invalid: Story = {
  args: {
    ...handlers,
    projection: "perspective",
    near: 100,
    far: 0.1,
    perspective: { fov: 50, aspect: 1 },
    defaultOpen: true,
  },
};
