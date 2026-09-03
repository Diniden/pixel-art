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
 * The Apple Pencil hover marker (`renderHoverMarker`).
 *
 * Deliberately FAINTER than the lighting studio's brush overlay above: that
 * overlay marks where paint IS being applied, this one marks where paint WOULD
 * be. A hover marker at the same weight would read as a committed stroke, and
 * on the pixel canvas it sits over the artwork itself rather than over a
 * normal-map edit surface. Canvas-only values; no CSS counterpart.
 */
export const HOVER_MARKER_FILL = "rgba(0, 217, 255, 0.10)";
export const HOVER_MARKER_STROKE = "rgba(0, 217, 255, 0.35)";

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

/* ------------------------------------------------------------------ *
 * Layer-focus dimming (plan 05, locked decisions D4 and D10)
 *
 * These are NOT colours and have no CSS counterpart — they are OPACITY
 * multipliers applied to a whole layer canvas while a variant is being
 * edited, so a reader can tell the edited variant from its surroundings.
 * They live in the canvas-only section deliberately: `CSS_MIRROR` is for
 * values that must byte-match `styles/tokens.css`, and there is no token
 * for either of these on either side.
 *
 * ⚠️ Moved here VERBATIM from `ui/canvas/render/renderScene.ts:76-80`,
 * which task 05 deleted (D10). The values, and the rules that select
 * between them, are the ones `CanvasContainer`'s variant-edit branch has
 * always used:
 *
 *   | Layer, while a variant is being edited | Opacity |
 *   | -------------------------------------- | ------- |
 *   | Regular layer, `layerFocusMode === "normal"` | 1.0        |
 *   | Regular layer, otherwise                     | REGULAR_DIM |
 *   | The variant layer being edited               | 1.0        |
 *   | Another variant layer, `normal`              | 1.0        |
 *   | Another variant layer, otherwise             | OTHER_DIM  |
 *
 * ⚠️ `layerFocusMode === "onion"` is NOT an opacity. It is outline-only
 * rendering driven by a 4-neighbour emptiness test, and it stays a
 * PAINT-time decision inside the per-layer painter. Expressing it here —
 * or as a CSS opacity — renders solid silhouettes instead of outlines.
 * ------------------------------------------------------------------ */

/** Dimming applied to a regular layer while a variant is being edited. */
export const VARIANT_EDIT_REGULAR_DIM = 0.5;
/** Dimming applied to a NON-edited variant layer while a variant is being edited. */
export const VARIANT_EDIT_OTHER_DIM = 0.7;
/**
 * Opacity of the in-flight preview (brush) pixels.
 *
 * ⚠️ Applies to the BRUSH preview only. The SHAPE tools paint their preview
 * opaque and ring its silhouette instead — a translucent shape blends into
 * artwork of a similar colour and reads as being drawn underneath it
 * (2026-09-01). See `renderChrome`.
 */
export const PREVIEW_ALPHA = 0.6;

/**
 * The ring around an in-flight shape preview, tracing exactly the cells the
 * operation will affect.
 *
 * White at half alpha over a dark editor, which is legible against artwork of
 * ANY colour — including white, where the ring's own translucency lets the
 * pixel show through rather than disappearing into it. It marks EXTENT, not
 * colour, so it is deliberately not derived from the tool's colour.
 */
export const PREVIEW_RING = "rgba(255, 255, 255, 0.5)";

/**
 * Ring width in CELL units — the whole surface is magnified by the CSS
 * transform, so this is a hairline at any zoom rather than a fixed pixel
 * count that would swell into a slab when zoomed in.
 */
export const PREVIEW_RING_WIDTH = 0.08;
