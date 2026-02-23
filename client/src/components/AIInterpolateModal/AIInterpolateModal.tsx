import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import {
  Project, PixelObject, Frame, Layer, VariantGroup, Variant,
  VariantFrame, PixelData, Pixel, generateId,
} from '../../types';
import { interpolateFrames, checkAiHeartbeat } from '../../services/aiService';
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

type ModalStep = 'checking' | 'unavailable' | 'select-layer' | 'select-frames' | 'preview' | 'generating' | 'review';

/**
 * Render a single layer's pixels to an offscreen canvas and return as base64 PNG.
 * Returns raw base64 (no data URI prefix).
 */
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

/**
 * Render a full frame (all visible layers composited) to base64 PNG.
 */
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

/**
 * Render variant frame layers to base64 PNG.
 */
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

/**
 * Convert a base64 PNG image into a PixelData[][] grid.
 */
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

/** Render a base64 image to a thumbnail canvas element. */
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

/** Animated preview that cycles through an array of base64 frames. */
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
  const [startFrameIdx, setStartFrameIdx] = useState<number | null>(null);
  const [endFrameIdx, setEndFrameIdx] = useState<number | null>(null);
  const [numFrames, setNumFrames] = useState(3);
  const [generatedFrames, setGeneratedFrames] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableDetail, setUnavailableDetail] = useState<string | null>(null);
  const [previewFps, setPreviewFps] = useState(8);

  // Get store actions for applying results
  const store = useEditorStore();

  // Reset state and run heartbeat when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setStep('checking');
    setSelectedLayerName(null);
    setStartFrameIdx(null);
    setEndFrameIdx(null);
    setNumFrames(3);
    setGeneratedFrames([]);
    setIsGenerating(false);
    setError(null);
    setUnavailableDetail(null);

    let cancelled = false;
    const aiUrl = project.uiState.aiServiceUrl;

    if (!aiUrl) {
      setStep('unavailable');
      setUnavailableDetail('AI Service URL is not configured. Set it via the AI button in the header.');
      return;
    }

    checkAiHeartbeat(aiUrl).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok' && result.model_ready) {
        setStep(mode === 'variant' ? 'select-frames' : 'select-layer');
      } else {
        setStep('unavailable');
        setUnavailableDetail(result.detail || 'The AI service is not ready.');
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

  // Get unique layer names from first frame (for base mode layer selection)
  const layerNames = useMemo(() => {
    if (mode !== 'base' || object.frames.length === 0) return [];
    const firstFrame = object.frames[0];
    return firstFrame.layers
      .filter((l) => !l.isVariant)
      .map((l) => l.name);
  }, [mode, object.frames]);

  // Auto-select if only one layer
  useEffect(() => {
    if (mode === 'base' && layerNames.length === 1 && !selectedLayerName) {
      setSelectedLayerName(layerNames[0]);
      setStep('select-frames');
    }
  }, [mode, layerNames, selectedLayerName]);

  const framesBetween = useMemo(() => {
    if (startFrameIdx === null || endFrameIdx === null) return 0;
    return Math.max(0, endFrameIdx - startFrameIdx - 1);
  }, [startFrameIdx, endFrameIdx]);

  // Generate thumbnail base64 for each frame
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

  // Handle frame click for selection
  const handleFrameClick = useCallback((idx: number) => {
    if (startFrameIdx === null) {
      setStartFrameIdx(idx);
      setEndFrameIdx(null);
    } else if (endFrameIdx === null) {
      if (idx <= startFrameIdx) {
        // Reset: clicked same or before start
        setStartFrameIdx(idx);
        setEndFrameIdx(null);
      } else {
        setEndFrameIdx(idx);
      }
    } else {
      // Both selected; restart
      setStartFrameIdx(idx);
      setEndFrameIdx(null);
    }
    setError(null);
  }, [startFrameIdx, endFrameIdx]);

  // Build the preview strip frames (start + placeholders/generated + end)
  const previewStrip = useMemo(() => {
    if (startFrameIdx === null || endFrameIdx === null) return [];
    const strip: Array<{ type: 'start' | 'end' | 'generated' | 'placeholder'; base64: string }> = [];
    strip.push({ type: 'start', base64: frameThumbnails[startFrameIdx] || '' });
    for (let i = 0; i < numFrames; i++) {
      if (generatedFrames[i]) {
        strip.push({ type: 'generated', base64: generatedFrames[i] });
      } else {
        strip.push({ type: 'placeholder', base64: '' });
      }
    }
    strip.push({ type: 'end', base64: frameThumbnails[endFrameIdx] || '' });
    return strip;
  }, [startFrameIdx, endFrameIdx, numFrames, generatedFrames, frameThumbnails]);

  // All frames for animated preview (start + generated + end as base64)
  const animationFrames = useMemo(() => {
    if (startFrameIdx === null || endFrameIdx === null) return [];
    const frames: string[] = [frameThumbnails[startFrameIdx] || ''];
    for (const f of generatedFrames) {
      frames.push(f);
    }
    frames.push(frameThumbnails[endFrameIdx] || '');
    return frames;
  }, [startFrameIdx, endFrameIdx, generatedFrames, frameThumbnails]);

  // Generate interpolated frames
  const handleGenerate = useCallback(async () => {
    if (startFrameIdx === null || endFrameIdx === null) return;

    const aiUrl = project.uiState.aiServiceUrl;
    if (!aiUrl) {
      setError('AI Service URL not configured. Set it in the header AI settings.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedFrames([]);
    setStep('generating');

    try {
      const { width, height } = gridSize;
      let startBase64: string;
      let endBase64: string;

      if (mode === 'variant' && variantData) {
        startBase64 = renderVariantFrameToBase64(variantData.variant.frames[startFrameIdx], width, height);
        endBase64 = renderVariantFrameToBase64(variantData.variant.frames[endFrameIdx], width, height);
      } else if (selectedLayerName) {
        const startFrame = object.frames[startFrameIdx];
        const endFrame = object.frames[endFrameIdx];
        const startLayer = startFrame.layers.find((l) => l.name === selectedLayerName && !l.isVariant);
        const endLayer = endFrame.layers.find((l) => l.name === selectedLayerName && !l.isVariant);

        if (!startLayer || !endLayer) {
          setError('Selected layer not found in one of the frames.');
          setIsGenerating(false);
          setStep('preview');
          return;
        }
        startBase64 = renderLayerToBase64(startLayer, width, height);
        endBase64 = renderLayerToBase64(endLayer, width, height);
      } else {
        setError('No layer selected.');
        setIsGenerating(false);
        setStep('select-layer');
        return;
      }

      const result = await interpolateFrames(startBase64, endBase64, numFrames, aiUrl);
      setGeneratedFrames(result);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setStep('preview');
    } finally {
      setIsGenerating(false);
    }
  }, [startFrameIdx, endFrameIdx, numFrames, mode, variantData, object, selectedLayerName, gridSize, project.uiState.aiServiceUrl]);

  // Accept and apply generated frames
  const handleAccept = useCallback(async () => {
    if (startFrameIdx === null || endFrameIdx === null || generatedFrames.length === 0) return;

    const { width, height } = gridSize;

    try {
      // Convert all generated frames to PixelData
      const pixelDataArrays = await Promise.all(
        generatedFrames.map((b64) => base64ToPixelData(b64, width, height))
      );

      // Get current store state for mutation
      const currentProject = store.project;
      if (!currentProject) return;

      if (mode === 'variant' && variantData) {
        // Variant mode: insert frames into the variant
        const newProject = structuredClone(currentProject) as Project;
        const vgIdx = newProject.variants?.findIndex((vg) => vg.id === variantData.variantGroup.id) ?? -1;
        if (vgIdx < 0 || !newProject.variants) return;

        const vGroup = newProject.variants[vgIdx];
        const vIdx = vGroup.variants.findIndex((v) => v.id === variantData.variant.id);
        if (vIdx < 0) return;

        const variant = vGroup.variants[vIdx];
        const oldFrames = variant.frames;

        // Build new frame array: keep frames before start+1, add generated, keep frames from end onward
        const before = oldFrames.slice(0, startFrameIdx + 1);
        const after = oldFrames.slice(endFrameIdx);

        const newGenFrames: VariantFrame[] = pixelDataArrays.map((pixels) => ({
          id: generateId(),
          layers: [{
            id: generateId(),
            name: 'Layer 1',
            pixels,
            visible: true,
          }],
        }));

        variant.frames = [...before, ...newGenFrames, ...after];

        // Use store's internal project setter via a workaround -
        // We'll construct the project update and save it
        useEditorStore.setState({ project: newProject });
        // Trigger auto-save
        const { scheduleAutoSave } = await import('../../services/autoSave');
        scheduleAutoSave(newProject, store.projectName);
      } else {
        // Base object mode: insert frames
        const newProject = structuredClone(currentProject) as Project;
        const objIdx = newProject.objects.findIndex((o) => o.id === object.id);
        if (objIdx < 0) return;

        const obj = newProject.objects[objIdx];
        const oldFrames = obj.frames;

        // Build new frames: each generated frame gets a full layer stack
        const startFrame = oldFrames[startFrameIdx];
        const before = oldFrames.slice(0, startFrameIdx + 1);
        const after = oldFrames.slice(endFrameIdx);

        const newFrames: Frame[] = pixelDataArrays.map((pixels, i) => {
          // Create layers matching the start frame's layer structure
          const layers: Layer[] = startFrame.layers.map((srcLayer) => {
            if (srcLayer.name === selectedLayerName && !srcLayer.isVariant) {
              // This is the interpolated layer - use generated pixels
              return {
                id: generateId(),
                name: srcLayer.name,
                pixels,
                visible: srcLayer.visible,
              };
            }
            // Other layers: duplicate from start frame
            return {
              ...srcLayer,
              id: generateId(),
              pixels: srcLayer.pixels.map((row) => [...row]),
            };
          });

          return {
            id: generateId(),
            name: `Interp ${i + 1}`,
            layers,
          };
        });

        obj.frames = [...before, ...newFrames, ...after];

        // Save with history tracking for undo support
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
  }, [startFrameIdx, endFrameIdx, generatedFrames, gridSize, mode, variantData, object, selectedLayerName, store, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (!isGenerating) onClose();
  }, [isGenerating, onClose]);

  const canProceedToPreview = startFrameIdx !== null && endFrameIdx !== null && endFrameIdx > startFrameIdx;

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
          {/* Heartbeat check: loading state */}
          {step === 'checking' && (
            <div className="ai-heartbeat-checking">
              <div className="ai-heartbeat-spinner" />
              <p className="ai-heartbeat-text">Connecting to AI service...</p>
              <p className="ai-heartbeat-subtext">Running a readiness check to verify the model is loaded and operational.</p>
            </div>
          )}

          {/* Heartbeat check: unavailable */}
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

          {/* Step 1: Layer Selection (base mode only) */}
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
                      setStep('select-frames');
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

          {/* Step 2: Frame Selection */}
          {(step === 'select-frames' || step === 'preview' || step === 'generating' || step === 'review') && (
            <>
              {mode === 'base' && selectedLayerName && (
                <div className="ai-selected-layer-bar">
                  <span>Layer: <strong>{selectedLayerName}</strong></span>
                  <button
                    className="ai-change-layer-btn"
                    onClick={() => {
                      setStep('select-layer');
                      setStartFrameIdx(null);
                      setEndFrameIdx(null);
                      setGeneratedFrames([]);
                    }}
                    disabled={isGenerating}
                  >
                    Change
                  </button>
                </div>
              )}

              <div className="ai-frame-selection">
                <h3 className="ai-step-title">
                  {step === 'select-frames' ? 'Select Start & End Frames' :
                   step === 'review' ? 'Review Generated Frames' :
                   step === 'generating' ? 'Generating...' : 'Preview'}
                </h3>
                {step === 'select-frames' && (
                  <p className="ai-step-desc">Click a frame to set the start, then click another to set the end.</p>
                )}

                <div className="ai-frames-strip">
                  {frameThumbnails.map((thumb, idx) => {
                    const isStart = startFrameIdx === idx;
                    const isEnd = endFrameIdx === idx;
                    const isBetween = startFrameIdx !== null && endFrameIdx !== null &&
                      idx > startFrameIdx && idx < endFrameIdx;
                    return (
                      <div
                        key={idx}
                        className={`ai-frame-item ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} ${isBetween ? 'between' : ''}`}
                        onClick={() => !isGenerating && step !== 'review' && handleFrameClick(idx)}
                      >
                        <Base64Thumbnail base64={thumb} size={48} />
                        <span className="ai-frame-label">
                          {isStart ? 'Start' : isEnd ? 'End' : `#${idx + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Warning about frames between */}
                {framesBetween > 0 && step === 'select-frames' && (
                  <div className="ai-warning">
                    {framesBetween} frame{framesBetween > 1 ? 's' : ''} between the selected range will be replaced with generated frames.
                  </div>
                )}

                {/* Num frames input */}
                {canProceedToPreview && step !== 'review' && step !== 'generating' && (
                  <div className="ai-num-frames-row">
                    <label className="ai-num-label">Frames to generate:</label>
                    <input
                      type="number"
                      className="ai-num-input"
                      min={1}
                      max={64}
                      value={numFrames}
                      onChange={(e) => setNumFrames(Math.max(1, Math.min(64, parseInt(e.target.value) || 1)))}
                      disabled={isGenerating}
                    />
                  </div>
                )}
              </div>

              {/* Preview strip */}
              {canProceedToPreview && (step === 'preview' || step === 'generating' || step === 'review') && (
                <div className="ai-preview-section">
                  <h4 className="ai-preview-label">Generated Sequence</h4>
                  <div className="ai-preview-strip">
                    {previewStrip.map((item, idx) => (
                      <div key={idx} className={`ai-preview-item ${item.type}`}>
                        {item.base64 ? (
                          <Base64Thumbnail base64={item.base64} size={48} />
                        ) : (
                          <div className="ai-placeholder">
                            <div className="ai-placeholder-spinner" />
                          </div>
                        )}
                        <span className="ai-preview-item-label">
                          {item.type === 'start' ? 'Start' :
                           item.type === 'end' ? 'End' :
                           item.type === 'generated' ? `#${idx}` : '...'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Animated preview */}
                  {animationFrames.length > 0 && animationFrames.some(f => f) && (
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

          {!isGenerating && step !== 'review' && step !== 'checking' && step !== 'unavailable' && (
            <button className="ai-btn-cancel" onClick={onClose}>
              Cancel
            </button>
          )}

          {canProceedToPreview && (step === 'select-frames') && (
            <button
              className="ai-btn-preview"
              onClick={() => setStep('preview')}
            >
              Preview
            </button>
          )}

          {canProceedToPreview && step === 'preview' && (
            <button
              className="ai-btn-generate"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          )}

          {step === 'generating' && (
            <button className="ai-btn-generate" disabled>
              Generating...
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
