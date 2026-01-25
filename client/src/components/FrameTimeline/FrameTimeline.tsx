import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { Frame, Variant, VariantFrame } from '../../types';
import { renderFramePreview, renderVariantFramePreview } from '../../utils/previewRenderer';
import { PreviewModal } from '../PreviewModal/PreviewModal';
import './FrameTimeline.css';

// Memoized thumbnail component that only re-renders when frame data actually changes
const FrameThumbnail = memo(function FrameThumbnail({
  frame,
  width,
  height,
  obj,
  project,
  frameIndex,
  isSelected
}: {
  frame: Frame;
  width: number;
  height: number;
  obj?: { variantGroups?: import('../../types').VariantGroup[] };
  project?: { uiState?: { variantFrameIndices?: { [key: string]: number } } };
  frameIndex: number;
  isSelected: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbSize = 48;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    // For static thumbnails (non-selected frames), calculate variant frame indices
    // based on the frame's position in the timeline. For the selected frame,
    // use the current variantFrameIndices to show live updates.
    let variantFrameIndices: { [key: string]: number } | undefined;

    if (isSelected) {
      // Use current indices for the selected frame (allows live updates while editing)
      variantFrameIndices = project?.uiState?.variantFrameIndices;
    } else if (obj?.variantGroups) {
      // Calculate static indices based on frame position
      variantFrameIndices = {};
      for (const vg of obj.variantGroups) {
        const variant = vg.variants[0]; // All variants should have same frame count
        if (variant && variant.frames.length > 0) {
          // Use frame index modulo variant frame count to determine which variant frame to show
          variantFrameIndices[vg.id] = frameIndex % variant.frames.length;
        }
      }
    }

    renderFramePreview(ctx, {
      thumbSize,
      gridWidth: width,
      gridHeight: height,
      frame,
      frameIndex, // Pass base frame index for offset lookup
      variantGroups: obj?.variantGroups,
      variantFrameIndices
    });
  }, [frame, width, height, obj, project, frameIndex, isSelected]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="frame-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if frame content actually changed
  if (prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) {
    return false;
  }

  if (prevProps.frameIndex !== nextProps.frameIndex) {
    // Frame index changed - only re-render if not selected (selected frame uses current indices)
    if (!nextProps.isSelected) return false;
  }

  // Check if baseFrameOffsets changed for this frame index
  if (prevProps.obj?.variantGroups && nextProps.obj?.variantGroups) {
    for (let i = 0; i < prevProps.obj.variantGroups.length; i++) {
      const prevVg = prevProps.obj.variantGroups[i];
      const nextVg = nextProps.obj.variantGroups[i];
      if (!nextVg) return false;

      for (let j = 0; j < prevVg.variants.length; j++) {
        const prevVariant = prevVg.variants[j];
        const nextVariant = nextVg.variants[j];
        if (!nextVariant) return false;

        const prevOffset = prevVariant.baseFrameOffsets?.[nextProps.frameIndex];
        const nextOffset = nextVariant.baseFrameOffsets?.[nextProps.frameIndex];
        if (prevOffset?.x !== nextOffset?.x || prevOffset?.y !== nextOffset?.y) {
          return false; // Offset changed, re-render
        }
      }
    }
  }

  const prevFrame = prevProps.frame;
  const nextFrame = nextProps.frame;

  if (prevFrame === nextFrame) {
    // Frame is the same - only check variant frame indices if this is the selected frame
    if (nextProps.isSelected && prevProps.obj?.variantGroups && nextProps.obj?.variantGroups) {
      const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
      const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
      if (prevIndices !== nextIndices) {
        // Check if any relevant variant frame indices changed
        for (const vg of prevProps.obj.variantGroups) {
          const prevIdx = prevIndices?.[vg.id] ?? 0;
          const nextIdx = nextIndices?.[vg.id] ?? 0;
          if (prevIdx !== nextIdx) return false;
        }
      }
    }
    // For non-selected frames, ignore variantFrameIndices changes (they use static indices)
    return true;
  }

  if (prevFrame.id !== nextFrame.id) return false;
  if (prevFrame.layers.length !== nextFrame.layers.length) return false;

  // Check if any layer pixels changed
  for (let i = 0; i < prevFrame.layers.length; i++) {
    const prevLayer = prevFrame.layers[i];
    const nextLayer = nextFrame.layers[i];

    if (prevLayer.visible !== nextLayer.visible) return false;
    if (prevLayer.pixels !== nextLayer.pixels) return false;
  }

  // Only check variant frame indices if this is the selected frame
  if (nextProps.isSelected && prevProps.obj?.variantGroups && nextProps.obj?.variantGroups) {
    const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
    const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
    if (prevIndices !== nextIndices) {
      // Check if any relevant variant frame indices changed
      for (const vg of prevProps.obj.variantGroups) {
        const prevIdx = prevIndices?.[vg.id] ?? 0;
        const nextIdx = nextIndices?.[vg.id] ?? 0;
        if (prevIdx !== nextIdx) return false;
      }
    }
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
          frameIndex={index}
          isSelected={isSelected}
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: false });
    if (!canvas || !ctx) return;

    renderVariantFramePreview(ctx, thumbSize, variant, variantFrame);
  }, [variantFrame, variant]);

  return <canvas ref={canvasRef} width={thumbSize} height={thumbSize} className="frame-thumb-canvas" />;
}, (prevProps, nextProps) => {
  // Custom comparison for variant frame thumbnails
  const prev = prevProps.variantFrame;
  const next = nextProps.variantFrame;

  if (prev === next) return true;
  if (prev.id !== next.id) return false;
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

  // Check if variant baseFrameOffsets changed
  const prevOffsets = prevProps.variant.baseFrameOffsets;
  const nextOffsets = nextProps.variant.baseFrameOffsets;
  if (prevOffsets !== nextOffsets) {
    // If one is undefined and other is not, re-render
    if (!prevOffsets || !nextOffsets) return false;
    // Check if any offset changed
    const allKeys = new Set([...Object.keys(prevOffsets), ...Object.keys(nextOffsets)]);
    for (const key of allKeys) {
      const prevOffset = prevOffsets[parseInt(key)] || { x: 0, y: 0 };
      const nextOffset = nextOffsets[parseInt(key)] || { x: 0, y: 0 };
      if (prevOffset.x !== nextOffset.x || prevOffset.y !== nextOffset.y) return false;
    }
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
    advanceVariantFrames,
    duplicateVariantFrame,
    deleteVariantFrame,
    addVariantFrame,
    moveVariantFrame
  } = useEditorStore();

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  // Create variant frame handlers at top level to avoid hooks order issues
  const handleAddVariantFrame = useCallback(() => {
    if (!variantData) return;
    const variantGroupId = variantData.variantGroup.id;
    const variantId = variantData.variant.id;
    addVariantFrame(variantGroupId, variantId, copyPrevious);
    setNewFrameName('');
  }, [variantData, copyPrevious, addVariantFrame]);

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

  const togglePlayback = useCallback(() => {
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
        // Don't sync variants to base frames during playback - they advance independently
        selectFrame(frames[currentIndex].id, false);
        // Advance all variant frames independently
        advanceVariantFrames(1);
      }, 200);
      setIsPlaying(true);
    }
  }, [isPlaying, frames, selectedFrameId, selectFrame, advanceVariantFrames]);

  // Store togglePlayback in a ref for the keyboard handler
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;

  // Keyboard shortcut: Enter to toggle playback
  // This will be updated in the variant section if editing a variant
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

  // When editing a variant, show variant frames AND base object frames for offset editing
  if (editingVariant && variantData && layer) {
    const variantFrames = variantData.variant.frames;
    const variantGroupId = variantData.variantGroup.id;
    const variantId = variantData.variant.id;
    const currentVariantFrameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
    const canMoveVariantLeft = currentVariantFrameIndex > 0;
    const canMoveVariantRight = currentVariantFrameIndex >= 0 && currentVariantFrameIndex < variantFrames.length - 1;

    // Get current base frame index for offset editing
    const currentBaseFrameIndex = frames.findIndex(f => f.id === selectedFrameId);
    const currentOffset = variantData.variant.baseFrameOffsets?.[currentBaseFrameIndex] ?? { x: 0, y: 0 };

    const handleVariantMoveLeft = () => {
      const currentFrame = variantFrames[currentVariantFrameIndex];
      if (currentFrame && canMoveVariantLeft) {
        moveVariantFrame(variantGroupId, variantId, currentFrame.id, 'left');
      }
    };

    const handleVariantMoveRight = () => {
      const currentFrame = variantFrames[currentVariantFrameIndex];
      if (currentFrame && canMoveVariantRight) {
        moveVariantFrame(variantGroupId, variantId, currentFrame.id, 'right');
      }
    };

    const toggleVariantPlayback = () => {
      if (isPlaying) {
        if (playInterval.current) {
          clearInterval(playInterval.current);
          playInterval.current = null;
        }
        setIsPlaying(false);
      } else {
        // Play through base frames AND variant frames independently
        let currentIndex = currentBaseFrameIndex >= 0 ? currentBaseFrameIndex : 0;
        playInterval.current = window.setInterval(() => {
          currentIndex = (currentIndex + 1) % frames.length;
          // Don't sync variants to base frames during playback
          selectFrame(frames[currentIndex].id, false);
          // Advance all variant frames independently
          advanceVariantFrames(1);
        }, 200);
        setIsPlaying(true);
      }
    };

    // Update togglePlaybackRef for variant playback
    togglePlaybackRef.current = toggleVariantPlayback;

    return (
      <div className="frame-timeline">
        <div className="variant-timeline">
          {/* Base Object Frames - Compact view for offset control */}
          <div className="base-frames-section">
            <div className="base-frames-header">
              <span className="base-frames-title">Base Frames (WASD to adjust offset)</span>
              <span className="base-frames-offset">Offset: ({currentOffset.x}, {currentOffset.y})</span>
            </div>
            <div className="base-frames-scroll">
              <div className="base-frames-list">
                {frames.map((frame, index) => {
                  const isCurrentBaseFrame = index === currentBaseFrameIndex;
                  return (
                    <div
                      key={frame.id}
                      className={`base-frame-item ${isCurrentBaseFrame ? 'active' : ''}`}
                      onClick={() => selectFrame(frame.id)}
                      title={`${frame.name} - Click to edit offset for this base frame`}
                    >
                      <div className="base-frame-thumbnail">
                        <FrameThumbnail
                          frame={frame}
                          width={obj.gridSize.width}
                          height={obj.gridSize.height}
                          obj={obj}
                          project={project}
                          frameIndex={index}
                          isSelected={isCurrentBaseFrame}
                        />
                      </div>
                      <span className="base-frame-index">#{index + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Variant Frames - For graphics editing */}
          <div className="timeline-header">
            <div className="timeline-title-group">
              <div className="timeline-title">Variant Frames</div>
              <div className="frame-move-controls">
                <button
                  className="frame-move-btn"
                  onClick={handleVariantMoveLeft}
                  disabled={!canMoveVariantLeft}
                  title="Move Frame Left"
                >
                  ◂
                </button>
                <button
                  className="frame-move-btn"
                  onClick={handleVariantMoveRight}
                  disabled={!canMoveVariantRight}
                  title="Move Frame Right"
                >
                  ▸
                </button>
              </div>
            </div>
            <div className="timeline-controls">
              <button
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={toggleVariantPlayback}
                title={isPlaying ? 'Stop (Enter)' : 'Play (Enter)'}
              >
                {isPlaying ? '⏹' : '▶'}
              </button>
              <button
                className="preview-btn"
                onClick={() => setShowPreview(true)}
                title="Optimized Preview"
              >
                ⚡
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
                onKeyDown={(e) => e.key === 'Enter' && handleAddVariantFrame()}
              />
              <button className="add-frame-btn" onClick={handleAddVariantFrame}>
                + Add
              </button>
            </div>
          </div>
          <div className="variant-frames-scroll">
            <div className="variant-frames-list">
              {variantFrames.map((vFrame, index) => {
                const isSelected = currentVariantFrameIndex === index;
                return (
                  <div
                    key={vFrame.id}
                    className={`variant-frame-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectVariantFrame(variantGroupId, index)}
                  >
                    <div className="variant-frame-thumbnail">
                      <VariantFrameThumbnail
                        variantFrame={vFrame}
                        variant={variantData.variant}
                      />
                    </div>
                    <div className="variant-frame-info">
                      <span className="variant-frame-index">#{index + 1}</span>
                    </div>
                    <div className="variant-frame-actions">
                      <button
                        className="variant-frame-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateVariantFrame(variantGroupId, variantId, vFrame.id);
                        }}
                        title="Duplicate"
                      >
                        ⧉
                      </button>
                      <button
                        className="variant-frame-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteVariantFrame(variantGroupId, variantId, vFrame.id);
                        }}
                        disabled={variantFrames.length <= 1}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optimized Preview Modal */}
          <PreviewModal
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
            object={obj}
            frames={frames}
            variantGroups={obj.variantGroups}
            zoom={project.uiState.zoom}
          />
        </div>
      </div>
    );
  }

  // Normal frames timeline
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
            title={isPlaying ? 'Stop (Enter)' : 'Play (Enter)'}
          >
            {isPlaying ? '⏹' : '▶'}
          </button>
          <button
            className="preview-btn"
            onClick={() => setShowPreview(true)}
            title="Optimized Preview"
          >
            ⚡
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

      {/* Optimized Preview Modal */}
      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        object={obj}
        frames={frames}
        variantGroups={obj.variantGroups}
        zoom={project.uiState.zoom}
      />
    </div>
  );
}
