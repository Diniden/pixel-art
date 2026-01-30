import { useState, useRef, useEffect, memo, useCallback, ReactNode } from 'react';
import { useEditorStore } from '../../store';
import { Project, PixelObject, Layer, Variant, VariantFrame, VariantGroup } from '../../types';
import { renderFramePreview, renderVariantFramePreview } from '../../utils/previewRenderer';
import { PreviewModal } from '../PreviewModal/PreviewModal';
import { FrameThumbnail } from './FramesView';

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
    moveVariantFrame
  } = useEditorStore();

  const [newFrameName, setNewFrameName] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);

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

  return (
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
  );
}

