/**
 * CanvasViewControls — the floating control cluster over a canvas viewport.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ RESET RESETS THE *VIEW*, NOT THE PIXEL SCALE — TWO DIFFERENT ZOOMS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The editor has two independent scales and the reset button touches exactly
 * one of them:
 *
 *  - **`zoom`** — the PIXEL SCALE (2–50): how many screen pixels one sprite
 *    pixel occupies. It changes what is rasterised, and it is a deliberate
 *    per-sprite choice. **Reset leaves it alone** (owner decision).
 *  - **`viewZoom`** — the VIEW TRANSFORM (0.25–4): a CSS `scale()` over the
 *    already-drawn canvas, moved by pinch and ctrl+wheel. **This is what the
 *    button returns to 100%**, along with recentring the pan.
 *
 * The reset button exists because those two gestures can strand the workspace
 * off-screen with no way back — which is exactly what happened during this
 * feature's own testing, and is far easier to do on an iPad than with a
 * mouse. It is the "I'm lost, put it back" affordance.
 *
 * ## Layout (2026-08-29, split canvas render modes)
 *
 * A bottom-anchored ROW of two groups:
 *
 *   __stack (column)          __offsets (row, only with `onNudgeOffset`)
 *   [mode]   ← open the other render mode, or swap sides when both are open
 *   [close]? ← only when two panes are open
 *   [reset]                   [←] [↑] [↓] [→]
 *
 * The mode button is ALWAYS the top of the stack — "always above the zoom
 * reset button" was the request — and the offset arrows mimic WASD: a plain
 * click nudges the selected variant's offset on this frame, shift-click on
 * ALL frames (the same meaning `useCanvasKeyboard` gives Shift+WASD; it is
 * not a bigger step). Every button shares one class so they stay the same
 * square size.
 *
 * With only `onResetView` the component renders exactly the single button it
 * always has, so existing call sites are unchanged.
 *
 * `ui/` boundary: React types, icons, its own CSS. Labels arrive as strings,
 * so this component never learns the render-mode union.
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Columns2,
  Locate,
  X,
} from "lucide-react";
import type { MouseEvent } from "react";
import { Icon } from "../../primitives/Icon/Icon";
import "./CanvasViewControls.css";

export interface CanvasViewControlsProps {
  /** Recentre the workspace and return the view to 100%. */
  onResetView: () => void;
  /** The button ABOVE reset: open the other render mode, or swap pane sides. */
  modeButton?: {
    kind: "open" | "swap";
    /** e.g. "Open Layer view" / "Swap panes" — used as title + aria-label. */
    label: string;
    onClick: () => void;
  };
  /** Close THIS pane. Only passed when two panes are open. */
  onClose?: { label: string; onClick: () => void };
  /** Variant-offset arrows (Full mode, variant layer selected). `allFrames` = shift held. */
  onNudgeOffset?: (dx: number, dy: number, allFrames: boolean) => void;
}

const ARROWS = [
  { icon: ArrowLeft, dx: -1, dy: 0, name: "left" },
  { icon: ArrowUp, dx: 0, dy: -1, name: "up" },
  { icon: ArrowDown, dx: 0, dy: 1, name: "down" },
  { icon: ArrowRight, dx: 1, dy: 0, name: "right" },
] as const;

export function CanvasViewControls({
  onResetView,
  modeButton,
  onClose,
  onNudgeOffset,
}: CanvasViewControlsProps) {
  return (
    <div className="canvas-view-controls">
      <div className="canvas-view-controls__stack">
        {modeButton && (
          <button
            type="button"
            className="canvas-view-controls__btn"
            data-kind={modeButton.kind}
            onClick={modeButton.onClick}
            title={modeButton.label}
            aria-label={modeButton.label}
          >
            <span className="canvas-view-controls__icon">
              <Icon
                icon={modeButton.kind === "swap" ? ArrowLeftRight : Columns2}
                size={14}
              />
            </span>
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="canvas-view-controls__btn"
            onClick={onClose.onClick}
            title={onClose.label}
            aria-label={onClose.label}
          >
            <span className="canvas-view-controls__icon">
              <Icon icon={X} size={14} />
            </span>
          </button>
        )}
        <button
          type="button"
          className="canvas-view-controls__btn"
          onClick={onResetView}
          title="Center the workspace and return to 100%"
          aria-label="Center the workspace and return to 100% zoom"
        >
          {/* Icon only: the button is an action, not a readout. A live
              percentage over the canvas is one more thing to read, and the
              title/aria-label already say what pressing it does. */}
          <span className="canvas-view-controls__icon">
            <Icon icon={Locate} size={14} />
          </span>
        </button>
      </div>
      {onNudgeOffset && (
        <div className="canvas-view-controls__offsets">
          {ARROWS.map(({ icon, dx, dy, name }) => (
            <button
              key={name}
              type="button"
              className="canvas-view-controls__btn canvas-view-controls__btn--arrow"
              onClick={(e: MouseEvent<HTMLButtonElement>) =>
                onNudgeOffset(dx, dy, e.shiftKey)
              }
              title={`Nudge variant ${name} (shift: all frames)`}
              aria-label={`Nudge variant ${name} (shift: all frames)`}
            >
              <span className="canvas-view-controls__icon">
                <Icon icon={icon} size={14} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
