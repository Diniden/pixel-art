/**
 * GeneratingStep — per-pair job progress (REFRESH task 34, from
 * `AIInterpolateModal.tsx:1069-1090`).
 *
 * PURE: React types only.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ W14 — THE STATUS CLASS NAMES ARE BUILT BY RUNTIME INTERPOLATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Both modifiers below are template literals:
 *
 *     `ai-interpolate-modal__gen-pair--${status}`
 *     `ai-interpolate-modal__gen-pair-status--${status}`
 *
 * so the full class names exist as literals NOWHERE — not in this file and not
 * in the stylesheet's selectors' provenance. **No static search will find
 * them.** A dead-CSS sweep sees unreferenced rules; a dead-code sweep sees an
 * unused union member. Neither is true. Task 09 already deleted 8 classes on
 * exactly that mistaken reading and task 22 had to restore the styling as BEM
 * modifiers. Do not delete or rename these.
 *
 * `PairJobStatus` has FIVE members while the AI service's wire status has
 * four: `"pending"` is client-side only (submitted-but-no-job-id-yet) and has
 * NO rule of its own — it correctly falls through to the base
 * `.ai-interpolate-modal__gen-pair` style. That is deliberate, not an
 * oversight, and it is the reason a naive "the CSS covers 4 of 5 states" audit
 * misreads this component.
 *
 * The status type is redeclared here rather than imported from
 * `containers/hooks/useInterpolationJob` because `ui/` may not import from
 * `containers/`. The two are kept in step by `AIInterpolateModal`'s props,
 * which typecheck against both.
 */

/** Mirrors `PairJobStatus` in `containers/hooks/useInterpolationJob.ts`. */
export type GenPairStatus =
  "pending" | "queued" | "processing" | "completed" | "failed";

export interface GenPairView {
  /** Position in the pair list; used for the label only. */
  pairIdx: number;
  status: GenPairStatus;
}

export interface GeneratingStepProps {
  pairs: GenPairView[];
  /** The last pair is the wrap-around when true, and is labelled as such. */
  loopBack: boolean;
  /** Keyframe count, for the "Key n → Key 1" loop label. */
  keyframeCount: number;
}

/** The human label for each status. `pending` is the client-only one. */
const STATUS_TEXT: Record<GenPairStatus, string> = {
  pending: "Waiting",
  queued: "Queued",
  processing: "Processing...",
  completed: "Done",
  failed: "Failed",
};

export function GeneratingStep({
  pairs,
  loopBack,
  keyframeCount,
}: GeneratingStepProps) {
  if (pairs.length === 0) return null;

  return (
    <div className="ai-interpolate-modal__gen-progress">
      {pairs.map((pj, i) => (
        <div
          key={i}
          // ⚠️ W14: interpolated modifier — see the header before touching.
          className={`ai-interpolate-modal__gen-pair ai-interpolate-modal__gen-pair--${pj.status}`}
        >
          <span className="ai-interpolate-modal__gen-pair-label">
            {loopBack && i === pairs.length - 1
              ? `Loop: Key ${keyframeCount} → Key 1`
              : `Pair ${i + 1}: Key ${i + 1} → Key ${i + 2}`}
          </span>
          <span
            // ⚠️ W14: interpolated modifier — see the header before touching.
            className={`ai-interpolate-modal__gen-pair-status ai-interpolate-modal__gen-pair-status--${pj.status}`}
          >
            {STATUS_TEXT[pj.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

export default GeneratingStep;
