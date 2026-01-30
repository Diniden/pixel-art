import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { FramesView } from './FramesView';
import { TimelineView } from './TimelineView';
import { VariantView } from './VariantView';
import './FrameTimeline.css';

type ViewMode = 'frames' | 'timeline' | 'variant';

// Dropdown component for switching between Frames, Timeline, and Variant views
function ViewModeDropdown({
  value,
  onChange,
  variantAvailable
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  variantAvailable: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const baseOptions: { value: ViewMode; label: string }[] = [
    { value: 'frames', label: 'Frames' },
    { value: 'timeline', label: 'Timeline' }
  ];

  // Only include Variant option if a variant layer is selected
  const options = variantAvailable
    ? [...baseOptions, { value: 'variant' as ViewMode, label: 'Variant' }]
    : baseOptions;

  const selectedLabel = options.find(o => o.value === value)?.label || 'Frames';

  return (
    <div className="view-mode-dropdown" ref={dropdownRef}>
      <button
        className={`view-mode-dropdown-trigger ${value === 'variant' ? 'variant-mode' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedLabel}</span>
        <span className="view-mode-dropdown-arrow">{isOpen ? '▴' : '▾'}</span>
      </button>
      {isOpen && (
        <div className="view-mode-dropdown-menu">
          {options.map(option => (
            <button
              key={option.value}
              className={`view-mode-dropdown-item ${option.value === value ? 'selected' : ''} ${option.value === 'variant' ? 'variant-option' : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FrameTimeline() {
  const {
    project,
    getCurrentObject,
    getCurrentLayer,
    getCurrentVariant,
    selectFrame,
    advanceVariantFrames
  } = useEditorStore();

  const [viewMode, setViewMode] = useState<ViewMode>('frames');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const playInterval = useRef<number | null>(null);

  // Track the previous layer selection counter to detect actual layer clicks
  const previousSelectionCounterRef = useRef<number | undefined>(undefined);

  const obj = getCurrentObject();
  const layer = getCurrentLayer();
  const variantData = getCurrentVariant();
  const isVariantLayerSelected = layer?.isVariant === true;
  const layerSelectionCounter = project?.uiState.layerSelectionCounter;

  useEffect(() => {
    return () => {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    };
  }, []);

  // Auto-switch to variant mode when clicking a variant layer
  // - Clicking ANY variant layer (even the same one) activates variant mode
  // - Switching frames (doesn't change selection counter) does NOT activate variant mode
  useEffect(() => {
    const currentIsVariant = layer?.isVariant === true;
    const selectionCounterChanged = layerSelectionCounter !== previousSelectionCounterRef.current;

    // Switch to variant mode if:
    // 1. A layer was actually clicked (selection counter changed)
    // 2. The current layer is a variant
    // 3. We're not already in variant mode
    if (selectionCounterChanged && currentIsVariant && viewMode !== 'variant') {
      setViewMode('variant');
    }

    // If we're in variant mode but no variant layer is selected, go back to frames
    if (viewMode === 'variant' && !currentIsVariant) {
      setViewMode('frames');
    }

    previousSelectionCounterRef.current = layerSelectionCounter;
  }, [layerSelectionCounter, layer?.isVariant, viewMode]);

  const togglePlayback = useCallback(() => {
    if (!project || !obj) return;

    const frames = obj.frames;
    const selectedFrameId = project.uiState.selectedFrameId;

    if (isPlaying) {
      if (playInterval.current) {
        clearInterval(playInterval.current);
        playInterval.current = null;
      }
      setIsPlaying(false);
    } else {
      let currentIndex = frames.findIndex(f => f.id === selectedFrameId);
      if (currentIndex < 0) currentIndex = 0;

      playInterval.current = window.setInterval(() => {
        currentIndex = (currentIndex + 1) % frames.length;
        // Don't sync variants to base frames during playback - they advance independently
        selectFrame(frames[currentIndex].id, false);
        // Advance all variant frames independently
        advanceVariantFrames(1);
      }, 200);
      setIsPlaying(true);
    }
  }, [isPlaying, project, obj, selectFrame, advanceVariantFrames]);

  // Store togglePlayback in a ref for the keyboard handler
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;

  // Store viewMode in a ref for the escape key handler
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // Keyboard shortcuts: Enter to toggle playback, Cmd+Enter to open optimized preview, Escape to exit variant mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Escape to exit variant mode and return to frames
      if (e.key === 'Escape' && viewModeRef.current === 'variant') {
        e.preventDefault();
        setViewMode('frames');
        return;
      }

      // Cmd+Enter (or Ctrl+Enter) to open optimized preview
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        setShowPreview(true);
        return;
      }

      // Enter to toggle playback
      if (e.key === 'Enter') {
        e.preventDefault();
        togglePlaybackRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!project || !obj) return null;

  const viewModeDropdown = (
    <ViewModeDropdown
      value={viewMode}
      onChange={setViewMode}
      variantAvailable={isVariantLayerSelected}
    />
  );

  return (
    <div className="frame-timeline">
      {viewMode === 'variant' && variantData && layer ? (
        <VariantView
          project={project}
          obj={obj}
          layer={layer}
          variantData={variantData}
          isPlaying={isPlaying}
          togglePlayback={togglePlayback}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          viewModeDropdown={viewModeDropdown}
        />
      ) : viewMode === 'timeline' ? (
        <TimelineView
          project={project}
          obj={obj}
          isPlaying={isPlaying}
          togglePlayback={togglePlayback}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          viewModeDropdown={viewModeDropdown}
        />
      ) : (
        <FramesView
          project={project}
          obj={obj}
          isPlaying={isPlaying}
          togglePlayback={togglePlayback}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          viewModeDropdown={viewModeDropdown}
        />
      )}
    </div>
  );
}
