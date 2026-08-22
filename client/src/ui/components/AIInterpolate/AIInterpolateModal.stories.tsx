/**
 * AIInterpolateModal stories — and the PROOF that the `ui/` boundary holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE OF REFRESH TASK 34: THESE STORIES RENDER WITH NO STORE PROVIDER
 *     OF ANY KIND
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no `StoreProvider` here, no `ApplicationStore`, no `installBridge`,
 * no legacy store hook, no MobX import, no `aiApi`, and no decorator that
 * supplies any of them — `.storybook/preview.tsx` provides only CSS, MSW and a
 * wrapper, and `modalHost` only retargets the portal.
 *
 * That is not a stylistic claim, it is the reason the file exists. The
 * pre-refactor `AIInterpolateModal` was 1,267 lines and destructured the WHOLE
 * store object at line 316 — the worst store coupling in the codebase. A
 * component that still needed one store member would be unstoryable, and "it
 * is pure now" would be unfalsifiable. Mounting it with nothing is the
 * falsifiable version.
 *
 * ## The step machine
 *
 * `step` is a prop, not internal state, so every one of the six steps is
 * directly addressable as a story instead of reachable only by driving a live
 * AI service through a real job.
 *
 * | Story        | Step          | What it exercises                          |
 * | ------------ | ------------- | ------------------------------------------ |
 * | Checking     | `checking`    | the readiness spinner                      |
 * | Unavailable  | `unavailable` | the proxy-without-remote failure           |
 * | SelectLayer  | `select-layer`| the layer picker (base mode only)          |
 * | Configure    | `configure`   | keyframe strip + Generate footer           |
 * | Generating   | `generating`  | per-pair progress, close button WITHHELD   |
 * | Review       | `review`      | the sequence strip, preview, Accept        |
 * | WithError    | `configure`   | the error banner above the content         |
 *
 * ⚠️ `Generating` is where the withheld-`onClose` behaviour is visible: the
 * shell passes `onClose={undefined}` to the `Modal` primitive mid-run, which
 * removes the close button AND disables Escape and backdrop close — the
 * original's behaviour, expressed through the primitive's contract rather than
 * approximated.
 *
 * ⚠️ The `Modal` primitive supplies the mousedown-origin backdrop close that
 * this component was the only legacy modal to implement correctly. Verifying
 * it is a MANUAL check (drag from inside, release outside, the modal must not
 * close) — jsdom cannot observe it and it is recorded as such in the report.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { modalHost } from "../../../../.storybook/decorators/modalHost";
import { AIInterpolateModal } from "./AIInterpolateModal";
import type { SequenceItem } from "./steps/ReviewStep";
import type { ConfigTab } from "./steps/ConfigureStep";
import { FRAME_THUMBNAILS, GENERATED_FRAMES } from "./storyFixtures";

const SEQUENCE: SequenceItem[] = [
  { type: "keyframe", base64: FRAME_THUMBNAILS[0], keyIdx: 0 },
  ...GENERATED_FRAMES.map((base64) => ({ type: "generated" as const, base64 })),
  { type: "keyframe", base64: FRAME_THUMBNAILS[7], keyIdx: 7 },
];
const animationFrames = SEQUENCE.map((s) => s.base64).filter(Boolean);
const keyframeSyncFrames = (() => {
  let held = "";
  return SEQUENCE.filter((s) => s.base64).map((s) => {
    if (s.type === "keyframe") held = s.base64;
    return held;
  });
})();

const meta = {
  title: "AIInterpolate/AIInterpolateModal",
  component: AIInterpolateModal,
  tags: ["autodocs"],
  decorators: [modalHost],
  parameters: {
    docs: {
      description: {
        component:
          "The PURE shell: step orchestration only. Built on the task-19 " +
          "`Modal` primitive, which preserves the mousedown-origin backdrop " +
          "close this file was the only legacy modal to get right, and adds " +
          'the `role="dialog"`, `aria-modal`, focus trap and Escape it ' +
          "lacked. Every value is a prop and every effect a callback, which " +
          "is what lets these stories mount with no provider at all.",
      },
    },
  },
  args: {
    isOpen: true,
    onClose: () => {},
    mode: "base",
    step: "configure",
    error: null,
    unavailableDetail: null,
    layerNames: ["Base", "Outline", "Highlights"],
    selectedLayerName: "Base",
    onSelectLayer: () => {},
    onChangeLayer: () => {},
    frameThumbnails: FRAME_THUMBNAILS,
    sortedKeyframes: [0, 7],
    isKeyframe: (idx: number) => [0, 7].includes(idx),
    onFrameClick: () => {},
    activeTab: "keyframes",
    onTabChange: () => {},
    loopBack: false,
    onLoopBackChange: () => {},
    numFrames: 3,
    onNumFramesChange: () => {},
    scale: 16,
    onScaleChange: () => {},
    flowScale: 4.0,
    onFlowScaleChange: () => {},
    warningMessage:
      "6 frames between keyframes will be replaced. 3 frames will be generated.",
    isGenerating: false,
    pairJobs: [],
    completedPairs: 0,
    totalPairs: 0,
    onGenerate: () => {},
    sequence: [],
    animationFrames: [],
    keyframeSyncFrames: [],
    previewFps: 8,
    onPreviewFpsChange: () => {},
    onAccept: () => {},
  },
  argTypes: {
    step: {
      control: "select",
      options: [
        "checking",
        "unavailable",
        "select-layer",
        "configure",
        "generating",
        "review",
      ],
    },
    mode: { control: "inline-radio", options: ["base", "variant"] },
    container: { control: false },
  },
} satisfies Meta<typeof AIInterpolateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 1: the health check is in flight. */
export const Checking: Story = { args: { step: "checking" } };

/** Step 2: the proxy is up but has no remote configured. */
export const Unavailable: Story = {
  args: {
    step: "unavailable",
    unavailableDetail:
      "The AI proxy is running but no remote service is configured (AI_REMOTE_URL unset).",
  },
};

/** Step 3: base mode only — pick the layer to interpolate. */
export const SelectLayer: Story = {
  args: { step: "select-layer", selectedLayerName: null },
};

/** Step 4: choose keyframes and settings. */
export const Configure: Story = {};

/**
 * Step 5: jobs running. ⚠️ Note the MISSING close button — `onClose` is
 * withheld from the primitive while generating, which also disables Escape and
 * backdrop close.
 */
export const Generating: Story = {
  args: {
    step: "generating",
    isGenerating: true,
    completedPairs: 1,
    totalPairs: 2,
    sortedKeyframes: [0, 4, 7],
    isKeyframe: (idx: number) => [0, 4, 7].includes(idx),
    pairJobs: [
      { pairIdx: 0, status: "completed" },
      { pairIdx: 1, status: "processing" },
    ],
    sequence: SEQUENCE,
    animationFrames,
    keyframeSyncFrames,
  },
};

/** Step 6: review the result and accept it (ONE undo entry). */
export const Review: Story = {
  args: {
    step: "review",
    sequence: SEQUENCE,
    animationFrames,
    keyframeSyncFrames,
  },
};

/** The error banner, above the step content. */
export const WithError: Story = {
  args: { error: "Interpolation job 2 failed: model out of memory" },
};

/** Variant mode: no layer bar, because a variant has no layer choice. */
export const VariantMode: Story = {
  args: { mode: "variant", selectedLayerName: null },
};

/**
 * Interactive: walk the step machine by hand, with no service and no store —
 * the clearest demonstration of what the decomposition bought.
 */
export const StepWalkthrough: Story = {
  render: function Walkthrough(args) {
    const [step, setStep] = useState<typeof args.step>("checking");
    const [tab, setTab] = useState<ConfigTab>("keyframes");
    const [keys, setKeys] = useState<number[]>([0, 7]);
    const steps = [
      "checking",
      "unavailable",
      "select-layer",
      "configure",
      "generating",
      "review",
    ] as const;

    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12 }}>
          {steps.map((s) => (
            <button key={s} onClick={() => setStep(s)}>
              {s}
            </button>
          ))}
        </div>
        <AIInterpolateModal
          {...args}
          step={step}
          activeTab={tab}
          onTabChange={setTab}
          sortedKeyframes={[...keys].sort((a, b) => a - b)}
          isKeyframe={(idx) => keys.includes(idx)}
          onFrameClick={(idx) =>
            setKeys((prev) =>
              prev.includes(idx)
                ? prev.filter((k) => k !== idx)
                : [...prev, idx],
            )
          }
          isGenerating={step === "generating"}
          completedPairs={step === "generating" ? 1 : 0}
          totalPairs={step === "generating" ? 2 : 0}
          pairJobs={
            step === "generating"
              ? [
                  { pairIdx: 0, status: "completed" },
                  { pairIdx: 1, status: "processing" },
                ]
              : []
          }
          sequence={step === "review" ? SEQUENCE : []}
          animationFrames={step === "review" ? animationFrames : []}
          keyframeSyncFrames={step === "review" ? keyframeSyncFrames : []}
          unavailableDetail="The AI service is not reachable."
        />
      </>
    );
  },
};
