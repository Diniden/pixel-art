import { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useEditorStore } from '../../store';
import { Project, PixelObject, Frame, Layer, Pixel } from '../../types';
import { PreviewModal } from '../PreviewModal/PreviewModal';

interface TimelineViewProps {
  project: Project;
  obj: PixelObject;
  isPlaying: boolean;
  togglePlayback: () => void;
  viewModeDropdown: ReactNode;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
}

interface CellData {
  frameId: string;
  frameIndex: number;
  layerId: string;
  layerName: string;
  rowIndex: number; // z-order position (0 = bottom)
  isVariant: boolean;
  color: string;
}

interface SelectedCell {
  frameId: string;
  layerId: string;
}

interface EmptyCellSelection {
  frameId: string;
  rowIndex: number; // z-order position (0 = bottom)
}

// Module-level cache for layer name -> color mapping
const layerColorCache = new Map<string, string>();

// Convert HSL string to HSL values for comparison
function parseHsl(hslString: string): { h: number; s: number; l: number } | null {
  const match = hslString.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return null;
  return {
    h: parseInt(match[1], 10),
    s: parseInt(match[2], 10),
    l: parseInt(match[3], 10)
  };
}

// Calculate color distance in HSL space
// Returns a value between 0 and 1, where 1 is maximum distance
function colorDistance(hsl1: { h: number; s: number; l: number }, hsl2: { h: number; s: number; l: number }): number {
  // Normalize hue to 0-1 (circular, so 359 and 1 are close)
  const hDiff = Math.min(
    Math.abs(hsl1.h - hsl2.h),
    360 - Math.abs(hsl1.h - hsl2.h)
  ) / 180; // Normalize to 0-1
  const sDiff = Math.abs(hsl1.s - hsl2.s) / 100;
  const lDiff = Math.abs(hsl1.l - hsl2.l) / 100;
  // Weighted distance (hue is most important for distinction)
  return Math.sqrt(hDiff * 0.5 + sDiff * 0.25 + lDiff * 0.25);
}

// Check if a color conflicts with any cached colors
function colorConflicts(newColor: string, cachedColors: string[]): boolean {
  const newHsl = parseHsl(newColor);
  if (!newHsl) return false;

  for (const cachedColor of cachedColors) {
    const cachedHsl = parseHsl(cachedColor);
    if (!cachedHsl) continue;
    // If colors are too similar (distance < 0.15), they conflict
    if (colorDistance(newHsl, cachedHsl) < 0.15) {
      return true;
    }
  }
  return false;
}

// Generate unique colors for layers based on their names
// Uses cache to maintain consistency across re-renders
function generateLayerColors(frames: Frame[]): Map<string, string> {
  const colorMap = new Map<string, string>();
  const uniqueLayerNames = new Set<string>();

  // Collect all unique layer names
  for (const frame of frames) {
    for (const layer of frame.layers) {
      uniqueLayerNames.add(layer.name);
    }
  }

  // Get cached colors for existing layers
  const cachedColors: string[] = [];
  const namesToAssign: string[] = [];

  for (const name of uniqueLayerNames) {
    if (layerColorCache.has(name)) {
      // Use cached color
      const cachedColor = layerColorCache.get(name)!;
      colorMap.set(name, cachedColor);
      cachedColors.push(cachedColor);
    } else {
      // Need to assign a new color
      namesToAssign.push(name);
    }
  }

  // Generate new colors for layers not in cache
  if (namesToAssign.length > 0) {
    // Try to find non-conflicting colors
    let hueStart = 200; // Start from blue-ish
    const hueStep = 360 / Math.max(namesToAssign.length * 3, 1); // Use more steps to find non-conflicting colors

    for (const name of namesToAssign) {
      let attempts = 0;
      let color: string | null = null;

      // Try different hues until we find one that doesn't conflict
      // Check against both cached colors and newly assigned colors
      while (attempts < 360 && color === null) {
        const hue = (hueStart + attempts * hueStep) % 360;
        const candidateColor = `hsl(${Math.round(hue)}, 70%, 55%)`;

        // Check against all existing colors (cached + newly assigned in this batch)
        if (!colorConflicts(candidateColor, cachedColors)) {
          color = candidateColor;
          break;
        }
        attempts++;
      }

      // If we couldn't find a non-conflicting color, use the first attempt anyway
      // (this should rarely happen with many layers)
      if (!color) {
        const hue = hueStart % 360;
        color = `hsl(${Math.round(hue)}, 70%, 55%)`;
      }

      // Cache and assign the color
      layerColorCache.set(name, color);
      colorMap.set(name, color);
      // Add to cachedColors array so subsequent new colors don't conflict with this one
      cachedColors.push(color);

      // Move to next hue for next layer
      hueStart = (hueStart + hueStep) % 360;
    }
  }

  return colorMap;
}

// Find the typical/max row where a layer appears across all frames
// Using MAX gives a better alignment since we display top-to-bottom = high z to low z
function findTypicalRowForLayer(layerName: string, frames: Frame[]): number {
  let maxRow = -1;

  for (const frame of frames) {
    const layerIndex = frame.layers.findIndex(l => l.name === layerName);
    if (layerIndex !== -1 && layerIndex > maxRow) {
      maxRow = layerIndex;
    }
  }

  return maxRow === -1 ? 0 : maxRow;
}

export function TimelineView({
  project,
  obj,
  isPlaying,
  togglePlayback,
  viewModeDropdown,
  showPreview,
  setShowPreview
}: TimelineViewProps) {
  const {
    selectFrame,
    selectLayer,
    moveLayer,
    addLayerToAllFrames,
    addLayerToFrameAtPosition,
    deleteLayerFromFrame,
    reorderLayerInFrame,
    copyTimelineCell,
    pasteTimelineCell,
    timelineCellClipboard,
    getCurrentObject
  } = useEditorStore();

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [emptyCellSelection, setEmptyCellSelection] = useState<EmptyCellSelection | null>(null);
  const [hoveredLayerName, setHoveredLayerName] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{
    frameId: string;
    layerId: string;
    startRow: number;
  } | null>(null);
  const [newLayerName, setNewLayerName] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  const frames = obj.frames;
  const selectedFrameId = project.uiState.selectedFrameId;
  const selectedLayerId = project.uiState.selectedLayerId;
  const selectedFrameIndex = frames.findIndex(f => f.id === selectedFrameId);

  // Generate layer colors
  const layerColors = useMemo(() => generateLayerColors(frames), [frames]);

  // Calculate max number of layers across all frames (determines row count)
  const maxLayers = useMemo(() => {
    return Math.max(...frames.map(f => f.layers.length), 1);
  }, [frames]);

  // Get all unique layer names, ordered by first appearance
  // Priority: layers appearing in earlier frames first, then by z-order (higher z = top)
  const layerHeaders = useMemo(() => {
    const layerInfo: {
      name: string;
      firstFrameIndex: number;
      firstZOrder: number;
      firstDisplayRow: number;
      typicalRow: number;
      color: string;
    }[] = [];
    const seenNames = new Set<string>();

    // Collect info about each layer's first appearance
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      for (let zOrder = 0; zOrder < frame.layers.length; zOrder++) {
        const layer = frame.layers[zOrder];
        if (!seenNames.has(layer.name)) {
          seenNames.add(layer.name);
          layerInfo.push({
            name: layer.name,
            firstFrameIndex: frameIndex,
            firstZOrder: zOrder,
            firstDisplayRow: maxLayers - 1 - zOrder, // Convert z-order to display row
            typicalRow: findTypicalRowForLayer(layer.name, frames),
            color: layerColors.get(layer.name) || 'gray'
          });
        }
      }
    }

    // Sort by:
    // 1. First display row (ascending - top rows first)
    // 2. First frame index (ascending - earlier frames have priority for same row)
    layerInfo.sort((a, b) => {
      if (a.firstDisplayRow !== b.firstDisplayRow) {
        return a.firstDisplayRow - b.firstDisplayRow;
      }
      return a.firstFrameIndex - b.firstFrameIndex;
    });

    return layerInfo.map(info => ({
      name: info.name,
      firstDisplayRow: info.firstDisplayRow,
      typicalRow: info.typicalRow,
      color: info.color
    }));
  }, [frames, maxLayers, layerColors]);

  // Build grid data: rows are z-order positions, columns are frames
  // Cells appear at their actual z-order position, so a layer may span multiple rows
  const gridData = useMemo(() => {
    const grid: (CellData | null)[][] = [];

    // Create rows from maxLayers-1 down to 0 (top layer first in display)
    for (let row = maxLayers - 1; row >= 0; row--) {
      const rowCells: (CellData | null)[] = [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        const frame = frames[frameIndex];
        const layer = frame.layers[row];

        if (layer) {
          rowCells.push({
            frameId: frame.id,
            frameIndex,
            layerId: layer.id,
            layerName: layer.name,
            rowIndex: row,
            isVariant: layer.isVariant || false,
            color: layerColors.get(layer.name) || 'gray'
          });
        } else {
          rowCells.push(null);
        }
      }

      grid.push(rowCells);
    }

    return grid;
  }, [frames, maxLayers, layerColors]);

  // Handle cell click
  const handleCellClick = useCallback((cell: CellData) => {
    setSelectedCell({ frameId: cell.frameId, layerId: cell.layerId });
    setEmptyCellSelection(null); // Clear empty cell selection when clicking a filled cell
    selectFrame(cell.frameId);
    selectLayer(cell.layerId);
  }, [selectFrame, selectLayer]);

  // Handle empty cell click
  const handleEmptyCellClick = useCallback((frameId: string, rowIndex: number) => {
    setEmptyCellSelection({ frameId, rowIndex });
  }, []);

  // Handle layer header click
  const handleLayerHeaderClick = useCallback((layerName: string) => {
    // Find first frame that has this layer and select it
    for (const frame of frames) {
      const layer = frame.layers.find(l => l.name === layerName);
      if (layer) {
        setSelectedCell({ frameId: frame.id, layerId: layer.id });
        selectFrame(frame.id);
        selectLayer(layer.id);
        break;
      }
    }
  }, [frames, selectFrame, selectLayer]);

  // Handle create new layer
  const handleAddLayer = useCallback(() => {
    const name = newLayerName.trim() || `Layer ${maxLayers + 1}`;
    addLayerToAllFrames(name);
    setNewLayerName('');
  }, [newLayerName, maxLayers, addLayerToAllFrames]);

  // Handle move layer up/down across all frames
  const handleMoveLayerUp = useCallback(() => {
    if (!selectedLayerId) return;

    const frame = frames.find(f => f.id === selectedFrameId);
    if (!frame) return;

    const layerIndex = frame.layers.findIndex(l => l.id === selectedLayerId);
    if (layerIndex < frame.layers.length - 1) {
      // Move across all frames - find the layer by name
      const layer = frame.layers[layerIndex];
      for (const f of frames) {
        const idx = f.layers.findIndex(l => l.name === layer.name);
        if (idx !== -1 && idx < f.layers.length - 1) {
          reorderLayerInFrame(f.id, f.layers[idx].id, idx + 1);
        }
      }
    }
  }, [selectedLayerId, selectedFrameId, frames, reorderLayerInFrame]);

  const handleMoveLayerDown = useCallback(() => {
    if (!selectedLayerId) return;

    const frame = frames.find(f => f.id === selectedFrameId);
    if (!frame) return;

    const layerIndex = frame.layers.findIndex(l => l.id === selectedLayerId);
    if (layerIndex > 0) {
      // Move across all frames - find the layer by name
      const layer = frame.layers[layerIndex];
      for (const f of frames) {
        const idx = f.layers.findIndex(l => l.name === layer.name);
        if (idx > 0) {
          reorderLayerInFrame(f.id, f.layers[idx].id, idx - 1);
        }
      }
    }
  }, [selectedLayerId, selectedFrameId, frames, reorderLayerInFrame]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Copy: Cmd+C (only works with filled cell selection)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedCell) {
          e.preventDefault();
          copyTimelineCell(selectedCell.frameId, selectedCell.layerId);
        }
      }

      // Paste: Cmd+V (works with either empty or filled cell selection)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        if (timelineCellClipboard) {
          // Use empty cell selection if available, otherwise use filled cell selection
          if (emptyCellSelection) {
            // Paste to empty cell - need to find or create layer at that position
            const frame = frames.find(f => f.id === emptyCellSelection.frameId);
            if (frame) {
              // Try to find existing layer with the clipboard's layer name
              const existingLayer = frame.layers.find(l => l.name === timelineCellClipboard.layerName);
              if (existingLayer) {
                // Layer exists, just paste to it
                pasteTimelineCell(emptyCellSelection.frameId, existingLayer.id);
              } else {
                // Create new layer only in this frame at the target row position
                const newLayerId = addLayerToFrameAtPosition(
                  emptyCellSelection.frameId,
                  timelineCellClipboard.layerName,
                  emptyCellSelection.rowIndex
                );
                if (newLayerId) {
                  // Now paste to it
                  pasteTimelineCell(emptyCellSelection.frameId, newLayerId);
                }
              }
            }
            setEmptyCellSelection(null); // Clear after paste
          } else if (selectedCell) {
            // Paste to existing cell - this should override the cell
            pasteTimelineCell(selectedCell.frameId, selectedCell.layerId);
          }
        }
      }

      // Delete: Delete or Backspace
      if (selectedCell && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteLayerFromFrame(selectedCell.frameId, selectedCell.layerId);
        setSelectedCell(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, emptyCellSelection, copyTimelineCell, pasteTimelineCell, timelineCellClipboard, deleteLayerFromFrame, frames, addLayerToFrameAtPosition]);

  // Drag handlers for vertical reordering
  const handleDragStart = useCallback((e: React.DragEvent, cell: CellData) => {
    setDragInfo({
      frameId: cell.frameId,
      layerId: cell.layerId,
      startRow: cell.rowIndex
    });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetRow: number, frameId: string) => {
    e.preventDefault();
    if (!dragInfo || dragInfo.frameId !== frameId) return;
    e.dataTransfer.dropEffect = 'move';
  }, [dragInfo]);

  const handleDrop = useCallback((e: React.DragEvent, targetRow: number, frameId: string) => {
    e.preventDefault();
    if (!dragInfo || dragInfo.frameId !== frameId) return;

    if (dragInfo.startRow !== targetRow) {
      reorderLayerInFrame(frameId, dragInfo.layerId, targetRow);
    }

    setDragInfo(null);
  }, [dragInfo, reorderLayerInFrame]);

  const handleDragEnd = useCallback(() => {
    setDragInfo(null);
  }, []);

  // Check if current layer can move up/down
  const currentFrame = frames.find(f => f.id === selectedFrameId);
  const currentLayerIndex = currentFrame?.layers.findIndex(l => l.id === selectedLayerId) ?? -1;
  const canMoveUp = currentLayerIndex >= 0 && currentLayerIndex < (currentFrame?.layers.length ?? 0) - 1;
  const canMoveDown = currentLayerIndex > 0;

  return (
    <div className="timeline-view">
      {/* Action bar */}
      <div className="timeline-header-row">
        {viewModeDropdown}
        <div className="timeline-action-buttons">
          <button
            className="timeline-action-btn"
            onClick={handleMoveLayerUp}
            disabled={!canMoveUp}
            title="Move layer up (all frames)"
          >
            ▲
          </button>
          <button
            className="timeline-action-btn"
            onClick={handleMoveLayerDown}
            disabled={!canMoveDown}
            title="Move layer down (all frames)"
          >
            ▼
          </button>
          <div className="timeline-new-layer">
            <input
              type="text"
              className="timeline-new-layer-input"
              placeholder="New layer..."
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLayer()}
            />
            <button
              className="timeline-action-btn add-layer-btn"
              onClick={handleAddLayer}
              title="Add layer to all frames"
            >
              + Layer
            </button>
          </div>
        </div>
        <div className="timeline-playback-controls">
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
        </div>
      </div>

      {/* Main grid area */}
      <div className="timeline-grid-container">
        {/* Layer headers column - positioned to align with grid rows */}
        <div className="timeline-layer-headers">
          {(() => {
            // Build a map of display row to header (for positioning)
            const rowToHeader = new Map<number, typeof layerHeaders[0]>();
            const usedRows = new Set<number>();

            // Assign each header to its first display row, or nearest available row
            for (const header of layerHeaders) {
              const preferredRow = header.firstDisplayRow;

              // Find nearest available row (search outward from preferred)
              let row = preferredRow;
              let searchOffset = 0;
              while (usedRows.has(row)) {
                searchOffset++;
                // Try below first (positive offset), then above (negative offset)
                const tryBelow = preferredRow + searchOffset;
                const tryAbove = preferredRow - searchOffset;

                if (tryBelow < maxLayers && !usedRows.has(tryBelow)) {
                  row = tryBelow;
                  break;
                } else if (tryAbove >= 0 && !usedRows.has(tryAbove)) {
                  row = tryAbove;
                  break;
                }

                // Safety: if we've searched all possible rows, break
                if (searchOffset > maxLayers) break;
              }

              if (row >= 0 && row < maxLayers && !usedRows.has(row)) {
                rowToHeader.set(row, header);
                usedRows.add(row);
              }
            }

            // Render rows - headers or empty spacers
            return Array.from({ length: maxLayers }, (_, rowIndex) => {
              const header = rowToHeader.get(rowIndex);
              if (header) {
                return (
                  <div
                    key={`${header.name}-${rowIndex}`}
                    className={`timeline-layer-header ${hoveredLayerName === header.name ? 'hovered' : ''}`}
                    style={{ '--layer-color': header.color } as React.CSSProperties}
                    onClick={() => handleLayerHeaderClick(header.name)}
                    onMouseEnter={() => setHoveredLayerName(header.name)}
                    onMouseLeave={() => setHoveredLayerName(null)}
                  >
                    <span className="timeline-layer-dot" style={{ backgroundColor: header.color }} />
                    <span className="timeline-layer-name">{header.name}</span>
                  </div>
                );
              }
              // Empty row spacer
              return <div key={`empty-${rowIndex}`} className="timeline-layer-header empty" />;
            });
          })()}
        </div>

        {/* Grid with cells and playhead */}
        <div className="timeline-grid-scroll" ref={gridRef}>
          <div className="timeline-grid">
            {/* Playhead */}
            {/* Playhead: account for cell width (24px) + gap (2px) = 26px per cell */}
            {selectedFrameIndex >= 0 && (
              <div
                className="timeline-playhead"
                style={{ left: `${selectedFrameIndex * 26 + 12}px` }}
              />
            )}

            {/* Grid rows */}
            {gridData.map((row, rowIndex) => {
              // Convert display row to z-order (display row 0 = highest z-order)
              const actualZOrder = maxLayers - 1 - rowIndex;

              return (
                <div
                  key={rowIndex}
                  className={`timeline-grid-row ${rowIndex % 2 === 0 ? 'even' : 'odd'}`}
                >
                  {row.map((cell, colIndex) => {
                    const frame = frames[colIndex];

                    if (!cell) {
                      // Empty cell - use the calculated z-order for this row
                      const isEmptySelected = emptyCellSelection?.frameId === frame.id && emptyCellSelection?.rowIndex === actualZOrder;
                      return (
                        <div
                          key={`${frame.id}-${rowIndex}`}
                          className={`timeline-cell empty ${isEmptySelected ? 'empty-selected' : ''}`}
                          onClick={() => handleEmptyCellClick(frame.id, actualZOrder)}
                          onDragOver={(e) => handleDragOver(e, actualZOrder, frame.id)}
                          onDrop={(e) => handleDrop(e, actualZOrder, frame.id)}
                        />
                      );
                    }

                    const isSelected = selectedCell?.frameId === cell.frameId && selectedCell?.layerId === cell.layerId;
                    const isHighlighted = hoveredLayerName === cell.layerName;

                    return (
                      <div
                        key={`${cell.frameId}-${cell.layerId}`}
                        className={`timeline-cell ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${cell.isVariant ? 'variant' : ''}`}
                        onClick={() => {
                          handleCellClick(cell);
                          setEmptyCellSelection(null); // Clear empty cell selection when clicking any filled cell
                        }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, cell)}
                        onDragOver={(e) => handleDragOver(e, cell.rowIndex, cell.frameId)}
                        onDrop={(e) => handleDrop(e, cell.rowIndex, cell.frameId)}
                        onDragEnd={handleDragEnd}
                      >
                        <span
                          className="timeline-cell-dot"
                          style={{ backgroundColor: cell.color }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Optimized Preview Modal */}
      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        object={obj}
        frames={obj.frames}
        variantGroups={obj.variantGroups}
        zoom={project.uiState.zoom}
      />
    </div>
  );
}

