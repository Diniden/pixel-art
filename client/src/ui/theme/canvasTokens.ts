/**
 * Canvas-drawn theme colours — the single source for every colour painted
 * into a <canvas> 2D context.
 *
 * A canvas fill/stroke cannot read a CSS custom property, so these are string
 * literals. To keep `styles/tokens.css` the one source of truth, the module
 * is split in two:
 *
 *  - `CSS_MIRROR` — values that ALSO exist as custom properties in
 *    tokens.css. The parity test (`__tests__/canvasTokens.test.ts`) parses
 *    tokens.css and fails the build if either side drifts. Change the CSS
 *    token first; this file follows.
 *  - Canvas-only values — colours that appear in no stylesheet. This module
 *    IS their source of truth.
 *
 * Pure constants: nothing here may import a store, the API, or MobX (the
 * `ui/` boundary), and consumers on the hot render path pay no lookup cost.
 */

/** Mirrored tokens, keyed by their tokens.css custom-property name. */
export const CSS_MIRROR = {
  "--accent-primary": "#00d9ff",
  "--accent-primary-30": "rgba(0, 217, 255, 0.3)",
  "--accent-variant": "#8b5cf6",
  "--accent-variant-60": "rgba(139, 92, 246, 0.6)",
  "--status-warn": "#f59e0b",
  "--bg-tertiary": "#1a1a25",
  "--bg-hover": "#2a2a3a",
  "--canvas-checker-b": "#222230",
  "--overlay-60": "rgba(0, 0, 0, 0.6)",
  "--white": "#fff",
  "--white-05": "rgba(255, 255, 255, 0.05)",
  "--white-08": "rgba(255, 255, 255, 0.08)",
  "--black": "#000",
} as const;

/* Semantic names for the mirrored values. */
export const ACCENT_PRIMARY = CSS_MIRROR["--accent-primary"];
export const ACCENT_PRIMARY_30 = CSS_MIRROR["--accent-primary-30"];
export const ACCENT_VARIANT = CSS_MIRROR["--accent-variant"];
export const ACCENT_VARIANT_60 = CSS_MIRROR["--accent-variant-60"];
export const STATUS_WARN = CSS_MIRROR["--status-warn"];
/** Dark-mode canvas checkerboard: --bg-hover / --canvas-checker-b. */
export const CHECKER_DARK_A = CSS_MIRROR["--bg-hover"];
export const CHECKER_DARK_B = CSS_MIRROR["--canvas-checker-b"];
export const OVERLAY_60 = CSS_MIRROR["--overlay-60"];
export const WHITE = CSS_MIRROR["--white"];
export const WHITE_05 = CSS_MIRROR["--white-05"];
export const WHITE_08 = CSS_MIRROR["--white-08"];
export const BLACK = CSS_MIRROR["--black"];

/* ------------------------------------------------------------------ *
 * Canvas-only values — no CSS counterpart; defined here and only here.
 * ------------------------------------------------------------------ */

/** Selection mask tint (string form of renderSelectionOverlay's MASK_FILL). */
export const ACCENT_PRIMARY_14 = "rgba(0, 217, 255, 0.14)";
/** Lighting-preview border. */
export const ACCENT_PRIMARY_25 = "rgba(0, 217, 255, 0.25)";
/** Brush outline overlay. */
export const ACCENT_PRIMARY_55 = "rgba(0, 217, 255, 0.55)";

/**
 * Trace/object-bounds orange. NOTE the measured drift: rgb(255, 171, 0) is
 * one red unit off --accent-warning's #ffaa00 = rgb(255, 170, 0). Both
 * observed values are pinned by tests (renderFrameOverlay.test.ts), so they
 * are kept exact; collapsing onto the CSS ramp is an owner call.
 */
export const WARN_ORANGE_60 = "rgba(255, 171, 0, 0.6)";
export const WARN_ORANGE_40 = "rgba(255, 171, 0, 0.4)";

/** Drag shade over the original selection area (string twin of renderSelectionOverlay DRAG_SHADE). */
export const BLACK_12 = "rgba(0, 0, 0, 0.12)";

/** Light-mode canvas grid stroke (dark mode uses --white-05). */
export const BLACK_08 = "rgba(0, 0, 0, 0.08)";

/** Export-preview origin cross — deliberately not the UI danger red. */
export const ORIGIN_CROSS_RED = "#ff3232";

/* NormalPicker's shaded sphere — a lit-ball illusion, not UI chrome. */
export const NORMAL_SPHERE_HI = "#4a5568";
export const NORMAL_SPHERE_MID = "#2d3748";
export const NORMAL_SPHERE_LO = "#1a202c";
export const NORMAL_SPHERE_EDGE = "#718096";
export const NORMAL_SPHERE_GRID = "rgba(113, 128, 150, 0.4)";
