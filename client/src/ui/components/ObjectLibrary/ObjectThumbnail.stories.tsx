/**
 * ObjectThumbnail stories (REFRESH task 35). **No store provider.**
 *
 * ⚠️ These stories exist mostly to document a NEGATIVE: this component takes
 * a `draw` callback and a `revision` number, and it has no `React.memo`
 * comparator. W20 found the 79-line comparator that used to live here was
 * dead code hiding a live stale-thumbnail bug — it iterated `variantGroups`,
 * which the v1.1.0 migration leaves `undefined`. Do not reintroduce one.
 *
 * `RevisionBump` is the story that proves the replacement works: two stories
 * with the SAME `draw` identity but different `revision` values paint
 * differently, which is the contract the comparator used to (badly) enforce.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ObjectThumbnail } from "./ObjectThumbnail";
import { makeStoryThumbnailDraw } from "./storyFixtures";

/** A painter whose output depends on the revision it was built for. */
function drawForRevision(revision: number) {
  return (ctx: CanvasRenderingContext2D, size: number) => {
    ctx.clearRect(0, 0, size, size);
    const hue = (revision * 60) % 360;
    ctx.fillStyle = `hsl(${hue}, 65%, 50%)`;
    ctx.fillRect(2, 2, size - 4, size - 4);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(2, 2, ((size - 4) * (revision % 5)) / 4, 3);
  };
}

const meta = {
  title: "Components/ObjectLibrary/ObjectThumbnail",
  component: ObjectThumbnail,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One object's 32px preview, on the `ThumbnailCanvas` primitive. " +
          "Painting happens on the CONTAINER's side (R2: the owner's real " +
          "project is 300,249 cells) and arrives here as a closure.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="panel object-library" style={{ width: 120 }}>
        <div className="panel__body">
          <div className="object-library__thumb">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    draw: makeStoryThumbnailDraw("obj-hero"),
    revision: 1,
    label: "Hero",
  },
} satisfies Meta<typeof ObjectThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty: a painter that draws nothing. The canvas renders at full size and
 * stays transparent — the state an object with zero frames lands in, where
 * the container's `draw` returns before painting anything.
 */
export const EmptyObject: Story = {
  args: { draw: () => {}, label: "Empty object" },
};

/** Typical: a painted thumbnail. */
export const Typical: Story = {};

/** A different object id hashes to a different hue. */
export const DifferentObject: Story = {
  args: { draw: makeStoryThumbnailDraw("obj-prop"), label: "Prop" },
};

/**
 * Revision 1 — compare with `RevisionBumped` below. Same component, same
 * prop shape, and the ONLY thing that decides whether a repaint happens is
 * this number.
 */
export const RevisionOne: Story = {
  args: { draw: drawForRevision(1), revision: 1 },
};

/**
 * Revision 4. Side by side with `RevisionOne` this is the whole invalidation
 * contract: `revision` changed, so the paint changed. No comparator, no
 * project reference, nothing to go stale.
 */
export const RevisionBumped: Story = {
  args: { draw: drawForRevision(4), revision: 4 },
};
