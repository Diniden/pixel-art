/**
 * GeneratingStep stories (REFRESH task 34). No store provider.
 *
 * ⚠️ These stories are also the ONLY place the W14 status modifiers are
 * VISIBLE outside a live AI run. Both class names are built by runtime
 * interpolation, so no static search finds them and no test asserts their
 * appearance — `AllStatuses` below is the check that the styling actually
 * renders (spec manual check 5).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { GeneratingStep, type GenPairStatus } from "./GeneratingStep";
import "../AIInterpolateModal.css";

const meta = {
  title: "AIInterpolate/Steps/GeneratingStep",
  component: GeneratingStep,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Per-pair job progress. ⚠️ The status modifiers " +
          "(`__gen-pair--{status}`) are built by RUNTIME INTERPOLATION, so " +
          "the full class names exist as literals nowhere — a dead-CSS sweep " +
          "misreads them as unused. Task 09 deleted 8 classes on exactly that " +
          "reading and task 22 restored them. Note that `pending` has NO rule " +
          "of its own and correctly falls through to the base style: the " +
          "union has FIVE members while the CSS styles four, deliberately.",
      },
    },
  },
  args: {
    pairs: [
      { pairIdx: 0, status: "completed" },
      { pairIdx: 1, status: "processing" },
      { pairIdx: 2, status: "pending" },
    ],
    loopBack: false,
    keyframeCount: 4,
  },
} satisfies Meta<typeof GeneratingStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A run in progress: one done, one working, one waiting. */
export const InProgress: Story = {};

/**
 * 🏁 All FIVE statuses at once — the visual proof that the re-attached
 * modifiers render. `pending` intentionally shows the base style.
 */
export const AllStatuses: Story = {
  args: {
    pairs: (
      [
        "pending",
        "queued",
        "processing",
        "completed",
        "failed",
      ] as GenPairStatus[]
    ).map((status, i) => ({ pairIdx: i, status })),
    keyframeCount: 6,
  },
};

/** The last pair is the wrap-around, and is labelled "Loop: Key n → Key 1". */
export const WithLoopBack: Story = {
  args: {
    pairs: [
      { pairIdx: 0, status: "completed" },
      { pairIdx: 1, status: "processing" },
    ],
    loopBack: true,
    keyframeCount: 2,
  },
};

/** A failed job. */
export const Failed: Story = {
  args: {
    pairs: [
      { pairIdx: 0, status: "completed" },
      { pairIdx: 1, status: "failed" },
    ],
  },
};

/** No pairs: renders nothing at all. */
export const Empty: Story = { args: { pairs: [] } };
