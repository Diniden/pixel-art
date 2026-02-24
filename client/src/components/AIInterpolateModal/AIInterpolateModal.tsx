import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import {
  Project, PixelObject, Frame, Layer, VariantGroup, Variant,
  VariantFrame, PixelData, Pixel, generateId,
} from '../../types';
import { submitJob, getJobStatus, checkAiHealth } from '../../services/aiService';
import './AIInterpolateModal.css';

interface VariantData {
  variantGroup: VariantGroup;
  variant: Variant;
}

interface AIInterpolateModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'base' | 'variant';
  object: PixelObject;
  project: Project;
  variantData?: VariantData;
}

type ModalStep = 'checking' | 'unavailable' | 'select-layer' | 'configure' | 'generating' | 'review';
type ConfigTab = 'keyframes' | 'settings';

interface PairJobState {
  pairIdx: number;
  jobId: string | null;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  frames: string[];
  error: string | null;
}

function renderLayerToBase64(
  layer: Layer,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pd = layer.pixels[y]?.[x];
      if (!pd || pd.color === 0) continue;
      const c = pd.color as Pixel;
      const idx = (y * width + x) * 4;
      data[idx] = c.r;
      data[idx + 1] = c.g;
      data[idx + 2] = c.b;
      data[idx + 3] = c.a;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

function renderFrameToBase64(
  frame: Frame,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let layerIdx = 0; layerIdx < frame.layers.length; layerIdx++) {
    const layer = frame.layers[layerIdx];
    if (!layer.visible || layer.isVariant) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pd = layer.pixels[y]?.[x];
        if (!pd || pd.color === 0) continue;
        const c = pd.color as Pixel;
        const idx = (y * width + x) * 4;
        const srcA = c.a / 255;
        const dstA = data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          data[idx] = (c.r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
          data[idx + 1] = (c.g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
          data[idx + 2] = (c.b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
          data[idx + 3] = outA * 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

function renderVariantFrameToBase64(
  vFrame: VariantFrame,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (const layer of vFrame.layers) {
    if (!layer.visible) continue;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pd = layer.pixels[y]?.[x];
        if (!pd || pd.color === 0) continue;
        const c = pd.color as Pixel;
        const idx = (y * width + x) * 4;
        const srcA = c.a / 255;
        const dstA = data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          data[idx] = (c.r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
          data[idx + 1] = (c.g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
          data[idx + 2] = (c.b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
          data[idx + 3] = outA * 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

async function base64ToPixelData(
  base64: string,
  width: number,
  height: number,
): Promise<PixelData[][]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const pixels: PixelData[][] = [];
      for (let y = 0; y < height; y++) {
        const row: PixelData[] = [];
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          if (a === 0) {
            row.push({ color: 0, normal: 0, height: 0 });
          } else {
            row.push({ color: { r, g, b, a }, normal: 0, height: 0 });
          }
        }
        pixels.push(row);
      }
      resolve(pixels);
    };
    img.onerror = () => reject(new Error('Failed to decode generated frame'));
    img.src = `data:image/png;base64,${base64}`;
  });
}

function Base64Thumbnail({ base64, size }: { base64: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base64) return;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    };
    img.src = `data:image/png;base64,${base64}`;
  }, [base64, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="ai-thumb-canvas" />;
}

function AnimatedPreview({ frames, size, fps = 8 }: { frames: string[]; size: number; fps?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIdxRef = useRef(0);
  const imagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    imagesRef.current = frames.map((b64) => {
      const img = new Image();
      img.src = b64 ? `data:image/png;base64,${b64}` : '';
      return img;
    });
  }, [frames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    frameIdxRef.current = 0;
    const interval = setInterval(() => {
      const idx = frameIdxRef.current % frames.length;
      const img = imagesRef.current[idx];
      ctx.clearRect(0, 0, size, size);
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      }
      frameIdxRef.current = idx + 1;
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [frames, size, fps]);

  return <canvas ref={canvasRef} width={size} height={size} className="ai-preview-canvas" />;
}

export function AIInterpolateModal({
  isOpen,
  onClose,
  mode,
  object,
  project,
  variantData,
}: AIInterpolateModalProps) {
  const [step, setStep] = useState<ModalStep>('checking');
  const [selectedLayerName, setSelectedLayerName] = useState<string | null>(null);
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<number>>(new Set());
  const [loopBack, setLoopBack] = useState(false);
  const [numFrames, setNumFrames] = useState(3);
  const [scale, setScale] = useState(4);
  const [flowScale, setFlowScale] = useState(1.0);
  const [activeTab, setActiveTab] = useState<ConfigTab>('keyframes');
  const [pairJobs, setPairJobs] = useState<PairJobState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableDetail, setUnavailableDetail] = useState<string | null>(null);
  const [previewFps, setPreviewFps] = useState(8);

  const framesRowRef = useRef<HTMLDivElement>(null);
  const [loopLineStyle, setLoopLineStyle] = useState<React.CSSProperties | null>(null);
  const store = useEditorStore();

  useEffect(() => {
    if (!isOpen) return;

    setStep('checking');
    setSelectedLayerName(null);
    setSelectedKeyframes(new Set());
    setLoopBack(false);
    setNumFrames(3);
    setScale(4);
    setFlowScale(1.0);
    setActiveTab('keyframes');
    setPairJobs([]);
    setIsGenerating(false);
    setError(null);
    setUnavailableDetail(null);

    let cancelled = false;
    const aiUrl = project.uiState.aiServiceUrl || undefined;

    checkAiHealth(aiUrl).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setStep(mode === 'variant' ? 'configure' : 'select-layer');
      } else {
        setStep('unavailable');
        setUnavailableDetail(result.detail || 'The AI service is not reachable.');
      }
    });

    return () => { cancelled = true; };
  }, [isOpen, mode, project.uiState.aiServiceUrl]);

  const gridSize = useMemo(() => {
    if (mode === 'variant' && variantData) {
      return variantData.variant.gridSize;
    }
    return object.gridSize;
  }, [mode, variantData, object.gridSize]);

  const layerNames = useMemo(() => {
    if (mode !== 'base' || object.frames.length === 0) return [];
    const firstFrame = object.frames[0];
    return firstFrame.layers
      .filter((l) => !l.isVariant)
      .map((l) => l.name);
  }, [mode, object.frames]);

  useEffect(() => {
    if (mode === 'base' && layerNames.length === 1 && !selectedLayerName && step === 'select-layer') {
      setSelectedLayerName(layerNames[0]);
      setStep('configure');
    }
  }, [mode, layerNames, selectedLayerName, step]);

  const sortedKeyframes = useMemo(() =>
    [...selectedKeyframes].sort((a, b) => a - b),
    [selectedKeyframes]
  );

  const afterLastKeyframeCount = useMemo(() => {
    if (!loopBack || sortedKeyframes.length < 2) return 0;
    const totalFrames = mode === 'variant' && variantData
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
      parts.push(`${betweenCount} frame${betweenCount > 1 ? 's' : ''} between keyframes will be replaced`);
    }
    if (afterLastKeyframeCount > 0) {
      parts.push(`${afterLastKeyframeCount} frame${afterLastKeyframeCount > 1 ? 's' : ''} after the last keyframe will be removed`);
    }

    if (parts.length === 0 && totalGeneratedCount === 0) return null;

    let msg = parts.join(' and ');
    if (msg) msg += '. ';
    msg += `${totalGeneratedCount} frame${totalGeneratedCount !== 1 ? 's' : ''} will be generated.`;

    return msg;
  }, [sortedKeyframes, deletedFrameCount, afterLastKeyframeCount, totalGeneratedCount]);

  const frameThumbnails = useMemo(() => {
    const { width, height } = gridSize;
    if (mode === 'variant' && variantData) {
      return variantData.variant.frames.map((vf) =>
        renderVariantFrameToBase64(vf, width, height)
      );
    }
    if (selectedLayerName) {
      return object.frames.map((frame) => {
        const layer = frame.layers.find((l) => l.name === selectedLayerName && !l.isVariant);
        if (layer) {
          return renderLayerToBase64(layer, width, height);
        }
        return renderFrameToBase64(frame, width, height);
      });
    }
    return object.frames.map((frame) =>
      renderFrameToBase64(frame, width, height)
    );
  }, [mode, variantData, object.frames, selectedLayerName, gridSize]);

  useEffect(() => {
    if (!loopBack || sortedKeyframes.length < 2 || !framesRowRef.current) {
      setLoopLineStyle(null);
      return;
    }

    const row = framesRowRef.current;
    const firstKeyIdx = sortedKeyframes[0];
    const lastKeyIdx = sortedKeyframes[sortedKeyframes.length - 1];
    const firstEl = row.querySelector(`[data-frame-idx="${firstKeyIdx}"]`) as HTMLElement | null;
    const lastEl = row.querySelector(`[data-frame-idx="${lastKeyIdx}"]`) as HTMLElement | null;

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

  const handleFrameClick = useCallback((idx: number) => {
    if (isGenerating || step === 'review') return;
    setSelectedKeyframes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
    setError(null);
  }, [isGenerating, step]);

  const allGeneratedFrames = useMemo(() => {
    const result: string[][] = [];
    for (const pj of pairJobs) {
      result.push(pj.frames);
    }
    return result;
  }, [pairJobs]);

  const fullSequenceFrames = useMemo(() => {
    if (sortedKeyframes.length < 2) return [];
    const seq: Array<{ type: 'keyframe' | 'generated'; base64: string; keyIdx?: number }> = [];

    for (let i = 0; i < sortedKeyframes.length; i++) {
      seq.push({
        type: 'keyframe',
        base64: frameThumbnails[sortedKeyframes[i]] || '',
        keyIdx: sortedKeyframes[i],
      });

      if (i < sortedKeyframes.length - 1) {
        const pairFrames = allGeneratedFrames[i] || [];
        for (let j = 0; j < numFrames; j++) {
          seq.push({
            type: 'generated',
            base64: pairFrames[j] || '',
          });
        }
      }
    }

    if (loopBack) {
      const loopPairFrames = allGeneratedFrames[sortedKeyframes.length - 1] || [];
      for (let j = 0; j < numFrames; j++) {
        seq.push({ type: 'generated', base64: loopPairFrames[j] || '' });
      }
    }

    return seq;
  }, [sortedKeyframes, frameThumbnails, allGeneratedFrames, numFrames, loopBack]);

  const animationFrames = useMemo(() => {
    return fullSequenceFrames
      .filter(f => f.base64)
      .map(f => f.base64);
  }, [fullSequenceFrames]);

  const handleGenerate = useCallback(async () => {
    if (sortedKeyframes.length < 2) return;

    const aiUrl = project.uiState.aiServiceUrl || undefined;
    const { width, height } = gridSize;

    setIsGenerating(true);
    setError(null);
    setStep('generating');

    const pairs: Array<{ startB64: string; endB64: string }> = [];

    try {
      for (let i = 0; i < sortedKeyframes.length - 1; i++) {
        const startIdx = sortedKeyframes[i];
        const endIdx = sortedKeyframes[i + 1];
        let startB64: string;
        let endB64: string;

        if (mode === 'variant' && variantData) {
          startB64 = renderVariantFrameToBase64(variantData.variant.frames[startIdx], width, height);
          endB64 = renderVariantFrameToBase64(variantData.variant.frames[endIdx], width, height);
        } else if (selectedLayerName) {
          const sf = object.frames[startIdx];
          const ef = object.frames[endIdx];
          const sl = sf.layers.find((l) => l.name === selectedLayerName && !l.isVariant);
          const el = ef.layers.find((l) => l.name === selectedLayerName && !l.isVariant);

          if (!sl || !el) {
            setError(`Selected layer not found in frames ${startIdx + 1} or ${endIdx + 1}.`);
            setIsGenerating(false);
            setStep('configure');
            return;
          }
          startB64 = renderLayerToBase64(sl, width, height);
          endB64 = renderLayerToBase64(el, width, height);
        } else {
          setError('No layer selected.');
          setIsGenerating(false);
          setStep('select-layer');
          return;
        }
        pairs.push({ startB64, endB64 });
      }

      if (loopBack) {
        const lastIdx = sortedKeyframes[sortedKeyframes.length - 1];
        const firstIdx = sortedKeyframes[0];
        let loopStartB64: string;
        let loopEndB64: string;

        if (mode === 'variant' && variantData) {
          loopStartB64 = renderVariantFrameToBase64(variantData.variant.frames[lastIdx], width, height);
          loopEndB64 = renderVariantFrameToBase64(variantData.variant.frames[firstIdx], width, height);
        } else if (selectedLayerName) {
          const sf = object.frames[lastIdx];
          const ef = object.frames[firstIdx];
          const sl = sf.layers.find((l) => l.name === selectedLayerName && !l.isVariant);
          const el = ef.layers.find((l) => l.name === selectedLayerName && !l.isVariant);
          if (!sl || !el) {
            setError('Selected layer not found for loop pair.');
            setIsGenerating(false);
            setStep('configure');
            return;
          }
          loopStartB64 = renderLayerToBase64(sl, width, height);
          loopEndB64 = renderLayerToBase64(el, width, height);
        } else {
          setError('No layer selected.');
          setIsGenerating(false);
          setStep('select-layer');
          return;
        }
        pairs.push({ startB64: loopStartB64, endB64: loopEndB64 });
      }

      const initialJobs: PairJobState[] = pairs.map((_, i) => ({
        pairIdx: i,
        jobId: null,
        status: 'pending' as const,
        frames: [],
        error: null,
      }));
      setPairJobs(initialJobs);

      const jobIds: string[] = [];
      for (let i = 0; i < pairs.length; i++) {
        const { job_id } = await submitJob(
          pairs[i].startB64,
          pairs[i].endB64,
          numFrames,
          aiUrl,
          scale,
          flowScale,
        );
        jobIds.push(job_id);
        setPairJobs(prev => prev.map((pj, idx) =>
          idx === i ? { ...pj, jobId: job_id, status: 'queued' } : pj
        ));
      }

      let pollInterval = 500;
      const maxInterval = 3000;
      const completed = new Set<number>();

      while (completed.size < pairs.length) {
        await new Promise((r) => setTimeout(r, pollInterval));

        for (let i = 0; i < jobIds.length; i++) {
          if (completed.has(i)) continue;
          const job = await getJobStatus(jobIds[i], aiUrl);

          if (job.status === 'completed') {
            completed.add(i);
            setPairJobs(prev => prev.map((pj, idx) =>
              idx === i ? { ...pj, status: 'completed', frames: job.frames ?? [] } : pj
            ));
          } else if (job.status === 'failed') {
            throw new Error(job.error || `Interpolation job ${i + 1} failed`);
          } else {
            setPairJobs(prev => prev.map((pj, idx) =>
              idx === i ? { ...pj, status: job.status } : pj
            ));
          }
        }

        pollInterval = Math.min(pollInterval * 1.3, maxInterval);
      }

      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setStep('configure');
    } finally {
      setIsGenerating(false);
    }
  }, [sortedKeyframes, numFrames, scale, flowScale, mode, variantData, object, selectedLayerName, gridSize, project.uiState.aiServiceUrl, loopBack]);

  const handleAccept = useCallback(async () => {
    if (sortedKeyframes.length < 2 || allGeneratedFrames.length === 0) return;

    const { width, height } = gridSize;

    try {
      const allPixelDataPairs: PixelData[][][] = [];
      for (const pairFrames of allGeneratedFrames) {
        const pixData = await Promise.all(
          pairFrames.map((b64) => base64ToPixelData(b64, width, height))
        );
        allPixelDataPairs.push(pixData);
      }

      const currentProject = store.project;
      if (!currentProject) return;

      const firstKeyIdx = sortedKeyframes[0];
      const lastKeyIdx = sortedKeyframes[sortedKeyframes.length - 1];

      if (mode === 'variant' && variantData) {
        const newProject = structuredClone(currentProject) as Project;
        const vgIdx = newProject.variants?.findIndex((vg) => vg.id === variantData.variantGroup.id) ?? -1;
        if (vgIdx < 0 || !newProject.variants) return;

        const vGroup = newProject.variants[vgIdx];
        const vIdx = vGroup.variants.findIndex((v) => v.id === variantData.variant.id);
        if (vIdx < 0) return;

        const variant = vGroup.variants[vIdx];
        const oldFrames = variant.frames;

        const before = oldFrames.slice(0, firstKeyIdx);
        const after = loopBack ? [] : oldFrames.slice(lastKeyIdx + 1);

        const middle: VariantFrame[] = [];
        for (let i = 0; i < sortedKeyframes.length; i++) {
          middle.push(oldFrames[sortedKeyframes[i]]);
          if (i < sortedKeyframes.length - 1) {
            const genFrames: VariantFrame[] = allPixelDataPairs[i].map((pixels) => ({
              id: generateId(),
              layers: [{
                id: generateId(),
                name: 'Layer 1',
                pixels,
                visible: true,
              }],
            }));
            middle.push(...genFrames);
          }
        }

        if (loopBack) {
          const loopPairData = allPixelDataPairs[sortedKeyframes.length - 1];
          if (loopPairData) {
            const loopFrames: VariantFrame[] = loopPairData.map((pixels) => ({
              id: generateId(),
              layers: [{
                id: generateId(),
                name: 'Layer 1',
                pixels,
                visible: true,
              }],
            }));
            middle.push(...loopFrames);
          }
        }

        variant.frames = [...before, ...middle, ...after];

        const compactVariant = (await import('../../types')).projectToCompact(newProject);
        const clonedForVariantHistory = (await import('../../types')).compactToProject(compactVariant);

        useEditorStore.setState((state) => {
          const newHistory = [
            ...state.projectHistory.slice(0, state.historyIndex + 1),
            clonedForVariantHistory,
          ];
          return {
            project: newProject,
            projectHistory: newHistory,
            historyIndex: newHistory.length - 1,
          };
        });

        const { scheduleAutoSave } = await import('../../services/autoSave');
        scheduleAutoSave(newProject, store.projectName);
      } else {
        const newProject = structuredClone(currentProject) as Project;
        const objIdx = newProject.objects.findIndex((o) => o.id === object.id);
        if (objIdx < 0) return;

        const obj = newProject.objects[objIdx];
        const oldFrames = obj.frames;
        const templateFrame = oldFrames[firstKeyIdx];

        const before = oldFrames.slice(0, firstKeyIdx);
        const after = loopBack ? [] : oldFrames.slice(lastKeyIdx + 1);

        const middle: Frame[] = [];
        for (let i = 0; i < sortedKeyframes.length; i++) {
          middle.push(oldFrames[sortedKeyframes[i]]);
          if (i < sortedKeyframes.length - 1) {
            const genFrames: Frame[] = allPixelDataPairs[i].map((pixels, j) => {
              const layers: Layer[] = templateFrame.layers.map((srcLayer) => {
                if (srcLayer.name === selectedLayerName && !srcLayer.isVariant) {
                  return {
                    id: generateId(),
                    name: srcLayer.name,
                    pixels,
                    visible: srcLayer.visible,
                  };
                }
                return {
                  ...srcLayer,
                  id: generateId(),
                  pixels: srcLayer.pixels.map((row) => [...row]),
                };
              });

              return {
                id: generateId(),
                name: `Interp ${i + 1}.${j + 1}`,
                layers,
              };
            });
            middle.push(...genFrames);
          }
        }

        if (loopBack) {
          const loopPairData = allPixelDataPairs[sortedKeyframes.length - 1];
          if (loopPairData) {
            const loopFrames: Frame[] = loopPairData.map((pixels, j) => {
              const layers: Layer[] = templateFrame.layers.map((srcLayer) => {
                if (srcLayer.name === selectedLayerName && !srcLayer.isVariant) {
                  return {
                    id: generateId(),
                    name: srcLayer.name,
                    pixels,
                    visible: srcLayer.visible,
                  };
                }
                return {
                  ...srcLayer,
                  id: generateId(),
                  pixels: srcLayer.pixels.map((row) => [...row]),
                };
              });
              return { id: generateId(), name: `Loop ${j + 1}`, layers };
            });
            middle.push(...loopFrames);
          }
        }

        obj.frames = [...before, ...middle, ...after];

        const compactProject = (await import('../../types')).projectToCompact(newProject);
        const clonedForHistory = (await import('../../types')).compactToProject(compactProject);

        useEditorStore.setState((state) => {
          const newHistory = [
            ...state.projectHistory.slice(0, state.historyIndex + 1),
            clonedForHistory,
          ];
          return {
            project: newProject,
            projectHistory: newHistory,
            historyIndex: newHistory.length - 1,
          };
        });

        const { scheduleAutoSave } = await import('../../services/autoSave');
        scheduleAutoSave(newProject, store.projectName);
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply frames');
    }
  }, [sortedKeyframes, allGeneratedFrames, gridSize, mode, variantData, object, selectedLayerName, store, onClose, loopBack]);

  const handleBackdropClick = useCallback(() => {
    if (!isGenerating) onClose();
  }, [isGenerating, onClose]);

  const canGenerate = sortedKeyframes.length >= 2;

  const completedPairs = pairJobs.filter(j => j.status === 'completed').length;
  const totalPairs = pairJobs.length;
  const currentProcessingPair = pairJobs.findIndex(j => j.status === 'processing' || j.status === 'queued');

  if (!isOpen) return null;

  return createPortal(
    <div className="ai-modal-backdrop" onClick={handleBackdropClick}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <h2 className="ai-modal-title">
            <span className="ai-modal-icon">✦</span>
            AI Frame Interpolation
          </h2>
          {!isGenerating && (
            <button className="ai-modal-close" onClick={onClose}>×</button>
          )}
        </div>

        {error && (
          <div className="ai-modal-error">{error}</div>
        )}

        <div className="ai-modal-content">
          {step === 'checking' && (
            <div className="ai-heartbeat-checking">
              <div className="ai-heartbeat-spinner" />
              <p className="ai-heartbeat-text">Connecting to AI service...</p>
              <p className="ai-heartbeat-subtext">Running a readiness check to verify the model is loaded and operational.</p>
            </div>
          )}

          {step === 'unavailable' && (
            <div className="ai-heartbeat-unavailable">
              <div className="ai-unavailable-icon">✦</div>
              <h3 className="ai-unavailable-title">AI Service Unavailable</h3>
              <p className="ai-unavailable-detail">{unavailableDetail}</p>
              <p className="ai-unavailable-hint">
                Make sure the AI service is running on the configured remote machine and the URL is correct.
              </p>
            </div>
          )}

          {step === 'select-layer' && mode === 'base' && (
            <div className="ai-step-layer">
              <h3 className="ai-step-title">Select Layer to Interpolate</h3>
              <p className="ai-step-desc">Choose which layer's frames will be used for AI generation.</p>
              <div className="ai-layer-list">
                {layerNames.map((name) => (
                  <button
                    key={name}
                    className={`ai-layer-item ${selectedLayerName === name ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedLayerName(name);
                      setStep('configure');
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {layerNames.length === 0 && (
                <p className="ai-empty-msg">No non-variant layers found.</p>
              )}
            </div>
          )}

          {(step === 'configure' || step === 'generating' || step === 'review') && (
            <>
              {mode === 'base' && selectedLayerName && (
                <div className="ai-selected-layer-bar">
                  <span>Layer: <strong>{selectedLayerName}</strong></span>
                  <button
                    className="ai-change-layer-btn"
                    onClick={() => {
                      setStep('select-layer');
                      setSelectedKeyframes(new Set());
                      setPairJobs([]);
                    }}
                    disabled={isGenerating}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="ai-config-tabs">
                <button
                  className={`ai-config-tab ${activeTab === 'keyframes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('keyframes')}
                  disabled={isGenerating}
                >
                  Keyframes
                  {sortedKeyframes.length > 0 && (
                    <span className="ai-tab-badge">{sortedKeyframes.length}</span>
                  )}
                </button>
                <button
                  className={`ai-config-tab ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('settings')}
                  disabled={isGenerating}
                >
                  Settings
                </button>
              </div>

              {/* Keyframes Tab */}
              {activeTab === 'keyframes' && (
                <div className="ai-tab-content">
                  <div className="ai-keyframes-header">
                    <div>
                      <h3 className="ai-step-title">
                        {step === 'review' ? 'Review Generated Frames' :
                         step === 'generating' ? (
                           `Processing pair ${Math.min(completedPairs + 1, totalPairs)} of ${totalPairs}...`
                         ) : 'Select Keyframes'}
                      </h3>
                      {step === 'configure' && (
                        <p className="ai-step-desc">
                          Click frames to toggle them as keyframes. {numFrames} frame{numFrames !== 1 ? 's' : ''} will be generated between each consecutive pair.
                        </p>
                      )}
                    </div>
                    {step === 'configure' && (
                      <label className="ai-loop-toggle">
                        <input
                          type="checkbox"
                          checked={loopBack}
                          onChange={(e) => setLoopBack(e.target.checked)}
                          disabled={isGenerating}
                        />
                        <span className="ai-loop-switch" />
                        <span className="ai-loop-label-text">Loop</span>
                      </label>
                    )}
                  </div>

                  <div className="ai-frames-strip">
                    <div className="ai-frames-row" ref={framesRowRef}>
                      {frameThumbnails.map((thumb, idx) => {
                        const isKey = selectedKeyframes.has(idx);
                        const isBetween = sortedKeyframes.length >= 2 && (() => {
                          for (let i = 0; i < sortedKeyframes.length - 1; i++) {
                            if (idx > sortedKeyframes[i] && idx < sortedKeyframes[i + 1] && !isKey) {
                              return true;
                            }
                          }
                          if (loopBack && idx > sortedKeyframes[sortedKeyframes.length - 1] && !isKey) {
                            return true;
                          }
                          return false;
                        })();
                        return (
                          <div
                            key={idx}
                            data-frame-idx={idx}
                            className={`ai-frame-item ${isKey ? 'keyframe' : ''} ${isBetween ? 'between' : ''}`}
                            onClick={() => handleFrameClick(idx)}
                          >
                            <Base64Thumbnail base64={thumb} size={48} />
                            <span className="ai-frame-label">
                              {isKey ? `Key ${sortedKeyframes.indexOf(idx) + 1}` : `#${idx + 1}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {loopLineStyle && (
                      <div className="ai-loop-line" style={loopLineStyle} />
                    )}
                  </div>

                  {warningMessage && step === 'configure' && (
                    <div className="ai-warning">{warningMessage}</div>
                  )}

                  {/* Generation progress */}
                  {step === 'generating' && pairJobs.length > 0 && (
                    <div className="ai-gen-progress">
                      {pairJobs.map((pj, i) => (
                        <div key={i} className={`ai-gen-pair ${pj.status}`}>
                          <span className="ai-gen-pair-label">
                            {loopBack && i === pairJobs.length - 1
                              ? `Loop: Key ${sortedKeyframes.length} → Key 1`
                              : `Pair ${i + 1}: Key ${i + 1} → Key ${i + 2}`}
                          </span>
                          <span className={`ai-gen-pair-status ${pj.status}`}>
                            {pj.status === 'pending' ? 'Waiting' :
                             pj.status === 'queued' ? 'Queued' :
                             pj.status === 'processing' ? 'Processing...' :
                             pj.status === 'completed' ? 'Done' :
                             'Failed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="ai-tab-content">
                  <h3 className="ai-step-title">Interpolation Settings</h3>
                  <p className="ai-step-desc">Adjust parameters that control the AI interpolation.</p>

                  <div className="ai-settings-grid">
                    <div className="ai-setting-row">
                      <div className="ai-setting-info">
                        <label className="ai-setting-label">Frames Between Keyframes</label>
                        <span className="ai-setting-hint">Number of frames generated between each consecutive keyframe pair.</span>
                      </div>
                      <input
                        type="number"
                        className="ai-setting-input"
                        min={1}
                        max={64}
                        value={numFrames}
                        onChange={(e) => setNumFrames(Math.max(1, Math.min(64, parseInt(e.target.value) || 1)))}
                        disabled={isGenerating}
                      />
                    </div>

                    <div className="ai-setting-row">
                      <div className="ai-setting-info">
                        <label className="ai-setting-label">Pixel Art Upscale</label>
                        <span className="ai-setting-hint">Upscale factor before inference. Pixel art is small; higher values give the model more detail to work with.</span>
                      </div>
                      <div className="ai-setting-range-group">
                        <input
                          type="range"
                          className="ai-setting-range"
                          min={1}
                          max={16}
                          step={1}
                          value={scale}
                          onChange={(e) => setScale(parseInt(e.target.value))}
                          disabled={isGenerating}
                        />
                        <span className="ai-setting-value">{scale}x</span>
                      </div>
                    </div>

                    <div className="ai-setting-row">
                      <div className="ai-setting-info">
                        <label className="ai-setting-label">Flow Estimation Scale</label>
                        <span className="ai-setting-hint">Controls precision of motion estimation. Higher = finer detail but slower. Default 1.0 works well for most cases.</span>
                      </div>
                      <div className="ai-setting-range-group">
                        <input
                          type="range"
                          className="ai-setting-range"
                          min={0.25}
                          max={4.0}
                          step={0.25}
                          value={flowScale}
                          onChange={(e) => setFlowScale(parseFloat(e.target.value))}
                          disabled={isGenerating}
                        />
                        <span className="ai-setting-value">{flowScale.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview section (shown in review or generating with results) */}
              {(step === 'review' || (step === 'generating' && pairJobs.some(j => j.status === 'completed'))) && fullSequenceFrames.length > 0 && (
                <div className="ai-preview-section">
                  <h4 className="ai-preview-label">Generated Sequence</h4>
                  <div className="ai-preview-strip">
                    {fullSequenceFrames.map((item, idx) => (
                      <div key={idx} className={`ai-preview-item ${item.type}`}>
                        {item.base64 ? (
                          <Base64Thumbnail base64={item.base64} size={48} />
                        ) : (
                          <div className="ai-placeholder">
                            <div className="ai-placeholder-spinner" />
                          </div>
                        )}
                        <span className="ai-preview-item-label">
                          {item.type === 'keyframe' ? `Key ${(item.keyIdx ?? 0) + 1}` : `Gen`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {animationFrames.length > 1 && (
                    <div className="ai-animation-preview">
                      <div className="ai-animation-header">
                        <h4 className="ai-preview-label">Animation Preview</h4>
                        <div className="ai-fps-control">
                          <label>FPS:</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={previewFps}
                            onChange={(e) => setPreviewFps(Math.max(1, Math.min(30, parseInt(e.target.value) || 8)))}
                            className="ai-fps-input"
                          />
                        </div>
                      </div>
                      <AnimatedPreview frames={animationFrames} size={128} fps={previewFps} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="ai-modal-actions">
          {step === 'unavailable' && (
            <button className="ai-btn-cancel" onClick={onClose}>
              Close
            </button>
          )}

          {step === 'checking' && (
            <button className="ai-btn-cancel" onClick={onClose}>
              Cancel
            </button>
          )}

          {step === 'select-layer' && (
            <button className="ai-btn-cancel" onClick={onClose}>
              Cancel
            </button>
          )}

          {step === 'configure' && (
            <>
              <button className="ai-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="ai-btn-generate"
                onClick={handleGenerate}
                disabled={!canGenerate}
                title={!canGenerate ? 'Select at least 2 keyframes' : undefined}
              >
                Generate ({sortedKeyframes.length - 1 + (loopBack ? 1 : 0)} pair{sortedKeyframes.length - 1 + (loopBack ? 1 : 0) !== 1 ? 's' : ''})
              </button>
            </>
          )}

          {step === 'generating' && (
            <button className="ai-btn-generate" disabled>
              {completedPairs}/{totalPairs} pairs done...
            </button>
          )}

          {step === 'review' && (
            <>
              <button className="ai-btn-cancel" onClick={onClose}>
                Discard
              </button>
              <button className="ai-btn-accept" onClick={handleAccept}>
                Accept & Apply
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
