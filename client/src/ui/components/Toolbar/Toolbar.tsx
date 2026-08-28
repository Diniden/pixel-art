/**
 * Toolbar — PURE (REFRESH task 36, W27).
 *
 * ── Primitive adoption: the bespoke portal tooltip is GONE ────────────────
 *
 * This component hand-rolled a fixed-position portal tooltip: a
 * `useState<{text,x,y,visible}>`, a `getBoundingClientRect()` in each of FIVE
 * `onMouseEnter` handlers, and a `.toolbar__fixed-tooltip` bubble. That exact
 * bubble is where task 19's `Tooltip` primitive got its skin — `.tooltip`'s
 * declarations are byte-identical to `.toolbar__fixed-tooltip`'s (verified by
 * diffing the two rule bodies), and the primitive's default `offset` of 10 is
 * this component's hard-coded `rect.bottom + 10`.
 *
 * So the swap is visually a no-op and behaviourally a strict improvement:
 * the primitive also shows on keyboard FOCUS and dismisses on Escape
 * (WCAG 1.4.13), neither of which the hand-rolled version did — it was
 * mouse-only.
 *
 * ⚠️ `.toolbar__fixed-tooltip` is now UNREFERENCED from this file but is
 * deliberately LEFT IN `Toolbar.css`. Deleting a CSS class is a W13/W14
 * concern, not this task's, and `check-classes.mjs` reports dead classes
 * rather than failing on them.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 *
 * All five store members arrive as props from `ToolbarContainer`. The two
 * child tool groups arrive as ELEMENTS (`pixelStudioTools` /
 * `lightingStudioTools`) for the same reason as `LightingStudioPanel`: they
 * are containers, and importing a container from `ui/` would pull MobX across
 * the purity boundary transitively.
 */
import type { ReactNode } from "react";
import { classNames } from "../../classNames";
import { Tooltip } from "../../primitives/Tooltip/Tooltip";
import { Icon } from "../../primitives/Icon/Icon";
import { Maximize2, Sun, Moon, Film, Palette, Lightbulb } from "lucide-react";
import "./Toolbar.css";

interface ToolbarProps {
  /** `uiState.studioMode === "lighting"` */
  isLightingMode: boolean;
  isFocusMode: boolean;
  isLightGrid: boolean;
  isFrameReferenceVisible: boolean;
  onSetStudioMode: (mode: "pixel" | "lighting") => void;
  onToggleFocusMode: () => void;
  onToggleLightGridMode: () => void;
  onToggleFrameReferencePanelVisible: () => void;
  /** `PixelStudioToolsContainer` element, injected by the container. */
  pixelStudioTools: ReactNode;
  /** `LightingStudioToolsContainer` element, injected by the container. */
  lightingStudioTools: ReactNode;
  /**
   * Which edge of the workspace the toolbar is docked to (layout mode).
   *
   * ⚠️ `left`/`right` are a RE-FLOW into a vertical column, not a rotation —
   * see `Toolbar.css`. Defaults to `top`, the historical arrangement, so a
   * caller that does not know about docking is unaffected.
   */
  edge?: "top" | "bottom" | "left" | "right";
  /**
   * How many lines the toolbar may spread its controls over — rows when it is
   * docked horizontally, columns when vertical.
   *
   * ⚠️ A MAXIMUM, not a fixed count: with few enough tools to fit on one line
   * the bar stays on one. Anything past the cap scrolls.
   */
  spread?: 1 | 2 | 3;
}

export function Toolbar({
  isLightingMode,
  isFocusMode,
  isLightGrid,
  isFrameReferenceVisible,
  onSetStudioMode,
  onToggleFocusMode,
  onToggleLightGridMode,
  onToggleFrameReferencePanelVisible,
  pixelStudioTools,
  lightingStudioTools,
  edge = "top",
  spread = 1,
}: ToolbarProps) {
  const isVertical = edge === "left" || edge === "right";
  return (
    <div
      className={classNames(
        "toolbar",
        `toolbar--${edge}`,
        isVertical && "toolbar--vertical",
        // 1 is the historical single line and carries no modifier, so the
        // default bar's class list is exactly what it always was.
        spread > 1 && `toolbar--spread-${spread}`,
      )}
    >
      {/* Focus Mode Toggle */}
      <div className="toolbar__section toolbar__section--focus-mode">
        <div className="toolbar__group">
          <Tooltip content="Focus Mode (`)">
            <button
              className={`toolbar__tool-btn ${isFocusMode ? "toolbar__tool-btn--active" : ""}`}
              onClick={onToggleFocusMode}
              aria-label="Focus Mode"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Maximize2} />
              </span>
              <span className="toolbar__tool-hotkey">`</span>
            </button>
          </Tooltip>
          <Tooltip
            content={
              isLightGrid ? "Dark Grid Background" : "Light Grid Background"
            }
          >
            <button
              className={`toolbar__tool-btn ${isLightGrid ? "toolbar__tool-btn--active toolbar__tool-btn--light-grid" : ""}`}
              onClick={onToggleLightGridMode}
              aria-label="Light Grid Background"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={isLightGrid ? Sun : Moon} />
              </span>
            </button>
          </Tooltip>
          {!isLightingMode && (
            <Tooltip
              content={
                isFrameReferenceVisible
                  ? "Hide Frame Reference"
                  : "Show Frame Reference"
              }
            >
              <button
                className={`toolbar__tool-btn ${isFrameReferenceVisible ? "toolbar__tool-btn--active" : ""}`}
                onClick={onToggleFrameReferencePanelVisible}
                aria-label="Frame Reference"
              >
                <span className="toolbar__tool-icon">
                  <Icon icon={Film} />
                </span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="toolbar__divider" />

      {/* Studio Mode Toggle */}
      <div className="toolbar__section toolbar__section--studio-mode">
        <div className="toolbar__studio-mode-toggle">
          <Tooltip content="Pixel Studio">
            <button
              className={`toolbar__studio-mode-btn ${!isLightingMode ? "toolbar__studio-mode-btn--active" : ""}`}
              onClick={() => onSetStudioMode("pixel")}
              aria-label="Pixel Studio"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Palette} />
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Lighting Studio">
            <button
              className={`toolbar__studio-mode-btn ${isLightingMode ? "toolbar__studio-mode-btn--active" : ""}`}
              onClick={() => onSetStudioMode("lighting")}
              aria-label="Lighting Studio"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Lightbulb} />
              </span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="toolbar__divider" />

      {/* Conditional Tools based on Studio Mode */}
      {isLightingMode ? lightingStudioTools : pixelStudioTools}
    </div>
  );
}
