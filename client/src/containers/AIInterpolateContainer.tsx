/**
 * AIInterpolateContainer — the `observer()` that wires the AI interpolation
 * flow to the stores (REFRESH task 34).
 *
 * This is where everything the pure shell may not do happens: reading the
 * store, encoding frames, calling the API through `useInterpolationJob`, and
 * committing the result through `applyInterpolation`. The shell and its 8
 * children stay import-clean, which is what makes their 9 stories mountable
 * with no provider.
 *
 * ── ⚠️ PRESERVED FINDINGS ────────────────────────────────────────────────
 *
 *  - **W8 / task 14** — the accept commits through the store's single path
 *    (`app.applyInterpolation` → `DomainMutator.commit`). NO
 *    legacy-hook `setState()` splice and NO direct `scheduleAutoSave()`
 *    import, so `MAX_HISTORY` and the normal auto-save both apply.
 *  - **W9 / task 15** — one `AbortController` per run inside
 *    `useInterpolationJob`, aborted on close AND unmount; `aiApi.pollJob`
 *    with its required signal and 300 s deadline.
 *  - **W1 / task 02** — `pairs` handed to `applyInterpolation` is RANK 4
 *    (`pair → frame → row → cell`). The annotation was the bug, not the
 *    values; `PairPixelData` names it now.
 *
 * ── `aiServiceUrl` ────────────────────────────────────────────────────────
 * Read from `SessionStore`, which `stores/ui/UIStore.ts` records as the single
 * READ source. It is still a PHASE A bridge field (Zustand owns it, the bridge
 * mirrors it into `session`), so reading the MobX copy is correct and does not
 * change ownership — no bridge edit was needed for this task.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores/context";
import { AIInterpolateModal } from "../ui/components/AIInterpolate/AIInterpolateModal";
import type {
  ModalStep,
  SequenceItem,
} from "../ui/components/AIInterpolate/AIInterpolateModal";
import type { ConfigTab } from "../ui/components/AIInterpolate/steps/ConfigureStep";
import { useInterpolationJob } from "./hooks/useInterpolationJob";
import {
  base64ToPixelData,
  encodeFrameToBase64,
  encodeLayerToBase64,
  encodeVariantFrameToBase64,
} from "../ui/utils/frameEncoding";
import type { PairPixelData } from "../stores/domain/applyInterpolation";
import type { PixelObject, Variant, VariantGroup } from "../types";

interface VariantData {
  variantGroup: VariantGroup;
  variant: Variant;
}

export interface AIInterpolateContainerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "base" | "variant";
  object: PixelObject;
  variantData?: VariantData;
}

export const AIInterpolateContainer = observer(function AIInterpolateContainer({
  isOpen,
  onClose,
  mode,
  object,
  variantData,
}: AIInterpolateContainerProps) {
  const app = useStores();
  const job = useInterpolationJob();

  const [step, setStep] = useState<ModalStep>("checking");
  const [selectedLayerName, setSelectedLayerName] = useState<string | null>(
    null,
  );
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<number>>(
    new Set(),
  );
  const [loopBack, setLoopBack] = useState(false);
  const [numFrames, setNumFrames] = useState(3);
  const [scale, setScale] = useState(16);
  const [flowScale, setFlowScale] = useState(4.0);
  const [activeTab, setActiveTab] = useState<ConfigTab>("keyframes");
  const [error, setError] = useState<string | null>(null);
  const [unavailableDetail, setUnavailableDetail] = useState<string | null>(
    null,
  );
  const [previewFps, setPreviewFps] = useState(8);

  const aiServiceUrl = app.session.aiServiceUrl || undefined;
  const { checkHealth, cancel, generate, reset } = job;

  /* ── open: reset everything, then health-check ─────────────────────────── */

  useEffect(() => {
    if (!isOpen) return;

    setStep("checking");
    setSelectedLayerName(null);
    setSelectedKeyframes(new Set());
    setLoopBack(false);
    setNumFrames(3);
    setScale(16);
    setFlowScale(4.0);
    setActiveTab("keyframes");
    setError(null);
    setUnavailableDetail(null);
    reset();

    let cancelled = false;
    void checkHealth(aiServiceUrl).then((outcome) => {
      if (cancelled) return;
      if (outcome.available) {
        setStep(mode === "variant" ? "configure" : "select-layer");
      } else {
        setStep("unavailable");
        setUnavailableDetail(outcome.detail);
      }
    });

    return () => {
      cancelled = true;
      // W9: closing the modal stops any in-flight generation/polling.
      cancel();
    };
  }, [isOpen, mode, aiServiceUrl, checkHealth, cancel, reset]);

  /* ── derived ───────────────────────────────────────────────────────────── */

  const gridSize = useMemo(
    () =>
      mode === "variant" && variantData
        ? variantData.variant.gridSize
        : object.gridSize,
    [mode, variantData, object.gridSize],
  );

  const layerNames = useMemo(() => {
    if (mode !== "base" || object.frames.length === 0) return [];
    return object.frames[0].layers
      .filter((l) => !l.isVariant)
      .map((l) => l.name);
  }, [mode, object.frames]);

  // A single layer needs no choosing.
  useEffect(() => {
    if (
      mode === "base" &&
      layerNames.length === 1 &&
      !selectedLayerName &&
      step === "select-layer"
    ) {
      setSelectedLayerName(layerNames[0]);
      setStep("configure");
    }
  }, [mode, layerNames, selectedLayerName, step]);

  const sortedKeyframes = useMemo(
    () => [...selectedKeyframes].sort((a, b) => a - b),
    [selectedKeyframes],
  );

  const afterLastKeyframeCount = useMemo(() => {
    if (!loopBack || sortedKeyframes.length < 2) return 0;
    const totalFrames =
      mode === "variant" && variantData
        ? variantData.variant.frames.length
        : object.frames.length;
    const lastKey = sortedKeyframes[sortedKeyframes.length - 1];
    return Math.max(0, totalFrames - lastKey - 1);
  }, [loopBack, sortedKeyframes, mode, variantData, object.frames]);

  const deletedFrameCount = useMemo(() => {
    if (sortedKeyframes.length < 2) return 0;
    let count = 0;
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      count += Math.max(0, sortedKeyframes[i + 1] - sortedKeyframes[i] - 1);
    }
    return count + afterLastKeyframeCount;
  }, [sortedKeyframes, afterLastKeyframeCount]);

  const totalGeneratedCount = useMemo(() => {
    if (sortedKeyframes.length < 2) return 0;
    const pairs = sortedKeyframes.length - 1 + (loopBack ? 1 : 0);
    return pairs * numFrames;
  }, [sortedKeyframes, numFrames, loopBack]);

  const warningMessage = useMemo(() => {
    if (sortedKeyframes.length < 2) return null;
    const betweenCount = deletedFrameCount - afterLastKeyframeCount;
    const parts: string[] = [];

    if (betweenCount > 0) {
      parts.push(
        `${betweenCount} frame${betweenCount > 1 ? "s" : ""} between keyframes will be replaced`,
      );
    }
    if (afterLastKeyframeCount > 0) {
      parts.push(
        `${afterLastKeyframeCount} frame${afterLastKeyframeCount > 1 ? "s" : ""} after the last keyframe will be removed`,
      );
    }

    if (parts.length === 0 && totalGeneratedCount === 0) return null;

    let msg = parts.join(" and ");
    if (msg) msg += ". ";
    msg += `${totalGeneratedCount} frame${totalGeneratedCount !== 1 ? "s" : ""} will be generated.`;

    return msg;
  }, [
    sortedKeyframes,
    deletedFrameCount,
    afterLastKeyframeCount,
    totalGeneratedCount,
  ]);

  /**
   * Thumbnails, encoded ONCE per source change. Grids never cross into `ui/`
   * (R2) — base64 strings do.
   */
  const frameThumbnails = useMemo(() => {
    const { width, height } = gridSize;
    if (mode === "variant" && variantData) {
      return variantData.variant.frames.map((vf) =>
        encodeVariantFrameToBase64(vf, width, height),
      );
    }
    if (selectedLayerName) {
      return object.frames.map((frame) => {
        const layer = frame.layers.find(
          (l) => l.name === selectedLayerName && !l.isVariant,
        );
        return layer
          ? encodeLayerToBase64(layer, width, height)
          : encodeFrameToBase64(frame, width, height);
      });
    }
    return object.frames.map((frame) =>
      encodeFrameToBase64(frame, width, height),
    );
  }, [mode, variantData, object.frames, selectedLayerName, gridSize]);

  const allGeneratedFrames = useMemo(
    () => job.pairJobs.map((pj) => pj.frames),
    [job.pairJobs],
  );

  const sequence = useMemo<SequenceItem[]>(() => {
    if (sortedKeyframes.length < 2) return [];
    const seq: SequenceItem[] = [];

    for (let i = 0; i < sortedKeyframes.length; i++) {
      seq.push({
        type: "keyframe",
        base64: frameThumbnails[sortedKeyframes[i]] || "",
        keyIdx: sortedKeyframes[i],
      });

      if (i < sortedKeyframes.length - 1) {
        const pairFrames = allGeneratedFrames[i] || [];
        for (let j = 0; j < numFrames; j++) {
          seq.push({ type: "generated", base64: pairFrames[j] || "" });
        }
      }
    }

    if (loopBack) {
      const loopPairFrames =
        allGeneratedFrames[sortedKeyframes.length - 1] || [];
      for (let j = 0; j < numFrames; j++) {
        seq.push({ type: "generated", base64: loopPairFrames[j] || "" });
      }
    }

    return seq;
  }, [
    sortedKeyframes,
    frameThumbnails,
    allGeneratedFrames,
    numFrames,
    loopBack,
  ]);

  const animationFrames = useMemo(
    () => sequence.filter((f) => f.base64).map((f) => f.base64),
    [sequence],
  );

  /** The keyframe standing under each animation frame — the "Original" side. */
  const keyframeSyncFrames = useMemo(() => {
    let currentKeyframeB64 = "";
    const syncFrames: string[] = [];
    for (const f of sequence) {
      if (f.type === "keyframe") currentKeyframeB64 = f.base64;
      if (f.base64) syncFrames.push(currentKeyframeB64);
    }
    return syncFrames;
  }, [sequence]);

  /* ── callbacks ─────────────────────────────────────────────────────────── */

  const isKeyframe = useCallback(
    (idx: number) => selectedKeyframes.has(idx),
    [selectedKeyframes],
  );

  const handleFrameClick = useCallback(
    (idx: number) => {
      if (job.isGenerating || step === "review") return;
      setSelectedKeyframes((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
      setError(null);
    },
    [job.isGenerating, step],
  );

  /** Encode one keyframe pair's endpoints. `null` signals a missing layer. */
  const encodePair = useCallback(
    (startIdx: number, endIdx: number): { startB64: string; endB64: string } | null => {
      const { width, height } = gridSize;
      if (mode === "variant" && variantData) {
        return {
          startB64: encodeVariantFrameToBase64(
            variantData.variant.frames[startIdx],
            width,
            height,
          ),
          endB64: encodeVariantFrameToBase64(
            variantData.variant.frames[endIdx],
            width,
            height,
          ),
        };
      }
      if (!selectedLayerName) return null;
      const sl = object.frames[startIdx]?.layers.find(
        (l) => l.name === selectedLayerName && !l.isVariant,
      );
      const el = object.frames[endIdx]?.layers.find(
        (l) => l.name === selectedLayerName && !l.isVariant,
      );
      if (!sl || !el) return null;
      return {
        startB64: encodeLayerToBase64(sl, width, height),
        endB64: encodeLayerToBase64(el, width, height),
      };
    },
    [mode, variantData, selectedLayerName, object.frames, gridSize],
  );

  const handleGenerate = useCallback(async () => {
    if (sortedKeyframes.length < 2) return;

    const pairs: { startB64: string; endB64: string }[] = [];
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const encoded = encodePair(sortedKeyframes[i], sortedKeyframes[i + 1]);
      if (!encoded) {
        if (!selectedLayerName) {
          setError("No layer selected.");
          setStep("select-layer");
        } else {
          setError(
            `Selected layer not found in frames ${sortedKeyframes[i] + 1} or ${sortedKeyframes[i + 1] + 1}.`,
          );
          setStep("configure");
        }
        return;
      }
      pairs.push(encoded);
    }

    if (loopBack) {
      const encoded = encodePair(
        sortedKeyframes[sortedKeyframes.length - 1],
        sortedKeyframes[0],
      );
      if (!encoded) {
        if (!selectedLayerName) {
          setError("No layer selected.");
          setStep("select-layer");
        } else {
          setError("Selected layer not found for loop pair.");
          setStep("configure");
        }
        return;
      }
      pairs.push(encoded);
    }

    setError(null);
    setStep("generating");

    try {
      const completed = await generate({
        pairs,
        numFrames,
        scale,
        flowScale,
        aiServiceUrl,
      });
      // `false` means the run was aborted (the modal closed) — stay silent.
      if (completed) setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStep("configure");
    }
  }, [
    sortedKeyframes,
    encodePair,
    loopBack,
    selectedLayerName,
    generate,
    numFrames,
    scale,
    flowScale,
    aiServiceUrl,
  ]);

  const handleAccept = useCallback(async () => {
    if (sortedKeyframes.length < 2 || allGeneratedFrames.length === 0) return;
    const { width, height } = gridSize;

    try {
      // ⚠️ W1: RANK 4 — pair → frame → row → cell.
      const pairs: PairPixelData = [];
      for (const pairFrames of allGeneratedFrames) {
        pairs.push(
          await Promise.all(
            pairFrames.map((b64) => base64ToPixelData(b64, width, height)),
          ),
        );
      }

      // W8: the store's single commit path — one undo entry, MAX_HISTORY and
      // the normal auto-save both apply.
      const ok =
        mode === "variant" && variantData
          ? app.applyInterpolation({
              mode: "variant",
              variantGroupId: variantData.variantGroup.id,
              variantId: variantData.variant.id,
              sortedKeyframes,
              pairs,
              loopBack,
            })
          : app.applyInterpolation({
              mode: "base",
              objectId: object.id,
              selectedLayerName,
              sortedKeyframes,
              pairs,
              loopBack,
            });

      if (!ok) {
        setError("Could not apply the generated frames.");
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply frames");
    }
  }, [
    sortedKeyframes,
    allGeneratedFrames,
    gridSize,
    mode,
    variantData,
    object.id,
    selectedLayerName,
    loopBack,
    app,
    onClose,
  ]);

  const handleChangeLayer = useCallback(() => {
    setStep("select-layer");
    setSelectedKeyframes(new Set());
    reset();
  }, [reset]);

  const handleSelectLayer = useCallback((name: string) => {
    setSelectedLayerName(name);
    setStep("configure");
  }, []);

  const completedPairs = job.pairJobs.filter(
    (j) => j.status === "completed",
  ).length;

  return (
    <AIInterpolateModal
      isOpen={isOpen}
      onClose={onClose}
      mode={mode}
      step={step}
      error={error}
      unavailableDetail={unavailableDetail}
      layerNames={layerNames}
      selectedLayerName={selectedLayerName}
      onSelectLayer={handleSelectLayer}
      onChangeLayer={handleChangeLayer}
      frameThumbnails={frameThumbnails}
      sortedKeyframes={sortedKeyframes}
      isKeyframe={isKeyframe}
      onFrameClick={handleFrameClick}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loopBack={loopBack}
      onLoopBackChange={setLoopBack}
      numFrames={numFrames}
      onNumFramesChange={setNumFrames}
      scale={scale}
      onScaleChange={setScale}
      flowScale={flowScale}
      onFlowScaleChange={setFlowScale}
      warningMessage={warningMessage}
      isGenerating={job.isGenerating}
      pairJobs={job.pairJobs}
      completedPairs={completedPairs}
      totalPairs={job.pairJobs.length}
      onGenerate={handleGenerate}
      sequence={sequence}
      animationFrames={animationFrames}
      keyframeSyncFrames={keyframeSyncFrames}
      previewFps={previewFps}
      onPreviewFpsChange={setPreviewFps}
      onAccept={handleAccept}
    />
  );
});
