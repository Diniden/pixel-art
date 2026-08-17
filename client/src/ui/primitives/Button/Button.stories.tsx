import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

/**
 * THE PROOF STORY — exactly one story file in task 10, by design.
 *
 * Story COVERAGE for the real component set follows the tier sequence in later
 * tasks. Two components (`RightSidebarTopControls`, `PixelStudioPanel`) would
 * render broken today for reasons unrelated to Storybook — their classes are
 * styled by a DIFFERENT component's stylesheet (`ColorPicker.css` and
 * `LightingStudioPanel.css` respectively) — and tasks 15/16 fix that. Do not
 * add their stories here and do not chase it as a Storybook config problem.
 *
 * What this file is for: it is the CAPTURED BASELINE for the harness itself.
 * Each story below is a check a human performs before task 12 substitutes 585
 * colour, 32 radius and 30 transition literals for tokens:
 *
 *   Default    -> the reset's global `button` rule is loading (requirement 3).
 *                 If this renders as a native OS button, `src/index.css` did
 *                 not reach the preview.
 *   Variants   -> tokens are resolving (requirement 1). Unset `var()`s render
 *                 as transparent/inherited, so a flat grey row means
 *                 tokens.css is missing.
 *   Monospace  -> requirement 5, the easiest to miss. The label must be
 *                 JetBrains Mono, NOT fallback `monospace`. Fonts come from
 *                 .storybook/preview-head.html only.
 *   OnDarkCanvas -> requirement 6. The surrounding canvas must be #0a0a0f.
 *                 On Storybook's default white every component is invisible.
 *   StaticAsset -> `staticDirs` is serving `client/public` (favicon.svg).
 */

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: {
    // This file's stories are small; centre them rather than inheriting the
    // preview's `fullscreen`, which is meant for layout-level stories.
    layout: "centered",
  },
  args: {
    children: "Button",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "primary", "danger", "ghost"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    mono: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Requirement 3 — the global `button` rule from `styles/reset.css`.
 *
 * MUST render dark (`--bg-tertiary` #1a1a25) with a `--border-primary` #2d2d3d
 * border and 4px radius. A native OS button here means `src/index.css` never
 * reached the preview.
 */
export const Default: Story = {};

/**
 * Requirement 1 — design tokens resolve.
 *
 * `--accent-primary` #00d9ff, `--accent-danger` #ff3366, and the ghost variant
 * using `--text-secondary`. A row of identical grey buttons means `tokens.css`
 * is not loading and every `var()` fell back to its initial value.
 *
 * `--text-on-accent` and `--accent-hover` are two of the six properties that
 * were referenced but never defined until task 09; the primary variant uses
 * both, so this story is also their visual confirmation.
 */
export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button>Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
};

/**
 * ⚠️ REQUIREMENT 5 — THE FONT CHECK. The single easiest thing to miss.
 *
 * The web fonts are `<link>` tags in `client/index.html`, which Storybook NEVER
 * reads; they are re-declared in `.storybook/preview-head.html`. 44 declarations
 * across the stylesheets use `var(--font-mono)`.
 *
 * The mono row MUST render in JetBrains Mono, visibly different from the sans
 * row above it. Both rows looking the same means `preview-head.html` is not
 * being applied and every `var(--font-mono)` in the app is silently falling
 * back to generic `monospace` in every story you will ever review.
 *
 * The digits and the `0`/`O` pair are the tell: JetBrains Mono slashes its zero.
 */
export const Monospace: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
      <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
        Outfit (--font-sans) vs JetBrains Mono (--font-mono) — they must differ:
      </span>
      <Button>0O 1lI 123 sans</Button>
      <Button mono>0O 1lI 123 mono</Button>
    </div>
  ),
};

/**
 * Requirement 6 — the dark canvas, and requirement 1 for the surface tokens.
 *
 * The panel below uses `--bg-secondary` and `--border-primary`; the page behind
 * it must be `--bg-primary` #0a0a0f. A white canvas means the `backgrounds`
 * parameter in `preview.tsx` is not applying, and every future story will be
 * reviewed against the wrong ground.
 */
export const OnDarkCanvas: Story = {
  render: () => (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-md)",
        padding: 24,
        display: "flex",
        gap: 12,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <Button variant="primary">Confirm</Button>
      <Button variant="ghost">Cancel</Button>
    </div>
  ),
};

/**
 * `staticDirs: ["../public"]` in `.storybook/main.ts`.
 *
 * `/favicon.svg` must resolve. A broken image means `client/public` is not
 * being served and any future story referencing an asset by absolute path will
 * fail the same way.
 */
export const StaticAsset: Story = {
  render: () => (
    <Button>
      <img src="/favicon.svg" alt="" width={16} height={16} />
      Static asset from client/public
    </Button>
  ),
};
