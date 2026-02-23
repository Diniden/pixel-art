import { useState, useRef, useEffect, useLayoutEffect, memo, useCallback, ReactNode } from 'react';
import { useEditorStore } from '../../store';
import { Frame, Project, PixelObject } from '../../types';
import { renderFramePreview } from '../../utils/previewRenderer';
import { PreviewModal } from '../PreviewModal/PreviewModal';
import { ResizeModal } from '../ResizeModal/ResizeModal';
import { FrameTagsModal, tagColorForTag } from '../FrameTagsModal/FrameTagsModal';
import type { FrameTagsContext } from '../FrameTagsModal/FrameTagsModal';
import { AnchorPosition } from '../AnchorGrid/AnchorGrid';
import { AIInterpolateModal } from '../AIInterpolateModal/AIInterpolateModal';

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
        // Check if variantOffsets changed for the selected variant type
        const prevOffset = prevLayer.variantOffsets?.[prevLayer.selectedVariantId ?? ''] ?? prevLayer.variantOffset;
        const nextOffset = nextLayer.variantOffsets?.[nextLayer.selectedVariantId ?? ''] ?? nextLayer.variantOffset;
        if (prevOffset?.x !== nextOffset?.x || prevOffset?.y !== nextOffset?.y) {
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
      // Check if variantOffsets changed for the selected variant type
      const prevOffset2 = prevLayer.variantOffsets?.[prevLayer.selectedVariantId ?? ''] ?? prevLayer.variantOffset;
      const nextOffset2 = nextLayer.variantOffsets?.[nextLayer.selectedVariantId ?? ''] ?? nextLayer.variantOffset;
      if (prevOffset2?.x !== nextOffset2?.x || prevOffset2?.y !== nextOffset2?.y) {
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
  onOpenTags,
  variants,
  project,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragEnd,
  setItemRef
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
  onOpenTags: (context: FrameTagsContext) => void;
  variants?: import('../../types').VariantGroup[];  // Project-level variants
  project?: { uiState?: { variantFrameIndices?: { [key: string]: number } } };
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent, frameId: string) => void;
  onDragOver?: (e: React.DragEvent, index: number, rect: DOMRect) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDragEnd?: () => void;
  setItemRef?: (el: HTMLDivElement | null, index: number) => void;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      itemRef.current = el;
      setItemRef?.(el, index);
    },
    [index, setItemRef]
  );

  return (
    <div
      ref={setRef}
      className={`frame-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={() => onSelect(frame.id)}
      draggable={onDragStart != null}
      onDragStart={onDragStart ? (e) => onDragStart(e, frame.id) : undefined}
      onDragOver={
        onDragOver
          ? (e) => {
              const rect = itemRef.current?.getBoundingClientRect();
              if (rect) onDragOver(e, index, rect);
            }
          : undefined
      }
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
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
        <span className="frame-index">
          #{index + 1}
          {frame.tags?.length ? (
            <span
              className="frame-tag-dot"
              style={{ backgroundColor: tagColorForTag(frame.tags[0]) }}
              title={frame.tags.join(', ')}
            />
          ) : null}
        </span>
      </div>

      <div className="frame-actions">
        <button
          className="frame-action-btn frame-tags-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTags({ type: 'object', frameId: frame.id, frameName: frame.name });
          }}
          title="Frame tags"
        >
          <span className="frame-tags-icon">T</span>
        </button>
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
    moveFrame,
    reorderFrame,
    resizeObject
  } = useEditorStore();

  const [showResizeModal, setShowResizeModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [dragFrameId, setDragFrameId] = useState<string | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const [indicatorLeft, setIndicatorLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Wrapper to ensure variant timelines always sync when clicking frames
  const handleFrameSelect = useCallback((frameId: string) => {
    selectFrame(frameId, true); // Always sync variant timelines
  }, [selectFrame]);

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [tagsModalContext, setTagsModalContext] = useState<FrameTagsContext | null>(null);

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

  const handleFrameDragStart = useCallback((e: React.DragEvent, frameId: string) => {
    setDragFrameId(frameId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', frameId);
  }, []);

  const handleFrameDragOver = useCallback(
    (e: React.DragEvent, index: number, rect: DOMRect) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const clientX = e.clientX;
      const midX = rect.left + rect.width / 2;
      const insertIndex = clientX < midX ? index : index + 1;
      const clamped = Math.max(0, Math.min(frames.length, insertIndex));
      setDropInsertIndex(clamped);
    },
    [frames.length]
  );

  const handleFrameDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragFrameId != null && dropInsertIndex != null) {
        reorderFrame(dragFrameId, dropInsertIndex);
      }
      setDragFrameId(null);
      setDropInsertIndex(null);
      setIndicatorLeft(null);
    },
    [dragFrameId, dropInsertIndex, reorderFrame]
  );

  const handleFrameDragLeave = useCallback(() => {
    setDropInsertIndex(null);
  }, []);

  /** When dragging over the scroll container (e.g. empty area after last frame), set insert index to end if cursor is past the last frame. */
  const handleListContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragFrameId || frames.length === 0) return;
      const lastEl = itemRefs.current[frames.length - 1];
      if (!lastEl) return;
      const rect = lastEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX >= midX) {
        setDropInsertIndex(frames.length);
      }
    },
    [dragFrameId, frames.length]
  );

  const handleFrameDragEnd = useCallback(() => {
    setDragFrameId(null);
    setDropInsertIndex(null);
    setIndicatorLeft(null);
  }, []);

  useLayoutEffect(() => {
    if (dropInsertIndex == null || dragFrameId == null || !listRef.current) {
      setIndicatorLeft(null);
      return;
    }
    const listEl = listRef.current;
    const listRect = listEl.getBoundingClientRect();
    const n = frames.length;
    if (n === 0) {
      setIndicatorLeft(null);
      return;
    }
    let left: number;
    if (dropInsertIndex === 0) {
      const first = itemRefs.current[0];
      left = first ? first.getBoundingClientRect().left - listRect.left : 0;
    } else if (dropInsertIndex >= n) {
      const last = itemRefs.current[n - 1];
      left = last ? last.getBoundingClientRect().right - listRect.left : listRect.width;
    } else {
      const leftItem = itemRefs.current[dropInsertIndex - 1];
      const rightItem = itemRefs.current[dropInsertIndex];
      if (!leftItem || !rightItem) {
        setIndicatorLeft(null);
        return;
      }
      const leftRect = leftItem.getBoundingClientRect();
      const rightRect = rightItem.getBoundingClientRect();
      left = (leftRect.right + rightRect.left) / 2 - listRect.left;
    }
    setIndicatorLeft(left);
  }, [dropInsertIndex, dragFrameId, frames.length]);

  const handleResize = useCallback((width: number, height: number, anchor: AnchorPosition) => {
    resizeObject(obj.id, width, height, anchor);
  }, [resizeObject, obj.id]);

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
          <button
            className="canvas-size-btn"
            onClick={() => setShowResizeModal(true)}
            title="Edit Canvas Size"
          >
            ⤢
          </button>
          <button
            className="ai-interpolate-btn"
            onClick={() => setShowAIModal(true)}
            title="AI Frame Interpolation"
          >
            ✦
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

      <div
        className="frames-scroll"
        onDragOver={handleListContainerDragOver}
        onDrop={handleFrameDrop}
      >
        <div
          ref={listRef}
          className="frames-list frames-list-droppable"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFrameDrop}
          onDragLeave={handleFrameDragLeave}
        >
          {indicatorLeft != null && (
            <div
              className="frame-drop-indicator"
              style={{ left: indicatorLeft }}
              aria-hidden
            />
          )}
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
              onOpenTags={setTagsModalContext}
              variants={project.variants}
              project={project}
              isDragging={dragFrameId === frame.id}
              onDragStart={handleFrameDragStart}
              onDragOver={handleFrameDragOver}
              onDrop={handleFrameDrop}
              onDragLeave={handleFrameDragLeave}
              onDragEnd={handleFrameDragEnd}
              setItemRef={(el, i) => {
                itemRefs.current[i] = el;
              }}
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

      {/* Resize Canvas Modal */}
      <ResizeModal
        isOpen={showResizeModal}
        onClose={() => setShowResizeModal(false)}
        onApply={handleResize}
        currentWidth={obj.gridSize.width}
        currentHeight={obj.gridSize.height}
        title="Resize Object Canvas"
      />

      {/* Frame Tags Modal */}
      {tagsModalContext && (
        <FrameTagsModal
          isOpen
          onClose={() => setTagsModalContext(null)}
          context={tagsModalContext}
        />
      )}

      {/* AI Frame Interpolation Modal */}
      <AIInterpolateModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        mode="base"
        object={obj}
        project={project}
      />
    </>
  );
}

