/**
 * CheckingStep — the readiness spinner shown while the AI service health
 * check is in flight (REFRESH task 34, from `AIInterpolateModal.tsx:917-923`).
 *
 * PURE: imports nothing at all. No props, no state, no store — the check
 * itself runs in `useInterpolationJob`, which is a container concern.
 */
export function CheckingStep() {
  return (
    <div className="ai-interpolate-modal__heartbeat">
      <div className="ai-interpolate-modal__heartbeat-spinner" />
      <p className="ai-interpolate-modal__heartbeat-text">
        Connecting to AI service...
      </p>
      <p className="ai-interpolate-modal__heartbeat-subtext">
        Running a readiness check to verify the model is loaded and operational.
      </p>
    </div>
  );
}

export default CheckingStep;
