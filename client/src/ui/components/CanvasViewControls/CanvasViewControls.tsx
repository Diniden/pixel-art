/**
 * CanvasViewControls — the floating control column over the canvas viewport.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ IT RESETS THE *VIEW*, NOT THE PIXEL SCALE — TWO DIFFERENT ZOOMS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The editor has two independent scales and this control touches exactly one
 * of them:
 *
 *  - **`zoom`** — the PIXEL SCALE (2–50): how many screen pixels one sprite
 *    pixel occupies. It changes what is rasterised, and it is a deliberate
 *    per-sprite choice. **This button leaves it alone** (owner decision).
 *  - **`viewZoom`** — the VIEW TRANSFORM (0.25–4): a CSS `scale()` over the
 *    already-drawn canvas, moved by pinch and ctrl+wheel. **This is what the
 *    button returns to 100%**, along with recentring the pan.
 *
 * The button exists because those two gestures can strand the workspace
 * off-screen with no way back — which is exactly what happened during this
 * feature's own testing, and is far easier to do on an iPad than with a
 * mouse. It is the "I'm lost, put it back" affordance.
 *
 * A column rather than a row: it sits in the bottom-left of the canvas area
 * and is expected to gain siblings, so the stack direction is established now
 * rather than being retrofitted around a single button.
 *
 * `ui/` boundary: React types, an icon, `classNames`, its own CSS.
 */
import { Locate } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import "./CanvasViewControls.css";

export interface CanvasViewControlsProps {
  /** Recentre the workspace and return the view to 100%. */
  onResetView: () => void;
}

export function CanvasViewControls({ onResetView }: CanvasViewControlsProps) {
  return (
    <div className="canvas-view-controls">
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
  );
}
