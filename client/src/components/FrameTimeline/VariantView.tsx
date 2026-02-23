import { useState, useRef, useEffect, useLayoutEffect, memo, useCallback, ReactNode } from 'react';
import { useEditorStore } from '../../store';
import { Project, PixelObject, Layer, Variant, VariantFrame, VariantGroup } from '../../types';
import { renderFramePreview, renderVariantFramePreview } from '../../utils/previewRenderer';
import { PreviewModal } from '../PreviewModal/PreviewModal';
import { ResizeModal } from '../ResizeModal/ResizeModal';
import { FrameTagsModal, tagColorForTag } from '../FrameTagsModal/FrameTagsModal';
import type { FrameTagsContext } from '../FrameTagsModal/FrameTagsModal';
import { AnchorPosition } from '../AnchorGrid/AnchorGrid';
import { FrameThumbnail } from './FramesView';
import { AIInterpolateModal } from '../AIInterpolateModal/AIInterpolateModal';

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

interface VariantViewProps {
  project: Project;
  obj: PixelObject;
  layer: Layer;
  variantData: {
    variantGroup: VariantGroup;
    variant: Variant;
    variantFrame: VariantFrame;
    baseFrameIndex: number;
    offset: { x: number; y: number };
  };
  isPlaying: boolean;
  togglePlayback: () => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  viewModeDropdown: ReactNode;
}

export function VariantView({
  project,
  obj,
  layer,
  variantData,
  isPlaying,
  togglePlayback,
  showPreview,
  setShowPreview,
  viewModeDropdown
}: VariantViewProps) {
  const {
    selectFrame,
    selectVariantFrame,
    duplicateVariantFrame,
    deleteVariantFrame,
    addVariantFrame,
    moveVariantFrame,
    reorderFrame,
    reorderVariantFrame,
    resizeVariant
  } = useEditorStore();

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [tagsModalContext, setTagsModalContext] = useState<FrameTagsContext | null>(null);
  const [dragBaseFrameId, setDragBaseFrameId] = useState<string | null>(null);
  const [dropInsertBaseIndex, setDropInsertBaseIndex] = useState<number | null>(null);
  const [dragVariantFrameId, setDragVariantFrameId] = useState<string | null>(null);
  const [dropInsertVariantIndex, setDropInsertVariantIndex] = useState<number | null>(null);
  const [baseIndicatorLeft, setBaseIndicatorLeft] = useState<number | null>(null);
  const [variantIndicatorLeft, setVariantIndicatorLeft] = useState<number | null>(null);
  const baseListRef = useRef<HTMLDivElement | null>(null);
  const baseItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const variantListRef = useRef<HTMLDivElement | null>(null);
  const variantItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const frames = obj.frames;
  const { selectedFrameId } = project.uiState;

  const variantFrames = variantData.variant.frames;
  const variantGroupId = variantData.variantGroup.id;
  const variantId = variantData.variant.id;
  const currentVariantFrameIndex = project.uiState.variantFrameIndices?.[variantGroupId] ?? 0;
  const canMoveVariantLeft = currentVariantFrameIndex > 0;
  const canMoveVariantRight = currentVariantFrameIndex >= 0 && currentVariantFrameIndex < variantFrames.length - 1;

  // Get current base frame index for offset editing
  const currentBaseFrameIndex = frames.findIndex(f => f.id === selectedFrameId);
  const currentOffset = variantData.variant.baseFrameOffsets?.[currentBaseFrameIndex] ?? { x: 0, y: 0 };

  const handleAddVariantFrame = useCallback(() => {
    addVariantFrame(variantGroupId, variantId, copyPrevious);
    setNewFrameName('');
  }, [variantGroupId, variantId, copyPrevious, addVariantFrame]);

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

  const handleBaseFrameDragStart = useCallback((e: React.DragEvent, frameId: string) => {
    setDragBaseFrameId(frameId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', frameId);
  }, []);

  const handleBaseFrameDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertIndex = e.clientX < midX ? index : index + 1;
      const clamped = Math.max(0, Math.min(frames.length, insertIndex));
      setDropInsertBaseIndex(clamped);
    },
    [frames.length]
  );

  const handleBaseFrameDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragBaseFrameId != null && dropInsertBaseIndex != null) {
        reorderFrame(dragBaseFrameId, dropInsertBaseIndex);
      }
      setDragBaseFrameId(null);
      setDropInsertBaseIndex(null);
      setBaseIndicatorLeft(null);
    },
    [dragBaseFrameId, dropInsertBaseIndex, reorderFrame]
  );

  const handleBaseFrameDragEnd = useCallback(() => {
    setDragBaseFrameId(null);
    setDropInsertBaseIndex(null);
    setBaseIndicatorLeft(null);
  }, []);

  const handleBaseListContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragBaseFrameId || frames.length === 0) return;
      const lastEl = baseItemRefs.current[frames.length - 1];
      if (!lastEl) return;
      const rect = lastEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX >= midX) {
        setDropInsertBaseIndex(frames.length);
      }
    },
    [dragBaseFrameId, frames.length]
  );

  const handleVariantListContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragVariantFrameId || variantFrames.length === 0) return;
      const lastEl = variantItemRefs.current[variantFrames.length - 1];
      if (!lastEl) return;
      const rect = lastEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX >= midX) {
        setDropInsertVariantIndex(variantFrames.length);
      }
    },
    [dragVariantFrameId, variantFrames.length]
  );

  const handleVariantFrameDragStart = useCallback((e: React.DragEvent, frameId: string) => {
    setDragVariantFrameId(frameId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', frameId);
  }, []);

  const handleVariantFrameDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertIndex = e.clientX < midX ? index : index + 1;
      const clamped = Math.max(0, Math.min(variantFrames.length, insertIndex));
      setDropInsertVariantIndex(clamped);
    },
    [variantFrames.length]
  );

  const handleVariantFrameDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragVariantFrameId != null && dropInsertVariantIndex != null) {
        reorderVariantFrame(variantGroupId, variantId, dragVariantFrameId, dropInsertVariantIndex);
      }
      setDragVariantFrameId(null);
      setDropInsertVariantIndex(null);
      setVariantIndicatorLeft(null);
    },
    [dragVariantFrameId, dropInsertVariantIndex, variantGroupId, variantId, reorderVariantFrame]
  );

  const handleVariantFrameDragEnd = useCallback(() => {
    setDragVariantFrameId(null);
    setDropInsertVariantIndex(null);
    setVariantIndicatorLeft(null);
  }, []);

  useLayoutEffect(() => {
    if (dropInsertBaseIndex == null || dragBaseFrameId == null || !baseListRef.current || frames.length === 0) {
      setBaseIndicatorLeft(null);
      return;
    }
    const listRect = baseListRef.current.getBoundingClientRect();
    const n = frames.length;
    let left: number;
    if (dropInsertBaseIndex === 0) {
      const first = baseItemRefs.current[0];
      left = first ? first.getBoundingClientRect().left - listRect.left : 0;
    } else if (dropInsertBaseIndex >= n) {
      const last = baseItemRefs.current[n - 1];
      left = last ? last.getBoundingClientRect().right - listRect.left : listRect.width;
    } else {
      const leftItem = baseItemRefs.current[dropInsertBaseIndex - 1];
      const rightItem = baseItemRefs.current[dropInsertBaseIndex];
      if (!leftItem || !rightItem) {
        setBaseIndicatorLeft(null);
        return;
      }
      const leftRect = leftItem.getBoundingClientRect();
      const rightRect = rightItem.getBoundingClientRect();
      left = (leftRect.right + rightRect.left) / 2 - listRect.left;
    }
    setBaseIndicatorLeft(left);
  }, [dropInsertBaseIndex, dragBaseFrameId, frames.length]);

  useLayoutEffect(() => {
    if (
      dropInsertVariantIndex == null ||
      dragVariantFrameId == null ||
      !variantListRef.current ||
      variantFrames.length === 0
    ) {
      setVariantIndicatorLeft(null);
      return;
    }
    const listRect = variantListRef.current.getBoundingClientRect();
    const n = variantFrames.length;
    let left: number;
    if (dropInsertVariantIndex === 0) {
      const first = variantItemRefs.current[0];
      left = first ? first.getBoundingClientRect().left - listRect.left : 0;
    } else if (dropInsertVariantIndex >= n) {
      const last = variantItemRefs.current[n - 1];
      left = last ? last.getBoundingClientRect().right - listRect.left : listRect.width;
    } else {
      const leftItem = variantItemRefs.current[dropInsertVariantIndex - 1];
      const rightItem = variantItemRefs.current[dropInsertVariantIndex];
      if (!leftItem || !rightItem) {
        setVariantIndicatorLeft(null);
        return;
      }
      const leftRect = leftItem.getBoundingClientRect();
      const rightRect = rightItem.getBoundingClientRect();
      left = (leftRect.right + rightRect.left) / 2 - listRect.left;
    }
    setVariantIndicatorLeft(left);
  }, [dropInsertVariantIndex, dragVariantFrameId, variantFrames.length]);

  const handleResize = useCallback((width: number, height: number, anchor: AnchorPosition) => {
    resizeVariant(variantGroupId, variantId, width, height, anchor);
  }, [resizeVariant, variantGroupId, variantId]);

  return (
    <div className="variant-timeline">
      {/* Base Object Frames - Compact view for offset control */}
      <div className="base-frames-section">
        <div className="base-frames-header">
          <span className="base-frames-title">Base Frames (WASD to adjust offset)</span>
          <span className="base-frames-offset">Offset: ({currentOffset.x}, {currentOffset.y})</span>
        </div>
        <div
          className="base-frames-scroll"
          onDragOver={handleBaseListContainerDragOver}
          onDrop={handleBaseFrameDrop}
        >
          <div
            ref={baseListRef}
            className="base-frames-list base-frames-list-droppable"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleBaseFrameDrop}
            onDragLeave={() => setDropInsertBaseIndex(null)}
          >
            {baseIndicatorLeft != null && (
              <div
                className="frame-drop-indicator frame-drop-indicator-base"
                style={{ left: baseIndicatorLeft }}
                aria-hidden
              />
            )}
            {frames.map((frame, index) => {
              const isCurrentBaseFrame = index === currentBaseFrameIndex;
              const isDragging = dragBaseFrameId === frame.id;
              return (
                <div
                  key={frame.id}
                  ref={(el) => {
                    baseItemRefs.current[index] = el;
                  }}
                  className={`base-frame-item ${isCurrentBaseFrame ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                  onClick={() => selectFrame(frame.id, true)} // Always sync variant timelines
                  title={`${frame.name} - Click to edit offset for this base frame. Drag to reorder.`}
                  draggable
                  onDragStart={(e) => handleBaseFrameDragStart(e, frame.id)}
                  onDragOver={(e) => handleBaseFrameDragOver(e, index)}
                  onDrop={handleBaseFrameDrop}
                  onDragLeave={() => setDropInsertBaseIndex(null)}
                  onDragEnd={handleBaseFrameDragEnd}
                >
                  <div className="base-frame-thumbnail">
                    <FrameThumbnail
                      frame={frame}
                      width={obj.gridSize.width}
                      height={obj.gridSize.height}
                      variants={project.variants}
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
      <div className="timeline-header-row">
        {viewModeDropdown}
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
            className="canvas-size-btn variant"
            onClick={() => setShowResizeModal(true)}
            title="Edit Variant Canvas Size"
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
            onKeyDown={(e) => e.key === 'Enter' && handleAddVariantFrame()}
          />
          <button className="add-frame-btn" onClick={handleAddVariantFrame}>
            + Add
          </button>
        </div>
      </div>
      <div
        className="variant-frames-scroll"
        onDragOver={handleVariantListContainerDragOver}
        onDrop={handleVariantFrameDrop}
      >
        <div
          ref={variantListRef}
          className="variant-frames-list variant-frames-list-droppable"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleVariantFrameDrop}
          onDragLeave={() => setDropInsertVariantIndex(null)}
        >
          {variantIndicatorLeft != null && (
            <div
              className="frame-drop-indicator frame-drop-indicator-variant"
              style={{ left: variantIndicatorLeft }}
              aria-hidden
            />
          )}
          {variantFrames.map((vFrame, index) => {
            const isSelected = currentVariantFrameIndex === index;
            const isDragging = dragVariantFrameId === vFrame.id;
            return (
              <div
                key={vFrame.id}
                ref={(el) => {
                  variantItemRefs.current[index] = el;
                }}
                className={`variant-frame-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
                onClick={() => selectVariantFrame(variantGroupId, index)}
                draggable
                onDragStart={(e) => handleVariantFrameDragStart(e, vFrame.id)}
                onDragOver={(e) => handleVariantFrameDragOver(e, index)}
                onDrop={handleVariantFrameDrop}
                onDragLeave={() => setDropInsertVariantIndex(null)}
                onDragEnd={handleVariantFrameDragEnd}
              >
                <div className="variant-frame-thumbnail">
                  <VariantFrameThumbnail
                    variantFrame={vFrame}
                    variant={variantData.variant}
                  />
                </div>
                <div className="variant-frame-info">
                  <span className="variant-frame-index">
                    #{index + 1}
                    {vFrame.tags?.length ? (
                      <span
                        className="frame-tag-dot"
                        style={{ backgroundColor: tagColorForTag(vFrame.tags[0]) }}
                        title={vFrame.tags.join(', ')}
                      />
                    ) : null}
                  </span>
                </div>
                <div className="variant-frame-actions">
                  <button
                    className="variant-frame-action-btn variant-frame-tags-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTagsModalContext({
                        type: 'variant',
                        variantGroupId,
                        variantId,
                        frameId: vFrame.id,
                        frameIndex: index,
                      });
                    }}
                    title="Frame tags"
                  >
                    <span className="frame-tags-icon">T</span>
                  </button>
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
        variants={project.variants}
        zoom={project.uiState.zoom}
      />

      {/* Resize Variant Canvas Modal */}
      <ResizeModal
        isOpen={showResizeModal}
        onClose={() => setShowResizeModal(false)}
        onApply={handleResize}
        currentWidth={variantData.variant.gridSize.width}
        currentHeight={variantData.variant.gridSize.height}
        title={`Resize Variant: ${variantData.variant.name}`}
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
        mode="variant"
        object={obj}
        project={project}
        variantData={variantData}
      />
    </div>
  );
}

