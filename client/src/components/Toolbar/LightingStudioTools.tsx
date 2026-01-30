import { useState } from 'react';
import { useEditorStore } from '../../store';
import { Tool } from '../../types';
import { EdgeInterpolateModal } from '../EdgeInterpolateModal/EdgeInterpolateModal';
import { HeightMapModal } from '../HeightMapModal/HeightMapModal';
import { computeEdgeInterpolatedNormals } from '../../utils/edgeInterpolate';
import { Pixel, PixelData } from '../../types';

const lightingTools: { id: Tool; icon: string; label: string; hotkey: string }[] = [
  { id: 'normal-pencil', icon: '🔆', label: 'Normal Pencil', hotkey: '1' },
  { id: 'auto-normal', icon: '🔧', label: 'Auto Normal', hotkey: '2' },
  { id: 'height-map', icon: '🗻', label: 'Height Map', hotkey: '3' },
];

type ChannelType = 'R' | 'G' | 'B' | 'H' | 'S' | 'L';

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 255), // Scale to 0-255
    s: Math.round(s * 255),
    l: Math.round(l * 255)
  };
}

// Extract channel value from pixel
function getChannelValue(pixel: Pixel, channel: ChannelType): number {
  switch (channel) {
    case 'R':
      return pixel.r;
    case 'G':
      return pixel.g;
    case 'B':
      return pixel.b;
    case 'H':
    case 'S':
    case 'L': {
      const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
      return hsl[channel.toLowerCase() as 'h' | 's' | 'l'];
    }
  }
}

export function LightingStudioTools() {
  const { project, setTool, getCurrentLayer, getCurrentObject, getCurrentFrame, isEditingVariant, getCurrentVariant, setNormalPixels, setHeightPixels } = useEditorStore();
  const [showEdgeInterpolateModal, setShowEdgeInterpolateModal] = useState(false);
  const [showHeightMapModal, setShowHeightMapModal] = useState(false);

  if (!project) return null;

  const { selectedTool } = project.uiState;

  const handleToolClick = (toolId: Tool) => {
    if (toolId === 'auto-normal') {
      setShowEdgeInterpolateModal(true);
    } else if (toolId === 'height-map') {
      setShowHeightMapModal(true);
    } else {
      setTool(toolId);
    }
  };

  const handleEdgeInterpolateConfirm = (params: {
    startAngle: number;
    smoothing: number;
    radius: number;
  }) => {
    const layer = getCurrentLayer();
    const obj = getCurrentObject();
    const frame = getCurrentFrame();
    const editingVariant = isEditingVariant();
    const variantData = getCurrentVariant();

    if (!layer || !obj || !frame) return;

    // Determine grid dimensions and target layer
    let gridWidth: number;
    let gridHeight: number;
    let targetLayer = layer;

    if (editingVariant && variantData) {
      gridWidth = variantData.variant.gridSize.width;
      gridHeight = variantData.variant.gridSize.height;
      targetLayer = variantData.variantFrame.layers[0];
      if (!targetLayer) return;
    } else {
      gridWidth = obj.gridSize.width;
      gridHeight = obj.gridSize.height;
    }

    // Compute normals using the algorithm
    const normals = computeEdgeInterpolatedNormals(
      targetLayer,
      gridWidth,
      gridHeight,
      params.startAngle,
      params.smoothing,
      params.radius
    );

    // Apply normals using setNormalPixels
    const pixelsToUpdate = normals.map((normal, index) => {
      const y = Math.floor(index / gridWidth);
      const x = index % gridWidth;
      return { x, y, normal: normal || 0 };
    });

    setNormalPixels(pixelsToUpdate);
  };

  const handleHeightMapConfirm = (params: {
    channel: ChannelType;
    min: number;
    max: number;
  }) => {
    const layer = getCurrentLayer();
    const obj = getCurrentObject();
    const frame = getCurrentFrame();
    const editingVariant = isEditingVariant();
    const variantData = getCurrentVariant();

    if (!layer || !obj || !frame) return;

    // Determine grid dimensions and target layer
    let gridWidth: number;
    let gridHeight: number;
    let targetLayer = layer;

    if (editingVariant && variantData) {
      gridWidth = variantData.variant.gridSize.width;
      gridHeight = variantData.variant.gridSize.height;
      targetLayer = variantData.variantFrame.layers[0];
      if (!targetLayer) return;
    } else {
      gridWidth = obj.gridSize.width;
      gridHeight = obj.gridSize.height;
    }

    // Collect all channel values for normalization
    const channelValues: number[] = [];
    const pixelPositions: { x: number; y: number; pixel: Pixel }[] = [];

    for (let y = 0; y < gridHeight; y++) {
      const row = targetLayer.pixels[y];
      if (!row) continue;
      for (let x = 0; x < gridWidth; x++) {
        const pixelData: PixelData | undefined = row[x];
        if (pixelData && pixelData.color !== 0 && typeof pixelData.color === 'object') {
          const channelValue = getChannelValue(pixelData.color, params.channel);
          channelValues.push(channelValue);
          pixelPositions.push({ x, y, pixel: pixelData.color });
        }
      }
    }

    if (channelValues.length === 0) return;

    // Find actual min/max in the data
    const actualMin = Math.min(...channelValues);
    const actualMax = Math.max(...channelValues);
    const range = actualMax - actualMin;

    // Compute height values
    const pixelsToUpdate = pixelPositions.map(({ x, y, pixel }) => {
      const channelValue = getChannelValue(pixel, params.channel);

      // Normalize: map from [actualMin, actualMax] to [params.min, params.max]
      let normalized: number;
      if (range === 0) {
        normalized = params.min;
      } else {
        // Map from [actualMin, actualMax] to [0, 1]
        const t = (channelValue - actualMin) / range;
        // Map to [params.min, params.max]
        normalized = params.min + t * (params.max - params.min);
      }

      // Clamp to 0-255 and ensure at least 1 if non-zero (height 0 means no height data)
      const heightValue = Math.max(0, Math.min(255, Math.round(normalized)));
      return { x, y, height: heightValue === 0 ? 0 : Math.max(1, heightValue) };
    });

    setHeightPixels(pixelsToUpdate);
  };

  return (
    <>
      <div className="toolbar-section">
        <div className="toolbar-group">
          {lightingTools.map((tool) => (
            <button
              key={tool.id}
              className={`tool-btn ${selectedTool === tool.id ? 'active' : ''}`}
              onClick={() => handleToolClick(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>
      </div>

      <EdgeInterpolateModal
        isOpen={showEdgeInterpolateModal}
        onClose={() => setShowEdgeInterpolateModal(false)}
        onConfirm={handleEdgeInterpolateConfirm}
      />

      <HeightMapModal
        isOpen={showHeightMapModal}
        onClose={() => setShowHeightMapModal(false)}
        onConfirm={handleHeightMapConfirm}
      />
    </>
  );
}

