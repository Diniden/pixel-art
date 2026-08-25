/**
 * AppShell stories — the chrome both layouts share (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `AppShell` imports one React type module and one stylesheet. There is no
 * import through which a store could arrive, so these stories need nothing.
 *
 * ## Why the shell gets its own stories at all
 *
 * Because it is the thing that would break both layouts at once. The five
 * regions, the two 320px rails, the flex-grow centre and the
 * `app__side-panel--open` modifier are its markup, not either layout's — and
 * both layouts pass it identical `leftPanel` / `rightPanel` / `bottomPanel`
 * shapes. Testing the arrangement here means the layout stories only have to
 * verify what they add on top: which regions exist and where focus mode
 * removes them.
 *
 * ⚠️ `NoLeftPanel` and `NoBottomPanel` are what focus mode looks like from the
 * shell's side. The shell has **no `focusMode` prop** — focus mode is the
 * caller passing `undefined`, which is why the shell needs no branch to test
 * and cannot get the two regions out of step.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "./AppShell";
import { StubCanvas, StubList, StubRegion } from "../../layouts/regionStubs";
import {
  DEFAULT_RAIL_LAYOUT,
  flipBottomEdge,
  scaleRail,
  stepRail,
} from "../../layout/railLayout";

const meta = {
  title: "Components/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  header: <StubRegion label="Header" height={48} />,
  toolbar: <StubRegion label="Toolbar" height={44} />,
  leftPanel: <StubList label="Left rail" density="typical" grow />,
  rightPanel: <StubList label="Right rail" density="typical" grow />,
  bottomPanel: <StubRegion label="Bottom" height={120} />,
  children: <StubCanvas />,
};

export const Default: Story = { args: base };

/** Focus mode, half of it: no left rail. */
export const NoLeftPanel: Story = {
  args: { ...base, leftPanel: undefined },
};

/** Focus mode, the other half: no bottom timeline. */
export const NoBottomPanel: Story = {
  args: { ...base, bottomPanel: undefined },
};

/** Focus mode proper — both optional regions omitted. */
export const FocusMode: Story = {
  args: { ...base, leftPanel: undefined, bottomPanel: undefined },
};

/* ══════════════════════════════════════════════════════════════════════════
 *  THE RAIL ARRANGEMENT (2026-08-25)
 *
 *  Each story below is a real `RailLayout` produced by the model's own
 *  functions rather than a hand-written literal, so a story cannot show an
 *  arrangement the app is incapable of reaching.
 * ══════════════════════════════════════════════════════════════════════════ */

/** ⭐ One click of the left rail's right arrow: both rails on the right. */
export const BothRailsOnTheRight: Story = {
  args: { ...base, layout: stepRail(DEFAULT_RAIL_LAYOUT, "left", 1) },
};

/** ⭐ A second click: the left rail is now the right-most column. */
export const LeftRailIsRightMost: Story = {
  args: {
    ...base,
    layout: stepRail(stepRail(DEFAULT_RAIL_LAYOUT, "left", 1), "left", 1),
  },
};

/** Both rails stacked on the LEFT, with the canvas taking the right half. */
export const BothRailsOnTheLeft: Story = {
  args: { ...base, layout: stepRail(DEFAULT_RAIL_LAYOUT, "right", -1) },
};

/** The timeline flipped above the canvas. */
export const TimelineAtTop: Story = {
  args: { ...base, layout: flipBottomEdge(DEFAULT_RAIL_LAYOUT) },
};

/** The extremes of the four size steps, side by side in one shell. */
export const MixedScales: Story = {
  args: {
    ...base,
    layout: scaleRail(
      scaleRail(scaleRail(DEFAULT_RAIL_LAYOUT, "left", 1), "right", -1),
      "bottom",
      1,
    ),
  },
};
