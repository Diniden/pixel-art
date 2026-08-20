/**
 * AIInterpolateModal — the PURE shell (REFRESH task 34).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE: NOTHING UNDER `ui/components/AIInterpolate/` IMPORTS A STORE,
 *     THE API, OR MOBX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The pre-refactor file was 1,267 lines with `const store = useEditorStore()`
 * at line 316 — the worst store coupling in the codebase — plus three
 * duplicated encoders, a 136-line job submitter, a 182-line commit routine and
 * 46 hooks. All of that moved OUT:
 *
 *   the encoders    → `ui/utils/frameEncoding.ts`     (byte-equality gated)
 *   the job flow    → `containers/hooks/useInterpolationJob.ts`
 *   the commit      → `stores/domain/applyInterpolation.ts`
 *   the wiring      → `containers/AIInterpolateContainer.tsx`
 *
 * What is left here is step orchestration: which step is showing, which
 * buttons that step offers, and nothing else. Every value arrives as a prop
 * and every effect leaves as a callback, which is what makes the stories
 * mountable with no provider of any kind.
 *
 * ── Modal chrome comes from the task-19 primitive ─────────────────────────
 * Including its backdrop-close behaviour, which tracks the MOUSEDOWN ORIGIN so
 * a drag that starts inside the panel and releases over the overlay does NOT
 * close the modal. This file was, notably, the only one of 14 legacy modals to
 * get that right; the primitive preserves it (`Modal.tsx`'s
 * `handleBackdropMouseDown`/`handleBackdropClick`), and adopting it adds the
 * `role="dialog"`, `aria-modal`, focus trap and Escape handling the original
 * lacked.
 *
 * ⚠️ `onClose` is withheld while generating — the original hid its close
 * button and ignored backdrop clicks mid-run, and passing no `onClose` to the
 * primitive reproduces exactly that (no close button, no Escape, no backdrop
 * close) rather than approximating it.
 */
import { Wand2 } from "lucide-react";
import { Modal } from "../../primitives/Modal/Modal";
import { Icon } from "../../primitives/Icon/Icon";
import { CheckingStep } from "./steps/CheckingStep";
import { UnavailableStep } from "./steps/UnavailableStep";
import { SelectLayerStep } from "./steps/SelectLayerStep";
import {
  ConfigureStep,
  type ConfigTab,
  type ConfigureStepPhase,
} from "./steps/ConfigureStep";
import { ReviewStep, type SequenceItem } from "./steps/ReviewStep";
import type { GenPairView } from "./steps/GeneratingStep";
import "./AIInterpolateModal.css";

export type ModalStep =
  | "checking"
  | "unavailable"
  | "select-layer"
  | "configure"
  | "generating"
  | "review";

export type { ConfigTab, SequenceItem, GenPairView };

export interface AIInterpolateModalProps {
  isOpen: boolean;
  /** Close request. Ignored by the shell while `isGenerating`. */
  onClose: () => void;
  mode: "base" | "variant";
  step: ModalStep;

  /** Top-level error banner; `null` hides it. */
  error: string | null;
  /** Why the service is unavailable, for `UnavailableStep`. */
  unavailableDetail: string | null;

  /* select-layer */
  layerNames: string[];
  selectedLayerName: string | null;
  onSelectLayer: (name: string) => void;
  onChangeLayer: () => void;

  /* configure */
  frameThumbnails: string[];
  sortedKeyframes: number[];
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
  warningMessage: string | null;

  /* generating */
  isGenerating: boolean;
  pairJobs: GenPairView[];
  completedPairs: number;
  totalPairs: number;
  onGenerate: () => void;

  /* review */
  sequence: SequenceItem[];
  animationFrames: string[];
  keyframeSyncFrames: string[];
  previewFps: number;
  onPreviewFpsChange: (fps: number) => void;
  onAccept: () => void;

  /** Storybook/test portal target; `document.body` when omitted. */
  container?: HTMLElement | null | undefined;
}

/** The steps during which the configure surface stays mounted. */
const CONFIGURE_PHASES: ModalStep[] = ["configure", "generating", "review"];

export function AIInterpolateModal(props: AIInterpolateModalProps) {
  const {
    isOpen,
    onClose,
    mode,
    step,
    error,
    unavailableDetail,
    layerNames,
    selectedLayerName,
    onSelectLayer,
    onChangeLayer,
    isGenerating,
    onGenerate,
    onAccept,
    sortedKeyframes,
    loopBack,
    completedPairs,
    totalPairs,
    sequence,
    animationFrames,
    keyframeSyncFrames,
    previewFps,
    onPreviewFpsChange,
    container,
  } = props;

  const canGenerate = sortedKeyframes.length >= 2;
  const pairCount = sortedKeyframes.length - 1 + (loopBack ? 1 : 0);
  const showConfigure = CONFIGURE_PHASES.includes(step);
  // The preview appears in `review`, and early in `generating` as pairs land.
  const showReview =
    step === "review" ||
    (step === "generating" && sequence.some((s) => s.base64));

  const title = (
    <>
      <span className="ai-interpolate-modal__icon">
        <Icon icon={Wand2} size={18} />
      </span>
      AI Frame Interpolation
    </>
  );

  const footer = (
    <div className="modal__actions">
      {(step === "unavailable" ||
        step === "checking" ||
        step === "select-layer") && (
        <button className="ai-interpolate-modal__btn--neutral" onClick={onClose}>
          {step === "unavailable" ? "Close" : "Cancel"}
        </button>
      )}

      {step === "configure" && (
        <>
          <button
            className="ai-interpolate-modal__btn--neutral"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="ai-interpolate-modal__btn--primary"
            onClick={onGenerate}
            disabled={!canGenerate}
            title={!canGenerate ? "Select at least 2 keyframes" : undefined}
          >
            Generate ({pairCount} pair{pairCount !== 1 ? "s" : ""})
          </button>
        </>
      )}

      {step === "generating" && (
        <button className="ai-interpolate-modal__btn--primary" disabled>
          {completedPairs}/{totalPairs} pairs done...
        </button>
      )}

      {step === "review" && (
        <>
          <button
            className="ai-interpolate-modal__btn--neutral"
            onClick={onClose}
          >
            Discard
          </button>
          <button
            className="ai-interpolate-modal__btn--success"
            onClick={onAccept}
          >
            Accept &amp; Apply
          </button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      // ⚠️ Withheld mid-run: no close button, no Escape, no backdrop close —
      // the original's behaviour, expressed through the primitive's contract.
      onClose={isGenerating ? undefined : onClose}
      title={title}
      className="ai-interpolate-modal"
      container={container}
      footer={footer}
    >
      {error && <div className="ai-interpolate-modal__error">{error}</div>}

      {step === "checking" && <CheckingStep />}

      {step === "unavailable" && (
        <UnavailableStep detail={unavailableDetail} />
      )}

      {step === "select-layer" && mode === "base" && (
        <SelectLayerStep
          layerNames={layerNames}
          selectedLayerName={selectedLayerName}
          onSelect={onSelectLayer}
        />
      )}

      {showConfigure && (
        <>
          <ConfigureStep
            phase={step as ConfigureStepPhase}
            frameThumbnails={props.frameThumbnails}
            sortedKeyframes={sortedKeyframes}
            isKeyframe={props.isKeyframe}
            onFrameClick={props.onFrameClick}
            activeTab={props.activeTab}
            onTabChange={props.onTabChange}
            loopBack={loopBack}
            onLoopBackChange={props.onLoopBackChange}
            numFrames={props.numFrames}
            onNumFramesChange={props.onNumFramesChange}
            scale={props.scale}
            onScaleChange={props.onScaleChange}
            flowScale={props.flowScale}
            onFlowScaleChange={props.onFlowScaleChange}
            warningMessage={props.warningMessage}
            isGenerating={isGenerating}
            selectedLayerName={mode === "base" ? selectedLayerName : null}
            onChangeLayer={onChangeLayer}
            pairJobs={props.pairJobs}
            completedPairs={completedPairs}
            totalPairs={totalPairs}
          />

          {showReview && (
            <ReviewStep
              sequence={sequence}
              animationFrames={animationFrames}
              keyframeSyncFrames={keyframeSyncFrames}
              previewFps={previewFps}
              onPreviewFpsChange={onPreviewFpsChange}
            />
          )}
        </>
      )}
    </Modal>
  );
}

export default AIInterpolateModal;
