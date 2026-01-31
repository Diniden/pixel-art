import { useState, useRef, useEffect, memo, useCallback, ReactNode } from 'react';
import { useEditorStore } from '../../store';
import { Frame, Project, PixelObject } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import { PreviewModal } from '../PreviewModal/PreviewModal';

// Memoized thumbnail component that only re-renders when frame data actually changes
export const FrameThumbnail = memo(function FrameThumbnail({
  frame,
  width,
  height,
  variants,
  project,
  frameIndex,
  isSelected
}: {
  frame: Frame;
  width: number;
  height: number;
  variants?: import('../../types').VariantGroup[];  // Project-level variants
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
    } else if (variants) {
      // Calculate static indices based on frame position
      variantFrameIndices = {};
      for (const vg of variants) {
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
      variants,
      variantFrameIndices
    });
  }, [frame, width, height, variants, project, frameIndex, isSelected]);

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

  // Check if variant offsets changed for this frame (now stored on layers)
  const prevFrame = prevProps.frame;
  const nextFrame = nextProps.frame;

  if (prevFrame === nextFrame) {
    // Frame is the same - check if variant selectedVariantId changed in any variant layers
    // This handles variant switching when not editing a variant
    for (let i = 0; i < prevFrame.layers.length; i++) {
      const prevLayer = prevFrame.layers[i];
      const nextLayer = nextFrame.layers[i];
      if (prevLayer.isVariant && nextLayer.isVariant) {
        if (prevLayer.selectedVariantId !== nextLayer.selectedVariantId) {
          return false; // Variant selection changed, re-render
        }
        // Check if variantOffset changed
        if (prevLayer.variantOffset?.x !== nextLayer.variantOffset?.x ||
            prevLayer.variantOffset?.y !== nextLayer.variantOffset?.y) {
          return false;
        }
      }
    }

    // Only check variant frame indices if this is the selected frame
    if (nextProps.isSelected && prevProps.variants) {
      const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
      const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
      if (prevIndices !== nextIndices) {
        // Check if any relevant variant frame indices changed
        for (const vg of prevProps.variants) {
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

    // Check if variant layer's selectedVariantId or offset changed
    if (prevLayer.isVariant && nextLayer.isVariant) {
      if (prevLayer.selectedVariantId !== nextLayer.selectedVariantId) {
        return false; // Variant selection changed, re-render
      }
      if (prevLayer.variantOffset?.x !== nextLayer.variantOffset?.x ||
          prevLayer.variantOffset?.y !== nextLayer.variantOffset?.y) {
        return false;
      }
    }
  }

  // Only check variant frame indices if this is the selected frame
  if (nextProps.isSelected && prevProps.variants) {
    const prevIndices = prevProps.project?.uiState?.variantFrameIndices;
    const nextIndices = nextProps.project?.uiState?.variantFrameIndices;
    if (prevIndices !== nextIndices) {
      // Check if any relevant variant frame indices changed
      for (const vg of prevProps.variants) {
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
  variants,
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
  variants?: import('../../types').VariantGroup[];  // Project-level variants
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
          variants={variants}
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

interface FramesViewProps {
  project: Project;
  obj: PixelObject;
  isPlaying: boolean;
  togglePlayback: () => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  viewModeDropdown: ReactNode;
}

export function FramesView({
  project,
  obj,
  isPlaying,
  togglePlayback,
  showPreview,
  setShowPreview,
  viewModeDropdown
}: FramesViewProps) {
  const {
    addFrame,
    deleteFrame,
    renameFrame,
    selectFrame,
    duplicateFrame,
    moveFrame
  } = useEditorStore();

  // Wrapper to ensure variant timelines always sync when clicking frames
  const handleFrameSelect = useCallback((frameId: string) => {
    selectFrame(frameId, true); // Always sync variant timelines
  }, [selectFrame]);

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  // Normal frames timeline
  return (
    <>
      <div className="timeline-header-row">
        {viewModeDropdown}
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
              onSelect={handleFrameSelect}
              onDuplicate={duplicateFrame}
              onDelete={deleteFrame}
              onStartRename={handleStartRename}
              editingId={editingId}
              editingName={editingName}
              onEditingNameChange={handleEditingNameChange}
              onFinishRename={handleFinishRename}
              variants={project.variants}
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
        variants={project.variants}
        zoom={project.uiState.zoom}
      />
    </>
  );
}

