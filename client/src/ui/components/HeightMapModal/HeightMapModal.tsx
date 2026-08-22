import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Layer, Pixel, PixelData, PixelObject } from "../../../types";
import type { CurrentVariant } from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { Mountain, X } from "lucide-react";
import "./HeightMapModal.css";

export type ChannelType = "R" | "G" | "B" | "H" | "S" | "L";

interface HeightMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolved computeds, from HeightMapModalContainer (REFRESH task 23). */
  layer: Layer | null;
  object: PixelObject | null;
  editingVariant: boolean;
  variantData: CurrentVariant | null;
  onConfirm: (params: {
    channel: ChannelType;
    min: number;
    max: number;
  }) => void;
}

// Convert RGB to HSL
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
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
    l: Math.round(l * 255),
  };
}

// Extract channel value from pixel
function getChannelValue(pixel: Pixel, channel: ChannelType): number {
  switch (channel) {
    case "R":
      return pixel.r;
    case "G":
      return pixel.g;
    case "B":
      return pixel.b;
    case "H":
    case "S":
    case "L": {
      const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
      return hsl[channel.toLowerCase() as "h" | "s" | "l"];
    }
  }
}

export function HeightMapModal({
  isOpen,
  onClose,
  onConfirm,
  layer,
  object: obj,
  editingVariant,
  variantData,
}: HeightMapModalProps) {
  const [channel, setChannel] = useState<ChannelType>("L");
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(255);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const ctx = canvas.getContext("2d");
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
        if (
          pixelData &&
          pixelData.color !== 0 &&
          typeof pixelData.color === "object"
        ) {
          channelValues.push(getChannelValue(pixelData.color, channel));
        }
      }
    }

    if (channelValues.length === 0) {
      ctx.fillStyle = "#000";
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

        if (
          pixelData &&
          pixelData.color !== 0 &&
          typeof pixelData.color === "object"
        ) {
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
          imageData.data[idx] = gray; // R
          imageData.data[idx + 1] = gray; // G
          imageData.data[idx + 2] = gray; // B
          imageData.data[idx + 3] = 255; // A
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
    <div className="height-map-modal__backdrop" onClick={handleBackdropClick}>
      <div className="height-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="height-map-modal__header">
          <h3>
            <Icon icon={Mountain} size={16} /> Height Map Generator
          </h3>
          <button className="modal__close" onClick={onClose}>
            <Icon icon={X} size={14} />
          </button>
        </div>

        <div className="height-map-modal__content">
          {/* Preview Canvas */}
          <div className="height-map-modal__preview">
            <canvas
              ref={canvasRef}
              style={{
                imageRendering: "pixelated",
                width: "100%",
                height: "auto",
                maxWidth: "400px",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </div>

          {/* Channel Selection */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Channel</span>
            </label>
            <div className="height-map-modal__channel-buttons">
              {(["R", "G", "B", "H", "S", "L"] as ChannelType[]).map((ch) => (
                <button
                  key={ch}
                  className={`height-map-modal__channel-btn ${channel === ch ? "height-map-modal__channel-btn--active" : ""}`}
                  onClick={() => setChannel(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
            <div className="height-map-modal__description">
              Select which channel to use for grayscale conversion. R, G, B are
              RGB channels. H, S, L are HSL channels.
            </div>
          </div>

          {/* Min Slider */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Min Value</span>
              <span className="height-map-modal__label-value">
                0x{min.toString(16).toUpperCase().padStart(2, "0")} ({min})
              </span>
            </label>
            <div className="height-map-modal__slider-group">
              <input
                type="range"
                min="0"
                max="255"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
                className="height-map-modal__slider"
              />
            </div>
            <div className="height-map-modal__description">
              Minimum value for grayscale normalization. Can be greater than max
              to invert.
            </div>
          </div>

          {/* Max Slider */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Max Value</span>
              <span className="height-map-modal__label-value">
                0x{max.toString(16).toUpperCase().padStart(2, "0")} ({max})
              </span>
            </label>
            <div className="height-map-modal__slider-group">
              <input
                type="range"
                min="0"
                max="255"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="height-map-modal__slider"
              />
            </div>
            <div className="height-map-modal__description">
              Maximum value for grayscale normalization. Can be less than min to
              invert.
            </div>
          </div>
        </div>

        <div className="height-map-modal__actions">
          <button
            className="height-map-modal__btn height-map-modal__btn--neutral"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="height-map-modal__btn height-map-modal__btn--primary"
            onClick={handleConfirm}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
