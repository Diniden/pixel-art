/**
 * ReviewStep — the generated sequence strip plus the animation preview
 * (REFRESH task 34, from `AIInterpolateModal.tsx:1160-1216`).
 *
 * PURE: React types, the two `parts/` components, nothing else.
 *
 * Shown in the `review` step AND during `generating` once at least one pair
 * has completed, which is why it takes the whole sequence rather than a
 * "finished" flag: cells whose base64 has not arrived yet render the spinner
 * placeholder, so the strip fills in as jobs land.
 *
 * ⚠️ W14 applies here too — `ai-interpolate-modal__preview-item--${item.type}`
 * is a runtime-interpolated modifier over the `"keyframe" | "generated"` union.
 * No static search finds those two class names. Do not delete them as dead.
 */
import { Base64Thumbnail } from "../parts/Base64Thumbnail";
import { SyncedAnimatedPreview } from "../parts/SyncedAnimatedPreview";

/** One cell of the generated sequence. */
export interface SequenceItem {
  type: "keyframe" | "generated";
  /** Base64 PNG body; empty means "not generated yet" → placeholder. */
  base64: string;
  /** Original frame index, keyframes only; drives the "Key n" label. */
  keyIdx?: number;
}

export interface ReviewStepProps {
  /** Keyframes interleaved with their generated frames, in playback order. */
  sequence: SequenceItem[];
  /** Non-empty base64 frames, in order — what the preview animates. */
  animationFrames: string[];
  /** The keyframe held under each animation frame, index-aligned. */
  keyframeSyncFrames: string[];
  previewFps: number;
  onPreviewFpsChange: (fps: number) => void;
}

export function ReviewStep({
  sequence,
  animationFrames,
  keyframeSyncFrames,
  previewFps,
  onPreviewFpsChange,
}: ReviewStepProps) {
  if (sequence.length === 0) return null;

  return (
    <div className="ai-interpolate-modal__preview-section">
      <h4 className="ai-interpolate-modal__preview-label">
        Generated Sequence
      </h4>
      <div className="ai-interpolate-modal__preview-strip">
        {sequence.map((item, idx) => (
          <div
            key={idx}
            // ⚠️ W14: interpolated modifier — see the header.
            className={`ai-interpolate-modal__preview-item ai-interpolate-modal__preview-item--${item.type}`}
          >
            {item.base64 ? (
              <Base64Thumbnail base64={item.base64} size={48} />
            ) : (
              <div className="ai-interpolate-modal__placeholder">
                <div className="ai-interpolate-modal__placeholder-spinner" />
              </div>
            )}
            <span className="ai-interpolate-modal__preview-item-label">
              {item.type === "keyframe"
                ? `Key ${(item.keyIdx ?? 0) + 1}`
                : `Gen`}
            </span>
          </div>
        ))}
      </div>

      {animationFrames.length > 1 && (
        <div className="ai-interpolate-modal__animation">
          <div className="ai-interpolate-modal__animation-header">
            <h4 className="ai-interpolate-modal__preview-label">
              Animation Preview
            </h4>
            <div className="ai-interpolate-modal__fps-control">
              <label>FPS:</label>
              <input
                type="number"
                min={1}
                max={120}
                value={previewFps}
                onChange={(e) =>
                  onPreviewFpsChange(
                    Math.max(1, Math.min(120, parseInt(e.target.value) || 8)),
                  )
                }
                className="ai-interpolate-modal__fps-input"
              />
            </div>
          </div>
          <SyncedAnimatedPreview
            newFrames={animationFrames}
            oldFrames={keyframeSyncFrames}
            size={128}
            fps={previewFps}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewStep;
