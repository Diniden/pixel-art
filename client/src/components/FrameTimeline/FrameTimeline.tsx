import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { Frame } from '../../types';
import './FrameTimeline.css';

// Memoized thumbnail component that only re-renders when frame data actually changes
const FrameThumbnail = memo(function FrameThumbnail({
  frame,
  width,
  height
}: {
  frame: Frame;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 48;
  const scale = Math.min(thumbSize / width, thumbSize / height);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Use ImageData for faster rendering
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    const data = imageData.data;

    // Draw checkerboard background
    const checkSize = 4;
    for (let y = 0; y < thumbSize; y++) {
      for (let x = 0; x < thumbSize; x++) {
        const idx = (y * thumbSize + x) * 4;
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

    // Render layers
    const offsetX = (thumbSize - width * scale) / 2;
    const offsetY = (thumbSize - height * scale) / 2;

    for (const layer of frame.layers) {
      if (!layer.visible) continue;

      for (let py = 0; py < height; py++) {
        const row = layer.pixels[py];
        if (!row) continue;

        for (let px = 0; px < width; px++) {
          const pixel = row[px];
          if (!pixel || pixel.a === 0) continue;

          // Calculate the area this pixel covers in thumbnail
          const startX = Math.floor(offsetX + px * scale);
          const startY = Math.floor(offsetY + py * scale);
          const endX = Math.ceil(offsetX + (px + 1) * scale);
          const endY = Math.ceil(offsetY + (py + 1) * scale);

          const srcAlpha = pixel.a / 255;

          for (let ty = startY; ty < endY && ty < thumbSize; ty++) {
            if (ty < 0) continue;
            for (let tx = startX; tx < endX && tx < thumbSize; tx++) {
              if (tx < 0) continue;
              const idx = (ty * thumbSize + tx) * 4;

              // Alpha blending
              const dstAlpha = data[idx + 3] / 255;
              const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

              if (outAlpha > 0) {
                data[idx] = (pixel.r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) / outAlpha;
                data[idx + 1] = (pixel.g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha;
                data[idx + 2] = (pixel.b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha;
                data[idx + 3] = outAlpha * 255;
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [frame, width, height, scale]);

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
  onFinishRename
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

export function FrameTimeline() {
  const {
    project,
    getCurrentObject,
    addFrame,
    deleteFrame,
    renameFrame,
    selectFrame,
    duplicateFrame,
    moveFrame
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
