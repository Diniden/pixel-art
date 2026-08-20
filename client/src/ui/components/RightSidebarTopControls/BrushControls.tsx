/**
 * BrushControls — brush size, reference-trace sizing, and gaussian fill
 * (REFRESH task 35).
 *
 * The three size-shaped groups of the old `RightSidebarTopControls`, which
 * share one property: each is a slider (or a segmented max-selector) that
 * scales a stamp. They are one component because they are never shown
 * together — `selectedTool` picks at most one — and because splitting them
 * further would produce three two-prop components with identical markup.
 *
 * ⚠️ **The sliders must stay pixel-identical** (task 35, gate 2). Until task
 * 18 they were styled by `ColorPicker.css` *by accident*; task 18 gave them
 * `blocks/slider.css`'s `slider` class and task 20 BEM-converted the group.
 * So the `className="slider"` on each `<input type="range">` below is
 * load-bearing and is copied verbatim from the pre-split file, as are the
 * `min`/`max`/`step` triples. This component deliberately does NOT adopt the
 * `Slider` / `SliderWithNumber` primitives: task 36 owns wholesale primitive
 * adoption, and swapping the markup here is exactly the phantom styling
 * change the spec warns would be "chased for hours".
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: this file's own stylesheet only. No React import, no domain type,
 * no store.
 */
import {
  GAUSSIAN_RADIUS_MAX_OPTIONS,
  TRACE_MAX_OPTIONS,
  TRACE_NUDGE_OPTIONS,
} from "./brushOptions";
import "./RightSidebarTopControls.css";

/** The `uiState.gaussianFill` record, restated structurally so this file
 *  needs no domain-type import. */
export interface GaussianFillParams {
  smoothing: number;
  radius: number;
  radiusMax: number;
}

export interface BrushControlsProps {
  /** Show the plain `fill-square` size slider. */
  showBrushSize: boolean;
  /** Show the reference-trace size / max / nudge trio. */
  showTraceBrush: boolean;
  /** Show the gaussian-fill smoothing / radius / radius-max trio. */
  showGaussianFill: boolean;

  brushSize: number;
  onBrushSizeChange: (size: number) => void;

  /** `uiState.pencilBrushMax ?? 16` — the trace slider's upper bound. */
  traceMax: number;
  onTraceMaxChange: (max: number) => void;
  /** `uiState.traceNudgeAmount ?? 10` — Shift+WASD step. */
  traceNudge: number;
  onTraceNudgeChange: (nudge: number) => void;

  gaussianFill: GaussianFillParams;
  onGaussianFillChange: (params: GaussianFillParams) => void;
}

export function BrushControls({
  showBrushSize,
  showTraceBrush,
  showGaussianFill,
  brushSize,
  onBrushSizeChange,
  traceMax,
  onTraceMaxChange,
  traceNudge,
  onTraceNudgeChange,
  gaussianFill,
  onGaussianFillChange,
}: BrushControlsProps) {
  const gaussianRadiusMax = gaussianFill.radiusMax;

  return (
    <>
      {showBrushSize && (
        <div className="right-sidebar-top-controls__control">
          <label className="right-sidebar-top-controls__label">Size</label>
          <div className="right-sidebar-top-controls__row">
            <input
              className="slider"
              type="range"
              min="1"
              max="16"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
            />
            <span className="right-sidebar-top-controls__value">
              {brushSize}
            </span>
          </div>
        </div>
      )}

      {showTraceBrush && (
        <>
          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">
              Trace size
            </label>
            <div className="right-sidebar-top-controls__row">
              <input
                className="slider"
                type="range"
                min="1"
                max={traceMax}
                value={Math.min(brushSize, traceMax)}
                onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
              />
              <span className="right-sidebar-top-controls__value">
                {Math.min(brushSize, traceMax)}
              </span>
            </div>
          </div>

          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">
              Trace max
            </label>
            <div className="right-sidebar-top-controls__segmented">
              {TRACE_MAX_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`right-sidebar-top-controls__segment ${traceMax === opt ? "right-sidebar-top-controls__segment--active" : ""}`}
                  onClick={() => onTraceMaxChange(opt)}
                  title={`Set max trace size to ${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">
              Trace nudge
            </label>
            <div className="right-sidebar-top-controls__segmented">
              {TRACE_NUDGE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`right-sidebar-top-controls__segment ${traceNudge === opt ? "right-sidebar-top-controls__segment--active" : ""}`}
                  onClick={() => onTraceNudgeChange(opt)}
                  title={`Shift+WASD moves by ${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showGaussianFill && (
        <>
          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">
              Smoothing
            </label>
            <div className="right-sidebar-top-controls__row">
              <input
                className="slider"
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={gaussianFill.smoothing}
                onChange={(e) =>
                  onGaussianFillChange({
                    smoothing: parseFloat(e.target.value),
                    radius: gaussianFill.radius,
                    radiusMax: gaussianRadiusMax,
                  })
                }
              />
              <span className="right-sidebar-top-controls__value">
                {gaussianFill.smoothing.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">Radius</label>
            <div className="right-sidebar-top-controls__row">
              <input
                className="slider"
                type="range"
                min="0.5"
                max={gaussianRadiusMax}
                step="0.1"
                value={Math.min(gaussianFill.radius, gaussianRadiusMax)}
                onChange={(e) =>
                  onGaussianFillChange({
                    smoothing: gaussianFill.smoothing,
                    radius: parseFloat(e.target.value),
                    radiusMax: gaussianRadiusMax,
                  })
                }
              />
              <span className="right-sidebar-top-controls__value">
                {gaussianFill.radius.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="right-sidebar-top-controls__control">
            <label className="right-sidebar-top-controls__label">
              Radius Max
            </label>
            <div className="right-sidebar-top-controls__segmented">
              {GAUSSIAN_RADIUS_MAX_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`right-sidebar-top-controls__segment ${gaussianRadiusMax === opt ? "right-sidebar-top-controls__segment--active" : ""}`}
                  onClick={() =>
                    onGaussianFillChange({
                      smoothing: gaussianFill.smoothing,
                      radius: Math.min(gaussianFill.radius, opt),
                      radiusMax: opt,
                    })
                  }
                  title={`Set max radius to ${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
