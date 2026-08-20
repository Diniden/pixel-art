/**
 * ProjectSelectModal stories (REFRESH task 36, W27).
 *
 * 🏁 NO STORE PROVIDER. Four of its six members are async project-lifecycle
 * actions — now `flow`s on `DomainStore` — and they arrive as
 * promise-returning callbacks, so a story can stand them up with `fn()`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectSelectModal } from "./ProjectSelectModal";

const meta = {
  component: ProjectSelectModal,
  args: {
    onClose: fn(),
    projectName: "Base Unit",
    projectList: ["Base Unit", "Terrain Tiles", "UI Icons"],
    onSwitchProject: fn(async () => true),
    onCreateProject: fn(async () => true),
    onDeleteProject: fn(async () => true),
    onRefreshProjectList: fn(async () => {}),
  },
} satisfies Meta<typeof ProjectSelectModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** EMPTY: a fresh install — no projects on disk yet. */
export const NoProjects: Story = {
  args: { projectList: [], projectName: "" },
};

/** TYPICAL: a handful of projects, one of them current. */
export const Typical: Story = {};

/** EDGE: a long list with long names — scrolling and truncation. */
export const ManyLongNames: Story = {
  args: {
    projectName: "Base Unit",
    projectList: [
      "Base Unit",
      ...Array.from(
        { length: 20 },
        (_, i) => `Heavy Assault Walker — variant rig mk ${i + 1}`,
      ),
    ],
  },
};

/**
 * EDGE: every lifecycle action REJECTS the operation. The dialog must surface
 * the failure rather than closing as though it had worked.
 */
export const ActionsFail: Story = {
  args: {
    onSwitchProject: fn(async () => false),
    onCreateProject: fn(async () => false),
    onDeleteProject: fn(async () => false),
  },
};
