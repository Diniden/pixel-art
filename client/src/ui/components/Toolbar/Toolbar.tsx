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
import {
  Maximize2,
  Sun,
  Moon,
  Film,
  Palette,
  Lightbulb,
  Brush,
} from "lucide-react";
import type { StudioMode } from "../../../types";
import "./Toolbar.css";

/**
 * The three studio buttons, in display order. Each mode carries its own
 * `--<mode>` modifier so the active tint is per-mode CSS, not an
 * `[aria-label=…]` attribute selector (brush-studio task 03).
 */
const STUDIO_MODES: ReadonlyArray<{
  id: StudioMode;
  label: string;
  icon: typeof Palette;
}> = [
  { id: "pixel", label: "Pixel Studio", icon: Palette },
  { id: "lighting", label: "Lighting Studio", icon: Lightbulb },
  { id: "brush", label: "Brush Studio", icon: Brush },
];

interface ToolbarProps {
  /** `uiState.studioMode` — which of the three studios is showing. */
  studioMode: StudioMode;
  /**
   * Whether the focus button reads as ENGAGED — i.e. anything is hidden.
   *
   * ⚠️ Not "focus mode is on": a rail dismissed by its own × engages it too
   * (owner, 2026-08-30), because this button is the way rails come back. The
   * container passes the derived `focusModeEngaged`.
   */
  isFocusMode: boolean;
  isLightGrid: boolean;
  isFrameReferenceVisible: boolean;
  onSetStudioMode: (mode: StudioMode) => void;
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

/**
 * Which tool group a studio shows. Exhaustive on purpose: a fourth mode must
 * be routed here explicitly rather than falling through to the pixel tools.
 * `"brush"` shares the pixel tool table (MASTER §1 interpretation, D19).
 */
function toolsForStudio(
  mode: StudioMode,
  pixelStudioTools: ReactNode,
  lightingStudioTools: ReactNode,
): ReactNode {
  switch (mode) {
    case "pixel":
      return pixelStudioTools;
    case "lighting":
      return lightingStudioTools;
    case "brush":
      return pixelStudioTools;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function Toolbar({
  studioMode,
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
          {/* ⚠️ The label names what pressing it DOES, and the two are not
              opposites: engaged, it restores every hidden rail (including
              individually dismissed ones); un-engaged, it hides the two rails
              focus mode has always hidden. */}
          <Tooltip
            content={isFocusMode ? "Show all panels (`)" : "Focus Mode (`)"}
          >
            <button
              className={`toolbar__tool-btn ${isFocusMode ? "toolbar__tool-btn--active" : ""}`}
              onClick={onToggleFocusMode}
              aria-label={isFocusMode ? "Show all panels" : "Focus Mode"}
              aria-pressed={isFocusMode}
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
          {/* The frame-reference panel belongs to the PIXEL studio only —
              exact match, so a new mode does not inherit it by accident. */}
          {studioMode === "pixel" && (
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
          {STUDIO_MODES.map(({ id, label, icon }) => (
            <Tooltip key={id} content={label}>
              <button
                className={classNames(
                  "toolbar__studio-mode-btn",
                  `toolbar__studio-mode-btn--${id}`,
                  studioMode === id && "toolbar__studio-mode-btn--active",
                )}
                onClick={() => onSetStudioMode(id)}
                aria-label={label}
                aria-pressed={studioMode === id}
              >
                <span className="toolbar__tool-icon">
                  <Icon icon={icon} />
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="toolbar__divider" />

      {/* Conditional Tools based on Studio Mode */}
      {toolsForStudio(studioMode, pixelStudioTools, lightingStudioTools)}
    </div>
  );
}
