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
 * gets one flip button (top ⇄ bottom edge). BOTH get the scale pair. Rather
 * than a `variant` string with runtime branching, the mover control is passed
 * as `move` — either an arrow pair or a flip — so an impossible combination
 * (a bottom rail with left/right arrows) cannot be constructed.
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

export interface RailLayoutOverlayProps {
  /** Human name of the rail, shown above the controls. */
  label: string;
  move: RailMoveArrows | RailMoveFlip;
  onScaleUp: () => void;
  onScaleDown: () => void;
  canScaleUp: boolean;
  canScaleDown: boolean;
  /** 1-based step and total, rendered as "2 / 4" so the range is legible. */
  scaleStep: number;
  scaleCount: number;
  /** Lays the controls out in a row rather than a column (the bottom rail). */
  horizontal?: boolean;
}

export function RailLayoutOverlay({
  label,
  move,
  onScaleUp,
  onScaleDown,
  canScaleUp,
  canScaleDown,
  scaleStep,
  scaleCount,
  horizontal = false,
}: RailLayoutOverlayProps) {
  return (
    <div
      className={classNames(
        "rail-overlay",
        horizontal && "rail-overlay--horizontal",
      )}
      // The scrim swallows clicks so the rail's real controls cannot be
      // operated by accident while layout mode is on.
      role="group"
      aria-label={`${label} layout controls`}
    >
      <div className="rail-overlay__panel">
        <span className="rail-overlay__label">{label}</span>

        <div className="rail-overlay__row">
          {move.kind === "arrows" ? (
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

        <div className="rail-overlay__row">
          <button
            type="button"
            className="rail-overlay__btn"
            onClick={onScaleDown}
            disabled={!canScaleDown}
            aria-label={`Shrink ${label}`}
            title={`Shrink ${label}`}
          >
            <Icon icon={Minus} size={16} />
          </button>
          <span className="rail-overlay__scale" aria-live="polite">
            {scaleStep} / {scaleCount}
          </span>
          <button
            type="button"
            className="rail-overlay__btn"
            onClick={onScaleUp}
            disabled={!canScaleUp}
            aria-label={`Grow ${label}`}
            title={`Grow ${label}`}
          >
            <Icon icon={Plus} size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
