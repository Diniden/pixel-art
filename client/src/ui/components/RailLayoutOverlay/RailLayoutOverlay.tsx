/**
 * RailLayoutOverlay — the dark scrim + controls that appear over ONE rail
 * while layout mode is on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE OVERLAY PER RAIL, RENDERED INSIDE THE RAIL IT CONTROLS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It is deliberately NOT one full-screen overlay that draws three boxes at
 * computed coordinates. Each overlay is a child of its own rail and is
 * absolutely positioned to fill it, so it follows that rail automatically
 * when the rail moves slot, changes scale, or is hidden by focus mode. There
 * is no measurement, no resize listener, and no way for the scrim to drift
 * away from the thing it is dimming.
 *
 * The consequence worth stating: a rail that is not rendered has no overlay,
 * which is correct — focus mode hides the left and bottom rails, and there is
 * nothing there to re-arrange.
 *
 * ── The control set differs by rail, and the props express that ───────────
 *
 * Side rails get two arrows (move one slot left / right). The bottom rail
 * gets one flip button (top ⇄ bottom edge). The canvas toolbar gets four
 * edge arrows in a row, because it LOCKS to an edge rather than stepping
 * through an order. Rather than a `variant` string with runtime branching,
 * the mover control is passed as `move` — an arrow pair, a flip, or an edge
 * picker — so an impossible combination (a bottom rail with left/right
 * arrows) cannot be constructed.
 *
 * ⚠️ THE SCALE PAIR IS OPTIONAL AND THE TOOLBAR OMITS IT. The three panel
 * rails hold content that benefits from more room; the toolbar is sized by
 * its own controls, so a scale step there would be a setting with nothing to
 * apply it to (owner, 2026-08-28).
 *
 * `ui/` boundary: React, lucide icons, `classNames`, and this component's own
 * CSS. No store, no MobX, no API.
 */
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
} from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import "./RailLayoutOverlay.css";

/**
 * The four edge arrows, as data.
 *
 * ⚠️ A STRAIGHT LINE, not a compass cross (owner, 2026-08-28). A 3×3 grid
 * reads nicely in the abstract but needs three rows of height, and the
 * toolbar's rail is 36px tall — the cross simply did not fit the space the
 * control has to live in. In a row the four buttons occupy one row's height
 * whichever edge the toolbar is docked to.
 *
 * The order is up / down / left / right rather than screen-clockwise, so the
 * two vertical and two horizontal choices sit together.
 */
const EDGE_BUTTONS = [
  { edge: "top", icon: ArrowUp },
  { edge: "bottom", icon: ArrowDown },
  { edge: "left", icon: ArrowLeft },
  { edge: "right", icon: ArrowRight },
] as const;

/** The two arrows a SIDE rail shows. */
export interface RailMoveArrows {
  kind: "arrows";
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

/** The single flip button the BOTTOM rail shows. */
export interface RailMoveFlip {
  kind: "flip";
  onFlip: () => void;
  /** Which edge the rail currently occupies — the button offers the other. */
  edge: "top" | "bottom";
}

/**
 * The four-way edge picker the CANVAS TOOLBAR shows.
 *
 * ⚠️ Four DIRECT choices, not a two-arrow stepper like the side rails. The
 * side rails step through an ordered track, so "left" and "right" mean
 * "one place along". The toolbar has no order — it is simply locked to one of
 * four edges — so each arrow names its destination and the arrow for the edge
 * you are already on is disabled rather than being a no-op.
 */
export interface RailMoveEdges {
  kind: "edges";
  edge: "top" | "bottom" | "left" | "right";
  onSetEdge: (edge: "top" | "bottom" | "left" | "right") => void;
}

export interface RailLayoutOverlayProps {
  /** Human name of the rail, shown above the controls. */
  label: string;
  move: RailMoveArrows | RailMoveFlip | RailMoveEdges;
  /**
   * The resize pair. OMIT IT ENTIRELY for a rail that does not resize — the
   * canvas toolbar is sized by its own controls, so a scale step there would
   * be a setting with nothing to apply it to (owner, 2026-08-28). The whole
   * group is one optional object rather than six optional props so "no
   * resizing" cannot be expressed half-way.
   */
  scale?: {
    onScaleUp: () => void;
    onScaleDown: () => void;
    canScaleUp: boolean;
    canScaleDown: boolean;
    /** 1-based step and total, rendered as "2 / 4" so the range is legible. */
    step: number;
    count: number;
  };
  /** Lays the controls out in a row rather than a column (the bottom rail). */
  horizontal?: boolean;
  /**
   * Compact skin for a rail with very little room — the toolbar, which is
   * 36px tall docked horizontally. Drops the label and tightens the panel so
   * the controls fit inside the rail instead of overflowing it.
   */
  compact?: boolean;
}

export function RailLayoutOverlay({
  label,
  move,
  scale,
  horizontal = false,
  compact = false,
}: RailLayoutOverlayProps) {
  return (
    <div
      className={classNames(
        "rail-overlay",
        horizontal && "rail-overlay--horizontal",
        compact && "rail-overlay--compact",
      )}
      // The scrim swallows clicks so the rail's real controls cannot be
      // operated by accident while layout mode is on.
      role="group"
      aria-label={`${label} layout controls`}
    >
      <div className="rail-overlay__panel">
        {/* The label is what a cramped rail can least afford, and the
            buttons' own titles already name the rail. */}
        {compact ? null : (
          <span className="rail-overlay__label">{label}</span>
        )}

        <div className="rail-overlay__row">
          {move.kind === "edges" ? (
            /* Four DIRECT choices in a straight line. The arrow for the
               current edge is disabled — pressing it would be a no-op the
               user cannot see. */
            <div className="rail-overlay__edges">
              {EDGE_BUTTONS.map(({ edge, icon }) => (
                <button
                  key={edge}
                  type="button"
                  className="rail-overlay__btn rail-overlay__edge-btn"
                  onClick={() => move.onSetEdge(edge)}
                  disabled={move.edge === edge}
                  aria-label={`Lock ${label} to the ${edge}`}
                  title={`Lock ${label} to the ${edge}`}
                >
                  <Icon icon={icon} size={16} />
                </button>
              ))}
            </div>
          ) : move.kind === "arrows" ? (
            <>
              <button
                type="button"
                className="rail-overlay__btn"
                onClick={move.onMoveLeft}
                disabled={!move.canMoveLeft}
                aria-label={`Move ${label} left`}
                title={`Move ${label} left`}
              >
                <Icon icon={ArrowLeft} size={16} />
              </button>
              <button
                type="button"
                className="rail-overlay__btn"
                onClick={move.onMoveRight}
                disabled={!move.canMoveRight}
                aria-label={`Move ${label} right`}
                title={`Move ${label} right`}
              >
                <Icon icon={ArrowRight} size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rail-overlay__btn rail-overlay__btn--wide"
              onClick={move.onFlip}
              aria-label={
                move.edge === "bottom"
                  ? `Move ${label} to the top`
                  : `Move ${label} to the bottom`
              }
              title={
                move.edge === "bottom"
                  ? `Move ${label} to the top`
                  : `Move ${label} to the bottom`
              }
            >
              <Icon
                icon={move.edge === "bottom" ? ArrowUp : ArrowDown}
                size={16}
              />
              <span>{move.edge === "bottom" ? "Move to top" : "Move to bottom"}</span>
            </button>
          )}
        </div>

        {scale ? (
          <div className="rail-overlay__row">
            <button
              type="button"
              className="rail-overlay__btn"
              onClick={scale.onScaleDown}
              disabled={!scale.canScaleDown}
              aria-label={`Shrink ${label}`}
              title={`Shrink ${label}`}
            >
              <Icon icon={Minus} size={16} />
            </button>
            <span className="rail-overlay__scale" aria-live="polite">
              {scale.step} / {scale.count}
            </span>
            <button
              type="button"
              className="rail-overlay__btn"
              onClick={scale.onScaleUp}
              disabled={!scale.canScaleUp}
              aria-label={`Grow ${label}`}
              title={`Grow ${label}`}
            >
              <Icon icon={Plus} size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
