import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { Frame, Variant, VariantFrame } from '../../types';
import './FrameTimeline.css';

// Cached checkerboard for frame thumbnails
const FRAME_CHECKERBOARD_CACHE = new Map<number, Uint8ClampedArray>();
function getFrameCheckerboard(size: number): Uint8ClampedArray {
  if (!FRAME_CHECKERBOARD_CACHE.has(size)) {
    const data = new Uint8ClampedArray(size * size * 4);
    const checkSize = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2) === 0) {
          data[idx] = 42;     // #2a2a3a
          data[idx + 1] = 42;
          data[idx + 2] = 58;
        } else {
          data[idx] = 34;     // #222230
          data[idx + 1] = 34;
          data[idx + 2] = 48;
        }
        data[idx + 3] = 255;
      }
    }
    FRAME_CHECKERBOARD_CACHE.set(size, data);
  }
  return FRAME_CHECKERBOARD_CACHE.get(size)!;
}

// Memoized thumbnail component that only re-renders when frame data actually changes
const FrameThumbnail = memo(function FrameThumbnail({
  frame,
  width,
  height,
  obj,
  project
}: {
  frame: Frame;
  width: number;
  height: number;
  obj?: { variantGroups?: import('../../types').VariantGroup[] };
  project?: { uiState?: { variantFrameIndices?: { [key: string]: number } } };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 48;
  const scale = Math.min(thumbSize / width, thumbSize / height);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Use ImageData with cached checkerboard
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    const data = imageData.data;
    const checkerboard = getFrameCheckerboard(thumbSize);
    data.set(checkerboard);

    // Render layers
    const offsetX = Math.floor((thumbSize - width * scale) / 2);
    const offsetY = Math.floor((thumbSize - height * scale) / 2);

    // Render regular layers (back to front for proper alpha blending)
    for (let layerIdx = frame.layers.length - 1; layerIdx >= 0; layerIdx--) {
      const layer = frame.layers[layerIdx];
      if (!layer.visible) continue;

      // Skip variant layers - they'll be rendered separately
      if (layer.isVariant) continue;

      const pixels = layer.pixels;
      if (!pixels) continue;

      for (let py = 0; py < height; py++) {
        const row = pixels[py];
        if (!row) continue;

        for (let px = 0; px < width; px++) {
          const pixel = row[px];
          if (!pixel || pixel.a === 0) continue;

          // Calculate the area this pixel covers in thumbnail
          const thumbX = Math.floor(offsetX + px * scale);
          const thumbY = Math.floor(offsetY + py * scale);
          const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (px + 1) * scale));
          const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (py + 1) * scale));

          if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

          const srcAlpha = pixel.a / 255;
          const r = pixel.r;
          const g = pixel.g;
          const b = pixel.b;

          for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
            for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
              const idx = (ty * thumbSize + tx) * 4;

              // Alpha blending
              const dstAlpha = data[idx + 3] / 255;
              const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

              if (outAlpha > 0.01) {
                const invOutAlpha = 1 / outAlpha;
                data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 3] = outAlpha * 255;
              }
            }
          }
        }
      }
    }

    // Render variant layers
    if (obj?.variantGroups && project?.uiState?.variantFrameIndices) {
      for (const layer of frame.layers) {
        if (!layer.visible || !layer.isVariant || !layer.variantGroupId) continue;

        const vg = obj.variantGroups.find(vg => vg.id === layer.variantGroupId);
        const variant = vg?.variants.find(v => v.id === layer.selectedVariantId);
        const frameIdx = project.uiState.variantFrameIndices[layer.variantGroupId] ?? 0;
        const vFrame = variant?.frames[frameIdx % (variant?.frames.length || 1)];

        if (variant && vFrame) {
          const vOffset = vFrame.offset;
          const vHeight = variant.gridSize.height;
          const vWidth = variant.gridSize.width;

          for (const vl of vFrame.layers) {
            if (!vl.visible) continue;

            for (let vy = 0; vy < vHeight; vy++) {
              const row = vl.pixels[vy];
              if (!row) continue;

              for (let vx = 0; vx < vWidth; vx++) {
                const pixel = row[vx];
                if (!pixel || pixel.a === 0) continue;

                // Calculate position in base object coordinates
                const baseX = vOffset.x + vx;
                const baseY = vOffset.y + vy;

                // Skip if outside base object bounds
                if (baseX < 0 || baseX >= width || baseY < 0 || baseY >= height) continue;

                // Calculate the area this pixel covers in thumbnail (use same scale as base)
                const thumbX = Math.floor(offsetX + baseX * scale);
                const thumbY = Math.floor(offsetY + baseY * scale);
                const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (baseX + 1) * scale));
                const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (baseY + 1) * scale));

                if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

                const srcAlpha = pixel.a / 255;
                const r = pixel.r;
                const g = pixel.g;
                const b = pixel.b;

                for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
                  for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
                    const idx = (ty * thumbSize + tx) * 4;

                    // Alpha blending
                    const dstAlpha = data[idx + 3] / 255;
                    const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

                    if (outAlpha > 0.01) {
                      const invOutAlpha = 1 / outAlpha;
                      data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                      data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                      data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                      data[idx + 3] = outAlpha * 255;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [frame, width, height, scale, obj, project]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="frame-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if frame content actually changed
  if (prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) {
    return false;
  }

  const prevFrame = prevProps.frame;
  const nextFrame = nextProps.frame;

  if (prevFrame === nextFrame) return true;
  if (prevFrame.id !== nextFrame.id) return false;
  if (prevFrame.layers.length !== nextFrame.layers.length) return false;

  // Check if any layer pixels changed
  for (let i = 0; i < prevFrame.layers.length; i++) {
    const prevLayer = prevFrame.layers[i];
    const nextLayer = nextFrame.layers[i];

    if (prevLayer.visible !== nextLayer.visible) return false;
    if (prevLayer.pixels !== nextLayer.pixels) return false;
  }

  return true;
});

// Memoized frame item to prevent unnecessary re-renders
const FrameItem = memo(function FrameItem({
  frame,
  index,
  isSelected,
  gridWidth,
  gridHeight,
  framesCount,
  onSelect,
  onDuplicate,
  onDelete,
  onStartRename,
  editingId,
  editingName,
  onEditingNameChange,
  onFinishRename,
  obj,
  project
}: {
  frame: Frame;
  index: number;
  isSelected: boolean;
  gridWidth: number;
  gridHeight: number;
  framesCount: number;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  editingId: string | null;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onFinishRename: (id: string) => void;
  obj?: { variantGroups?: import('../../types').VariantGroup[] };
  project?: { uiState?: { variantFrameIndices?: { [key: string]: number } } };
}) {
  return (
    <div
      className={`frame-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(frame.id)}
    >
      <div className="frame-thumbnail">
        <FrameThumbnail
          frame={frame}
          width={gridWidth}
          height={gridHeight}
          obj={obj}
          project={project}
        />
      </div>

      <div className="frame-info">
        {editingId === frame.id ? (
          <input
            type="text"
            className="frame-name-input"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={() => onFinishRename(frame.id)}
            onKeyDown={(e) => e.key === 'Enter' && onFinishRename(frame.id)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span
            className="frame-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename(frame.id, frame.name);
            }}
          >
            {frame.name}
          </span>
        )}
        <span className="frame-index">#{index + 1}</span>
      </div>

      <div className="frame-actions">
        <button
          className="frame-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(frame.id);
          }}
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          className="frame-action-btn delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(frame.id);
          }}
          disabled={framesCount <= 1}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
});

// Cached checkerboard for variant frame thumbnails
const VARIANT_FRAME_CHECKERBOARD_CACHE = new Map<number, Uint8ClampedArray>();
function getVariantFrameCheckerboard(size: number): Uint8ClampedArray {
  if (!VARIANT_FRAME_CHECKERBOARD_CACHE.has(size)) {
    const data = new Uint8ClampedArray(size * size * 4);
    const checkSize = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2) === 0) {
          data[idx] = 42;
          data[idx + 1] = 42;
          data[idx + 2] = 58;
        } else {
          data[idx] = 34;
          data[idx + 1] = 34;
          data[idx + 2] = 48;
        }
        data[idx + 3] = 255;
      }
    }
    VARIANT_FRAME_CHECKERBOARD_CACHE.set(size, data);
  }
  return VARIANT_FRAME_CHECKERBOARD_CACHE.get(size)!;
}

// Optimized variant frame thumbnail
const VariantFrameThumbnail = memo(function VariantFrameThumbnail({
  variantFrame,
  variant,
}: {
  variantFrame: VariantFrame;
  variant: Variant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 48;
  const { width, height } = variant.gridSize;
  const scale = Math.min(thumbSize / width, thumbSize / height);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = false;

    if (width === 0 || height === 0 || variantFrame.layers.length === 0) {
      const checkerboard = getVariantFrameCheckerboard(thumbSize);
      const imageData = ctx.createImageData(thumbSize, thumbSize);
      imageData.data.set(checkerboard);
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    const imageData = ctx.createImageData(thumbSize, thumbSize);
    const data = imageData.data;
    const checkerboard = getVariantFrameCheckerboard(thumbSize);
    data.set(checkerboard);

    const offsetX = Math.floor((thumbSize - width * scale) / 2);
    const offsetY = Math.floor((thumbSize - height * scale) / 2);

    // Render layers (back to front)
    for (let layerIdx = variantFrame.layers.length - 1; layerIdx >= 0; layerIdx--) {
      const layer = variantFrame.layers[layerIdx];
      if (!layer.visible) continue;

      const pixels = layer.pixels;
      if (!pixels) continue;

      for (let py = 0; py < height; py++) {
        const row = pixels[py];
        if (!row) continue;

        for (let px = 0; px < width; px++) {
          const pixel = row[px];
          if (!pixel || pixel.a === 0) continue;

          const thumbX = Math.floor(offsetX + px * scale);
          const thumbY = Math.floor(offsetY + py * scale);
          const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (px + 1) * scale));
          const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (py + 1) * scale));

          if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

          const srcAlpha = pixel.a / 255;
          const r = pixel.r;
          const g = pixel.g;
          const b = pixel.b;

          for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
            for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
              const idx = (ty * thumbSize + tx) * 4;

              const dstAlpha = data[idx + 3] / 255;
              const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

              if (outAlpha > 0.01) {
                const invOutAlpha = 1 / outAlpha;
                data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
                data[idx + 3] = outAlpha * 255;
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [variantFrame, variant, width, height, scale]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="frame-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison for variant frame thumbnails
  const prev = prevProps.variantFrame;
  const next = nextProps.variantFrame;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.offset.x !== next.offset.x || prev.offset.y !== next.offset.y) return false;
  if (prev.layers.length !== next.layers.length) return false;

  // Check if layer pixels changed
  for (let i = 0; i < prev.layers.length; i++) {
    const prevLayer = prev.layers[i];
    const nextLayer = next.layers[i];

    if (prevLayer.visible !== nextLayer.visible) return false;
    if (prevLayer.pixels !== nextLayer.pixels) return false;
  }

  // Also check if variant grid size changed
  if (prevProps.variant.gridSize.width !== nextProps.variant.gridSize.width ||
      prevProps.variant.gridSize.height !== nextProps.variant.gridSize.height) {
    return false;
  }

  return true;
});

export function FrameTimeline() {
  const {
    project,
    getCurrentObject,
    getCurrentLayer,
    getCurrentVariant,
    isEditingVariant,
    addFrame,
    deleteFrame,
    renameFrame,
    selectFrame,
    duplicateFrame,
    moveFrame,
    selectVariantFrame,
    advanceVariantFrames
  } = useEditorStore();

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const playInterval = useRef<number | null>(null);

  const obj = getCurrentObject();

  useEffect(() => {
    return () => {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    };
  }, []);

  const handleAddFrame = useCallback(() => {
    const frames = obj?.frames ?? [];
    const name = newFrameName.trim() || `Frame ${frames.length + 1}`;
    addFrame(name, copyPrevious);
    setNewFrameName('');
  }, [obj?.frames, newFrameName, copyPrevious, addFrame]);

  const handleStartRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  }, []);

  const handleFinishRename = useCallback((id: string) => {
    if (editingName.trim()) {
      renameFrame(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingName, renameFrame]);

  const handleEditingNameChange = useCallback((name: string) => {
    setEditingName(name);
  }, []);

  const layer = getCurrentLayer();
  const variantData = getCurrentVariant();
  const editingVariant = isEditingVariant();

  if (!project || !obj) return null;

  const { selectedFrameId } = project.uiState;
  const frames = obj.frames;
  const selectedFrameIndex = frames.findIndex(f => f.id === selectedFrameId);
  const canMoveLeft = selectedFrameIndex > 0;
  const canMoveRight = selectedFrameIndex >= 0 && selectedFrameIndex < frames.length - 1;

  const handleMoveLeft = () => {
    if (selectedFrameId && canMoveLeft) {
      moveFrame(selectedFrameId, 'left');
    }
  };

  const handleMoveRight = () => {
    if (selectedFrameId && canMoveRight) {
      moveFrame(selectedFrameId, 'right');
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      if (playInterval.current) {
        clearInterval(playInterval.current);
        playInterval.current = null;
      }
      setIsPlaying(false);
    } else {
      let currentIndex = frames.findIndex(f => f.id === selectedFrameId);
      playInterval.current = window.setInterval(() => {
        currentIndex = (currentIndex + 1) % frames.length;
        selectFrame(frames[currentIndex].id);
      }, 200);
      setIsPlaying(true);
    }
  };

  // Store togglePlayback in a ref for the keyboard handler
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;

  // Keyboard shortcut: Enter to toggle playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        togglePlaybackRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="frame-timeline">
      <div className="timeline-header">
        <div className="timeline-title-group">
          <div className="timeline-title">Frames</div>
          <div className="frame-move-controls">
            <button
              className="frame-move-btn"
              onClick={handleMoveLeft}
              disabled={!canMoveLeft}
              title="Move Frame Left"
            >
              ◂
            </button>
            <button
              className="frame-move-btn"
              onClick={handleMoveRight}
              disabled={!canMoveRight}
              title="Move Frame Right"
            >
              ▸
            </button>
          </div>
        </div>
        <div className="timeline-controls">
          <button
            className={`play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlayback}
            title={isPlaying ? 'Stop' : 'Play'}
          >
            {isPlaying ? '⏹' : '▶'}
          </button>
          <label className="copy-previous-label" title="Copy pixels from current frame">
            <input
              type="checkbox"
              checked={copyPrevious}
              onChange={(e) => setCopyPrevious(e.target.checked)}
            />
            <span>Copy</span>
          </label>
          <input
            type="text"
            className="new-frame-input"
            placeholder="New frame..."
            value={newFrameName}
            onChange={(e) => setNewFrameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFrame()}
          />
          <button className="add-frame-btn" onClick={handleAddFrame}>
            + Add
          </button>
        </div>
      </div>

      <div className="frames-scroll">
        <div className="frames-list">
          {frames.map((frame, index) => (
            <FrameItem
              key={frame.id}
              frame={frame}
              index={index}
              isSelected={selectedFrameId === frame.id}
              gridWidth={obj.gridSize.width}
              gridHeight={obj.gridSize.height}
              framesCount={frames.length}
              onSelect={selectFrame}
              onDuplicate={duplicateFrame}
              onDelete={deleteFrame}
              onStartRename={handleStartRename}
              editingId={editingId}
              editingName={editingName}
              onEditingNameChange={handleEditingNameChange}
              onFinishRename={handleFinishRename}
              obj={obj}
              project={project}
            />
          ))}
        </div>
      </div>

      {/* Variant frames timeline - shown when editing a variant */}
      {editingVariant && variantData && layer && (
        <div className="variant-timeline">
          <div className="variant-frames-scroll">
            <div className="variant-frames-list">
              {variantData.variant.frames.map((vFrame, index) => {
                const isSelected = (project.uiState.variantFrameIndices?.[variantData.variantGroup.id] ?? 0) === index;
                return (
                  <div
                    key={vFrame.id}
                    className={`variant-frame-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectVariantFrame(variantData.variantGroup.id, index)}
                  >
                    <div className="variant-frame-thumbnail">
                      <VariantFrameThumbnail
                        variantFrame={vFrame}
                        variant={variantData.variant}
                      />
                    </div>
                    <div className="variant-frame-info-row">
                      <span className="variant-frame-index">#{index + 1}</span>
                      <span className="variant-frame-offset">
                        ({vFrame.offset.x}, {vFrame.offset.y})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
