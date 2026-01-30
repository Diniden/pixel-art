import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store';
import { Pixel, PixelData } from '../../types';
import './HeightMapModal.css';

type ChannelType = 'R' | 'G' | 'B' | 'H' | 'S' | 'L';

interface HeightMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    channel: ChannelType;
    min: number;
    max: number;
  }) => void;
}

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

export function HeightMapModal({ isOpen, onClose, onConfirm }: HeightMapModalProps) {
  const { getCurrentLayer, getCurrentObject, getCurrentFrame, isEditingVariant, getCurrentVariant } = useEditorStore();
  const [channel, setChannel] = useState<ChannelType>('L');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(255);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const layer = getCurrentLayer();
  const obj = getCurrentObject();
  const frame = getCurrentFrame();
  const editingVariant = isEditingVariant();
  const variantData = getCurrentVariant();

  // Determine target layer and dimensions
  let targetLayer = layer;
  let gridWidth = 0;
  let gridHeight = 0;

  if (editingVariant && variantData) {
    targetLayer = variantData.variantFrame.layers[0];
    gridWidth = variantData.variant.gridSize.width;
    gridHeight = variantData.variant.gridSize.height;
  } else if (obj && layer) {
    gridWidth = obj.gridSize.width;
    gridHeight = obj.gridSize.height;
  }

  // Render grayscale preview
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !targetLayer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = gridWidth;
    canvas.height = gridHeight;

    // Collect all channel values for normalization
    const channelValues: number[] = [];
    for (let y = 0; y < gridHeight; y++) {
      const row = targetLayer.pixels[y];
      if (!row) continue;
      for (let x = 0; x < gridWidth; x++) {
        const pixelData: PixelData | undefined = row[x];
        if (pixelData && pixelData.color !== 0 && typeof pixelData.color === 'object') {
          channelValues.push(getChannelValue(pixelData.color, channel));
        }
      }
    }

    if (channelValues.length === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, gridWidth, gridHeight);
      return;
    }

    // Find actual min/max in the data
    const actualMin = Math.min(...channelValues);
    const actualMax = Math.max(...channelValues);

    // Normalize range
    const range = actualMax - actualMin;
    const normalizedMin = min;
    const normalizedMax = max;

    // Draw pixels
    const imageData = ctx.createImageData(gridWidth, gridHeight);
    for (let y = 0; y < gridHeight; y++) {
      const row = targetLayer.pixels[y];
      if (!row) continue;
      for (let x = 0; x < gridWidth; x++) {
        const pixelData: PixelData | undefined = row[x];
        const idx = (y * gridWidth + x) * 4;

        if (pixelData && pixelData.color !== 0 && typeof pixelData.color === 'object') {
          const channelValue = getChannelValue(pixelData.color, channel);

          // Normalize: map from [actualMin, actualMax] to [normalizedMin, normalizedMax]
          let normalized: number;
          if (range === 0) {
            normalized = normalizedMin;
          } else {
            // Map from [actualMin, actualMax] to [0, 1]
            const t = (channelValue - actualMin) / range;
            // Map to [normalizedMin, normalizedMax]
            normalized = normalizedMin + t * (normalizedMax - normalizedMin);
          }

          // Clamp to 0-255
          const gray = Math.max(0, Math.min(255, Math.round(normalized)));
          imageData.data[idx] = gray;     // R
          imageData.data[idx + 1] = gray; // G
          imageData.data[idx + 2] = gray; // B
          imageData.data[idx + 3] = 255;  // A
        } else {
          // Empty pixel - black
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [isOpen, channel, min, max, targetLayer, gridWidth, gridHeight]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({ channel, min, max });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="height-map-modal-backdrop" onClick={handleBackdropClick}>
      <div className="height-map-modal" onClick={e => e.stopPropagation()}>
        <div className="height-map-modal-header">
          <h3>🗻 Height Map Generator</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="height-map-modal-content">
          {/* Preview Canvas */}
          <div className="height-map-preview">
            <canvas
              ref={canvasRef}
              style={{
                imageRendering: 'pixelated',
                width: '100%',
                height: 'auto',
                maxWidth: '400px',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)'
              }}
            />
          </div>

          {/* Channel Selection */}
          <div className="height-map-control">
            <label className="height-map-label">
              <span className="label-text">Channel</span>
            </label>
            <div className="height-map-channel-buttons">
              {(['R', 'G', 'B', 'H', 'S', 'L'] as ChannelType[]).map((ch) => (
                <button
                  key={ch}
                  className={`channel-btn ${channel === ch ? 'active' : ''}`}
                  onClick={() => setChannel(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
            <div className="height-map-description">
              Select which channel to use for grayscale conversion. R, G, B are RGB channels. H, S, L are HSL channels.
            </div>
          </div>

          {/* Min Slider */}
          <div className="height-map-control">
            <label className="height-map-label">
              <span className="label-text">Min Value</span>
              <span className="label-value">0x{min.toString(16).toUpperCase().padStart(2, '0')} ({min})</span>
            </label>
            <div className="height-map-slider-container">
              <input
                type="range"
                min="0"
                max="255"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
                className="height-map-slider"
              />
            </div>
            <div className="height-map-description">
              Minimum value for grayscale normalization. Can be greater than max to invert.
            </div>
          </div>

          {/* Max Slider */}
          <div className="height-map-control">
            <label className="height-map-label">
              <span className="label-text">Max Value</span>
              <span className="label-value">0x{max.toString(16).toUpperCase().padStart(2, '0')} ({max})</span>
            </label>
            <div className="height-map-slider-container">
              <input
                type="range"
                min="0"
                max="255"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="height-map-slider"
              />
            </div>
            <div className="height-map-description">
              Maximum value for grayscale normalization. Can be less than min to invert.
            </div>
          </div>
        </div>

        <div className="height-map-modal-actions">
          <button className="height-map-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="height-map-btn confirm" onClick={handleConfirm}>
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


