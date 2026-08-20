/**
 * UnavailableStep — shown when the health check concluded the service cannot
 * take work (REFRESH task 34, from `AIInterpolateModal.tsx:926-936`).
 *
 * PURE: React types and `lucide-react`'s icon data only.
 *
 * `detail` distinguishes the three failure modes the check separates: the
 * server is unreachable, the service reported not-ok, or the proxy is up but
 * has no remote configured. That last one is why the check cannot simply
 * trust `status === "ok"`.
 */
import { Wand2 } from "lucide-react";
import { Icon } from "../../../primitives/Icon/Icon";

export interface UnavailableStepProps {
  /** Why it is unavailable. `null` renders an empty detail line. */
  detail: string | null;
}

export function UnavailableStep({ detail }: UnavailableStepProps) {
  return (
    <div className="ai-interpolate-modal__unavailable">
      <div className="ai-interpolate-modal__unavailable-icon">
        <Icon icon={Wand2} size={32} />
      </div>
      <h3 className="ai-interpolate-modal__unavailable-title">
        AI Service Unavailable
      </h3>
      <p className="ai-interpolate-modal__unavailable-detail">{detail}</p>
      <p className="ai-interpolate-modal__unavailable-hint">
        Make sure the AI service is running on the configured remote machine and
        the URL is correct.
      </p>
    </div>
  );
}

export default UnavailableStep;
