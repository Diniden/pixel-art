/**
 * ConfigureStep — the keyframe strip and the settings tab (REFRESH task 34,
 * from `AIInterpolateModal.tsx:960-1157`).
 *
 * PURE: React, its own two sibling step/part components, nothing else. No
 * store, no API, no MobX.
 *
 * This is the one step that stays mounted across three modal steps
 * (`configure`, `generating`, `review`), because the keyframe strip remains
 * visible while jobs run. `step` therefore selects the heading and disables
 * interaction rather than deciding whether to render.
 *
 * ⚠️ Thumbnails cross the boundary as BASE64 STRINGS, never as pixel grids.
 * R2: the owner's real project is 300,249 cells, and handing a grid to a
 * `ui/` component as a prop is how "MobX is slow" gets manufactured. The
 * container encodes them via `ui/utils/frameEncoding`.
 *
 * ── The loop line ─────────────────────────────────────────────────────────
 * The curve that marks a wrap-around is positioned by MEASURING the first and
 * last keyframe elements (`offsetLeft`/`offsetWidth`) after layout. That is
 * DOM reading, which is allowed in `ui/` — it is presentation, not state —
 * and it is why this component owns the `framesRow` ref rather than receiving
 * a computed style from the container.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Base64Thumbnail } from "../parts/Base64Thumbnail";
import { GeneratingStep, type GenPairView } from "./GeneratingStep";

export type ConfigTab = "keyframes" | "settings";

/** The three modal steps during which this component is mounted. */
export type ConfigureStepPhase = "configure" | "generating" | "review";

export interface ConfigureStepProps {
  phase: ConfigureStepPhase;
  /** Base64 PNG bodies, one per source frame, in order. */
  frameThumbnails: string[];
  /** Selected keyframe indices, ascending. */
  sortedKeyframes: number[];
  /** Fast membership test for the strip. */
  isKeyframe: (idx: number) => boolean;
  onFrameClick: (idx: number) => void;

  activeTab: ConfigTab;
  onTabChange: (tab: ConfigTab) => void;

  loopBack: boolean;
  onLoopBackChange: (value: boolean) => void;

  numFrames: number;
  onNumFramesChange: (value: number) => void;
  scale: number;
  onScaleChange: (value: number) => void;
  flowScale: number;
  onFlowScaleChange: (value: number) => void;

  /** Non-null only when the selection actually changes the timeline. */
  warningMessage: string | null;
  isGenerating: boolean;

  /** Base mode only: the chosen layer and the way back to the picker. */
  selectedLayerName?: string | null;
  onChangeLayer?: (() => void) | undefined;

  /** Per-pair progress, rendered inside the keyframes tab while generating. */
  pairJobs: GenPairView[];
  /** Completed/total, for the "Processing pair n of m" heading. */
  completedPairs: number;
  totalPairs: number;
}

export function ConfigureStep({
  phase,
  frameThumbnails,
  sortedKeyframes,
  isKeyframe,
  onFrameClick,
  activeTab,
  onTabChange,
  loopBack,
  onLoopBackChange,
  numFrames,
  onNumFramesChange,
  scale,
  onScaleChange,
  flowScale,
  onFlowScaleChange,
  warningMessage,
  isGenerating,
  selectedLayerName,
  onChangeLayer,
  pairJobs,
  completedPairs,
  totalPairs,
}: ConfigureStepProps) {
  const framesRowRef = useRef<HTMLDivElement>(null);
  const [loopLineStyle, setLoopLineStyle] =
    useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (!loopBack || sortedKeyframes.length < 2 || !framesRowRef.current) {
      setLoopLineStyle(null);
      return;
    }

    const row = framesRowRef.current;
    const firstKeyIdx = sortedKeyframes[0];
    const lastKeyIdx = sortedKeyframes[sortedKeyframes.length - 1];
    const firstEl = row.querySelector(
      `[data-frame-idx="${firstKeyIdx}"]`,
    ) as HTMLElement | null;
    const lastEl = row.querySelector(
      `[data-frame-idx="${lastKeyIdx}"]`,
    ) as HTMLElement | null;

    if (!firstEl || !lastEl) {
      setLoopLineStyle(null);
      return;
    }

    const firstCenter = firstEl.offsetLeft + firstEl.offsetWidth / 2;
    const lastCenter = lastEl.offsetLeft + lastEl.offsetWidth / 2;

    setLoopLineStyle({
      marginLeft: firstCenter,
      width: lastCenter - firstCenter,
    });
  }, [loopBack, sortedKeyframes, frameThumbnails]);

  /**
   * A frame sits "between" keyframes when it will be REPLACED by generated
   * output — either strictly inside a pair, or (when looping) after the last
   * keyframe. Ported verbatim from the modal's inline IIFE, hoisted to a memo
   * so it is computed once per render rather than once per thumbnail.
   */
  const betweenFlags = useMemo(() => {
    const flags = new Array<boolean>(frameThumbnails.length).fill(false);
    if (sortedKeyframes.length < 2) return flags;
    const last = sortedKeyframes[sortedKeyframes.length - 1];
    for (let idx = 0; idx < frameThumbnails.length; idx++) {
      if (isKeyframe(idx)) continue;
      for (let i = 0; i < sortedKeyframes.length - 1; i++) {
        if (idx > sortedKeyframes[i] && idx < sortedKeyframes[i + 1]) {
          flags[idx] = true;
          break;
        }
      }
      if (!flags[idx] && loopBack && idx > last) flags[idx] = true;
    }
    return flags;
  }, [frameThumbnails.length, sortedKeyframes, loopBack, isKeyframe]);

  return (
    <>
      {selectedLayerName && (
        <div className="ai-interpolate-modal__selected-bar">
          <span>
            Layer: <strong>{selectedLayerName}</strong>
          </span>
          <button
            className="ai-interpolate-modal__change-layer-btn"
            onClick={onChangeLayer}
            disabled={isGenerating}
          >
            Change
          </button>
        </div>
      )}

      <div className="ai-interpolate-modal__tabs">
        <button
          className={`ai-interpolate-modal__tab ${
            activeTab === "keyframes" ? "ai-interpolate-modal__tab--active" : ""
          }`}
          onClick={() => onTabChange("keyframes")}
          disabled={isGenerating}
        >
          Keyframes
          {sortedKeyframes.length > 0 && (
            <span className="ai-interpolate-modal__tab-badge">
              {sortedKeyframes.length}
            </span>
          )}
        </button>
        <button
          className={`ai-interpolate-modal__tab ${
            activeTab === "settings" ? "ai-interpolate-modal__tab--active" : ""
          }`}
          onClick={() => onTabChange("settings")}
          disabled={isGenerating}
        >
          Settings
        </button>
      </div>

      {activeTab === "keyframes" && (
        <div className="ai-interpolate-modal__tab-content">
          <div className="ai-interpolate-modal__keyframes-header">
            <div>
              <h3 className="ai-interpolate-modal__step-title">
                {phase === "review"
                  ? "Review Generated Frames"
                  : phase === "generating"
                    ? `Processing pair ${Math.min(
                        completedPairs + 1,
                        totalPairs,
                      )} of ${totalPairs}...`
                    : "Select Keyframes"}
              </h3>
              {phase === "configure" && (
                <p className="ai-interpolate-modal__step-desc">
                  Click frames to toggle them as keyframes. {numFrames} frame
                  {numFrames !== 1 ? "s" : ""} will be generated between each
                  consecutive pair.
                </p>
              )}
            </div>
            {phase === "configure" && (
              <label className="ai-interpolate-modal__loop-toggle">
                <input
                  type="checkbox"
                  checked={loopBack}
                  onChange={(e) => onLoopBackChange(e.target.checked)}
                  disabled={isGenerating}
                />
                <span className="ai-interpolate-modal__loop-switch" />
                <span className="ai-interpolate-modal__loop-label">Loop</span>
              </label>
            )}
          </div>

          <div className="ai-interpolate-modal__frames-strip">
            <div
              className="ai-interpolate-modal__frames-row"
              ref={framesRowRef}
            >
              {frameThumbnails.map((thumb, idx) => {
                const isKey = isKeyframe(idx);
                return (
                  <div
                    key={idx}
                    data-frame-idx={idx}
                    className={`ai-interpolate-modal__frame-item ${
                      isKey ? "ai-interpolate-modal__frame-item--keyframe" : ""
                    } ${
                      betweenFlags[idx]
                        ? "ai-interpolate-modal__frame-item--between"
                        : ""
                    }`}
                    onClick={() => onFrameClick(idx)}
                  >
                    <Base64Thumbnail base64={thumb} size={48} />
                    <span className="ai-interpolate-modal__frame-label">
                      {isKey
                        ? `Key ${sortedKeyframes.indexOf(idx) + 1}`
                        : `#${idx + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>
            {loopLineStyle && (
              <div
                className="ai-interpolate-modal__loop-line"
                style={loopLineStyle}
              />
            )}
          </div>

          {warningMessage && phase === "configure" && (
            <div className="ai-interpolate-modal__warning">
              {warningMessage}
            </div>
          )}

          {phase === "generating" && (
            <GeneratingStep
              pairs={pairJobs}
              loopBack={loopBack}
              keyframeCount={sortedKeyframes.length}
            />
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="ai-interpolate-modal__tab-content">
          <h3 className="ai-interpolate-modal__step-title">
            Interpolation Settings
          </h3>
          <p className="ai-interpolate-modal__step-desc">
            Adjust parameters that control the AI interpolation.
          </p>

          <div className="ai-interpolate-modal__settings-grid">
            <div className="ai-interpolate-modal__setting-row">
              <div className="ai-interpolate-modal__setting-info">
                <label className="ai-interpolate-modal__setting-label">
                  Frames Between Keyframes
                </label>
                <span className="ai-interpolate-modal__setting-hint">
                  Number of frames generated between each consecutive keyframe
                  pair.
                </span>
              </div>
              <input
                type="number"
                className="ai-interpolate-modal__setting-input"
                min={1}
                max={64}
                value={numFrames}
                onChange={(e) =>
                  onNumFramesChange(
                    Math.max(1, Math.min(64, parseInt(e.target.value) || 1)),
                  )
                }
                disabled={isGenerating}
              />
            </div>

            <div className="ai-interpolate-modal__setting-row">
              <div className="ai-interpolate-modal__setting-info">
                <label className="ai-interpolate-modal__setting-label">
                  Pixel Art Upscale
                </label>
                <span className="ai-interpolate-modal__setting-hint">
                  Upscale factor before inference. Pixel art is small; higher
                  values give the model more detail to work with.
                </span>
              </div>
              <div className="ai-interpolate-modal__setting-range-group">
                <input
                  type="range"
                  className="ai-interpolate-modal__setting-range"
                  min={1}
                  max={16}
                  step={1}
                  value={scale}
                  onChange={(e) => onScaleChange(parseInt(e.target.value))}
                  disabled={isGenerating}
                />
                <span className="ai-interpolate-modal__setting-value">
                  {scale}x
                </span>
              </div>
            </div>

            <div className="ai-interpolate-modal__setting-row">
              <div className="ai-interpolate-modal__setting-info">
                <label className="ai-interpolate-modal__setting-label">
                  Flow Estimation Scale
                </label>
                <span className="ai-interpolate-modal__setting-hint">
                  Controls precision of motion estimation. Higher = finer detail
                  but slower. Default 1.0 works well for most cases.
                </span>
              </div>
              <div className="ai-interpolate-modal__setting-range-group">
                <input
                  type="range"
                  className="ai-interpolate-modal__setting-range"
                  min={0.25}
                  max={4.0}
                  step={0.25}
                  value={flowScale}
                  onChange={(e) => onFlowScaleChange(parseFloat(e.target.value))}
                  disabled={isGenerating}
                />
                <span className="ai-interpolate-modal__setting-value">
                  {flowScale.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ConfigureStep;
