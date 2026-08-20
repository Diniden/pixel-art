/**
 * ObjectLibrary stories (REFRESH task 35). **No store provider.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 REAL THUMBNAILS, NO PIXELS, NO STORE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The rows are `ObjectRowModel`s — five scalar fields, no `frames`. The
 * thumbnails are painted by a `draw` closure the story supplies, exactly as
 * the container supplies a bound `renderFramePreview` in the app. So these
 * stories render the component's real visual output while the 300,249-cell
 * grid (R2) stays on the other side of the boundary.
 *
 * All three view modes and all four dialogs are reachable here.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ObjectLibrary } from "./ObjectLibrary";
import {
  TYPICAL_OBJECTS,
  DENSE_OBJECTS,
  AWKWARD_OBJECTS,
  makeStoryThumbnailDraw,
} from "./storyFixtures";

const meta = {
  title: "Components/ObjectLibrary/ObjectLibrary",
  component: ObjectLibrary,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The object list in three view modes. 623 lines and **15 " +
          "`useState` calls** became four flags plus four dialog components " +
          "that own their own fields.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    objects: TYPICAL_OBJECTS,
    selectedObjectId: TYPICAL_OBJECTS[0]?.id ?? null,
    viewMode: "normal",
    makeThumbnailDraw: makeStoryThumbnailDraw,
    thumbnailRevision: 1,
    onAddObject: fn(),
    onDeleteObject: fn(),
    onRenameObject: fn(),
    onResizeObject: fn(),
    onSelectObject: fn(),
    onDuplicateObject: fn(),
    onSetViewMode: fn(),
  },
} satisfies Meta<typeof ObjectLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: no objects at all. The `object-library__empty` copy shows and the
 * `+` button is the only affordance — the state a brand-new project opens in.
 */
export const Empty: Story = {
  args: { objects: [], selectedObjectId: null },
};

/** Typical: `projectTypical`'s hero and prop, normal view. */
export const Typical: Story = {};

/** Modifier story: `--active` on the view toggle, small-rows layout. */
export const SmallRows: Story = {
  args: { viewMode: "small-rows" },
};

/** Modifier story: grid layout. Hover a tile for the portalled tooltip. */
export const GridView: Story = {
  args: { viewMode: "grid", objects: DENSE_OBJECTS },
};

/**
 * Edge: `projectDense`'s 12 objects in normal view — the scroll case, and
 * roughly the scale of the owner's real project.
 */
export const DenseNormalView: Story = {
  args: {
    objects: DENSE_OBJECTS,
    selectedObjectId: DENSE_OBJECTS[3]?.id ?? null,
  },
};

/**
 * Edge: names long enough to truncate, a 512×16 strip, a 1×1 object, and a
 * 144-frame count. The name row and the metrics line are the two places this
 * component overflows, and both are exercised here.
 */
export const AwkwardNamesAndSizes: Story = {
  args: {
    objects: AWKWARD_OBJECTS,
    selectedObjectId: AWKWARD_OBJECTS[0].id,
  },
};

/**
 * Edge: the same awkward set in GRID mode, where only the thumbnail shows
 * and every name lives in the hover tooltip instead.
 */
export const AwkwardInGridView: Story = {
  args: {
    objects: AWKWARD_OBJECTS,
    viewMode: "grid",
    selectedObjectId: AWKWARD_OBJECTS[1].id,
  },
};
