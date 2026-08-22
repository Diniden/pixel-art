/**
 * LoadingLayout stories — gate 2 of REFRESH task 37, third layout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No `StoreProvider`, no `ApplicationStore`, no MobX. The layout imports React
 * types and one stylesheet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ `Failed` IS THE STORY THAT MATTERS — IT IS R5's VISIBLE HALF
 * ══════════════════════════════════════════════════════════════════════════
 *
 * R5 was the highest-severity bug in the repo: a failed project load installed
 * `createDefaultProject()` and the auto-save then wrote that blank project over
 * the owner's real 1.1 MB file. W10 closed the store half — a failed load now
 * installs nothing and the auto-save gate stays shut. **This page is what the
 * user sees instead**, and it is the only place the fix is visible.
 *
 * Three things it must show, and this story is where they get reviewed:
 *
 *   1. it is an ERROR, not an empty editor and not an eternal spinner;
 *   2. the reassurance that nothing on disk has changed — the sentence that
 *      tells a worried owner their file is intact;
 *   3. a Retry that re-runs the whole init flow.
 *
 * ⚠️ **Spec correction.** The task 37 spec gives `LoadingLayout` a two-prop
 * interface (`title`, `message`) and cites `App.tsx:154-164`. `App.tsx` at
 * HEAD has TWO early returns sharing this block, not one — `:195-214` (failed)
 * and `:216-226` (loading). Building only the spec's version would have
 * deleted the failed page. `Loading` below renders the spec's markup exactly.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingLayout } from "./LoadingLayout";

const meta = {
  title: "Layouts/LoadingLayout",
  component: LoadingLayout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoadingLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Cold start. Spinner, "Loading Pixel Art Editor", "Preparing your
 * workspace..." — `App.tsx:216-226` character for character, and what
 * `<LoadingLayout />` with no props renders.
 */
export const Loading: Story = { args: {} };

/**
 * ⭐ The failed load. No spinner, the server's message, the disk-safety
 * sentence, and Retry. This is what `AppContainer` renders when
 * `domain.loadState === "failed"`.
 */
export const Failed: Story = {
  args: {
    variant: "failed",
    message: "GET /api/project failed: 500 Internal Server Error",
    detail:
      "Nothing has been changed on disk — your project file is untouched.",
    onRetry: () => {},
  },
};

/**
 * The failed page with no message from the server — `loadError` is `null`
 * whenever the thrown value was not an `ApiError` (a network drop, a parse
 * failure). `AppContainer`'s `??` supplies this fallback.
 */
export const FailedWithoutMessage: Story = {
  args: {
    variant: "failed",
    detail:
      "Nothing has been changed on disk — your project file is untouched.",
    onRetry: () => {},
  },
};

/** A named project in the title — the `title`/`message` props from the spec. */
export const CustomMessage: Story = {
  args: {
    title: "Loading Base Unit",
    message: "Applying 8 schema migrations...",
  },
};
