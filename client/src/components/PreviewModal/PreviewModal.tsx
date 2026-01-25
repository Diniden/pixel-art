import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PixelObject, Frame, VariantGroup, Layer, Variant } from '../../types';
import './PreviewModal.css';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  object: PixelObject;
  frames: Frame[];
  variantGroups?: VariantGroup[];
  zoom: number;
}

// Information about a variant layer in a frame (for compositing)
interface VariantLayerInfo {
  variantGroupId: string;
  selectedVariantId: string;
  layerIndex: number; // Position in the layer stack
}

// Pre-rendered data for playback
interface PreRenderedData {
  // Base frames with only regular (non-variant) layers, keyed by frame index
  // Each frame has layers rendered in order, keyed by layer index
  baseFrameLayers: Map<number, Map<number, ImageBitmap>>;
  // Variant frames, keyed by variantGroupId -> variantId -> frameIndex -> layerIndex -> ImageBitmap
  variantFrames: Map<string, Map<string, Map<number, Map<number, ImageBitmap>>>>;
  // Variant layer info per base frame (which variants are used and at what layer position)
  variantLayerInfoPerFrame: Map<number, VariantLayerInfo[]>;
  // Variant data for offset lookup, keyed by "variantGroupId:variantId"
  variants: Map<string, Variant>;
}

// Rasterize a single layer into ImageData (for base layers)
function rasterizeLayer(
  layer: Layer,
  gridWidth: number,
  gridHeight: number
): ImageData {
  const imageData = new ImageData(gridWidth, gridHeight);
  const data = imageData.data;

  for (let y = 0; y < gridHeight; y++) {
    const row = layer.pixels[y];
    if (!row) continue;

    for (let x = 0; x < gridWidth; x++) {
      const pixel = row[x];
      if (!pixel || pixel.a === 0) continue;

      const idx = (y * gridWidth + x) * 4;
      data[idx] = pixel.r;
      data[idx + 1] = pixel.g;
      data[idx + 2] = pixel.b;
      data[idx + 3] = pixel.a;
    }
  }

  return imageData;
}

// Rasterize a variant frame layer into ImageData (at variant's own grid size)
function rasterizeVariantLayer(
  layer: Layer,
  variantWidth: number,
  variantHeight: number
): ImageData {
  const imageData = new ImageData(variantWidth, variantHeight);
  const data = imageData.data;

  for (let y = 0; y < variantHeight; y++) {
    const row = layer.pixels[y];
    if (!row) continue;

    for (let x = 0; x < variantWidth; x++) {
      const pixel = row[x];
      if (!pixel || pixel.a === 0) continue;

      const idx = (y * variantWidth + x) * 4;
      data[idx] = pixel.r;
      data[idx + 1] = pixel.g;
      data[idx + 2] = pixel.b;
      data[idx + 3] = pixel.a;
    }
  }

  return imageData;
}

// Pre-render all layers separately for efficient compositing during playback
async function preRenderAllLayers(
  frames: Frame[],
  gridWidth: number,
  gridHeight: number,
  variantGroups?: VariantGroup[]
): Promise<PreRenderedData> {
  const baseFrameLayers = new Map<number, Map<number, ImageBitmap>>();
  const variantFrames = new Map<string, Map<string, Map<number, Map<number, ImageBitmap>>>>();
  const variantLayerInfoPerFrame = new Map<number, VariantLayerInfo[]>();
  const variants = new Map<string, Variant>();

  // Build variant lookup and pre-render variant frames
  if (variantGroups) {
    for (const vg of variantGroups) {
      for (const variant of vg.variants) {
        // Use composite key to store each variant
        variants.set(`${vg.id}:${variant.id}`, variant);

        if (!variantFrames.has(vg.id)) {
          variantFrames.set(vg.id, new Map());
        }
        const vgMap = variantFrames.get(vg.id)!;

        if (!vgMap.has(variant.id)) {
          vgMap.set(variant.id, new Map());
        }
        const variantMap = vgMap.get(variant.id)!;

        // Pre-render all frames for this variant
        for (let frameIdx = 0; frameIdx < variant.frames.length; frameIdx++) {
          const vFrame = variant.frames[frameIdx];
          const layerMap = new Map<number, ImageBitmap>();

          for (let layerIdx = 0; layerIdx < vFrame.layers.length; layerIdx++) {
            const layer = vFrame.layers[layerIdx];
            if (!layer.visible) continue;

            const imageData = rasterizeVariantLayer(
              layer,
              variant.gridSize.width,
              variant.gridSize.height
            );
            const bitmap = await createImageBitmap(imageData);
            layerMap.set(layerIdx, bitmap);
          }

          variantMap.set(frameIdx, layerMap);
        }
      }
    }
  }

  // Pre-render base frame layers (non-variant layers only)
  for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
    const frame = frames[frameIdx];
    const layerMap = new Map<number, ImageBitmap>();
    const variantInfos: VariantLayerInfo[] = [];

    for (let layerIdx = 0; layerIdx < frame.layers.length; layerIdx++) {
      const layer = frame.layers[layerIdx];
      if (!layer.visible) continue;

      if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
        // Record variant layer info for compositing
        variantInfos.push({
          variantGroupId: layer.variantGroupId,
          selectedVariantId: layer.selectedVariantId,
          layerIndex: layerIdx
        });
      } else {
        // Pre-render regular layer
        const imageData = rasterizeLayer(layer, gridWidth, gridHeight);
        const bitmap = await createImageBitmap(imageData);
        layerMap.set(layerIdx, bitmap);
      }
    }

    baseFrameLayers.set(frameIdx, layerMap);
    variantLayerInfoPerFrame.set(frameIdx, variantInfos);
  }

  return {
    baseFrameLayers,
    variantFrames,
    variantLayerInfoPerFrame,
    variants
  };
}

export function PreviewModal({ isOpen, onClose, object, frames, variantGroups, zoom }: PreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preRendered, setPreRendered] = useState<PreRenderedData | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  // Independent playheads for each variant group
  const [variantPlayheads, setVariantPlayheads] = useState<Map<string, number>>(new Map());
  const [fps, setFps] = useState(12);
  const [isLoading, setIsLoading] = useState(true);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const { width: gridWidth, height: gridHeight } = object.gridSize;

  // Get variant frame counts for initializing playheads
  const getVariantFrameCounts = useCallback(() => {
    const counts = new Map<string, number>();
    if (variantGroups) {
      for (const vg of variantGroups) {
        for (const variant of vg.variants) {
          counts.set(`${vg.id}:${variant.id}`, variant.frames.length);
        }
      }
    }
    return counts;
  }, [variantGroups]);

  // Pre-render layers when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Clean up when modal closes
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Release ImageBitmaps
      if (preRendered) {
        preRendered.baseFrameLayers.forEach(layerMap => {
          layerMap.forEach(bitmap => bitmap.close());
        });
        preRendered.variantFrames.forEach(vgMap => {
          vgMap.forEach(variantMap => {
            variantMap.forEach(frameMap => {
              frameMap.forEach(bitmap => bitmap.close());
            });
          });
        });
      }
      setPreRendered(null);
      setCurrentFrame(0);
      setVariantPlayheads(new Map());
      setIsLoading(true);
      return;
    }

    // Pre-render all layers
    setIsLoading(true);
    preRenderAllLayers(frames, gridWidth, gridHeight, variantGroups)
      .then(data => {
        setPreRendered(data);
        // Initialize variant playheads to 0
        const initialPlayheads = new Map<string, number>();
        if (variantGroups) {
          for (const vg of variantGroups) {
            initialPlayheads.set(vg.id, 0);
          }
        }
        setVariantPlayheads(initialPlayheads);
        setIsLoading(false);
      });
  }, [isOpen, frames, gridWidth, gridHeight, variantGroups]);

  // Animation loop using requestAnimationFrame
  const animate = useCallback((timestamp: number) => {
    if (!preRendered || frames.length === 0) return;

    const frameInterval = 1000 / fps;
    const elapsed = timestamp - lastFrameTimeRef.current;

    if (elapsed >= frameInterval) {
      // Advance base frame
      setCurrentFrame(prev => (prev + 1) % frames.length);

      // Advance each variant's playhead independently
      const variantCounts = getVariantFrameCounts();
      setVariantPlayheads(prev => {
        const next = new Map(prev);
        // For each variant layer info in the current frame, advance its playhead
        const variantInfos = preRendered.variantLayerInfoPerFrame.get(currentFrame) || [];
        const advancedGroups = new Set<string>();

        for (const info of variantInfos) {
          if (advancedGroups.has(info.variantGroupId)) continue;
          advancedGroups.add(info.variantGroupId);

          const key = `${info.variantGroupId}:${info.selectedVariantId}`;
          const frameCount = variantCounts.get(key) || 1;
          const currentPlayhead = prev.get(info.variantGroupId) || 0;
          next.set(info.variantGroupId, (currentPlayhead + 1) % frameCount);
        }

        return next;
      });

      lastFrameTimeRef.current = timestamp - (elapsed % frameInterval);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [preRendered, frames.length, fps, getVariantFrameCounts, currentFrame]);

  // Start animation when frames are ready
  useEffect(() => {
    if (!isOpen || isLoading || !preRendered) return;

    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isOpen, isLoading, preRendered, animate]);

  // Composite and render current frame to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !preRendered) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw checkerboard background
    const checkSize = Math.max(zoom, 4);
    for (let y = 0; y < canvas.height; y += checkSize) {
      for (let x = 0; x < canvas.width; x += checkSize) {
        const isLight = ((x / checkSize) + (y / checkSize)) % 2 === 0;
        ctx.fillStyle = isLight ? '#2a2a3a' : '#222230';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    const currentFrameData = frames[currentFrame];
    if (!currentFrameData) return;

    const baseLayers = preRendered.baseFrameLayers.get(currentFrame);
    const variantInfos = preRendered.variantLayerInfoPerFrame.get(currentFrame) || [];

    // Build a list of all layers to render in order
    const layersToRender: { type: 'base' | 'variant'; layerIndex: number; info?: VariantLayerInfo }[] = [];

    for (let layerIdx = 0; layerIdx < currentFrameData.layers.length; layerIdx++) {
      const layer = currentFrameData.layers[layerIdx];
      if (!layer.visible) continue;

      const variantInfo = variantInfos.find(v => v.layerIndex === layerIdx);
      if (variantInfo) {
        layersToRender.push({ type: 'variant', layerIndex: layerIdx, info: variantInfo });
      } else if (baseLayers?.has(layerIdx)) {
        layersToRender.push({ type: 'base', layerIndex: layerIdx });
      }
    }

    // Render layers in order (bottom to top)
    for (const item of layersToRender) {
      if (item.type === 'base') {
        const bitmap = baseLayers?.get(item.layerIndex);
        if (bitmap) {
          ctx.drawImage(bitmap, 0, 0, gridWidth * zoom, gridHeight * zoom);
        }
      } else if (item.type === 'variant' && item.info) {
        const { variantGroupId, selectedVariantId } = item.info;
        const variantPlayhead = variantPlayheads.get(variantGroupId) || 0;

        // Get the variant data
        const vgFrames = preRendered.variantFrames.get(variantGroupId);
        const variantFrameMap = vgFrames?.get(selectedVariantId);
        const frameLayerMap = variantFrameMap?.get(variantPlayhead);

        if (frameLayerMap) {
          // Get offset for this variant at the current base frame
          const variant = preRendered.variants.get(`${variantGroupId}:${selectedVariantId}`);
          const offset = variant?.baseFrameOffsets?.[currentFrame] ?? { x: 0, y: 0 };

          // Render all layers of this variant frame
          frameLayerMap.forEach((bitmap) => {
            ctx.drawImage(
              bitmap,
              offset.x * zoom,
              offset.y * zoom,
              bitmap.width * zoom,
              bitmap.height * zoom
            );
          });
        }
      }
    }
  }, [currentFrame, variantPlayheads, preRendered, zoom, gridWidth, gridHeight, frames]);

  // Handle keyboard
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canvasWidth = gridWidth * zoom;
  const canvasHeight = gridHeight * zoom;

  return createPortal(
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3 className="preview-modal-title">⚡ Optimized Preview</h3>
          <button className="preview-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="preview-modal-content">
          {isLoading ? (
            <div className="preview-loading">
              <div className="preview-loading-spinner"></div>
              <span>Rasterizing frames...</span>
            </div>
          ) : (
            <div className="preview-canvas-container">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="preview-canvas"
              />
            </div>
          )}
        </div>

        <div className="preview-modal-controls">
          <div className="preview-fps-control">
            <label className="preview-fps-label">FPS:</label>
            <input
              type="range"
              min="1"
              max="60"
              value={fps}
              onChange={e => setFps(Number(e.target.value))}
              className="preview-fps-slider"
            />
            <input
              type="number"
              min="1"
              max="60"
              value={fps}
              onChange={e => setFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="preview-fps-input"
            />
          </div>

          <div className="preview-info">
            <span className="preview-frame-counter">
              Frame {currentFrame + 1} / {frames.length}
            </span>
            <span className="preview-size">
              {gridWidth} × {gridHeight} @ {zoom}x
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

