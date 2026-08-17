import type { Preview } from "@storybook/react-vite";

/**
 * The 8 things a story must load, or it renders differently from production.
 *
 * Every one of these is applied by the app OUTSIDE the React tree, so a story
 * that omits it is not showing you the component the app ships.
 *
 *  1. Design tokens        -> src/styles/tokens.css (via src/index.css)
 *     ~950 `var()` references across the stylesheets. Without it every colour,
 *     radius, font and transition is unset. Non-negotiable.
 *  2. The reset            -> src/styles/reset.css (via src/index.css)
 *     `* { box-sizing: border-box }`; every padded element is the wrong size
 *     without it.
 *  3. Global element styling -> src/styles/reset.css
 *     `button`, `input`, `select`, `input[type=number]`, `input[type=range]`
 *     and its `::-webkit-slider-thumb`. ColorPicker, LightControl,
 *     RightSidebarTopControls, Toolbar and PixelStudioPanel each render an
 *     `<input type="range">` whose ENTIRE track and thumb styling comes from
 *     here — without it a story renders native OS sliders.
 *  4. Custom scrollbars    -> src/styles/reset.css (`::-webkit-scrollbar*`)
 *  5. Web fonts            -> .storybook/preview-head.html
 *     ⚠️ NOT in any CSS file — they are <link> tags in client/index.html, which
 *     Storybook does not read. See that file's comment.
 *  6. Dark background      -> the `backgrounds` parameter below.
 *     The palette is dark-on-dark (--bg-primary #0a0a0f, --text-primary
 *     #e8e8f0); on Storybook's default white canvas every component is
 *     near-invisible.
 *  7. `#root` sizing       -> the `fullHeight` decorator below.
 *     reset.css sets `html, body, #root { height: 100% }`; Storybook's canvas
 *     root is not `#root`, so layout-level stories need a full-height ancestor
 *     supplied explicitly.
 *  8. App-level CSS        -> src/App.css (shell classes used by layout stories)
 *
 * Import order below is load-bearing: src/index.css is task 09's manifest and
 * emits tokens BEFORE reset, and App.css must land after both.
 */
import "../src/index.css";
import "../src/App.css";

/** The literal value of `--bg-primary` in src/styles/tokens.css. */
const BG_PRIMARY = "#0a0a0f";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: BG_PRIMARY }],
    },
    layout: "fullscreen",

    // ── a11y: ADVISORY, PERMANENTLY ─────────────────────────────────────────
    //
    // OWNER DECISION (2026-08-16): the a11y addon stays at `test: "todo"`
    // INDEFINITELY. It is never promoted to `"error"`. An earlier draft of the
    // plan scheduled that promotion for task 19 once the primitives landed;
    // THAT PROMOTION IS CANCELLED. No build in this plan fails on an
    // accessibility violation — violations are reported for humans to read.
    //
    // The accessibility WORK is unaffected and still happens: task 19's
    // primitives build in role="dialog", aria-modal, focus trapping and Escape
    // handling (fixing 14 modals, 9 toggles and 142 tooltips as they adopt the
    // primitives), and task 36 fixes the keyboard-inoperable LayerColors
    // toggles. Only the build-failing GATE is dropped.
    //
    // Do not change this to "error" in this task or any other.
    a11y: { test: "todo" },
  },

  decorators: [
    // Requirement 7. reset.css sizes `#root`, which does not exist in the story
    // canvas, so supply the full-height ancestor that layout stories assume.
    (Story) => (
      <div style={{ height: "100%", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
