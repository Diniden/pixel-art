/**
 * LayoutThumbnail — a miniature of the shell, drawn from a `RailLayout`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ DERIVED FROM THE SAME MODEL `AppShell` RENDERS FROM — NOT A PICTURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious implementation is a hand-drawn icon per preset. It is also the
 * one that goes stale: change a preset's slots and the icon still shows the
 * old arrangement, and nothing catches it — a thumbnail that lies is worse
 * than no thumbnail, because the user picks by it.
 *
 * So this reads `railsOnSide`, `layout.bottom.edge` and `layout.toolbar.edge`
 * — the exact three questions `AppShell` asks — and lays out five boxes the
 * same way the real shell lays out five regions. A preset whose data changes
 * gets a new thumbnail for free, and a custom preset the user saves gets a
 * correct one with no authoring at all.
 *
 * ── Scale is shown as WIDTH, deliberately unlike the real shell ───────────
 *
 * A rail's scale is a `transform: scale()` on its contents in `AppShell`, not
 * a width. At 96px tall there is nothing legible to scale, so the miniature
 * spends the one dimension it has: a `huge` rail draws visibly fatter than a
 * `compact` one. That is a faithful summary of the CONSEQUENCE (a bigger rail
 * takes more room from the canvas) even though the mechanism differs.
 *
 * `ui/` boundary: React types, `railLayout`'s pure helpers, `classNames`, own
 * CSS. No store, no MobX.
 */
import {
  railsOnSide,
  type RailLayout,
  type RailScale,
  type SideRailName,
} from "../../layout/railLayout";
import { classNames } from "../../classNames";
import "./LayoutPresetPicker.css";

/**
 * How wide each rail draws, as a share of the thumbnail.
 *
 * Four steps that stay visibly distinct at 130px wide — a linear ramp from
 * the real scale factors put `compact` and `regular` within a pixel of each
 * other and the two read as identical.
 */
const RAIL_WIDTH: Record<RailScale, string> = {
  compact: "13%",
  regular: "18%",
  large: "23%",
  huge: "28%",
};

/** How tall the bottom rail draws, by the same reasoning. */
const BOTTOM_HEIGHT: Record<RailScale, string> = {
  compact: "14%",
  regular: "19%",
  large: "24%",
  huge: "29%",
};

/**
 * Which rail is which, for the tint.
 *
 * The two side rails are drawn in DIFFERENT tints on purpose: half of what a
 * preset says is which of the two crossed the canvas, and two identical grey
 * boxes cannot express that. `left` is Objects & Layers, `right` is Tools.
 */
const RAIL_TINT: Record<SideRailName, string> = {
  left: "layout-thumb__rail--a",
  right: "layout-thumb__rail--b",
};

export interface LayoutThumbnailProps {
  layout: RailLayout;
  /** Marks the toolbar strip, so the accent reads as "the tools are here". */
  accent?: boolean;
  /**
   * Where the thumbnail's HEIGHT comes from. One choice, not two flags,
   * because the two answers are mutually exclusive.
   *
   *  - `"fill"` (the default) — take whatever height the card leaves after
   *    the name. ⚠️ The CARD carries the 5:4 ratio; a thumbnail with a ratio
   *    of its own would fight it for the height and one of the two would
   *    overflow.
   *  - `"standalone"` — supply a 5:4 shape of its own, for use with no card
   *    around it (the Storybook composition).
   */
  fit?: "fill" | "standalone";
}

export function LayoutThumbnail({
  layout,
  accent = false,
  fit = "fill",
}: LayoutThumbnailProps) {
  const side = (which: "left" | "right") =>
    railsOnSide(layout, which).map((rail) => (
      <div
        key={rail}
        className={classNames("layout-thumb__rail", RAIL_TINT[rail])}
        style={{ width: RAIL_WIDTH[layout[rail].scale] }}
      />
    ));

  /* The toolbar is drawn INSIDE the canvas area, exactly as the shell docks
     it — a strip along one of the four edges. `flex-direction` on the canvas
     area plus `order` is how `AppShell.css` does it; the miniature uses the
     same two properties so the two cannot disagree about which edge is which. */
  const timeline = (
    <div
      className="layout-thumb__bottom"
      style={{ height: BOTTOM_HEIGHT[layout.bottom.scale] }}
    />
  );

  return (
    <div
      className={classNames("layout-thumb", `layout-thumb--${fit}`)}
      aria-hidden="true"
    >
      {/* The header is fixed chrome — it has no layout setting, but leaving
          it out makes every thumbnail read as top-heavy against the real
          screen it is standing in for. */}
      <div className="layout-thumb__header" />

      {layout.bottom.edge === "top" ? timeline : null}

      <div className="layout-thumb__main">
        {side("left")}
        <div
          className={classNames(
            "layout-thumb__canvas-area",
            `layout-thumb__canvas-area--toolbar-${layout.toolbar.edge}`,
          )}
        >
          <div
            className={classNames(
              "layout-thumb__toolbar",
              accent && "layout-thumb__toolbar--accent",
            )}
          />
          <div className="layout-thumb__canvas" />
        </div>
        {side("right")}
      </div>

      {layout.bottom.edge === "bottom" ? timeline : null}
    </div>
  );
}
